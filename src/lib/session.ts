import { createServerSupaClient } from "./supabase-server";
import type { Alumno } from "./types";

/**
 * Devuelve el perfil `alumnos` del usuario autenticado actual, o null si no
 * hay sesión. Para usar en Server Components / Route Handlers.
 */
export async function getAlumnoActual(): Promise<Alumno | null> {
  const supabase = createServerSupaClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("alumnos")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) return null;
  return data as Alumno;
}

/**
 * ¿El usuario actual es admin?
 */
export async function esAdmin(): Promise<boolean> {
  const alumno = await getAlumnoActual();
  return alumno?.rol === "admin";
}
