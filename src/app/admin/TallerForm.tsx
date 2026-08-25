"use client";

import { useState } from "react";
import { DIAS } from "@/lib/format";
import { crearTallerAction, actualizarTallerAction } from "./actions";
import type { Taller, Categoria } from "@/lib/types";

/**
 * Formulario para crear o editar un taller.
 */
export function TallerForm({
  taller,
  categorias,
  onCancel,
  onDone,
}: {
  taller: Taller | null;
  categorias: Categoria[];
  onCancel: () => void;
  onDone: (ok: boolean, texto: string) => void;
}) {
  const esEdicion = !!taller;
  const [titulo, setTitulo] = useState(taller?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(taller?.descripcion ?? "");
  const [profesor, setProfesor] = useState(taller?.profesor ?? "");
  const [aula, setAula] = useState(taller?.aula ?? "");
  const [categoria, setCategoria] = useState(
    taller?.categoria ?? categorias[0]?.nombre ?? "",
  );
  const [dia, setDia] = useState<1 | 2 | 3>(taller?.dia ?? 1);
  const [horaInicio, setHoraInicio] = useState(taller?.hora_inicio ?? "09:00");
  const [horaFin, setHoraFin] = useState(taller?.hora_fin ?? "10:30");
  const [cupoMax, setCupoMax] = useState(taller?.cupo_max ?? 25);
  const [activo, setActivo] = useState(taller?.activo ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!titulo.trim() || !categoria || !horaInicio || !horaFin || !cupoMax) {
      setError("Completá los campos obligatorios.");
      return;
    }
    if (horaFin <= horaInicio) {
      setError("La hora de fin debe ser mayor a la de inicio.");
      return;
    }
    if (cupoMax <= 0) {
      setError("El cupo debe ser mayor a 0.");
      return;
    }

    setSaving(true);
    const payload = {
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      profesor: profesor.trim(),
      aula: aula.trim(),
      categoria,
      dia,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      cupo_max: cupoMax,
      activo,
    };

    let res: { ok: boolean; error?: string };
    if (esEdicion && taller) {
      res = await actualizarTallerAction(taller.id, payload);
    } else {
      res = await crearTallerAction(payload);
    }
    setSaving(false);

    if (res.ok) {
      onDone(true, esEdicion ? "Taller actualizado." : "Taller creado.");
    } else {
      setError(res.error ?? "Error al guardar.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-base font-semibold text-slate-800">
        {esEdicion ? "Editar taller" : "Nuevo taller"}
      </h3>

      <div>
        <label className="label">Título *</label>
        <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={120} />
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={400} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Profesor / Instructor</label>
          <input className="input" value={profesor} onChange={(e) => setProfesor(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label">Aula / Espacio</label>
          <input className="input" value={aula} onChange={(e) => setAula(e.target.value)} maxLength={60} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Categoría *</label>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
            {categorias.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
          {categorias.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">
              No hay categorías. Crealas en la pestaña Categorías.
            </p>
          )}
        </div>
        <div>
          <label className="label">Día *</label>
          <select
            className="input"
            value={dia}
            onChange={(e) => setDia(Number(e.target.value) as 1 | 2 | 3)}
          >
            {DIAS.map((d) => (
              <option key={d.n} value={d.n}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Hora inicio *</label>
          <input type="time" className="input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
        </div>
        <div>
          <label className="label">Hora fin *</label>
          <input type="time" className="input" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required />
        </div>
        <div>
          <label className="label">Cupo máximo *</label>
          <input type="number" min={1} className="input" value={cupoMax} onChange={(e) => setCupoMax(Number(e.target.value))} required />
        </div>
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        <span className="text-sm text-slate-700">Taller activo (visible para inscripción)</span>
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear taller"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}
