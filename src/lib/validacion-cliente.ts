import { seSolapan } from "./format";
import type { Taller, Inscripcion } from "./types";

export type MotivoBloqueo =
  | { tipo: "cupolleno" }
  | { tipo: "solapamiento" }
  | { tipo: "mismacategoria" }
  | { tipo: "yainscripto" }
  | { tipo: "mismotallersemana" }
  | { tipo: "limitecatssemana"; categoria: string }
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

  // talleres en los que el alumno ya está inscripto (cualquier día)
  const inscriptos = inscripciones
    .map((i) => talleresMap[i.taller_id])
    .filter((t): t is Taller => !!t && t.id !== taller.id);

  // mismo taller repetido en otro día de la semana (compara por título,
  // igual que el trigger backend `alumno_tiene_taller_en_semana`)
  const tituloNorm = taller.titulo.trim().toLowerCase();
  const mismoTallerSemana = inscriptos.some(
    (t) => t.titulo.trim().toLowerCase() === tituloNorm,
  );
  if (mismoTallerSemana) return { tipo: "mismotallersemana" };

  // inscriptos del alumno ese mismo día
  const inscriptosDia = inscriptos.filter((t) => t.dia === taller.dia);

  // solapamiento horario
  const haySolape = inscriptosDia.some(
    (t) =>
      seSolapan(taller.hora_inicio, taller.hora_fin, t.hora_inicio, t.hora_fin),
  );
  if (haySolape) return { tipo: "solapamiento" };

  // LÍMITE SEMANAL POR CATEGORÍA: máx 2 de Cocina y 2 de Deportes en toda la
  // semana (suma los 3 días). Espeja el chequeo del trigger backend
  // `alumno_count_categoria_semana`. Si el alumno ya tiene 2 de la categoría
  // y el taller nuevo es de esa categoría, se bloquea (aunque sea otro día).
  // Importante: este límite es por SEMANA, no por día; por eso contamos sobre
  // `inscriptos` (todos los días) y no sobre `inscriptosDia`.
  const catNorm = taller.categoria.trim().toLowerCase();
  if (catNorm === "cocina" || catNorm === "deportes") {
    const count = inscriptos.filter(
      (t) => t.categoria.trim().toLowerCase() === catNorm,
    ).length;
    if (count >= 2) {
      return { tipo: "limitecatssemana", categoria: taller.categoria };
    }
  }

  // misma categoría ese día (no repetir categoría en un mismo día)
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
    case "mismotallersemana":
      return "Ya estás anotado a este taller esta semana";
    case "limitecatssemana":
      return `Alcanzaste el máximo de 2 talleres de ${m?.categoria ?? "esa categoría"} en la semana`;
    case "yainscripto":
      return "Ya estás inscripto";
    case "noabierto":
      return "Inscripciones cerradas";
    default:
      return "";
  }
}
