import { createServerSupaClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Callback de Supabase Auth. Cuando el usuario hace click en el link del email
 * (recuperación de contraseña), Supabase lo manda acá con el token.
 * Verificamos el token, establecemos la sesión, y redirigimos a /reset.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  // Si es un recovery, redirigimos a /reset
  if (token_hash && type) {
    const supabase = createServerSupaClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (!error) {
      // Token válido, redirigir según el tipo
      if (type === "recovery" || type === "email_change") {
        return NextResponse.redirect(`${origin}/reset`);
      }
      // Otros tipos (signup, etc) van a next o home
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Si hay error o no hay token, redirigir a login con error
  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
