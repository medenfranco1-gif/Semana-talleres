"use client";

import { useTransition, useState } from "react";

/**
 * Hook compatible con React 18 que imita useActionState (React 19).
 * Ejecuta la action dentro de useTransition y guarda el estado devuelto.
 *
 * Defensivo: si la action lanza (p.ej. redirect() de Next, que lanza una
 * excepción especial) o resuelve a undefined/null, NO pisamos el estado.
 * Así el render nunca recibe undefined y nunca rompe al leer state.error.
 */
export function useActionStateCompat<S, F extends FormData>(
  action: (prev: S, formData: F) => Promise<S>,
  initial: S,
): [S, (formData: F) => void, boolean] {
  const [state, setState] = useState<S>(initial);
  const [pending, startTransition] = useTransition();

  function run(formData: F) {
    startTransition(async () => {
      try {
        const res = await action(state, formData);
        // Solo actualizar si la action devolvió algo válido.
        if (res !== undefined && res !== null) {
          setState(res);
        }
      } catch {
        // Si la action lanza (redirect, error de red, etc.), conservamos el
        // estado anterior en lugar de pisarlo con undefined.
      }
    });
  }

  return [state, run, pending];
}
