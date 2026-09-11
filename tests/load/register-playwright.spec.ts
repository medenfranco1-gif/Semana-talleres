import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Registro de usuarios de prueba con Playwright - FLUJO REAL DEL NAVEGADOR
 *
 * Este script reproduce EXACTAMENTE lo que hace un alumno real:
 * 1. Abre /registro en un navegador
 * 2. Completa el formulario con los campos reales
 * 3. Pulsa "Crear cuenta"
 * 4. Espera la navegación real a /login?registrado=1
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

// Obtener cantidad de usuarios a registrar
const count = parseInt(process.env.REGISTER_COUNT || '1', 10);
const users = allUsers.slice(0, count);

console.log('');
console.log('🔧 REGISTRO DE USUARIOS CON PLAYWRIGHT (NAVEGADOR REAL)');
console.log('='.repeat(60));
console.log(`BASE_URL:     ${BASE_URL}`);
console.log(`TEST_SUPABASE: ${TEST_SUPABASE_URL}`);
console.log(`USUARIOS:     ${count}`);
console.log('='.repeat(60));
console.log('');
console.log('👥 USUARIOS A REGISTRAR:');
users.forEach((u: any, idx: number) => {
  console.log(`   ${idx + 1}. ${u.email} (${u.nombre} ${u.apellido}, DNI: ${u.documento}, Curso: ${u.curso}${u.division})`);
});
console.log('');
console.log('⚠️  NO se mostrarán contraseñas por seguridad');
console.log('='.repeat(60));
console.log('');

interface RegistroResultado {
  email: string;
  success: boolean;
  duration_ms: number;
  final_url?: string;
  error_message?: string;
  status: 'success' | 'already_exists' | 'error' | 'timeout';
}

const resultados: RegistroResultado[] = [];

/**
 * Test de registro por usuario
 */
test.describe('Registro de usuarios de prueba', () => {
  // Ejecutar en serie (uno por vez) para evitar race conditions en Supabase
  test.describe.configure({ mode: 'serial' });

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    test(`[${i + 1}/${users.length}] Registrar ${user.email}`, async ({ page }) => {
      const resultado: RegistroResultado = {
        email: user.email,
        success: false,
        duration_ms: 0,
        status: 'error'
      };

      const startTime = Date.now();

      try {
        console.log(`\n[${i + 1}/${users.length}] Registrando ${user.email}...`);

        // 1. Navegar a /registro
        await page.goto(`${BASE_URL}/registro`, { timeout: 15000 });

        // 2. Completar formulario con los selectores REALES
        await page.fill('input[name="nombre"]', user.nombre);
        await page.fill('input[name="apellido"]', user.apellido);
        await page.fill('input[name="documento"]', user.documento);
        await page.fill('input[name="curso"]', user.curso);
        await page.fill('input[name="division"]', user.division);
        await page.fill('input[name="email"]', user.email);
        await page.fill('input[name="password"]', user.password);

        // 3. Pulsar "Crear cuenta"
        await page.click('button[type="submit"]:has-text("Crear cuenta")');

        // 4. Esperar resultado (éxito o error)
        try {
          // Esperar navegación a /login?registrado=1 (éxito)
          await page.waitForURL(/\/login\?registrado=1/, { timeout: 15000 });

          resultado.duration_ms = Date.now() - startTime;
          resultado.final_url = page.url();
          resultado.success = true;
          resultado.status = 'success';

          console.log(`   ✅ OK (${resultado.duration_ms}ms) - Redirigió a ${resultado.final_url}`);

        } catch (waitError) {
          // No redirigió - verificar si hay error en el formulario
          resultado.duration_ms = Date.now() - startTime;
          resultado.final_url = page.url();

          // Buscar mensaje de error en el formulario
          const errorElement = await page.locator('.border-red-200, .text-red-700').first();
          const errorVisible = await errorElement.isVisible().catch(() => false);

          if (errorVisible) {
            const errorText = await errorElement.textContent() || 'Error desconocido';
            resultado.error_message = errorText.trim();

            // Clasificar si es "ya existe" o error genérico
            if (errorText.includes('Ya existe') || errorText.includes('already registered')) {
              resultado.status = 'already_exists';
              console.log(`   ⚠️  Ya existe (${resultado.duration_ms}ms) - ${resultado.error_message}`);
            } else {
              resultado.status = 'error';
              console.log(`   ❌ Error (${resultado.duration_ms}ms) - ${resultado.error_message}`);
            }
          } else {
            // Sin error visible pero sin redirección = timeout
            resultado.status = 'timeout';
            resultado.error_message = `Timeout - quedó en ${resultado.final_url}`;
            console.log(`   ⏱️  Timeout (${resultado.duration_ms}ms) - URL final: ${resultado.final_url}`);
          }
        }

      } catch (error: any) {
        resultado.duration_ms = Date.now() - startTime;
        resultado.status = 'error';
        resultado.error_message = error.message;
        console.log(`   ❌ Error (${resultado.duration_ms}ms) - ${error.message}`);
      } finally {
        resultados.push(resultado);
      }
    });
  }
});

/**
 * Resumen final
 */
test.afterAll(async () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 RESUMEN DE REGISTRO');
  console.log('='.repeat(60));
  console.log(`Total usuarios:    ${resultados.length}`);
  console.log(`✅ Exitosos:       ${resultados.filter(r => r.status === 'success').length}`);
  console.log(`⚠️  Ya existían:    ${resultados.filter(r => r.status === 'already_exists').length}`);
  console.log(`❌ Errores:        ${resultados.filter(r => r.status === 'error').length}`);
  console.log(`⏱️  Timeouts:       ${resultados.filter(r => r.status === 'timeout').length}`);
  console.log('='.repeat(60));
  console.log('');

  // Mostrar detalles de errores
  const errores = resultados.filter(r => r.status === 'error' || r.status === 'timeout');
  if (errores.length > 0) {
    console.log('❌ DETALLES DE ERRORES:');
    errores.forEach(r => {
      console.log(`   ${r.email}: ${r.error_message}`);
    });
    console.log('');
  }

  // Guardar resultados
  const resultadosPath = path.join(__dirname, `registro-resultados-${Date.now()}.json`);
  fs.writeFileSync(resultadosPath, JSON.stringify(resultados, null, 2));
  console.log(`💾 Resultados guardados en: ${resultadosPath}`);
  console.log('');
});
