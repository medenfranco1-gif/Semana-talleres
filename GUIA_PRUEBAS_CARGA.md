# 📋 GUÍA DE PRUEBAS DE CARGA - SEMANA DE TALLERES

## ⚠️ IMPORTANTE - LEER ANTES DE EMPEZAR

Esta guía está diseñada para personas **SIN conocimientos de programación**.

Todo es **copiar y pegar** los comandos exactos.

**NUNCA ejecutes estas pruebas contra producción** sin autorización explícita.

---

## 🎯 ¿QUÉ HACE ESTA PRUEBA?

Esta herramienta simula muchos alumnos inscribiéndose al mismo tiempo para verificar que el sistema puede manejar la carga sin caerse.

**Tiene 2 etapas:**
1. **Registro:** Crea cuentas de prueba ficticias
2. **Carga:** Simula alumnos iniciando sesión e inscribiéndose

---

## 📦 INSTALACIÓN (SOLO UNA VEZ)

### Paso 1: Instalar dependencias

Abrí la terminal en la carpeta del proyecto y ejecutá:

```bash
npm install
```

Esperá a que termine (puede tardar 2-3 minutos).

### Paso 2: Instalar navegadores de Playwright

```bash
npx playwright install chromium
```

Esto descarga el navegador para las pruebas.

---

## 🔧 PREPARACIÓN

### Paso 1: Crear archivo de usuarios

Copiá el archivo de ejemplo:

```bash
cp tests/load/register-users.example.json tests/load/register-users.json
```

**En Windows (si el comando anterior no funciona):**

1. Abrí la carpeta `tests/load/`
2. Copiá el archivo `register-users.example.json`
3. Pegalo en la misma carpeta
4. Renombralo a `register-users.json`

### Paso 2: Verificar el archivo

Abrí `tests/load/register-users.json` y verificá que tiene usuarios de prueba.

**IMPORTANTE:**
- ✅ Todos los emails deben terminar en `@loadtest.local` (claramente ficticios)
- ✅ Todos los DNIs deben empezar con `9000000X` (claramente ficticios)
- ✅ Los nombres deben decir "Test Alumno"
- ❌ NO usar emails reales (@gmail.com, @hotmail.com, etc.)
- ❌ NO usar DNIs reales de alumnos

---

## 🚀 ETAPA 1: REGISTRO DE USUARIOS

### Paso 1: Configurar la URL

**Para Preview de Vercel:**

```bash
export BASE_URL=https://tu-preview-abc123.vercel.app
```

Reemplazá `tu-preview-abc123` con tu URL real de preview.

**En Windows (PowerShell):**

```powershell
$env:BASE_URL="https://tu-preview-abc123.vercel.app"
```

### Paso 2: Crear 5 usuarios de prueba

```bash
npm run test:register:5
```

Vas a ver algo así:

```
🔧 REGISTRO DE USUARIOS DE PRUEBA
==================================================
URL:      https://preview-abc123.vercel.app
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
📝 Total:           5
==================================================
```

### Paso 3 (opcional): Crear más usuarios

Para 10 usuarios:
```bash
npm run test:register:10
```

Para 20 usuarios:
```bash
npm run test:register:20
```

### ⚠️ Si aparece "Ya existe una cuenta"

Es normal si ya ejecutaste el registro antes. Los usuarios ya están creados.

Podés continuar con la Etapa 2.

---

## 🎯 ETAPA 2: PRUEBA DE CARGA

### Paso 1: Configurar variables de entorno

```bash
export BASE_URL=https://tu-preview-abc123.vercel.app
export TALLER_NOMBRE="Cocina"
```

**En Windows (PowerShell):**

```powershell
$env:BASE_URL="https://tu-preview-abc123.vercel.app"
$env:TALLER_NOMBRE="Cocina"
```

**IMPORTANTE:** Reemplazá `"Cocina"` con el nombre exacto de un taller que exista en tu catálogo.

### Paso 2: Ejecutar prueba con 5 usuarios

```bash
npm run test:load:5
```

La prueba va a ejecutarse y mostrar el progreso.

**Esto va a tardar aproximadamente 1-2 minutos.**

### Paso 3: Ver resultados

Al terminar vas a ver un resumen como este:

```
======================================================================
📊 RESUMEN DE PRUEBA DE CARGA
======================================================================
URL:               https://preview-abc123.vercel.app
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

💾 Resultados guardados en: tests/load/resultados-1726012345678.json
```

### Interpretación de resultados:

**✅ TODO BIEN si:**
- Login OK = cantidad de usuarios
- Catálogo OK = cantidad de usuarios
- Inscripciones exitosas ≥ cantidad esperada
- Errores técnicos = 0
- Errores 5xx = 0
- Tiempos promedio < 2000ms

**⚠️ REVISAR si:**
- Hay "Rechazos de negocio" (puede ser normal si el taller se llenó)
- Tiempos promedio > 2000ms
- Algunos usuarios no pudieron hacer login

**❌ PROBLEMA si:**
- Errores técnicos > 0
- Errores 5xx > 0
- Login OK < cantidad de usuarios

### Paso 4 (opcional): Probar con más usuarios

Para 10 usuarios:
```bash
npm run test:load:10
```

Para 20 usuarios:
```bash
npm run test:load:20
```

---

## 🛑 CÓMO DETENER UNA PRUEBA

Si necesitás detener la prueba mientras está corriendo:

**En Mac/Linux:**
Presioná `Ctrl + C`

**En Windows:**
Presioná `Ctrl + C`

---

## 📊 MONITOREO EN SUPABASE

Mientras ejecutás las pruebas, abrí **Supabase Dashboard** en otra pestaña:

1. Ir a: https://supabase.com/dashboard
2. Seleccionar tu proyecto
3. Ir a: **Reports**
4. Mirar:
   - **API Requests** (debe mantenerse estable)
   - **Database Size** (no debe cambiar mucho)
   - **Auth Users** (debe aumentar al crear usuarios)

---

## 🔍 OPCIONES AVANZADAS

### Elegir un taller específico por nombre

```bash
export TALLER_NOMBRE="Cocina Internacional"
npm run test:load:5
```

### Cambiar la cantidad de usuarios simultáneos

```bash
export CONCURRENCY=15
npm run test:load:custom
```

---

## ⚠️ PROTECCIÓN CONTRA PRODUCCIÓN

Las pruebas tienen protección automática contra producción.

Si intentás ejecutar contra producción, verás:

```
❌ PROTECCIÓN ACTIVADA

   Estás intentando ejecutar pruebas contra PRODUCCIÓN:
   https://semana-talleres.vercel.app

   Esto puede afectar usuarios reales.

   Si realmente querés hacer esto, ejecutá:
   ALLOW_PRODUCTION_LOAD_TEST=true npm run test:load:5
```

**NO ejecutes contra producción sin autorización explícita del responsable del sistema.**

---

## ❌ COSAS QUE NO DEBES HACER

1. ❌ **NO** ejecutar contra producción sin autorización
2. ❌ **NO** usar emails reales (@gmail.com, @hotmail.com, etc.)
3. ❌ **NO** usar DNIs reales de alumnos
4. ❌ **NO** modificar el código de producción
5. ❌ **NO** borrar usuarios existentes
6. ❌ **NO** ejecutar pruebas de 50+ usuarios sin autorización
7. ❌ **NO** subir `register-users.json` a Git (tiene contraseñas)
8. ❌ **NO** compartir las contraseñas de los usuarios de prueba

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### Error: "BASE_URL no definida"

**Solución:**
```bash
export BASE_URL=https://tu-preview.vercel.app
```

### Error: "No existe register-users.json"

**Solución:**
```bash
cp tests/load/register-users.example.json tests/load/register-users.json
```

### Error: "playwright: command not found"

**Solución:**
```bash
npm install
npx playwright install chromium
```

### Error: "Ya existe una cuenta con ese email"

**Solución:**

Es normal si ya registraste antes. Podés:

1. Continuar con las pruebas de carga (los usuarios ya están creados)
2. O crear más usuarios editando `register-users.json` con nuevos emails

### Error: "Timeout" durante las pruebas

**Posibles causas:**
- La aplicación está muy lenta
- Hay problemas de red
- Supabase está saturado

**Solución:**
- Esperá unos minutos y volvé a intentar
- Revisá Supabase Dashboard para ver si hay problemas

---

## 📞 SOPORTE

Si algo no funciona:

1. **Leé el mensaje de error completo**
2. **Buscá en esta guía** (probablemente esté explicado)
3. **Copiá el error exacto** y consultá con el desarrollador

---

## 📝 RESUMEN DE COMANDOS PRINCIPALES

### Registro de usuarios:
```bash
export BASE_URL=https://preview-abc123.vercel.app
npm run test:register:5
```

### Prueba de carga:
```bash
export BASE_URL=https://preview-abc123.vercel.app
export TALLER_NOMBRE="Cocina"
npm run test:load:5
```

### Para Windows (PowerShell):
```powershell
$env:BASE_URL="https://preview-abc123.vercel.app"
$env:TALLER_NOMBRE="Cocina"
npm run test:load:5
```

---

## ✅ CHECKLIST ANTES DE EJECUTAR

- [ ] Tengo instalado Node.js
- [ ] Ejecuté `npm install`
- [ ] Ejecuté `npx playwright install chromium`
- [ ] Copié `register-users.example.json` a `register-users.json`
- [ ] Los usuarios tienen emails ficticios (@loadtest.local)
- [ ] Configuré `BASE_URL` con la URL de preview (NO producción)
- [ ] Configuré `TALLER_NOMBRE` con un taller que existe
- [ ] Tengo abierto Supabase Dashboard en otra pestaña

---

**Última actualización:** 2026-09-10
