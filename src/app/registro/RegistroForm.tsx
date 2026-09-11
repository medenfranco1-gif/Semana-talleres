"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionStateCompat } from "@/lib/useActionStateCompat";
import type { RegistroState } from "./actions";

/**
 * Formulario de registro con server action + useActionState.
 */
export function RegistroForm({
  action,
}: {
  action: (prev: RegistroState, formData: FormData) => Promise<RegistroState>;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionStateCompat<RegistroState, FormData>(
    action,
    { ok: false },
  );

  // Si la action devolvió ok + redirectTo, refrescar layout para actualizar
  // initialAlumno del Navbar, luego navegar al destino.
  useEffect(() => {
    if (state?.ok && state.redirectTo) {
      router.refresh();
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nombre">
            Nombre
          </label>
          <input id="nombre" name="nombre" className="input" required maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor="apellido">
            Apellido
          </label>
          <input id="apellido" name="apellido" className="input" required maxLength={60} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="documento">
          DNI
        </label>
        <input
          id="documento"
          name="documento"
          className="input"
          required
          placeholder="Ej: 40123456 (sin puntos)"
          maxLength={20}
          inputMode="numeric"
        />
        <p className="mt-1 text-xs text-slate-500">
          Sin puntos ni espacios. Es tu identificador único.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="curso">
            Curso
          </label>
          <input
            id="curso"
            name="curso"
            className="input"
            required
            placeholder="Ej: 5°"
            maxLength={20}
          />
        </div>
        <div>
          <label className="label" htmlFor="division">
            División / Año
          </label>
          <input
            id="division"
            name="division"
            className="input"
            required
            placeholder="Ej: A o 1"
            maxLength={20}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          className="input"
          required
          maxLength={120}
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="input"
          required
          minLength={6}
        />
        <p className="mt-1 text-xs text-slate-500">Mínimo 6 caracteres.</p>
      </div>

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Creando…" : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-slate-600">
        ¿Ya tenés cuenta?{" "}
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="font-medium text-brand-700 hover:underline"
        >
          Ingresar
        </button>
      </p>
    </form>
  );
}
