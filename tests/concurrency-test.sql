-- =====================================================================
-- Prueba de concurrencia: 1 cupo restante, 10 intentos simultáneos
-- =====================================================================
-- SETUP:
-- 1. Crear taller de prueba con cupo_max=2
-- 2. Crear 10 alumnos de prueba
-- 3. Inscribir 1 alumno (queda 1 cupo)
-- 4. Intentar inscribir los otros 9 simultáneamente
-- ESPERADO: Solo 1 más debe entrar, 8 deben fallar
-- =====================================================================

begin;

-- Limpiar datos de prueba anteriores
delete from public.inscripciones where taller_id in (
  select id from public.talleres where titulo = 'TEST_CONCURRENCY'
);
delete from public.alumnos where email like 'test_concurrency_%@test.com';
delete from public.talleres where titulo = 'TEST_CONCURRENCY';

-- Crear taller de prueba con cupo=2
insert into public.talleres (
  id, titulo, descripcion, profesor, aula, categoria,
  dia, hora_inicio, hora_fin, cupo_max, activo, requiere_materiales
) values (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'TEST_CONCURRENCY',
  'Taller de prueba de concurrencia',
  'Prof Test',
  'Aula 1',
  'General',
  1,
  '08:00:00',
  '09:30:00',
  2,
  true,
  false
);

-- Crear 10 alumnos de prueba (necesitan auth_user_id válido)
do $$
declare
  v_user_id uuid;
  i integer;
begin
  for i in 1..10 loop
    -- Crear usuario en auth.users (simulado - en prod necesitas signUp real)
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, role, aud
    ) values (
      gen_random_uuid(),
      'test_concurrency_' || i || '@test.com',
      crypt('password123', gen_salt('bf')),
      now(),
      now(),
      now(),
      'authenticated',
      'authenticated'
    ) returning id into v_user_id;

    -- Crear alumno
    insert into public.alumnos (
      auth_user_id, nombre, apellido, documento, curso, division, email, rol
    ) values (
      v_user_id,
      'Test',
      'Alumno' || i,
      '40000000' || i,
      '5°',
      'A',
      'test_concurrency_' || i || '@test.com',
      'alumno'
    );
  end loop;
end $$;

-- Inscribir alumno #1 (ocupa 1 de 2 cupos)
insert into public.inscripciones (alumno_id, taller_id)
select a.id, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
from public.alumnos a
where a.email = 'test_concurrency_1@test.com';

commit;

-- Verificar estado inicial
select 'Estado inicial:' as descripcion,
       count(*) as inscriptos_actuales,
       (select cupo_max from public.talleres where titulo = 'TEST_CONCURRENCY') as cupo_maximo
from public.inscripciones
where taller_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;

-- =====================================================================
-- AHORA: Ejecutar en 9 sesiones paralelas simultáneamente
-- =====================================================================
-- En cada sesión (2-10), correr:
--
-- begin;
-- insert into public.inscripciones (alumno_id, taller_id)
-- select a.id, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
-- from public.alumnos a
-- where a.email = 'test_concurrency_X@test.com'; -- Cambiar X por 2-10
-- commit;
--
-- RESULTADO ESPERADO:
-- - Solo 1 sesión debe completar exitosamente
-- - Las otras 8 deben fallar con: "El taller alcanzó el cupo máximo (2)"
-- =====================================================================

-- Verificar resultado final (ejecutar después de las 9 sesiones)
select 'Estado final:' as descripcion,
       count(*) as inscriptos_totales,
       (select cupo_max from public.talleres where titulo = 'TEST_CONCURRENCY') as cupo_maximo,
       case
         when count(*) = 2 then '✓ CORRECTO: Solo 2 inscriptos'
         else '✗ ERROR: Hay ' || count(*) || ' inscriptos (debería ser 2)'
       end as resultado
from public.inscripciones
where taller_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;

-- Limpiar (opcional)
-- delete from public.inscripciones where taller_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
-- delete from public.alumnos where email like 'test_concurrency_%@test.com';
-- delete from auth.users where email like 'test_concurrency_%@test.com';
-- delete from public.talleres where titulo = 'TEST_CONCURRENCY';
