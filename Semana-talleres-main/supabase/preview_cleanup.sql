-- ============================================================================
-- PREVIEW: Cuántas inscripciones excedentes se eliminarían
-- Ejecutar PRIMERO para ver el impacto antes del cleanup real
-- ============================================================================

-- Ver cuántas filas excedentes hay por taller
SELECT
  t.id,
  t.titulo,
  t.cupo_max,
  COUNT(i.id) as inscriptos_actuales,
  GREATEST(0, COUNT(i.id) - t.cupo_max) as excedentes
FROM public.talleres t
LEFT JOIN public.inscripciones i ON i.taller_id = t.id
GROUP BY t.id, t.titulo, t.cupo_max
HAVING COUNT(i.id) > t.cupo_max
ORDER BY excedentes DESC;

-- Total de excedentes a eliminar
SELECT
  COUNT(*) as total_excedentes_a_eliminar,
  COUNT(DISTINCT taller_id) as talleres_afectados,
  COUNT(DISTINCT alumno_id) as alumnos_afectados
FROM (
  SELECT
    i.id,
    i.alumno_id,
    i.taller_id
  FROM public.inscripciones i
  INNER JOIN public.talleres t ON t.id = i.taller_id
  INNER JOIN (
    SELECT
      id,
      taller_id,
      ROW_NUMBER() OVER (
        PARTITION BY taller_id
        ORDER BY fecha_inscripcion ASC, id ASC
      ) as posicion
    FROM public.inscripciones
  ) ranked ON ranked.id = i.id
  WHERE ranked.posicion > t.cupo_max
) excedentes;

-- Ver detalle de inscripciones que se eliminarían
SELECT
  t.titulo as taller,
  t.cupo_max,
  a.nombre || ' ' || a.apellido as alumno,
  a.curso || a.division as curso,
  i.fecha_inscripcion,
  ranked.posicion,
  (ranked.posicion - t.cupo_max) as posiciones_excedidas
FROM public.inscripciones i
INNER JOIN public.talleres t ON t.id = i.taller_id
INNER JOIN public.alumnos a ON a.id = i.alumno_id
INNER JOIN (
  SELECT
    id,
    taller_id,
    ROW_NUMBER() OVER (
      PARTITION BY taller_id
      ORDER BY fecha_inscripcion ASC, id ASC
    ) as posicion
  FROM public.inscripciones
) ranked ON ranked.id = i.id
WHERE ranked.posicion > t.cupo_max
ORDER BY t.titulo, ranked.posicion;
