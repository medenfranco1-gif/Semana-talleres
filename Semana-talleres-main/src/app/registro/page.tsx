import { registroAction } from "./actions";
import { RegistroForm } from "./RegistroForm";

export const metadata = { title: "Registrarse · Semana de Talleres" };

export default function RegistroPage() {
  return (
    <div className="container-app py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Crear cuenta</h1>
          <p className="mt-1 text-sm text-slate-600">
            Necesitás tu email, contraseña y datos del colegio.
          </p>
        </div>
        <div className="card p-6">
          <RegistroForm action={registroAction} />
        </div>
      </div>
    </div>
  );
}
