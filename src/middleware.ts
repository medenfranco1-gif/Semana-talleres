import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE_NAME = "private_test_access";
const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Crea la pantalla que se muestra mientras el sitio está restringido.
 */
function maintenanceResponse(): NextResponse {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Sitio privado</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #0f172a; }
      main { width: min(100%, 420px); padding: 32px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, .08); text-align: center; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 24px; color: #475569; line-height: 1.5; }
      label { display: block; margin-bottom: 8px; text-align: left; font-size: 14px; font-weight: 600; }
      input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
      button { width: 100%; margin-top: 16px; padding: 12px; border: 0; border-radius: 8px; background: #166534; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
      button:hover { background: #14532d; }
    </style>
  </head>
  <body>
    <main>
      <h1>Sitio privado</h1>
      <p>El sitio está temporalmente restringido. Ingresá la clave para continuar.</p>
      <form method="get">
        <label for="key">Clave de acceso</label>
        <input id="key" name="key" type="password" autocomplete="current-password" required>
        <button type="submit">Ingresar</button>
      </form>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

/**
 * Restringe temporalmente todo el sitio con una clave privada configurada en
 * Vercel. No realiza llamadas de red, por lo que no puede provocar un timeout
 * del API Gateway de Supabase.
 *
 * Si `PRIVATE_TEST_PASSWORD` no está configurada, el gate queda desactivado.
 * Esto permite desplegar el cambio antes de cargar la clave en Vercel sin dejar
 * el sitio inaccesible por una variable olvidada.
 */
export function middleware(request: NextRequest): NextResponse {
  const expectedPassword = process.env.PRIVATE_TEST_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.next();
  }

  const providedPassword = request.nextUrl.searchParams.get("key");
  const cookiePassword = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const hasAccess = providedPassword === expectedPassword || cookiePassword === expectedPassword;

  if (!hasAccess) {
    return maintenanceResponse();
  }

  if (providedPassword === expectedPassword) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("key");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(ACCESS_COOKIE_NAME, expectedPassword, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2|ttf)$).*)",
  ],
};
