"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
 * Recarga el perfil cuando cambia la sesión: ya sea por onAuthStateChange
 * (login/logout hechos desde el cliente) o por nuestro evento "auth-changed"
 * (login/registro hechos desde server actions, que no disparan el callback de
 * Supabase).
 */
export function Navbar() {
  // El cliente debe ser estable: crear uno nuevo en cada render hacía que el
  // useEffect se re-suscribiera y disparara consultas de forma indefinida.
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [loading, setLoading] = useState(true);
  const needsProfile = ["/catalogo", "/mi-itinerario", "/admin"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // Carga el perfil solo en áreas que lo necesitan. La navbar está en el
  // layout global, pero las páginas públicas no deben consultar Supabase.
  const cargarPerfil = async (): Promise<void> => {
    try {
      const {
        data: { user },
      } = await withTimeout(supabase.auth.getUser(), PROFILE_REQUEST_TIMEOUT_MS);
      if (!user) {
        setAlumno(null);
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
    } catch {
      // La navbar es auxiliar: si Supabase está temporalmente lento, no debe
      // bloquear ni dejar ocultos los enlaces públicos.
      setAlumno(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!needsProfile) {
      setAlumno(null);
      setLoading(false);
      return;
    }

    void cargarPerfil();

    // Cambios de auth desde el cliente (ej. logout acá mismo).
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void cargarPerfil();
      router.refresh();
    });

    // Cambios de auth desde server actions (login/registro). Esos NO disparan
    // onAuthStateChange, así que usamos un evento propio.
    const onAuthChanged = () => {
      void cargarPerfil();
      router.refresh();
    };
    window.addEventListener("auth-changed", onAuthChanged);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("auth-changed", onAuthChanged);
    };
  }, [needsProfile, supabase, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setAlumno(null);
    // Avisar a otros componentes y refrescar.
    window.dispatchEvent(new Event("auth-changed"));
    router.push("/login");
    router.refresh();
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

          {!loading && !alumno && (
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
