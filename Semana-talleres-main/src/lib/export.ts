import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Alumno, Taller, InscripcionConTaller } from "./types";
import { DIAS, fmtRango } from "./format";

/**
 * Genera la lista de asistencia de un taller en Excel (buffer).
 * Columnas: N°, Apellido, Nombre, Curso, División, Email, Asistencia (vacía),
 * Fecha inscripción.
 */
export async function exportarExcelAsistencia(
  taller: Taller,
  inscripciones: Array<InscripcionConTaller & { alumno?: Alumno }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Semana de Talleres";
  wb.created = new Date();

  // ExcelJS no acepta ":" en nombres de hoja
  const safeTitle = taller.titulo.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  const ws = wb.addWorksheet("Asistencia", {
    properties: { defaultColWidth: 18 },
  });

  // encabezado
  ws.mergeCells("A1:H1");
  const c1 = ws.getCell("A1");
  c1.value = `Lista de asistencia — ${taller.titulo}`;
  c1.font = { bold: true, size: 14 };
  c1.alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells("A2:H2");
  const c2 = ws.getCell("A2");
  c2.value = `Día ${taller.dia} · ${fmtRango(taller.hora_inicio, taller.hora_fin)} · Prof: ${taller.profesor || "—"} · Aula: ${taller.aula || "—"} · Cupo: ${inscripciones.length}/${taller.cupo_max}`;
  c2.font = { size: 10, color: { argb: "FF64748B" } };

  // tabla
  ws.addRow([]);
  const header = ["N°", "Apellido", "Nombre", "Curso", "División", "Email", "Asistencia", "Fecha inscripción"];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

  inscripciones.forEach((ins, i) => {
    ws.addRow([
      i + 1,
      ins.alumno?.apellido ?? "",
      ins.alumno?.nombre ?? "",
      ins.alumno?.curso ?? "",
      ins.alumno?.division ?? "",
      ins.alumno?.email ?? "",
      "", // para marcar presente/ausente a mano
      new Date(ins.fecha_inscripcion).toLocaleString("es-AR"),
    ]);
  });

  // bordes simples en la tabla
  const startRow = 4;
  const endRow = startRow + inscripciones.length;
  for (let r = startRow; r <= endRow; r++) {
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(r, c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    }
  }

  const arraybuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arraybuf);
}

/**
 * Genera la lista de asistencia de un taller en PDF (buffer).
 */
export async function exportarPdfAsistencia(
  taller: Taller,
  inscripciones: Array<InscripcionConTaller & { alumno?: Alumno }>,
): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Lista de asistencia`, 40, 50);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(taller.titulo, 40, 70);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const sub = `Día ${taller.dia} · ${fmtRango(taller.hora_inicio, taller.hora_fin)} · Prof: ${taller.profesor || "—"} · Aula: ${taller.aula || "—"} · Inscriptos: ${inscripciones.length}/${taller.cupo_max}`;
  doc.text(sub, 40, 86);

  autoTable(doc, {
    startY: 104,
    head: [["N°", "Apellido", "Nombre", "Curso", "Div.", "Email", "Asistencia"]],
    body: inscripciones.map((ins, i) => [
      i + 1,
      ins.alumno?.apellido ?? "",
      ins.alumno?.nombre ?? "",
      ins.alumno?.curso ?? "",
      ins.alumno?.division ?? "",
      ins.alumno?.email ?? "",
      "",
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 40, right: 40 },
    tableWidth: pageW - 80,
  });

  return Buffer.from(doc.output("arraybuffer"));
}

/**
 * Genera el itinerario completo de un alumno en PDF (todas sus inscripciones).
 */
export async function exportarPdfItinerario(
  alumno: Alumno,
  inscripciones: InscripcionConTaller[],
): Promise<Buffer> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Itinerario del alumno`, 40, 50);

  doc.setFontSize(12);
  doc.text(`${alumno.nombre} ${alumno.apellido}`, 40, 70);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Curso: ${alumno.curso} · División: ${alumno.division} · Email: ${alumno.email}`,
    40,
    86,
  );

  const porDia = (n: number) =>
    inscripciones
      .filter((i) => i.taller.dia === n)
      .sort((a, b) => a.taller.hora_inicio.localeCompare(b.taller.hora_inicio));

  const filas: (string | number)[][] = [];
  for (const d of DIAS) {
    const items = porDia(d.n);
    for (const ins of items) {
      filas.push([
        d.label,
        fmtRango(ins.taller.hora_inicio, ins.taller.hora_fin),
        ins.taller.titulo,
        ins.taller.categoria,
        ins.taller.aula || "—",
        ins.taller.profesor || "—",
      ]);
    }
  }

  autoTable(doc, {
    startY: 104,
    head: [["Día", "Horario", "Taller", "Categoría", "Aula", "Profesor"]],
    body: filas,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    margin: { left: 40, right: 40 },
  });

  return Buffer.from(doc.output("arraybuffer"));
}
