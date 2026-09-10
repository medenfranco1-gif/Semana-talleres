-- Apply as postgres AFTER schema.sql. Transactional, no data deletion.
begin;

-- Counts must see every registration, not just the caller's RLS-visible rows.
-- This endpoint exposes only data already public in the catalog, plus totals.
create or replace function public.catalogo_publico() returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'talleres', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object('cupo_actual', coalesce(c.n, 0))
                          order by t.dia, t.hora_inicio, t.id)
      from public.talleres t left join (
        select taller_id, count(*)::integer n from public.inscripciones group by taller_id
      ) c on c.taller_id = t.id), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(to_jsonb(c) order by c.orden, c.id)
      from public.categorias c where c.activa), '[]'::jsonb),
    'config', (select to_jsonb(c) from public.configuracion c where id = 1)
  );
$$;
revoke all on function public.catalogo_publico() from public;
grant execute on function public.catalogo_publico() to anon, authenticated;

create or replace function public.validar_inscripcion() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_taller public.talleres%rowtype;
  v_config public.configuracion%rowtype;
  v_cupo integer;
begin
  -- READ COMMITTED gives fresh snapshots for commands AFTER waiting on locks.
  -- Higher isolation must retry serialization failures; do not silently count a stale snapshot.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'La inscripción requiere READ COMMITTED.';
  end if;
  perform 1 from public.alumnos where id = new.alumno_id for update;
  if not found then raise exception 'El alumno no existe.'; end if;
  select * into v_taller from public.talleres where id = new.taller_id for update;
  if not found then raise exception 'El taller no existe.'; end if;
  if not v_taller.activo then raise exception 'El taller no está disponible para inscripción.'; end if;

  -- No locks on individual registrations: the workshop row serializes inserts.
  select count(*) into v_cupo from public.inscripciones where taller_id = new.taller_id;
  if v_cupo >= v_taller.cupo_max then
    raise exception 'El taller alcanzó el cupo máximo (%).', v_taller.cupo_max;
  end if;
  if public.alumno_tiene_sopa_en_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller inscripto en esa franja horaria el mismo día.';
  end if;
  if public.alumno_tiene_categoria_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller de la categoría "%" inscripto ese día.', v_taller.categoria;
  end if;
  if public.alumno_tiene_taller_en_semana(new.alumno_id, new.taller_id) then
    raise exception 'Ya estás anotado a este taller en otro día de la semana.';
  end if;
  if lower(btrim(v_taller.categoria)) in ('cocina', 'deportes')
     and public.alumno_count_categoria_semana(new.alumno_id, v_taller.categoria) >= 2 then
    raise exception 'Ya tenés 2 talleres de % anotados en la semana (límite alcanzado).', v_taller.categoria;
  end if;
  select * into v_config from public.configuracion where id = 1;
  if not coalesce(v_config.inscripciones_abiertas_global, false) then
    raise exception 'Las inscripciones están cerradas.';
  end if;
  if not coalesce(case v_taller.dia
    when 1 then v_config.inscripciones_abiertas_dia1
    when 2 then v_config.inscripciones_abiertas_dia2
    when 3 then v_config.inscripciones_abiertas_dia3 end, false) then
    raise exception 'Las inscripciones para el día % están cerradas.', v_taller.dia;
  end if;
  return new;
end;
$$;
revoke all on function public.validar_inscripcion() from public, anon, authenticated;

-- A bounded row per student. Failed business validations still consume an attempt:
-- catch them inside a nested transaction, outside the rate-limit update.
create table if not exists public.intentos_inscripcion (
  alumno_id uuid primary key references public.alumnos(id) on delete cascade,
  ventana timestamptz not null,
  intentos integer not null check (intentos > 0)
);
alter table public.intentos_inscripcion enable row level security;
revoke all on public.intentos_inscripcion from anon, authenticated;

create or replace function public.registrar_taller(p_taller_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  v_alumno uuid;
  v_ins public.inscripciones%rowtype;
  v_intentos integer;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión.' using errcode = '42501'; end if;
  select id into v_alumno from public.alumnos where auth_user_id = auth.uid() for update;
  if not found then raise exception 'No se encontró el alumno.' using errcode = '42501'; end if;
  insert into public.intentos_inscripcion as r values(v_alumno, clock_timestamp(), 1)
    on conflict (alumno_id) do update set
      intentos = case when r.ventana <= clock_timestamp() - interval '60 seconds' then 1 else least(r.intentos + 1, 21) end,
      ventana = case when r.ventana <= clock_timestamp() - interval '60 seconds' then clock_timestamp() else r.ventana end
    returning intentos into v_intentos;
  if v_intentos > 20 then
    return jsonb_build_object('ok', false, 'mensaje', 'Demasiados intentos. Esperá un minuto antes de volver a intentar.');
  end if;
  -- Idempotence under the student lock: retry succeeds even if now full/closed.
  select * into v_ins from public.inscripciones where alumno_id = v_alumno and taller_id = p_taller_id;
  if not found then
    begin
      insert into public.inscripciones(alumno_id, taller_id) values(v_alumno, p_taller_id) returning * into v_ins;
    exception
      when raise_exception or unique_violation or foreign_key_violation then
        return jsonb_build_object('ok', false, 'mensaje', SQLERRM, 'taller_id', p_taller_id);
    end;
  end if;
  return jsonb_build_object('ok', true, 'mensaje', '¡Inscripción confirmada!', 'taller_id', p_taller_id, 'inscripcion', to_jsonb(v_ins));
end;
$$;
revoke all on function public.registrar_taller(uuid) from public, anon;
grant execute on function public.registrar_taller(uuid) to authenticated;

-- Students must use the rate-limited RPC; admins retain existing insert workflows.
drop policy if exists inscripciones_insert on public.inscripciones;
create policy inscripciones_insert on public.inscripciones for insert to authenticated
  with check (public.es_admin());

-- The application changes workshops with DELETE+INSERT. Make it one transaction
-- so failure cannot lose the previous registration or its reserved seat.
create or replace function public.cambiar_taller(p_inscripcion_id uuid, p_taller_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare v_ins public.inscripciones%rowtype;
begin
  if not public.es_admin() then raise exception 'No autorizado.' using errcode = '42501'; end if;
  select * into v_ins from public.inscripciones where id = p_inscripcion_id;
  if not found then raise exception 'No se encontró la inscripción.'; end if;
  if v_ins.taller_id = p_taller_id then raise exception 'El taller nuevo es igual al actual.'; end if;
  perform 1 from public.alumnos where id = v_ins.alumno_id for update;
  -- Lock both workshops in stable order before changing either registration.
  perform 1 from public.talleres where id in (v_ins.taller_id, p_taller_id) order by id for update;
  delete from public.inscripciones where id = p_inscripcion_id returning * into v_ins;
  if not found then raise exception 'La inscripción ya fue modificada.'; end if;
  insert into public.inscripciones(id, alumno_id, taller_id, fecha_inscripcion, created_at)
    values(v_ins.id, v_ins.alumno_id, p_taller_id, v_ins.fecha_inscripcion, v_ins.created_at);
end;
$$;
revoke all on function public.cambiar_taller(uuid, uuid) from public, anon;
grant execute on function public.cambiar_taller(uuid, uuid) to authenticated;

-- UPDATE previously bypassed the INSERT-only validator. No app workflow uses it.
create or replace function public.bloquear_cambio_inscripcion() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.alumno_id is distinct from old.alumno_id or new.taller_id is distinct from old.taller_id then
    raise exception 'Usá cambiar_taller para cambiar una inscripción de forma atómica.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bloquear_cambio_inscripcion on public.inscripciones;
create trigger trg_bloquear_cambio_inscripcion before update on public.inscripciones
  for each row execute function public.bloquear_cambio_inscripcion();

-- The previous INSERT policy allowed self-creation with rol='admin'.
drop policy if exists alumnos_insert on public.alumnos;
create policy alumnos_insert on public.alumnos for insert to authenticated
  with check ((auth_user_id = auth.uid() and rol = 'alumno') or public.es_admin());

commit;
