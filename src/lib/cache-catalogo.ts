import { unstable_cache } from 'next/cache';
import { createServerSupaClient } from './supabase-server';
import type { Taller, Categoria } from './types';

/**
 * Cache de queries globales del catálogo para reducir carga en Supabase.
 *
 * TALLERES y CATEGORÍAS son idénticos para todos los usuarios y cambian
 * raramente (solo cuando admin edita), así que los cacheamos con TTL.
 *
 * CONFIGURACIÓN NO se cachea aquí porque cambia frecuentemente durante el
 * evento (admin abre/cierra franjas) y necesita invalidación explícita desde
 * acciones admin para evitar mostrar estado stale durante inscripciones.
 */

/**
 * Obtiene talleres con cache de 30 segundos.
 * Revalidación: automática (TTL) + manual vía revalidateTag('talleres').
 */
export const getTalleresConCache = unstable_cache(
  async (): Promise<Taller[]> => {
    const supabase = createServerSupaClient();
    const { data } = await supabase
      .from("talleres")
      .select("id, titulo, descripcion, profesor, aula, categoria, dia, hora_inicio, hora_fin, cupo_max, requiere_materiales")
      .order("dia", { ascending: true })
      .order("hora_inicio", { ascending: true });
    return (data ?? []) as Taller[];
  },
  ['talleres-catalogo'],
  { revalidate: 30, tags: ['talleres'] }
);

/**
 * Obtiene categorías activas con cache de 5 minutos.
 * Cambian muy raramente (configuración casi estática).
 * Revalidación: automática (TTL) + manual vía revalidateTag('categorias').
 */
export const getCategoriasConCache = unstable_cache(
  async (): Promise<Categoria[]> => {
    const supabase = createServerSupaClient();
    const { data } = await supabase
      .from("categorias")
      .select("id, nombre, orden")
      .eq("activa", true)
      .order("orden", { ascending: true });
    return (data ?? []) as Categoria[];
  },
  ['categorias-catalogo'],
  { revalidate: 300, tags: ['categorias'] }
);
