"use client";

import { useState } from "react";
import type { Taller, Categoria, Configuracion } from "@/lib/types";
import { DIAS, fmtRango } from "@/lib/format";
import {
  actualizarConfigAction,
  toggleTallerActivoAction,
  eliminarTallerAction,
  asignarPendientesAction,
} from "./actions";
import { TallerForm } from "./TallerForm";
import { CategoriaManager } from "./CategoriaManager";

interface Props {
  talleres: Taller[];
  categorias: Categoria[];
  config: Configuracion | null;
}

type Tab = "talleres" | "config" | "categorias";

export function AdminHomeClient({ talleres, categorias, config }: Props) {
  const [tab, setTab] = useState<Tab>("talleres");
  const [showForm, setShowForm] = useState(false);
  const [editTaller, setEditTaller] = useState<Taller | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <div>
      {/* tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { k: "talleres", label: "Talleres" },
            { k: "config", label: "Inscripciones" },
            { k: "categorias", label: "Categorías" },
          ] as { k: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`btn text-xs sm:text-sm ${
              tab === t.k
                ? "bg-brand-600 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            msg.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {tab === "talleres" && (
        <TalleresTab
          talleres={talleres}
          categorias={categorias}
          showForm={showForm}
          setShowForm={setShowForm}
          editTaller={editTaller}
          setEditTaller={setEditTaller}
          onMsg={setMsg}
        />
      )}

      {tab === "config" && (
        <ConfigTab config={config} onMsg={setMsg} />
      )}

      {tab === "categorias" && (
        <CategoriaManager categorias={categorias} onMsg={setMsg} />
      )}
    </div>
  );
}

// ---------- tab talleres ----------
function TalleresTab({
  talleres,
  categorias,
  showForm,
  setShowForm,
  editTaller,
  setEditTaller,
  onMsg,
}: {
  talleres: Taller[];
  categorias: Categoria[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
  editTaller: Taller | null;
  setEditTaller: (v: Taller | null) => void;
  onMsg: (m: { ok: boolean; texto: string }) => void;
}) {
  async function handleToggle(t: Taller) {
    const res = await toggleTallerActivoAction(t.id, !t.activo);
    onMsg(
      res.ok
        ? { ok: true, texto: "Taller actualizado." }
        : { ok: false, texto: res.error ?? "Error" },
    );
  }
  async function handleDelete(t: Taller) {
    if (!confirm(`¿Eliminar "${t.titulo}"? Se borrarán sus inscripciones.`)) return;
    const res = await eliminarTallerAction(t.id);
    onMsg(
      res.ok
        ? { ok: true, texto: "Taller eliminado." }
        : { ok: false, texto: res.error ?? "Error" },
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          Talleres ({talleres.length})
        </h2>
        <button
          onClick={() => {
            setEditTaller(null);
            setShowForm(true);
          }}
          className="btn-primary text-sm"
        >
          + Nuevo taller
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 p-4">
          <TallerForm
            taller={editTaller}
            categorias={categorias}
            onCancel={() => {
              setShowForm(false);
              setEditTaller(null);
            }}
            onDone={(ok, texto) => {
              onMsg({ ok, texto });
              if (ok) {
                setShowForm(false);
                setEditTaller(null);
              }
            }}
          />
        </div>
      )}

      {talleres.length === 0 ? (
        <div className="card p-6 text-center text-slate-500">
          No hay talleres cargados.
        </div>
      ) : (
        <>
          {/* Vista mobile: cards */}
          <div className="space-y-3 lg:hidden">
            {talleres.map((t) => {
              const cupoActual = t.cupo_actual ?? 0;
              return (
                <div key={t.id} className="card p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{t.titulo}</h3>
                      <div className="mt-1 text-sm text-slate-600">
                        {t.profesor}
                        {t.aula && ` · ${t.aula}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle(t)}
                      className={`badge cursor-pointer ${
                        t.activo
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {t.activo ? "Activo" : "Inactivo"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                    <span className="badge bg-slate-100">
                      {DIAS.find((d) => d.n === t.dia)?.label}
                    </span>
                    <span>{fmtRango(t.hora_inicio, t.hora_fin)}</span>
                    <span className="badge bg-slate-100">{t.categoria}</span>
                    <span>
                      {cupoActual}/{t.cupo_max} cupos
                    </span>
                    {!t.requiere_materiales && (
                      <span className="badge bg-amber-100 text-amber-700">
                        🥫 pide alimento
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditTaller(t);
                        setShowForm(true);
                      }}
                      className="btn-secondary flex-1 px-3 py-1.5 text-xs"
                    >
                      Editar
                    </button>
                    <a
                      href={`/admin/export/taller/${t.id}?format=xlsx`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      Excel
                    </a>
                    <a
                      href={`/admin/export/taller/${t.id}?format=pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      PDF
                    </a>
                    <button
                      onClick={() => handleDelete(t)}
                      className="btn-danger px-3 py-1.5 text-xs"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vista desktop: tabla */}
          <div className="card hidden overflow-hidden lg:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Título</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Día</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Hora</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Cat.</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Cupos</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-600">Estado</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {talleres.map((t) => {
                    const cupoActual = t.cupo_actual ?? 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{t.titulo}</div>
                          <div className="text-xs text-slate-500">
                            {t.profesor}
                            {t.aula && ` · ${t.aula}`}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {DIAS.find((d) => d.n === t.dia)?.label}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {fmtRango(t.hora_inicio, t.hora_fin)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="badge bg-slate-100 text-slate-600">
                            {t.categoria}
                          </span>
                          {!t.requiere_materiales && (
                            <span className="badge ml-1 bg-amber-100 text-amber-700">
                              🥫
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {cupoActual}/{t.cupo_max}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleToggle(t)}
                            className={`badge cursor-pointer ${
                              t.activo
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {t.activo ? "Activo" : "Inactivo"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditTaller(t);
                                setShowForm(true);
                              }}
                              className="btn-secondary px-2 py-1 text-xs"
                            >
                              Editar
                            </button>
                            <a
                              href={`/admin/export/taller/${t.id}?format=xlsx`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary px-2 py-1 text-xs"
                            >
                              Excel
                            </a>
                            <a
                              href={`/admin/export/taller/${t.id}?format=pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary px-2 py-1 text-xs"
                            >
                              PDF
                            </a>
                            <button
                              onClick={() => handleDelete(t)}
                              className="btn-danger px-2 py-1 text-xs"
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- tab config ----------
function ConfigTab({
  config,
  onMsg,
}: {
  config: Configuracion | null;
  onMsg: (m: { ok: boolean; texto: string }) => void;
}) {
  const [global, setGlobal] = useState(config?.inscripciones_abiertas_global ?? false);
  const [d1, setD1] = useState(config?.inscripciones_abiertas_dia1 ?? false);
  const [d2, setD2] = useState(config?.inscripciones_abiertas_dia2 ?? false);
  const [d3, setD3] = useState(config?.inscripciones_abiertas_dia3 ?? false);
  const [saving, setSaving] = useState(false);

  async function guardar() {
    setSaving(true);
    const res = await actualizarConfigAction({
      inscripciones_abiertas_global: global,
      inscripciones_abiertas_dia1: d1,
      inscripciones_abiertas_dia2: d2,
      inscripciones_abiertas_dia3: d3,
    });
    setSaving(false);
    onMsg(
      res.ok
        ? { ok: true, texto: "Configuración guardada." }
        : { ok: false, texto: res.error ?? "Error" },
    );
  }

  const toggles: { label: string; val: boolean; set: (v: boolean) => void }[] = [
    { label: "Abrir inscripciones globalmente", val: global, set: setGlobal },
    { label: "Inscripciones abiertas — Día 1", val: d1, set: setD1 },
    { label: "Inscripciones abiertas — Día 2", val: d2, set: setD2 },
    { label: "Inscripciones abiertas — Día 3", val: d3, set: setD3 },
  ];

  return (
    <div className="card max-w-full p-4 sm:max-w-lg sm:p-5">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">
        Apertura de inscripciones
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        Para que un alumno pueda inscribirse, el global <strong> y </strong> el
        día específico deben estar abiertos.
      </p>
      <div className="space-y-3">
        {toggles.map((t) => (
          <label
            key={t.label}
            className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3"
          >
            <span className="text-sm font-medium text-slate-700">{t.label}</span>
            <Toggle checked={t.val} onChange={t.set} />
          </label>
        ))}
      </div>
      <button onClick={guardar} disabled={saving} className="btn-primary mt-4 w-full sm:w-auto">
        {saving ? "Guardando…" : "Guardar"}
      </button>

      <AsignarPendientes onMsg={onMsg} />
    </div>
  );
}

// ---------- asignación automática de alumnos sin taller ----------
function AsignarPendientes({
  onMsg,
}: {
  onMsg: (m: { ok: boolean; texto: string }) => void;
}) {
  const [asignando, setAsignando] = useState(false);

  async function handleAsignar() {
    const ok = confirm(
      "Esto va a anotar automáticamente, en un taller al azar con cupo disponible, a todos los alumnos que todavía no tengan ninguna inscripción. ¿Continuar?",
    );
    if (!ok) return;
    setAsignando(true);
    const res = await asignarPendientesAction();
    setAsignando(false);
    if (!res.ok) {
      onMsg({ ok: false, texto: res.error ?? "Error al asignar." });
      return;
    }
    const partes = [`${res.asignados ?? 0} alumno(s) asignado(s) al azar.`];
    if (res.sinCupo) {
      partes.push(`${res.sinCupo} sin taller (no quedaba cupo en ninguno).`);
    }
    onMsg({ ok: true, texto: partes.join(" ") });
  }

  return (
    <div className="mt-6 border-t border-slate-200 pt-4">
      <h3 className="text-sm font-semibold text-slate-800">
        Alumnos sin ningún taller
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Anota automáticamente, al azar y en un taller con cupo disponible, a
        los alumnos que no se hayan inscripto a nada. Pensado para correr una
        sola vez, cerca del cierre de inscripciones.
      </p>
      <button
        onClick={handleAsignar}
        disabled={asignando}
        className="btn-secondary mt-3 w-full sm:w-auto"
      >
        {asignando ? "Asignando…" : "Asignar alumnos sin taller"}
      </button>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? "bg-brand-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
