import { seSolapan } from "./format";
import type { Taller, Inscripcion } from "./types";

export type MotivoBloqueo =
  | { tipo: "cupolleno" }
  | { tipo: "solapamiento" }
  | { tipo: "mismacategoria" }
  | { tipo: "yainscripto" }
  | { tipo: "noabierto" }
  | null;

/**
 * Validación PREVIA en cliente para UX (deshabilitar botón + mostrar motivo).
 * Es solo informativa: la validación real e inapelable la hace el trigger
 * backend. Si el cliente y el backend discrepan, gana el backend.
 */
export function evaluarBloqueoCliente(
  taller: Taller,
  inscripciones: Inscripcion[],
  talleresMap: Record<string, Taller>,
  config: {
    inscripciones_abiertas_global: boolean;
    inscripciones_abiertas_dia1: boolean;
    inscripciones_abiertas_dia2: boolean;
    inscripciones_abiertas_dia3: boolean;
  } | null,
  yaInscriptoIds: Set<string>,
): MotivoBloqueo {
  // ya inscripto
  if (yaInscriptoIds.has(taller.id)) {
    return { tipo: "yainscripto" };
  }

  // cupo lleno
  const cupoActual = taller.cupo_actual ?? 0;
  if (cupoActual >= taller.cupo_max) {
    return { tipo: "cupolleno" };
  }

  // inscripciones abiertas
  if (config) {
    if (!config.inscripciones_abiertas_global) return { tipo: "noabierto" };
    const diaAbierto =
      taller.dia === 1
        ? config.inscripciones_abiertas_dia1
        : taller.dia === 2
          ? config.inscripciones_abiertas_dia2
          : config.inscripciones_abiertas_dia3;
    if (!diaAbierto) return { tipo: "noabierto" };
  }

  // inscriptos del alumno ese día
  const inscriptosDia = inscripciones
    .map((i) => talleresMap[i.taller_id])
    .filter(
      (t): t is Taller =>
        !!t && t.dia === taller.dia && t.id !== taller.id,
    );

  // solapamiento horario
  const haySolape = inscriptosDia.some(
    (t) =>
      seSolapan(taller.hora_inicio, taller.hora_fin, t.hora_inicio, t.hora_fin),
  );
  if (haySolape) return { tipo: "solapamiento" };

  // misma categoría
  const mismaCat = inscriptosDia.some((t) => t.categoria === taller.categoria);
  if (mismaCat) return { tipo: "mismacategoria" };

  return null;
}

export function textoMotivo(m: MotivoBloqueo): string {
  switch (m?.tipo) {
    case "cupolleno":
      return "Cupo completo";
    case "solapamiento":
      return "Se superpone con otro taller ese día";
    case "mismacategoria":
      return "Ya tenés un taller de esa categoría ese día";
    case "yainscripto":
      return "Ya estás inscripto";
    case "noabierto":
      return "Inscripciones cerradas";
    default:
      return "";
  }
}
