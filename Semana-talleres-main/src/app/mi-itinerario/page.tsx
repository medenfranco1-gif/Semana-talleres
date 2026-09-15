import { redirect } from "next/navigation";
import { getAlumnoActual } from "@/lib/session";
import { createServerSupaClient } from "@/lib/supabase-server";
import { MiItinerarioClient } from "./MiItinerarioClient";
import type { InscripcionConTaller } from "@/lib/types";

export const metadata = { title: "Mi itinerario · Semana de Talleres" };

export default async function MiItinerarioPage() {
  const alumno = await getAlumnoActual();
  if (!alumno) redirect("/login?redirect=/mi-itinerario");

  const supabase = createServerSupaClient();
  const { data: inscripciones } = await supabase
    .from("inscripciones")
    .select("*, taller:talleres(*)")
    .eq("alumno_id", alumno.id);

  // ordenar por día y hora
  const lista: InscripcionConTaller[] = ((inscripciones ?? []) as unknown as InscripcionConTaller[])
    .sort((a, b) => {
      if (a.taller.dia !== b.taller.dia) return a.taller.dia - b.taller.dia;
      return a.taller.hora_inicio.localeCompare(b.taller.hora_inicio);
    });

  return (
    <div className="container-app py-8">
      <MiItinerarioClient inscripciones={lista} />
    </div>
  );
}
