"use server";

import { revalidatePath } from "next/cache";
import { createServerSupaClient } from "@/lib/supabase-server";

export interface RegistroState {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

/**
 * Server Action de registro.
 * 1. Crea el usuario en Supabase Auth (email + pass) + metadata.
 * 2. El trigger on_auth_user_created inserta el perfil mínimo.
 *    Igualmente actualizamos los datos completos por si acaso.
 *
 * Devuelve { ok, redirectTo } en lugar de redirect() para no romper
 * useActionState (redirect lanza excepción -> estado undefined en el cliente).
 */
export async function registroAction(
  _prev: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim();
  const documentoRaw = String(formData.get("documento") ?? "").trim();
  const curso = String(formData.get("curso") ?? "").trim();
  const division = String(formData.get("division") ?? "").trim();

  if (!email || !password || !nombre || !apellido || !documentoRaw || !curso || !division) {
    return { ok: false, error: "Completá todos los campos." };
  }
  if (password.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "El email no es válido." };
  }
  // Normalizar documento: solo dígitos (saca puntos, espacios, guiones).
  const documento = documentoRaw.replace(/[^0-9]/g, "");
  if (documento.length < 7) {
    return { ok: false, error: "El DNI no es válido (mínimo 7 números)." };
  }

  const supabase = createServerSupaClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre, apellido, curso, division, documento },
    },
  });

  if (error) {
    return { ok: false, error: traducirErrorAuth(error.message) };
  }

  // Si confirmó email, hay usuario. Actualizamos/insertamos el perfil completo.
  // NO enviamos `rol`: el default de la tabla es 'alumno' (alta nueva) y, si la
  // fila ya existiera por la columna auth_user_id, respetamos el rol existente.
  // Nunca dejamos que el flujo de registro mutue el campo `rol`: está protegido
  // además por el trigger trg_bloquear_cambio_rol en la BD.
  const userId = data.user?.id;
  if (userId) {
    const { error: eUpsert } = await supabase.from("alumnos").upsert<any>(
      {
        auth_user_id: userId,
        email,
        nombre,
        apellido,
        documento,
        curso,
        division,
      },
      { onConflict: "auth_user_id" },
    );
    // Si falla el upsert por UNIQUE de documento o nombre+apellido, el
    // usuario de auth ya quedó creado -> hay que borrarlo para que pueda
    // reintentar. ( Mejor UX que quedar colgado.)
    if (eUpsert) {
      // borrar el auth.user recién creado vía admin? no podemos con anon.
      // Avisamos del error; el admin puede limpiar después.
      return {
        ok: false,
        error: traducirErrorUpsert(eUpsert.message),
      };
    }
  }

  revalidatePath("/");
  return { ok: true, redirectTo: "/login?registrado=1" };
}

function traducirErrorAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Ya existe una cuenta con ese email.";
  }
  if (m.includes("password") && m.includes("weak")) {
    return "La contraseña es demasiado débil.";
  }
  if (m.includes("rate limit")) {
    return "Demasiados intentos. Esperá unos minutos.";
  }
  return msg;
}

/** Traduce los errores de violación de UNIQUE (DNI o nombre+apellido). */
function traducirErrorUpsert(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("alumnos_documento_unique") || (m.includes("documento") && m.includes("unique"))) {
    return "Ya existe una cuenta con ese DNI.";
  }
  if (m.includes("alumnos_nombre_apellido_unique") || (m.includes("nombre") && m.includes("apellido"))) {
    return "Ya existe una cuenta con ese nombre y apellido.";
  }
  if (m.includes("unique") || m.includes("duplicate") || m.includes("23505")) {
    return "Ya existe una cuenta con esos datos.";
  }
  return msg || "No se pudo completar el registro.";
}
