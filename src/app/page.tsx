import Link from "next/link";
import Image from "next/image";

/**
 * Portada pública de la aplicación.
 *
 * No consulta Supabase durante el render inicial: la portada debe seguir
 * respondiendo aunque el API Gateway esté lento o temporalmente caído. Las
 * rutas que necesitan datos o autenticación hacen sus verificaciones al
 * acceder a ellas.
 */
export default function HomePage(): JSX.Element {
  return (
    <div className="container-app py-10 sm:py-16">
      {/* banda tricolor italiana (verde-blanco-rojo) */}
      <div className="mx-auto mb-8 flex h-1.5 w-24 overflow-hidden rounded-full">
        <span className="flex-1 bg-brand-600" />
        <span className="flex-1 bg-white border-y border-slate-200" />
        <span className="flex-1 bg-rosso-600" />
      </div>

      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo.jpeg"
            alt="Escuela Leonardo Da Vinci"
            width={120}
            height={120}
            className="rounded-full border border-slate-200 bg-white shadow-sm"
            priority
          />
        </div>

        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Escuela Leonardo Da Vinci
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Semana de Talleres
        </h1>
        <p className="mt-3 text-base text-slate-600 sm:text-lg">
          Inscribite a los talleres del colegio. Elegí entre cocina, deportes,
          técnica, arte y más.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="badge bg-slate-100 text-slate-700">
            Catálogo disponible para alumnos registrados
          </span>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/registro" className="btn-primary">
            Crear cuenta
          </Link>
          <Link href="/login" className="btn-secondary">
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
