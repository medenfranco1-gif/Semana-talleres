# 🚀 GUÍA SIMPLIFICADA - PRUEBAS DE CARGA (LOCALHOST + SUPABASE PRUEBA)

## ⚠️ IMPORTANTE

Esta guía está diseñada para **personas sin conocimientos técnicos**.

**TODO es copiar y pegar comandos.**

**NO tocamos Vercel, NO tocamos producción, TODO es local.**

---

## 🎯 ¿QUÉ VAMOS A HACER?

1. Levantar la aplicación en tu PC (localhost)
2. Conectarla al Supabase de PRUEBA (no el real)
3. Crear usuarios ficticios en el Supabase de prueba
4. Simular 5 usuarios inscribiéndose al mismo tiempo

**NO afecta usuarios reales, NO afecta producción.**

---

## 📋 REQUISITOS PREVIOS

### 1. ¿Tenés Node.js instalado?

Abrí PowerShell y ejecutá:

```powershell
node --version
```

Debería mostrar algo como `v20.14.10`. Si da error, instalá Node.js primero.

### 2. ¿Tenés las dependencias instaladas?

```powershell
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
npm install
```

Esperá a que termine (2-3 minutos).

### 3. ¿Tenés Playwright instalado?

```powershell
npx playwright install chromium
```

---

## 🔧 PASO 1: CONFIGURAR SUPABASE DE PRUEBA

### A. Copiar archivo de configuración

```powershell
copy .env.loadtest.example .env.loadtest
```

### B. Obtener credenciales del Supabase de PRUEBA

1. Abrí en tu navegador: https://supabase.com/dashboard
2. Seleccioná el proyecto: **Semana-Talleres-Prueba-400**
3. Ir a: **Settings** > **API**
4. Copiá estos valores:

   - **Project URL** (ejemplo: `https://xyz123.supabase.co`)
   - **anon public** key (la clave larga que empieza con `eyJ...`)

### C. Editar .env.loadtest

Abrí el archivo `.env.loadtest` con Bloc de notas y completá:

```
TEST_SUPABASE_URL=https://xyz123.supabase.co
TEST_SUPABASE_ANON_KEY=eyJhbGc...tu-clave-completa-aqui
BASE_URL=http://localhost:3000
TALLER_NOMBRE=Cocina
```

**IMPORTANTE:**
- Reemplazá `https://xyz123.supabase.co` con tu URL real del Supabase de PRUEBA
- Reemplazá `eyJhbGc...` con tu anon key real del Supabase de PRUEBA
- Reemplazá `Cocina` con el nombre de un taller que exista en tu catálogo de prueba

Guardá y cerrá el archivo.

---

## 🗄️ PASO 2: VERIFICAR SUPABASE DE PRUEBA

Antes de continuar, verificá que el Supabase de PRUEBA tenga:

### A. Tablas necesarias

En Supabase Dashboard > Table Editor, debe haber:
- ✅ alumnos
- ✅ talleres
- ✅ inscripciones
- ✅ categorias
- ✅ configuracion

### B. Función RPC

En Supabase Dashboard > Database > Functions, buscar:
- ✅ `contar_cupos_talleres`

Si NO existe esta función, ejecutá en **SQL Editor**:

```sql
-- Copiar desde supabase/schema.sql la función contar_cupos_talleres
-- Ver archivo: supabase/schema.sql líneas 134-158
```

### C. Datos mínimos

Debe haber al menos:
- ✅ 1 taller activo
- ✅ 1 categoría activa
- ✅ Configuración con inscripciones abiertas

Si falta algo, **DETENTE AQUÍ** y consultá con el desarrollador cómo copiar los datos desde producción de forma segura.

---

## 🚀 PASO 3: LEVANTAR LA APP LOCAL

### Terminal 1 (PowerShell)

Abrí PowerShell y ejecutá:

```powershell
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
```

Ahora configurá las variables de entorno para apuntar al Supabase de PRUEBA:

```powershell
# IMPORTANTE: Reemplazar con TUS valores del Supabase de PRUEBA
$env:NEXT_PUBLIC_SUPABASE_URL="https://xyz123.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc...tu-clave-completa-aqui"
```

Ahora levantá el servidor:

```powershell
npm run dev
```

Vas a ver algo así:

```
▲ Next.js 14.2.5
- Local:        http://localhost:3000
- ready in 2.3s
```

✅ **DEJÁ ESTA TERMINAL ABIERTA** - el servidor debe seguir corriendo.

### Verificar que funciona

Abrí tu navegador en: http://localhost:3000

Deberías ver la aplicación.

**Si funciona, continuá. Si da error, verificá los pasos anteriores.**

---

## 👥 PASO 4: CREAR USUARIOS DE PRUEBA

### A. Preparar archivo de usuarios

```powershell
# En otra terminal (Terminal 2)
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
copy tests\load\register-users.example.json tests\load\register-users.json
```

### B. Verificar usuarios ficticios

Abrí `tests\load\register-users.json` y verificá que:
- ✅ Todos los emails terminen en `@loadtest.local`
- ✅ Todos los DNIs empiecen con `9000000X`
- ✅ Los nombres digan "Test AlumnoXX"

**NO uses datos reales.**

### C. Crear 5 usuarios

En la **Terminal 2** (la nueva que abriste):

```powershell
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
npm run test:register:5
```

Vas a ver:

```
🔧 REGISTRO DE USUARIOS DE PRUEBA
==================================================
URL:      http://localhost:3000
Usuarios: 5
==================================================

[1/5] Registrando Test Alumno01... ✅ OK (450ms)
[2/5] Registrando Test Alumno02... ✅ OK (420ms)
[3/5] Registrando Test Alumno03... ✅ OK (480ms)
[4/5] Registrando Test Alumno04... ✅ OK (510ms)
[5/5] Registrando Test Alumno05... ✅ OK (470ms)

==================================================
📊 RESUMEN
==================================================
✅ Registrados:     5
⚠️  Ya existían:    0
❌ Errores:         0
==================================================
```

✅ **Si todo sale bien, los usuarios están listos.**

---

## 🧪 PASO 5: EJECUTAR PRUEBA DE CARGA

En la **Terminal 2** (donde creaste los usuarios):

```powershell
npm run test:load:5
```

La prueba va a ejecutarse y mostrar el progreso.

**Esto tarda 1-2 minutos.**

### Resultado esperado:

```
======================================================================
📊 RESUMEN DE PRUEBA DE CARGA
======================================================================
URL:               http://localhost:3000
Usuarios:          5
======================================================================

✅ RESULTADOS:
   Login OK:                5/5
   Catálogo OK:             5/5
   Inscripciones exitosas:  5
   Rechazos de negocio:     0
   Errores técnicos:        0
   Errores 5xx:             0

⏱️  TIEMPOS - LOGIN:
   Promedio:  450ms
   P95:       520ms
   Máximo:    580ms

⏱️  TIEMPOS - CATÁLOGO:
   Promedio:  1200ms
   P95:       1450ms
   Máximo:    1600ms

⏱️  TIEMPOS - INSCRIPCIÓN:
   Promedio:  680ms
   P95:       820ms
   Máximo:    950ms

======================================================================
```

---

## ✅ ¿CÓMO SÉ QUE NO ESTOY TOCANDO PRODUCCIÓN?

### Verificación 1: Archivo .env.loadtest

Abrí `.env.loadtest` y verificá que:
- ✅ `TEST_SUPABASE_URL` NO contiene `fmrlewcfttxgcftycfsfp`
- ✅ `BASE_URL` es `http://localhost:3000`

### Verificación 2: Terminal 1 (servidor)

El servidor debe mostrar:
```
- Local:        http://localhost:3000
```

Si dice `0.0.0.0:3000` o algo externo, está bien igual (localhost).

### Verificación 3: Supabase Dashboard

Durante la prueba, abrí en otra pestaña:
- Supabase Dashboard del proyecto **Semana-Talleres-Prueba-400**
- Ir a: **Table Editor** > **alumnos**

Deberías ver los usuarios `Test Alumno01`, `Test Alumno02`, etc.

**Si los ves, está funcionando contra el Supabase de PRUEBA. ✅**

---

## 🛑 CÓMO DETENER TODO

### Detener el servidor (Terminal 1)

Presioná: `Ctrl + C`

El servidor se detendrá.

### Detener las pruebas (Terminal 2)

Si una prueba está corriendo y querés detenerla:

Presioná: `Ctrl + C`

---

## 📊 QUÉ MIRAR EN SUPABASE DURANTE LA PRUEBA

Abrí en otra pestaña: **Supabase Dashboard** > **Semana-Talleres-Prueba-400**

### 1. Table Editor > alumnos

Deberías ver aparecer:
- Test Alumno01
- Test Alumno02
- Test Alumno03
- etc.

### 2. Table Editor > inscripciones

Deberías ver las inscripciones de los usuarios de prueba.

### 3. Reports

Si tenés acceso, podés ver:
- **API Requests** (cantidad de requests por minuto)
- **Database** (uso de recursos)

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### Error: "TEST_SUPABASE_URL no definida"

**Solución:**
1. Verificá que `.env.loadtest` existe
2. Abrilo y completá las variables
3. Guardá el archivo

### Error: "EL TEST ESTÁ APUNTANDO A PRODUCCIÓN"

**Solución:**
¡DETENTE! Las credenciales en `.env.loadtest` son incorrectas.

1. Abrí `.env.loadtest`
2. Verificá que `TEST_SUPABASE_URL` contenga la URL del Supabase de PRUEBA
3. NO debe contener `fmrlewcfttxgcftycfsfp`

### Error: "Cannot connect to localhost:3000"

**Solución:**
El servidor no está corriendo.

1. Volvé a la Terminal 1
2. Ejecutá:
   ```powershell
   npm run dev
   ```
3. Esperá a que diga "ready"
4. Volvé a ejecutar la prueba

### Error: "Ya existe una cuenta con ese email"

**Solución:**
Es normal si ya ejecutaste el registro antes.

Podés continuar con las pruebas de carga:
```powershell
npm run test:load:5
```

### El servidor dice "Address already in use"

**Solución:**
Ya hay un servidor corriendo en el puerto 3000.

1. Cerrá todas las terminales
2. Abrí el Administrador de tareas (Ctrl+Shift+Esc)
3. Buscá procesos "Node.js" y finalizalos
4. Volvé a ejecutar `npm run dev`

---

## 🧪 PRUEBAS ADICIONALES

### Crear 10 usuarios

```powershell
npm run test:register:10
```

### Probar con 10 usuarios

```powershell
npm run test:load:10
```

### Crear 20 usuarios

```powershell
npm run test:register:20
```

### Probar con 20 usuarios

```powershell
npm run test:load:20
```

---

## 🧹 LIMPIAR DESPUÉS DE LAS PRUEBAS

### Opción 1: Borrar usuarios de prueba

En Supabase Dashboard > SQL Editor:

```sql
-- Ver usuarios de prueba
SELECT * FROM alumnos WHERE email LIKE '%@loadtest.local';

-- Borrar usuarios de prueba
DELETE FROM alumnos WHERE email LIKE '%@loadtest.local';
```

### Opción 2: Dejar los usuarios

Si vas a hacer más pruebas, podés dejar los usuarios.

La próxima vez que ejecutes `npm run test:load:5` va a usar los mismos usuarios.

---

## ✅ RESUMEN - COMANDOS PARA COPIAR Y PEGAR

### PRIMERA VEZ (configuración)

```powershell
# Terminal 1
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
$env:NEXT_PUBLIC_SUPABASE_URL="https://xyz123.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc...tu-clave-aqui"
npm run dev
```

```powershell
# Terminal 2 (nueva terminal)
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
npm run test:register:5
npm run test:load:5
```

### PRÓXIMAS VECES (ya configurado)

```powershell
# Terminal 1
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
$env:NEXT_PUBLIC_SUPABASE_URL="https://xyz123.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc...tu-clave-aqui"
npm run dev
```

```powershell
# Terminal 2
cd C:\Users\meden\Desktop\MEMECOINS\Semana-talleres
npm run test:load:5
```

---

## ⚠️ RECORDATORIOS FINALES

1. ✅ La Terminal 1 (servidor) debe estar corriendo mientras hacés las pruebas
2. ✅ Verificá siempre que `.env.loadtest` apunte al Supabase de PRUEBA
3. ✅ Los usuarios ficticios deben tener `@loadtest.local` en el email
4. ✅ Monitoreá el Supabase de PRUEBA durante las pruebas
5. ❌ NO uses credenciales de producción
6. ❌ NO subas `.env.loadtest` a Git

---

**Última actualización:** 2026-09-10  
**Versión:** 2.0 - Simplificada (localhost + Supabase prueba)
