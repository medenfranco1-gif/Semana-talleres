import { createServerSupaClient } from "@/lib/supabase-server";
import { AdminHomeClient } from "./AdminHomeClient";
import type { Taller, Categoria, Configuracion } from "@/lib/types";

export const metadata = { title: "Admin · Semana de Talleres" };

export default async function AdminPage() {
  const supabase = createServerSupaClient();
  const [
    { data: talleres },
    { data: categorias },
    { data: config },
    { data: counts },
  ] = await Promise.all([
    supabase.from("talleres").select("*").order("dia").order("hora_inicio"),
    supabase.from("categorias").select("*").order("orden"),
    supabase.from("configuracion").select("*").eq("id", 1).single(),
    supabase.from("inscripciones").select("taller_id"),
  ]);

  const cuposMap: Record<string, number> = {};
  for (const r of counts ?? []) {
    const tid = (r as { taller_id: string }).taller_id;
    cuposMap[tid] = (cuposMap[tid] ?? 0) + 1;
  }

  const talleresConCupo: Taller[] = (talleres ?? []).map((t) => ({
    ...(t as Taller),
    cupo_actual: cuposMap[t.id] ?? 0,
  }));

  return (
    <AdminHomeClient
      talleres={talleresConCupo}
      categorias={(categorias ?? []) as Categoria[]}
      config={(config ?? null) as Configuracion | null}
    />
  );
}
