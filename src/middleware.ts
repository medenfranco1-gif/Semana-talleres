import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Database } from "./lib/database-types";

// Rutas protegidas: /admin requiere rol admin; /catalogo e /inscripciones
// requieren sesión. El resto es público.
const PROTECTED = ["/catalogo", "/inscripciones", "/mi-itinerario"];
const ADMIN = ["/admin"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // clientes que no necesitan sesión
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  const isAdmin = ADMIN.some((p) => pathname.startsWith(p));
  if (!isProtected && !isAdmin) {
    return res;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (isAdmin) {
    // verificar rol admin en la BD
    const { data } = await supabase
      .from("alumnos")
      .select("rol")
      .eq("auth_user_id", user.id)
      .single();
    if (data?.rol !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/catalogo/:path*", "/inscripciones/:path*", "/mi-itinerario/:path*", "/admin/:path*"],
};
