# Sistema de Pruebas de Carga - Documentación Técnica

## Arquitectura

### Registro de usuarios (`register.js`)
- Script Node.js puro (sin dependencias externas)
- Lee `tests/load/register-users.json`
- Hace POST a `/registro` con FormData
- Detecta éxito/error parseando HTML de respuesta
- Protección contra producción integrada

### Pruebas de carga (`load-test.spec.ts`)
- Playwright Test con ejecución paralela
- Un test por usuario (test.describe con mode: 'parallel')
- Workers configurables via `CONCURRENCY`
- Captura errores 5xx automáticamente
- Clasifica errores: negocio vs técnicos

## Estructura de archivos

```
tests/load/
├── register-users.example.json  # Plantilla con 20 usuarios
├── register-users.json          # Credenciales reales (gitignored)
├── register.js                  # Script de registro
├── load-test.spec.ts           # Suite de Playwright
└── resultados-*.json           # Resultados timestamped (gitignored)
```

## Variables de entorno

### Requeridas
- `BASE_URL` - URL de la aplicación bajo prueba

### Opcionales
- `TALLER_ID` - ID UUID del taller (preferido)
- `TALLER_NOMBRE` - Nombre visible del taller (fallback)
- `CONCURRENCY` - Workers de Playwright (default: 5)
- `ALLOW_PRODUCTION_LOAD_TEST` - Bypass de protección (default: false)

## Protección contra producción

Ambos scripts verifican si `BASE_URL` contiene dominios de producción:
- `semana-talleres.vercel.app`
- `talleres.escuela.edu.ar`

Para agregar más dominios, editar arrays `PRODUCTION_DOMAINS` en:
- `tests/load/register.js` (línea 23)
- `tests/load/load-test.spec.ts` (línea 17)

## Clasificación de errores

### Rechazos de negocio (esperados)
- "cupo máximo"
- "ya estás inscripto"
- "franja horaria"
- "misma categoría"
- "límite alcanzado"
- "inscripciones están cerradas"

### Errores técnicos
- HTTP 5xx
- Timeouts
- Elementos de UI no encontrados
- Errores de red
- Cualquier otro error no clasificado como negocio

## Scripts NPM

```json
"test:register:5"  -> node tests/load/register.js 5
"test:register:10" -> node tests/load/register.js 10
"test:register:20" -> node tests/load/register.js 20

"test:load:5"  -> CONCURRENCY=5  playwright test
"test:load:10" -> CONCURRENCY=10 playwright test
"test:load:20" -> CONCURRENCY=20 playwright test
"test:load:custom" -> playwright test (usa CONCURRENCY de env)
```

## Métricas capturadas

Por usuario:
- `registro_ok`: boolean
- `login_ok`: boolean
- `catalogo_ok`: boolean
- `inscripcion_resultado`: 'exito' | 'rechazo_negocio' | 'error_tecnico'
- `inscripcion_mensaje`: string
- `error_5xx`: boolean
- `tiempo_login_ms`: number
- `tiempo_catalogo_ms`: number
- `tiempo_inscripcion_ms`: number
- `error_log`: string[]

Agregadas:
- Promedios
- P95
- Máximos
- Conteos por tipo de resultado

## Salida JSON

Los resultados se guardan en `tests/load/resultados-{timestamp}.json`:

```json
[
  {
    "email": "test01@loadtest.local",
    "registro_ok": true,
    "login_ok": true,
    "catalogo_ok": true,
    "inscripcion_resultado": "exito",
    "inscripcion_mensaje": "Inscripción exitosa",
    "error_5xx": false,
    "tiempo_login_ms": 450,
    "tiempo_catalogo_ms": 1200,
    "tiempo_inscripcion_ms": 680,
    "error_log": []
  }
]
```

## Prueba especial de cupos (futura)

Para probar que los cupos se respetan bajo concurrencia:

1. Crear taller de prueba con `cupo_max = 20`
2. Preparar 50 usuarios
3. Configurar `TALLER_ID` con el UUID del taller
4. Ejecutar:
   ```bash
   export CONCURRENCY=50
   npm run test:load:custom
   ```
5. Verificar en BD:
   ```sql
   SELECT COUNT(*) FROM inscripciones WHERE taller_id = 'uuid-del-taller';
   -- Debe ser exactamente 20, NUNCA 21+
   ```

Resultado esperado:
- 20 usuarios: `inscripcion_resultado: 'exito'`
- 30 usuarios: `inscripcion_resultado: 'rechazo_negocio'`
- 0 usuarios con error técnico

## Integración con k6 (futura)

Para pruebas masivas (50-300 usuarios) se puede usar k6:

```javascript
// tests/load/k6-script.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
};

export default function () {
  // 1. Login
  let loginRes = http.post(`${__ENV.BASE_URL}/login`, {
    email: users[__VU % users.length].email,
    password: users[__VU % users.length].password,
    documento: users[__VU % users.length].documento,
  });

  check(loginRes, {
    'login ok': (r) => r.status === 200,
  });

  // 2. Catálogo
  let catalogoRes = http.get(`${__ENV.BASE_URL}/catalogo`);
  
  check(catalogoRes, {
    'catalogo ok': (r) => r.status === 200,
  });

  // 3. Inscripción
  // ... (requiere CSRF token, cookies, etc.)
  
  sleep(1);
}
```

**IMPORTANTE:** No implementar sin:
- Manejo correcto de sesiones/cookies
- Extracción de CSRF tokens si existen
- Protección contra producción
- NO usar service_role
- NO hacer bypass de RLS

## Limitaciones conocidas

1. **No detecta router.refresh()**: Si el código hace `router.refresh()` después de inscribirse, la prueba no lo captura (solo mide el tiempo hasta el primer resultado visible)

2. **Detección de éxito por UI**: Se basa en buscar texto "Inscripción confirmada" o "✓ Inscripto". Si cambia el texto, actualizar en `load-test.spec.ts`

3. **No prueba desinscripción**: Solo inscripción positiva

4. **No prueba límites por categoría**: Solo cupo general y duplicados

5. **Navegador único**: Solo Chromium. Para probar otros navegadores, agregar proyectos en `playwright.config.ts`

## Debugging

### Ver trace de Playwright

Si una prueba falla, Playwright guarda un trace:

```bash
npx playwright show-trace test-results/*/trace.zip
```

### Modo headed (ver navegador)

```bash
export BASE_URL=https://preview.vercel.app
npx playwright test --headed tests/load/load-test.spec.ts
```

### Un solo usuario

```bash
export BASE_URL=https://preview.vercel.app
npx playwright test --workers=1 tests/load/load-test.spec.ts
```

### Con debug

```bash
export DEBUG=pw:api
npm run test:load:5
```

## Consideraciones de seguridad

### ✅ Seguro
- Credenciales en archivo local gitignored
- Sin hardcoded secrets
- Sin service_role
- Protección contra producción
- Logs no exponen passwords/tokens

### ⚠️ Cuidado
- `register-users.json` tiene passwords en texto plano
- Mantener el archivo fuera de Git
- No compartir passwords de prueba
- Limpiar usuarios de prueba después

### ❌ Nunca
- Commitear `register-users.json`
- Usar emails reales
- Usar DNIs reales
- Ejecutar contra producción sin autorización
- Modificar BD directamente desde las pruebas
- Usar service_role desde las pruebas

## Performance esperado

Baseline (después de optimización):

### Registro
- Promedio: 400-600ms
- P95: < 1000ms
- Máximo: < 1500ms

### Login
- Promedio: 400-600ms
- P95: < 1000ms
- Máximo: < 1500ms

### Catálogo
- Promedio: 800-1500ms
- P95: < 2000ms
- Máximo: < 3000ms

### Inscripción
- Promedio: 500-800ms
- P95: < 1500ms
- Máximo: < 2000ms

Si los tiempos son significativamente mayores, investigar:
- Supabase Dashboard > Reports > Slow queries
- Network tab en Chrome DevTools
- Logs de aplicación en Vercel

## CI/CD (futuro)

Para integrar en CI:

```yaml
# .github/workflows/load-test.yml
name: Load Test
on:
  workflow_dispatch:
    inputs:
      preview_url:
        required: true
      user_count:
        required: true
        default: '5'

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install chromium
      
      - name: Register users
        env:
          BASE_URL: ${{ inputs.preview_url }}
        run: npm run test:register:${{ inputs.user_count }}
      
      - name: Run load test
        env:
          BASE_URL: ${{ inputs.preview_url }}
        run: npm run test:load:${{ inputs.user_count }}
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: load-test-results
          path: tests/load/resultados-*.json
```

## Mantenimiento

### Actualizar Playwright

```bash
npm install @playwright/test@latest
npx playwright install chromium
```

### Limpiar usuarios de prueba

Desde Supabase Dashboard > SQL Editor:

```sql
-- VER usuarios de prueba
SELECT * FROM alumnos WHERE email LIKE '%@loadtest.local';

-- BORRAR usuarios de prueba (CUIDADO)
DELETE FROM alumnos WHERE email LIKE '%@loadtest.local';
```

**IMPORTANTE:** Esto borra en cascada las inscripciones por el `ON DELETE CASCADE`.

### Regenerar usuarios

Si necesitás usuarios frescos:

1. Borrar los usuarios actuales (SQL arriba)
2. Ejecutar registro nuevamente:
   ```bash
   npm run test:register:20
   ```

---

**Autor:** Sistema de pruebas automatizado  
**Fecha:** 2026-09-10  
**Versión:** 1.0
