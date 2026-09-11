# ✅ CORRECCIONES COMPLETADAS: Eliminación de Amplificadores de Requests

## 📦 Archivos Modificados (4 archivos)

### 1. **src/components/Navbar.tsx**

**Cambios**:
- ❌ Eliminado: Event listener `auth-changed` (línea 118-121)
- ❌ Eliminado: `window.dispatchEvent(new Event("auth-changed"))` en handleLogout (línea 132)
- ✅ Conservado: `onAuthStateChange` para SIGNED_IN/SIGNED_OUT

**Diff resumido**:
```diff
  useEffect(() => {
    if (initialAlumno === undefined) {
      void cargarPerfil();
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAlumno(null);
        void cargarPerfil();
      } else if (event === "SIGNED_IN") {
        void cargarPerfil();
      }
    });

-   // Login/registro desde server actions: una sola recarga
-   const onAuthChanged = () => {
-     void cargarPerfil();
-   };
-   window.addEventListener("auth-changed", onAuthChanged);

    return () => {
      sub.subscription.unsubscribe();
-     window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [supabase, cargarPerfil, initialAlumno]);

  async function handleLogout() {
    setAlumno(null);
    await supabase.auth.signOut();
-   window.dispatchEvent(new Event("auth-changed"));
    router.push("/login");
  }
```

**Motivo**: `onAuthStateChange` ya captura SIGNED_IN/SIGNED_OUT automáticamente. El event listener `auth-changed` causaba duplicación: 2x `cargarPerfil()` = 4 requests extra.

---

### 2. **src/app/login/LoginForm.tsx**

**Cambios**:
- ❌ Eliminado: `window.dispatchEvent(new Event("auth-changed"))`
- ❌ Eliminado: `router.refresh()`

**Diff resumido**:
```diff
  useEffect(() => {
    if (state?.ok && state.redirectTo) {
-     window.dispatchEvent(new Event("auth-changed"));
-     router.refresh();
      router.push(state.redirectTo);
    }
  }, [state, router]);
```

**Motivo**: `signInWithPassword` en la server action dispara SIGNED_IN automáticamente en `onAuthStateChange`. No necesitamos custom event ni router.refresh().

---

### 3. **src/app/registro/RegistroForm.tsx**

**Cambios**:
- ❌ Eliminado: `window.dispatchEvent(new Event("auth-changed"))`
- ❌ Eliminado: `router.refresh()`

**Diff resumido**:
```diff
  useEffect(() => {
    if (state?.ok && state.redirectTo) {
-     window.dispatchEvent(new Event("auth-changed"));
-     router.refresh();
      router.push(state.redirectTo);
    }
  }, [state, router]);
```

**Motivo**: Después del registro, el usuario NO está logueado automáticamente, debe hacer login manual. No hay cambio de sesión que notificar.

---

### 4. **src/app/catalogo/actions.ts**

**Cambios**:
- ✅ Clarificado comentario en `inscribirAction` (línea 57-59)
- ✅ Clarificado comentario en `desinscribirAction` (línea 87-92)

**Diff resumido**:
```diff
  // inscribirAction
- // Revalidar solo /mi-itinerario, no /catalogo (el catálogo ya no hace refresh)
+ // Revalidar solo /mi-itinerario para que muestre la inscripción nueva.
+ // NO revalidamos /catalogo porque CatalogoClient hace optimistic update local
+ // y no necesita refetch del servidor.
  revalidatePath("/mi-itinerario");

  // desinscribirAction
+ // Revalidar ambas rutas porque la desinscripción debe reflejarse en:
+ // - /mi-itinerario: para actualizar la lista de inscripciones
+ // - /catalogo: para liberar el cupo y permitir que se inscriba de nuevo
+ // Nota: esto NO causa refetch en /catalogo si el usuario está ahí,
+ // solo invalida el cache para la próxima navegación.
  revalidatePath("/catalogo");
  revalidatePath("/mi-itinerario");
```

**Motivo**: Documentación para claridad. `desinscribirAction` necesita ambos revalidatePath porque afecta cupos. `inscribirAction` solo necesita `/mi-itinerario` porque CatalogoClient hace optimistic update.

---

## 📊 Requests Estimadas: ANTES vs DESPUÉS

### Flujo Completo: Login → Catálogo → Inscripción

#### **ANTES de correcciones**:
```
1. Login form submit:
   POST /auth/v1/token                [1x] loginAction
   
2. LoginForm useEffect (después de loginAction):
   auth-changed event → Navbar        [2x] auth.getUser + alumnos
   router.refresh() /login            [0x] no agrega requests Supabase

3. router.push("/catalogo"):
   SIGNED_IN event → Navbar           [2x] auth.getUser + alumnos (DUPLICADO)
   
4. SSR /catalogo:
   layout: auth.getUser               [1x]
   layout: alumnos                    [1x]
   page: talleres                     [1x]
   page: categorias                   [1x]
   page: configuracion                [1x]
   page: inscripciones                [1x]
   page: contar_cupos_talleres        [1x]

TOTAL Login → Catálogo: 12 requests
   - 1 login
   - 4 client-side duplicados (2x auth-changed + 2x SIGNED_IN)
   - 7 SSR

5. Inscripción:
   POST /rest/v1/inscripciones        [1x]
   (optimistic update local, sin refetch)

TOTAL Inscripción: 1 request

GRAN TOTAL: 13 requests
```

#### **DESPUÉS de correcciones**:
```
1. Login form submit:
   POST /auth/v1/token                [1x] loginAction
   
2. LoginForm useEffect (después de loginAction):
   router.push("/catalogo")           [0x] solo navegación
   
3. router.push("/catalogo"):
   SIGNED_IN event → Navbar           [2x] auth.getUser + alumnos (ÚNICO)
   
4. SSR /catalogo:
   layout: auth.getUser               [1x] (cached con #3)
   layout: alumnos                    [1x] (cached con #3)
   page: talleres                     [1x]
   page: categorias                   [1x]
   page: configuracion                [1x]
   page: inscripciones                [1x]
   page: contar_cupos_talleres        [1x]

TOTAL Login → Catálogo: 9 requests
   - 1 login
   - 2 client-side (SIGNED_IN, sin duplicado)
   - 7 SSR (pero 2 primeros usan cache de #3)

Desglose real:
   - POST /auth/v1/token              [1x]
   - Client SIGNED_IN:
     - auth.getUser                   [1x]
     - alumnos                        [1x]
   - SSR (usa cache para getUser+alumnos):
     - talleres                       [1x]
     - categorias                     [1x]
     - configuracion                  [1x]
     - inscripciones                  [1x]
     - contar_cupos_talleres          [1x]

TOTAL Real: 8 requests únicos

5. Inscripción:
   POST /rest/v1/inscripciones        [1x]
   (optimistic update local, sin refetch)

TOTAL Inscripción: 1 request

GRAN TOTAL: 9 requests (-31% reducción)
```

---

## ✅ Confirmación: Post-Inscripción NO Refetch

**Después del POST /inscripciones, NO se vuelve a pedir**:
- ❌ talleres
- ❌ categorias
- ❌ configuracion
- ❌ inscripciones
- ❌ contar_cupos_talleres

**Verificación en código**:

1. **CatalogoClient.tsx línea 83-115**: 
   ```typescript
   const handleInscribir = useCallback(async (tallerId: string) => {
     setProcesando((p) => new Set(p).add(tallerId));
     try {
       const res = await inscribirAction(tallerId);
       setResultados((r) => ({ ...r, [tallerId]: res }));
       if (res.ok) {
         // Actualización optimista local: marcamos el taller como inscripto
         setInscripciones((prev) => {
           if (prev.some((i) => i.taller_id === tallerId)) return prev;
           return [...prev, { /* nueva inscripcion */ }];
         });
       }
     } finally {
       setProcesando(/* ... */);
     }
   }, [alumnoId]);
   ```
   ✅ Solo actualiza estado local, NO hace refetch.

2. **actions.ts línea 58**:
   ```typescript
   revalidatePath("/mi-itinerario");
   // NO hay revalidatePath("/catalogo")
   ```
   ✅ Solo invalida `/mi-itinerario`, NO `/catalogo`.

3. **CatalogoClient.tsx líneas 51-52**:
   ```typescript
   // No se hace router.refresh() para evitar recargar todo el
   // catálogo (talleres, categorías, config, cupos) innecesariamente.
   ```
   ✅ Documentación confirma: NO hay router.refresh().

**CONFIRMADO**: Inscripción hace SOLO 1 request (POST), actualiza UI localmente, y termina.

---

## 🎯 Causas Exactas Corregidas

### 1. ✅ Navbar - Event Listener `auth-changed` Duplicado
**Antes**: `onAuthStateChange` + `auth-changed` listener = 2x `cargarPerfil()`  
**Después**: Solo `onAuthStateChange` = 1x `cargarPerfil()`  
**Reducción**: -2 requests por evento de auth

### 2. ✅ LoginForm - Custom Event + router.refresh() Innecesarios
**Antes**: `auth-changed` dispatch + `router.refresh()`  
**Después**: Solo `router.push()`, `SIGNED_IN` maneja la actualización  
**Reducción**: -2 requests (eliminado `auth-changed` → `cargarPerfil()`)

### 3. ✅ RegistroForm - Custom Event + router.refresh() Innecesarios
**Antes**: `auth-changed` dispatch + `router.refresh()` (aunque no hay sesión)  
**Después**: Solo `router.push()`  
**Reducción**: Sin impacto (usuario no logueado)

### 4. ✅ handleLogout - Custom Event Innecesario
**Antes**: `signOut()` + `auth-changed` dispatch = 2x `cargarPerfil()`  
**Después**: Solo `signOut()` dispara `SIGNED_OUT` = 1x `cargarPerfil()`  
**Reducción**: -2 requests en logout

---

## 📈 Resumen de Optimización

| Métrica | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| **Login → Catálogo** | 12 requests | 8 requests | **-33%** |
| **Inscripción** | 1 request | 1 request | 0% |
| **Logout** | 4 requests | 2 requests | **-50%** |
| **TOTAL Flujo Completo** | 13 requests | 9 requests | **-31%** |

---

## 🧪 Testing Recomendado

### 1. Login → Catálogo
```
1. Abrir DevTools Network → Filter "supabase.co"
2. Login con usuario de prueba
3. Verificar: 8 requests únicos total
   - 1x POST /auth/v1/token
   - 1x GET /auth/v1/user (client SIGNED_IN)
   - 1x GET /rest/v1/alumnos (client SIGNED_IN)
   - 5x SSR /catalogo (talleres, categorias, config, inscripciones, RPC)
```

### 2. Inscripción
```
1. En /catalogo, click "Inscribirme"
2. Confirmar dialog
3. Verificar: SOLO 1 request POST /rest/v1/inscripciones
4. Confirmar: Botón cambia a "✓ Inscripto" inmediatamente
5. Confirmar: NO hay requests adicionales
```

### 3. Logout
```
1. Click "Salir"
2. Verificar: 2 requests total
   - 1x POST /auth/v1/logout
   - 1x GET /auth/v1/user (SIGNED_OUT → cargarPerfil verifica sesión)
```

---

## ✅ Estado Final

```
✅ Navbar: Eliminado auth-changed listener duplicado
✅ LoginForm: Eliminado auth-changed dispatch y router.refresh()
✅ RegistroForm: Eliminado auth-changed dispatch y router.refresh()
✅ handleLogout: Eliminado auth-changed dispatch
✅ CatalogoClient: Ya optimizado (sin router.refresh)
✅ inscribirAction: Ya optimizado (sin revalidatePath catalogo)
✅ Código limpio y documentado
❌ NO committed (esperando aprobación)
```

**Listo para testing manual y deploy.**
