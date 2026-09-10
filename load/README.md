# Prueba de apertura: 400 alumnos

## Validación local reproducible

`npm ci` y `node tests/database.mjs` levantan PostgreSQL real temporal, aplican
`schema.sql` y la migración dos veces y lanzan **400 usuarios lógicos concurrentes**,
cada uno con consulta de catálogo e inscripción. El pool tiene 40 conexiones:
la espera del pool está incluida en las latencias. No son 400 conexiones de BD.
No usa variables ni datos de producción. Informe: `test-results/database.json`.
También comprueba RLS, cupo global, solapamiento concurrente, categoría diaria,
repetición semanal, límite de Cocina, reintento idempotente, cierre/inactivo,
rate limit, bypass por INSERT/UPDATE, cambio administrativo atómico y escalada de rol.

## Prueba HTTP de Vercel + Supabase

Esta parte **requiere un proyecto Supabase descartable y un deploy staging** con
la migración aplicada, catálogo de prueba y los días abiertos. No usar alumnos reales.
Instalar [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).
Crear un taller con cupo 25 para la carrera por los últimos lugares; usar luego
un taller de cupo >=400 para medir éxitos sin que el rechazo por cupo oculte fallas.
Vaciar únicamente las inscripciones de prueba o crear otro taller entre corridas.

Configurar en la terminal (sin subir secretos):

```powershell
$env:ALLOW_LOAD_TEST='staging'
$env:NEXT_PUBLIC_SUPABASE_URL='https://PROYECTO-STAGING.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='...'
$env:SUPABASE_SERVICE_ROLE_KEY='...'
$env:LOAD_TALLER_ID='UUID_DEL_TALLER_DE_PRUEBA'
# Solo si el deploy utiliza el gate privado:
$env:PRIVATE_TEST_PASSWORD='...'
node load/prepare.mjs
$env:BASE_URL='https://DEPLOY-STAGING.vercel.app'
$env:ACTION_ID='ID_DE_INSCRIBIRACTION_DEL_MISMO_DEPLOY'
k6 run --summary-export=test-results/http.json load/catalog-registration.js
```

La preparación crea 400 usuarios distintos y cookies SSR válidas (tarda al menos
7 minutos). Ejecutar la carga antes de expirar las sesiones. El script deja un
archivo sensible `load/fixtures.json`, ignorado por Git. No imprime contraseñas.
Para identificar ACTION_ID: abrir catálogo en staging, hacer una inscripción de
prueba y copiar el encabezado **Next-Action** del POST en Network del navegador.
Los IDs cambian entre builds: no reutilizar otro deploy. La preparación muestra
candidatos del manifest si el build está disponible, pero no adivina cuál usar.

k6 inicia 400 usuarios a la vez, carga el HTML autenticado y llama la **misma Server
Action usada por la UI**. Comprueba el resultado Flight, no solo HTTP 200. Falla
ante login, pantalla privada, timeout, respuesta indeterminada o cero éxitos.
No usa un endpoint de prueba que saltee el servidor de la aplicación.
Los umbrales p95 (<3 s catálogo, <5 s inscripción) son objetivos, no resultados.
Probar caché fría y caliente, y distribución de usuarios entre varios talleres
modificando tallerId en fixtures. Repetir también desde la red de la escuela.

Después de cada corrida comprobar en SQL Editor:

```sql
select t.id, t.cupo_max, count(i.id) as inscriptos
from talleres t left join inscripciones i on i.taller_id=t.id
group by t.id having count(i.id)>t.cupo_max; -- debe devolver cero filas
select alumno_id,taller_id,count(*) from inscripciones
group by alumno_id,taller_id having count(*)>1; -- cero
select a.alumno_id, a.taller_id, b.taller_id
from inscripciones a join inscripciones b on a.alumno_id=b.alumno_id and a.id<b.id
join talleres ta on ta.id=a.taller_id join talleres tb on tb.id=b.taller_id
where (ta.dia=tb.dia and (ta.categoria=tb.categoria or
  (ta.hora_inicio<tb.hora_fin and ta.hora_fin>tb.hora_inicio)))
or lower(btrim(ta.titulo))=lower(btrim(tb.titulo)); -- cero
```

Comparar éxitos únicos con filas confirmadas; guardar métricas de Vercel y
Supabase (5xx/429, Auth, CPU, conexiones, espera de locks, latencia y memoria).
Los resultados locales no validan esos límites ni el ancho de banda de la escuela.
Este escenario usa sesiones preparadas: **no mide 400 logins simultáneos**.
Probar el login por separado con cuentas existentes y límites Auth configurados,
especialmente si todos salen por una misma IP. No aumentar límites a ciegas.
