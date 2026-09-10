import { redirect } from "next/navigation";
import { getAlumnoActual } from "@/lib/session";
import { createServerSupaClient } from "@/lib/supabase-server";
import { CatalogoClient } from "./CatalogoClient";
import type { Taller, Categoria, Configuracion, Inscripcion } from "@/lib/types";

export const metadata = { title: "Catálogo · Semana de Talleres" };

// Forzar renderizado dinámico sin cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CatalogoPage() {
  const alumno = await getAlumnoActual();
  if (!alumno) redirect("/login?redirect=/catalogo");

  const supabase = createServerSupaClient();

  const [
    { data: talleres },
    { data: categorias },
    { data: config },
    { data: inscripciones },
  ] = await Promise.all([
    supabase.from("talleres").select("*").order("dia", { ascending: true }).order("hora_inicio", { ascending: true }),
    supabase.from("categorias").select("*").eq("activa", true).order("orden", { ascending: true }),
    supabase.from("configuracion").select("*").eq("id", 1).single(),
    supabase.from("inscripciones").select("*").eq("alumno_id", alumno.id),
  ]);

  // conteo de cupos por taller (server). Es un snapshot inicial informativo:
  // el cupo DEFINITIVO lo decide el trigger `validar_inscripcion` en la BD al
  // momento del INSERT (con FOR UPDATE), por lo que el número acá puede estar
  // ligeramente desactualizado si muchos inscriben a la vez. Por eso la UI
  // aclara que el cupo "se confirma al presionar Inscribirme".
  const tallerIds = (talleres ?? []).map((t) => t.id);
  let cuposMap: Record<string, number> = {};
  if (tallerIds.length) {
    const { data: counts } = await supabase
      .from("inscripciones")
      .select("taller_id")
      .in("taller_id", tallerIds);
    cuposMap = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
      const tid = (row as { taller_id: string }).taller_id;
      acc[tid] = (acc[tid] ?? 0) + 1;
      return acc;
    }, {});
  }

  const talleresConCupo: Taller[] = (talleres ?? []).map((t) => ({
    ...(t as Taller),
    cupo_actual: cuposMap[t.id] ?? 0,
  }));

  return (
    <div className="container-app py-8">
      <CatalogoClient
        talleres={talleresConCupo}
        categorias={(categorias ?? []) as Categoria[]}
        config={(config ?? null) as Configuracion | null}
        inscripcionesAlumno={(inscripciones ?? []) as Inscripcion[]}
        alumnoId={alumno.id}
      />
    </div>
  );
}
