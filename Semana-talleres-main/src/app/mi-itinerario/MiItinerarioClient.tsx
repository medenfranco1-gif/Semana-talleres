"use client";

import Link from "next/link";
import { DIAS, fmtRango } from "@/lib/format";
import type { InscripcionConTaller } from "@/lib/types";

/**
 * Lista las inscripciones del alumno agrupadas por día (solo lectura).
 * No se puede dar de baja una vez inscripto.
 */
export function MiItinerarioClient({
  inscripciones,
}: {
  inscripciones: InscripcionConTaller[];
}) {
  const lista = inscripciones;
  const porDia = (n: 1 | 2 | 3) => lista.filter((i) => i.taller.dia === n);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi itinerario</h1>
          <p className="mt-1 text-sm text-slate-600">
            Talleres en los que estás inscripto.
          </p>
        </div>
        <Link href="/catalogo" className="btn-secondary">
          Volver al catálogo
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No estás inscripto en ningún taller todavía.
          <div className="mt-4">
            <Link href="/catalogo" className="btn-primary">
              Ver catálogo
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {DIAS.map((d) => {
            const items = porDia(d.n);
            if (items.length === 0) return null;
            return (
              <div key={d.n}>
                <h2 className="mb-3 text-lg font-semibold text-slate-800">
                  {d.label}
                </h2>
                <div className="grid gap-3">
                  {items.map((ins) => (
                    <div
                      key={ins.id}
                      className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">
                            {ins.taller.titulo}
                          </h3>
                          <span className="badge bg-slate-100 text-slate-600">
                            {ins.taller.categoria}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {fmtRango(ins.taller.hora_inicio, ins.taller.hora_fin)}
                          {ins.taller.aula && ` · ${ins.taller.aula}`}
                          {ins.taller.profesor && ` · ${ins.taller.profesor}`}
                        </div>
                      </div>
                      <span className="btn w-full cursor-default bg-green-100 text-green-700 sm:w-auto">
                        ✓ Inscripto
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
