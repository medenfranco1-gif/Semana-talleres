import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "./database-types";
import { cache } from "react";

const SUPABASE_REQUEST_TIMEOUT_MS = 8_000;

/**
 * Ejecuta una petición de red con un límite de tiempo y respeta la señal de
 * cancelación del llamador. Así, un API Gateway degradado no puede dejar una
 * Server Component o Server Action esperando indefinidamente.
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  const parentSignal = init?.signal;
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);

  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

/**
 * Cliente Supabase para Server Components / Route Handlers / Server Actions.
 * Lee/escribe cookies para propagar la sesión del usuario autenticado.
 */
export const createServerSupaClient = cache(() => {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { timeout: SUPABASE_REQUEST_TIMEOUT_MS, retry: false },
      global: { fetch: fetchWithTimeout },
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
});

// No cookies or service key: only public catalog data may enter shared cache.
export function createCatalogClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { timeout: SUPABASE_REQUEST_TIMEOUT_MS, retry: false },
      global: { fetch: fetchWithTimeout },
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
    db: { timeout: SUPABASE_REQUEST_TIMEOUT_MS, retry: false },
    global: { fetch: fetchWithTimeout },
  });
}
