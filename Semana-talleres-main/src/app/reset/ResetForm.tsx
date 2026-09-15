"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionStateCompat } from "@/lib/useActionStateCompat";
import type { ResetState } from "./actions";
import { resetAction } from "./actions";

/**
 * Formulario para setear la nueva contraseña después de venir del link del
 * email. El token de Supabase llega en la URL (?code=... o #access_token=...).
 */
export function ResetForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionStateCompat<ResetState, FormData>(
    resetAction,
    { ok: false },
  );

  // Si la action devolvió ok, navegamos a login.
  useEffect(() => {
    if (state?.ok) {
      router.push("/login?reset=1");
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Nueva contraseña
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

      <div>
        <label className="label" htmlFor="confirm">
          Confirmar contraseña
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          className="input"
          required
          minLength={6}
        />
      </div>

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña nueva"}
      </button>
    </form>
  );
}
