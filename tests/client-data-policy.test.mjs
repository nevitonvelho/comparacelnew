import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const model=url(compile(await readFile('lib/admin-model.ts','utf8')));
const photo=url(compile(await readFile('lib/social-values.ts','utf8')));
const source=compile(await readFile('lib/client-data-policy.ts','utf8')).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./admin-model"',JSON.stringify(model)).replace('"./social-values"',JSON.stringify(photo));
const {executeClientData}=await import(url(source));
const denyDb=new Proxy({}, {get(){throw new Error('Database access before authorization');}});
const reference=path=>({type:'document',path});
test('browser data cannot access private server collections or impersonate another user',async()=>{
  for(const path of ['adminUserAccess/owner','adminExtensionKeys/owner','siteSettings/credentials','users/other/likedProducts/alpha']) {
    await assert.rejects(executeClientData(denyDb,{uid:'owner'},{action:'read',reference:reference(path)}),error=>error.status===403);
  }
  await assert.rejects(executeClientData(denyDb,{uid:'owner'},{action:'set',reference:reference('profiles/other'),data:{displayName:'Spoof',bio:''}}),error=>error.status===403);
  await assert.rejects(executeClientData(denyDb,null,{action:'set',reference:reference('profiles/owner'),data:{displayName:'Spoof',bio:''}}),error=>error.status===401);
});
test('public profile reads expose only the public profile fields',async()=>{
  const db={doc:()=>({get:async()=>({data:()=>({displayName:'Public',bio:'About',photoURL:null,privateEmail:'hidden@example.test'})})})};
  const result=await executeClientData(db,null,{action:'read',reference:reference('profiles/owner')});
  assert.deepEqual(result.documents[0].data,{displayName:'Public',bio:'About',photoURL:null});
});
test('public batches cannot be used to read private documents',async()=>{
  await assert.rejects(executeClientData(denyDb,null,{action:'readMany',references:[reference('reactionStats/product:alpha'),reference('adminUserAccess/owner')]}),error=>error.status===403);
});
test('unpublished social posts are not returned to public readers',async()=>{
  const db={doc:()=>({get:async()=>({data:()=>({status:'draft',opinion:'private'})})})};
  assert.equal((await executeClientData(db,null,{action:'read',reference:reference('socialPosts/post')})).documents[0].data,null);
});
test('library writes validate product status and comparison categories and ignore supplied ownership',async()=>{
  let saved;
  const db={doc:path=>({path}),runTransaction:async callback=>callback({getAll:async()=>[{data:()=>({isActive:true,categorySlug:'phone'})},{data:()=>({isActive:true,categorySlug:'phone'})}],set:(ref,data)=>{saved={ref,data};}})};
  await executeClientData(db,{uid:'owner'},{action:'set',reference:reference('users/owner/savedComparisons/alpha-vs-beta'),data:{productIds:['beta','alpha'],ownerUid:'attacker',createdAt:'forged'}});
  assert.deepEqual(saved.data.productIds,['alpha','beta']);
  assert.equal(saved.data.ownerUid,undefined);
  assert.equal(typeof saved.data.createdAt.toMillis,'function');
});
