"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

/**
 * Componente que detecta cuando Supabase redirige después de un email link
 * (recuperación de contraseña) y manda al usuario a /reset automáticamente.
 *
 * Usa el cliente singleton de `@/lib/supabase` para no crear una segunda
 * instancia de Auth en el navegador (cada instancia propia dispara su propio
 * `getSession`/`onAuthStateChange`, lo que duplicaba las peticiones al API
 * Gateway).
 */
export function AuthRedirectHandler(): null {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Verificar si hay un hash con access_token (Supabase redirect)
    const hash = window.location.hash;
    if (hash && hash.includes("access_token") && hash.includes("type=recovery")) {
      router.replace("/reset");
      return;
    }

    // También escuchar eventos de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/reset");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  return null;
}
