"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DIAS, fmtRango } from "@/lib/format";
import type { Alumno, InscripcionConTaller, Taller } from "@/lib/types";
import { adminDarBajaAction, adminCambiarTallerAction, adminResetPasswordAction } from "../actions";

type AlumnoConIns = Alumno & { inscripciones: InscripcionConTaller[] };

interface Props {
  alumnos: AlumnoConIns[];
  talleresMap: Record<string, Taller>;
  // Lista de talleres activos para el selector de "cambiar de taller".
  talleres: Taller[];
}

/**
 * Buscador de alumnos con itinerario expandible.
 * El admin puede DAR DE BAJA una inscripción o CAMBIAR de taller (respetando
 * cupos y solapamientos, validado por el trigger backend).
 */
export function AlumnosBuscador({ alumnos, talleresMap, talleres }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  // estado de operaciones por inscripción
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [okMsg, setOkMsg] = useState<Record<string, string>>({});
  // inscripción en modo "cambiar" (muestra el selector)
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [nuevoTallerId, setNuevoTallerId] = useState<string>("");

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return alumnos;
    return alumnos.filter((a) => {
      const campos = [a.nombre, a.apellido, a.curso, a.division, a.email, a.rol, a.documento ?? ""]
        .join(" ")
        .toLowerCase();
      return campos.includes(term);
    });
  }, [alumnos, q]);

  // talleres agrupados por día para el selector
  const talleresPorDia = useMemo(() => {
    const m: Record<number, Taller[]> = { 1: [], 2: [], 3: [] };
    for (const t of talleres) {
      if (!t.activo) continue;
      if (m[t.dia]) m[t.dia].push(t);
    }
    return m;
  }, [talleres]);

  async function handleBaja(ins: InscripcionConTaller, alumnoNombre: string) {
    const ok = window.confirm(
      `¿Dar de baja a ${alumnoNombre} del taller "${ins.taller.titulo}"?`,
    );
    if (!ok) return;
    setProcesando((p) => new Set(p).add(ins.id));
    setErrores((e) => { const n = { ...e }; delete n[ins.id]; return n; });
    const res = await adminDarBajaAction(ins.id);
    if (res.ok) {
      setOkMsg((m) => ({ ...m, [ins.id]: "Baja confirmada." }));
      router.refresh();
    } else {
      setErrores((e) => ({ ...e, [ins.id]: res.error ?? "Error." }));
    }
    setProcesando((p) => { const n = new Set(p); n.delete(ins.id); return n; });
  }

  async function handleCambiar(ins: InscripcionConTaller, alumnoNombre: string) {
    if (!nuevoTallerId) {
      setErrores((e) => ({ ...e, [ins.id]: "Elegí un taller destino." }));
      return;
    }
    setProcesando((p) => new Set(p).add(ins.id));
    setErrores((e) => { const n = { ...e }; delete n[ins.id]; return n; });
    const res = await adminCambiarTallerAction(ins.id, nuevoTallerId);
    if (res.ok) {
      setOkMsg((m) => ({ ...m, [ins.id]: "Cambio confirmado." }));
      setCambiandoId(null);
      setNuevoTallerId("");
      router.refresh();
    } else {
      setErrores((e) => ({ ...e, [ins.id]: res.error ?? "Error." }));
    }
    setProcesando((p) => { const n = new Set(p); n.delete(ins.id); return n; });
  }

  // Reset de contraseña: el admin genera una nueva contraseña aleatoria para
  // el alumno (o setea una propia si la pasa). La mostramos en pantalla para
  // que el admin se la comunique.
  const [resetProcesando, setResetProcesando] = useState<Set<string>>(new Set());
  const [resetResultado, setResetResultado] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});

  async function handleResetPassword(a: AlumnoConIns) {
    const ok = window.confirm(
      `¿Resetear la contraseña de ${a.nombre} ${a.apellido}? Se va a generar una nueva y se la vas a tener que pasar.`,
    );
    if (!ok) return;
    setResetProcesando((p) => new Set(p).add(a.id));
    setResetResultado((r) => { const n = { ...r }; delete n[a.id]; return n; });
    const res = await adminResetPasswordAction(a.id);
    if (res.ok && res.password) {
      setResetResultado((r) => ({
        ...r,
        [a.id]: { ok: true, msg: `Nueva contraseña: ${res.password}` },
      }));
    } else {
      setResetResultado((r) => ({
        ...r,
        [a.id]: { ok: false, msg: res.error ?? "Error." },
      }));
    }
    setResetProcesando((p) => { const n = new Set(p); n.delete(a.id); return n; });
  }

  return (
    <div>
      <input
        className="input mb-4 max-w-md"
        placeholder="Buscar por nombre, apellido, curso, email…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtrados.length === 0 ? (
        <div className="card p-6 text-center text-slate-500">
          No se encontraron alumnos.
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((a) => {
            const open = expandido === a.id;
            const nombreCompleto = `${a.nombre} ${a.apellido}`;
            return (
              <div key={a.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpandido(open ? null : a.id)}
                  className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {a.apellido}, {a.nombre}
                      </span>
                      {a.rol === "admin" && (
                        <span className="badge bg-brand-100 text-brand-700">admin</span>
                      )}
                      <span className="badge bg-slate-100 text-slate-600">
                        {a.inscripciones.length} taller(es)
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.curso}° {a.division}
                      {a.documento && ` · DNI ${a.documento}`}
                      {` · ${a.email}`}
                    </div>
                  </div>
                  <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                  <div className="border-t border-slate-100 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-700">
                        Itinerario
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => handleResetPassword(a)}
                          disabled={resetProcesando.has(a.id)}
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          {resetProcesando.has(a.id) ? "Reseteando…" : "Resetear contraseña"}
                        </button>
                        <a
                          href={`/admin/export/alumno/${a.id}?format=pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary px-2 py-1 text-xs"
                        >
                          Exportar PDF
                        </a>
                      </div>
                    </div>

                    {resetResultado[a.id] && (
                      <div
                        className={`mb-2 rounded-md border p-2 text-xs ${
                          resetResultado[a.id].ok
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {resetResultado[a.id].ok
                          ? resetResultado[a.id].msg + " — anotala y pasásela al alumno."
                          : resetResultado[a.id].msg}
                      </div>
                    )}

                    {a.inscripciones.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Sin inscripciones.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {DIAS.map((d) => {
                          const items = a.inscripciones.filter(
                            (i) => i.taller.dia === d.n,
                          );
                          if (items.length === 0) return null;
                          return (
                            <div key={d.n}>
                              <div className="mb-1 text-xs font-semibold text-slate-500">
                                {d.label}
                              </div>
                              <div className="overflow-hidden rounded-lg border border-slate-200">
                                <table className="min-w-full divide-y divide-slate-100 text-sm">
                                  <thead className="bg-slate-50">
                                    <tr>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Hora</th>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Taller</th>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Cat.</th>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Aula</th>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Profesor</th>
                                      <th className="px-2 py-1 text-left font-medium text-slate-500">Acciones</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 bg-white">
                                    {items.map((ins) => {
                                      const cambiando = cambiandoId === ins.id;
                                      return (
                                        <tr key={ins.id} className="align-top">
                                          <td className="px-2 py-1 text-slate-700">
                                            {fmtRango(ins.taller.hora_inicio, ins.taller.hora_fin)}
                                          </td>
                                          <td className="px-2 py-1 font-medium text-slate-900">
                                            {ins.taller.titulo}
                                          </td>
                                          <td className="px-2 py-1 text-slate-600">
                                            {ins.taller.categoria}
                                          </td>
                                          <td className="px-2 py-1 text-slate-600">
                                            {ins.taller.aula || "—"}
                                          </td>
                                          <td className="px-2 py-1 text-slate-600">
                                            {ins.taller.profesor || "—"}
                                          </td>
                                          <td className="px-2 py-1">
                                            <div className="flex flex-col gap-1">
                                              {!cambiando ? (
                                                <>
                                                  <button
                                                    onClick={() => handleBaja(ins, nombreCompleto)}
                                                    disabled={procesando.has(ins.id)}
                                                    className="btn-danger px-2 py-1 text-xs"
                                                  >
                                                    {procesando.has(ins.id) ? "…" : "Dar de baja"}
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      setCambiandoId(ins.id);
                                                      setNuevoTallerId("");
                                                      setErrores((e) => { const n = { ...e }; delete n[ins.id]; return n; });
                                                      setOkMsg((m) => { const n = { ...m }; delete n[ins.id]; return n; });
                                                    }}
                                                    disabled={procesando.has(ins.id)}
                                                    className="btn-secondary px-2 py-1 text-xs"
                                                  >
                                                    Cambiar de taller
                                                  </button>
                                                </>
                                              ) : (
                                                <div className="flex flex-col gap-1">
                                                  <select
                                                    className="input px-2 py-1 text-xs"
                                                    value={nuevoTallerId}
                                                    onChange={(e) => setNuevoTallerId(e.target.value)}
                                                    disabled={procesando.has(ins.id)}
                                                  >
                                                    <option value="">Elegir taller…</option>
                                                    {talleresPorDia[ins.taller.dia]?.map((t) => (
                                                      <option key={t.id} value={t.id}>
                                                        {t.titulo} ({fmtRango(t.hora_inicio, t.hora_fin)})
                                                      </option>
                                                    ))}
                                                  </select>
                                                  <div className="flex gap-1">
                                                    <button
                                                      onClick={() => handleCambiar(ins, nombreCompleto)}
                                                      disabled={procesando.has(ins.id)}
                                                      className="btn-primary px-2 py-1 text-xs"
                                                    >
                                                      {procesando.has(ins.id) ? "…" : "Confirmar"}
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setCambiandoId(null);
                                                        setNuevoTallerId("");
                                                        setErrores((e) => { const n = { ...e }; delete n[ins.id]; return n; });
                                                      }}
                                                      disabled={procesando.has(ins.id)}
                                                      className="btn-secondary px-2 py-1 text-xs"
                                                    >
                                                      Cancelar
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                              {errores[ins.id] && (
                                                <span className="text-xs text-red-600">
                                                  {errores[ins.id]}
                                                </span>
                                              )}
                                              {okMsg[ins.id] && (
                                                <span className="text-xs text-green-600">
                                                  {okMsg[ins.id]}
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
