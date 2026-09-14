import { createAdminClient } from "@/lib/supabase-server";
import { AdminHomeClient } from "./AdminHomeClient";
import type { Taller, Categoria, Configuracion } from "@/lib/types";

export const metadata = { title: "Admin · Semana de Talleres" };

export default async function AdminPage() {
  // Usar cliente admin (service_role) para saltear RLS y ver todas las inscripciones
  const supabase = createAdminClient();
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

  // Ordenar por sobrecupo: 1) con excedentes (mayor primero), 2) llenos, 3) resto
  const talleresOrdenados = talleresConCupo.sort((a, b) => {
    const cupoA = a.cupo_actual ?? 0;
    const cupoB = b.cupo_actual ?? 0;
    const excedenteA = Math.max(0, cupoA - a.cupo_max);
    const excedenteB = Math.max(0, cupoB - b.cupo_max);
    const llenoA = cupoA >= a.cupo_max ? 1 : 0;
    const llenoB = cupoB >= b.cupo_max ? 1 : 0;

    // Prioridad 1: con excedentes
    if (excedenteA > 0 && excedenteB === 0) return -1;
    if (excedenteA === 0 && excedenteB > 0) return 1;

    // Prioridad 2: mayor excedente
    if (excedenteA !== excedenteB) return excedenteB - excedenteA;

    // Prioridad 3: llenos
    if (llenoA > llenoB) return -1;
    if (llenoA < llenoB) return 1;

    // Prioridad 4: día y hora
    if (a.dia !== b.dia) return a.dia - b.dia;
    return a.hora_inicio.localeCompare(b.hora_inicio);
  });

  return (
    <AdminHomeClient
      talleres={talleresOrdenados}
      categorias={(categorias ?? []) as Categoria[]}
      config={(config ?? null) as Configuracion | null}
    />
  );
}
