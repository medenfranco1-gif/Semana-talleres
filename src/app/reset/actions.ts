"use server";

import { createServerSupaClient } from "@/lib/supabase-server";

export interface ResetState {
  ok: boolean;
  error?: string;
}

/**
 * Server Action: setea la nueva contraseña del usuario que viene del link de
 * recuperación de email. El usuario ya quedó autenticado por el token de
 * Supabase (sesión establecida al abrir el link), así que updateUser() cambia
 * la contraseña de esa sesión.
 */
export async function resetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (password !== confirm) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const supabase = createServerSupaClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return {
      ok: false,
      error: "El link expiró o no es válido. Pedí el recovery de nuevo.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("weak")) {
      return { ok: false, error: "La contraseña es demasiado débil." };
    }
    if (m.includes("rate limit")) {
      return { ok: false, error: "Demasiados intentos. Esperá unos minutos." };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
