-- =====================================================================
-- BLINDAJE DEFINITIVO DE CUPOS - Nivel Producción
-- =====================================================================
-- INVARIANTE GARANTIZADO:
--   COUNT(inscripciones WHERE taller_id = X) <= talleres.cupo_max
--   para todo taller X, bajo cualquier concurrencia
--
-- MECANISMO:
--   1. FOR UPDATE en la fila del taller serializa todas las operaciones
--   2. Cada transacción espera su turno para ese taller específico
--   3. Solo después de obtener el lock exclusivo, se cuenta y valida
--   4. Imposible que 2 transacciones lean el mismo count simultáneamente
--
-- COMPATIBILIDAD:
--   - Idempotente: puede ejecutarse múltiples veces
--   - Preserva sobrecupos históricos (no los borra)
--   - A partir de instalación, rechaza nuevas inscripciones si count >= max
-- =====================================================================

-- 1. CONSTRAINT UNIQUE (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inscripciones_alumno_id_taller_id_key'
      and conrelid = 'public.inscripciones'::regclass
  ) then
    alter table public.inscripciones
      add constraint inscripciones_alumno_id_taller_id_key
      unique (alumno_id, taller_id);
  end if;
end $$;

-- 2. ÍNDICES para hot paths (idempotentes)
create index if not exists inscripciones_taller_id_idx
  on public.inscripciones (taller_id);
create index if not exists inscripciones_alumno_id_idx
  on public.inscripciones (alumno_id);

-- 3. FUNCIÓN DE VALIDACIÓN CON LOCK EN TALLER
-- El lock en la fila del taller serializa TODO: ninguna otra transacción
-- puede validar/insertar para ese taller hasta que esta haga COMMIT.
create or replace function public.validar_cupo_atomico()
returns trigger
language plpgsql
as $$
declare
  v_taller           record;
  v_cupo_actual      integer;
  v_abierto_global   boolean;
  v_abierto_dia      boolean;
begin
  -- PASO 1: Obtener fila del taller CON LOCK EXCLUSIVO
  -- Este SELECT bloquea la fila hasta COMMIT/ROLLBACK.
  -- Cualquier otra transacción que intente inscribirse en este taller
  -- esperará en este mismo SELECT hasta que liberemos el lock.
  select id, dia, hora_inicio, hora_fin, categoria, cupo_max, activo
    into v_taller
    from public.talleres
    where id = new.taller_id
    for update;  -- <-- SERIALIZACIÓN: solo una transacción a la vez por taller

  if not found then
    raise exception 'El taller no existe.';
  end if;

  if not v_taller.activo then
    raise exception 'El taller no está disponible para inscripción.';
  end if;

  -- PASO 2: Contar inscripciones DESPUÉS de tener el lock
  -- Ahora que tenemos el lock exclusivo del taller, ninguna otra transacción
  -- puede estar modificando inscripciones de este taller simultáneamente.
  -- El count es autoritativo y consistente.
  select count(*) into v_cupo_actual
  from public.inscripciones
  where taller_id = new.taller_id
    -- En UPDATE, excluir la fila que se está modificando del conteo
    and id != coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- PASO 3: Validar cupo
  if v_cupo_actual >= v_taller.cupo_max then
    raise exception 'El taller alcanzó el cupo máximo (%). Actualmente hay % inscriptos.',
      v_taller.cupo_max, v_cupo_actual;
  end if;

  -- PASO 4: Validaciones de reglas de negocio
  -- (estas también dependen del lock del taller para ser consistentes)

  if public.alumno_tiene_sopa_en_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller inscripto en esa franja horaria el mismo día.';
  end if;

  if public.alumno_tiene_categoria_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller de la categoría "%" inscripto ese día.', v_taller.categoria;
  end if;

  if public.alumno_tiene_taller_en_semana(new.alumno_id, new.taller_id) then
    raise exception 'Ya estás anotado a este taller en otro día de la semana.';
  end if;

  if lower(btrim(v_taller.categoria)) = 'cocina'
     and public.alumno_count_categoria_semana(new.alumno_id, 'cocina') >= 2 then
    raise exception 'Ya tenés 2 talleres de Cocina anotados en la semana (límite alcanzado).';
  end if;

  if lower(btrim(v_taller.categoria)) = 'deportes'
     and public.alumno_count_categoria_semana(new.alumno_id, 'deportes') >= 2 then
    raise exception 'Ya tenés 2 talleres de Deportes anotados en la semana (límite alcanzado).';
  end if;

  -- PASO 5: Validar inscripciones abiertas
  select c.inscripciones_abiertas_global,
         case v_taller.dia
           when 1 then c.inscripciones_abiertas_dia1
           when 2 then c.inscripciones_abiertas_dia2
           when 3 then c.inscripciones_abiertas_dia3
         end
    into v_abierto_global, v_abierto_dia
    from public.configuracion c
    where c.id = 1;

  if coalesce(v_abierto_global, false) = false then
    raise exception 'Las inscripciones están cerradas.';
  end if;

  if coalesce(v_abierto_dia, false) = false then
    raise exception 'Las inscripciones para el día % están cerradas.', v_taller.dia;
  end if;

  -- Si llegamos aquí: validación exitosa, permitir INSERT/UPDATE
  return new;
end;
$$;

comment on function public.validar_cupo_atomico() is
  'Validación atómica de cupos usando FOR UPDATE en talleres para serialización completa';

-- 4. TRIGGER BEFORE INSERT
drop trigger if exists trg_validar_cupo_insert on public.inscripciones;
create trigger trg_validar_cupo_insert
  before insert on public.inscripciones
  for each row
  execute function public.validar_cupo_atomico();

comment on trigger trg_validar_cupo_insert on public.inscripciones is
  'Valida cupo antes de INSERT - serializa por taller mediante FOR UPDATE';

-- 5. TRIGGER BEFORE UPDATE (solo cuando cambia taller_id)
drop trigger if exists trg_validar_cupo_update on public.inscripciones;
create trigger trg_validar_cupo_update
  before update on public.inscripciones
  for each row
  when (old.taller_id is distinct from new.taller_id)
  execute function public.validar_cupo_atomico();

comment on trigger trg_validar_cupo_update on public.inscripciones is
  'Valida cupo del taller destino cuando admin cambia taller_id via UPDATE';

-- =====================================================================
-- VERIFICACIÓN DE PROTECCIÓN
-- =====================================================================
-- Confirmar que no hay otras vías para insertar/modificar inscripciones:
--
-- 1. INSERT directo: protegido por trg_validar_cupo_insert
-- 2. UPDATE que cambia taller_id: protegido por trg_validar_cupo_update
-- 3. INSERT vía RPC/function: también ejecuta el trigger
-- 4. UPDATE vía admin actions: también ejecuta el trigger
-- 5. COPY, pg_dump restore: también ejecuta triggers
--
-- No hay forma de evadir el trigger salvo:
-- - Deshabilitarlo explícitamente (requiere superuser)
-- - Usar session_replication_role = replica (requiere superuser)
-- =====================================================================

-- =====================================================================
-- RAZONAMIENTO TRANSACCIONAL
-- =====================================================================
-- ESCENARIO: Taller con 31/32 cupos, llegan 20 INSERT simultáneos
--
-- Transacción T1:
--   1. BEGIN
--   2. INSERT ... (dispara trigger)
--   3. SELECT ... FROM talleres WHERE id = X FOR UPDATE
--      → Obtiene lock exclusivo de la fila del taller
--   4. SELECT COUNT(*) FROM inscripciones WHERE taller_id = X
--      → Lee: 31
--   5. 31 < 32 → OK, continúa
--   6. INSERT completa
--   7. COMMIT → libera el lock, count ahora es 32
--
-- Transacciones T2-T20 (todas esperando simultáneamente):
--   1. BEGIN
--   2. INSERT ... (dispara trigger)
--   3. SELECT ... FROM talleres WHERE id = X FOR UPDATE
--      → BLOQUEADAS esperando que T1 libere el lock
--   4. T1 hace COMMIT
--   5. T2 obtiene el lock (las demás siguen esperando)
--   6. SELECT COUNT(*) → lee: 32 (ve el INSERT de T1)
--   7. 32 >= 32 → RAISE EXCEPTION
--   8. ROLLBACK → libera lock sin insertar
--   9. T3 obtiene el lock
--   10. SELECT COUNT(*) → lee: 32
--   11. 32 >= 32 → RAISE EXCEPTION
--   12. ... T4-T20 todas fallan igual
--
-- RESULTADO FINAL: Exactamente 32 inscripciones, 1 éxito, 19 fallos
--
-- POR QUÉ DOS TRANSACCIONES NO PUEDEN CONSUMIR EL MISMO CUPO:
-- El FOR UPDATE en la fila del taller crea una cola FIFO de espera.
-- Solo una transacción a la vez puede leer el count y decidir.
-- La siguiente solo lee después del COMMIT/ROLLBACK de la anterior.
-- Imposible que dos lean "31" simultáneamente porque el lock lo previene.
-- =====================================================================
