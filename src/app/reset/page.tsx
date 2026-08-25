import { ResetForm } from "./ResetForm";

export const metadata = { title: "Nueva contraseña · Escuela Leonardo Da Vinci" };

export default function ResetPage() {
  return (
    <div className="container-app py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Nueva contraseña</h1>
          <p className="mt-1 text-sm text-slate-600">
            Escribí tu contraseña nueva.
          </p>
        </div>
        <div className="card p-6">
          <ResetForm />
        </div>
      </div>
    </div>
  );
}
