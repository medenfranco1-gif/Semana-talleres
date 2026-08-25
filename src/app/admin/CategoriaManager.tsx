"use client";

import { useState } from "react";
import { crearCategoriaAction, eliminarCategoriaAction } from "./actions";
import type { Categoria } from "@/lib/types";

/**
 * Gestión de categorías (crear / borrar). Las categorías son configurables,
 * no hardcodeadas: aparecen en los filtros del catálogo.
 */
export function CategoriaManager({
  categorias,
  onMsg,
}: {
  categorias: Categoria[];
  onMsg: (m: { ok: boolean; texto: string }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    const res = await crearCategoriaAction(nombre.trim());
    setSaving(false);
    if (res.ok) {
      setNombre("");
      onMsg({ ok: true, texto: "Categoría creada." });
    } else {
      onMsg({ ok: false, texto: res.error ?? "Error" });
    }
  }

  async function borrar(c: Categoria) {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
    const res = await eliminarCategoriaAction(c.id);
    onMsg(
      res.ok
        ? { ok: true, texto: "Categoría eliminada." }
        : { ok: false, texto: res.error ?? "Error" },
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          Crear categoría
        </h2>
        <form onSubmit={crear} className="flex gap-2">
          <input
            className="input"
            placeholder="Ej: Robótica"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
          />
          <button type="submit" disabled={saving} className="btn-primary shrink-0">
            {saving ? "…" : "Agregar"}
          </button>
        </form>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          Categorías existentes
        </h2>
        {categorias.length === 0 ? (
          <p className="text-sm text-slate-500">No hay categorías.</p>
        ) : (
          <ul className="space-y-2">
            {categorias.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
              >
                <span className="text-sm font-medium text-slate-700">{c.nombre}</span>
                <button
                  onClick={() => borrar(c)}
                  className="btn-danger px-2 py-1 text-xs"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
