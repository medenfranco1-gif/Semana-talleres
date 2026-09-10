import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
// Explicit staging opt-in; creates only uniquely named fixtures. Never cleans up other data.
if (process.env.ALLOW_LOAD_TEST !== 'staging') throw new Error('Set ALLOW_LOAD_TEST=staging for a disposable Supabase project.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtures=[];
const run=randomUUID().slice(0,8);
let workshopId=process.env.LOAD_TALLER_ID;
if(!workshopId) throw new Error('Set LOAD_TALLER_ID to an open active staging workshop.');
for(let i=0;i<400;i++) {
  const email=`load-${run}-${i}@example.invalid`, password=randomUUID()+randomUUID();
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,
    user_metadata:{nombre:'Carga',apellido:run,curso:'1',division:'A'}});
  if(error) throw error;
  const jar=new Map();
  const client=createServerClient(url,key,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),
    setAll:values=>values.forEach(({name,value})=>jar.set(name,value))}});
  const login=await client.auth.signInWithPassword({email,password});
  if(login.error) throw login.error;
  fixtures.push({userId:data.user.id,tallerId:workshopId,
    cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ') +
      (process.env.PRIVATE_TEST_PASSWORD ? `; private_test_access=${encodeURIComponent(process.env.PRIVATE_TEST_PASSWORD)}`:'')});
  await writeFile(new URL('./fixtures.json',import.meta.url),JSON.stringify(fixtures,null,2));
  // Prep does not benchmark login. Pace it to avoid creating an Auth burst.
  await new Promise(r=>setTimeout(r,Number(process.env.PREP_DELAY_MS || 1000)));
}
console.log('Prepared 400 staging sessions. fixtures.json contains sensitive cookies; it is gitignored.');
// Obtain action ID from the SAME build deployed for the test.
try {
  const manifest=JSON.parse(await readFile(new URL('../.next/server/server-reference-manifest.json',import.meta.url),'utf8'));
  console.log('Catalog action candidates:',Object.entries(manifest.node).filter(([,v])=>Object.keys(v.workers).some(k=>k.includes('catalogo'))).map(([id])=>id));
  console.log('Identify inscribirAction in the browser Network request Next-Action header; use that exact ID.');
} catch { console.log('Set ACTION_ID from the browser Network Next-Action header for inscribirAction.'); }
