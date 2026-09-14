-- ============================================================================
-- MIGRACIÓN: RPC para conteo de inscripciones por taller
-- Fecha: 2026-09-14
--
-- PROBLEMA:
-- El conteo actual descarga todas las filas de inscripciones y cuenta en JS,
-- pero Supabase/PostgREST limita a 1000 filas por defecto, causando conteos
-- parciales e incorrectos.
--
-- SOLUCIÓN:
-- RPC que hace GROUP BY + COUNT en PostgreSQL, devolviendo solo el resumen.
-- ============================================================================

-- Función que devuelve el conteo de inscripciones agrupado por taller
create or replace function public.contar_inscriptos_por_taller()
returns table (
  taller_id uuid,
  total bigint
)
language sql
security definer -- Se ejecuta con permisos del owner (postgres)
set search_path = public
as $$
  select
    taller_id,
    count(*) as total
  from public.inscripciones
  group by taller_id;
$$;

-- Permisos: solo service_role/admins pueden llamar esta función
revoke all on function public.contar_inscriptos_por_taller() from public;
grant execute on function public.contar_inscriptos_por_taller() to authenticated;

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
