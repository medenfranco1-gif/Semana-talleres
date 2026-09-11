#!/usr/bin/env node

/**
 * Script de registro de usuarios de prueba
 *
 * Uso:
 *   npm run test:register:5
 *   npm run test:register:10
 *   npm run test:register:20
 *
 * IMPORTANTE:
 * - Lee configuración de .env.loadtest
 * - Solo funciona contra localhost + Supabase de prueba
 * - Usa datos claramente ficticios de tests/load/register-users.json
 * - No borra usuarios existentes
 */

const fs = require('fs');
const path = require('path');

// Cargar variables desde .env.loadtest
const envPath = path.join(__dirname, '..', '..', '.env.loadtest');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No existe .env.loadtest');
  console.error('');
  console.error('   1. Copiá el archivo de ejemplo:');
  console.error('      copy .env.loadtest.example .env.loadtest');
  console.error('');
  console.error('   2. Editalo con las credenciales del Supabase de PRUEBA');
  console.error('');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

// Configuración
const BASE_URL = envVars.BASE_URL || process.env.BASE_URL;
const TEST_SUPABASE_URL = envVars.TEST_SUPABASE_URL;

// URLs de producción conocidas (para verificación)
const PRODUCTION_SUPABASE_URLS = [
  'fmrlewcfttxgcftycfsfp.supabase.co', // Supabase de producción
];

// Validar argumentos
const count = parseInt(process.argv[2] || '0', 10);
if (!count || count <= 0) {
  console.error('❌ Error: Especifica la cantidad de usuarios a crear');
  console.error('   Ejemplo: npm run test:register:5');
  process.exit(1);
}

// Validar BASE_URL
if (!BASE_URL) {
  console.error('❌ Error: BASE_URL no definida en .env.loadtest');
  console.error('   Editá .env.loadtest y configurá BASE_URL=http://localhost:3000');
  process.exit(1);
}

// Validar TEST_SUPABASE_URL
if (!TEST_SUPABASE_URL) {
  console.error('❌ Error: TEST_SUPABASE_URL no definida en .env.loadtest');
  console.error('   Editá .env.loadtest y configurá las credenciales del Supabase de PRUEBA');
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
  console.error('   Esto modificaría la base de datos REAL.');
  console.error('');
  console.error('   Verificá que .env.loadtest tenga las credenciales del Supabase de PRUEBA:');
  console.error('   - Semana-Talleres-Prueba-400');
  console.error('');
  process.exit(1);
}

// Validar que BASE_URL sea localhost
if (!BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1')) {
  console.error('⚠️  ADVERTENCIA: BASE_URL no es localhost');
  console.error(`   BASE_URL actual: ${BASE_URL}`);
  console.error('');
  console.error('   Este sistema está diseñado para correr contra localhost + Supabase de prueba.');
  console.error('   Si querés continuar, asegurate que la app NO esté conectada a producción.');
  console.error('');
}

// Cargar usuarios
const usersFilePath = path.join(__dirname, 'register-users.json');
if (!fs.existsSync(usersFilePath)) {
  console.error('❌ Error: No existe tests/load/register-users.json');
  console.error('');
  console.error('   1. Copiá el archivo de ejemplo:');
  console.error('      cp tests/load/register-users.example.json tests/load/register-users.json');
  console.error('');
  console.error('   2. Editalo si necesitás más usuarios o cambiar datos');
  console.error('');
  process.exit(1);
}

let users;
try {
  users = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
} catch (error) {
  console.error('❌ Error leyendo register-users.json:', error.message);
  process.exit(1);
}

// Validar cantidad disponible
if (count > users.length) {
  console.error(`❌ Error: Pediste ${count} usuarios pero register-users.json solo tiene ${users.length}`);
  console.error('');
  console.error('   Opciones:');
  console.error(`   1. Reduce la cantidad: npm run test:register:${users.length}`);
  console.error('   2. Agrega más usuarios a tests/load/register-users.json');
  console.error('');
  process.exit(1);
}

// Ejecutar registro
const usersToRegister = users.slice(0, count);

console.log('');
console.log('🔧 REGISTRO DE USUARIOS DE PRUEBA');
console.log('='.repeat(50));
console.log(`URL:      ${BASE_URL}`);
console.log(`Usuarios: ${count}`);
console.log(`Archivo:  ${usersFilePath}`);
console.log(`Supabase: ${TEST_SUPABASE_URL}`);
console.log('='.repeat(50));
console.log('');

if (isPointingToProduction) {
  console.log('⚠️  ADVERTENCIA: EJECUTANDO CONTRA PRODUCCIÓN');
  console.log('');
}

(async () => {
  const results = {
    success: 0,
    alreadyExists: 0,
    error: 0,
    details: []
  };

  for (let i = 0; i < usersToRegister.length; i++) {
    const user = usersToRegister[i];
    const userLabel = `${user.nombre} ${user.apellido} (${user.email})`;

    process.stdout.write(`[${i + 1}/${count}] Registrando ${userLabel}... `);

    const startTime = Date.now();

    try {
      const formData = new URLSearchParams();
      formData.append('nombre', user.nombre);
      formData.append('apellido', user.apellido);
      formData.append('documento', user.documento);
      formData.append('curso', user.curso);
      formData.append('division', user.division);
      formData.append('email', user.email);
      formData.append('password', user.password);

      const response = await fetch(`${BASE_URL}/registro`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      });

      const duration = Date.now() - startTime;
      const html = await response.text();

      // DETECCIÓN DE ÉXITO: Solo si hay evidencia inequívoca
      // 1. Redirección exitosa: registro/actions.ts devuelve redirectTo: "/login?registrado=1"
      // 2. RegistroForm.tsx ejecuta router.push() - Next.js hace redirect del lado cliente
      // 3. La respuesta HTTP será el HTML de /login?registrado=1, NO el formulario de registro

      const isSuccessRedirect = response.url.includes('/login?registrado=1') ||
                                response.url.includes('/login');

      // Detectar errores en el formulario (cuando vuelve a /registro con error)
      const errorMatch = html.match(/<div[^>]*class="[^"]*border-red-200[^"]*"[^>]*>(.*?)<\/div>/s);
      const errorMessage = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : null;

      // Detectar si quedó en el formulario (tiene el botón "Crear cuenta")
      const isStillInForm = html.includes('type="submit"') &&
                           (html.includes('Crear cuenta') || html.includes('Creando'));

      // Clasificar resultado
      if (isSuccessRedirect && !isStillInForm) {
        // Éxito: redirigió a /login
        console.log(`✅ OK (${duration}ms)`);
        results.success++;
        results.details.push({
          user: userLabel,
          status: 'success',
          duration
        });
      } else if (errorMessage) {
        // Error detectado en el formulario
        const isAlreadyExists = errorMessage.includes('Ya existe') ||
                               errorMessage.includes('already registered');

        if (isAlreadyExists) {
          console.log(`⚠️  Ya existe (${duration}ms) - ${errorMessage}`);
          results.alreadyExists++;
          results.details.push({
            user: userLabel,
            status: 'already_exists',
            duration,
            errorMessage
          });
        } else {
          console.log(`❌ Error (${duration}ms) - ${errorMessage}`);
          results.error++;
          results.details.push({
            user: userLabel,
            status: 'error',
            duration,
            errorMessage
          });
        }
      } else if (isStillInForm) {
        // Quedó en el formulario pero sin mensaje de error visible
        console.log(`❌ Error (${duration}ms) - Quedó en formulario sin mensaje claro`);
        results.error++;
        results.details.push({
          user: userLabel,
          status: 'error',
          duration,
          errorMessage: 'Quedó en formulario de registro'
        });
      } else if (!response.ok) {
        // Error HTTP
        console.log(`❌ Error HTTP ${response.status} (${duration}ms)`);
        results.error++;
        results.details.push({
          user: userLabel,
          status: 'error',
          statusCode: response.status,
          duration
        });
      } else {
        // Caso inesperado
        console.log(`⚠️  Respuesta inesperada (${duration}ms)`);
        results.error++;
        results.details.push({
          user: userLabel,
          status: 'error',
          duration,
          errorMessage: 'Respuesta no clasificable'
        });
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ Error: ${error.message} (${duration}ms)`);
      results.error++;
      results.details.push({
        user: userLabel,
        status: 'error',
        error: error.message,
        duration
      });
    }

    // Pequeña pausa entre registros para no saturar
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Resumen
  console.log('');
  console.log('='.repeat(50));
  console.log('📊 RESUMEN');
  console.log('='.repeat(50));
  console.log(`✅ Registrados:     ${results.success}`);
  console.log(`⚠️  Ya existían:    ${results.alreadyExists}`);
  console.log(`❌ Errores:         ${results.error}`);
  console.log(`📝 Total:           ${count}`);
  console.log('='.repeat(50));

  // Duración promedio
  const durations = results.details.map(d => d.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`);
  console.log('');

  if (results.success > 0) {
    console.log('✅ Usuarios listos para pruebas de carga');
    console.log('   Ejecutá: npm run test:load:' + results.success);
    console.log('');
  }

  if (results.error > 0) {
    console.log('⚠️  Algunos usuarios no se registraron correctamente');
    console.log('   Revisá los errores arriba y reintentá');
    console.log('');
  }

  process.exit(results.error > 0 ? 1 : 0);
})();
