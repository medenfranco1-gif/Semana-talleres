"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Alumno } from "@/lib/types";

/**
 * Barra de navegación. Muestra acciones según sesión/rol.
 * Recarga el perfil cuando cambia la sesión: ya sea por onAuthStateChange
 * (login/logout hechos desde el cliente) o por nuestro evento "auth-changed"
 * (login/registro hechos desde server actions, que no disparan el callback de
 * Supabase en el navegador).
 */
export function Navbar() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [alumno, setAlumno] = useState<Alumno | null>(null);
  const [loading, setLoading] = useState(true);

  // Carga el perfil del usuario actual desde el cliente (cookies SSR).
  const cargarPerfil = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAlumno(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("alumnos")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();
    setAlumno(data as Alumno | null);
    setLoading(false);
  };

  useEffect(() => {
    cargarPerfil();

    // Cambios de auth desde el cliente (ej. logout acá mismo).
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      cargarPerfil();
      router.refresh();
    });

    // Cambios de auth desde server actions (login/registro). Esos NO disparan
    // onAuthStateChange, así que usamos un evento propio.
    const onAuthChanged = () => {
      cargarPerfil();
      router.refresh();
    };
    window.addEventListener("auth-changed", onAuthChanged);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("auth-changed", onAuthChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

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
