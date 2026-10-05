import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const model=url(compile(await readFile('lib/admin-model.ts','utf8')));
let source=compile(await readFile('app/api/admin/categories/route.ts','utf8'));
const deps={
 'next/server':url('export const NextResponse={json:(body,options)=>({body,...options})};'),
 'next/cache':url('export const revalidatePath=()=>{};'),
 '@/lib/admin-api':url('export const adminHeaders={};export const requireAdministrator=async()=>({uid:"owner"});export const readAdminJson=async request=>request.body;export const adminFailure=error=>({status:error.status??500,body:{error:error.message}});'),
 '@/lib/admin-model':model,
 '@/lib/firebase/admin':url('export const getAdminDatabase=()=>globalThis.categoryTestDb;')
};
for(const [name,value] of Object.entries(deps))source=source.replaceAll(JSON.stringify(name),JSON.stringify(value));
const {POST}=await import(url(source));
test('category representative must be active, have an image and belong to the category',async()=>{
 let product={categorySlug:'celulares',isActive:true,imageUrl:'/phone.png'};
 const writes=[];
 globalThis.categoryTestDb={collection:kind=>({kind,doc:id=>({kind,id})}),doc:id=>({id}),runTransaction:async run=>run({
  get:async()=>({docs:[{id:'category',ref:{id:'category'},data:()=>({slug:'celulares'})}]}),
  getAll:async()=>[{exists:!!product,data:()=>product}],
  update:(_ref,data)=>writes.push(data),set:()=>{},create:()=>{}
 })};
 const body={homeLimit:12,categories:[{id:'celulares',showOnHome:true,order:0,representativeProductId:'phone'}]};
 assert.equal((await POST({body})).body.saved,true);assert.equal(writes[0].representativeProductId,'phone');
 for(const bad of [null,{...product,categorySlug:'televisoes'},{...product,isActive:false},{...product,imageUrl:''}]){
  const saved=product;product=bad;
  assert.equal((await POST({body})).status,400);product=saved;
 }
 assert.equal(writes.length,1);
 assert.equal((await POST({body:{...body,categories:[{...body.categories[0],representativeProductId:''}]}})).body.saved,true);
 assert.equal(writes[1].representativeProductId,'');
});
