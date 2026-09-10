import http from 'k6/http';
import { check, fail } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Counter } from 'k6/metrics';

const fixtures = new SharedArray('students', () => JSON.parse(open('./fixtures.json')));
const accepted = new Counter('registrations_confirmed');
const rejected = new Counter('registrations_business_rejected');
const unexpected = new Rate('unexpected_results');
export const options = {
  scenarios: { opening: { executor: 'per-vu-iterations', vus: 400, iterations: 1, maxDuration: '120s' } },
  thresholds: {
    checks: ['rate==1'],
    unexpected_results: ['rate==0'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{phase:catalog}': ['p(95)<3000'],
    'http_req_duration{phase:register}': ['p(95)<5000'],
    registrations_confirmed: ['count>0'],
  },
};
export function setup() {
  if (__ENV.ALLOW_LOAD_TEST !== 'staging' || !__ENV.BASE_URL || !__ENV.ACTION_ID) {
    throw new Error('Set ALLOW_LOAD_TEST=staging, BASE_URL and ACTION_ID for the exact deployed staging build.');
  }
  if (fixtures.length < 400 || new Set(fixtures.map(f=>f.userId)).size < 400) {
    throw new Error('Need 400 distinct authenticated test students.');
  }
}
export default function () {
  const user = fixtures[__VU - 1];
  const url = `${__ENV.BASE_URL.replace(/\/$/, '')}/catalogo`;
  const headers = { Cookie: user.cookie };
  // Zero redirects allowed: a maintenance/login response must not count as success.
  const catalog = http.get(url, { headers, redirects: 0, tags: { phase: 'catalog' } });
  const valid = check(catalog, {
    'authenticated catalog HTML': r => r.status === 200 && r.body.includes('Catálogo de talleres') && r.body.includes(user.tallerId),
  });
  if (!valid) { unexpected.add(true); fail('Catalog unavailable or redirected'); }
  const response = http.post(url, JSON.stringify([user.tallerId]), {
    headers: { ...headers, 'Next-Action': __ENV.ACTION_ID, 'Content-Type': 'text/plain;charset=UTF-8',
      Origin: __ENV.BASE_URL.replace(/\/$/, ''), Accept: 'text/x-component' },
    redirects: 0, tags: { phase: 'register' },
  });
  // React Flight assigns arbitrary record IDs. Read the actual action result,
  // never infer registration success from HTTP 200 alone.
  let result;
  for (const line of response.body.split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    try { const value = JSON.parse(line.slice(i+1)); if (typeof value?.ok === 'boolean') result = value; } catch {}
  }
  const businessRejection = result && !result.ok && /cupo máximo|franja horaria|misma categoría|límite alcanzado|otro día/.test(result.mensaje);
  const confirmed = result?.ok === true && !!result.inscripcion?.id;
  const good = response.status === 200 && (confirmed || businessRejection);
  unexpected.add(!good);
  check(response, { 'confirmed or expected business rejection': () => good });
  if (confirmed) accepted.add(1);
  if (businessRejection) rejected.add(1);
}
