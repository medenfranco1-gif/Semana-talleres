# Auditoría de inscripciones — 10 de septiembre de 2026

Base inspeccionada: `3e19073` del repositorio Semana-talleres. Esta revisión se
basa en los archivos descargados de GitHub, no en las afirmaciones de una charla
anterior. No se inspeccionó la configuración ni el esquema instalado en Supabase
de producción. Las políticas y funciones mencionadas son las del repositorio.

## Hallazgos verificados y cambios

| Área | Evidencia en la versión base | Cambio |
| --- | --- | --- |
| Catálogo | `src/app/catalogo/page.tsx`: `force-dynamic`, `revalidate=0`; Auth, perfil, cuatro consultas paralelas y otra de cupos | Una RPC pública agregada con `unstable_cache` de 10 segundos; perfil e inscripciones personales fuera de caché compartida |
| Cupos visibles | Selección de todos los `taller_id` de inscripciones, conteo en JavaScript; RLS solo deja ver filas propias y PostgREST puede truncar resultados | Agregación SQL global por taller con `SECURITY DEFINER`; nunca devuelve identidad de inscriptos |
| Confirmación | Preconsulta de duplicado + INSERT + dos `revalidatePath` + `router.refresh()` | Una RPC idempotente devuelve la inscripción real; se actualiza estado local, sin revalidación global por inscripción |
| Estado de pantalla | `useState(props)` no incorporaba nuevas props luego del refresh | Sincronización de snapshots y actualización con fila confirmada; exclusión inmediata de doble clic mediante ref |
| Navegación | Caché del router podía conservar itinerario anterior al eliminar las revalidaciones | Enlaces de navbar a catálogo/itinerario hacen navegación completa; apariencia igual, sin precarga de esas rutas |
| Auth servidor | Varios clientes SSR y helpers no deduplicados en un render | Cliente y perfil con `React.cache`, limitado al request; se conserva `getUser()` para autenticación real |
| Navbar | Otra llamada `getUser()` y perfil al montar; llamadas Supabase dentro del callback Auth | `getSession()` únicamente para presentación + perfil con RLS; trabajo Auth diferido fuera del callback y sin consulta al salir |
| Middleware | Gate privado sin llamadas Supabase | Se conserva; no era el origen de duplicación de Auth |
| Trigger cupo | `SECURITY INVOKER`: conteo sujeto a RLS, locks de taller sujetos a política UPDATE; lectura de taller antes de lock; locks de todas las inscripciones | `SECURITY DEFINER`, search_path fijo, lock alumno→taller y lectura del taller bajo lock; conteo global sin bloquear cada inscripción |
| Reglas simultáneas | Ya existía intención de serializar por alumno/taller | Se conserva esa estrategia con permisos efectivos; valida READ COMMITTED y conserva horario, categoría diaria, título semanal, límites semanales, activo y apertura |
| Rate limit | Sin límite propio de inscripciones; solo traducción de errores Auth | 20 intentos por alumno por ventana de 60 s en tabla RLS; errores de negocio también consumen intentos; INSERT directo de alumnos bloqueado |
| Cambio administrativo | DELETE, INSERT y restauración mediante requests independientes; restauración podía fallar | RPC transaccional: destino inválido revierte todo y conserva ID/fechas originales |
| Bypass UPDATE | Admin podía cambiar alumno/taller por UPDATE sin pasar trigger de INSERT | Se prohíbe cambiar esas claves directamente; usar RPC administrativa |
| Alta de perfil | Política INSERT permitía insertar perfil propio con `rol=admin`; trigger solo protegía UPDATE | Alta propia exige `rol=alumno`; admins conservan su permiso |
| Framework | Next.js 14.2.5, con aviso de seguridad al instalar | Next.js y eslint-config-next 14.2.35, dentro de la misma versión mayor |

El esquema ya tenía índices por taller/alumno y UNIQUE(alumno,taller). No se
agregaron índices redundantes ni conexiones Realtime. El catálogo sigue incluyendo
talleres inactivos para mantener las validaciones y presentación existentes.

## Requests esperables por código

Una carga base del Server Component hacía aproximadamente **7 llamadas Supabase**:
Auth + alumno + talleres + categorías + configuración + inscripciones personales +
conteo de cupos. La navbar sumaba hasta otras 2 al montar. Una inscripción sumaba
4 llamadas antes de las recargas. `revalidatePath` y `router.refresh` podían
agregar renders; no se afirma un multiplicador fijo porque depende de Next.

Ahora el Server Component hace **3 llamadas personales** (Auth, perfil,
inscripciones), más **1 RPC compartida en fallo de caché**. Una inscripción hace
**3** (Auth, perfil, RPC), sin recargar catálogo. La navbar conserva una consulta
de perfil al montar y puede refrescar tokens si vencieron. Estos son conteos
estáticos del código, no mediciones del tráfico real. `React.cache` no comparte
sesiones entre alumnos ni elimina el chequeo Auth entre requests diferentes.

La caché de 10 s es una política de revalidación, no un límite absoluto de
antigüedad: Next puede servir un snapshot previo mientras revalida o si falla el
origen. Un arranque frío distribuido puede ejecutar más de una RPC. El trigger
decide el cupo definitivo. Los cambios administrativos invalidan la etiqueta;
no se invalida el catálogo compartido en cada inscripción.

## Pruebas y alcance

`npm run test:db` inicia PostgreSQL real local con roles RLS y un sustituto local
de `auth.uid()`, aplica esquema+migración y prueba 400 usuarios lógicos concurrentes
con pool de 40 conexiones. No usa Supabase Auth ni el gateway PostgREST. El informe
exacto se guarda en `test-results/database.json`; la versión de PostgreSQL del
proyecto Supabase debe comprobarse y probarse en staging también.

La carrera por 25 cupos exige exactamente 25 confirmaciones y 375 rechazos, sin
sobreventa. Otro escenario exige 400 éxitos en 20 talleres de 20 lugares. Incluye
pruebas de RLS, duplicado idempotente, conflictos simultáneos, restricciones de
categoría/título, cierre/inactivo, rate limit, cambios administrativos y roles.

La prueba HTTP de 400 usuarios está en [load/README.md](../load/README.md). Usa
HTML autenticado y la Server Action real con cookies SSR. No se ejecutó contra
Vercel/Supabase porque no hay un entorno de staging ni credenciales en esta copia.
Por ello no se afirma que producción ya soporte 360 alumnos, ni se inventan
métricas de red, Auth o Vercel. Compilar con variables ficticias verifica el build,
no la conectividad al proyecto.

Resultado local registrado el 10/09/2026 (PostgreSQL 18.4, Windows): carrera por
25 lugares, 25 confirmaciones/375 rechazos/0 sobreventa, 351 ms total, p95 335 ms,
p99 338 ms incluyendo espera del pool. Escenario distribuido: 400/400 éxitos,
168 ms total. Todas las aserciones pasaron. Son resultados locales sin latencia
de red externa; no son una proyección de tiempos para los alumnos.

## Aplicación de la migración

1. Revisar cambios reales de producción contra el bootstrap; si divergen, adaptar
   antes de ejecutar. Guardar backup y revisar inscripciones actuales con las
   consultas de invariantes en `load/README.md`; la migración no repara datos anteriores.
2. Probar primero en staging como `postgres` (propietario de funciones/tablas).
   En una base nueva: `schema.sql` y después migraciones en orden. En una existente:
   solo `supabase/migrations/202609100001_registration.sql`.
3. Coordinar una ventana con el gate privado activo, aplicar migración y desplegar
   esta rama. **El cliente anterior insertaba directamente: deja de funcionar para
   alumnos tras esta migración.** No es un despliegue compatible con ambos clientes.
   Pedir recarga a las pestañas abiertas al habilitar el nuevo despliegue.
4. Verificar login, catálogo, inscripción, itinerario, bajas/cambios admin y apertura.
   Ejecutar k6 con cuentas de prueba y comprobar invariantes antes de abrir.

No se aplicó SQL ni se desplegó en producción. No ejecutar de nuevo `schema.sql`
sobre una base migrada: restablecería funciones/políticas anteriores. Un rollback
requiere coordinar app y políticas; no restaurar las políticas vulnerables mientras
el sistema recibe inscripciones. La migración es transaccional y repetible.

## Riesgos que permanecen

- Falta verificar capacidad real del gateway, cuota/CPU/conexiones de Supabase,
  ubicación de Vercel, latencia y configuración de Fluid compute del proyecto.
- El login sigue usando Supabase Auth. El límite nuevo no protege login ni tráfico
  no autenticado. Revisar límites Auth y protección del borde con métricas; no hay
  limiter en memoria que finja funcionar entre distintas instancias. La IP compartida
  de la escuela merece una prueba separada.
- No hay actualización automática de pestañas ya abiertas cuando administración
  abre un día. Recargar trae nuevo snapshot; esto no es un feed en vivo.
- Ediciones administrativas de horario/categoría/título o reducción del cupo de un
  taller ya inscripto pueden invalidar registros existentes. No hacerlas durante la
  apertura; no se restringió ese CRUD sin definir su política de negocio.
- La asignación masiva administrativa existente opera en una transacción con muchos
  locks; no ejecutarla al mismo tiempo que la apertura. El orden de locks de los
  inserts individuales no elimina todos los ciclos posibles entre operaciones masivas.
- Un timeout de red puede ocultar un COMMIT exitoso. La UI indica reintentar el mismo
  taller y la RPC devuelve la fila existente; no hay reintentos automáticos masivos.
- Se mantuvo la baja de alumno existente en backend/RLS aunque no aparece en el
  itinerario actual. Decidir aparte si debe prohibirse como regla de negocio.
- El parche de Next indicado no equivale a una auditoría de todas las dependencias.

## ¿Hace falta Vercel Pro?

**No hay evidencia de que Pro sea necesario por tener 360 alumnos.** Los problemas
verificados de RLS, locks y amplificación no se solucionan comprando un plan.
La documentación actual indica autoscaling hasta 30.000 ejecuciones concurrentes
en Hobby y Pro con Fluid compute, pero ese techo no garantiza latencia ni elimina
cuotas. La decisión técnica debe basarse en k6 contra el despliegue y métricas de
ambos proveedores. También corresponde verificar elegibilidad de Hobby para el
uso institucional: su alcance es personal y no comercial. Esa cuestión es distinta
de la capacidad del sistema y no se determina solo contando alumnos.

Fuentes oficiales consultadas:

- [Vercel: límites de Functions](https://vercel.com/docs/functions/limitations)
- [Vercel: plan Hobby](https://vercel.com/docs/plans/hobby)
- [Supabase: límites Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [Next 14: caché](https://nextjs.org/docs/14/app/building-your-application/caching)
- [Next: parche de seguridad](https://nextjs.org/blog/security-update-2025-12-11)
- [PostgreSQL: Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
