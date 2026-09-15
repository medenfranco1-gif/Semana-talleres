-- =====================================================================
-- MIGRACIÓN: Franjas manuales para Día 2 y Día 3
-- =====================================================================
-- Extiende el sistema de franjas manuales (actualmente solo Día 1)
-- para que Día 2 y Día 3 tengan sus propios controles independientes.
-- Mantiene compatibilidad total con estado actual del Día 1.
-- =====================================================================

-- Agregar columnas para franjas de Día 2 y Día 3 (idempotente)
alter table public.configuracion
  add column if not exists dia2_franja_1_abierta boolean not null default false,
  add column if not exists dia2_franja_2_abierta boolean not null default false,
  add column if not exists dia2_franja_3_abierta boolean not null default false,
  add column if not exists dia3_franja_1_abierta boolean not null default false,
  add column if not exists dia3_franja_2_abierta boolean not null default false,
  add column if not exists dia3_franja_3_abierta boolean not null default false;

-- Renombrar columnas existentes para claridad (si aún no están renombradas)
-- Día 1 mantiene los nombres actuales por compatibilidad
do $$
begin
  -- Solo documentar que franja_1/2/3_abierta se refieren al Día 1
  -- No renombrar para evitar romper código existente
end $$;

comment on column public.configuracion.franja_1_abierta is
  'Día 1: abre inscripción de talleres 08:00-09:30 (control manual desde admin).';
comment on column public.configuracion.franja_2_abierta is
  'Día 1: abre inscripción de talleres 10:00-12:00 (control manual desde admin).';
comment on column public.configuracion.franja_3_abierta is
  'Día 1: abre inscripción de talleres 13:00-15:00 (control manual desde admin).';

comment on column public.configuracion.dia2_franja_1_abierta is
  'Día 2: abre inscripción de talleres 08:00-09:30 (control manual desde admin).';
comment on column public.configuracion.dia2_franja_2_abierta is
  'Día 2: abre inscripción de talleres 10:00-12:00 (control manual desde admin).';
comment on column public.configuracion.dia2_franja_3_abierta is
  'Día 2: abre inscripción de talleres 13:00-15:00 (control manual desde admin).';

comment on column public.configuracion.dia3_franja_1_abierta is
  'Día 3: abre inscripción de talleres 08:00-09:30 (control manual desde admin).';
comment on column public.configuracion.dia3_franja_2_abierta is
  'Día 3: abre inscripción de talleres 10:00-12:00 (control manual desde admin).';
comment on column public.configuracion.dia3_franja_3_abierta is
  'Día 3: abre inscripción de talleres 13:00-15:00 (control manual desde admin).';
