-- =====================================================================
-- SEMANA DE TALLERES — Esquema de base de datos Supabase
-- =====================================================================
-- Ejecutar en: Supabase Dashboard > SQL Editor (o supabase db push)
-- Orden: 1) extensiones, 2) tablas, 3) funciones, 4) triggers,
--        5) RLS, 6) datos semilla.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- para gen_random_uuid()

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- alumnos: perfil extendido del auth.users
create table if not exists public.alumnos (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid not null unique references auth.users(id) on delete cascade,
  nombre          text not null check (char_length(trim(nombre)) > 0),
  apellido        text not null check (char_length(trim(apellido)) > 0),
  documento       text,   -- DNI normalizado (solo dígitos). Nullable por compatibilidad.
  curso           text not null check (char_length(trim(curso)) > 0),
  division        text not null check (char_length(trim(division)) > 0),
  email           text not null unique,
  rol             text not null default 'alumno' check (rol in ('alumno','admin')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- UNIQUE de documento: solo entre los no-nulos (Postgres permite varios NULL).
-- El registro normaliza el DNI a dígitos, así que no debería quedar NULL salvo
-- en filas creadas antes de tener esta columna. Para exigirlo siempre, podés
-- agregar `documento text not null` una vez migrados los datos existentes.
create unique index if not exists alumnos_documento_unique
  on public.alumnos (documento)
  where documento is not null;

comment on table  public.alumnos is 'Perfiles de alumnos/admins. auth_user_id enlaza con Supabase Auth.';
comment on column public.alumnos.rol is 'alumno | admin. Define acceso al panel de administración. Solo un admin existente puede cambiarlo (trigger bloquear_cambio_rol).';

-- talleres: catálogo de talleres del evento (3 días)
create table if not exists public.talleres (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(trim(titulo)) > 0),
  descripcion   text not null default '',
  profesor      text not null default '',
  aula          text not null default '',
  categoria     text not null check (char_length(trim(categoria)) > 0),
  dia           smallint not null check (dia in (1,2,3)),
  hora_inicio   time not null,
  hora_fin      time not null,
  cupo_max      integer not null check (cupo_max > 0),
  activo        boolean not null default true,
  requiere_materiales boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint talleres_horario_valido check (hora_fin > hora_inicio),
  constraint talleres_dia_valido check (dia in (1,2,3))
);

comment on table public.talleres is 'Talleres del evento. dia=1..3. cupos controlados por trigger.';
comment on column public.talleres.requiere_materiales is 'Si es false, el taller no requiere que el alumno compre materiales; en ese caso se pide traer un alimento no perecedero como colaboración.';

-- Migración defensiva: si la tabla ya existía de antes (deploy previo sin esta
-- columna), la agregamos sin romper nada. `create table if not exists` de
-- arriba no toca tablas ya creadas, así que este ALTER cubre ese caso.
alter table public.talleres
  add column if not exists requiere_materiales boolean not null default true;

-- inscripciones: relación alumno ↔ taller
create table if not exists public.inscripciones (
  id                uuid primary key default gen_random_uuid(),
  alumno_id         uuid not null references public.alumnos(id) on delete cascade,
  taller_id         uuid not null references public.talleres(id) on delete cascade,
  fecha_inscripcion timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (alumno_id, taller_id)
);

comment on table public.inscripciones is 'Inscripciones de alumnos a talleres. Validadas por trigger backend.';

-- Índices para acelerar el conteo de cupo por taller (cupo_actual_taller)
-- y la consulta de inscripciones de un alumno (itinerario / validación).
-- Ambas son las hot-paths del catálogo y del trigger validar_inscripcion.
create index if not exists inscripciones_taller_id_idx on public.inscripciones (taller_id);
create index if not exists inscripciones_alumno_id_idx on public.inscripciones (alumno_id);
-- Nota: el par (alumno_id, taller_id) ya tiene índice único por el
-- `unique (alumno_id, taller_id)` de la tabla, así que no hace falta otro.

-- categorias: configurables (no hardcodeadas)
create table if not exists public.categorias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique check (char_length(trim(nombre)) > 0),
  orden     integer not null default 0,
  activa    boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.categorias is 'Categorías configurables de talleres.';

-- configuracion: flags de apertura de inscripciones (fila única)
create table if not exists public.configuracion (
  id                          integer primary key default 1,
  inscripciones_abiertas_global     boolean not null default false,
  inscripciones_abiertas_dia1      boolean not null default false,
  inscripciones_abiertas_dia2      boolean not null default false,
  inscripciones_abiertas_dia3      boolean not null default false,
  updated_at                  timestamptz not null default now(),
  constraint configuracion_singleton check (id = 1)
);

comment on table public.configuracion is 'Flags de apertura de inscripciones global y por día. Fila única (id=1).';

-- ---------------------------------------------------------------------
-- 2. FUNCIONES
-- ---------------------------------------------------------------------

-- 2a) cuenta cupos por taller (segura, sin race conditions vía UPDATE RETURNING)
create or replace function public.cupo_actual_taller(p_taller_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.inscripciones where taller_id = p_taller_id;
$$;

-- 2b) helper: ¿hay solapamiento horario del alumno ese día con otro taller?
create or replace function public.alumno_tiene_sopa_en_dia(
  p_alumno_id uuid,
  p_taller_id uuid
) returns boolean
language plpgsql
stable
as $$
declare
  v_dia           smallint;
  v_inicio        time;
  v_fin           time;
  v_existe        boolean;
begin
  select dia, hora_inicio, hora_fin
    into v_dia, v_inicio, v_fin
    from public.talleres
    where id = p_taller_id;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  -- otro taller el mismo día con horario solapado (excluyendo el taller actual)
  select exists (
    select 1
    from public.inscripciones i
    join public.talleres t on t.id = i.taller_id
    where i.alumno_id = p_alumno_id
      and i.taller_id <> p_taller_id
      and t.dia = v_dia
      and t.hora_inicio < v_fin
      and t.hora_fin   > v_inicio
  ) into v_existe;

  return v_existe;
end;
$$;

-- 2c) helper: ¿el alumno ya tiene un taller de la misma categoría ese día?
create or replace function public.alumno_tiene_categoria_dia(
  p_alumno_id uuid,
  p_taller_id uuid
) returns boolean
language plpgsql
stable
as $$
declare
  v_dia        smallint;
  v_categoria  text;
  v_existe     boolean;
begin
  select dia, categoria
    into v_dia, v_categoria
    from public.talleres
    where id = p_taller_id;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  select exists (
    select 1
    from public.inscripciones i
    join public.talleres t on t.id = i.taller_id
    where i.alumno_id = p_alumno_id
      and i.taller_id <> p_taller_id
      and t.dia = v_dia
      and t.categoria = v_categoria
  ) into v_existe;

  return v_existe;
end;
$$;

-- 2c-bis) helper: ¿el alumno ya está inscripto a ESTE MISMO taller en otro
-- día de la semana? Un taller puede repetirse (mismo título) en más de un día
-- del evento (ej. el mismo curso dictado día 1 y día 2); esta función bloquea
-- que un alumno se anote dos veces al mismo taller durante toda la semana,
-- sin importar en qué día. Compara por título normalizado (trim + minúsculas)
-- para cubrir tanto la fila exacta como sus repeticiones en otros días.
create or replace function public.alumno_tiene_taller_en_semana(
  p_alumno_id uuid,
  p_taller_id uuid
) returns boolean
language plpgsql
stable
as $$
declare
  v_titulo text;
  v_existe boolean;
begin
  select titulo into v_titulo from public.talleres where id = p_taller_id;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  select exists (
    select 1
    from public.inscripciones i
    join public.talleres t on t.id = i.taller_id
    where i.alumno_id = p_alumno_id
      and i.taller_id <> p_taller_id
      and lower(btrim(t.titulo)) = lower(btrim(v_titulo))
  ) into v_existe;

  return v_existe;
end;
$$;

-- 2d) handler: trigger BEFORE INSERT en inscripciones — valida todas las reglas
-- CONCURRENCIA: dos INSERTs simultáneos (al mismo taller, o del mismo alumno
-- a talleres incompatibles) podrían pasar los chequeos a la vez. Para evitarlo
-- tomamos dos locks de fila, SIEMPRE en este orden para no deadlockear:
--  (a) fila del ALUMNO en `alumnos` (FOR UPDATE): serializa los INSERTs del
--      mismo alumno -> no puede quedar en dos talleres incompatibles a la vez
--      (solapados o de la misma categoría ese día). Funciona incluso cuando el
--      alumno aún no tiene inscripciones, porque su fila siempre existe.
--  (b) fila del TALLER en `talleres` (FOR UPDATE) antes de contar cupos:
--      serializa los INSERTs al mismo taller -> nunca se excede cupo_max.
-- El orden fijo alumno -> taller evita ciclos de espera entre transacciones.
create or replace function public.validar_inscripcion()
returns trigger
language plpgsql
as $$
declare
  v_taller           record;
  v_cupo             integer;
  v_abierto_global   boolean;
  v_abierto_dia      boolean;
begin
  -- cargar datos del taller
  select t.dia, t.hora_inicio, t.hora_fin, t.categoria, t.cupo_max, t.activo
    into v_taller
    from public.talleres t
    where t.id = new.taller_id;

  if not found then
    raise exception 'El taller no existe.';
  end if;

  if not v_taller.activo then
    raise exception 'El taller no está disponible para inscripción.';
  end if;

  -- ORDEN DE LOCKS (importante para no generar deadlocks): primero la fila
  -- del ALUMNO, después la fila del TALLER. Siempre en ese orden, en todos los
  -- caminos, así nunca hay ciclos de espera entre dos transacciones.

  -- 1) Serializar los INSERT del MISMO alumno: bloqueamos su fila en `alumnos`.
  --    Esa fila siempre existe (FK), así que sirve incluso cuando el alumno
  --    todavía no tiene ninguna inscripción — que es justo el caso donde dos
  --    clics simultáneos podrían meterlo en dos talleres incompatibles.
  --    Con este lock, el segundo INSERT espera al primero y entonces sí ve el
  --    conflicto de solapamiento/categoría en los chequeos de abajo.
  perform 1 from public.alumnos where id = new.alumno_id for update;

  -- 2) cupo máximo — ATÓMICO: bloquea la fila del taller para serializar
  --    inscripciones simultáneas al MISMO taller y evitar overselling.
  --    El índice inscripciones_taller_id_idx hace que el count sea rápido.
  perform 1 from public.talleres where id = new.taller_id for update;

  select count(*) into v_cupo from public.inscripciones where taller_id = new.taller_id;
  if v_cupo >= v_taller.cupo_max then
    raise exception 'El taller alcanzó el cupo máximo (%).', v_taller.cupo_max;
  end if;

  -- 3) solapamiento horario mismo día
  if public.alumno_tiene_sopa_en_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller inscripto en esa franja horaria el mismo día.';
  end if;

  -- 4) misma categoría mismo día (bloquea 2do taller de la categoría ese día)
  if public.alumno_tiene_categoria_dia(new.alumno_id, new.taller_id) then
    raise exception 'Ya tenés un taller de la categoría "%" inscripto ese día.', v_taller.categoria;
  end if;

  -- 4bis) mismo taller repetido en otro día de la semana
  if public.alumno_tiene_taller_en_semana(new.alumno_id, new.taller_id) then
    raise exception 'Ya estás anotado a este taller en otro día de la semana.';
  end if;

  -- 5) inscripciones abiertas (global + día)
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

  return new;
end;
$$;

-- 2e) trigger para mantener updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2f) SEGURIDAD DE ROLES: un alumno NO puede cambiar su propio rol (ni el de
--     nadie). Solo un admin ya existente puede. Esto cierra la escalada de
--     privilegios en la que un alumno hacía update de su fila poniendo
--     rol='admin'. La política RLS (alumnos_update) ya limita qué filas toca,
--     pero RLS con `with check` solo valida el estado FINAL, no el delta, así
--     que un alumno igual podía setear rol='admin' en su propia fila. Este
--     trigger lo bloquea en la BD, a prueba de bypass desde el cliente.
create or replace function public.bloquear_cambio_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Si el rol cambia y quien ejecuta NO es admin -> rechazar.
  -- Excepción: si auth.uid() IS NULL, la operación viene con service_role
  -- (clave de servidor / SQL Editor con rol de servicio), que es el canal
  -- legítimo para promover al PRIMER admin (cuando todavía no hay ninguno).
  -- El navegador (anon key) siempre tiene auth.uid() seteado, así que un
  -- alumno nunca puede invocar este path.
  if new.rol is distinct from old.rol
     and auth.uid() is not null
     and not public.es_admin() then
    raise exception 'No tenés permiso para cambiar el rol de un usuario.';
  end if;
  return new;
end;
$$;

-- 2g) ASIGNACIÓN AUTOMÁTICA: a los alumnos que no se anotaron a NINGÚN
-- taller, les asigna al azar uno con cupo disponible. Pensada para correrse
-- una sola vez, cerca del cierre de inscripciones, desde el panel admin.
-- security definer porque el admin la invoca vía RPC con el cliente normal
-- (RLS de inscripciones exige alumno_id = alumno actual, así que sin esto
-- no podría insertar a nombre de otros alumnos).
-- Reutiliza el INSERT normal (no las columnas a mano) para que pase por el
-- trigger `validar_inscripcion` de siempre: respeta cupo, activo e
-- inscripciones abiertas. Como el alumno no tiene ninguna inscripción previa,
-- solapamiento/categoría/repetido-en-semana nunca pueden bloquearlo.
-- Si un taller se queda sin cupo entre el sorteo y el insert (otro alumno se
-- adelantó), prueba con el siguiente taller candidato de la lista aleatoria.
create or replace function public.asignar_talleres_pendientes()
returns table(alumno_id uuid, taller_id uuid, error text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno   record;
  v_taller   record;
  v_asignado boolean;
begin
  -- solo un admin puede correr esta asignación masiva (aunque la función es
  -- security definer y podría saltear RLS, esto evita que cualquier usuario
  -- autenticado la invoque por RPC directamente).
  if not public.es_admin() then
    raise exception 'No tenés permiso para ejecutar esta acción.';
  end if;

  for v_alumno in
    select a.id
    from public.alumnos a
    where a.rol = 'alumno'
      and not exists (
        select 1 from public.inscripciones i where i.alumno_id = a.id
      )
  loop
    v_asignado := false;

    for v_taller in
      select t.id
      from public.talleres t
      where t.activo = true
        and public.cupo_actual_taller(t.id) < t.cupo_max
      order by random()
    loop
      begin
        insert into public.inscripciones (alumno_id, taller_id)
        values (v_alumno.id, v_taller.id);
        alumno_id := v_alumno.id;
        taller_id := v_taller.id;
        error := null;
        v_asignado := true;
        return next;
        exit; -- ya se anotó a un taller, pasar al siguiente alumno
      exception when others then
        -- ese taller falló (se llenó justo ahora, día cerrado, etc.):
        -- probar con el siguiente taller candidato de la lista aleatoria.
        continue;
      end;
    end loop;

    if not v_asignado then
      alumno_id := v_alumno.id;
      taller_id := null;
      error := 'No se encontró ningún taller con cupo disponible.';
      return next;
    end if;
  end loop;

  return;
end;
$$;

comment on function public.asignar_talleres_pendientes() is
  'Anota al azar, en un taller con cupo disponible, a cada alumno que todavía no tenga ninguna inscripción. Devuelve una fila por alumno procesado.';

-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- trigger de validación de inscripción
drop trigger if exists trg_validar_inscripcion on public.inscripciones;
create trigger trg_validar_inscripcion
  before insert on public.inscripciones
  for each row execute function public.validar_inscripcion();

-- triggers updated_at
drop trigger if exists trg_alumnos_updated on public.alumnos;
create trigger trg_alumnos_updated
  before update on public.alumnos
  for each row execute function public.set_updated_at();

-- trigger de protección de rol: bloquea cambios de rol por no-admin.
-- (seguridad de roles — ver función bloquear_cambio_rol)
drop trigger if exists trg_bloquear_cambio_rol on public.alumnos;
create trigger trg_bloquear_cambio_rol
  before update on public.alumnos
  for each row execute function public.bloquear_cambio_rol();

drop trigger if exists trg_talleres_updated on public.talleres;
create trigger trg_talleres_updated
  before update on public.talleres
  for each row execute function public.set_updated_at();

drop trigger if exists trg_configuracion_updated on public.configuracion;
create trigger trg_configuracion_updated
  before update on public.configuracion
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS (Row Level Security)
-- ---------------------------------------------------------------------

-- Habilitar RLS en todas las tablas
alter table public.alumnos        enable row level security;
alter table public.talleres       enable row level security;
alter table public.inscripciones  enable row level security;
alter table public.categorias     enable row level security;
alter table public.configuracion  enable row level security;

-- Helper: ¿el usuario actual es admin?
create or replace function public.es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.alumnos a
    where a.auth_user_id = auth.uid() and a.rol = 'admin'
  );
$$;

-- Permite invocar la asignación masiva vía RPC desde el cliente autenticado
-- (la función igual re-chequea es_admin() por dentro, esto solo habilita la
-- llamada; sin este grant, PostgREST devuelve "permission denied" incluso
-- para admins).
grant execute on function public.asignar_talleres_pendientes() to authenticated;

-- Helper: auth_user_id del alumno actual
create or replace function public.alumno_actual_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.alumnos where auth_user_id = auth.uid();
$$;

-- ===== alumnos =====
-- un alumno solo puede ver/leer su propia fila; un admin ve todo
drop policy if exists "alumnos_select" on public.alumnos;
create policy "alumnos_select" on public.alumnos
  for select using (auth_user_id = auth.uid() or public.es_admin());

-- un alumno puede insertar su propia fila (registro); admin puede todo
drop policy if exists "alumnos_insert" on public.alumnos;
create policy "alumnos_insert" on public.alumnos
  for insert with check (auth_user_id = auth.uid() or public.es_admin());

-- un alumno puede actualizar solo su propia fila; admin puede todo.
-- El campo `rol` está protegido por el trigger trg_bloquear_cambio_rol:
-- un alumno puede tocar nombre/curso/etc. de su propia fila, pero CUALQUIER
-- intento de cambiar `rol` (a admin o lo que sea) se rechaza en la BD a menos
-- que lo ejecute un admin (o service_role, para promover al primer admin).
drop policy if exists "alumnos_update" on public.alumnos;
create policy "alumnos_update" on public.alumnos
  for update using (auth_user_id = auth.uid() or public.es_admin())
  with check (auth_user_id = auth.uid() or public.es_admin());

drop policy if exists "alumnos_delete" on public.alumnos;
create policy "alumnos_delete" on public.alumnos
  for delete using (public.es_admin());

-- ===== talleres =====
-- lectura: todos los autenticados pueden ver talleres activos (catálogo).
-- Para el panel admin se lee sin filtrar activo desde server client (service_role, saltea RLS).
drop policy if exists "talleres_select" on public.talleres;
create policy "talleres_select" on public.talleres
  for select using (true);

drop policy if exists "talleres_modify" on public.talleres;
create policy "talleres_modify" on public.talleres
  for all using (public.es_admin()) with check (public.es_admin());

-- ===== inscripciones =====
-- lectura: alumno ve sus inscripciones; admin ve todas
drop policy if exists "inscripciones_select" on public.inscripciones;
create policy "inscripciones_select" on public.inscripciones
  for select using (alumno_id = public.alumno_actual_id() or public.es_admin());

-- insert: alumno crea la suya; admin también (raro pero permitido)
drop policy if exists "inscripciones_insert" on public.inscripciones;
create policy "inscripciones_insert" on public.inscripciones
  for insert with check (alumno_id = public.alumno_actual_id() or public.es_admin());

-- delete: alumno borra la suya; admin todas
drop policy if exists "inscripciones_delete" on public.inscripciones;
create policy "inscripciones_delete" on public.inscripciones
  for delete using (alumno_id = public.alumno_actual_id() or public.es_admin());

-- update: solo admin
drop policy if exists "inscripciones_update" on public.inscripciones;
create policy "inscripciones_update" on public.inscripciones
  for update using (public.es_admin()) with check (public.es_admin());

-- ===== categorias =====
-- lectura pública autenticada; modificación solo admin
drop policy if exists "categorias_select" on public.categorias;
create policy "categorias_select" on public.categorias
  for select using (true);

drop policy if exists "categorias_modify" on public.categorias;
create policy "categorias_modify" on public.categorias
  for all using (public.es_admin()) with check (public.es_admin());

-- ===== configuracion =====
-- lectura pública autenticada; modificación solo admin
drop policy if exists "config_select" on public.configuracion;
create policy "config_select" on public.configuracion
  for select using (true);

drop policy if exists "config_modify" on public.configuracion;
create policy "config_modify" on public.configuracion
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------
-- 5. SYNC auth.users -> alumnos (trigger automático al registrarse)
-- ---------------------------------------------------------------------
-- Cuando un usuario se crea en auth.users, no crea automáticamente el perfil.
-- El frontend inserta el perfil alumnos tras el registro. Aquí dejamos un trigger
-- opcional que inserta un perfil mínimo si no existe (defensivo).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre    text := coalesce(new.raw_user_meta_data->>'nombre', '');
  v_apellido  text := coalesce(new.raw_user_meta_data->>'apellido', '');
  v_curso     text := coalesce(new.raw_user_meta_data->>'curso', '');
  v_division  text := coalesce(new.raw_user_meta_data->>'division', '');
begin
  -- Solo insertamos el perfil si la metadata viene COMPLETA. Si algún dato
  -- falta, NO insertamos (evitamos violar el CHECK char_length > 0, que
  -- de lo contrario revertiría la creación del auth user). El frontend hace
  -- upsert del perfil completo tras el signUp, así que esto es solo un
  -- respaldo defensivo para registros con metadata completa.
  if char_length(btrim(v_nombre)) > 0
     and char_length(btrim(v_apellido)) > 0
     and char_length(btrim(v_curso)) > 0
     and char_length(btrim(v_division)) > 0 then
    insert into public.alumnos (auth_user_id, email, nombre, apellido, curso, division)
    values (new.id, coalesce(new.email, ''), v_nombre, v_apellido, v_curso, v_division)
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6. DATOS SEMILLA
-- ---------------------------------------------------------------------

-- configuración: fila única
insert into public.configuracion (id) values (1)
  on conflict (id) do nothing;

-- categorías iniciales
insert into public.categorias (nombre, orden) values
  ('Cocina', 1),
  ('Deportes', 2),
  ('Técnica/Oficios', 3),
  ('Arte', 4),
  ('Música', 5),
  ('Ciencia', 6)
on conflict (nombre) do nothing;

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
