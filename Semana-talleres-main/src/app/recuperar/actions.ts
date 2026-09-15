"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupaClient } from "@/lib/supabase-server";

export interface RecuperarState {
  ok: boolean;
  error?: string;
}

/**
 * Server Action: manda el email de recuperación de contraseña a la casilla
 * del alumno. Supabase envía un link con token que lleva a /reset?...
 * No revela si el email existe o no (seguridad: evita enumeración de usuarios).
 */
export async function recuperarAction(
  _prev: RecuperarState,
  formData: FormData,
): Promise<RecuperarState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Poné un email válido." };
  }

  const supabase = createServerSupaClient();
  // El redirect URL es la ruta a donde llega el token de reseteo.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const redirectTo = `${siteUrl}/reset`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // Importante: no revelar si el email existe o no (anti-enumeración).
  // Siempre devolvemos ok, aunque el mail no exista.
  if (error) {
    // Errores de rate-limit sí los avisamos para que el usuario sepa esperar.
    const m = error.message.toLowerCase();
    if (m.includes("rate limit")) {
      return { ok: false, error: "Demasiados intentos. Esperá unos minutos." };
    }
    // Cualquier otro error: igual devolvemos ok para no filtrar info.
  }

  revalidatePath("/recuperar");
  return { ok: true };
}
