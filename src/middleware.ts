import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware de enrutamiento sin llamadas de red.
 *
 * La autenticación y la autorización se verifican en los Server Components y
 * Server Actions de cada área. Mantener consultas a Supabase acá hacía que un
 * problema temporal del API Gateway bloqueara cualquier navegación protegida
 * con un 504 de Vercel.
 */
export function middleware(_req: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  matcher: ["/catalogo/:path*", "/inscripciones/:path*", "/mi-itinerario/:path*", "/admin/:path*"],
};
