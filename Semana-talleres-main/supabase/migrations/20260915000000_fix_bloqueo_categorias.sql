-- =====================================================================
-- FIX: límite de categoría SOLO para Cocina y Deportes
-- =====================================================================
-- Regla correcta:
--   * Cocina: máximo 1 por día y máximo 2 por semana.
--   * Deportes: máximo 1 por día y máximo 2 por semana.
--   * Técnica/Oficios, Arte, Música, Ciencia, etc.: SIN límite de categoría
--     por día ni por semana.
--
-- Se mantiene el resto de las validaciones (cupo, solapamiento, mismo
-- taller en la semana e inscripciones abiertas).
-- =====================================================================

create or replace function public.validar_cupo_atomico()
returns trigger
language plpgsql
as $$
declare
  v_taller           record;
  v_cupo_actual      integer;
  v_abierto_global   boolean;
  v_abierto_dia      boolean;
begin
  -- Obtener fila del taller CON LOCK EXCLUSIVO.
  select id, dia, hora_inicio, hora_fin, categoria, cupo_max, activo
    into v_taller
    from public.talleres
    where id = new.taller_id
    for update;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  if not v_taller.activo then
    raise exception 'El taller no está disponible para inscripción.';
  end if;

  -- Contar inscripciones después de obtener el lock.
  select count(*) into v_cupo_actual
  from public.inscripciones
  where taller_id = new.taller_id
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_cupo_actual >= v_taller.cupo_max then
    raise exception 'El taller alcanzó el cupo máximo (%). Actualmente hay % inscriptos.',
      v_taller.cupo_max, v_cupo_actual;
  end if;

  -- Solapamiento horario: sigue aplicando a todas las categorías.
  if public.alumno_tiene_sopa_en_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller inscripto en esa franja horaria el mismo día.';
  end if;

  -- MISMA CATEGORÍA EN EL MISMO DÍA:
  -- SOLO Cocina y Deportes tienen esta restricción.
  if lower(btrim(v_taller.categoria)) in ('cocina', 'deportes')
     and public.alumno_tiene_categoria_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller de la categoría "%" inscripto ese día.', v_taller.categoria;
  end if;

  -- El mismo taller no se puede repetir en otro día.
  if public.alumno_tiene_taller_en_semana(new.alumno_id, new.taller_id) then
    raise exception 'Ya estás anotado a este taller en otro día de la semana.';
  end if;

  -- LÍMITE SEMANAL: SOLO Cocina y Deportes.
  if lower(btrim(v_taller.categoria)) = 'cocina'
     and public.alumno_count_categoria_semana(new.alumno_id, 'cocina') >= 2 then
    raise exception 'Ya tenés 2 talleres de Cocina anotados en la semana (límite alcanzado).';
  end if;

  if lower(btrim(v_taller.categoria)) = 'deportes'
     and public.alumno_count_categoria_semana(new.alumno_id, 'deportes') >= 2 then
    raise exception 'Ya tenés 2 talleres de Deportes anotados en la semana (límite alcanzado).';
  end if;

  -- Inscripciones abiertas.
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

-- Reasegurar los triggers con la función corregida.
drop trigger if exists trg_validar_cupo_insert on public.inscripciones;
create trigger trg_validar_cupo_insert
  before insert on public.inscripciones
  for each row
  execute function public.validar_cupo_atomico();

drop trigger if exists trg_validar_cupo_update on public.inscripciones;
create trigger trg_validar_cupo_update
  before update on public.inscripciones
  for each row
  when (old.taller_id is distinct from new.taller_id)
  execute function public.validar_cupo_atomico();
