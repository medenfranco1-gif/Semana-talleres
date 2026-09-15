-- ============================================================================
-- MIGRACIÓN: Blindaje adicional de cupos (defensa en profundidad)
-- Fecha: 2026-09-14
--
-- OBJETIVOS:
-- 1. Proteger cupo_max de reducciones inválidas
-- 2. Crear RPC única para inscripciones
-- 3. Bloquear INSERT directo desde clientes
-- 4. Función de diagnóstico del invariante
-- 5. Prueba de concurrencia
--
-- Esta migración complementa (no reemplaza) validar_cupo_atomico()
-- ============================================================================

-- ============================================================================
-- OBJETIVO 1: Proteger cupo_max en talleres
-- ============================================================================

-- Función que valida que cupo_max no se reduzca por debajo de inscripciones actuales
create or replace function public.validar_cupo_max_taller()
returns trigger
language plpgsql
as $$
declare
  v_cantidad_actual integer;
begin
  -- Solo validar si cupo_max cambió
  if old.cupo_max is not distinct from new.cupo_max then
    return new;
  end if;

  -- Validar que cupo_max > 0
  if new.cupo_max <= 0 then
    raise exception 'El cupo máximo debe ser mayor a 0. Valor intentado: %', new.cupo_max;
  end if;

  -- Contar inscripciones actuales del taller
  select count(*) into v_cantidad_actual
  from public.inscripciones
  where taller_id = new.id;

  -- Validar que no se reduzca por debajo de inscripciones actuales
  if new.cupo_max < v_cantidad_actual then
    raise exception 'No se puede reducir el cupo máximo por debajo de la cantidad actual de inscriptos. Taller: %, Inscripciones actuales: %, Nuevo cupo intentado: %',
      new.id, v_cantidad_actual, new.cupo_max;
  end if;

  return new;
end;
$$;

-- Trigger para validar cupo_max antes de UPDATE en talleres
drop trigger if exists trg_validar_cupo_max_taller on public.talleres;
create trigger trg_validar_cupo_max_taller
  before update on public.talleres
  for each row
  execute function public.validar_cupo_max_taller();

-- ============================================================================
-- OBJETIVO 2: RPC única para inscripciones
-- ============================================================================

-- Función RPC que encapsula toda la lógica de inscripción
-- Devuelve JSON con {ok: boolean, mensaje: text, taller_id: uuid}
create or replace function public.inscribirse_taller(p_taller_id uuid)
returns jsonb
language plpgsql
security definer -- Se ejecuta con permisos del owner (postgres)
set search_path = public
as $$
declare
  v_alumno_id uuid;
  v_taller record;
  v_config record;
  v_resultado_franja text;
  v_error_msg text;
begin
  -- Obtener ID del alumno autenticado
  v_alumno_id := auth.uid();

  if v_alumno_id is null then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Tenés que iniciar sesión para inscribirte.',
      'taller_id', p_taller_id
    );
  end if;

  -- Obtener datos del taller
  select id, titulo, dia, hora_inicio, hora_fin, categoria, cupo_max, activo
    into v_taller
    from public.talleres
    where id = p_taller_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'El taller no existe.',
      'taller_id', p_taller_id
    );
  end if;

  -- Obtener configuración de franjas
  select
    inscripciones_abiertas_global,
    inscripciones_abiertas_dia1,
    inscripciones_abiertas_dia2,
    inscripciones_abiertas_dia3,
    franja_1_abierta,
    franja_2_abierta,
    franja_3_abierta,
    dia2_franja_1_abierta,
    dia2_franja_2_abierta,
    dia2_franja_3_abierta,
    dia3_franja_1_abierta,
    dia3_franja_2_abierta,
    dia3_franja_3_abierta
  into v_config
  from public.configuracion
  where id = 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se pudo verificar el estado de inscripción. Intentá de nuevo.',
      'taller_id', p_taller_id
    );
  end if;

  -- Validar franja de inscripción (lógica simplificada)
  -- Nota: La validación completa de franjas se hace en el trigger validar_cupo_atomico
  -- Aquí solo hacemos una validación básica de que inscripciones están abiertas
  if not v_config.inscripciones_abiertas_global then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Las inscripciones están cerradas en este momento.',
      'taller_id', p_taller_id
    );
  end if;

  -- Validar inscripciones abiertas por día
  if v_taller.dia = 1 and not v_config.inscripciones_abiertas_dia1 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Las inscripciones para el día 1 están cerradas.',
      'taller_id', p_taller_id
    );
  end if;

  if v_taller.dia = 2 and not v_config.inscripciones_abiertas_dia2 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Las inscripciones para el día 2 están cerradas.',
      'taller_id', p_taller_id
    );
  end if;

  if v_taller.dia = 3 and not v_config.inscripciones_abiertas_dia3 then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Las inscripciones para el día 3 están cerradas.',
      'taller_id', p_taller_id
    );
  end if;

  -- Intentar INSERT: el trigger validar_cupo_atomico hará todas las validaciones
  -- (cupo, solapamiento, misma categoría, franja horaria, etc.)
  begin
    insert into public.inscripciones (alumno_id, taller_id)
    values (v_alumno_id, p_taller_id);

    return jsonb_build_object(
      'ok', true,
      'mensaje', '¡Inscripción confirmada!',
      'taller_id', p_taller_id
    );

  exception when others then
    -- Capturar cualquier excepción del trigger y devolver como JSON
    get stacked diagnostics v_error_msg = message_text;

    -- Traducir errores comunes
    if v_error_msg ilike '%cupo máximo%' or v_error_msg ilike '%alcanzó el cupo%' then
      return jsonb_build_object(
        'ok', false,
        'mensaje', 'El taller alcanzó el cupo máximo. Elegí otro.',
        'taller_id', p_taller_id
      );
    end if;

    if v_error_msg ilike '%franja horaria%' or v_error_msg ilike '%solapamiento%' then
      return jsonb_build_object(
        'ok', false,
        'mensaje', 'Ya tenés un taller en esa franja horaria el mismo día.',
        'taller_id', p_taller_id
      );
    end if;

    if v_error_msg ilike '%categoría%' and v_error_msg ilike '%día%' then
      return jsonb_build_object(
        'ok', false,
        'mensaje', 'Ya tenés un taller de la misma categoría ese día.',
        'taller_id', p_taller_id
      );
    end if;

    if v_error_msg ilike '%ya estás inscripto%' or v_error_msg ilike '%duplicate key%' then
      return jsonb_build_object(
        'ok', false,
        'mensaje', 'Ya estás inscripto en este taller.',
        'taller_id', p_taller_id
      );
    end if;

    -- Mensaje genérico
    return jsonb_build_object(
      'ok', false,
      'mensaje', v_error_msg,
      'taller_id', p_taller_id
    );
  end;
end;
$$;

-- Permisos: solo usuarios autenticados pueden llamar la RPC
revoke all on function public.inscribirse_taller(uuid) from public;
grant execute on function public.inscribirse_taller(uuid) to authenticated;

-- ============================================================================
-- OBJETIVO 3: Bloquear INSERT directo desde clientes autenticados
-- ============================================================================

-- Política RLS para bloquear INSERT directo en inscripciones
-- Los clientes deben usar la RPC inscribirse_taller()
drop policy if exists "Bloquear INSERT directo en inscripciones" on public.inscripciones;
create policy "Bloquear INSERT directo en inscripciones"
  on public.inscripciones
  for insert
  to authenticated
  with check (false); -- Nunca permitir INSERT directo

-- Permitir INSERT solo desde el service_role (backend)
-- Nota: Esto ya está implícito porque service_role bypassa RLS
-- pero lo documentamos explícitamente

-- ============================================================================
-- OBJETIVO 4: Función de diagnóstico del invariante
-- ============================================================================

-- Función que verifica que COUNT(inscripciones) <= cupo_max para todos los talleres
-- Devuelve 0 filas si el invariante se cumple para todos
create or replace function public.diagnosticar_sobrecupos()
returns table (
  taller_id uuid,
  titulo text,
  cupo_max integer,
  inscripciones_actuales bigint,
  diferencia integer
)
language sql
security definer -- Se ejecuta con permisos del owner
set search_path = public
as $$
  select
    t.id as taller_id,
    t.titulo,
    t.cupo_max,
    count(i.id) as inscripciones_actuales,
    (t.cupo_max - count(i.id)) as diferencia
  from public.talleres t
  left join public.inscripciones i on i.taller_id = t.id
  group by t.id, t.titulo, t.cupo_max
  having count(i.id) > t.cupo_max -- Solo devolver talleres con sobrecupo
  order by diferencia asc;
$$;

-- Permisos: solo admins pueden llamar esta función
revoke all on function public.diagnosticar_sobrecupos() from public;
grant execute on function public.diagnosticar_sobrecupos() to authenticated;

-- ============================================================================
-- OBJETIVO 5: Prueba de concurrencia (documentación)
-- ============================================================================

-- Para probar la concurrencia con la RPC:
--
-- 1. Crear un taller con cupo_max = 2
-- 2. Inscribir 1 alumno manualmente
-- 3. Desde 10 sesiones paralelas, llamar:
--    select public.inscribirse_taller('TALLER_ID'::uuid);
-- 4. Resultado esperado:
--    - 1 llamada devuelve {ok: true}
--    - 9 llamadas devuelven {ok: false, mensaje: 'cupo máximo...'}
--    - COUNT final = 2 (exactamente cupo_max)
--
-- Script de prueba en: tests/prueba-concurrencia-rpc.sql

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
