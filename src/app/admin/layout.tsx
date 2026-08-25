import Link from "next/link";
import { getAlumnoActual } from "@/lib/session";
import { redirect } from "next/navigation";

/**
 * Guard del panel de admin. Si no es admin, redirige al home.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const alumno = await getAlumnoActual();
  if (!alumno) redirect("/login?redirect=/admin");
  if (alumno.rol !== "admin") redirect("/");

  return (
    <div className="container-app py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Panel de administración</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gestión de talleres, inscripciones y alumnos.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          <Link href="/admin" className="btn-secondary">
            Talleres
          </Link>
          <Link href="/admin/alumnos" className="btn-secondary">
            Alumnos
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
