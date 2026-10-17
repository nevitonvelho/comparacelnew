import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {NextRequest} from 'next/server.js';
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const modelUrl=url(compile(await readFile('lib/admin-model.ts','utf8')));
const workbenchUrl=url(compile(await readFile('lib/seo-workbench.ts','utf8')).replace('"./admin-model"',JSON.stringify(modelUrl)));
const apiUrl=url(`export const adminHeaders={"Cache-Control":"no-store, private"};export async function requireAdministrator(request,permission){globalThis.seoCalls.push(["auth",permission]);if(!globalThis.seoAllowed)throw Object.assign(new Error("Forbidden"),{status:403});return {uid:"owner"};}export async function readAdminJson(request){return request.json();}export function adminFailure(error){return Response.json({error:error.message},{status:error.status||503});}`);
const dbUrl=url('export function getAdminDatabase(){return {collection:()=>({doc:()=>({get:async()=>({data:()=>({})})})})};}');
const serviceUrl=url(`export async function claimSeoAction(){globalThis.seoCalls.push(["limit"]);}export async function readSeoTarget(){globalThis.seoCalls.push(["read"]);return {page:{path:"/produto/a",fields:{},fingerprint:"fresh"},context:{}};}export async function saveSeoFields(){globalThis.seoCalls.push(["save"]);return {path:"/produto/a"};}export async function seoHistory(){return [];}`);
const geminiUrl=url('export async function generateSeoSuggestion(){globalThis.seoCalls.push(["generate"]);return {fields:{title:"Novo título"},model:"test"};}');
const searchUrl=url('export async function querySearchConsole(){globalThis.seoCalls.push(["search"]);return {rows:[]};}');
const seoUrl=url('export const absoluteUrl=path=>"https://comparacel.com.br"+path;');
const catalogUrl=url('export function invalidateServerCatalog(){globalThis.seoCalls.push(["invalidate"]);}');
async function loadRoute(file){let source=compile(await readFile(file,'utf8'));
 for(const [key,value]of Object.entries({'next/server':import.meta.resolve('next/server.js'),'@/lib/admin-api':apiUrl,'@/lib/firebase/admin':dbUrl,'@/lib/admin-seo':serviceUrl,'@/lib/gemini-seo':geminiUrl,'@/lib/search-console':searchUrl,'@/lib/seo':seoUrl,'@/lib/server-catalog':catalogUrl,'@/lib/admin-model':modelUrl,'@/lib/seo-workbench':workbenchUrl}))source=source.replaceAll(JSON.stringify(key),JSON.stringify(value));
 return import(url(source));
}
const generate=await loadRoute('app/api/admin/seo/generate/route.ts');
const page=await loadRoute('app/api/admin/seo/page/route.ts');
const request=(body,method='POST')=>new NextRequest('https://comparacel.com.br/api/admin/seo/generate',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('SEO API rejects unauthorized generation and publication before touching providers or data',async()=>{
 globalThis.seoAllowed=false;globalThis.seoCalls=[];
 assert.equal((await generate.POST(request({path:'/produto/a',fingerprint:'fresh'}))).status,403);
 assert.equal((await page.PATCH(request({path:'/produto/a'},'PATCH'))).status,403);
 assert.deepEqual(globalThis.seoCalls,[['auth','seo.manage'],['auth','seo.manage']]);
});
test('generating a draft does not save or invalidate any public content',async()=>{
 globalThis.seoAllowed=true;globalThis.seoCalls=[];
 const response=await generate.POST(request({path:'/produto/a',fingerprint:'fresh'}));
 assert.equal(response.status,200);assert.equal((await response.json()).fields.title,'Novo título');
 assert(!globalThis.seoCalls.some(([call])=>['save','invalidate'].includes(call)));
 assert(globalThis.seoCalls.some(([call])=>call==='limit'));
});
test('stale generation is rejected before consuming AI quota',async()=>{
 globalThis.seoAllowed=true;globalThis.seoCalls=[];
 assert.equal((await generate.POST(request({path:'/produto/a',fingerprint:'old'}))).status,409);
 assert(!globalThis.seoCalls.some(([call])=>['limit','generate'].includes(call)));
});
test('applying reviewed fields saves then invalidates public caches',async()=>{
 globalThis.seoAllowed=true;globalThis.seoCalls=[];
 assert.equal((await page.PATCH(request({path:'/produto/a',fingerprint:'fresh',fields:{}},'PATCH'))).status,200);
 assert.deepEqual(globalThis.seoCalls,[['auth','seo.manage'],['save'],['invalidate']]);
});
