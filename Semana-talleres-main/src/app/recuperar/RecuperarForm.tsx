"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionStateCompat } from "@/lib/useActionStateCompat";
import type { RecuperarState } from "./actions";

/**
 * Formulario de recuperación de contraseña. Pide el email y dispara la
 * server action que manda el link de reseteo a la casilla del alumno.
 */
export function RecuperarForm() {
  const router = useRouter();
  const [enviado, setEnviado] = useState(false);
  const [state, formAction, pending] = useActionStateCompat<RecuperarState, FormData>(
    recuperarActionWrapper,
    { ok: false },
  );

  // RecuperarState ok => mostrar mensaje de éxito y no repetir el form.
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Si el email existe, te llegó un link para cambiar tu contraseña.
          Revisá tu casilla (y el spam por las dudas).
        </div>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="btn-primary w-full"
        >
          Volver a ingresar
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" onSubmit={() => setEnviado(true)}>
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

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link de recuperación"}
      </button>

      <div className="text-center text-sm">
        <Link href="/login" className="text-brand-700 hover:underline">
          Volver a ingresar
        </Link>
      </div>
    </form>
  );
}

// wrapper local para que el form action reciba el state correctamente
import { recuperarAction } from "./actions";
async function recuperarActionWrapper(_prev: RecuperarState, formData: FormData) {
  return recuperarAction(_prev, formData);
}
