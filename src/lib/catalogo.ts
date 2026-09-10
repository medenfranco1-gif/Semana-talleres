import { unstable_cache } from "next/cache";
import { createCatalogClient } from "./supabase-server";

export const getCatalogoPublico = unstable_cache(async () => {
  const { data, error } = await createCatalogClient().rpc("catalogo_publico");
  if (error || !data) throw new Error("No se pudo cargar el catálogo. Intentá nuevamente.");
  return data;
}, ["catalogo-publico-v1"], { revalidate: 10, tags: ["catalogo-publico"] });
