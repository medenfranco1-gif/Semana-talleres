import { createServerSupaClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Callback de Supabase Auth. Cuando el usuario hace click en el link del email
 * (recuperación de contraseña), Supabase lo manda acá con el token.
 * Verificamos el token, establecemos la sesión, y redirigimos a /reset.
 *
 * FIX mobile: antes, si el link venía sin type/token_hash o si verifyOtp fallaba,
 * caía al fallback que mandaba al home. Ahora nunca mandamos al home desde acá:
 * si algo falla, va a /login con un error claro. Y si verifica bien pero no es
 * recovery, mandamos a /mi-itinerario (página útil post-login) en vez de al
 * home, para que el alumno no se quede "perdido" en la landing.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Sin token o sin type => link inválido. No mandamos al home: vamos a login
  // con un error que la página de login pueda mostrar.
  if (!token_hash || !type) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(url.toString());
  }

  const supabase = createServerSupaClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as any,
    token_hash,
  });

  // verifyOtp falló => no mandamos al home. Mandamos a login con error.
  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(url.toString());
  }

  // Token válido. Redirigir según el tipo.
  if (type === "recovery" || type === "email_change") {
    return NextResponse.redirect(`${origin}/reset`);
  }

  // Otros tipos (signup, magiclink, etc.): si hay sesión, mandamos al
  // itinerario en vez de al home, que es más útil y evita el "loop del home".
  return NextResponse.redirect(`${origin}/mi-itinerario`);
}
