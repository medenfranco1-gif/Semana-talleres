"use server";

import { revalidatePath } from "next/cache";
import { createServerSupaClient } from "@/lib/supabase-server";
import { getAlumnoActual } from "@/lib/session";
import { estadoFranjaTaller } from "@/lib/franjas-inscripcion";
import type { ResultadoInscripcion } from "@/lib/types";

/**
 * Server Action: inscribe al alumno actual en un taller.
 * La validación pesada (cupo, solapamiento, misma categoría, inscripciones
 * abiertas) la hace el trigger backend `validar_inscripcion` en la BD, así que
 * NO se puede saltear desde el frontend. Acá solo capturamos el error y lo
 * devolvemos legible.
 *
 * OPTIMIZACIÓN: eliminamos el SELECT previo para verificar si ya está inscripto,
 * porque la base ya tiene UNIQUE (alumno_id, taller_id). Hacemos el INSERT
 * directamente y traducimos el error de unique violation a mensaje amigable.
 *
 * FRANJAS MANUALES (Día 1): validamos server-side que la franja del taller
 * esté abierta manualmente (flags en `configuracion`) antes del INSERT.
 * No se usa reloj ni Date: se leen los flags franja_1/2/3_abierta.
 */
export async function inscribirAction(
  tallerId: string,
): Promise<ResultadoInscripcion> {
  const startTime = Date.now();

  const alumno = await getAlumnoActual();
  if (!alumno) {
    console.log(`[inscripcion] sin_auth duracion=${Date.now() - startTime}ms`);
    return { ok: false, mensaje: "Tenés que iniciar sesión para inscribirte." };
  }

  const supabase = createServerSupaClient();

  // VALIDACIÓN DE FRANJAS MANUALES: traemos el taller y los flags de config
  // en paralelo. La franja se decide SOLO por los flags (sin reloj).
  const [
    { data: taller, error: errorTaller },
    { data: config, error: errorConfig },
  ] = await Promise.all([
    supabase.from("talleres").select("*").eq("id", tallerId).single(),
    supabase
      .from("configuracion")
      .select(
        "inscripciones_abiertas_global, inscripciones_abiertas_dia1, franja_1_abierta, franja_2_abierta, franja_3_abierta",
      )
      .eq("id", 1)
      .single(),
  ]);

  if (errorTaller || !taller) {
    console.log(`[inscripcion] taller_no_encontrado duracion=${Date.now() - startTime}ms`);
    return { ok: false, mensaje: "El taller no existe.", taller_id: tallerId };
  }

  if (errorConfig || !config) {
    console.log(`[inscripcion] config_no_encontrada duracion=${Date.now() - startTime}ms`);
    return {
      ok: false,
      mensaje: "No se pudo verificar el estado de inscripción. Intentá de nuevo.",
      taller_id: tallerId,
    };
  }

  // Verificar franja manual (solo aplica al Día 1; otros días pasan derecho).
  const resultadoFranja = estadoFranjaTaller(taller, config);
  if (!resultadoFranja.permitido) {
    const duration = Date.now() - startTime;
    console.log(
      `[inscripcion] franja_cerrada duracion=${duration}ms dia=${taller.dia} hora=${taller.hora_inicio} estado=${resultadoFranja.estado}`,
    );
    return {
      ok: false,
      mensaje:
        resultadoFranja.estado === "fuera_de_franja"
          ? "Este taller no tiene franja de inscripción asignada."
          : "Inscripciones cerradas",
      taller_id: tallerId,
    };
  }

  // INSERT directo: la BD rechaza duplicados con UNIQUE constraint
  const { error } = await supabase.from("inscripciones").insert({
    alumno_id: alumno.id,
    taller_id: tallerId,
  });

  const duration = Date.now() - startTime;

  if (error) {
    // Traducir unique violation (código 23505) a mensaje amigable
    if (error.code === "23505") {
      console.log(`[inscripcion] duplicado duracion=${duration}ms code=${error.code}`);
      return { ok: false, mensaje: "Ya estás inscripto en este taller.", taller_id: tallerId };
    }

    console.log(`[inscripcion] error duracion=${duration}ms code=${error.code || 'unknown'}`);
    return {
      ok: false,
      mensaje: traducirErrorInscripcion(error.message),
      taller_id: tallerId,
    };
  }

  console.log(`[inscripcion] ok duracion=${duration}ms`);

  // Revalidar solo /mi-itinerario para que muestre la inscripción nueva.
  // NO revalidamos /catalogo porque CatalogoClient hace optimistic update local
  // y no necesita refetch del servidor.
  revalidatePath("/mi-itinerario");
  return {
    ok: true,
    mensaje: "¡Inscripción confirmada!",
    taller_id: tallerId,
  };
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

  // Revalidar ambas rutas porque la desinscripción debe reflejarse en:
  // - /mi-itinerario: para actualizar la lista de inscripciones
  // - /catalogo: para liberar el cupo y permitir que se inscriba de nuevo
  // Nota: esto NO causa refetch en /catalogo si el usuario está ahí,
  // solo invalida el cache para la próxima navegación.
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
  if (m.includes("inscripciones están cerradas") && m.includes("día")) {
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
