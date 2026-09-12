-- =====================================================================
-- PRUEBA DE CONCURRENCIA: 1 cupo restante + 10 intentos simultáneos
-- =====================================================================
-- OBJETIVO: Verificar que bajo concurrencia extrema, el blindaje funciona
--
-- SETUP:
--   - Taller con cupo_max = 2
--   - 1 inscripción existente (31/32 → queda 1 cupo)
--   - 10 alumnos intentan inscribirse simultáneamente
--
-- RESULTADO ESPERADO:
--   - Exactamente 1 INSERT exitoso
--   - 9 INSERT rechazados con "cupo máximo"
--   - Total final: 2/2 inscripciones
-- =====================================================================

-- =====================================================================
-- PARTE 1: SETUP (ejecutar en 1 sesión)
-- =====================================================================

begin;

-- Limpiar datos de prueba previos
delete from public.inscripciones
where taller_id = 'test-cupo-0000-0000-000000000001'::uuid;

delete from public.alumnos
where email like 'testcupo%@concurrency.test';

delete from public.talleres
where id = 'test-cupo-0000-0000-000000000001'::uuid;

-- Crear taller de prueba con cupo_max = 2
insert into public.talleres (
  id, titulo, descripcion, profesor, aula, categoria,
  dia, hora_inicio, hora_fin, cupo_max, activo
) values (
  'test-cupo-0000-0000-000000000001'::uuid,
  'TEST_CONCURRENCY_CUPO',
  'Prueba de concurrencia de cupos',
  'Prof Test',
  'Aula TEST',
  'General',
  1,
  '08:00:00',
  '09:30:00',
  2,  -- CUPO MÁXIMO = 2
  true
);

-- Crear 10 alumnos de prueba
-- NOTA: En producción estos tendrían auth_user_id real de auth.users
-- Para la prueba, creamos alumnos directos (ajustar según tu RLS)
insert into public.alumnos (id, auth_user_id, nombre, apellido, documento, curso, division, email, rol)
select
  gen_random_uuid(),
  gen_random_uuid(),  -- Simula auth_user_id (ajustar si necesitas usuarios reales)
  'Alumno',
  'Test' || i::text,
  '40000' || lpad(i::text, 4, '0'),
  '5°',
  'A',
  'testcupo' || i::text || '@concurrency.test',
  'alumno'
from generate_series(1, 10) as i;

-- Inscribir al alumno #1 (ocupa 1 de 2 cupos)
insert into public.inscripciones (alumno_id, taller_id)
select a.id, 'test-cupo-0000-0000-000000000001'::uuid
from public.alumnos a
where a.email = 'testcupo1@concurrency.test'
limit 1;

commit;

-- Verificar estado inicial
select
  'ESTADO INICIAL' as fase,
  count(*) as inscriptos_actuales,
  (select cupo_max from public.talleres where id = 'test-cupo-0000-0000-000000000001'::uuid) as cupo_maximo,
  (select cupo_max from public.talleres where id = 'test-cupo-0000-0000-000000000001'::uuid) - count(*) as cupos_disponibles
from public.inscripciones
where taller_id = 'test-cupo-0000-0000-000000000001'::uuid;

-- =====================================================================
-- PARTE 2: PRUEBA DE CONCURRENCIA (ejecutar en 9 sesiones PARALELAS)
-- =====================================================================
-- Abrir 9 terminales/sesiones psql distintas simultáneamente
-- En cada sesión ejecutar UNA de estas queries al mismo tiempo:
--
-- SESIÓN 2:
-- begin;
-- insert into public.inscripciones (alumno_id, taller_id)
-- select a.id, 'test-cupo-0000-0000-000000000001'::uuid
-- from public.alumnos a where a.email = 'testcupo2@concurrency.test' limit 1;
-- commit;
--
-- SESIÓN 3:
-- begin;
-- insert into public.inscripciones (alumno_id, taller_id)
-- select a.id, 'test-cupo-0000-0000-000000000001'::uuid
-- from public.alumnos a where a.email = 'testcupo3@concurrency.test' limit 1;
-- commit;
--
-- ... REPETIR para testcupo4 hasta testcupo10 (sesiones 4-10)
--
-- INSTRUCCIONES:
-- 1. Preparar las 9 sesiones con sus queries
-- 2. Ejecutarlas TODAS AL MISMO TIEMPO (Ctrl+Enter simultáneo)
-- 3. Observar que solo 1 completa exitosamente
-- 4. Las otras 8 esperan el lock y luego fallan con:
--    "El taller alcanzó el cupo máximo (2). Actualmente hay 2 inscriptos."
-- =====================================================================

-- =====================================================================
-- PARTE 3: VERIFICACIÓN (ejecutar después de las 9 sesiones paralelas)
-- =====================================================================

select
  'ESTADO FINAL' as fase,
  count(*) as inscriptos_totales,
  (select cupo_max from public.talleres where id = 'test-cupo-0000-0000-000000000001'::uuid) as cupo_maximo,
  case
    when count(*) = 2 then '✓ CORRECTO: Exactamente 2 inscriptos (1 inicial + 1 de las 9 pruebas)'
    when count(*) < 2 then '✗ ERROR: Solo ' || count(*) || ' inscriptos (debería ser 2)'
    when count(*) > 2 then '✗ ERROR CRÍTICO: HAY SOBRECUPO - ' || count(*) || ' inscriptos (debería ser 2)'
  end as resultado
from public.inscripciones
where taller_id = 'test-cupo-0000-0000-000000000001'::uuid;

-- Ver detalles de quiénes quedaron inscritos
select
  'INSCRITOS FINALES' as info,
  a.email,
  i.created_at
from public.inscripciones i
join public.alumnos a on a.id = i.alumno_id
where i.taller_id = 'test-cupo-0000-0000-000000000001'::uuid
order by i.created_at;

-- =====================================================================
-- PARTE 4: LIMPIEZA (ejecutar al finalizar las pruebas)
-- =====================================================================

-- Descomentar para limpiar:
/*
delete from public.inscripciones
where taller_id = 'test-cupo-0000-0000-000000000001'::uuid;

delete from public.alumnos
where email like 'testcupo%@concurrency.test';

delete from public.talleres
where id = 'test-cupo-0000-0000-000000000001'::uuid;
*/

-- =====================================================================
-- ALTERNATIVA: PRUEBA AUTOMATIZADA CON dblink (requiere extension)
-- =====================================================================
-- Si tienes dblink instalado, puedes simular concurrencia en 1 sesión:
/*
create extension if not exists dblink;

-- Ejecutar 9 INSERTs en paralelo usando dblink_send_query
do $$
declare
  conn_names text[] := array['conn2','conn3','conn4','conn5','conn6','conn7','conn8','conn9','conn10'];
  conn_name text;
  query text;
  i integer;
begin
  -- Abrir 9 conexiones
  foreach conn_name in array conn_names loop
    perform dblink_connect(conn_name, 'dbname=postgres');  -- ajustar connection string
  end loop;

  -- Enviar 9 INSERTs asíncronos
  for i in 2..10 loop
    conn_name := conn_names[i-1];
    query := format($q$
      insert into public.inscripciones (alumno_id, taller_id)
      select a.id, 'test-cupo-0000-0000-000000000001'::uuid
      from public.alumnos a where a.email = 'testcupo%s@concurrency.test' limit 1
    $q$, i);

    perform dblink_send_query(conn_name, query);
  end loop;

  -- Esperar resultados
  foreach conn_name in array conn_names loop
    perform dblink_get_result(conn_name);
    perform dblink_disconnect(conn_name);
  end loop;
end $$;
*/
