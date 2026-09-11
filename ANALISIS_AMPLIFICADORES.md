# 🔍 ANÁLISIS: Amplificadores de Requests Detectados

## Hallazgos Críticos

### ❌ PROBLEMA 1: Navbar - Múltiples Llamadas a cargarPerfil()

**Archivo**: `src/components/Navbar.tsx`

**Líneas problemáticas**:
- Línea 107-114: `onAuthStateChange` llama `cargarPerfil()` en SIGNED_OUT y SIGNED_IN
- Línea 118-121: Event listener `auth-changed` TAMBIÉN llama `cargarPerfil()`
- Línea 132: `handleLogout()` dispara `auth-changed` event

**Causa raíz**: Duplicación de handlers
```typescript
// SIGNED_OUT dispara:
1. onAuthStateChange → cargarPerfil()  [línea 110]
2. auth-changed event → cargarPerfil() [línea 119]

// SIGNED_IN dispara:
1. onAuthStateChange → cargarPerfil()  [línea 112]
2. auth-changed event → cargarPerfil() [línea 119]

RESULTADO: 2 llamadas a cargarPerfil() por cada evento de auth
= 4 requests duplicadas (2x auth.getUser + 2x alumnos)
```

**Amplificación en logout**:
```typescript
// handleLogout() línea 129-134:
1. supabase.auth.signOut() → dispara SIGNED_OUT event
2. window.dispatchEvent(new Event("auth-changed"))

Esto causa:
1. SIGNED_OUT → cargarPerfil() [línea 110]
2. auth-changed → cargarPerfil() [línea 119]

TOTAL: 2 cargarPerfil() = 2 auth.getUser() + potencial 2 alumnos query
```

---

### ✅ PROBLEMA 2: inscribirAction - revalidatePath Innecesario

**Archivo**: `src/app/catalogo/actions.ts`

**Línea 58**: `revalidatePath("/mi-itinerario")`

**Causa**: Aunque CatalogoClient hace optimistic update y NO hace router.refresh(), el `revalidatePath("/mi-itinerario")` invalida el cache de Next.js para esa ruta.

**Impacto**:
- Si el usuario navega a `/mi-itinerario` después de inscribirse, se hace fetch completo
- NO afecta `/catalogo` (correcto)
- Necesario SOLO para `/mi-itinerario`, así que está bien

**Conclusión**: NO es problema para el objetivo actual (optimizar /catalogo).

---

### ❌ PROBLEMA 3: desinscribirAction - Doble revalidatePath

**Archivo**: `src/app/catalogo/actions.ts`

**Líneas 88-89**:
```typescript
revalidatePath("/catalogo");
revalidatePath("/mi-itinerario");
```

**Causa**: Si un usuario se da de baja desde `/mi-itinerario`, invalida AMBAS rutas.

**Impacto**:
- Si luego navega a `/catalogo`, recarga completo
- Contradice la filosofía de optimistic update
- Potencial amplificador si hay muchas desinscripciones

**Solución**: Revisar si es necesario revalidar `/catalogo` aquí.

---

### ✅ PROBLEMA 4: LoginForm/RegistroForm - router.refresh()

**Archivos**: 
- `src/app/login/LoginForm.tsx:34`
- `src/app/registro/RegistroForm.tsx:28`

**Código**:
```typescript
window.dispatchEvent(new Event("auth-changed"));
router.refresh();
```

**Causa**: Después de login/registro exitoso, disparan AMBOS:
1. `auth-changed` event → Navbar cargarPerfil()
2. `router.refresh()` → Recarga TODA la ruta actual

**Impacto en flujo login → catalogo**:
```
1. Login exitoso en /login
2. auth-changed dispara → Navbar cargarPerfil() [2x requests]
3. router.refresh() → Recarga /login page
4. Redirect a /catalogo → Carga completa /catalogo [7x requests]

PERO: La recarga de /login es ANTES del redirect, así que no amplifica /catalogo
```

**Conclusión**: NO amplifica requests en /catalogo directamente.

---

### ⚠️ PROBLEMA 5: AuthRedirectHandler - onAuthStateChange Duplicado

**Archivo**: `src/components/AuthRedirectHandler.tsx:31`

**Código**:
```typescript
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    router.replace("/reset");
  }
});
```

**Causa**: Hay DOS suscripciones a `onAuthStateChange`:
1. Navbar.tsx (línea 107)
2. AuthRedirectHandler.tsx (línea 31)

**Impacto**: 
- Ambos componentes escuchan eventos de auth
- PASSWORD_RECOVERY solo afecta a AuthRedirectHandler
- SIGNED_IN/SIGNED_OUT afectan a Navbar

**Conclusión**: NO causa duplicación porque manejan eventos diferentes.

---

## 🎯 Causas Exactas de Requests Duplicadas

### En Mount de /catalogo (con initialAlumno):
✅ **CORRECTO**: 0 requests client-side adicionales
- Navbar recibe `initialAlumno` → skip cargarPerfil() en mount

### En Logout:
❌ **DUPLICADO**: 
```
handleLogout() dispara:
1. signOut() → SIGNED_OUT event → cargarPerfil() [2 requests]
2. auth-changed event → cargarPerfil() [2 requests]

TOTAL: 4 requests (2x auth.getUser + 2x alumnos o solo auth.getUser si no hay user)
```

### En Login desde LoginForm:
⚠️ **POTENCIAL DUPLICADO**:
```
1. auth-changed event → Navbar cargarPerfil() [2 requests]
2. SIGNED_IN event → Navbar cargarPerfil() [2 requests]

TOTAL: 4 requests
```

---

## 📊 Requests Estimadas: ANTES vs DESPUÉS

### Flujo: Login → Catálogo → Inscripción

#### **ANTES de correcciones**:
```
1. Login form submit:
   - POST /auth/v1/token           [1x] loginAction
   - auth-changed → cargarPerfil() [2x] auth.getUser + alumnos
   - router.refresh() /login       [0x] (no agrega requests de Supabase)

2. Redirect a /catalogo:
   - SSR: auth.getUser + alumnos   [2x] layout
   - SSR: talleres                 [1x]
   - SSR: categorias               [1x]
   - SSR: configuracion            [1x]
   - SSR: inscripciones            [1x]
   - SSR: contar_cupos_talleres    [1x]
   
   Client mount:
   - SIGNED_IN → cargarPerfil()    [2x] auth.getUser + alumnos (DUPLICADO)

TOTAL login → catalogo: 12 requests

3. Inscripción:
   - POST /rest/v1/inscripciones   [1x]
   - (optimistic update local, sin refetch)

TOTAL inscripción: 1 request

GRAN TOTAL: 13 requests
```

#### **DESPUÉS de correcciones**:
```
1. Login form submit:
   - POST /auth/v1/token           [1x] loginAction
   - auth-changed ELIMINADO        [0x]
   - router.refresh() eliminado    [0x]

2. Redirect a /catalogo:
   - SSR: auth.getUser + alumnos   [2x] layout (cached para page)
   - SSR: talleres                 [1x]
   - SSR: categorias               [1x]
   - SSR: configuracion            [1x]
   - SSR: inscripciones            [1x]
   - SSR: contar_cupos_talleres    [1x]
   
   Client mount:
   - SIGNED_IN → cargarPerfil() ÚNICO [2x] auth.getUser + alumnos
   - (sin duplicado de auth-changed)

TOTAL login → catalogo: 10 requests

3. Inscripción:
   - POST /rest/v1/inscripciones   [1x]
   - (optimistic update local, sin refetch)

TOTAL inscripción: 1 request

GRAN TOTAL: 11 requests (-15%)
```

---

## ✅ Confirmación: Post-Inscripción NO Refetch

**Después del POST /inscripciones, NO se vuelve a pedir**:
- ❌ talleres
- ❌ categorias  
- ❌ configuracion
- ❌ inscripciones
- ❌ contar_cupos_talleres

**Motivo**: 
- CatalogoClient hace optimistic update (línea 92-104)
- inscribirAction NO hace `revalidatePath("/catalogo")` (solo `/mi-itinerario`)
- NO hay `router.refresh()` en CatalogoClient

✅ **CORRECTO**: Solo hace POST, actualiza local, y termina.

---

## 🔧 Correcciones Necesarias

### 1. Navbar.tsx - Eliminar auth-changed Event Listener

**Motivo**: `onAuthStateChange` ya captura SIGNED_IN/SIGNED_OUT. El event listener `auth-changed` es redundante y causa duplicación.

### 2. LoginForm.tsx - Eliminar auth-changed Dispatch

**Motivo**: `signInWithPassword` dispara SIGNED_IN automáticamente. No hace falta custom event.

### 3. RegistroForm.tsx - Eliminar auth-changed Dispatch

**Motivo**: Después de registro, el usuario no está logueado automáticamente (debe hacer login manual).

### 4. Navbar.tsx handleLogout - Eliminar auth-changed Dispatch

**Motivo**: `signOut()` dispara SIGNED_OUT automáticamente.

### 5. LoginForm/RegistroForm - Eliminar router.refresh()

**Motivo**: No es necesario. El redirect a /catalogo cargará todo correctamente con SSR.

---

## 🎯 Resumen Ejecutivo

### Amplificadores identificados:
1. ✅ **Navbar**: `auth-changed` event duplica llamadas de `onAuthStateChange`
2. ✅ **LoginForm**: `auth-changed` + `router.refresh()` innecesarios
3. ✅ **RegistroForm**: `auth-changed` + `router.refresh()` innecesarios
4. ⚠️ **desinscribirAction**: `revalidatePath("/catalogo")` potencial problema menor

### Requests estimadas después de correcciones:
- Login → Catálogo: **10 requests** (antes: 12)
- Inscripción: **1 request** (sin cambios)
- **Reducción total: -15%**

### Inscripción exitosa NO refetch:
✅ Confirmado que solo hace POST + optimistic update local
