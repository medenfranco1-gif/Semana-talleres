"use server";

import { revalidatePath } from "next/cache";
import { createServerSupaClient } from "@/lib/supabase-server";
import { getAlumnoActual } from "@/lib/session";
import type { ResultadoInscripcion } from "@/lib/types";

/**
 * Server Action: inscribe al alumno actual en un taller.
 * La validación pesada (cupo, solapamiento, misma categoría, inscripciones
 * abiertas) la hace el trigger backend `validar_inscripcion` en la BD, así que
 * NO se puede saltear desde el frontend. Acá solo capturamos el error y lo
 * devolvemos legible.
 */
export async function inscribirAction(
  tallerId: string,
): Promise<ResultadoInscripcion> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tallerId)) {
    return { ok: false, mensaje: "El taller no es válido." };
  }
  const alumno = await getAlumnoActual();
  if (!alumno) {
    return { ok: false, mensaje: "Tenés que iniciar sesión para inscribirte." };
  }

  const supabase = createServerSupaClient();

  const { data, error } = await supabase.rpc("registrar_taller", { p_taller_id: tallerId });
  if (error || !data) {
    // Un timeout puede ocurrir después del COMMIT. Reintentar es idempotente.
    return { ok: false, mensaje: "No pudimos confirmar la respuesta. Reintentá el mismo taller para verificar tu inscripción.", taller_id: tallerId };
  }
  return { ...data, mensaje: data.ok ? data.mensaje : traducirErrorInscripcion(data.mensaje) };
}

/**
 * Server Action: da de baja una inscripción del alumno actual.
 */
export async function desinscribirAction(
  inscripcionId: string,
): Promise<ResultadoInscripcion> {
  const alumno = await getAlumnoActual();
  if (!alumno) {
    return { ok: false, mensaje: "Tenés que iniciar sesión." };
  }

  const supabase = createServerSupaClient();
  const { error } = await supabase
    .from("inscripciones")
    .delete()
    .eq("id", inscripcionId)
    .eq("alumno_id", alumno.id); // RLS también protege, pero reforzamos

  if (error) {
    return { ok: false, mensaje: "No se pudo dar de baja la inscripción." };
  }

  revalidatePath("/catalogo");
  revalidatePath("/mi-itinerario");
  return { ok: true, mensaje: "Te diste de baja del taller." };
}

/**
 * Traduce los mensajes del trigger PostgreSQL a español amigable.
 * El trigger lanza RAISE EXCEPTION con textos específicos.
 */
function traducirErrorInscripcion(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("cupo máximo") || m.includes("alcanzó el cupo")) {
    return "El taller alcanzó el cupo máximo. Elegí otro.";
  }
  if (m.includes("franja horaria") || m.includes("solapamiento") || m.includes("sopa")) {
    return "Ya tenés un taller en esa franja horaria el mismo día.";
  }
  if (m.includes("categoría") && m.includes("día")) {
    return "Ya tenés un taller de la misma categoría ese día.";
  }
  if (m.includes("límite alcanzado") && (m.includes("cocina") || m.includes("deportes"))) {
    return "Ya tenés 2 talleres de esa categoría anotados en la semana.";
  }
  if (m.includes("no está disponible")) {
    return "Este taller no está disponible para inscripción.";
  }
  if (m.includes("inscripciones para el día") && m.includes("cerradas")) {
    return "Las inscripciones para ese día están cerradas.";
  }
  if (m.includes("inscripciones están cerradas")) {
    return "Las inscripciones están cerradas en este momento.";
  }
  if (m.includes("el taller no existe")) {
    return "El taller no existe.";
  }
  // fallback: mensaje crudo limpiado
  const cleaned = msg.replace(/^.*?:\s*/, "").trim();
  return cleaned || "No se pudo completar la inscripción.";
}
