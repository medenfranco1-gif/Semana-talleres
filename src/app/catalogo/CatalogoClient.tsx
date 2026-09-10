"use client";

import { useMemo, useState, useCallback } from "react";
import { DIAS, fmtRango } from "@/lib/format";
import {
  evaluarBloqueoCliente,
  textoMotivo,
  type MotivoBloqueo,
} from "@/lib/validacion-cliente";
import { inscribirAction } from "./actions";
import type {
  Taller,
  Categoria,
  Configuracion,
  Inscripcion,
  ResultadoInscripcion,
} from "@/lib/types";

interface Props {
  talleres: Taller[];
  categorias: Categoria[];
  config: Configuracion | null;
  inscripcionesAlumno: Inscripcion[];
  alumnoId: string;
}

type FiltroCat = string | "todas";

/**
 * Catálogo de talleres para el alumno.
 *
 * Nota de arquitectura: NO se usa Supabase Realtime en el catálogo.
 * El plan gratuito de Supabase limita las conexiones Realtime y, con
 * ~500 alumnos navegando a la vez, se agotarían rápido. En su lugar:
 *  - Los cupos se cargan como un snapshot inicial (Server Component).
 *  - El cupo *real* lo decide el trigger `validar_inscripcion` en la BD
 *    al momento del INSERT, con bloqueo `FOR UPDATE` (no se saltea).
 *  - Tras una inscripción exitosa, actualizamos el estado local de
 *    inscripciones optimistamente (sin recargar toda la página), lo que
 *    reduce drásticamente la carga en Supabase durante picos de tráfico.
 */
export function CatalogoClient({
  talleres: talleresInit,
  categorias,
  config: configInit,
  inscripcionesAlumno: inscripcionesInit,
  alumnoId,
}: Props) {
  // Estado local inicializado desde el snapshot del Server Component.
  // No hay suscripción a Realtime: el estado cambia solo cuando el usuario
  // interactúa. No se hace router.refresh() para evitar recargar todo el
  // catálogo (talleres, categorías, config, cupos) innecesariamente.
  const [talleres] = useState<Taller[]>(talleresInit);
  const [config] = useState<Configuracion | null>(configInit);
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>(inscripcionesInit);

  const [filtroCat, setFiltroCat] = useState<FiltroCat>("todas");
  const [diaActivo, setDiaActivo] = useState<1 | 2 | 3>(1);
  const [resultados, setResultados] = useState<Record<string, ResultadoInscripcion>>({});
  const [procesando, setProcesando] = useState<Set<string>>(new Set());

  // mapas para validación
  const talleresMap = useMemo(() => {
    const m: Record<string, Taller> = {};
    for (const t of talleres) m[t.id] = t;
    return m;
  }, [talleres]);

  const yaInscriptoIds = useMemo(
    () => new Set(inscripciones.map((i) => i.taller_id)),
    [inscripciones],
  );

  // ---------- INSCRIPCIÓN ----------
  // Sin router.refresh(): tras una inscripción exitosa, solo actualizamos el
  // estado local de inscripciones. Esto evita recargar todo el catálogo
  // (talleres, categorías, config, cupos, getUser de Auth) desde el servidor,
  // reduciendo drásticamente la carga en Supabase durante inscripciones masivas.
  // El cupo mostrado puede quedar desactualizado, pero el trigger de la BD
  // siempre valida el cupo real con FOR UPDATE, así que la integridad está
  // garantizada. Si el alumno recarga la página manualmente, verá el estado
  // actualizado desde el servidor.
  const handleInscribir = useCallback(
    async (tallerId: string) => {
      setProcesando((p) => new Set(p).add(tallerId));
      try {
        const res = await inscribirAction(tallerId);
        setResultados((r) => ({ ...r, [tallerId]: res }));
        if (res.ok) {
          // Actualización optimista local: marcamos el taller como inscripto
          // para que el botón cambie de inmediato, sin recargar desde servidor.
          setInscripciones((prev) => {
            if (prev.some((i) => i.taller_id === tallerId)) return prev;
            return [
              ...prev,
              {
                id: `optimistic-${tallerId}`,
                alumno_id: alumnoId,
                taller_id: tallerId,
                fecha_inscripcion: new Date().toISOString(),
                created_at: new Date().toISOString(),
              } as Inscripcion,
            ];
          });
        }
      } finally {
        setProcesando((p) => {
          const n = new Set(p);
          n.delete(tallerId);
          return n;
        });
      }
    },
    [alumnoId],
  );

  // Wrapper con confirmación previa: muestra un diálogo "¿seguro?" con el
  // título del taller antes de disparar la inscripción real.
  const handleInscribirConConfirmacion = useCallback(
    (taller: Taller) => {
      const avisoAlimento = !taller.requiere_materiales
        ? "\n\nEste taller no requiere comprar materiales: traé un alimento no perecedero como colaboración."
        : "";
      const ok = window.confirm(
        `¿Seguro querés inscribirte a "${taller.titulo}"?${avisoAlimento}`,
      );
      if (!ok) return;
      handleInscribir(taller.id);
    },
    [handleInscribir],
  );

  // ---------- FILTRO Y AGRUPACIÓN ----------
  const talleresDia = useMemo(() => {
    const lista = talleres.filter((t) => t.dia === diaActivo);
    if (filtroCat === "todas") return lista;
    return lista.filter((t) => t.categoria === filtroCat);
  }, [talleres, diaActivo, filtroCat]);

  // agrupar por franja horaria (hora_inicio) para armar "grilla"
  const franjas = useMemo(() => {
    const m = new Map<string, Taller[]>();
    for (const t of talleresDia) {
      const key = t.hora_inicio;
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [talleresDia]);

  const diaAbierto =
    config &&
    (diaActivo === 1
      ? config.inscripciones_abiertas_dia1
      : diaActivo === 2
        ? config.inscripciones_abiertas_dia2
        : config.inscripciones_abiertas_dia3);

  // ¿Hay algún taller en el catálogo que NO requiera materiales? Solo en ese
  // caso mostramos el banner del alimento no perecedero (si todos piden
  // materiales, el aviso no aplica y no ensucia la pantalla). Fran pidió que
  // el aviso aparezca al entrar al catálogo, no solo dentro de cada tarjeta.
  const hayTalleresSinMateriales = useMemo(
    () => talleres.some((t) => !t.requiere_materiales),
    [talleres],
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Catálogo de talleres</h1>
        <p className="mt-1 text-sm text-slate-600">
          Elegí los talleres por día. Los cupos mostrados son aproximados y se
          confirman recién al presionar “Inscribirme”.
        </p>
      </div>

      {/* Aviso de alimento no perecedero: aparece al entrar al catálogo. */}
      {hayTalleresSinMateriales && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🥫</span>
            <div>
              <p className="font-semibold">Llevar alimento no perecedero</p>
              <p className="mt-0.5 text-amber-800">
                Algunos talleres marcados con 🥫 <strong>no requieren que
                compres materiales</strong>: como colaboración, tenés que llevar
                un alimento no perecedero (fideos, arroz, legumbres, leche
                larga vida, etc.). Fijate en cada tarjeta cuál lo pide.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* selector de día */}
      <div className="mb-4 flex flex-wrap gap-2">
        {DIAS.map((d) => {
          const abierto = config
            ? d.n === 1
              ? config.inscripciones_abiertas_dia1
              : d.n === 2
                ? config.inscripciones_abiertas_dia2
                : config.inscripciones_abiertas_dia3
            : false;
          return (
            <button
              key={d.n}
              onClick={() => setDiaActivo(d.n)}
              className={`btn ${
                diaActivo === d.n
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d.label}
              <span
                className={`ml-2 inline-block h-2 w-2 rounded-full ${
                  config?.inscripciones_abiertas_global && abierto
                    ? "bg-green-400"
                    : "bg-slate-300"
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* filtros de categoría */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Categoría:</span>
        <button
          onClick={() => setFiltroCat("todas")}
          className={`badge cursor-pointer ${
            filtroCat === "todas"
              ? "bg-brand-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Todas
        </button>
        {categorias.map((c) => (
          <button
            key={c.id}
            onClick={() => setFiltroCat(c.nombre)}
            className={`badge cursor-pointer ${
              filtroCat === c.nombre
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {/* estado inscripciones */}
      {config && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            config.inscripciones_abiertas_global && diaAbierto
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {!config.inscripciones_abiertas_global
            ? "Las inscripciones están cerradas globalmente."
            : !diaAbierto
              ? `Las inscripciones del ${DIAS.find((d) => d.n === diaActivo)?.label} están cerradas.`
              : `Inscripciones abiertas para el ${DIAS.find((d) => d.n === diaActivo)?.label}.`}
        </div>
      )}

      {/* grilla por franja horaria */}
      {franjas.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          No hay talleres para este filtro.
        </div>
      ) : (
        <div className="space-y-6">
          {franjas.map(([horaInicio, lista]) => (
            <div key={horaInicio}>
              <div className="mb-2 flex items-center gap-2">
                <span className="badge bg-brand-100 text-brand-700">
                  {fmtRango(lista[0].hora_inicio, lista[0].hora_inicio)}
                </span>
                <span className="text-xs text-slate-400">Franja horaria</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((t) => (
                  <TallerCard
                    key={t.id}
                    taller={t}
                    bloqueo={evaluarBloqueoCliente(
                      t,
                      inscripciones,
                      talleresMap,
                      config,
                      yaInscriptoIds,
                    )}
                    resultado={resultados[t.id]}
                    procesando={procesando.has(t.id)}
                    onInscribir={() => handleInscribirConConfirmacion(t)}
                    yaInscripto={yaInscriptoIds.has(t.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- tarjeta de taller ----------
function TallerCard({
  taller,
  bloqueo,
  resultado,
  procesando,
  onInscribir,
  yaInscripto,
}: {
  taller: Taller;
  bloqueo: MotivoBloqueo;
  resultado?: ResultadoInscripcion;
  procesando: boolean;
  onInscribir: () => void;
  yaInscripto: boolean;
}) {
  const cupoActual = taller.cupo_actual ?? 0;
  const disponible = Math.max(0, taller.cupo_max - cupoActual);
  const sinCupo = disponible <= 0;
  const bloqueado = bloqueo !== null;
  const mostrarError = resultado && !resultado.ok;
  const mostrarOk = resultado && resultado.ok;

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{taller.titulo}</h3>
        <span className="badge shrink-0 bg-slate-100 text-slate-600">
          {taller.categoria}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
        <span>{fmtRango(taller.hora_inicio, taller.hora_fin)}</span>
        {taller.aula && <span>· {taller.aula}</span>}
      </div>

      {taller.descripcion && (
        <p className="mt-2 line-clamp-3 text-sm text-slate-600">
          {taller.descripcion}
        </p>
      )}

      <div className="mt-2 text-sm text-slate-600">
        {taller.profesor && <div>Profesor: {taller.profesor}</div>}
      </div>

      {!taller.requiere_materiales && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          🥫 Este taller no requiere comprar materiales: traé un{" "}
          <strong>alimento no perecedero</strong> como colaboración.
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span
          className={`text-sm font-medium ${
            sinCupo
              ? "text-red-600"
              : disponible <= 3
                ? "text-amber-600"
                : "text-green-600"
          }`}
        >
          {sinCupo
            ? "Cupo completo"
            : `${disponible} de ${taller.cupo_max} lugares`}
        </span>
      </div>

      {/* mensajes */}
      {mostrarError && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {resultado!.mensaje}
        </div>
      )}
      {mostrarOk && !yaInscripto && (
        <div className="mt-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">
          {resultado!.mensaje}
        </div>
      )}

      {/* botón */}
      <div className="mt-3">
        {yaInscripto ? (
          <span className="btn w-full cursor-default bg-green-100 text-green-700">
            ✓ Inscripto
          </span>
        ) : bloqueado ? (
          <button
            disabled
            title={textoMotivo(bloqueo)}
            className="btn w-full cursor-not-allowed bg-slate-100 text-slate-400"
          >
            {textoMotivo(bloqueo)}
          </button>
        ) : (
          <button
            onClick={onInscribir}
            disabled={procesando}
            className="btn-primary w-full"
          >
            {procesando ? "Inscribiendo…" : "Inscribirme"}
          </button>
        )}
      </div>
    </div>
  );
}
