import { test as playwrightTest } from "@playwright/test";

const TEST_EMAIL = "medenfranco1+loadtest01@gmail.com";
const TEST_DNI = "90000001";

/**
 * Script para contar requests reales a Supabase durante la carga de /catalogo.
 * Intercepta todas las llamadas de red y las agrupa por endpoint.
 */
playwrightTest("Contar requests a Supabase en /catalogo", async ({ page }) => {
  const requests: { url: string; method: string }[] = [];

  // Interceptar todas las requests
  page.on("request", (request) => {
    const url = request.url();
    // Solo registrar requests a Supabase
    if (url.includes("supabase.co")) {
      requests.push({
        url,
        method: request.method(),
      });
    }
  });

  console.log("\n🔍 MIDIENDO REQUESTS A SUPABASE DURANTE CARGA DE /CATALOGO\n");

  // 1. Login
  console.log("1️⃣  Navegando a /login...");
  await page.goto("http://localhost:3000/login");
  await page.fill('input[id="email"]', TEST_EMAIL);
  await page.fill('input[id="documento"]', TEST_DNI);
  await page.fill('input[id="password"]', TEST_DNI);

  const requestsBeforeLogin = requests.length;
  console.log(`   Requests antes de login: ${requestsBeforeLogin}`);

  await page.click('button[type="submit"]');
  await page.waitForURL(/\/catalogo/, { timeout: 30000 });

  console.log("✅ Login exitoso, redirigido a /catalogo\n");

  // 2. Esperar a que el catálogo esté completamente cargado
  await page.waitForSelector('[data-testid="taller-card"]', { timeout: 15000 }).catch(() => {
    console.log("⚠️  No se encontraron tarjetas de taller");
  });

  // Esperar 2 segundos adicionales para capturar requests asíncronas
  await page.waitForTimeout(2000);

  console.log("📊 RESUMEN DE REQUESTS:\n");
  console.log(`   Total requests a Supabase: ${requests.length}\n`);

  // Agrupar por endpoint
  const grouped: Record<string, number> = {};
  for (const req of requests) {
    let endpoint = "other";

    if (req.url.includes("/auth/v1/user")) endpoint = "auth.getUser()";
    else if (req.url.includes("/auth/v1/token")) endpoint = "auth.signIn/token";
    else if (req.url.includes("/rest/v1/alumnos")) endpoint = "alumnos";
    else if (req.url.includes("/rest/v1/talleres")) endpoint = "talleres";
    else if (req.url.includes("/rest/v1/categorias")) endpoint = "categorias";
    else if (req.url.includes("/rest/v1/configuracion")) endpoint = "configuracion";
    else if (req.url.includes("/rest/v1/inscripciones")) endpoint = "inscripciones";
    else if (req.url.includes("/rest/v1/rpc/contar_cupos_talleres")) endpoint = "RPC contar_cupos";

    grouped[endpoint] = (grouped[endpoint] || 0) + 1;
  }

  // Mostrar resultados ordenados
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  for (const [endpoint, count] of entries) {
    console.log(`   ${endpoint.padEnd(25)} ${count}x`);
  }

  console.log("\n✅ Medición completada\n");
});
