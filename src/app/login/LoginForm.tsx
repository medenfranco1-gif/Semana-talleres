"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionStateCompat } from "@/lib/useActionStateCompat";
import type { LoginState } from "./actions";

/**
 * Formulario de login con server action + useActionState.
 */
export function LoginForm({
  action,
  redirectTo,
}: {
  action: (prev: LoginState, formData: FormData) => Promise<LoginState>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionStateCompat<LoginState, FormData>(
    action,
    { ok: false },
  );

  // Si la action devolvió ok + redirectTo:
  // 1) Avisamos al Navbar (y a quien escuche) que la sesión cambió, porque el
  //    login corre en una server action que NO dispara onAuthStateChange del
  //    navegador, así que el Navbar no se entera solo.
  // 2) Refrescamos para que el servidor relea las cookies nuevas.
  // 3) Navegamos al destino.
  useEffect(() => {
    if (state?.ok && state.redirectTo) {
      window.dispatchEvent(new Event("auth-changed"));
      router.refresh();
      router.push(state.redirectTo);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

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
          autoComplete="current-password"
          className="input"
          required
        />
      </div>

      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>

      <div className="text-center text-sm">
        <Link href="/registro" className="text-brand-700 hover:underline">
          ¿No tenés cuenta? Creala acá.
        </Link>
      </div>
    </form>
  );
}
