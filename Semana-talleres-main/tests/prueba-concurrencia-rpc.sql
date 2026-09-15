-- ============================================================================
-- PRUEBA DE CONCURRENCIA: RPC inscribirse_taller()
-- ============================================================================
-- Escenario: taller con cupo_max=2, 1 inscripto, 10 intentos simultáneos
-- Resultado esperado: 1 éxito + 9 rechazos, count final = 2
--
-- EJECUTAR EN SUPABASE SQL EDITOR
-- ============================================================================

-- PASO 1: Limpieza
delete from public.inscripciones where taller_id = '00000000-0000-0000-0000-000000000099';
delete from public.talleres where id = '00000000-0000-0000-0000-000000000099';

-- PASO 2: Crear taller de prueba con cupo_max = 2
insert into public.talleres (
  id, titulo, descripcion, profesor, aula, categoria,
  dia, hora_inicio, hora_fin, cupo_max, activo, requiere_materiales
) values (
  '00000000-0000-0000-0000-000000000099',
  'TALLER PRUEBA CONCURRENCIA RPC',
  'Taller para probar concurrencia con RPC',
  'Test',
  'Aula 99',
  1, -- categoria_id
  1, -- dia
  '10:00',
  '11:00',
  2,  -- cupo_max: SOLO 2 LUGARES
  true,
  false
);

-- PASO 3: Inscribir 1 alumno manualmente (queda 1 cupo libre)
-- Usar un UUID de test para el alumno
insert into public.inscripciones (alumno_id, taller_id)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000099'
);

-- Verificar estado inicial
select
  t.id,
  t.titulo,
  t.cupo_max,
  count(i.id) as inscripciones_actuales,
  (t.cupo_max - count(i.id)) as cupos_libres
from public.talleres t
left join public.inscripciones i on i.taller_id = t.id
where t.id = '00000000-0000-0000-0000-000000000099'
group by t.id, t.titulo, t.cupo_max;
-- Debería mostrar: cupo_max=2, inscripciones=1, cupos_libres=1

-- ============================================================================
-- PASO 4: Simular 10 intentos simultáneos de inscripción
-- ============================================================================
-- NOTA: En Supabase SQL Editor no se pueden ejecutar 10 sesiones verdaderamente
-- paralelas. Esta prueba secuencial demuestra que la RPC funciona correctamente.
-- Para concurrencia real, usar pgbench o múltiples conexiones desde la app.
--
-- Alternativa: ejecutar estas 10 llamadas en pestañas separadas del SQL Editor
-- al mismo tiempo, o desde la app con múltiples usuarios.

-- Intento 1 (debería tener ~50% de chance de éxito si fuera concurrente)
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');
-- Si cupo libre: {ok: true, mensaje: "¡Inscripción confirmada!"}
-- Si cupo lleno: {ok: false, mensaje: "El taller alcanzó el cupo máximo..."}

-- Intento 2
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 3
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 4
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 5
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 6
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 7
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 8
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 9
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- Intento 10
select public.inscribirse_taller('00000000-0000-0000-0000-000000000099');

-- ============================================================================
-- PASO 5: Verificar resultado final
-- ============================================================================
select
  t.id,
  t.titulo,
  t.cupo_max,
  count(i.id) as inscripciones_actuales,
  (t.cupo_max - count(i.id)) as cupos_libres
from public.talleres t
left join public.inscripciones i on i.taller_id = t.id
where t.id = '00000000-0000-0000-0000-000000000099'
group by t.id, t.titulo, t.cupo_max;
-- RESULTADO ESPERADO: cupo_max=2, inscripciones=2, cupos_libres=0
-- NUNCA debe haber más de 2 inscripciones

-- Ver detalle de inscripciones
select i.id, i.alumno_id, i.taller_id, i.created_at
from public.inscripciones i
where i.taller_id = '00000000-0000-0000-0000-000000000099'
order by i.created_at;

-- ============================================================================
-- PASO 6: Probar diagnóstico de sobrecupos
-- ============================================================================
select * from public.diagnosticar_sobrecupos();
-- Debería devolver 0 filas (no hay sobrecupo)

-- ============================================================================
-- PASO 7: Probar protección de cupo_max
-- ============================================================================
-- Intentar reducir cupo_max por debajo de inscripciones actuales (debe fallar)
update public.talleres
set cupo_max = 1
where id = '00000000-0000-0000-0000-000000000099';
-- ERROR ESPERADO: "No se puede reducir el cupo máximo por debajo de la cantidad actual de inscriptos"

-- Intentar poner cupo_max = 0 (debe fallar)
update public.talleres
set cupo_max = 0
where id = '00000000-0000-0000-0000-000000000099';
-- ERROR ESPERADO: "El cupo máximo debe ser mayor a 0"

-- Intentar cupo_max válido (debe funcionar)
update public.talleres
set cupo_max = 10
where id = '00000000-0000-0000-0000-000000000099';
-- OK: 10 >= 2 inscripciones actuales

-- ============================================================================
-- PASO 8: Limpieza
-- ============================================================================
delete from public.inscripciones where taller_id = '00000000-0000-0000-0000-000000000099';
delete from public.talleres where id = '00000000-0000-0000-0000-000000000099';

-- Verificar limpieza
select count(*) from public.talleres where id = '00000000-0000-0000-0000-000000000099';
-- Debería ser 0
