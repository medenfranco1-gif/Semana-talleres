const puppeteer = require('puppeteer');

const TEST_EMAIL = 'medenfranco1+loadtest01@gmail.com';
const TEST_DNI = '90000001';
const PORT = 3003;

async function measureRequests() {
  console.log('\n🔍 MIDIENDO REQUESTS A /catalogo (Puerto ' + PORT + ')\n');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const requests = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('supabase.co')) {
      requests.push({
        url,
        method: request.method(),
        timestamp: Date.now()
      });
    }
  });

  try {
    // 1. Login
    console.log('1️⃣  Navegando a /login...');
    await page.goto(`http://localhost:${PORT}/login`, { waitUntil: 'networkidle2' });

    const requestsBeforeLogin = requests.length;
    console.log(`   Requests antes de submit: ${requestsBeforeLogin}\n`);

    await page.type('input[id="email"]', TEST_EMAIL);
    await page.type('input[id="documento"]', TEST_DNI);
    await page.type('input[id="password"]', TEST_DNI);

    console.log('2️⃣  Haciendo login...');
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    const currentUrl = page.url();
    console.log(`   URL actual: ${currentUrl}`);

    if (currentUrl.includes('/catalogo')) {
      console.log('✅ Login exitoso, en /catalogo\n');

      // Esperar 2 segundos adicionales
      await page.waitForTimeout(2000);

      console.log('📊 RESUMEN DE REQUESTS:\n');
      console.log(`   Total requests a Supabase: ${requests.length}\n`);

      // Agrupar por endpoint
      const grouped = {};
      for (const req of requests) {
        let endpoint = 'other';

        if (req.url.includes('/auth/v1/user')) endpoint = 'auth.getUser()';
        else if (req.url.includes('/auth/v1/token')) endpoint = 'auth.signIn/token';
        else if (req.url.includes('/rest/v1/alumnos')) endpoint = 'alumnos';
        else if (req.url.includes('/rest/v1/talleres')) endpoint = 'talleres';
        else if (req.url.includes('/rest/v1/categorias')) endpoint = 'categorias';
        else if (req.url.includes('/rest/v1/configuracion')) endpoint = 'configuracion';
        else if (req.url.includes('/rest/v1/inscripciones')) endpoint = 'inscripciones';
        else if (req.url.includes('/rest/v1/rpc/contar_cupos_talleres')) endpoint = 'RPC contar_cupos';

        grouped[endpoint] = (grouped[endpoint] || 0) + 1;
      }

      // Mostrar resultados ordenados
      const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
      for (const [endpoint, count] of entries) {
        console.log(`   ${endpoint.padEnd(30)} ${count}x`);
      }

      console.log('\n✅ Medición completada\n');
    } else {
      console.log('❌ Login falló, no llegó a /catalogo\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

measureRequests().catch(console.error);
