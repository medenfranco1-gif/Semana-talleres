"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database-types";

/**
 * Cliente Supabase para el navegador (client components).
 * Usa cookies para mantener la sesión persistente (App Router SSR).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
