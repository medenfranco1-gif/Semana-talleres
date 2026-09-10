/**
 * Sistema de franjas horarias para inscripciones escalonadas.
 *
 * OBJETIVO: Reducir picos de carga distribuyendo las inscripciones en ventanas de 10 minutos.
 *
 * IMPORTANTE:
 * - Timezone: America/Argentina/Buenos_Aires
 * - Solo aplica a talleres del MIÉRCOLES (dia = 3)
 * - La validación server-side es obligatoria
 * - La UI es solo ayuda visual
 */

import type { Taller } from "./types";

// Día miércoles en el sistema (1=lunes, 2=martes, 3=miércoles según DIAS array)
const DIA_MIERCOLES = 3;

// Timezone de Argentina para todas las operaciones
const TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Definición de franjas horarias para miércoles.
 * Cada franja tiene:
 * - ventana: [inicio, fin) en hora local Argentina (fin es exclusive)
 * - talleres: hora_inicio desde horaMin hasta horaMax (ambos inclusive)
 */
const FRANJAS_MIERCOLES = [
  {
    id: 1,
    ventana: { inicio: "20:00", fin: "20:10" }, // 20:00:00 inclusive a 20:09:59
    talleres: { horaMin: "08:00:00", horaMax: "09:30:00" }, // 08:00 a 09:30 inclusive
    label: "Franja 1 (08:00-09:30)",
  },
  {
    id: 2,
    ventana: { inicio: "20:10", fin: "20:20" },
    talleres: { horaMin: "10:00:00", horaMax: "12:00:00" },
    label: "Franja 2 (10:00-12:00)",
  },
  {
    id: 3,
    ventana: { inicio: "20:20", fin: "20:30" },
    talleres: { horaMin: "13:00:00", horaMax: "15:00:00" },
    label: "Franja 3 (13:00-15:00)",
  },
] as const;

export type EstadoFranja =
  | "disponible" // Puede inscribirse ahora
  | "proximo" // Abre en el futuro (hoy)
  | "cerrado" // Ya cerró su ventana
  | "fuera_de_franja"; // No pertenece a ninguna franja definida

export interface ResultadoFranja {
  permitido: boolean;
  estado: EstadoFranja;
  abreA?: string; // "20:00" | "20:10" | "20:20"
  cierraA?: string; // "20:10" | "20:20" | "20:30"
  mensaje: string;
  franja?: number; // 1, 2, o 3
}

/**
 * Obtiene la fecha/hora actual en timezone Argentina.
 * @param mockDate - Fecha mock para testing (opcional)
 */
function obtenerAhoraArgentina(mockDate?: Date): Date {
  const ahora = mockDate || new Date();

  // Convertir a string ISO en timezone Argentina
  const strArgentina = ahora.toLocaleString("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parsear "MM/DD/YYYY, HH:MM:SS" a Date
  const [fecha, hora] = strArgentina.split(", ");
  const [mes, dia, año] = fecha.split("/");
  const [horas, minutos, segundos] = hora.split(":");

  return new Date(`${año}-${mes}-${dia}T${horas}:${minutos}:${segundos}`);
}

/**
 * Convierte "HH:MM" o "HH:MM:SS" a minutos desde medianoche para comparación.
 */
function horaAMinutos(hora: string): number {
  const partes = hora.split(":");
  const h = parseInt(partes[0], 10);
  const m = parseInt(partes[1], 10);
  return h * 60 + m;
}

/**
 * Determina a qué franja pertenece un taller por su hora_inicio.
 * @returns Número de franja (1, 2, 3) o null si no pertenece a ninguna
 */
function obtenerFranjaTaller(horaInicio: string): (typeof FRANJAS_MIERCOLES)[number] | null {
  const minutos = horaAMinutos(horaInicio);

  for (const franja of FRANJAS_MIERCOLES) {
    const min = horaAMinutos(franja.talleres.horaMin);
    const max = horaAMinutos(franja.talleres.horaMax);

    if (minutos >= min && minutos <= max) {
      return franja;
    }
  }

  return null;
}

/**
 * Verifica si la ventana de inscripción de una franja está abierta ahora.
 * @param franja - Definición de la franja
 * @param ahora - Fecha/hora actual en Argentina
 * @returns true si está en la ventana [inicio, fin)
 */
function ventanaAbierta(
  franja: (typeof FRANJAS_MIERCOLES)[number],
  ahora: Date,
): boolean {
  const horaActual = horaAMinutos(
    `${ahora.getHours().toString().padStart(2, "0")}:${ahora.getMinutes().toString().padStart(2, "0")}`,
  );

  const inicio = horaAMinutos(franja.ventana.inicio);
  const fin = horaAMinutos(franja.ventana.fin);

  // Ventana [inicio, fin) - inicio inclusive, fin exclusive
  return horaActual >= inicio && horaActual < fin;
}

/**
 * Determina si una ventana ya cerró.
 */
function ventanaCerrada(
  franja: (typeof FRANJAS_MIERCOLES)[number],
  ahora: Date,
): boolean {
  const horaActual = horaAMinutos(
    `${ahora.getHours().toString().padStart(2, "0")}:${ahora.getMinutes().toString().padStart(2, "0")}`,
  );

  const fin = horaAMinutos(franja.ventana.fin);

  return horaActual >= fin;
}

/**
 * FUNCIÓN PRINCIPAL: Determina el estado de inscripción de un taller según franjas horarias.
 *
 * @param taller - Taller a evaluar
 * @param mockDate - Fecha mock para testing (opcional)
 * @returns Resultado con permisos, estado y mensaje
 */
export function estadoFranjaTaller(
  taller: Taller,
  mockDate?: Date,
): ResultadoFranja {
  // Si no es miércoles, no aplican franjas - siempre disponible (respeta config global)
  if (taller.dia !== DIA_MIERCOLES) {
    return {
      permitido: true,
      estado: "disponible",
      mensaje: "Disponible (no es miércoles)",
    };
  }

  // Obtener franja del taller por su hora_inicio
  const franja = obtenerFranjaTaller(taller.hora_inicio);

  // Taller fuera de las franjas definidas (ej: 09:45, 12:30, 15:30)
  if (!franja) {
    return {
      permitido: false,
      estado: "fuera_de_franja",
      mensaje: "Este taller no tiene franja de inscripción asignada.",
    };
  }

  // Obtener hora actual en Argentina
  const ahora = obtenerAhoraArgentina(mockDate);

  // Verificar si la ventana está abierta ahora
  if (ventanaAbierta(franja, ahora)) {
    return {
      permitido: true,
      estado: "disponible",
      mensaje: `Inscripciones abiertas hasta las ${franja.ventana.fin}`,
      cierraA: franja.ventana.fin,
      franja: franja.id,
    };
  }

  // Verificar si la ventana ya cerró
  if (ventanaCerrada(franja, ahora)) {
    return {
      permitido: false,
      estado: "cerrado",
      mensaje: `La franja de inscripción para este taller ya finalizó (cerró a las ${franja.ventana.fin}).`,
      franja: franja.id,
    };
  }

  // La ventana aún no abrió
  return {
    permitido: false,
    estado: "proximo",
    mensaje: `Las inscripciones abren a las ${franja.ventana.inicio}`,
    abreA: franja.ventana.inicio,
    franja: franja.id,
  };
}

/**
 * FUNCIÓN SIMPLIFICADA: ¿Puede inscribirse en este taller ahora?
 *
 * @param taller - Taller a evaluar
 * @param mockDate - Fecha mock para testing (opcional)
 * @returns true si puede inscribirse ahora (considerando solo franjas)
 */
export function puedeInscribirsePorFranja(
  taller: Taller,
  mockDate?: Date,
): boolean {
  return estadoFranjaTaller(taller, mockDate).permitido;
}

/**
 * COMBINACIÓN CON CONFIGURACIÓN GLOBAL:
 * Determina si un taller está disponible para inscripción considerando
 * TANTO la configuración global COMO las franjas horarias.
 *
 * @param taller - Taller a evaluar
 * @param inscripcionesAbiertasGlobal - Flag de configuracion.inscripciones_abiertas_global
 * @param inscripcionesAbiertasDia - Flag de configuracion.inscripciones_abiertas_dia3 (miércoles)
 * @param mockDate - Fecha mock para testing (opcional)
 * @returns true si puede inscribirse considerando TODO
 */
export function puedeInscribirseConConfig(
  taller: Taller,
  inscripcionesAbiertasGlobal: boolean,
  inscripcionesAbiertasDia: boolean,
  mockDate?: Date,
): boolean {
  // Primero verificar configuración global
  if (!inscripcionesAbiertasGlobal || !inscripcionesAbiertasDia) {
    return false;
  }

  // Si config está abierta, verificar franjas
  return puedeInscribirsePorFranja(taller, mockDate);
}
