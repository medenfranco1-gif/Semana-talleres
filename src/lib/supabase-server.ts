import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "./database-types";

/**
 * Cliente Supabase para Server Components / Route Handlers / Server Actions.
 * Lee/escribe cookies para propagar la sesión del usuario autenticado.
 */
export function createServerSupaClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignorado: set desde Server Component es ok, set en Route Handler ok.
          }
        },
      },
    },
  );
}

/**
 * Cliente con service_role (saltea RLS). SOLO en el servidor, nunca exponer la
 * key al navegador. Usado para operaciones administrativas y exportaciones.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no definida. Revisá .env.local",
    );
  }
  // service role no necesita cookies; usamos el cliente base tipado.
  return createServiceClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
