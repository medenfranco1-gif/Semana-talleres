import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { AuthRedirectHandler } from "@/components/AuthRedirectHandler";
import { getAlumnoActual } from "@/lib/session";

export const metadata: Metadata = {
  title: "Escuela Leonardo Da Vinci · Semana de Talleres",
  description: "Inscripción a la Semana de Talleres de la Escuela Leonardo Da Vinci.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // OPTIMIZACIÓN: Obtener alumno en SSR para hidratar Navbar y evitar
  // requests duplicadas client-side (auth.getUser + alumnos).
  // getAlumnoActual() usa cache() así que si una página protegida ya lo llamó,
  // esta llamada no genera requests adicionales.
  const alumno = await getAlumnoActual();

  return (
    <html lang="es">
      <body className="min-h-screen flex flex-col antialiased text-slate-900">
        <AuthRedirectHandler />
        <Navbar initialAlumno={alumno} />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="container-app py-4 text-center text-xs text-slate-500">
            Semana de Talleres · Escuela Leonardo Da Vinci
            <span className="mt-1 block text-[10px] text-slate-300">
              Hecho por Franco Meden
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
