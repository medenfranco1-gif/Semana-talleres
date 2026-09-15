"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Alumno } from "@/lib/types";

const PROFILE_REQUEST_TIMEOUT_MS = 5_000;

interface NavbarProps {
  initialAlumno?: Alumno | null;
}

/**
 * Resuelve una operación o la rechaza si el servicio remoto no responde a
 * tiempo. Evita que la barra de navegación quede en estado de carga infinito.
 */
function withTimeout<T>(operation: PromiseLike<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("La consulta de sesión excedió el tiempo límite."));
    }, milliseconds);

    Promise.resolve(operation).then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Barra de navegación. Muestra acciones según sesión/rol.
 *
 * OPTIMIZACIÓN: Recibe initialAlumno del servidor para evitar requests duplicadas.
 * Si initialAlumno está presente, NO hace auth.getUser() + alumnos query en mount.
 * Solo consulta el perfil cuando hay eventos de auth (SIGNED_IN/OUT) o auth-changed.
 *
 * Evita la tormenta de peticiones que causó el colapso del API Gateway:
 * - usa el cliente singleton (no crea uno por render);
 * - reutiliza datos SSR cuando están disponibles;
 * - deduplica llamadas concurrentes con un ref;
 * - no dispara `router.refresh()` por cada evento de auth.
 */
export function Navbar({ initialAlumno }: NavbarProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [alumno, setAlumno] = useState<Alumno | null>(initialAlumno ?? null);
  const [cargando, setCargando] = useState(initialAlumno === undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);

  // Carga el perfil del usuario actual. Si ya hay una carga en curso, espera
  // esa en vez de abrir otra petición paralela.
  const cargarPerfil = useCallback(async (): Promise<void> => {
    if (inflight.current) return inflight.current;

    const run = async (): Promise<void> => {
      try {
        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), PROFILE_REQUEST_TIMEOUT_MS);
        if (!user) {
          setAlumno(null);
          setCargando(false);
          retryCountRef.current = 0; // Reset contador
          return;
        }
        const { data } = await withTimeout(
          supabase
            .from("alumnos")
            .select("*")
            .eq("auth_user_id", user.id)
            .single(),
          PROFILE_REQUEST_TIMEOUT_MS,
        );
        setAlumno(data as Alumno | null);
        setCargando(false);
        retryCountRef.current = 0; // Reset contador en éxito
      } catch (error) {
        // Distinguir errores transitorios (red, timeout, 502/503/504) de errores
        // de auth real (401, token inválido). Solo los errores de auth deben
        // desloguear al usuario; los errores transitorios conservan el último
        // estado conocido y reintentan UNA SOLA VEZ después de backoff.
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTransient =
          errorMsg.includes("tiempo límite") ||
          errorMsg.includes("timeout") ||
          errorMsg.includes("fetch") ||
          errorMsg.includes("network") ||
          errorMsg.includes("502") ||
          errorMsg.includes("503") ||
          errorMsg.includes("504") ||
          errorMsg.includes("Failed to fetch");

        if (isTransient && retryCountRef.current === 0) {
          // Error transitorio Y es el primer intento: NO desloguear, conservar alumno actual
          console.warn("[Navbar] Error transitorio al cargar perfil:", errorMsg);
          setCargando(false);
          retryCountRef.current = 1; // Marcar que ya hicimos 1 retry
          // Reintento ÚNICO después de 2-4 segundos (backoff con jitter)
          const backoff = 2000 + Math.random() * 2000;
          retryTimerRef.current = window.setTimeout(() => {
            console.log("[Navbar] Reintentando carga de perfil tras error transitorio (1/1)...");
            retryTimerRef.current = null;
            void cargarPerfil();
          }, backoff);
        } else if (isTransient && retryCountRef.current > 0) {
          // Retry también falló con error transitorio: conservar estado, NO desloguear
          console.warn("[Navbar] Retry falló por error transitorio, conservando sesión actual");
          setCargando(false);
          retryCountRef.current = 0; // Reset para próxima carga
        } else {
          // Error de auth real (no transitorio): desloguear
          console.log("[Navbar] Error de autenticación, limpiando sesión:", errorMsg);
          setAlumno(null);
          setCargando(false);
          retryCountRef.current = 0; // Reset contador
        }
      }
    };

    inflight.current = run().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [supabase]);

  useEffect(() => {
    // OPTIMIZACIÓN: Si recibimos initialAlumno del servidor, NO hacemos fetch
    // inicial. Solo reaccionamos a eventos de auth (login/logout).
    if (initialAlumno === undefined) {
      // Rutas públicas sin SSR: cargamos client-side
      void cargarPerfil();
    }

    // Solo reaccionamos a logout/signOut del cliente. Los demás eventos
    // (TOKEN_REFRESHED, INITIALIZED) no deben disparar más peticiones.
    // NOTA: onAuthStateChange captura SIGNED_IN/SIGNED_OUT automáticamente,
    // por lo que NO necesitamos el event listener "auth-changed" adicional
    // (eliminado para evitar duplicación de requests).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAlumno(null);
        void cargarPerfil();
      } else if (event === "SIGNED_IN") {
        void cargarPerfil();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
      // Cleanup: cancelar retry pendiente si el componente se desmonta
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [supabase, cargarPerfil, initialAlumno]);

  async function handleLogout() {
    setAlumno(null);
    await supabase.auth.signOut();
    // signOut() dispara SIGNED_OUT automáticamente, no necesitamos event custom
    router.push("/login");
  }

  const linkCls = (href: string) =>
    `px-3 py-2 rounded-md text-sm font-medium transition ${
      pathname === href || pathname.startsWith(href + "/")
        ? "bg-brand-50 text-brand-700"
        : "text-slate-600 hover:text-brand-700 hover:bg-slate-50"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="container-app flex h-16 items-center justify-between gap-1 sm:gap-2">
        <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
          <Image
            src="/logo.jpeg"
            alt="Escuela Leonardo Da Vinci"
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border border-slate-200 object-cover"
          />
          <span className="hidden sm:inline">Escuela Leonardo Da Vinci</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/faq" className={linkCls("/faq")}>
            <span className="hidden sm:inline">Preguntas</span>
            <span className="sm:hidden">FAQ</span>
          </Link>
          {alumno && (
            <Link href="/catalogo" className={linkCls("/catalogo")}>
              Catálogo
            </Link>
          )}
          {alumno && (
            <Link href="/mi-itinerario" className={linkCls("/mi-itinerario")}>
              Mi itinerario
            </Link>
          )}
          {alumno?.rol === "admin" && (
            <Link href="/admin" className={linkCls("/admin")}>
              Admin
            </Link>
          )}

          {/* Enlaces públicos visibles desde el primer render. No dependen de
              que Supabase termine de cargar. */}
          {!cargando && !alumno && (
            <>
              <Link href="/login" className={linkCls("/login")}>
                Ingresar
              </Link>
              <Link href="/registro" className="btn-primary ml-1">
                Registrarse
              </Link>
            </>
          )}

          {alumno && (
            <div className="ml-2 flex items-center gap-2">
              <span className="hidden text-sm text-slate-500 sm:inline">
                {alumno.nombre} {alumno.apellido}
                {alumno.rol === "admin" && (
                  <span className="badge ml-1 bg-brand-100 text-brand-700">admin</span>
                )}
              </span>
              <button onClick={handleLogout} className="btn-secondary">
                Salir
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
