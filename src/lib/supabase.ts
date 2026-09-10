"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database-types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Cliente Supabase singleton para el navegador.
 *
 * Todos los Client Components deben compartir una instancia. Crear un cliente
 * nuevo durante cada render reinicia el estado de Auth y puede multiplicar
 * listeners, refreshes de sesión y peticiones al API Gateway.
 */
export function createClient(): SupabaseClient<Database> {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return browserClient;
}
