/**
 * Sistema de franjas MANUALES de inscripción.
 *
 * OBJETIVO: Reducir picos de carga abriendo las inscripciones por bloques.
 * Cada franja se abre y cierra A MANO desde el panel de admin.
 *
 * IMPORTANTE:
 * - NO usa reloj ni Date: el estado de cada franja es un flag booleano
 *   guardado en `configuracion` (franja_1_abierta / franja_2_abierta /
 *   franja_3_abierta).
 * - Solo aplica a talleres del DÍA 1 (dia = 1). Días 2 y 3 no se tocan.
 * - La validación server-side es obligatoria (ver catalogo/actions.ts).
 * - La UI del catálogo obedece SOLO estos flags (no timers, no polling).
 */

import type { Taller } from "./types";

// Día al que aplican las franjas (1 = Día 1, según el array DIAS y Taller.dia).
export const DIA_FRANJAS = 1;

/**
 * Definición de franjas del Día 1.
 * Cada franja mapea un rango de hora_inicio a su flag de apertura en config.
 * - ventana de talleres: hora_inicio desde horaMin hasta horaMax (inclusive)
 */
const FRANJAS_DIA = [
  {
    id: 1 as const,
    flag: "franja_1_abierta" as const,
    talleres: { horaMin: "08:00:00", horaMax: "09:30:00" },
    label: "Franja 1 (08:00-09:30)",
  },
  {
    id: 2 as const,
    flag: "franja_2_abierta" as const,
    talleres: { horaMin: "10:00:00", horaMax: "12:00:00" },
    label: "Franja 2 (10:00-12:00)",
  },
  {
    id: 3 as const,
    flag: "franja_3_abierta" as const,
    talleres: { horaMin: "13:00:00", horaMax: "15:00:00" },
    label: "Franja 3 (13:00-15:00)",
  },
] as const;

/** Subconjunto de `Configuracion` que necesita esta lógica. */
export interface FranjasConfig {
  inscripciones_abiertas_global: boolean;
  inscripciones_abiertas_dia1: boolean;
  franja_1_abierta: boolean;
  franja_2_abierta: boolean;
  franja_3_abierta: boolean;
}

export type EstadoFranja =
  | "disponible" // La franja está abierta manualmente: puede inscribirse
  | "cerrado" // La franja existe pero está cerrada (o global/día cerrados)
  | "fuera_de_franja"; // El taller no pertenece a ninguna franja definida

export interface ResultadoFranja {
  permitido: boolean;
  estado: EstadoFranja;
  mensaje: string;
  franja?: 1 | 2 | 3;
}

/** Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche. */
function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/**
 * Determina a qué franja pertenece un taller por su hora_inicio.
 * @returns la franja o null si no pertenece a ninguna.
 */
function obtenerFranjaTaller(
  horaInicio: string,
): (typeof FRANJAS_DIA)[number] | null {
  const minutos = horaAMinutos(horaInicio);
  for (const franja of FRANJAS_DIA) {
    const min = horaAMinutos(franja.talleres.horaMin);
    const max = horaAMinutos(franja.talleres.horaMax);
    if (minutos >= min && minutos <= max) return franja;
  }
  return null;
}

/**
 * FUNCIÓN PRINCIPAL: estado de inscripción de un taller según franjas MANUALES.
 *
 * Regla: un taller del Día 1 solo es inscribible si global + día 1 + su franja
 * están abiertos. Talleres de otros días no se ven afectados por franjas.
 *
 * @param taller - Taller a evaluar.
 * @param config - Flags de configuración (o null si aún no cargó).
 */
export function estadoFranjaTaller(
  taller: Taller,
  config: FranjasConfig | null,
): ResultadoFranja {
  // Días distintos al Día 1 no usan franjas: el resto de la validación
  // (global + día) la maneja evaluarBloqueoCliente / el trigger backend.
  if (taller.dia !== DIA_FRANJAS) {
    return { permitido: true, estado: "disponible", mensaje: "" };
  }

  const franja = obtenerFranjaTaller(taller.hora_inicio);

  // Taller del Día 1 que no cae en ninguna franja definida (ej: 09:45).
  if (!franja) {
    return {
      permitido: false,
      estado: "fuera_de_franja",
      mensaje: "Este taller no tiene franja de inscripción asignada.",
    };
  }

  // Sin config todavía: por seguridad, cerrado.
  if (!config) {
    return {
      permitido: false,
      estado: "cerrado",
      mensaje: "Inscripciones cerradas",
      franja: franja.id,
    };
  }

  // Global o día 1 cerrados => todas las franjas quedan efectivamente cerradas,
  // aunque el flag de la franja esté en true.
  const baseAbierta =
    config.inscripciones_abiertas_global && config.inscripciones_abiertas_dia1;

  const franjaAbierta = baseAbierta && config[franja.flag] === true;

  if (franjaAbierta) {
    return {
      permitido: true,
      estado: "disponible",
      mensaje: "Inscripciones abiertas",
      franja: franja.id,
    };
  }

  return {
    permitido: false,
    estado: "cerrado",
    mensaje: "Inscripciones cerradas",
    franja: franja.id,
  };
}

/**
 * FUNCIÓN SIMPLIFICADA: ¿puede inscribirse a este taller ahora (según franjas)?
 * Usada por la validación server-side y por la UI para deshabilitar el botón.
 */
export function puedeInscribirsePorFranja(
  taller: Taller,
  config: FranjasConfig | null,
): boolean {
  return estadoFranjaTaller(taller, config).permitido;
}
