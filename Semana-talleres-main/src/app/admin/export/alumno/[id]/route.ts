import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { esAdmin } from "@/lib/session";
import { exportarPdfItinerario } from "@/lib/export";
import type { Alumno, InscripcionConTaller } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /admin/export/alumno/[id]?format=pdf
 * Exporta el itinerario completo de un alumno. Solo admin.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await esAdmin())) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const supabase = createAdminClient();

  const [{ data: alumnoRow }, { data: inscripciones }] = await Promise.all([
    supabase.from("alumnos").select("*").eq("id", params.id).single(),
    supabase
      .from("inscripciones")
      .select("*, taller:talleres(*)")
      .eq("alumno_id", params.id),
  ]);

  if (!alumnoRow) {
    return new NextResponse("Alumno no encontrado", { status: 404 });
  }

  const alumno = alumnoRow as Alumno;
  const lista = ((inscripciones ?? []) as unknown as InscripcionConTaller[]).sort(
    (a, b) => {
      if (a.taller.dia !== b.taller.dia) return a.taller.dia - b.taller.dia;
      return a.taller.hora_inicio.localeCompare(b.taller.hora_inicio);
    },
  );

  const safeBase = `${alumno.apellido}-${alumno.nombre}`
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim();
  const buf = await exportarPdfItinerario(alumno, lista);
  const ts = stamp();

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="itinerario-${safeBase}-${ts}.pdf"`,
    },
  });
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
