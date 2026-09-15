import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { esAdmin } from "@/lib/session";
import { exportarExcelAsistencia, exportarPdfAsistencia } from "@/lib/export";
import type { Taller, Alumno, InscripcionConTaller } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /admin/export/taller/[id]?format=xlsx|pdf
 * Exporta la lista de asistencia de un taller. Solo admin.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!(await esAdmin())) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const supabase = createAdminClient();

  const [{ data: tallerRow }, { data: inscripciones }] = await Promise.all([
    supabase.from("talleres").select("*").eq("id", params.id).single(),
    supabase
      .from("inscripciones")
      .select("*, taller:talleres(*)")
      .eq("taller_id", params.id),
  ]);

  if (!tallerRow) {
    return new NextResponse("Taller no encontrado", { status: 404 });
  }

  const taller = tallerRow as Taller;
  const alumnoIds = (inscripciones ?? []).map(
    (i) => (i as { alumno_id: string }).alumno_id,
  );

  let alumnosMap: Record<string, Alumno> = {};
  if (alumnoIds.length) {
    const { data: alumnosRows } = await supabase
      .from("alumnos")
      .select("*")
      .in("id", alumnoIds);
    alumnosMap = Object.fromEntries(
      (alumnosRows ?? []).map((a) => [(a as Alumno).id, a as Alumno]),
    );
  }

  const lista = ((inscripciones ?? []) as unknown as InscripcionConTaller[]).map(
    (ins) => ({
      ...ins,
      alumno: alumnosMap[ins.alumno_id],
    }),
  );

  // ordenar por apellido+nombre
  lista.sort((a, b) => {
    const an = `${a.alumno?.apellido ?? ""} ${a.alumno?.nombre ?? ""}`;
    const bn = `${b.alumno?.apellido ?? ""} ${b.alumno?.nombre ?? ""}`;
    return an.localeCompare(bn);
  });

  const safeBase = taller.titulo.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "taller";
  const ts = stamp();

  if (format === "pdf") {
    const buf = await exportarPdfAsistencia(taller, lista);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="asistencia-${safeBase}-${ts}.pdf"`,
      },
    });
  }

  const buf = await exportarExcelAsistencia(taller, lista);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="asistencia-${safeBase}-${ts}.xlsx"`,
    },
  });
}

// timestamp estable para nombre de archivo (YYYYMMDD-HHMM)
function stamp(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
