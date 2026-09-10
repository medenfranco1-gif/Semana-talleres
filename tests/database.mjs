import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

// Never connects to a supplied DATABASE_URL. All users/data are disposable and local.
const port = Number(process.env.TEST_PG_PORT || 55439);
const dir = new URL(`../.test-data/pg-${Date.now()}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const database = new EmbeddedPostgres({ databaseDir: dir, port, user: 'postgres',
  password: 'local-tests-only', persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'max_connections=60', '-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {}, onError: () => {} });
let pool;
const metrics = [];
try {
  await database.initialise();
  await database.start();
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'local-tests-only', database: 'postgres', max: 40 });
  await pool.query(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`);
  await pool.query(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
  // Match Supabase's default API table grants, leaving RLS responsible for access.
  await pool.query('grant select, insert, update, delete on all tables in schema public to anon, authenticated');
  const migration = await readFile(new URL('../supabase/migrations/202609100001_registration.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(migration); // rerunnable
  await pool.query(`update public.configuracion set inscripciones_abiertas_global=true,
    inscripciones_abiertas_dia1=true, inscripciones_abiertas_dia2=true, inscripciones_abiertas_dia3=true`);
  const users = Array.from({ length: 410 }, () => randomUUID());
  for (const id of users) {
    await pool.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,
      '{"nombre":"Carga","apellido":"Prueba","curso":"1","division":"A"}')`, [id, `${id}@example.invalid`]);
  }
  async function workshop(title, capacity, day=1, category='Arte', start='09:00', end='10:00') {
    return (await pool.query(`insert into talleres(titulo,cupo_max,dia,categoria,hora_inicio,hora_fin)
      values($1,$2,$3,$4,$5,$6) returning id`, [title,capacity,day,category,start,end])).rows[0].id;
  }
  async function asUser(user, callback) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      const result = await callback(client);
      await client.query('commit');
      return result;
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }
  const register = (user, id) => asUser(user, async c => (await c.query('select registrar_taller($1) as result', [id])).rows[0].result);
  const count = async id => Number((await pool.query('select count(*) n from inscripciones where taller_id=$1',[id])).rows[0].n);
  const hot = await workshop('Últimos lugares',25);
  const started = performance.now();
  const outcomes = await Promise.all(users.slice(0,400).map(async user => {
    const t = performance.now();
    const result = await asUser(user, async c => {
      const catalog = (await c.query('select catalogo_publico() as data')).rows[0].data;
      assert(catalog.talleres.some(t => t.id === hot));
      return (await c.query('select registrar_taller($1) as result',[hot])).rows[0].result;
    });
    metrics.push(performance.now()-t);
    return result;
  }));
  assert.equal(outcomes.filter(x=>x.ok).length,25);
  assert.equal(await count(hot),25);
  assert(outcomes.filter(x=>!x.ok).every(x=>x.mensaje.includes('cupo máximo')));
  const elapsed = performance.now()-started;
  const distributedIds = [];
  for (let i=0; i<20; i++) distributedIds.push(await workshop(`Distribuido ${i}`,20,2,'Distribuida'));
  const distributedStart=performance.now();
  const distributed=await Promise.all(users.slice(0,400).map((user,i)=>register(user,distributedIds[i%20])));
  assert.equal(distributed.filter(x=>x.ok).length,400);
  for (const id of distributedIds) assert.equal(await count(id),20);
  const distributedMs=Math.round(performance.now()-distributedStart);
  const winner = users[outcomes.findIndex(x=>x.ok)];
  const retry = await register(winner,hot);
  assert.equal(retry.ok,true);
  assert.equal(await count(hot),25);
  await asUser(users[399],async c => {
    const total = (await c.query('select catalogo_publico() as data')).rows[0].data.talleres.find(t=>t.id===hot).cupo_actual;
    assert.equal(total,25);
    assert(Number((await c.query('select count(*) n from inscripciones')).rows[0].n)<=2);
  });
  const u=users[400];
  const overlapA=await workshop('Solapamiento A',10,2,'Ciencia');
  const overlapB=await workshop('Solapamiento B',10,2,'Música');
  const overlap=await Promise.all([register(u,overlapA), register(u,overlapB)]);
  assert.equal(overlap.filter(x=>x.ok).length,1);
  assert(overlap.find(x=>!x.ok).mensaje.includes('franja horaria'));
  const catA=await workshop('Categoría A',10,3,'Arte','09:00','10:00');
  const catB=await workshop('Categoría B',10,3,'Arte','11:00','12:00');
  const cat=await Promise.all([register(users[401],catA),register(users[401],catB)]);
  assert.equal(cat.filter(x=>x.ok).length,1);
  const repeatedA=await workshop('Repetido',10,1,'Técnica');
  const repeatedB=await workshop('  repetido ',10,2,'Técnica');
  assert.equal((await register(users[402],repeatedA)).ok,true);
  assert.equal((await register(users[402],repeatedB)).ok,false);
  for(let day=1;day<=3;day++) {
    const id=await workshop(`Cocina ${day}`,10,day,'Cocina');
    assert.equal((await register(users[403],id)).ok,day<=2);
  }
  // Failed attempts persist the limiter; direct INSERT cannot bypass it.
  for(let i=0;i<20;i++) assert.equal((await register(users[404],hot)).ok,false);
  assert((await register(users[404],hot)).mensaje.includes('Demasiados intentos'));
  await assert.rejects(asUser(users[405],c=>c.query(`insert into inscripciones(alumno_id,taller_id)
    select id,$1 from alumnos where auth_user_id=$2`,[catA,users[405]])), /row-level security/);
  const closed=await workshop('Cerrado',10,3,'Ciencia');
  await pool.query('update configuracion set inscripciones_abiertas_dia3=false');
  assert((await register(users[406],closed)).mensaje.includes('cerradas'));
  await pool.query('update configuracion set inscripciones_abiertas_dia3=true');
  await pool.query('update talleres set activo=false where id=$1',[closed]);
  assert((await register(users[406],closed)).mensaje.includes('no está disponible'));
  // A failed admin transfer leaves the original row intact.
  await pool.query("update alumnos set rol='admin' where auth_user_id=$1",[users[409]]);
  const original=(await pool.query('select id,taller_id from inscripciones where alumno_id=(select id from alumnos where auth_user_id=$1)',[users[401]])).rows[0];
  await assert.rejects(asUser(users[409], c=>c.query('select cambiar_taller($1,$2)',[original.id,hot])), /cupo máximo/);
  assert.equal((await pool.query('select taller_id from inscripciones where id=$1',[original.id])).rows[0].taller_id,original.taller_id);
  await assert.rejects(asUser(users[409],c=>c.query('update inscripciones set taller_id=$1 where id=$2',[hot,original.id])),/cambiar_taller/);
  await assert.rejects(asUser(users[405],c=>c.query('select cambiar_taller($1,$2)',[original.id,catA])),/No autorizado/);
  const replacement=await workshop('Cambio válido',10,2,'Nueva');
  await asUser(users[409],c=>c.query('select cambiar_taller($1,$2)',[original.id,replacement]));
  assert.equal((await pool.query('select taller_id from inscripciones where id=$1',[original.id])).rows[0].taller_id,replacement);
  const attack=randomUUID();
  await pool.query('insert into auth.users(id,email) values($1,$2)',[attack,`${attack}@example.invalid`]);
  await assert.rejects(asUser(attack,c=>c.query(`insert into alumnos(auth_user_id,nombre,apellido,curso,division,email,rol)
    values($1,'A','B','1','A',$2,'admin')`,[attack,`${attack}@example.invalid`])),/row-level security/);
  metrics.sort((a,b)=>a-b);
  const report={ date:new Date().toISOString(), postgres:(await pool.query('select version()')).rows[0].version,
    scope:'Local real PostgreSQL; 400 concurrent logical users through a 40-connection pool. Includes queue time. Not Vercel/Supabase HTTP or Auth load.',
    users:400, connections:40, accepted:25, capacityRejections:375, oversold:0,
    elapsedMs:Math.round(elapsed), distributedAccepted:400, distributedMs,
    p95Ms:Math.round(metrics[Math.ceil(metrics.length*.95)-1]),
    p99Ms:Math.round(metrics[Math.ceil(metrics.length*.99)-1]), assertions:'passed' };
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await writeFile(new URL('../test-results/database.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  if(pool) await pool.end();
  await database.stop();
}
