import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Configuración de pruebas de carga - LOCALHOST + SUPABASE DE PRUEBA
 */

// Cargar variables desde .env.loadtest
const envPath = path.join(__dirname, '..', '..', '.env.loadtest');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No existe .env.loadtest');
  console.error('   Copiá: copy .env.loadtest.example .env.loadtest');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const BASE_URL = envVars.BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const TALLER_ID = envVars.TALLER_ID || process.env.TALLER_ID;
const TALLER_NOMBRE = envVars.TALLER_NOMBRE || process.env.TALLER_NOMBRE;
const TEST_SUPABASE_URL = envVars.TEST_SUPABASE_URL;

// URLs de producción conocidas
const PRODUCTION_SUPABASE_URLS = [
  'fmrlewcfttxgcftycfsfp.supabase.co',
];

// VALIDACIONES
if (!BASE_URL) {
  console.error('❌ Error: BASE_URL no definida en .env.loadtest');
  process.exit(1);
}

if (!TEST_SUPABASE_URL) {
  console.error('❌ Error: TEST_SUPABASE_URL no definida en .env.loadtest');
  process.exit(1);
}

// PROTECCIÓN: Verificar que NO apunte a producción
const isPointingToProduction = PRODUCTION_SUPABASE_URLS.some(prodUrl =>
  TEST_SUPABASE_URL.includes(prodUrl)
);

if (isPointingToProduction) {
  console.error('❌ ERROR: EL TEST ESTÁ APUNTANDO A PRODUCCIÓN');
  console.error('');
  console.error(`   TEST_SUPABASE_URL: ${TEST_SUPABASE_URL}`);
  console.error('');
  console.error('   Verificá .env.loadtest - debe apuntar al Supabase de PRUEBA');
  console.error('');
  process.exit(1);
}

// Validar localhost
if (!BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1')) {
  console.error('⚠️  ADVERTENCIA: BASE_URL no es localhost');
  console.error(`   BASE_URL actual: ${BASE_URL}`);
  console.error('');
  console.error('   Este sistema está diseñado para localhost + Supabase de prueba.');
  console.error('');
}

// Cargar usuarios
const usersFilePath = path.join(__dirname, 'register-users.json');
if (!fs.existsSync(usersFilePath)) {
  console.error('❌ Error: No existe tests/load/register-users.json');
  console.error('   Copiá: cp tests/load/register-users.example.json tests/load/register-users.json');
  process.exit(1);
}

const allUsers = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));

// Obtener CONCURRENCY de variables de entorno
// Prioridad: process.env (PowerShell/CLI) > .env.loadtest > fallback 5
const concurrency = parseInt(process.env.CONCURRENCY || envVars.CONCURRENCY || '5', 10);

// Seleccionar solo los primeros N usuarios según CONCURRENCY
const users = allUsers.slice(0, concurrency);

console.log('');
console.log('🧪 CONFIGURACIÓN DE PRUEBA');
console.log('='.repeat(50));
console.log(`BASE_URL:     ${BASE_URL}`);
console.log(`TEST_SUPABASE: ${TEST_SUPABASE_URL}`);
console.log(`CONCURRENCY:  ${concurrency}`);
console.log(`TALLER:       ${TALLER_NOMBRE || TALLER_ID || 'Primero disponible'}`);
console.log('='.repeat(50));
console.log('');
console.log('👥 USUARIOS SELECCIONADOS:');
users.forEach((u: any, idx: number) => {
  console.log(`   ${idx + 1}. ${u.email}`);
});
console.log('');
console.log('⚠️  NO se mostrarán contraseñas por seguridad');
console.log('='.repeat(50));
console.log('');

/**
 * Tipos de resultado de inscripción
 */
type InscripcionResultado = 'exito' | 'rechazo_negocio' | 'error_tecnico';

interface UserResult {
  email: string;
  registro_ok: boolean;
  login_ok: boolean;
  catalogo_ok: boolean;
  inscripcion_resultado: InscripcionResultado | null;
  inscripcion_mensaje: string | null;
  error_5xx: boolean;
  tiempo_login_ms: number;
  tiempo_catalogo_ms: number;
  tiempo_inscripcion_ms: number;
  error_log: string[];
}

// Almacenar resultados globalmente
const results: UserResult[] = [];

/**
 * Determinar si un error es de negocio o técnico
 */
function clasificarError(mensaje: string): InscripcionResultado {
  const mensajeLower = mensaje.toLowerCase();

  // Rechazos esperados de negocio
  const rechazosNegocio = [
    'cupo máximo',
    'cupo completo',
    'ya estás inscripto',
    'franja horaria',
    'misma categoría',
    'solapamiento',
    'límite alcanzado',
    'inscripciones están cerradas',
    'no está disponible',
    'no existe',
  ];

  for (const rechazo of rechazosNegocio) {
    if (mensajeLower.includes(rechazo)) {
      return 'rechazo_negocio';
    }
  }

  return 'error_tecnico';
}

/**
 * Función para inscribirse a un taller
 */
async function inscribirseATaller(page: Page, userResult: UserResult): Promise<void> {
  const catalogoStart = Date.now();
  let dialogDetected = false;
  let dialogAccepted = false;

  try {
    // Esperar que cargue el catálogo - REALMENTE esperar contenido visible
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // NO marcar catalogo_ok todavía - esperar a que aparezca contenido real
    let tallerEncontrado = false;
    let botonInscribir;

    if (TALLER_NOMBRE) {
      // Buscar taller por nombre - DENTRO de su tarjeta específica
      // Esperar hasta 15 segundos a que aparezca la tarjeta del taller
      const tallerCard = page.locator(`.card:has-text("${TALLER_NOMBRE}")`).first();

      try {
        await tallerCard.waitFor({ state: 'visible', timeout: 15000 });
        tallerEncontrado = true;
        botonInscribir = tallerCard.locator('button:has-text("Inscribirme")');

        // AHORA sí marcar catálogo como OK (el contenido se renderizó)
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = true;
        userResult.error_log.push(`Taller encontrado: ${TALLER_NOMBRE}`);
      } catch (waitError) {
        // Timeout esperando la tarjeta - diagnosticar
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = false;
        userResult.inscripcion_resultado = 'error_tecnico';
        userResult.inscripcion_mensaje = `Taller "${TALLER_NOMBRE}" no apareció en catálogo`;

        // Diagnóstico: qué sí está visible
        const todasLasTarjetas = page.locator('.card');
        const cantidadTarjetas = await todasLasTarjetas.count();
        userResult.error_log.push(`URL: ${page.url()}, Tarjetas visibles: ${cantidadTarjetas}`);

        // Capturar títulos de talleres visibles
        if (cantidadTarjetas > 0) {
          const titulos = await page.locator('.card h3').allTextContents();
          userResult.error_log.push(`Talleres visibles: ${titulos.join(', ')}`);
        }

        // Verificar si existe texto "Trenzas" en algún lugar
        const textoTrenzas = await page.locator('text=/Trenzas/i').count();
        userResult.error_log.push(`Texto "Trenzas" encontrado: ${textoTrenzas} veces`);

        // Verificar si hay botones "Inscribirme"
        const botonesInscribirme = await page.locator('button:has-text("Inscribirme")').count();
        userResult.error_log.push(`Botones "Inscribirme" encontrados: ${botonesInscribirme}`);

        // Verificar si ya está inscripto
        const yaInscripto = await page.locator('text=/✓ Inscripto/i').count();
        userResult.error_log.push(`"✓ Inscripto" encontrado: ${yaInscripto} veces`);

        return;
      }
    } else if (TALLER_ID) {
      // Buscar botón por taller específico - esperar a que aparezca
      botonInscribir = page.locator(`button:has-text("Inscribirme")`).first();

      try {
        await botonInscribir.waitFor({ state: 'visible', timeout: 15000 });
        tallerEncontrado = true;
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = true;
      } catch (waitError) {
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = false;
        userResult.inscripcion_resultado = 'error_tecnico';
        userResult.inscripcion_mensaje = 'No apareció ningún botón "Inscribirme"';
        return;
      }
    } else {
      // Sin taller especificado, tomar el primer disponible
      botonInscribir = page.locator('button:has-text("Inscribirme")').first();

      try {
        await botonInscribir.waitFor({ state: 'visible', timeout: 15000 });
        tallerEncontrado = true;
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = true;
      } catch (waitError) {
        userResult.tiempo_catalogo_ms = Date.now() - catalogoStart;
        userResult.catalogo_ok = false;
        userResult.inscripcion_resultado = 'error_tecnico';
        userResult.inscripcion_mensaje = 'No apareció ningún botón "Inscribirme"';
        return;
      }
    }

    if (!tallerEncontrado || !botonInscribir) {
      userResult.inscripcion_resultado = 'error_tecnico';
      userResult.inscripcion_mensaje = 'No se encontró taller disponible';
      userResult.error_log.push('Taller no encontrado en el catálogo');
      return;
    }

    // IMPORTANTE: Registrar handler de window.confirm() ANTES del click
    // CatalogoClient.tsx línea 124: usa window.confirm() antes de inscribir
    page.on('dialog', async (dialog) => {
      dialogDetected = true;
      userResult.error_log.push(`Dialog detectado: tipo=${dialog.type()}, mensaje="${dialog.message()}"`);

      if (dialog.type() === 'confirm') {
        await dialog.accept();
        dialogAccepted = true;
        userResult.error_log.push('Dialog confirmado (accept)');
      } else {
        await dialog.dismiss();
        userResult.error_log.push('Dialog rechazado (dismiss)');
      }
    });

    // Hacer clic en "Inscribirme"
    const inscripcionStart = Date.now();
    await botonInscribir.click();

    // Dar tiempo para que aparezca el dialog (si es que aparece)
    await page.waitForTimeout(500);

    if (dialogDetected && !dialogAccepted) {
      userResult.tiempo_inscripcion_ms = Date.now() - inscripcionStart;
      userResult.inscripcion_resultado = 'error_tecnico';
      userResult.inscripcion_mensaje = 'Dialog de confirmación no fue aceptado';
      return;
    }

    // Esperar respuesta: el botón cambia o aparece mensaje
    // La UI actualiza INMEDIATAMENTE después del Server Action (optimistic update)
    try {
      await page.waitForFunction(
        () => {
          // Buscar botón "✓ Inscripto" (éxito) - CSS estándar
          const botones = document.querySelectorAll('button, span');
          const botonExito = Array.from(botones).find(
            (el) => el.textContent && el.textContent.trim().includes('✓ Inscripto')
          );
          if (botonExito) return 'exito';

          // Buscar mensaje de error rojo (rechazo) - CSS estándar
          const errorElements = document.querySelectorAll('.border-red-200');
          for (const el of errorElements) {
            if (el.textContent && el.textContent.trim().length > 0) {
              return 'error';
            }
          }

          return null; // Seguir esperando
        },
        { timeout: 10000 }
      );
    } catch (waitError) {
      // Timeout - diagnosticar estado final
      userResult.tiempo_inscripcion_ms = Date.now() - inscripcionStart;

      // Capturar estado actual para diagnóstico
      const botonTexto = await botonInscribir.textContent().catch(() => null);
      const errorElement = page.locator('.border-red-200').first();
      const errorVisible = await errorElement.isVisible().catch(() => false);
      const errorTexto = errorVisible ? await errorElement.textContent() : null;

      userResult.inscripcion_resultado = 'error_tecnico';
      userResult.inscripcion_mensaje = 'Timeout esperando respuesta';
      userResult.error_log.push(`Timeout - Dialog detectado: ${dialogDetected}, Dialog aceptado: ${dialogAccepted}`);
      userResult.error_log.push(`Timeout - Botón final: "${botonTexto}", Error visible: ${errorVisible}, URL: ${page.url()}`);
      if (errorTexto) {
        userResult.error_log.push(`Mensaje error: ${errorTexto}`);
      }
      return;
    }

    userResult.tiempo_inscripcion_ms = Date.now() - inscripcionStart;
    userResult.error_log.push(`Dialog detectado: ${dialogDetected}, Dialog aceptado: ${dialogAccepted}`);

    // Verificar resultado: buscar botón "✓ Inscripto" (señal inequívoca de éxito)
    const botonExito = page.locator('button:has-text("✓ Inscripto"), span:has-text("✓ Inscripto")').first();
    const exitoVisible = await botonExito.isVisible().catch(() => false);

    if (exitoVisible) {
      userResult.inscripcion_resultado = 'exito';
      userResult.inscripcion_mensaje = 'Inscripción exitosa';
      return;
    }

    // Si no hay botón de éxito, buscar mensaje de error
    const errorElement = page.locator('.border-red-200').first();
    const errorVisible = await errorElement.isVisible().catch(() => false);

    if (errorVisible) {
      const errorText = await errorElement.textContent() || 'Error desconocido';
      userResult.inscripcion_mensaje = errorText.trim();
      userResult.inscripcion_resultado = clasificarError(errorText);
    } else {
      userResult.inscripcion_mensaje = 'No se detectó respuesta';
      userResult.inscripcion_resultado = 'error_tecnico';
      userResult.error_log.push('No se detectó ni botón de éxito ni mensaje de error');
    }

  } catch (error: any) {
    userResult.tiempo_inscripcion_ms = Date.now() - catalogoStart;
    userResult.inscripcion_resultado = 'error_tecnico';
    userResult.inscripcion_mensaje = error.message;
    userResult.error_log.push(`Error en inscripción: ${error.message}`);
    userResult.error_log.push(`Dialog detectado: ${dialogDetected}, Dialog aceptado: ${dialogAccepted}`);
  }
}

/**
 * Test por usuario
 */
test.describe('Prueba de carga - Inscripciones', () => {
  // Configurar concurrencia
  test.describe.configure({ mode: 'parallel' });

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    test(`Usuario ${i + 1}: ${user.email}`, async ({ page }) => {
      const userResult: UserResult = {
        email: user.email,
        registro_ok: true, // Asumimos que ya está registrado
        login_ok: false,
        catalogo_ok: false,
        inscripcion_resultado: null,
        inscripcion_mensaje: null,
        error_5xx: false,
        tiempo_login_ms: 0,
        tiempo_catalogo_ms: 0,
        tiempo_inscripcion_ms: 0,
        error_log: [],
      };

      // Capturar errores 5xx
      page.on('response', response => {
        if (response.status() >= 500) {
          userResult.error_5xx = true;
          userResult.error_log.push(`HTTP ${response.status()} en ${response.url()}`);
        }
      });

      try {
        // 1. IR A LOGIN
        await page.goto(`${BASE_URL}/login`, { timeout: 15000 });

        // 2. LLENAR FORMULARIO
        const loginStart = Date.now();

        await page.fill('input[name="documento"]', user.documento);
        await page.fill('input[name="email"]', user.email);
        await page.fill('input[name="password"]', user.password);

        // 3. SUBMIT (un solo clic)
        await page.click('button[type="submit"]');

        // 4. ESPERAR REDIRECCIÓN A CATÁLOGO
        // Next.js con Server Actions puede no disparar evento 'load' tradicional
        // Esperamos que la URL cambie a /catalogo O que aparezca contenido del catálogo
        try {
          await Promise.race([
            page.waitForURL(/\/catalogo/, { timeout: 30000 }),
            page.waitForSelector('text=/Talleres disponibles|Catálogo/i', { timeout: 30000 })
          ]);
          userResult.tiempo_login_ms = Date.now() - loginStart;
          userResult.login_ok = true;
        } catch (loginError: any) {
          userResult.tiempo_login_ms = Date.now() - loginStart;

          // Diagnóstico de fallo de login
          const currentURL = page.url();
          userResult.error_log.push(`Login falló - URL final: ${currentURL}`);

          // Capturar TODOS los mensajes de error visibles antes de clasificar
          const errorElements = await page.locator('.text-red-700, .border-red-200, .text-red-600').all();
          for (const el of errorElements) {
            const isVisible = await el.isVisible().catch(() => false);
            if (isVisible) {
              const errorText = await el.textContent().catch(() => null);
              if (errorText && errorText.trim()) {
                userResult.error_log.push(`Mensaje de error visible: ${errorText.trim()}`);
              }
            }
          }

          // Si quedó en /login, el login falló
          if (currentURL.includes('/login')) {
            userResult.error_log.push('Login rechazado - permaneció en /login');
          }

          throw loginError;
        }

        // 5. INSCRIPCIÓN (incluye espera real de catálogo)
        await inscribirseATaller(page, userResult);

      } catch (error: any) {
        userResult.error_log.push(`Error general: ${error.message}`);

        if (error.message.includes('Timeout')) {
          userResult.inscripcion_resultado = 'error_tecnico';
          userResult.inscripcion_mensaje = 'Timeout';
        }
      } finally {
        results.push(userResult);
      }
    });
  }
});

/**
 * Test final para mostrar resumen ÚNICO agregado
 */
test.afterAll(async ({}, testInfo) => {
  // Solo imprimir resumen desde el primer worker
  // En ejecuciones paralelas, cada worker tiene su propia instancia de afterAll
  // pero el array 'results' es compartido por referencia, así que esperamos
  // a que todos los tests terminen

  // Esperar brevemente a que todos los workers completen
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Solo el primer test que llega aquí imprime el resumen
  if (results.length === 0) return;

  console.log('');
  console.log('='.repeat(70));
  console.log('📊 RESUMEN DE PRUEBA DE CARGA');
  console.log('='.repeat(70));
  console.log(`URL:               ${BASE_URL}`);
  console.log(`Usuarios:          ${results.length}`);
  console.log('='.repeat(70));
  console.log('');

  const loginOk = results.filter(r => r.login_ok).length;
  const catalogoOk = results.filter(r => r.catalogo_ok).length;
  const inscripcionExito = results.filter(r => r.inscripcion_resultado === 'exito').length;
  const inscripcionRechazo = results.filter(r => r.inscripcion_resultado === 'rechazo_negocio').length;
  const errorTecnico = results.filter(r => r.inscripcion_resultado === 'error_tecnico').length;
  const error5xx = results.filter(r => r.error_5xx).length;

  console.log('✅ RESULTADOS:');
  console.log(`   Login OK:                ${loginOk}/${results.length}`);
  console.log(`   Catálogo OK:             ${catalogoOk}/${results.length}`);
  console.log(`   Inscripciones exitosas:  ${inscripcionExito}`);
  console.log(`   Rechazos de negocio:     ${inscripcionRechazo}`);
  console.log(`   Errores técnicos:        ${errorTecnico}`);
  console.log(`   Errores 5xx:             ${error5xx}`);
  console.log('');

  // Tiempos
  const tiemposLogin = results.filter(r => r.login_ok).map(r => r.tiempo_login_ms);
  const tiemposCatalogo = results.filter(r => r.catalogo_ok).map(r => r.tiempo_catalogo_ms);
  const tiemposInscripcion = results.filter(r => r.tiempo_inscripcion_ms > 0).map(r => r.tiempo_inscripcion_ms);

  if (tiemposLogin.length > 0) {
    const avgLogin = tiemposLogin.reduce((a, b) => a + b, 0) / tiemposLogin.length;
    const p95Login = tiemposLogin.sort((a, b) => a - b)[Math.floor(tiemposLogin.length * 0.95)];
    const maxLogin = Math.max(...tiemposLogin);

    console.log('⏱️  TIEMPOS - LOGIN:');
    console.log(`   Promedio:  ${avgLogin.toFixed(0)}ms`);
    console.log(`   P95:       ${p95Login.toFixed(0)}ms`);
    console.log(`   Máximo:    ${maxLogin.toFixed(0)}ms`);
    console.log('');
  }

  if (tiemposCatalogo.length > 0) {
    const avgCatalogo = tiemposCatalogo.reduce((a, b) => a + b, 0) / tiemposCatalogo.length;
    const p95Catalogo = tiemposCatalogo.sort((a, b) => a - b)[Math.floor(tiemposCatalogo.length * 0.95)];
    const maxCatalogo = Math.max(...tiemposCatalogo);

    console.log('⏱️  TIEMPOS - CATÁLOGO:');
    console.log(`   Promedio:  ${avgCatalogo.toFixed(0)}ms`);
    console.log(`   P95:       ${p95Catalogo.toFixed(0)}ms`);
    console.log(`   Máximo:    ${maxCatalogo.toFixed(0)}ms`);
    console.log('');
  }

  if (tiemposInscripcion.length > 0) {
    const avgInscripcion = tiemposInscripcion.reduce((a, b) => a + b, 0) / tiemposInscripcion.length;
    const p95Inscripcion = tiemposInscripcion.sort((a, b) => a - b)[Math.floor(tiemposInscripcion.length * 0.95)];
    const maxInscripcion = Math.max(...tiemposInscripcion);

    console.log('⏱️  TIEMPOS - INSCRIPCIÓN:');
    console.log(`   Promedio:  ${avgInscripcion.toFixed(0)}ms`);
    console.log(`   P95:       ${p95Inscripcion.toFixed(0)}ms`);
    console.log(`   Máximo:    ${maxInscripcion.toFixed(0)}ms`);
    console.log('');
  }

  // Errores detallados
  const erroresTecnicos = results.filter(r => r.inscripcion_resultado === 'error_tecnico');
  if (erroresTecnicos.length > 0) {
    console.log('❌ ERRORES TÉCNICOS DETALLADOS:');
    erroresTecnicos.forEach(r => {
      console.log(`   ${r.email}: ${r.inscripcion_mensaje}`);
      if (r.error_log.length > 0) {
        r.error_log.forEach(log => console.log(`      - ${log}`));
      }
    });
    console.log('');
  }

  console.log('='.repeat(70));
  console.log('');

  // Guardar resultados en JSON
  const resultadosPath = path.join(__dirname, `resultados-${Date.now()}.json`);
  fs.writeFileSync(resultadosPath, JSON.stringify(results, null, 2));
  console.log(`💾 Resultados guardados en: ${resultadosPath}`);
  console.log('');
});
