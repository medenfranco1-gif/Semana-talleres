"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Alumno } from "@/lib/types";

const PROFILE_REQUEST_TIMEOUT_MS = 5_000;

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
 * Evita la tormenta de peticiones que causó el colapso del API Gateway:
 * - usa el cliente singleton (no crea uno por render);
 * - solo consulta el perfil en rutas autenticadas;
 * - deduplica llamadas concurrentes con un ref;
 * - no dispara `router.refresh()` por cada evento de auth.
 */
export function Navbar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [cargando, setCargando] = useState(true);
  const inflight = useRef<Promise<void> | null>(null);

  // Carga el perfil del usuario actual. Si ya hay una carga en curso, espera
  // esa en vez de abrir otra petición paralela.
  const cargarPerfil = useCallback(async (): Promise<void> => {
    if (inflight.current) return inflight.current;

    const run = async (): Promise<void> => {
      try {
        const {
          data: { session },
        } = await withTimeout(supabase.auth.getSession(), PROFILE_REQUEST_TIMEOUT_MS);
        const user = session?.user; // Solo presentación; permisos siempre en servidor/RLS.
        if (!user) {
          setAlumno(null);
          setCargando(false);
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
      } catch {
        setAlumno(null);
        setCargando(false);
      }
    };

    inflight.current = run().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [supabase]);

  useEffect(() => {
    // La navbar vive en el layout global: debe conservar el perfil también en
    // rutas públicas como `/faq`. Solo hacemos una carga acotada por montaje,
    // y la deduplicación evita consultas paralelas.
    void cargarPerfil();

    // Solo reaccionamos a logout/signOut del cliente. Los demás eventos
    // (TOKEN_REFRESHED, INITIALIZED) no deben disparar más peticiones.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAlumno(null);
        setCargando(false);
      } else if (event === "SIGNED_IN") {
        // Salir del callback de Auth antes de consultar otro método del cliente.
        window.setTimeout(() => void cargarPerfil(), 0);
      }
    });

    // Login/registro desde server actions: una sola recarga, sin refresh
    // automático del router.
    const onAuthChanged = () => {
      void cargarPerfil();
    };
    window.addEventListener("auth-changed", onAuthChanged);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [supabase, cargarPerfil]);

  async function handleLogout() {
    setAlumno(null);
    await supabase.auth.signOut();
    window.dispatchEvent(new Event("auth-changed"));
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
            // Full navigation intentionally discards Next 14's stale client Router Cache.
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/catalogo" className={linkCls("/catalogo")}>
              Catálogo
            </a>
          )}
          {alumno && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/mi-itinerario" className={linkCls("/mi-itinerario")}>
              Mi itinerario
            </a>
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
