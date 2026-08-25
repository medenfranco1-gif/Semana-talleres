import { createAdminClient } from "@/lib/supabase-server";
import { AlumnosBuscador } from "./AlumnosBuscador";
import type { Alumno, InscripcionConTaller, Taller } from "@/lib/types";

export const metadata = { title: "Alumnos · Admin" };

export default async function AdminAlumnosPage() {
  const supabase = createAdminClient();

  // cargamos todos los alumnos (cantidad acotada, colegio) y sus inscripciones
  const { data: alumnosRows } = await supabase
    .from("alumnos")
    .select("*")
    .order("apellido")
    .order("nombre");

  const { data: inscripcionesRows } = await supabase
    .from("inscripciones")
    .select("*, taller:talleres(*)");

  // lista de talleres (para el selector "cambiar de taller")
  const { data: talleresRows } = await supabase
    .from("talleres")
    .select("*")
    .order("dia")
    .order("hora_inicio");
  const talleres: Taller[] = (talleresRows ?? []) as unknown as Taller[];

  // mapear inscripciones por alumno
  const insPorAlumno: Record<string, InscripcionConTaller[]> = {};
  const talleresMap: Record<string, Taller> = {};
  for (const row of (inscripcionesRows ?? []) as unknown as InscripcionConTaller[]) {
    talleresMap[row.taller_id] = row.taller;
    const arr = insPorAlumno[row.alumno_id] ?? [];
    arr.push(row);
    insPorAlumno[row.alumno_id] = arr;
  }

  const alumnos: (Alumno & { inscripciones: InscripcionConTaller[] })[] = (
    alumnosRows ?? []
  ).map((a) => {
    const al = a as Alumno;
    return {
      ...al,
      inscripciones: (insPorAlumno[al.id] ?? []).sort((x, y) => {
        if (x.taller.dia !== y.taller.dia) return x.taller.dia - y.taller.dia;
        return x.taller.hora_inicio.localeCompare(y.taller.hora_inicio);
      }),
    };
  });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Alumnos ({alumnos.length})
        </h2>
        <p className="text-sm text-slate-600">
          Buscá por nombre, apellido o curso. Expandí cada alumno para ver su
          itinerario completo.
        </p>
      </div>
      <AlumnosBuscador alumnos={alumnos} talleresMap={talleresMap} talleres={talleres} />
    </div>
  );
}
