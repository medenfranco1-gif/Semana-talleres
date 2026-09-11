/**
 * Sistema de franjas MANUALES de inscripción.
 *
 * OBJETIVO: Reducir picos de carga abriendo las inscripciones por bloques.
 * Cada franja se abre y cierra A MANO desde el panel de admin.
 *
 * IMPORTANTE:
 * - NO usa reloj ni Date: el estado de cada franja es un flag booleano
 *   guardado en `configuracion` (franja_X_abierta para Día 1, dia2_franja_X_abierta
 *   para Día 2, dia3_franja_X_abierta para Día 3).
 * - Aplica a los 3 días del evento, cada uno con controles independientes.
 * - La validación server-side es obligatoria (ver catalogo/actions.ts).
 * - La UI del catálogo obedece SOLO estos flags (no timers, no polling).
 */

import type { Taller } from "./types";

/**
 * Definición de franjas (mismas para los 3 días).
 * Cada franja mapea un rango de hora_inicio.
 */
const FRANJAS_HORARIAS = [
  {
    id: 1 as const,
    talleres: { horaMin: "08:00:00", horaMax: "09:30:00" },
    label: "Franja 1 (08:00-09:30)",
  },
  {
    id: 2 as const,
    talleres: { horaMin: "10:00:00", horaMax: "12:00:00" },
    label: "Franja 2 (10:00-12:00)",
  },
  {
    id: 3 as const,
    talleres: { horaMin: "13:00:00", horaMax: "15:00:00" },
    label: "Franja 3 (13:00-15:00)",
  },
] as const;

/** Subconjunto de `Configuracion` que necesita esta lógica. */
export interface FranjasConfig {
  inscripciones_abiertas_global: boolean;
  inscripciones_abiertas_dia1: boolean;
  inscripciones_abiertas_dia2: boolean;
  inscripciones_abiertas_dia3: boolean;
  // Día 1
  franja_1_abierta: boolean;
  franja_2_abierta: boolean;
  franja_3_abierta: boolean;
  // Día 2
  dia2_franja_1_abierta: boolean;
  dia2_franja_2_abierta: boolean;
  dia2_franja_3_abierta: boolean;
  // Día 3
  dia3_franja_1_abierta: boolean;
  dia3_franja_2_abierta: boolean;
  dia3_franja_3_abierta: boolean;
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
 */
function obtenerFranjaTaller(
  horaInicio: string,
): (typeof FRANJAS_HORARIAS)[number] | null {
  const minutos = horaAMinutos(horaInicio);
  for (const franja of FRANJAS_HORARIAS) {
    const min = horaAMinutos(franja.talleres.horaMin);
    const max = horaAMinutos(franja.talleres.horaMax);
    if (minutos >= min && minutos <= max) return franja;
  }
  return null;
}

/**
 * FUNCIÓN PRINCIPAL: estado de inscripción de un taller según franjas MANUALES.
 *
 * Valida global + día + franja específica del día correspondiente.
 */
export function estadoFranjaTaller(
  taller: Taller,
  config: FranjasConfig | null,
): ResultadoFranja {
  const franja = obtenerFranjaTaller(taller.hora_inicio);

  // Taller que no cae en ninguna franja definida
  if (!franja) {
    return {
      permitido: false,
      estado: "fuera_de_franja",
      mensaje: "Este taller no tiene franja de inscripción asignada.",
    };
  }

  // Sin config: cerrado por seguridad
  if (!config) {
    return {
      permitido: false,
      estado: "cerrado",
      mensaje: "Inscripciones cerradas",
      franja: franja.id,
    };
  }

  // Validar global + día
  let diaAbierto = false;
  if (taller.dia === 1) {
    diaAbierto = config.inscripciones_abiertas_dia1;
  } else if (taller.dia === 2) {
    diaAbierto = config.inscripciones_abiertas_dia2;
  } else if (taller.dia === 3) {
    diaAbierto = config.inscripciones_abiertas_dia3;
  }

  const baseAbierta = config.inscripciones_abiertas_global && diaAbierto;

  // Obtener flag de franja específico del día
  let franjaAbierta = false;
  if (taller.dia === 1) {
    if (franja.id === 1) franjaAbierta = config.franja_1_abierta;
    else if (franja.id === 2) franjaAbierta = config.franja_2_abierta;
    else if (franja.id === 3) franjaAbierta = config.franja_3_abierta;
  } else if (taller.dia === 2) {
    if (franja.id === 1) franjaAbierta = config.dia2_franja_1_abierta;
    else if (franja.id === 2) franjaAbierta = config.dia2_franja_2_abierta;
    else if (franja.id === 3) franjaAbierta = config.dia2_franja_3_abierta;
  } else if (taller.dia === 3) {
    if (franja.id === 1) franjaAbierta = config.dia3_franja_1_abierta;
    else if (franja.id === 2) franjaAbierta = config.dia3_franja_2_abierta;
    else if (franja.id === 3) franjaAbierta = config.dia3_franja_3_abierta;
  }

  if (baseAbierta && franjaAbierta) {
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
 */
export function puedeInscribirsePorFranja(
  taller: Taller,
  config: FranjasConfig | null,
): boolean {
  return estadoFranjaTaller(taller, config).permitido;
}
