-- =====================================================================
-- MIGRACIÓN: Corrección de race condition en validación de cupos
-- =====================================================================
-- PROBLEMA: FOR UPDATE en inscripciones solo lockea filas existentes,
-- no previene que múltiples transacciones lean el mismo count y todas
-- inserten exitosamente causando sobrecupo.
--
-- SOLUCIÓN: Usar SERIALIZABLE o advisory lock por taller_id para
-- garantizar que solo una transacción a la vez puede validar+insertar
-- para un taller específico.
-- =====================================================================

-- Reemplazar función de validación con advisory lock
create or replace function public.validar_inscripcion()
returns trigger
language plpgsql
as $$
declare
  v_taller           record;
  v_cupo             integer;
  v_abierto_global   boolean;
  v_abierto_dia      boolean;
  v_lock_key         bigint;
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

  -- Advisory lock a nivel taller: serializa TODAS las operaciones de este taller
  -- Convertimos UUID a bigint usando hashtext para pg_advisory_xact_lock
  v_lock_key := hashtext(new.taller_id::text);
  perform pg_advisory_xact_lock(v_lock_key);

  -- Ahora que tenemos el lock exclusivo del taller, contamos
  -- (no necesitamos FOR UPDATE porque el advisory lock ya serializa todo)
  select count(*) into v_cupo
  from public.inscripciones
  where taller_id = new.taller_id
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

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

comment on function public.validar_inscripcion() is
  'Validación atómica de cupos usando advisory lock por taller para prevenir race conditions';
