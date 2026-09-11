-- =====================================================================
-- MIGRACIÓN: Blindaje definitivo contra sobrecupos
-- =====================================================================
-- Garantiza que bajo concurrencia alta:
-- - Solo entran exactamente cupo_max inscripciones por taller
-- - Unique constraint evita inscripciones duplicadas
-- - FOR UPDATE serializa acceso a cupos críticos
-- - Trigger valida en BEFORE INSERT y BEFORE UPDATE
-- =====================================================================

-- 1. UNIQUE constraint en inscripciones (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscripciones_alumno_id_taller_id_key'
  ) then
    alter table public.inscripciones
      add constraint inscripciones_alumno_id_taller_id_key
      unique (alumno_id, taller_id);
  end if;
end $$;

-- 2. Índices para hot paths (idempotente)
create index if not exists inscripciones_taller_id_idx
  on public.inscripciones (taller_id);
create index if not exists inscripciones_alumno_id_idx
  on public.inscripciones (alumno_id);

-- 3. Función de validación con FOR UPDATE atómico
create or replace function public.validar_inscripcion()
returns trigger
language plpgsql
as $$
declare
  v_taller           record;
  v_cupo             integer;
  v_abierto_global   boolean;
  v_abierto_dia      boolean;
begin
  -- Cargar datos del taller
  select t.dia, t.hora_inicio, t.hora_fin, t.categoria, t.cupo_max, t.activo
    into v_taller
    from public.talleres t
    where t.id = new.taller_id;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  if not v_taller.activo then
    raise exception 'El taller no está disponible para inscripción.';
  end if;

  -- ORDEN DE LOCKS: alumno → taller → inscripciones (evita deadlock)

  -- 1) Lock de alumno: serializa INSERTs del mismo alumno
  perform 1 from public.alumnos where id = new.alumno_id for update;

  -- 2) Lock de taller: serializa INSERTs al mismo taller
  perform 1 from public.talleres where id = new.taller_id for update;

  -- 3) Count atómico con FOR UPDATE en inscripciones existentes
  select count(*) into v_cupo
  from (
    select 1 from public.inscripciones
    where taller_id = new.taller_id
      and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    for update
  ) as locked_rows;

  if v_cupo >= v_taller.cupo_max then
    raise exception 'El taller alcanzó el cupo máximo (%).', v_taller.cupo_max;
  end if;

  -- Validaciones de reglas de negocio
  if public.alumno_tiene_sopa_en_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller inscripto en esa franja horaria el mismo día.';
  end if;

  if public.alumno_tiene_categoria_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller de la categoría "%" inscripto ese día.', v_taller.categoria;
  end if;

  if public.alumno_tiene_taller_en_semana(new.alumno_id, new.taller_id) then
    raise exception 'Ya estás anotado a este taller en otro día de la semana.';
  end if;

  if lower(btrim(v_taller.categoria)) = 'cocina'
     and public.alumno_count_categoria_semana(new.alumno_id, 'cocina') >= 2 then
    raise exception 'Ya tenés 2 talleres de Cocina anotados en la semana (límite alcanzado).';
  end if;

  if lower(btrim(v_taller.categoria)) = 'deportes'
     and public.alumno_count_categoria_semana(new.alumno_id, 'deportes') >= 2 then
    raise exception 'Ya tenés 2 talleres de Deportes anotados en la semana (límite alcanzado).';
  end if;

  -- Validar inscripciones abiertas
  select c.inscripciones_abiertas_global,
         case v_taller.dia
           when 1 then c.inscripciones_abiertas_dia1
           when 2 then c.inscripciones_abiertas_dia2
           when 3 then c.inscripciones_abiertas_dia3
         end
    into v_abierto_global, v_abierto_dia
    from public.configuracion c
    where c.id = 1;

  if coalesce(v_abierto_global, false) = false then
    raise exception 'Las inscripciones están cerradas.';
  end if;

  if coalesce(v_abierto_dia, false) = false then
    raise exception 'Las inscripciones para el día % están cerradas.', v_taller.dia;
  end if;

  return new;
end;
$$;

-- 4. Trigger BEFORE INSERT (protege inserts)
drop trigger if exists trg_validar_inscripcion on public.inscripciones;
create trigger trg_validar_inscripcion
  before insert on public.inscripciones
  for each row execute function public.validar_inscripcion();

-- 5. Trigger BEFORE UPDATE (protege cambios de taller_id por admin)
drop trigger if exists trg_validar_inscripcion_update on public.inscripciones;
create trigger trg_validar_inscripcion_update
  before update on public.inscripciones
  for each row
  when (old.taller_id is distinct from new.taller_id)
  execute function public.validar_inscripcion();

comment on trigger trg_validar_inscripcion on public.inscripciones is
  'Valida cupos, solapamiento y reglas antes de INSERT';
comment on trigger trg_validar_inscripcion_update on public.inscripciones is
  'Valida cupos si admin cambia taller_id via UPDATE';
