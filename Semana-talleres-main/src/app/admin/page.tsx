import { createAdminClient } from "@/lib/supabase-server";
import { AdminHomeClient } from "./AdminHomeClient";
import type { Categoria, Configuracion } from "@/lib/types";

export const metadata = { title: "Admin · Semana de Talleres" };

export interface TallerAdminData {
  id: string;
  titulo: string;
  descripcion: string;
  profesor: string;
  aula: string;
  categoria: string;
  dia: 1 | 2 | 3;
  hora_inicio: string;
  hora_fin: string;
  cupo_max: number;
  activo: boolean;
  requiere_materiales: boolean;
  created_at: string;
  updated_at: string;
  inscriptos_reales: number;
  excedente: number;
}

export default async function AdminPage() {
  // Usar cliente admin (service_role) para saltear RLS y ver TODAS las inscripciones
  const supabase = createAdminClient();

  // Usar RPC para conteo agrupado en PostgreSQL (evita límite de 1000 filas de PostgREST)
  const [
    { data: talleres },
    { data: categorias },
    { data: config },
    { data: conteos },
  ] = await Promise.all([
    supabase.from("talleres").select("*").order("dia").order("hora_inicio"),
    supabase.from("categorias").select("*").order("orden"),
    supabase.from("configuracion").select("*").eq("id", 1).single(),
    supabase.rpc("contar_inscriptos_por_taller"),
  ]);

  // Construir mapa de conteos desde la RPC
  const conteoMap: Record<string, number> = {};
  for (const r of conteos ?? []) {
    conteoMap[r.taller_id] = r.total;
  }

  // Construir datos con inscriptos_reales y excedente
  const talleresAdmin: TallerAdminData[] = (talleres ?? []).map((t) => {
    const inscriptos_reales = conteoMap[t.id] ?? 0;
    const excedente = Math.max(0, inscriptos_reales - t.cupo_max);
    return {
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion,
      profesor: t.profesor,
      aula: t.aula,
      categoria: t.categoria,
      dia: t.dia as 1 | 2 | 3,
      hora_inicio: t.hora_inicio,
      hora_fin: t.hora_fin,
      cupo_max: t.cupo_max,
      activo: t.activo,
      requiere_materiales: t.requiere_materiales,
      created_at: t.created_at,
      updated_at: t.updated_at,
      inscriptos_reales,
      excedente,
    };
  });

  return (
    <AdminHomeClient
      talleres={talleresAdmin}
      categorias={(categorias ?? []) as Categoria[]}
      config={(config ?? null) as Configuracion | null}
    />
  );
}
