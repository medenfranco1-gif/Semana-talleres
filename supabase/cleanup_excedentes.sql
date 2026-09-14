-- ============================================================================
-- SCRIPT: Limpieza de inscripciones excedentes históricas
-- Fecha: 2026-09-14
--
-- OBJETIVO:
-- Eliminar ÚNICAMENTE las inscripciones que exceden el cupo_max de cada taller,
-- conservando las primeras N inscripciones (donde N = cupo_max) ordenadas por
-- fecha_inscripcion ASC, id ASC.
--
-- IMPORTANTE:
-- - NO borrar alumnos
-- - NO modificar cupo_max
-- - Crear backup/auditoría antes de eliminar
-- - Ejecutar en transacción
-- ============================================================================

BEGIN;

-- Crear tabla de auditoría/backup
CREATE TABLE IF NOT EXISTS public.inscripciones_excedentes_backup (
  inscripcion_id uuid NOT NULL,
  alumno_id uuid NOT NULL,
  taller_id uuid NOT NULL,
  fecha_inscripcion timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  fecha_backup timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (inscripcion_id)
);

-- Insertar en backup las inscripciones que serán eliminadas
INSERT INTO public.inscripciones_excedentes_backup (
  inscripcion_id,
  alumno_id,
  taller_id,
  fecha_inscripcion,
  created_at
)
SELECT
  i.id,
  i.alumno_id,
  i.taller_id,
  i.fecha_inscripcion,
  i.created_at
FROM public.inscripciones i
INNER JOIN public.talleres t ON t.id = i.taller_id
INNER JOIN (
  -- Calcular el número de orden de cada inscripción dentro de su taller
  SELECT
    id,
    taller_id,
    ROW_NUMBER() OVER (
      PARTITION BY taller_id
      ORDER BY fecha_inscripcion ASC, id ASC
    ) as posicion
  FROM public.inscripciones
) ranked ON ranked.id = i.id
WHERE ranked.posicion > t.cupo_max;

-- Mostrar cuántas filas se van a eliminar
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.inscripciones_excedentes_backup
  WHERE fecha_backup >= now() - interval '1 minute';

  RAISE NOTICE 'Filas a eliminar: %', v_count;
END $$;

-- Eliminar inscripciones excedentes por inscripcion.id
DELETE FROM public.inscripciones
WHERE id IN (
  SELECT inscripcion_id
  FROM public.inscripciones_excedentes_backup
  WHERE fecha_backup >= now() - interval '1 minute'
);

-- Verificar que no quedan sobrecupos
DO $$
DECLARE
  v_sobrecupos integer;
BEGIN
  SELECT COUNT(*) INTO v_sobrecupos
  FROM (
    SELECT t.id, t.titulo, t.cupo_max, COUNT(i.id) as inscriptos
    FROM public.talleres t
    LEFT JOIN public.inscripciones i ON i.taller_id = t.id
    GROUP BY t.id, t.titulo, t.cupo_max
    HAVING COUNT(i.id) > t.cupo_max
  ) sobrecupos;

  IF v_sobrecupos > 0 THEN
    RAISE EXCEPTION 'ERROR: Aún quedan % talleres con sobrecupo después de la limpieza', v_sobrecupos;
  ELSE
    RAISE NOTICE 'Verificación OK: No quedan talleres con sobrecupo';
  END IF;
END $$;

-- Si todo OK, hacer COMMIT
-- Si hay error, hacer ROLLBACK
COMMIT;

-- ============================================================================
-- CONSULTAS DE VERIFICACIÓN POST-LIMPIEZA
-- ============================================================================

-- Ver talleres que tenían sobrecupo y cuántas filas se eliminaron
SELECT
  t.id,
  t.titulo,
  t.cupo_max,
  COUNT(b.inscripcion_id) as excedentes_eliminados,
  COUNT(DISTINCT b.alumno_id) as alumnos_afectados
FROM public.talleres t
INNER JOIN public.inscripciones_excedentes_backup b ON b.taller_id = t.id
WHERE b.fecha_backup >= now() - interval '1 hour'
GROUP BY t.id, t.titulo, t.cupo_max
ORDER BY excedentes_eliminados DESC;

-- Ver estado final de todos los talleres
SELECT
  t.id,
  t.titulo,
  t.cupo_max,
  COUNT(i.id) as inscriptos_actuales,
  (t.cupo_max - COUNT(i.id)) as cupos_libres
FROM public.talleres t
LEFT JOIN public.inscripciones i ON i.taller_id = t.id
GROUP BY t.id, t.titulo, t.cupo_max
ORDER BY inscriptos_actuales DESC;

-- Verificar que NO quedan sobrecupos (debe devolver 0 filas)
SELECT
  t.id,
  t.titulo,
  t.cupo_max,
  COUNT(i.id) as inscriptos_actuales
FROM public.talleres t
LEFT JOIN public.inscripciones i ON i.taller_id = t.id
GROUP BY t.id, t.titulo, t.cupo_max
HAVING COUNT(i.id) > t.cupo_max;
