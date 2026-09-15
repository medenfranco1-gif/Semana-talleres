import { RecuperarForm } from "./RecuperarForm";

export const metadata = { title: "Recuperar contraseña · Escuela Leonardo Da Vinci" };

export default function RecuperarPage() {
  return (
    <div className="container-app py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-slate-600">
            Poné tu email y te mandamos un link para cambiarla.
          </p>
        </div>
        <div className="card p-6">
          <RecuperarForm />
        </div>
      </div>
    </div>
  );
}
