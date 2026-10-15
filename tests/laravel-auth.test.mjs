import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const moduleUrl = url(compile(await readFile('lib/laravel-auth.ts', 'utf8')).replace('import "server-only";', ''));
const { laravelAuth } = await import(moduleUrl);
const originalFetch = globalThis.fetch;
const originalBackend = process.env.LARAVEL_BACKEND_URL;
const response = (body, cookies=[]) => {
  const result = Response.json(body);
  for (const cookie of cookies) result.headers.append('Set-Cookie',cookie);
  return result;
};

test('unconfigured deployments keep existing Google login without contacting Laravel',async()=>{
  delete process.env.LARAVEL_BACKEND_URL;
  globalThis.fetch=()=>{throw new Error('Unexpected backend request');};
  assert.deepEqual(await laravelAuth('POST','','token'),{status:200,body:{enabled:false,user:null},cookies:[]});
});
test('login forwards CSRF and rotated encrypted session cookies, while hiding backend CSRF from the client',async()=>{
  process.env.LARAVEL_BACKEND_URL='http://127.0.0.1:8000';
  const calls=[];
  globalThis.fetch=async(endpoint,options)=>{
    calls.push({endpoint:String(endpoint),options});
    return calls.length===1
      ?response({user:null,csrfToken:'csrf-test'},['comparacel_backend_session=seed; HttpOnly; SameSite=Lax'])
      :response({user:{uid:'same-uid'}},['comparacel_backend_session=rotated; HttpOnly; SameSite=Lax']);
  };
  const result=await laravelAuth('POST','comparacel_backend_session=old; other=retained','signed-token');
  assert.equal(calls[1].options.headers['X-CSRF-TOKEN'],'csrf-test');
  assert.match(calls[1].options.headers.Cookie,/comparacel_backend_session=seed/);
  assert.match(calls[1].options.headers.Cookie,/other=retained/);
  assert.equal(calls[1].options.cache,'no-store');
  assert.equal(calls[1].options.redirect,'manual');
  assert.equal(JSON.parse(calls[1].options.body).idToken,'signed-token');
  assert.deepEqual(result.body,{enabled:true,user:{uid:'same-uid'}});
  assert.equal(result.cookies.length,1);
  assert.match(result.cookies[0],/=rotated/);
});
test('anonymous logout does not create a backend session',async()=>{
  globalThis.fetch=()=>{throw new Error('Unexpected request');};
  assert.deepEqual((await laravelAuth('DELETE','')).body,{enabled:true,user:null});
});

let route = compile(await readFile('app/api/auth/session/route.ts','utf8'));
route=route.replace('"@/lib/laravel-auth"',JSON.stringify(moduleUrl));
route=route.replace('"next/server"',JSON.stringify(url('export const NextResponse={json:(body,options)=>({...options,body,headers:new Headers(options?.headers)})};')));
const {POST}=await import(url(route));
test('cross-origin login and invalid JSON are rejected before accessing the backend',async()=>{
  globalThis.fetch=()=>{throw new Error('Unexpected backend request');};
  const request=(origin,text)=>({headers:new Headers({origin}),nextUrl:{origin:'https://comparacel.test'},text:async()=>text});
  assert.equal((await POST(request('https://other.test','{}'))).status,403);
  assert.equal((await POST(request('https://comparacel.test','invalid'))).status,400);
  assert.equal((await POST(request('https://comparacel.test','null'))).status,400);
});
test('browser origin is compared to the actual Host when Next uses an internal localhost URL',async()=>{
  process.env.LARAVEL_BACKEND_URL='http://127.0.0.1:8000';
  globalThis.fetch=async(_endpoint,options)=>options.method==='POST'
    ?response({user:{uid:'test-uid'}}):response({csrfToken:'test-csrf',user:null});
  const result=await POST({headers:new Headers({origin:'http://127.0.0.1:3200',host:'127.0.0.1:3200'}),nextUrl:{origin:'http://localhost:3200'},text:async()=>JSON.stringify({idToken:'test-token'})});
  assert.equal(result.status,200);
  assert.equal(result.body.user.uid,'test-uid');
});

const client=await import(url(compile(await readFile('lib/laravel-auth-client.ts','utf8'))));
test('duplicate login syncs share one request and logout waits for the pending login',async()=>{
  let release;
  const calls=[];
  globalThis.fetch=async(_url,options)=>{
    calls.push(options.method);
    if(options.method==='POST')await new Promise(resolve=>{release=resolve;});
    return response({enabled:true,user:{uid:'test-uid'}});
  };
  const user={uid:'test-uid',getIdToken:async()=> 'test-token'};
  const first=client.syncLaravelSession(user);
  assert.equal(client.syncLaravelSession(user),first);
  await new Promise(resolve=>setImmediate(resolve));
  const logout=client.endLaravelSession();
  assert.deepEqual(calls,['POST']);
  release();
  await Promise.all([first,logout]);
  assert.deepEqual(calls,['POST','DELETE']);
});
test.after(()=>{
  globalThis.fetch=originalFetch;
  if(originalBackend===undefined)delete process.env.LARAVEL_BACKEND_URL;
  else process.env.LARAVEL_BACKEND_URL=originalBackend;
});
