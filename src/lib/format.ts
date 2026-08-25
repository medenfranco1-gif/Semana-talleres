// Utilidades de formato horario y días.

export const DIAS = [
  { n: 1 as const, label: "Día 1" },
  { n: 2 as const, label: "Día 2" },
  { n: 3 as const, label: "Día 3" },
];

/** "09:00:00" -> "09:00" */
export function fmtHora(h: string): string {
  if (!h) return "";
  return h.slice(0, 5);
}

/** "09:00:00" -> "9:00" */
export function fmtHora12(h: string): string {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  const hnum = parseInt(hh, 10);
  if (Number.isNaN(hnum)) return h;
  return `${hnum.toString().replace(/^0/, "")}:${mm ?? "00"}`;
}

/** rango "09:00 - 10:30" */
export function fmtRango(inicio: string, fin: string): string {
  return `${fmtHora12(inicio)} – ${fmtHora12(fin)}`;
}

/** parse "HH:MM" o "HH:MM:SS" a minutos */
export function horaAMinutos(h: string): number {
  const [hh, mm] = h.split(":").map((x) => parseInt(x, 10));
  return (hh || 0) * 60 + (mm || 0);
}

/** ¿dos franjas [a1,a2) y [b1,b2) se solapan? */
export function seSolapan(
  aInicio: string,
  aFin: string,
  bInicio: string,
  bFin: string,
): boolean {
  return (
    horaAMinutos(aInicio) < horaAMinutos(bFin) &&
    horaAMinutos(bInicio) < horaAMinutos(aFin)
  );
}
