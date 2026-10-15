import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const replace = (source, dependencies) => Object.entries(dependencies).reduce((result,[name,value])=>result.replaceAll(JSON.stringify(name),JSON.stringify(url(value))),compile(source));
globalThis.metricsTest = {calls:[], entries:new Map(), active:true, validations:0};
const cachedModule = url(replace(await readFile('lib/server-metrics.ts','utf8'), {
  'server-only':'',
  'next/cache':`export const unstable_cache=(fn,keys,options)=>async(...args)=>{
    const state=globalThis.metricsTest,key=JSON.stringify([keys,args]);
    state.calls.push({keys,args,options});
    if(!state.entries.has(key))state.entries.set(key,await fn(...args));
    return state.entries.get(key);
  };`,
  './firebase/admin':'export const getAdminDatabase=()=>({});',
  './product-metrics-store':'export const readProductMetrics=async(_db,id)=>{globalThis.metricsTest.reads=(globalThis.metricsTest.reads??0)+1;return {views:id.length,favorites:1,saved:2};};',
  './comparison-activity':'export const readPopularComparisons=async(_db,now)=>[{id:"a-vs-b",window:now}];',
}));
const {getServerProductMetrics,getServerPopularComparisons}=await import(cachedModule);
test('public metrics share a 60-second cache per product, without caching prices',async()=>{
  const first=await getServerProductMetrics('phone');
  assert.deepEqual(await getServerProductMetrics('phone'),first);
  assert.equal(globalThis.metricsTest.reads,1);
  await getServerProductMetrics('other');
  assert.equal(globalThis.metricsTest.reads,2);
  assert.deepEqual(Object.keys(first).sort(),['favorites','saved','views']);
  assert.equal(globalThis.metricsTest.calls[0].options.revalidate,60);
});
test('ranking uses the current UTC day as its cache argument',async()=>{
  const rows=await getServerPopularComparisons();
  const call=globalThis.metricsTest.calls.at(-1);
  assert.equal(call.args[0],new Date().toISOString().slice(0,10));
  assert.equal(rows[0].window,Date.parse(`${call.args[0]}T00:00:00.000Z`));
  assert.equal(call.options.revalidate,60);
});
let routeSource=replace(await readFile('app/api/product-metrics/route.ts','utf8'),{
  'next/server':'export const NextResponse={json:(body,options)=>({body,...options})};',
  '@/lib/firebase/admin':`export const getAdminDatabase=()=>({doc:path=>({path}),getAll:async(...args)=>{
    const state=globalThis.metricsTest;state.validations++;
    state.mask=args.pop().fieldMask;
    return args.map(ref=>({id:ref.path.split('/').at(-1),data:()=>({isActive:state.active})}));
  }});`,
  '@/lib/engagement-model':'export const pageIdentity=(_kind,ids)=>ids.every(id=>typeof id==="string"&&id&&!id.includes("/"));',
});
routeSource=routeSource.replace(JSON.stringify('@/lib/server-metrics'),JSON.stringify(cachedModule));
const {POST}=await import(url(routeSource));
const request=()=>({headers:new Headers({origin:'https://example.test'}),nextUrl:{origin:'https://example.test'},text:async()=>JSON.stringify({ids:['phone','phone']})});
test('activity is checked on every request even when metrics are cached',async()=>{
  assert.equal((await POST(request())).body.products.phone.favorites,1);
  globalThis.metricsTest.active=false;
  assert.deepEqual((await POST(request())).body.products,{});
  assert.equal(globalThis.metricsTest.validations,2);
  assert.deepEqual(globalThis.metricsTest.mask,['isActive']);
});
