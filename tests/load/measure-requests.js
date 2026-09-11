const { createClient } = require('@supabase/supabase-js');

// Script para medir requests antes/después de optimización
const SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const SUPABASE_KEY = process.env.TEST_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Faltan TEST_SUPABASE_URL o TEST_SUPABASE_ANON_KEY en .env.loadtest');
  process.exit(1);
}

const EMAIL = 'medenfranco1+loadtest01@gmail.com';
const PASSWORD = 'hola123';
const DNI = '90000001';

async function medirRequestsCatalogo() {
  console.log('\n🔍 MIDIENDO REQUESTS A /catalogo\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 1. Login
  console.log('1️⃣  Login...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: DNI,
  });

  if (authError) {
    console.error('❌ Login falló:', authError.message);
    process.exit(1);
  }

  console.log('✅ Login exitoso');
  console.log(`   Token: ${authData.session.access_token.substring(0, 20)}...`);

  // 2. Simular carga de /catalogo con fetch
  console.log('\n2️⃣  Cargando /catalogo...');
  console.log('   (Este es un fetch HTTP que NO muestra requests server-side de Next.js)');
  console.log('   (Para medir requests reales de Supabase, revisar logs o usar Playwright)\n');

  const catalogoResponse = await fetch('http://localhost:3000/catalogo', {
    headers: {
      'Cookie': `sb-access-token=${authData.session.access_token}; sb-refresh-token=${authData.session.refresh_token}`,
    },
  });

  if (catalogoResponse.status === 307 || catalogoResponse.status === 302) {
    console.log('⚠️  Redirect detectado (SSR session no configurada correctamente)');
    console.log(`   Status: ${catalogoResponse.status}`);
    console.log(`   Location: ${catalogoResponse.headers.get('location')}`);
  } else if (catalogoResponse.ok) {
    console.log('✅ /catalogo respondió OK');
    console.log(`   Status: ${catalogoResponse.status}`);
    console.log(`   Content-Type: ${catalogoResponse.headers.get('content-type')}`);
  } else {
    console.log(`❌ /catalogo falló: ${catalogoResponse.status}`);
  }

  // 3. Logout
  await supabase.auth.signOut();
  console.log('\n✅ Logout completado\n');

  console.log('📊 NOTA: Para medir requests exactas de Supabase, usar:');
  console.log('   - Dashboard de Supabase (API logs)');
  console.log('   - Playwright con network interceptor');
  console.log('   - console.log en createServerSupaClient()');
}

medirRequestsCatalogo().catch(console.error);
