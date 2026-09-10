import { redirect } from "next/navigation";
import { getAlumnoActual } from "@/lib/session";
import { createServerSupaClient } from "@/lib/supabase-server";
import { getCatalogoPublico } from "@/lib/catalogo";
import { CatalogoClient } from "./CatalogoClient";

export const metadata = { title: "Catálogo · Semana de Talleres" };

// cookies() mantiene privado el render; solo el catálogo público tiene caché.

export default async function CatalogoPage() {
  const alumno = await getAlumnoActual();
  if (!alumno) redirect("/login?redirect=/catalogo");

  const supabase = createServerSupaClient();

  const [catalogo, { data: inscripciones, error }] = await Promise.all([
    getCatalogoPublico(),
    supabase.from("inscripciones").select("*").eq("alumno_id", alumno.id),
  ]);
  if (error) throw new Error("No se pudieron cargar tus inscripciones. Intentá nuevamente.");
  const { talleres: talleresConCupo, categorias, config } = catalogo;

  return (
    <div className="container-app py-8">
      <CatalogoClient
        talleres={talleresConCupo}
        categorias={categorias}
        config={config}
        inscripcionesAlumno={inscripciones ?? []}
      />
    </div>
  );
}
