/**
 * Script para crear usuarios de prueba usando Supabase Admin API
 *
 * SOLO para el entorno de prueba Semana-Talleres-Prueba-400.
 *
 * Uso:
 *   node tests/load/setup-users.js 50
 *
 * Crea usuarios en Supabase Auth + perfiles en public.alumnos
 */

const fs = require('fs');
const path = require('path');

// Cargar .env.loadtest
const envPath = path.join(__dirname, '..', '..', '.env.loadtest');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No existe .env.loadtest');
  console.error('   Copiá: copy .env.loadtest.example .env.loadtest');
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

const TEST_SUPABASE_URL = envVars.TEST_SUPABASE_URL;
const TEST_SUPABASE_SERVICE_ROLE_KEY = envVars.TEST_SUPABASE_SERVICE_ROLE_KEY;

// Project Ref EXACTO del entorno de prueba Semana-Talleres-Prueba-400
const ALLOWED_PROJECT_REF = 'sslftnpjyurvqvavknqq';

// URLs de producción conocidas
const PRODUCTION_SUPABASE_URLS = [
  'fmrlewcfttxgcftycfsfp.supabase.co',
];

// VALIDACIONES
if (!TEST_SUPABASE_URL) {
  console.error('❌ Error: TEST_SUPABASE_URL no definida en .env.loadtest');
  process.exit(1);
}

// PROTECCIÓN OBLIGATORIA: Solo permitir el Project Ref exacto del entorno de prueba
if (!TEST_SUPABASE_URL.includes(ALLOWED_PROJECT_REF)) {
  console.error('❌ ERROR: Este script solo puede ejecutarse contra Semana-Talleres-Prueba-400.');
  console.error('');
  console.error(`   TEST_SUPABASE_URL actual: ${TEST_SUPABASE_URL}`);
  console.error(`   Project Ref requerido:    ${ALLOWED_PROJECT_REF}`);
  console.error('');
  console.error('   Verificá que .env.loadtest tenga la URL correcta del proyecto de prueba.');
  console.error('');
  process.exit(1);
}

if (!TEST_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: TEST_SUPABASE_SERVICE_ROLE_KEY no definida en .env.loadtest');
  console.error('   Esta clave es necesaria para usar Supabase Admin API.');
  console.error('   Obtené la Service Role Key desde el dashboard de Supabase:');
  console.error('   Settings → API → service_role key (secret)');
  process.exit(1);
}

// PROTECCIÓN: Verificar que NO apunte a producción
const isPointingToProduction = PRODUCTION_SUPABASE_URLS.some(prodUrl =>
  TEST_SUPABASE_URL.includes(prodUrl)
);

if (isPointingToProduction) {
  console.error('❌ ERROR: EL SCRIPT ESTÁ APUNTANDO A PRODUCCIÓN');
  console.error('');
  console.error(`   TEST_SUPABASE_URL: ${TEST_SUPABASE_URL}`);
  console.error('');
  console.error('   Verificá .env.loadtest - debe apuntar al Supabase de PRUEBA');
  console.error('');
  process.exit(1);
}

// Obtener cantidad de usuarios a crear
const count = parseInt(process.argv[2] || '20', 10);

if (count < 1 || count > 200) {
  console.error('❌ Error: Cantidad debe estar entre 1 y 200');
  console.error(`   Recibido: ${count}`);
  process.exit(1);
}

console.log('');
console.log('🔧 SETUP DE USUARIOS DE PRUEBA - SUPABASE ADMIN API');
console.log('='.repeat(60));
console.log(`Supabase URL:  ${TEST_SUPABASE_URL}`);
console.log(`Usuarios:      ${count}`);
console.log('='.repeat(60));
console.log('');

// Generar usuarios
const users = [];
for (let i = 1; i <= count; i++) {
  const num = String(i).padStart(2, '0');
  users.push({
    email: `medenfranco1+loadtest${num}@gmail.com`,
    password: 'hola123',
    nombre: 'Test',
    apellido: `Alumno${num}`,
    documento: `900000${num}`,
    curso: '5°',
    division: 'A'
  });
}

// Resultados
const results = {
  authCreated: 0,
  authAlreadyExists: 0,
  alumnosCreated: 0,
  alumnosAlreadyExists: 0,
  errors: 0,
  details: []
};

(async () => {
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userLabel = `${user.email}`;

    process.stdout.write(`[${i + 1}/${count}] Procesando ${userLabel}... `);

    try {
      // 1. Crear usuario en Supabase Auth usando Admin API
      const authResponse = await fetch(`${TEST_SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': TEST_SUPABASE_SERVICE_ROLE_KEY
        },
        body: JSON.stringify({
          email: user.email,
          password: user.password,
          email_confirm: true, // Auto-confirmar email para testing
          user_metadata: {
            nombre: user.nombre,
            apellido: user.apellido,
            documento: user.documento,
            curso: user.curso,
            division: user.division
          }
        })
      });

      const authData = await authResponse.json();

      let authUserId;
      let authStatus = 'created';

      if (authResponse.ok) {
        authUserId = authData.id;
        results.authCreated++;
      } else if (authData.code === 'user_already_exists' || authData.msg?.includes('already been registered')) {
        // Usuario ya existe - buscar su ID
        authStatus = 'already_exists';
        results.authAlreadyExists++;

        // Buscar usuario por email usando Admin API
        const searchResponse = await fetch(`${TEST_SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(user.email)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${TEST_SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': TEST_SUPABASE_SERVICE_ROLE_KEY
          }
        });

        const searchData = await searchResponse.json();

        if (searchResponse.ok && searchData.users && searchData.users.length > 0) {
          authUserId = searchData.users[0].id;
        } else {
          console.log(`❌ Error: No se pudo encontrar usuario existente`);
          results.errors++;
          results.details.push({
            user: userLabel,
            status: 'error',
            message: 'No se pudo encontrar usuario en Auth'
          });
          continue;
        }
      } else {
        console.log(`❌ Error Auth: ${authData.msg || authData.message || 'Desconocido'}`);
        results.errors++;
        results.details.push({
          user: userLabel,
          status: 'error',
          message: authData.msg || authData.message
        });
        continue;
      }

      // 2. Asegurar fila en public.alumnos
      // Primero verificar si ya existe
      const checkResponse = await fetch(`${TEST_SUPABASE_URL}/rest/v1/alumnos?auth_user_id=eq.${authUserId}&select=id`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${TEST_SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': TEST_SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json'
        }
      });

      const existingAlumnos = await checkResponse.json();

      let alumnoStatus;

      if (existingAlumnos && existingAlumnos.length > 0) {
        // Ya existe
        alumnoStatus = 'already_exists';
        results.alumnosAlreadyExists++;
      } else {
        // Insertar nuevo
        const insertResponse = await fetch(`${TEST_SUPABASE_URL}/rest/v1/alumnos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TEST_SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': TEST_SUPABASE_SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            auth_user_id: authUserId,
            email: user.email,
            nombre: user.nombre,
            apellido: user.apellido,
            documento: user.documento,
            curso: user.curso,
            division: user.division,
            rol: 'alumno'
          })
        });

        if (insertResponse.ok || insertResponse.status === 201) {
          alumnoStatus = 'created';
          results.alumnosCreated++;
        } else {
          const errorData = await insertResponse.json();
          console.log(`⚠️  Error insertando alumno: ${errorData.message || 'Desconocido'}`);
          alumnoStatus = 'error';
          results.errors++;
        }
      }

      console.log(`✅ Auth: ${authStatus}, Alumno: ${alumnoStatus}`);

      results.details.push({
        user: userLabel,
        status: 'success',
        authStatus,
        alumnoStatus
      });

    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      results.errors++;
      results.details.push({
        user: userLabel,
        status: 'error',
        message: error.message
      });
    }
  }

  // Resumen final
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('='.repeat(60));
  console.log(`Total usuarios:           ${count}`);
  console.log(`Auth creados:             ${results.authCreated}`);
  console.log(`Auth ya existentes:       ${results.authAlreadyExists}`);
  console.log(`Alumnos creados:          ${results.alumnosCreated}`);
  console.log(`Alumnos ya existentes:    ${results.alumnosAlreadyExists}`);
  console.log(`Errores:                  ${results.errors}`);
  console.log('='.repeat(60));
  console.log('');

  // Guardar resultados
  const resultadosPath = path.join(__dirname, `setup-resultados-${Date.now()}.json`);
  fs.writeFileSync(resultadosPath, JSON.stringify(results, null, 2));
  console.log(`💾 Resultados guardados en: ${resultadosPath}`);
  console.log('');
})();
