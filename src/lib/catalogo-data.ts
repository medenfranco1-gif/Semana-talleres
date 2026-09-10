import { cache } from "react";
import { createServerSupaClient } from "./supabase-server";
import type { Taller, Categoria, Configuracion } from "./types";

/**
 * Obtiene configuracion global (tabla de 1 fila).
 * Envuelto con cache() para deduplicar dentro del mismo request.
 */
export const getConfiguracion = cache(async (): Promise<Configuracion | null> => {
  const supabase = createServerSupaClient();

  const { data } = await supabase
    .from("configuracion")
    .select("*")
    .eq("id", 1)
    .single();
  return (data as Configuracion) ?? null;
});

/**
 * Obtiene datos compartidos del catálogo: talleres, categorias, configuracion.
 * Consolida 3 queries en una función para facilitar reutilización.
 *
 * Envuelto con cache() para deduplicar dentro del mismo request/render.
 * NO incluye inscripciones (específicas por usuario).
 */
export const getCatalogoData = cache(async () => {
  const supabase = createServerSupaClient();

  const [
    { data: talleres },
    { data: categorias },
    config,
  ] = await Promise.all([
    supabase
      .from("talleres")
      .select("*")
      .order("dia", { ascending: true })
      .order("hora_inicio", { ascending: true }),
    supabase
      .from("categorias")
      .select("*")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    getConfiguracion(),
  ]);

  return {
    talleres: (talleres ?? []) as Taller[],
    categorias: (categorias ?? []) as Categoria[],
    config,
  };
});
