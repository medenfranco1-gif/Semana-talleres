"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/**
 * Componente que detecta cuando Supabase redirige después de un email link
 * (recuperación de contraseña) y manda al usuario a /reset automáticamente.
 */
export function AuthRedirectHandler(): null {
  const router = useRouter();
  // El cliente debe conservar la misma identidad entre renders. Si se crea en
  // cada render, el efecto se desmonta y vuelve a suscribirse repetidamente.
  const supabase = useMemo(() => createClientComponentClient(), []);

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
