-- ============================================================================
-- MIGRACIÓN: Fix foreign key en RPC inscribirse_taller
-- Fecha: 2026-09-14
--
-- PROBLEMA:
-- La RPC usa auth.uid() directamente como inscripciones.alumno_id, pero ese
-- campo referencia alumnos.id, no auth.uid(). Esto viola la foreign key.
--
-- SOLUCIÓN:
-- Buscar alumnos.id mediante auth_user_id = auth.uid() antes de insertar.
-- ============================================================================

create or replace function public.inscribirse_taller(p_taller_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid;
  v_alumno_id uuid;
  v_taller record;
  v_config record;
  v_error_msg text;
begin
  -- Obtener auth.uid()
  v_auth_user_id := auth.uid();

  if v_auth_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Tenés que iniciar sesión para inscribirte.',
      'taller_id', p_taller_id
    );
  end if;

  -- Buscar alumno por auth_user_id
  select id into v_alumno_id
  from public.alumnos
  where auth_user_id = v_auth_user_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'No se encontró tu perfil de alumno. Contactá al administrador.',
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

  -- Validar franja de inscripción
  if not v_config.inscripciones_abiertas_global then
    return jsonb_build_object(
      'ok', false,
      'mensaje', 'Las inscripciones están cerradas en este momento.',
      'taller_id', p_taller_id
    );
  end if;

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

  -- Intentar INSERT con alumnos.id correcto
  begin
    insert into public.inscripciones (alumno_id, taller_id)
    values (v_alumno_id, p_taller_id);

    return jsonb_build_object(
      'ok', true,
      'mensaje', '¡Inscripción confirmada!',
      'taller_id', p_taller_id
    );

  exception when others then
    get stacked diagnostics v_error_msg = message_text;

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

    return jsonb_build_object(
      'ok', false,
      'mensaje', v_error_msg,
      'taller_id', p_taller_id
    );
  end;
end;
$$;
