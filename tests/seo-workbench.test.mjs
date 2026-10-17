import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl = moduleUrl(compile(await readFile('lib/admin-model.ts','utf8')));
const workbenchUrl = moduleUrl(compile(await readFile('lib/seo-workbench.ts','utf8')).replace('"./admin-model"',JSON.stringify(modelUrl)));
const {validateSeoPath,validateSeoFields,metricsForPath,searchPeriods,contentDiagnosis,performanceLabel}=await import(workbenchUrl);
const fields={title:'Produto de teste: ficha técnica',metaDescription:'Uma descrição factual da ficha técnica do produto cadastrado, com características disponíveis e informações para comparar.',description:'Descrição factual. '.repeat(20),tags:['Processador','Tela']};
test('SEO targets allow only canonical product/comparison paths',()=>{
 assert.equal(validateSeoPath('/produto/a').kind,'product');
 assert.deepEqual(validateSeoPath('/comparar/a-vs-b').ids,['a','b']);
 for(const path of ['https://evil.example/produto/a','/admin','/produto/../a','/produto/a?x=1','/comparar/a-vs-a','/comparar/b-vs-a','/comparar/a-vs-b-vs-c','/produto/a/'])assert.throws(()=>validateSeoPath(path));
});
test('SEO input rejects markup, oversized snippets and invalid tag collections',()=>{
 assert.deepEqual(validateSeoFields({...fields,tags:[' Tela ','Tela']} ).tags,['Tela']);
 for(const patch of [{title:'<script>alert(1)</script>'},{title:'x'.repeat(71)},{metaDescription:'x'.repeat(161)},{tags:Array(9).fill('x')},{description:'<img src=x>'},{tags:['a\nb']}])assert.throws(()=>validateSeoFields({...fields,...patch}));
});
test('SEO quality is a content checklist independent of search metrics',()=>{
 assert.equal(contentDiagnosis(fields,{hasImage:true,specs:8}).score,100);
 assert.equal(contentDiagnosis({...fields,description:''},{hasImage:true,specs:8}).score,75);
 assert.equal(performanceLabel(null),'Sem dados no período');
 assert.equal(performanceLabel({impressions:2,position:1,ctr:1,clicks:2}),'Poucos dados');
 assert.equal(performanceLabel({impressions:100,position:8,ctr:.03,clicks:3}),'Bom desempenho');
 assert.equal(performanceLabel({impressions:100,position:8,ctr:.001,clicks:0}),'Oportunidade de melhoria');
});
test('Search Console uses adjacent 28-day Pacific date windows with 3-day lag',()=>{
 const periods=searchPeriods(new Date('2026-10-17T03:00:00Z'));
 assert.deepEqual(periods,{startDate:'2026-09-16',endDate:'2026-10-13',previousStartDate:'2026-08-19',previousEndDate:'2026-09-15'});
 assert.equal((Date.parse(periods.endDate)-Date.parse(periods.startDate))/86400000+1,28);
});
test('metrics recompute CTR and weighted position without merging URL variants',()=>{
 const row=(url,clicks,impressions,position)=>({keys:[url],clicks,impressions,ctr:0,position});
 const rows=[row('https://comparacel.com.br/produto/a',2,20,5),row('https://comparacel.com.br/produto/a',8,80,10),row('https://comparacel.com.br/produto/a?x=1',99,100,1),row('https://www.comparacel.com.br/produto/a',50,100,1)];
 assert.deepEqual(metricsForPath(rows,'/produto/a','https://comparacel.com.br'),{clicks:10,impressions:100,ctr:.1,position:9});
 assert.equal(metricsForPath(rows,'/produto/b','https://comparacel.com.br'),null);
});
const productUrl=moduleUrl('export function productFromData(id,data){return {id,name:data.name,brand:"Marca",category:data.categorySlug,description:data.description,specs:data.specs||[],imageUrl:"https://example.com/image"};}');
const seoUrl=moduleUrl('export const siteUrl="https://comparacel.com.br";export function absoluteUrl(path){return new URL(path,siteUrl).href;}');
const contentUrl=moduleUrl('export const seoDocumentId = path => path.replaceAll("/","-");');
const source=compile(await readFile('lib/admin-seo.ts','utf8')).replace('import "server-only";','').replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./admin-model"',JSON.stringify(modelUrl)).replace('"./product-data"',JSON.stringify(productUrl)).replace('"./seo"',JSON.stringify(seoUrl)).replace('"./seo-content"',JSON.stringify(contentUrl)).replace('"./seo-workbench"',JSON.stringify(workbenchUrl));
const {saveSeoFields,readSeoTarget,claimSeoAction}=await import(moduleUrl(source));
function database() {
 const values=new Map([['products/a',{name:'A',isActive:true,categorySlug:'celulares',adminRevision:3,description:'Texto antigo',meta_title:'Título antigo',meta_description:'Resumo antigo',specs:[],offers:[{price:123}]}]]);
 const writes=[];
 const snapshot=ref=>({exists:values.has(ref.path),data:()=>structuredClone(values.get(ref.path))});
 let id=0;
 const db={collection:name=>({doc:(key=String(++id))=>({path:`${name}/${key}`})}),getAll:async(...refs)=>refs.map(snapshot),runTransaction:async fn=>{
  if(db.beforeTransaction){db.beforeTransaction();db.beforeTransaction=null;}
  const pending=[];
  const result=await fn({get:async ref=>snapshot(ref),getAll:async(...refs)=>refs.map(snapshot),set:(ref,data,options)=>pending.push([ref,data,options])});
  for(const [ref,data,options] of pending){writes.push([ref.path,data]);values.set(ref.path,options?.merge?{...values.get(ref.path),...data}:data);}
  return result;
 }};
 return {db,values,writes};
}
test('applying SEO changes only SEO fields, increments revision and records reversible history',async()=>{
 const {db,values,writes}=database();
 const target=await readSeoTarget(db,'/produto/a');
 await saveSeoFields(db,{uid:'owner',email:'owner@example.com'},'/produto/a',target.page.fingerprint,fields);
 const saved=values.get('products/a');
 assert.equal(saved.adminRevision,4);
 assert.equal(saved.meta_title,fields.title);
 assert.equal(saved.name,'A');assert.deepEqual(saved.offers,[{price:123}]);
 const history=writes.find(([path])=>path.startsWith('adminSeoHistory/'))[1];
 assert.equal(history.before.description,'Texto antigo');assert.equal(history.after.description,fields.description.trim());
 assert(writes.some(([path])=>path.startsWith('adminAudit/')));
});
test('stale draft and concurrent catalog changes are rejected without any writes',async()=>{
 const {db,values,writes}=database();const target=await readSeoTarget(db,'/produto/a');
 await assert.rejects(saveSeoFields(db,{uid:'owner'},'/produto/a','stale',fields),error=>error.status===409);
 db.beforeTransaction=()=>{values.get('products/a').description='Changed externally without revision';};
 await assert.rejects(saveSeoFields(db,{uid:'owner'},'/produto/a',target.page.fingerprint,fields),error=>error.status===409);
 assert.equal(writes.length,0);
});
test('AI generation and Search Console synchronization have server-side cooldowns',async()=>{
 const {db}=database();const now=Date.parse('2026-10-17T12:00:00Z');
 await claimSeoAction(db,'owner','generate',now);
 await assert.rejects(claimSeoAction(db,'owner','generate',now+1000),error=>error.status===429);
 await claimSeoAction(db,'owner','generate',now+31000);
 await claimSeoAction(db,'owner','sync',now);
 await assert.rejects(claimSeoAction(db,'other','sync',now+1000),error=>error.status===429);
});
