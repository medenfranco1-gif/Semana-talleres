"use server";

import { revalidatePath } from "next/cache";
import { createServerSupaClient, createAdminClient } from "@/lib/supabase-server";
import { getAlumnoActual } from "@/lib/session";
import type { Taller } from "@/lib/types";

/**
 * Todas las actions validan que el usuario sea admin antes de operar.
 * RLS también protege (es_admin), pero esto da errores claros y previene
 * llamadas innecesarias.
 */
async function requireAdmin() {
  const alumno = await getAlumnoActual();
  if (!alumno || alumno.rol !== "admin") {
    throw new Error("No autorizado.");
  }
  return alumno;
}

// ---------------- TALLERES ----------------

export async function crearTallerAction(data: Omit<Taller, "id" | "created_at" | "updated_at" | "activo" | "cupo_actual"> & { activo?: boolean }): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();

  const { error } = await supabase.from("talleres").insert({
    titulo: data.titulo,
    descripcion: data.descripcion ?? "",
    profesor: data.profesor ?? "",
    aula: data.aula ?? "",
    categoria: data.categoria,
    dia: data.dia,
    hora_inicio: data.hora_inicio,
    hora_fin: data.hora_fin,
    cupo_max: data.cupo_max,
    activo: data.activo ?? true,
    requiere_materiales: data.requiere_materiales ?? true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function actualizarTallerAction(
  id: string,
  data: Partial<Taller>,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase
    .from("talleres")
    .update({
      titulo: data.titulo,
      descripcion: data.descripcion,
      profesor: data.profesor,
      aula: data.aula,
      categoria: data.categoria,
      dia: data.dia,
      hora_inicio: data.hora_inicio,
      hora_fin: data.hora_fin,
      cupo_max: data.cupo_max,
      activo: data.activo,
      requiere_materiales: data.requiere_materiales,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function eliminarTallerAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase.from("talleres").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function toggleTallerActivoAction(
  id: string,
  activo: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase.from("talleres").update({ activo }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

/**
 * Asigna al azar un taller con cupo disponible a cada alumno que todavía no
 * tenga ninguna inscripción. Llama al RPC `asignar_talleres_pendientes`
 * (security definer), que revalida es_admin() por su cuenta y reutiliza el
 * INSERT normal para pasar siempre por el trigger de validación.
 * Pensada para correrse una sola vez, cerca del cierre de inscripciones.
 */
export async function asignarPendientesAction(): Promise<{
  ok: boolean;
  error?: string;
  asignados?: number;
  sinCupo?: number;
}> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { data, error } = await supabase.rpc("asignar_talleres_pendientes");
  if (error) return { ok: false, error: error.message };

  const filas = (data ?? []) as { alumno_id: string; taller_id: string | null; error: string | null }[];
  const asignados = filas.filter((f) => f.taller_id).length;
  const sinCupo = filas.filter((f) => !f.taller_id).length;

  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/mi-itinerario");
  return { ok: true, asignados, sinCupo };
}

// ---------------- CONFIGURACIÓN ----------------

export async function actualizarConfigAction(data: {
  inscripciones_abiertas_global: boolean;
  inscripciones_abiertas_dia1: boolean;
  inscripciones_abiertas_dia2: boolean;
  inscripciones_abiertas_dia3: boolean;
  // Franjas MANUALES del Día 1 (control on/off desde admin).
  franja_1_abierta: boolean;
  franja_2_abierta: boolean;
  franja_3_abierta: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase
    .from("configuracion")
    .update({
      inscripciones_abiertas_global: data.inscripciones_abiertas_global,
      inscripciones_abiertas_dia1: data.inscripciones_abiertas_dia1,
      inscripciones_abiertas_dia2: data.inscripciones_abiertas_dia2,
      inscripciones_abiertas_dia3: data.inscripciones_abiertas_dia3,
      franja_1_abierta: data.franja_1_abierta,
      franja_2_abierta: data.franja_2_abierta,
      franja_3_abierta: data.franja_3_abierta,
    })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/");
  return { ok: true };
}

// ---------------- CATEGORÍAS ----------------

export async function crearCategoriaAction(nombre: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase
    .from("categorias")
    .insert({ nombre: nombre.trim() })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function eliminarCategoriaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  return { ok: true };
}

// ---------------- INSCRIPCIONES (gestión de alumnos) ----------------

/**
 * Dar de baja a un alumno de una inscripción. Solo admin.
 * A diferencia del alumno común (que ya no puede darse de baja), el admin
 * sí puede quitar inscripciones de cualquier alumno.
 */
export async function adminDarBajaAction(
  inscripcionId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();
  const { error } = await supabase
    .from("inscripciones")
    .delete()
    .eq("id", inscripcionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/mi-itinerario");
  return { ok: true };
}

/**
 * Cambiar a un alumno de taller. Solo admin.
 * Borra la inscripción vieja y crea una nueva al taller destino.
 * Respeta las reglas (cupo, solapamiento, categoría) vía el trigger backend,
 * porque el INSERT pasa por el mismo validador que una inscripción normal.
 * Si el taller destino no cumple las reglas, el trigger lanza una excepción
 * y devolvemos el error traducido.
 */
export async function adminCambiarTallerAction(
  inscripcionId: string,
  nuevoTallerId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createServerSupaClient();

  // 1) leer inscripción actual para saber alumno_id y taller viejo
  const { data: ins, error: eIns } = await supabase
    .from("inscripciones")
    .select("id, alumno_id, taller_id")
    .eq("id", inscripcionId)
    .single();
  if (eIns || !ins) {
    return { ok: false, error: "No se encontró la inscripción." };
  }
  if (ins.taller_id === nuevoTallerId) {
    return { ok: false, error: "El taller nuevo es igual al actual." };
  }

  // 2) borrar la inscripción vieja (libera el cupo del taller origen)
  const { error: eDel } = await supabase
    .from("inscripciones")
    .delete()
    .eq("id", inscripcionId);
  if (eDel) return { ok: false, error: eDel.message };

  // 3) insertar la nueva inscripción; el trigger valida cupo/solapamiento/etc.
  //    Si falla, restauramos la inscripción vieja para no dejar al alumno sin nada.
  const { error: eIns2 } = await supabase.from("inscripciones").insert({
    alumno_id: ins.alumno_id,
    taller_id: nuevoTallerId,
  });
  if (eIns2) {
    // rollback: volver a insertar la vieja
    await supabase.from("inscripciones").insert({
      alumno_id: ins.alumno_id,
      taller_id: ins.taller_id,
    });
    return { ok: false, error: traducirErrorCambio(eIns2.message) };
  }

  revalidatePath("/admin");
  revalidatePath("/catalogo");
  revalidatePath("/mi-itinerario");
  return { ok: true };
}

function traducirErrorCambio(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("cupo máximo") || m.includes("alcanzó el cupo")) {
    return "El taller nuevo alcanzó el cupo máximo.";
  }
  if (m.includes("franja horaria") || m.includes("solapamiento") || m.includes("sopa")) {
    return "El alumno ya tiene un taller en esa franja horaria ese día.";
  }
  if (m.includes("categoría") && m.includes("día")) {
    return "El alumno ya tiene un taller de la misma categoría ese día.";
  }
  if (m.includes("no está disponible")) {
    return "El taller nuevo no está disponible.";
  }
  if (m.includes("límite alcanzado") && (m.includes("cocina") || m.includes("deportes"))) {
    return "El alumno ya tiene 2 talleres de esa categoría en la semana.";
  }
  if (m.includes("inscripciones están cerradas")) {
    return "Las inscripciones están cerradas. Habilitálas antes de cambiar.";
  }
  if (m.includes("unique") || m.includes("duplicate")) {
    return "El alumno ya está inscripto en ese taller.";
  }
  const cleaned = msg.replace(/^.*?:\s*/, "").trim();
  return cleaned || "No se pudo cambiar de taller.";
}

// ---------------- CONTRASEÑA (reset admin) ----------------

/**
 * Reset de contraseña de un alumno, hecho por el admin.
 * Usa el cliente service_role (saltea RLS) y el Admin API de Supabase
 * (auth.admin.updateUserById) para setear la contraseña nueva sin necesidad
 * de saber la vieja. Devuelve la contraseña generada/seteada para que el
 * admin se la comunique al alumno.
 *
 * Si no se pasa `password`, se genera una aleatoria de 8 caracteres.
 */
export async function adminResetPasswordAction(
  alumnoId: string,
  password?: string,
): Promise<{ ok: boolean; error?: string; password?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1) obtener el auth_user_id del alumno
  const { data: al, error: eAl } = await admin
    .from("alumnos")
    .select("auth_user_id, email, nombre, apellido")
    .eq("id", alumnoId)
    .single();
  if (eAl || !al) {
    return { ok: false, error: "No se encontró el alumno." };
  }

  // 2) definir la nueva contraseña (o generar una aleatoria segura)
  let nueva = (password ?? "").trim();
  if (!nueva) {
    nueva = generarPassword(8);
  }
  if (nueva.length < 6) {
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
  }

  // 3) setear la contraseña en Supabase Auth (Admin API)
  const { error: eUp } = await admin.auth.admin.updateUserById(
    al.auth_user_id,
    { password: nueva },
  );
  if (eUp) {
    const m = eUp.message.toLowerCase();
    if (m.includes("weak")) {
      return { ok: false, error: "La contraseña es demasiado débil." };
    }
    return { ok: false, error: eUp.message };
  }

  // No revalidamos paths porque la contraseña no cambia UI; el admin recibe
  // la contraseña nueva para pasársela al alumno.
  return { ok: true, password: nueva };
}

/** Genera una contraseña aleatoria alfanumérica legible (sin caracteres raros). */
function generarPassword(largo: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  // Date.now + Math.random no disponibles en este contexto de server action?
  // Sí lo son: esto corre en el servidor Node, no en el script de workflow.
  // Pero por las dudas usamos crypto random.
  const { randomFillSync } = require("crypto");
  const buf = Buffer.alloc(largo);
  randomFillSync(buf);
  let out = "";
  for (let i = 0; i < largo; i++) {
    out += chars[buf[i] % chars.length];
  }
  return out;
}

// ---------------- BORRAR ALUMNO ----------------

/**
 * Borra un alumno completamente: elimina su cuenta de auth.users (lo que también
 * borra su fila en alumnos y todas sus inscripciones gracias al ON DELETE CASCADE).
 * Solo admin.
 */
export async function adminBorrarAlumnoAction(
  alumnoId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1) obtener el auth_user_id del alumno
  const { data: al, error: eAl } = await admin
    .from("alumnos")
    .select("auth_user_id, email, nombre, apellido")
    .eq("id", alumnoId)
    .single();
  if (eAl || !al) {
    return { ok: false, error: "No se encontró el alumno." };
  }

  // 2) borrar el usuario de auth.users (esto cascadea a alumnos e inscripciones)
  const { error: eDel } = await admin.auth.admin.deleteUser(al.auth_user_id);
  if (eDel) {
    return { ok: false, error: eDel.message };
  }

  revalidatePath("/admin/alumnos");
  revalidatePath("/admin");
  return { ok: true };
}
