/**
 * Script para verificar sincronización de DNI entre register-users.json y Supabase
 *
 * Uso:
 *   node tests/load/verify-sync.js
 */

const fs = require('fs');
const path = require('path');

// Cargar .env.loadtest
const envPath = path.join(__dirname, '..', '..', '.env.loadtest');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: No existe .env.loadtest');
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

if (!TEST_SUPABASE_URL || !TEST_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Faltan variables en .env.loadtest');
  process.exit(1);
}

// Cargar register-users.json
const usersPath = path.join(__dirname, 'register-users.json');
const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));

console.log('');
console.log('🔍 VERIFICACIÓN DE SINCRONIZACIÓN DNI');
console.log('='.repeat(60));
console.log('');

(async () => {
  let coinciden = 0;
  let desincronizados = 0;

  for (let i = 0; i < Math.min(users.length, 50); i++) {
    const user = users[i];

    // Buscar en Supabase
    const response = await fetch(
      `${TEST_SUPABASE_URL}/rest/v1/alumnos?email=eq.${encodeURIComponent(user.email)}&select=documento`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': TEST_SUPABASE_SERVICE_ROLE_KEY
        }
      }
    );

    const data = await response.json();

    if (data && data.length > 0) {
      const dniSupabase = data[0].documento;
      const dniJSON = user.documento;

      if (dniSupabase === dniJSON) {
        console.log(`✅ ${user.email}: ${dniJSON}`);
        coinciden++;
      } else {
        console.log(`❌ ${user.email}: JSON=${dniJSON}, Supabase=${dniSupabase}`);
        desincronizados++;
      }
    } else {
      console.log(`⚠️  ${user.email}: No existe en Supabase`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`✅ Coinciden:         ${coinciden}`);
  console.log(`❌ Desincronizados:   ${desincronizados}`);
  console.log('='.repeat(60));
  console.log('');
})();
