# Semana de Talleres

Aplicación web para gestionar la inscripción a los talleres de la "Semana de Talleres" del colegio. Construida con Next.js (App Router), Supabase y Tailwind CSS. Pensada para deploy en Vercel (plan gratuito) y para usarse desde el celular durante el evento, soportando hasta ~500 alumnos simultáneos con los planes gratuitos de Vercel y Supabase.

## Funcionalidades

- **Autenticación** con Supabase Auth (email + contraseña, cualquier dominio). Registro obligatorio con Nombre, Apellido, DNI, Curso y División.
- **Catálogo de talleres** organizado por los 3 días del evento, con grilla por franja horaria y filtros por categoría.
- **Cupos** mostrados como consulta inicial informativa; **el cupo real se confirma al presionar “Inscribirme”**, validado por un trigger en la base de datos (no se puede saltear).
- **Validaciones en el backend** (trigger `validar_inscripcion` en Postgres, a prueba de concurrencia):
  - Bloqueo por solapamiento horario el mismo día.
  - Bloqueo de un segundo taller de la misma categoría el mismo día.
  - Cupo máximo por taller (con `FOR UPDATE`, sin overselling).
  - Apertura global y por día.
- **Panel de administración** (rol admin):
  - Toggle de apertura global y por día.
  - CRUD completo de talleres.
  - Categorías configurables (no hardcodeadas).
  - Exportación de listas de asistencia en **Excel** y **PDF**.
  - Buscador de alumnos con itinerario completo exportable a PDF.
  - Reset de contraseñas de alumnos.
- **Seguridad de roles**: un alumno **no puede cambiarse el rol a admin** bajo ninguna circunstancia (ver [Seguridad de roles](#seguridad-de-roles)).

## Stack

- Next.js 14 (App Router) + TypeScript
- Supabase (Auth + Postgres + RLS) — plan gratuito
- Tailwind CSS
- exceljs (Excel) y jspdf + jspdf-autotable (PDF)
- Deploy en Vercel — plan gratuito

## 1. Configuración de Supabase

1. Creá un proyecto en https://supabase.com (plan gratuito).
2. Andá a **Settings → API** y copiá:
   - `Project URL`
   - `anon public` key
   - `service_role` key
3. Abrí **SQL Editor**, pegá el contenido de `supabase/schema.sql` y ejecutá. Esto crea:
   - Tablas: `alumnos`, `talleres`, `inscripciones`, `categorias`, `configuracion`.
   - Índices en `inscripciones(taller_id)` y `inscripciones(alumno_id)` (hot paths de cupo e itinerario).
   - Funciones y triggers: validación de inscripciones (`validar_inscripcion`), helpers de cupo/solapamiento/categoría, mantenimiento de `updated_at`, **bloqueo de cambio de rol** (`bloquear_cambio_rol`), sincronización `auth.users → alumnos`.
   - Políticas **RLS** (los alumnos solo ven/editan sus inscripciones; el admin tiene acceso total; un alumno no puede cambiar su `rol`).
   - Datos semilla (configuración inicial y categorías base).

> Si querés desactivar la confirmación de email (más simple para el colegio), andá a **Authentication → Providers → Email** y desactivá "Confirm email". Tras eso, el registro permite login inmediato.

## 2. Variables de entorno

El proyecto usa tres variables, definidas en `.env.example` (sin valores). Copialo a `.env.local` para desarrollo local:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service_role...
```

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` son **públicas** (van al navegador) y funcionan gracias a RLS.
- `SUPABASE_SERVICE_ROLE_KEY` es **secreta** (solo servidor, nunca con prefijo `NEXT_PUBLIC_`). Se usa en los export de Excel/PDF, el reset de contraseñas y la lectura del panel de alumnos (todo validado por `esAdmin()` en el servidor).

> 🔒 Nunca subas `.env.local` al repositorio (ya está en `.gitignore`). Si necesitás rotar la `service_role`, hacelo desde Supabase → Settings → API → “Reset service_role key” y actualizá la variable en Vercel.

## 3. Correr localmente

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

## 4. Crear el primer admin

El registro crea siempre alumnos con `rol = 'alumno'`. Para promover al **primer** admin, usá la `service_role` desde el SQL Editor de Supabase (este canal permite el cambio porque todavía no hay admin; ver [Seguridad de roles](#seguridad-de-roles)):

**Opción A — desde SQL Editor (recomendada):** registrá una cuenta normal desde la app, después ejecutá:

```sql
update alumnos set rol = 'admin' where email = 'tu-email@ejemplo.com';
```

> Esto funciona porque el SQL Editor usa `service_role` (`auth.uid()` es `NULL`), que es el canal habilitado para promover al primer admin. Desde el navegador (anon key) **no** se puede.

**Opción B — directo en la tabla:** abrí la tabla `alumnos` desde el Table Editor de Supabase y cambiá `rol` a `admin`.

Para promover más admins después del primero, la app **no** trae una pantalla dedicada: hacelo desde el SQL Editor de Supabase con el mismo `update` de arriba. A nivel base de datos, un admin ya logueado también está habilitado a cambiar roles (el trigger lo permite cuando `es_admin()` es verdadero), así que si más adelante querés una pantalla para esto, la protección de la BD ya está lista.

## 5. Cargar talleres

1. Entrá como admin → pestaña **Categorías**: agregá las categorías que necesites (Cocina, Deportes, etc.).
2. Pestaña **Talleres** → **+ Nuevo taller**: título, categoría, día (1/2/3), horario, cupo, aula, profesor.
3. Pestaña **Inscripciones**: abrí global + los días que correspondan.
4. Los alumnos ven el catálogo y se inscriben.

## 6. Deploy en Vercel (plan gratuito)

1. Subí el repo a GitHub (sin `.env.local` ni secretos).
2. En https://vercel.com → **Add New… → Project** → importá el repo.
3. **Framework Preset**: Vercel lo detecta como Next.js automáticamente.
4. En **Settings → Environment Variables**, agregá las **tres** variables (los nombres deben coincidir con `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   Marcá `NEXT_PUBLIC_*` como **Production**, **Preview** y **Development**; `SUPABASE_SERVICE_ROLE_KEY` solo en **Production** y **Preview** (nunca Development si forkás públicamente, para no exponerla en previews).
5. **Deploy**. Vercel corre `next build` y publica. La URL queda `https://<tu-proyecto>.vercel.app`.
6. En Supabase → **Authentication → URL Configuration**:
   - **Site URL**: tu dominio de Vercel (`https://<tu-proyecto>.vercel.app`).
   - **Redirect URLs**: agregá `https://<tu-proyecto>.vercel.app/auth/callback` (y el dominio de preview si usás previews).
7. Verificá que la app arranque: entrá a la URL, registrate, y promové tu cuenta a admin con el SQL del paso 4.

> Vercel gratuito: 100 GB-horas de ancho de banda/mes y builds generosos. Para 500 alumnos en un evento corto, sobra. No hay servidor propio que mantener: Next.js corre en Edge/Serverless Functions.

### Consideraciones de plan gratuito para 500 alumnos

- **Sin Realtime en el catálogo**: el plan gratuito de Supabase limita conexiones Realtime (~200). Con 500 alumnos navegando a la vez se agotarían. Por eso el catálogo **no** se suscribe a cambios: los cupos son una consulta inicial informativa y se actualizan por demanda al inscribirse (`router.refresh()` reejecuta el Server Component). El cupo **real** lo decide el trigger de la BD, así que aunque la UI muestre un número ligeramente desactualizado, **nunca** se venden más lugares que `cupo_max`.
- **Concurrencia de inscripción**: el trigger `validar_inscripcion` bloquea la fila del taller (`FOR UPDATE`) antes de contar cupos y bloquea las inscripciones del alumno en ese día antes de validar solapamiento/categoría. Así, aunque muchos presionen “Inscribirme” a la vez, no se supera el cupo ni un mismo alumno queda en dos talleres incompatibles.
- **Auth**: Supabase gratuito admite comfortably 500 usuarios (límite del plan es alto para usuarios activos del día del evento). Si activaste “Confirm email”, los 500 mails salen del cuoteo de emails del plan (50k/mes en gratuito); desactivándolo evitás ese cuello.

## Seguridad de roles

El campo `rol` (`'alumno' | 'admin'`) está protegido en **tres capas**:

1. **Trigger `trg_bloquear_cambio_rol` (BD, a prueba de bypass):** cualquier `UPDATE` que mute `rol` se rechaza salvo que lo ejecute un admin (`es_admin()`) o venga con `service_role` (`auth.uid() IS NULL`, canal para promover al primer admin). Como corre en la BD, un alumno no puede saltearlo desde el navegador.
2. **RLS `alumnos_update`:** un alumno solo puede tocar su propia fila; un admin, cualquiera.
3. **Flujo de registro:** el `signUp` + upsert del perfil **no envía `rol`** (respeta el default `'alumno'` y nunca muta un rol existente). La creación del perfil al registrarse sigue funcionando igual (trigger `handle_new_user` + upsert del server action).

Resultado: **un alumno no puede cambiarse el rol a admin bajo ninguna circunstancia** desde la app ni desde la API anónima de Supabase.

## Estructura

```
src/
  app/
    page.tsx                  # home
    login/                    # login (server action)
    registro/                 # registro (server action)
    catalogo/                 # catálogo + inscripción (SIN Realtime)
    mi-itinerario/            # inscripciones del alumno
    admin/
      layout.tsx              # guard de rol admin
      page.tsx                # talleres + config + categorías
      actions.ts              # server actions admin
      TallerForm.tsx
      CategoriaManager.tsx
      AdminHomeClient.tsx
      alumnos/                # buscador de alumnos + itinerario
      export/taller/[id]/route.ts   # Excel/PDF asistencia
      export/alumno/[id]/route.ts   # PDF itinerario
  components/
    Navbar.tsx
  lib/
    supabase.ts               # cliente browser
    supabase-server.ts        # cliente server + admin (service_role)
    session.ts                # alumno actual / esAdmin
    database-types.ts         # tipos Database
    types.ts                   # tipos de dominio
    format.ts                 # formato de horas/días
    validacion-cliente.ts     # validación previa (UX)
    export.ts                 # Excel/PDF
    useActionStateCompat.ts   # compat React 18
  middleware.ts               # protege /admin y rutas autenticadas
supabase/schema.sql           # esquema completo (tablas, índices, RLS, triggers)
```

## Modelo de datos

- **alumnos**: id, auth_user_id, nombre, apellido, documento (DNI), curso, división, email, rol (alumno|admin)
- **talleres**: id, título, descripción, profesor, aula, categoría, día (1/2/3), hora_inicio, hora_fin, cupo_max, activo
- **inscripciones**: id, alumno_id, taller_id, fecha_inscripción (índices en alumno_id y taller_id)
- **categorias**: id, nombre, orden, activa (configurables)
- **configuracion**: inscripciones_abiertas_global, inscripciones_abiertas_dia1/2/3

## Validaciones (backend, en el trigger `validar_inscripcion`)

1. Cupo máximo por taller (con `FOR UPDATE` sobre la fila del taller → sin overselling).
2. Solapamiento horario el mismo día (no dos talleres a la misma franja).
3. No dos talleres de la misma categoría el mismo día.
4. Inscripciones abiertas (global + día específico).
5. Taller activo.

**Concurrencia:** dos `INSERT` simultáneos al mismo taller se serializan (uno espera al otro) por el `FOR UPDATE` de la fila del taller; dos `INSERT` simultáneos del mismo alumno (ej. dos pestañas) se serializan por el `FOR UPDATE` de sus inscripciones de ese día. Así no se excede cupo ni se anota dos veces en talleres incompatibles.

El frontend hace la misma validación previa para deshabilitar botones y mostrar motivos, pero la validación **real** es la del trigger: no se puede saltear.

## Notas

- El catálogo **no** usa Realtime (ver [Consideraciones de plan gratuito](#consideraciones-de-plan-gratuito-para-500-alumnos)). Los cupos son una consulta inicial informativa y se confirman al inscribir.
- Las exportaciones usan `service_role` (saltean RLS) porque las genera el servidor en nombre del admin, ya validado por `esAdmin()`.
- Responsive: pensado para usarse desde el celular.
