// Monitor de Supabase (solo lectura, anon key). No imprime credenciales.
// Métricas: estado de franjas/config, inscripciones y cupos por taller,
// talleres llenos, y salud de la API.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(join(root, file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const env = { ...loadEnv(".env.loadtest"), ...loadEnv(".env.local"), ...loadEnv(".env") };
const URL = env.TEST_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.TEST_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error("FALTAN credenciales (URL/ANON_KEY). Abortando.");
  process.exit(2);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest(path, { head = false, prefer } = {}) {
  const t0 = Date.now();
  const headers = { ...H };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method: head ? "HEAD" : "GET",
    headers,
  });
  const ms = Date.now() - t0;
  return { res, ms };
}

// Cuenta filas usando Content-Range (Prefer: count=exact, HEAD).
function parseCount(res) {
  const cr = res.headers.get("content-range"); // "0-24/25" o "*/25"
  if (!cr) return null;
  const n = cr.split("/")[1];
  return n === "*" ? null : parseInt(n, 10);
}

async function main() {
  const ts = new Date().toISOString();
  const lines = [];
  lines.push(`=== Monitor Supabase @ ${ts} ===`);

  // 1) Salud + config/franjas
  let health = "OK";
  const { res: cRes, ms: cMs } = await rest(
    "configuracion?id=eq.1&select=inscripciones_abiertas_global,inscripciones_abiertas_dia1,inscripciones_abiertas_dia2,inscripciones_abiertas_dia3,franja_1_abierta,franja_2_abierta,franja_3_abierta",
  );
  if (!cRes.ok) {
    health = `ERROR config ${cRes.status}`;
    lines.push(`SALUD: ${health} (${cMs}ms)`);
  } else {
    const cfg = (await cRes.json())[0] || {};
    const on = (b) => (b ? "🟢 abierta" : "🔴 cerrada");
    lines.push(`SALUD: OK (config ${cMs}ms)`);
    lines.push(
      `CONFIG: global=${cfg.inscripciones_abiertas_global ? "ON" : "OFF"} · dia1=${cfg.inscripciones_abiertas_dia1 ? "ON" : "OFF"} · dia2=${cfg.inscripciones_abiertas_dia2 ? "ON" : "OFF"} · dia3=${cfg.inscripciones_abiertas_dia3 ? "ON" : "OFF"}`,
    );
    lines.push(
      `FRANJAS D1: f1(08-09:30)=${on(cfg.franja_1_abierta)} · f2(10-12)=${on(cfg.franja_2_abierta)} · f3(13-15)=${on(cfg.franja_3_abierta)}`,
    );
  }

  // 2) Inscripciones totales (count exact via HEAD)
  const { res: iRes } = await rest("inscripciones?select=id", {
    head: true,
    prefer: "count=exact",
  });
  const totalInsc = iRes.ok ? parseCount(iRes) : null;
  lines.push(
    `INSCRIPCIONES totales: ${totalInsc ?? "n/d (RLS o error " + iRes.status + ")"}`,
  );

  // 3) Talleres + cupos (usa la función contar_cupos_talleres si hay talleres)
  const { res: tRes } = await rest(
    "talleres?activo=eq.true&select=id,titulo,dia,hora_inicio,cupo_max&order=dia,hora_inicio",
  );
  if (tRes.ok) {
    const talleres = await tRes.json();
    let cupos = {};
    try {
      const cr = await fetch(`${URL}/rest/v1/rpc/contar_cupos_talleres`, {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ p_taller_ids: talleres.map((t) => t.id) }),
      });
      if (cr.ok) {
        for (const row of await cr.json()) cupos[row.taller_id] = row.cupo_actual;
      }
    } catch {}
    const llenos = [];
    const casi = [];
    for (const t of talleres) {
      const actual = cupos[t.id] ?? 0;
      const rest = t.cupo_max - actual;
      if (rest <= 0) llenos.push(`D${t.dia} ${t.hora_inicio?.slice(0, 5)} ${t.titulo}`);
      else if (rest <= 3) casi.push(`D${t.dia} ${t.titulo} (${rest} libres)`);
    }
    lines.push(`TALLERES activos: ${talleres.length}`);
    lines.push(`  🔴 LLENOS (${llenos.length}): ${llenos.length ? llenos.join(" | ") : "ninguno"}`);
    if (casi.length) lines.push(`  🟡 casi llenos: ${casi.join(" | ")}`);
  } else {
    lines.push(`TALLERES: error ${tRes.status}`);
  }

  console.log(lines.join("\n"));
}

main().catch((e) => {
  console.error(`Monitor FALLÓ: ${e.message}`);
  process.exit(1);
});
