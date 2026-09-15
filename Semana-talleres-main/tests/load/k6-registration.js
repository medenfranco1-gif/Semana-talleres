/**
 * k6 Load Test - Semana de Talleres
 *
 * Prueba de carga usando SOLO Supabase Auth + REST API.
 *
 * Uso:
 *   k6 run -e VUS=50 tests/load/k6-registration.js
 */

import http from 'k6/http';
import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ======================================================
// MÉTRICAS
// ======================================================

const loginDuration = new Trend('login_duration_ms');
const catalogoDuration = new Trend('catalogo_duration_ms');
const inscripcionDuration = new Trend('inscripcion_duration_ms');

const loginSuccess = new Counter('login_success');
const loginFailed = new Counter('login_failed');
const loginRateLimit = new Counter('login_rate_limit');

const catalogoSuccess = new Counter('catalogo_success');
const catalogoFailed = new Counter('catalogo_failed');

const inscripcionExito = new Counter('inscripcion_exito');
const inscripcionRechazoNegocio = new Counter('inscripcion_rechazo_negocio');
const inscripcionErrorTecnico = new Counter('inscripcion_error_tecnico');

const errores5xx = new Counter('errores_5xx');

// ======================================================
// USUARIOS
// ======================================================

const users = new SharedArray('users', function () {
  return JSON.parse(open('./register-users.json'));
});

// ======================================================
// CONFIG
// ======================================================

const TEST_SUPABASE_URL =
  __ENV.TEST_SUPABASE_URL ||
  'https://sslftnpjyurvqvavknqq.supabase.co';

const SUPABASE_ANON_KEY =
  __ENV.TEST_SUPABASE_ANON_KEY || '';

const TALLER_ID =
  __ENV.TALLER_ID ||
  '002a9ec3-5347-4c65-b160-c3f0ba675f81';

const VUS = parseInt(__ENV.VUS || '5', 10);

const ALLOWED_PROJECT_REF = 'sslftnpjyurvqvavknqq';

// ======================================================
// PROTECCIÓN
// ======================================================

if (!TEST_SUPABASE_URL.includes(ALLOWED_PROJECT_REF)) {
  throw new Error(
    `ERROR: Este script solo puede ejecutarse contra Semana-Talleres-Prueba-400.
Project Ref requerido: ${ALLOWED_PROJECT_REF}
URL actual: ${TEST_SUPABASE_URL}`
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    'ERROR: TEST_SUPABASE_ANON_KEY no definida.'
  );
}

if (VUS > users.length) {
  throw new Error(
    `ERROR: Pediste ${VUS} VUs pero solo hay ${users.length} usuarios en register-users.json`
  );
}

// ======================================================
// OPCIONES K6
// ======================================================

export const options = {
  vus: VUS,
  iterations: VUS,

  thresholds: {
    login_duration_ms: ['p(95)<5000'],
    catalogo_duration_ms: ['p(95)<1000'],
    inscripcion_duration_ms: ['p(95)<2000'],
    http_req_failed: ['rate<0.10'],
  },
};

// ======================================================
// SETUP
// ======================================================

export function setup() {
  console.log('');
  console.log('==============================================');
  console.log('CONFIGURACION K6');
  console.log('==============================================');
  console.log(`TEST_SUPABASE_URL: ${TEST_SUPABASE_URL}`);
  console.log(`TALLER_ID:         ${TALLER_ID}`);
  console.log(`VUS:               ${VUS}`);
  console.log(`Usuarios totales:  ${users.length}`);
  console.log('Modo: Supabase Auth + REST API');
  console.log('==============================================');
  console.log('');
}

// ======================================================
// TEST PRINCIPAL
// ======================================================

export default function () {
  const vuIndex = __VU - 1;

  if (vuIndex >= users.length) {
    return;
  }

  const user = users[vuIndex];

  // ====================================================
  // 1. LOGIN
  // ====================================================

  const loginStart = Date.now();

  const authResponse = http.post(
    `${TEST_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email: user.email,
      password: user.password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
    }
  );

  loginDuration.add(Date.now() - loginStart);

  if (authResponse.status >= 500) {
    errores5xx.add(1);
  }

  if (authResponse.status === 429) {
    loginRateLimit.add(1);
    return;
  }

  const loginOk = check(authResponse, {
    'login status 200': (r) => r.status === 200,
  });

  if (!loginOk) {
    loginFailed.add(1);
    return;
  }

  let authData;

  try {
    authData = authResponse.json();
  } catch {
    loginFailed.add(1);
    return;
  }

  const accessToken = authData?.access_token;
  const authUserId = authData?.user?.id;

  if (!accessToken || !authUserId) {
    loginFailed.add(1);
    return;
  }

  loginSuccess.add(1);

  // ====================================================
  // 2. CONSULTA DEL TALLER
  // ====================================================

  const catalogoStart = Date.now();

  const tallerResponse = http.get(
    `${TEST_SUPABASE_URL}/rest/v1/talleres?id=eq.${TALLER_ID}&select=id,titulo,cupo_max,activo`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  catalogoDuration.add(Date.now() - catalogoStart);

  if (tallerResponse.status >= 500) {
    errores5xx.add(1);
  }

  const tallerOk = check(tallerResponse, {
    'taller status 200': (r) => r.status === 200,
    'taller existe': (r) => {
      try {
        const data = r.json();
        return Array.isArray(data) && data.length > 0;
      } catch {
        return false;
      }
    },
  });

  if (!tallerOk) {
    catalogoFailed.add(1);
    return;
  }

  catalogoSuccess.add(1);

  // ====================================================
  // 3. OBTENER ALUMNO_ID
  // ====================================================

  const alumnoResponse = http.get(
    `${TEST_SUPABASE_URL}/rest/v1/alumnos?auth_user_id=eq.${authUserId}&select=id`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (alumnoResponse.status >= 500) {
    errores5xx.add(1);
  }

  let alumnoId = null;

  try {
    const alumnoData = alumnoResponse.json();

    if (
      alumnoResponse.status !== 200 ||
      !Array.isArray(alumnoData) ||
      alumnoData.length === 0
    ) {
      inscripcionErrorTecnico.add(1);
      return;
    }

    alumnoId = alumnoData[0].id;
  } catch {
    inscripcionErrorTecnico.add(1);
    return;
  }

  // ====================================================
  // 4. INSCRIPCIÓN
  // ====================================================

  const inscripcionStart = Date.now();

  const inscripcionResponse = http.post(
    `${TEST_SUPABASE_URL}/rest/v1/inscripciones`,
    JSON.stringify({
      alumno_id: alumnoId,
      taller_id: TALLER_ID,
    }),
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
    }
  );

  inscripcionDuration.add(Date.now() - inscripcionStart);

  if (inscripcionResponse.status >= 500) {
    errores5xx.add(1);
  }

  // ====================================================
  // CLASIFICACIÓN RESULTADO
  // ====================================================

  if (
    inscripcionResponse.status === 200 ||
    inscripcionResponse.status === 201 ||
    inscripcionResponse.status === 204
  ) {
    inscripcionExito.add(1);
    return;
  }

  if (inscripcionResponse.status === 409) {
    inscripcionRechazoNegocio.add(1);
    return;
  }

  if (
    inscripcionResponse.status === 400 ||
    inscripcionResponse.status === 403
  ) {
    const errorBody = String(inscripcionResponse.body || '').toLowerCase();

    const esRechazoNegocio =
      errorBody.includes('cupo') ||
      errorBody.includes('franja horaria') ||
      errorBody.includes('categor') ||
      errorBody.includes('inscripciones est') ||
      errorBody.includes('ya est') ||
      errorBody.includes('inscripto');

    if (esRechazoNegocio) {
      inscripcionRechazoNegocio.add(1);
    } else {
      inscripcionErrorTecnico.add(1);
    }

    return;
  }

  inscripcionErrorTecnico.add(1);
}

// ======================================================
// RESUMEN
// ======================================================

function metricValue(metrics, metricName, valueName) {
  const value = metrics?.[metricName]?.values?.[valueName];

  if (value === undefined || value === null) {
    return null;
  }

  return value;
}

function formatMs(value) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${Number(value).toFixed(0)}ms`;
}

function countMetric(metrics, name) {
  return metrics?.[name]?.values?.count || 0;
}

export function handleSummary(data) {
  const metrics = data.metrics;

  let summary = '\n';

  summary += '='.repeat(70) + '\n';
  summary += 'RESUMEN DE PRUEBA DE CARGA K6\n';
  summary += '='.repeat(70) + '\n';

  summary += `VUS:                     ${VUS}\n`;
  summary += `Iteraciones completadas: ${countMetric(metrics, 'iterations')}\n`;

  summary += '\nRESULTADOS:\n';

  summary += `Login OK:                ${countMetric(metrics, 'login_success')}\n`;
  summary += `Login fallo:             ${countMetric(metrics, 'login_failed')}\n`;
  summary += `Login rate limit 429:    ${countMetric(metrics, 'login_rate_limit')}\n`;

  summary += `Taller consultado OK:    ${countMetric(metrics, 'catalogo_success')}\n`;
  summary += `Consulta taller fallo:   ${countMetric(metrics, 'catalogo_failed')}\n`;

  summary += `Inscripciones exitosas:  ${countMetric(metrics, 'inscripcion_exito')}\n`;
  summary += `Rechazos de negocio:     ${countMetric(metrics, 'inscripcion_rechazo_negocio')}\n`;
  summary += `Errores tecnicos:        ${countMetric(metrics, 'inscripcion_error_tecnico')}\n`;
  summary += `Errores 5xx:             ${countMetric(metrics, 'errores_5xx')}\n`;

  summary += '\nTIEMPOS LOGIN:\n';
  summary += `Promedio: ${formatMs(metricValue(metrics, 'login_duration_ms', 'avg'))}\n`;
  summary += `P50:      ${formatMs(metricValue(metrics, 'login_duration_ms', 'med'))}\n`;
  summary += `P95:      ${formatMs(metricValue(metrics, 'login_duration_ms', 'p(95)'))}\n`;
  summary += `P99:      ${formatMs(metricValue(metrics, 'login_duration_ms', 'p(99)'))}\n`;
  summary += `Maximo:   ${formatMs(metricValue(metrics, 'login_duration_ms', 'max'))}\n`;

  summary += '\nTIEMPOS CONSULTA TALLER:\n';
  summary += `Promedio: ${formatMs(metricValue(metrics, 'catalogo_duration_ms', 'avg'))}\n`;
  summary += `P50:      ${formatMs(metricValue(metrics, 'catalogo_duration_ms', 'med'))}\n`;
  summary += `P95:      ${formatMs(metricValue(metrics, 'catalogo_duration_ms', 'p(95)'))}\n`;
  summary += `P99:      ${formatMs(metricValue(metrics, 'catalogo_duration_ms', 'p(99)'))}\n`;
  summary += `Maximo:   ${formatMs(metricValue(metrics, 'catalogo_duration_ms', 'max'))}\n`;

  summary += '\nTIEMPOS INSCRIPCION:\n';
  summary += `Promedio: ${formatMs(metricValue(metrics, 'inscripcion_duration_ms', 'avg'))}\n`;
  summary += `P50:      ${formatMs(metricValue(metrics, 'inscripcion_duration_ms', 'med'))}\n`;
  summary += `P95:      ${formatMs(metricValue(metrics, 'inscripcion_duration_ms', 'p(95)'))}\n`;
  summary += `P99:      ${formatMs(metricValue(metrics, 'inscripcion_duration_ms', 'p(99)'))}\n`;
  summary += `Maximo:   ${formatMs(metricValue(metrics, 'inscripcion_duration_ms', 'max'))}\n`;

  summary += '='.repeat(70) + '\n';

  return {
    stdout: summary,
  };
}