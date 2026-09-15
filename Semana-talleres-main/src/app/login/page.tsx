import { loginAction } from "./actions";
import { LoginForm } from "./LoginForm";
import Link from "next/link";

export const metadata = { title: "Ingresar · Escuela Leonardo Da Vinci" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string; registrado?: string; reset?: string; error?: string };
}) {
  const redirect = searchParams.redirect || "/catalogo";
  const registrado = searchParams.registrado === "1";
  const reset = searchParams.reset === "1";
  const linkInvalido = searchParams.error === "invalid_link";

  return (
    <div className="container-app py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Ingresar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Usá el email y contraseña de tu cuenta.
          </p>
        </div>

        {linkInvalido && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            El link de recuperación no es válido o ya fue usado. Pedí uno nuevo
            desde la opción “¿Olvidaste tu contraseña?”.
          </div>
        )}

        {reset && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            ¡Contraseña cambiada! Ya podés ingresar con la nueva.
          </div>
        )}

        {registrado && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            Cuenta creada. Si tu proyecto exige confirmar email, revisá tu casilla;
            si no, podés ingresar directamente.
          </div>
        )}

        <div className="card p-6">
          <LoginForm action={loginAction} redirectTo={redirect} />
        </div>

        <p className="mt-4 text-center text-sm text-slate-600">
          ¿Olvidaste tu contraseña?{" "}
          <Link href="/recuperar" className="font-medium text-brand-700 hover:underline">
            Recuperarla por email
          </Link>
        </p>

        <p className="mt-2 text-center text-sm text-slate-600">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-medium text-brand-700 hover:underline">
            Registrarse
          </Link>
        </p>
      </div>
    </div>
  );
}
