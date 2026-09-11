# INFORME DE OPTIMIZACIÓN - SEMANA DE TALLERES

**Fecha:** 2026-09-10  
**Problema:** Timeouts masivos (504, 522, 503) en Supabase durante inscripción simultánea de ~364 alumnos  
**Objetivo:** Parche mínimo para reducir carga en Supabase sin modificar arquitectura ni lógica de negocio

---

## A. DIAGNÓSTICO ENCONTRADO EN EL CÓDIGO

### Llamadas por carga de catálogo (ANTES)

**Cada vez que un alumno carga `/catalogo`:**
1. `getAlumnoActual()` → 1 llamada `getUser()` a Supabase Auth
2. `Promise.all` con 4 queries simultáneas:
   - `talleres` → SELECT con orden (activos + inactivos)
   - `categorias` → SELECT con filtro activa=true
   - `configuracion` → SELECT single fila id=1
   - `inscripciones` → SELECT del alumno
3. **Conteo de cupos INEFICIENTE:**
   - `SELECT taller_id FROM inscripciones WHERE taller_id IN (...)` 
   - Descarga TODAS las filas de inscripciones de todos los talleres
   - Las cuenta en JavaScript cliente por cliente
   - Con 50 talleres × 20 inscripciones promedio = **1000 filas transferidas por alumno**

**Total:** ~6 llamadas a Supabase por carga de catálogo

---

### Llamadas por inscripción (ANTES)

**Cada vez que un alumno se inscribe a un taller:**
1. `getAlumnoActual()` → 1 llamada `getUser()` a Supabase Auth
2. **SELECT redundante:** verifica si ya está inscripto (duplica constraint UNIQUE de la BD)
3. `INSERT` de la inscripción (trigger valida todo en PostgreSQL)
4. `revalidatePath("/catalogo")` + `revalidatePath("/mi-itinerario")`
5. **`router.refresh()`** en el cliente → re-renderiza el Server Component completo
   - Vuelve a ejecutar **TODO el flujo de carga de catálogo** (6 llamadas más)

**Total por inscripción exitosa:** ~9 llamadas (3 de la acción + 6 del refresh)

**Con 364 alumnos inscribiéndose simultáneamente:**
- **364 × 9 = 3,276 requests** solo por inscripciones
- Más las cargas iniciales del catálogo
- **Resultado:** saturación masiva de Supabase (504, 522, 503)

---

### Llamadas por inscripción (DESPUÉS)

**Cada vez que un alumno se inscribe a un taller:**
1. `getAlumnoActual()` → 1 llamada `getUser()` a Supabase Auth
2. ~~SELECT redundante~~ **ELIMINADO**
3. `INSERT` directo (maneja unique violation traduciendo el error)
4. `revalidatePath("/mi-itinerario")` solamente
5. ~~`router.refresh()`~~ **ELIMINADO** → actualización optimista del estado local

**Total por inscripción exitosa:** ~2 llamadas (Auth + INSERT)

**Con 364 alumnos inscribiéndose simultáneamente:**
- **364 × 2 = 728 requests** (reducción del **78%**)

---

### Llamadas por carga de catálogo (DESPUÉS)

**Cada vez que un alumno carga `/catalogo`:**
1. `getAlumnoActual()` → 1 llamada `getUser()` a Supabase Auth
2. `Promise.all` con 4 queries simultáneas (igual que antes)
3. **Conteo de cupos OPTIMIZADO:**
   - `RPC contar_cupos_talleres(array_de_ids)` → 1 llamada
   - PostgreSQL hace el `GROUP BY` y devuelve solo los agregados
   - Con 50 talleres = **50 filas transferidas** en lugar de 1000
   - **Reducción del 95% en transferencia de datos para conteo**

**Total:** ~6 llamadas a Supabase (igual cantidad, pero con 95% menos datos en conteo)

---

## B. ARCHIVOS MODIFICADOS

1. **supabase/schema.sql**
   - Nueva función RPC `contar_cupos_talleres(uuid[])` para conteo agregado
   - `SECURITY DEFINER` con `search_path = public` (segura)
   - `GRANT EXECUTE` a usuarios autenticados

2. **src/lib/database-types.ts**
   - Agregados tipos TypeScript para la función RPC
   - Incluye `contar_cupos_talleres` y `asignar_talleres_pendientes`

3. **src/app/catalogo/page.tsx**
   - Reemplazado conteo manual por llamada a RPC agregada
   - Reducción de transferencia de datos en ~95%

4. **src/app/catalogo/CatalogoClient.tsx**
   - **ELIMINADO** `import { useRouter }`
   - **ELIMINADO** `router.refresh()` después de inscripción exitosa
   - Actualización optimista del estado local solamente
   - Comentarios actualizados explicando el cambio

5. **src/app/catalogo/actions.ts**
   - **ELIMINADO** SELECT previo para verificar duplicados
   - INSERT directo con manejo de unique violation (código 23505)
   - **ELIMINADO** `revalidatePath("/catalogo")`
   - **AGREGADO** logging mínimo temporal con timestamps (sin datos sensibles)
   - Logging de intentos sin auth, duplicados, errores y éxitos con duración

6. **.eslintrc.json** (nuevo)
   - Configuración básica de ESLint para Next.js

---

## C. CAMBIOS REALIZADOS

### 1. ✅ Eliminado `router.refresh()` después de inscripción exitosa

**Antes:**
```typescript
if (res.ok) {
  router.refresh(); // Re-renderiza todo el Server Component
  setInscripciones(...); // Actualización optimista
}
```

**Después:**
```typescript
if (res.ok) {
  setInscripciones(...); // Solo actualización optimista local
  // Ya no se refresca todo el catálogo
}
```

**Impacto:** Reduce ~6 llamadas por inscripción (eliminando el re-fetch completo del catálogo).

---

### 2. ✅ Eliminado SELECT redundante antes del INSERT

**Antes:**
```typescript
const { data: existente } = await supabase
  .from("inscripciones")
  .select("id")
  .eq("alumno_id", alumno.id)
  .eq("taller_id", tallerId)
  .maybeSingle();

if (existente) return { ok: false, mensaje: "Ya estás inscripto" };

const { error } = await supabase.from("inscripciones").insert(...);
```

**Después:**
```typescript
const { error } = await supabase.from("inscripciones").insert(...);

if (error) {
  if (error.code === "23505" || error.message.includes("duplicate")) {
    return { ok: false, mensaje: "Ya estás inscripto en este taller." };
  }
  // ... otros errores
}
```

**Impacto:** Reduce 1 llamada SELECT por inscripción. La constraint `UNIQUE (alumno_id, taller_id)` de PostgreSQL ya protege contra duplicados.

---

### 3. ✅ Optimizado conteo de cupos con función RPC agregada

**Antes (JavaScript):**
```typescript
const { data: counts } = await supabase
  .from("inscripciones")
  .select("taller_id")
  .in("taller_id", tallerIds); // Descarga TODAS las filas

cuposMap = counts.reduce((acc, row) => {
  acc[row.taller_id] = (acc[row.taller_id] ?? 0) + 1; // Cuenta en JS
  return acc;
}, {});
```

**Después (PostgreSQL agregado):**
```sql
-- En schema.sql
CREATE FUNCTION contar_cupos_talleres(p_taller_ids uuid[])
RETURNS TABLE(taller_id uuid, cantidad bigint)
AS $$
  SELECT i.taller_id, count(*) as cantidad
  FROM inscripciones i
  WHERE i.taller_id = ANY(p_taller_ids)
  GROUP BY i.taller_id;
$$;
```

```typescript
// En page.tsx
const { data: counts } = await supabase.rpc("contar_cupos_talleres", {
  p_taller_ids: tallerIds,
});

cuposMap = counts.reduce((acc, row) => {
  acc[row.taller_id] = row.cantidad; // Ya viene agregado
  return acc;
}, {});
```

**Impacto:** Reduce transferencia de datos en ~95% (de ~1000 filas a ~50 filas).

---

### 4. ✅ Eliminado `revalidatePath("/catalogo")`

**Antes:**
```typescript
revalidatePath("/catalogo");
revalidatePath("/mi-itinerario");
```

**Después:**
```typescript
revalidatePath("/mi-itinerario"); // Solo itinerario
```

**Impacto:** No invalida cache del catálogo innecesariamente (ya no hay refresh).

---

### 5. ✅ Agregado logging temporal para instrumentación

```typescript
const startTime = Date.now();
// ... lógica de inscripción
const duration = Date.now() - startTime;

console.log(`[inscripcion] ok - alumno=${alumno.id.slice(0,8)} taller=${tallerId.slice(0,8)} duracion=${duration}ms`);
```

**Logs añadidos:**
- `[inscripcion] intento sin auth` → intento sin autenticación
- `[inscripcion] duplicado` → unique violation (alumno + taller + duración)
- `[inscripcion] error` → otros errores (primeros 100 chars + duración)
- `[inscripcion] ok` → inscripción exitosa (alumno + taller + duración)

**Seguridad:** Solo primeros 8 caracteres de UUIDs, sin tokens ni datos sensibles.

---

### 6. ✅ Protección contra doble clic

**Ya existente en el código:**
```typescript
const [procesando, setProcesando] = useState<Set<string>>(new Set());

// En handleInscribir
setProcesando((p) => new Set(p).add(tallerId));
// ... await inscribirAction
setProcesando((p) => { const n = new Set(p); n.delete(tallerId); return n; });

// En el botón
<button disabled={procesando} />
```

**Verificado:** El botón ya se desactiva por taller mientras la petición está pendiente. ✅

---

## D. CAMBIOS NO REALIZADOS Y POR QUÉ

### 1. ❌ NO se movió lógica de validación del trigger a frontend

**Razón:** La validación en PostgreSQL con `FOR UPDATE` es la autoridad final y garantiza integridad bajo concurrencia. Moverla al frontend sería:
- Menos seguro (bypasseable)
- Más propenso a race conditions
- Contrario al objetivo de "no debilitar reglas de negocio"

---

### 2. ❌ NO se implementó caching agresivo de datos globales

**Razón:** 
- `configuracion` puede cambiar para abrir/cerrar inscripciones urgentemente
- Cache podría bloquear cambios críticos de configuración
- Riesgo > beneficio para un parche mínimo
- **Recomendación:** considerar cache con TTL de 30-60 segundos en una fase posterior

---

### 3. ❌ NO se agregó Supabase Realtime

**Razón:** 
- El plan gratuito limita conexiones Realtime
- Con 500 alumnos simultáneos, se agotarían las conexiones
- El snapshot inicial + actualización optimista es suficiente
- PostgreSQL sigue siendo la fuente de verdad

---

### 4. ❌ NO se cambió arquitectura de autenticación

**Razón:**
- `getUser()` en Server Components es necesario para seguridad
- Eliminar verificaciones reduciría seguridad
- Solo se eliminaron duplicaciones (router.refresh)

---

### 5. ❌ NO se tocó el trigger `validar_inscripcion`

**Razón:**
- Funciona correctamente con `FOR UPDATE` (serialización)
- Protege contra race conditions de cupo
- Es la garantía de integridad bajo concurrencia
- Modificarlo violaría el objetivo de "no tocar lógica de negocio"

---

## E. RIESGOS QUE QUEDAN

### 1. ⚠️ Cupos mostrados pueden quedar desactualizados en cliente

**Descripción:** Tras una inscripción exitosa, el alumno ve su botón cambiar a "✓ Inscripto", pero los cupos de otros talleres no se actualizan hasta que recargue manualmente la página.

**Mitigación:**
- El trigger de PostgreSQL SIEMPRE valida el cupo real con `FOR UPDATE`
- Si un taller muestra "5 lugares" pero se llenó, el INSERT falla con mensaje claro: "El taller alcanzó el cupo máximo"
- La UI ya aclara: "Los cupos mostrados son aproximados y se confirman recién al presionar Inscribirme"

**Impacto:** UX levemente degradada, pero integridad garantizada.

---

### 2. ⚠️ Función RPC `SECURITY DEFINER` requiere revisión de permisos

**Descripción:** La función `contar_cupos_talleres` usa `SECURITY DEFINER` para ejecutarse con permisos del creador (owner de la BD), no del invocador.

**Mitigación implementada:**
- `SET search_path = public` previene SQL injection
- Solo expone `taller_id` y `cantidad` (no datos personales)
- `GRANT EXECUTE ... TO authenticated` limita acceso a usuarios autenticados
- La función es de solo lectura (no modifica datos)

**Recomendación:** En auditoría de seguridad, revisar que el owner de la función sea el correcto.

---

### 3. ⚠️ Pico simultáneo extremo (>500 alumnos) puede seguir causando presión

**Descripción:** Con >500 alumnos simultáneos, Supabase puede seguir experimentando presión de memoria/swap aunque con menos requests.

**Mitigación:**
- Reducción del 78% en requests por inscripción (de 9 a 2)
- Reducción del 95% en transferencia de datos para conteo de cupos
- Límite de timeout de 8 segundos implementado en `fetchWithTimeout`

**Recomendación:** Si el problema persiste, considerar:
- Upgrade del plan de Supabase
- Implementar rate limiting por alumno (max 1 inscripción cada 2-3 segundos)
- Cola de inscripciones con workers

---

### 4. ⚠️ Logging temporal puede llenar logs en producción

**Descripción:** Cada inscripción genera 1 línea de log. Con 364 alumnos × múltiples intentos, esto puede acumular logs.

**Mitigación:** 
- Logs son concisos (~100 chars por línea)
- Solo incluyen timestamps y primeros 8 chars de UUIDs
- No incluyen datos sensibles

**Recomendación:** Después de 1-2 semanas de medición, reducir o eliminar el logging.

---

## F. CÓMO DESPLEGAR

### 1. Aplicar la migración de base de datos

**Opción A: Supabase Dashboard (recomendado para primera vez)**

```sql
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query

-- 1. Crear la función RPC agregada
CREATE OR REPLACE FUNCTION public.contar_cupos_talleres(p_taller_ids uuid[])
RETURNS TABLE(taller_id uuid, cantidad bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.taller_id, count(*) as cantidad
  FROM public.inscripciones i
  WHERE i.taller_id = ANY(p_taller_ids)
  GROUP BY i.taller_id;
$$;

COMMENT ON FUNCTION public.contar_cupos_talleres(uuid[]) IS
  'Devuelve el conteo de inscripciones por taller para una lista de IDs. Optimización del catálogo para evitar transferir miles de filas.';

-- 2. Dar permisos a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.contar_cupos_talleres(uuid[]) TO authenticated;
```

**Opción B: Supabase CLI (si ya lo usás)**

```bash
# El schema.sql ya tiene la función incluida
supabase db push
```

**Verificación:**
```sql
-- Probar la función manualmente
SELECT * FROM contar_cupos_talleres(
  ARRAY(SELECT id FROM talleres LIMIT 5)
);
-- Debería devolver taller_id + cantidad para cada taller con inscripciones
```

---

### 2. Desplegar el código en Vercel

**Paso 1: Commit y push (desde tu máquina)**

```bash
# Ver cambios
git status
git diff

# Commit
git add .
git commit -m "Optimización: reducir carga en Supabase durante inscripciones masivas

- Eliminado router.refresh() después de inscripción (reduce 6 requests)
- Eliminado SELECT redundante antes de INSERT (reduce 1 request)
- Optimizado conteo de cupos con RPC agregada (reduce 95% transferencia)
- Eliminado revalidatePath innecesario
- Agregado logging temporal para instrumentación

Reduce requests por inscripción de 9 a 2 (78% menos)
Reduce transferencia de datos en conteo de cupos en 95%"

# Push
git push origin main
```

**Paso 2: Verificar deploy en Vercel**

1. Vercel detecta el push y comienza el build automáticamente
2. Revisar logs del build en dashboard de Vercel
3. Verificar que el deploy termine exitosamente
4. **No promover a producción todavía** (probar primero en preview)

---

### 3. Probar en ambiente de preview

**Antes de promover a producción:**

1. Obtener URL de preview de Vercel (ej: `semana-talleres-abc123.vercel.app`)
2. Ejecutar el plan de prueba (sección G) en preview
3. Verificar logs de Supabase durante las pruebas
4. Si todo funciona correctamente, promover a producción

**Promover a producción:**
```bash
# En dashboard de Vercel: "Promote to Production"
# O hacer merge a rama main si usás un flujo diferente
```

---

### 4. Monitorear después del deploy

**Verificar en Supabase Dashboard > Reports:**
- Cantidad de requests por minuto (debería bajar ~78%)
- Uso de memoria/swap (debería reducirse)
- Errores 504/522/503 (deberían desaparecer o reducirse drásticamente)

**Verificar logs de aplicación:**
```bash
# En Vercel > Logs o en consola de navegador del servidor
grep "\[inscripcion\]" # Ver timing de inscripciones
```

---

### 5. Rollback de emergencia (si algo falla)

**Si aparecen problemas críticos:**

```bash
# Opción 1: Revert del commit
git revert HEAD
git push origin main

# Opción 2: Rollback en Vercel Dashboard
# Ir a "Deployments" > seleccionar deploy anterior > "Promote to Production"
```

**Si la función RPC causa problemas:**
```sql
-- En Supabase Dashboard > SQL Editor
DROP FUNCTION IF EXISTS public.contar_cupos_talleres(uuid[]);
```

Después hacer el rollback de código.

---

## G. PLAN DE PRUEBA DESPUÉS DE DESPLEGAR

### Fase 1: Pruebas funcionales (1 usuario)

**Objetivo:** Verificar que toda la funcionalidad sigue funcionando correctamente.

#### Test 1: Login y carga de catálogo
```
1. Abrir navegador en modo incógnito
2. Ir a /login
3. Ingresar credenciales de alumno de prueba
4. Verificar redirección a /catalogo
5. ✅ El catálogo carga correctamente
6. ✅ Los cupos se muestran para cada taller
7. ✅ Los botones "Inscribirme" están habilitados en talleres con cupo
```

#### Test 2: Inscripción exitosa
```
1. Elegir un taller con cupo disponible
2. Click en "Inscribirme"
3. Confirmar en el diálogo
4. ✅ El botón cambia a "✓ Inscripto" inmediatamente
5. ✅ Mensaje "¡Inscripción confirmada!" aparece
6. ✅ NO se recarga la página completa (verificar en Network tab)
7. ✅ Los otros talleres siguen visibles y funcionales
```

#### Test 3: Ver itinerario
```
1. Ir a /mi-itinerario
2. ✅ El taller recién inscripto aparece en el itinerario
3. ✅ Los horarios y detalles son correctos
```

#### Test 4: Inscripción duplicada
```
1. Volver a /catalogo
2. Intentar inscribirse al mismo taller nuevamente
3. ✅ Botón muestra "✓ Inscripto" (no permite re-inscripción)
4. Si se fuerza (manipulando el estado), verificar:
5. ✅ Backend rechaza con "Ya estás inscripto en este taller."
```

#### Test 5: Taller lleno
```
1. Identificar un taller con cupo = cupo_max (lleno)
2. Intentar inscribirse (si el botón está habilitado)
3. ✅ Backend rechaza con "El taller alcanzó el cupo máximo"
4. ✅ Mensaje de error se muestra claramente
```

#### Test 6: Incompatibilidad de categoría
```
1. Inscribirse a un taller de "Cocina" en día 1
2. Intentar inscribirse a otro taller de "Cocina" en día 1
3. ✅ Cliente bloquea el botón con mensaje (validación cliente)
4. Si se fuerza, verificar:
5. ✅ Backend rechaza con "Ya tenés un taller de la categoría X ese día"
```

#### Test 7: Solapamiento horario
```
1. Inscribirse a un taller de 10:00-12:00
2. Intentar inscribirse a otro taller de 11:00-13:00 el mismo día
3. ✅ Cliente bloquea el botón (validación cliente)
4. Si se fuerza, verificar:
5. ✅ Backend rechaza con "Ya tenés un taller en esa franja horaria"
```

#### Test 8: Límite de categoría semanal
```
1. Inscribirse a 2 talleres de "Cocina" (en días diferentes)
2. Intentar inscribirse a un 3er taller de "Cocina"
3. ✅ Cliente puede bloquearlo o no (depende de la validación cliente)
4. ✅ Backend DEBE rechazar con "Ya tenés 2 talleres de Cocina en la semana"
```

#### Test 9: Recarga manual
```
1. Después de inscribirse, recargar la página (F5)
2. ✅ El taller sigue mostrándose como "✓ Inscripto"
3. ✅ Los cupos de otros talleres se actualizan
4. ✅ El estado es consistente con la base de datos
```

---

### Fase 2: Pruebas de concurrencia (5-50 usuarios)

**Objetivo:** Verificar que el sistema maneja múltiples usuarios simultáneos correctamente.

#### Test 10: 5 usuarios simultáneos
```
1. Abrir 5 pestañas de navegador en modo incógnito
2. Loguear 5 alumnos diferentes (o usar 5 máquinas)
3. Todos intentan inscribirse al mismo taller a la vez
4. ✅ Las inscripciones se procesan correctamente
5. ✅ No aparecen errores 504/522/503
6. ✅ Los cupos se respetan (no exceden cupo_max)
```

#### Test 11: 10 usuarios simultáneos
```
1. Repetir con 10 usuarios
2. ✅ Sistema responde en < 3 segundos por inscripción
3. ✅ No hay errores de Supabase
4. ✅ Verificar logs: [inscripcion] ok con duraciones < 2000ms
```

#### Test 12: 20 usuarios simultáneos
```
1. Repetir con 20 usuarios
2. ✅ Sistema sigue respondiendo (puede ser más lento)
3. ✅ Errores de timeout deberían ser < 5%
4. ✅ Verificar en Supabase Dashboard: requests/min estable
```

#### Test 13: 50 usuarios simultáneos (stress test suave)
```
1. Repetir con 50 usuarios (puede requerir herramienta de load testing)
2. ✅ Sistema sigue funcional
3. ✅ Errores de timeout deberían ser < 10%
4. ✅ Si aparecen errores, deben ser manejados correctamente:
   - Mensaje claro al usuario
   - No rompe la UI
   - El alumno puede reintentar
```

**⚠️ NO hacer test de 300+ usuarios todavía** — primero validar que 50 funciona bien.

---

### Fase 3: Test especial de cupos (concurrencia crítica)

**Objetivo:** Verificar que los cupos NUNCA se exceden bajo presión.

#### Test 14: Taller de 20 lugares con 50 usuarios concurrentes
```
1. Crear un taller de prueba con cupo_max = 20
2. Preparar 50 usuarios (scripts o herramienta de load testing)
3. Todos intentan inscribirse al mismo taller simultáneamente
4. Esperar a que todas las peticiones terminen
5. Verificar en la base de datos:
   ✅ Exactamente 20 inscripciones aceptadas
   ✅ NUNCA 21 o más (integridad de cupo)
6. Verificar logs:
   ✅ 20 logs [inscripcion] ok
   ✅ 30 logs [inscripcion] error con "cupo máximo"
```

**Herramienta recomendada para este test:**
```javascript
// script-test-cupo.js
const TALLER_ID = "..."; // ID del taller de prueba
const NUM_USUARIOS = 50;

async function testCupo() {
  const promises = [];
  for (let i = 0; i < NUM_USUARIOS; i++) {
    promises.push(
      fetch("https://tu-app.vercel.app/api/inscribir", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `auth-token-alumno-${i}=...`, // Cookies de sesión
        },
        body: JSON.stringify({ tallerId: TALLER_ID }),
      })
    );
  }
  
  const results = await Promise.all(promises);
  const exitosos = results.filter(r => r.ok).length;
  const fallidos = results.filter(r => !r.ok).length;
  
  console.log(`Exitosos: ${exitosos}, Fallidos: ${fallidos}`);
  console.log(`Esperado: 20 exitosos, 30 fallidos`);
}

testCupo();
```

---

### Fase 4: Monitoreo post-pruebas

#### Métricas a verificar en Supabase Dashboard

**Antes de las pruebas (baseline):**
- Requests por minuto: X
- Errores 504/522/503: Y%
- Uso de memoria: Z%
- Latencia promedio: W ms

**Durante las pruebas:**
- ✅ Requests por minuto debe ser ~78% menor que antes
- ✅ Errores 504/522/503 deben reducirse drásticamente (idealmente 0%)
- ✅ Uso de memoria debe mantenerse estable
- ✅ Latencia promedio debe ser < 1000ms para el 95% de requests

**Después de las pruebas:**
- ✅ Sistema vuelve a estado normal rápidamente
- ✅ No hay memory leaks
- ✅ No hay conexiones colgadas

#### Verificar logs de aplicación

```bash
# En Vercel > Functions > Logs (o tu herramienta de logging)

# Buscar patrones:
grep "\[inscripcion\] ok" | wc -l          # Cantidad de éxitos
grep "\[inscripcion\] error" | wc -l       # Cantidad de errores
grep "\[inscripcion\] duplicado" | wc -l   # Cantidad de duplicados

# Verificar duraciones:
grep "\[inscripcion\] ok" | grep -oP 'duracion=\K[0-9]+' | awk '{sum+=$1; count++} END {print "Promedio:", sum/count, "ms"}'
```

**Duraciones esperadas:**
- Promedio: < 500ms
- p95: < 1000ms
- p99: < 2000ms

---

### Fase 5: Test de regresión (verificar que nada se rompió)

#### Test 15: Panel de administración
```
1. Loguear como admin
2. Ir a /admin
3. ✅ Panel carga correctamente
4. Crear un taller nuevo
5. ✅ Taller se guarda correctamente
6. Modificar configuración (abrir/cerrar inscripciones)
7. ✅ Cambios se aplican inmediatamente
8. Ver lista de alumnos
9. ✅ Lista carga correctamente
10. Exportar datos
11. ✅ Exportación funciona
```

#### Test 16: Flujo completo de registro
```
1. Modo incógnito
2. Ir a /registro
3. Registrar un nuevo alumno
4. ✅ Registro exitoso
5. Confirmar email (si aplica)
6. Login con nuevas credenciales
7. ✅ Puede acceder al catálogo
8. Inscribirse a un taller
9. ✅ Inscripción funciona correctamente
```

---

### Criterios de éxito general

**✅ PASA si:**
- Todas las funcionalidades siguen trabajando correctamente
- Inscripciones se procesan sin errores 504/522/503
- Cupos NUNCA se exceden (test de 50 usuarios concurrentes)
- Logs muestran duraciones < 2000ms en p99
- Requests a Supabase se redujeron ~78%
- Transferencia de datos en conteo se redujo ~95%

**❌ FALLA si:**
- Alguna funcionalidad se rompió
- Aparecen errores 504/522/503 en cantidades significativas (>5%)
- Cupos se exceden (21+ en taller de 20 cupos)
- Duraciones promedio > 2000ms
- El sistema es más lento que antes

**⚠️ REVISAR si:**
- Errores ocasionales (< 5%) bajo carga extrema (aceptable)
- Duraciones en p99 entre 2000-5000ms (mejorable pero no bloqueante)
- UX de cupos desactualizados confunde a usuarios (considerar mejorar messaging)

---

## H. MÉTRICAS DE ÉXITO

### Reducción de carga esperada

**Requests por inscripción:**
- Antes: 9 requests (3 acción + 6 refresh)
- Después: 2 requests (auth + insert)
- **Reducción: 78%**

**Transferencia de datos en conteo de cupos:**
- Antes: ~1000 filas transferidas por alumno
- Después: ~50 filas agregadas por alumno
- **Reducción: 95%**

**Ejemplo con 364 alumnos inscribiéndose:**
- Requests antes: 3,276
- Requests después: 728
- **Ahorro: 2,548 requests (78%)**

---

## I. PRÓXIMOS PASOS RECOMENDADOS

### Corto plazo (1-2 semanas)

1. **Medir en producción real**
   - Observar métricas durante próxima inscripción masiva
   - Comparar con baseline anterior
   - Ajustar logging si es demasiado verboso

2. **Revisar logs y feedback de usuarios**
   - ¿Aparecen errores no contemplados?
   - ¿Los usuarios reportan confusión por cupos desactualizados?
   - ¿Duraciones de inscripción son aceptables?

---

### Medio plazo (1-2 meses)

3. **Considerar caching de datos globales**
   - `talleres`, `categorias`, `configuracion` con TTL de 30-60 segundos
   - Usar Vercel Data Cache o Redis
   - Implementar invalidación manual para cambios urgentes

4. **Optimizar consultas adicionales**
   - Índices en columnas de filtrado frecuente
   - Revisar queries N+1 en panel de administración
   - Connection pooling si no está configurado

5. **Eliminar logging temporal**
   - Después de confirmar que todo funciona bien
   - O reducir a logging solo de errores

---

### Largo plazo (3-6 meses)

6. **Considerar upgrade de Supabase**
   - Si el crecimiento continúa
   - Plan Pro ofrece más recursos y conexiones

7. **Implementar rate limiting por alumno**
   - Máximo 1 inscripción cada 2-3 segundos por alumno
   - Previene spam accidental o intencional

8. **Mejorar UX de cupos desactualizados**
   - Polling periódico (cada 30 segundos) para actualizar cupos
   - O botón "Actualizar cupos" manual
   - Sin usar Realtime (para no consumir conexiones)

9. **Monitoreo y alertas**
   - Configurar alertas en Supabase para uso > 80%
   - Alertas de error rate > 5%
   - Dashboard de métricas en tiempo real

---

## J. CONCLUSIÓN

Este parche reduce la carga en Supabase en **78% por inscripción** y la transferencia de datos en **95% para conteo de cupos**, sin modificar la arquitectura ni debilitar la lógica de negocio de PostgreSQL.

Los cambios son **mínimos, seguros y enfocados** en reducir carga antes de volver a abrir inscripciones.

La integridad de datos sigue garantizada por PostgreSQL (trigger con `FOR UPDATE`), y todas las validaciones de negocio se mantienen intactas.

**El sistema está listo para un nuevo pico de inscripciones masivas con una carga significativamente reducida en Supabase.**

---

**Desarrollado por:** Claude (Anthropic)  
**Fecha:** 2026-09-10  
**Versión:** 1.0
