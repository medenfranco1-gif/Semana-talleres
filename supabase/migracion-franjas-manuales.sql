-- =====================================================================
-- MIGRACIÓN: Franjas manuales de inscripción (Día 1)
-- =====================================================================
--
-- Agrega 3 flags booleanos a `configuracion` para abrir/cerrar
-- manualmente cada franja horaria del DÍA 1 desde el panel de admin.
--
-- NO usa reloj/horario automático: cada franja se abre y cierra a mano.
--
-- Mapeo de franjas (solo aplica a talleres de dia = 1):
--   franja_1_abierta  -> talleres con hora_inicio 08:00:00 .. 09:30:00
--   franja_2_abierta  -> talleres con hora_inicio 10:00:00 .. 12:00:00
--   franja_3_abierta  -> talleres con hora_inicio 13:00:00 .. 15:00:00
--
-- Regla de negocio: para que un alumno pueda inscribirse a un taller del
-- Día 1, deben cumplirse TODAS estas condiciones:
--   - inscripciones_abiertas_global = true
--   - inscripciones_abiertas_dia1   = true
--   - la franja correspondiente (franja_N_abierta) = true
--
-- Idempotente: se puede correr más de una vez sin error.
-- No toca RLS, triggers, cupos ni ninguna otra lógica.
-- =====================================================================

alter table public.configuracion
  add column if not exists franja_1_abierta boolean not null default false,
  add column if not exists franja_2_abierta boolean not null default false,
  add column if not exists franja_3_abierta boolean not null default false;

comment on column public.configuracion.franja_1_abierta is
  'Día 1: abre inscripción de talleres 08:00-09:30 (control manual desde admin).';
comment on column public.configuracion.franja_2_abierta is
  'Día 1: abre inscripción de talleres 10:00-12:00 (control manual desde admin).';
comment on column public.configuracion.franja_3_abierta is
  'Día 1: abre inscripción de talleres 13:00-15:00 (control manual desde admin).';
