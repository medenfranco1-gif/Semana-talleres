"use server";

import { revalidatePath } from "next/cache";
import { createServerSupaClient } from "@/lib/supabase-server";

export interface LoginState {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

/**
 * Server Action de login. Valida credenciales contra Supabase Auth.
 * El cliente SSR setea cookies automáticamente.
 *
 * Devuelve { ok, redirectTo } en lugar de llamar redirect(), porque el
 * redirect() de Next lanza una excepción que llega al cliente como estado
 * undefined y rompe useActionState. El cliente navega con router.push.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const documentoRaw = String(formData.get("documento") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") || "/catalogo");

  if (!email || !password) {
    return { ok: false, error: "Completá email y contraseña." };
  }

  const supabase = createServerSupaClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: traducirErrorAuth(error.message) };
  }

  // Verificar DNI solo para alumnos (admin no necesita)
  const userId = data.user?.id;
  if (userId) {
    const { data: alumno } = await supabase
      .from("alumnos")
      .select("documento, rol")
      .eq("auth_user_id", userId)
      .single() as { data: { documento: string; rol: string } | null };

    // Si es alumno, validar DNI
    if (alumno && alumno.rol === "alumno") {
      if (!documentoRaw) {
        await supabase.auth.signOut();
        return { ok: false, error: "Los alumnos deben ingresar su DNI." };
      }

      // Normalizar documento: solo dígitos
      const documento = documentoRaw.replace(/[^0-9]/g, "");
      if (documento.length < 7) {
        await supabase.auth.signOut();
        return { ok: false, error: "El DNI no es válido (mínimo 7 números)." };
      }

      if (alumno.documento !== documento) {
        await supabase.auth.signOut();
        return { ok: false, error: "DNI incorrecto." };
      }
    }
  }

  revalidatePath("/", "layout");
  // Sanitizar redirect para evitar open redirect (solo rutas internas).
  const safe = redirectTo.startsWith("/") ? redirectTo : "/catalogo";
  return { ok: true, redirectTo: safe };
}

function traducirErrorAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (m.includes("email not confirmed")) {
    return "Tenés que confirmar tu email antes de ingresar.";
  }
  if (m.includes("rate limit")) {
    return "Demasiados intentos. Esperá unos minutos.";
  }
  return msg;
}
