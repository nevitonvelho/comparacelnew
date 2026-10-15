import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const values=url(compile(await readFile('lib/laravel-values.ts','utf8')));
const auth=url('export const getAuth=()=>({currentUser:{uid:"owner",getIdToken:async()=>"google-identity-token"}});');
let source=compile(await readFile('lib/laravel-client-data.ts','utf8')).replace('"firebase/auth"',JSON.stringify(auth)).replace('"./firebase/client"',JSON.stringify(url('export const getFirebaseApp=()=>({});'))).replace('"./laravel-values"',JSON.stringify(values));
const client=await import(url(source));
const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
test('public document reads are batched and never forward Google credentials or backend secrets',async()=>{
  let calls=0;
  globalThis.fetch=async(endpoint,options)=>{
    calls++;assert.equal(endpoint,'/api/data');assert.equal(options.headers.Authorization,undefined);
    const body=JSON.parse(options.body);assert.equal(body.action,'readMany');assert.equal(body.references.length,2);
    return Response.json({documents:body.references.map(reference=>({path:reference.path,data:{counts:{happy:2}}}))});
  };
  const [one,two]=await Promise.all([client.getDoc(client.doc(null,'reactionStats','product:alpha')),client.getDoc(client.doc(null,'reactionStats','product:beta'))]);
  assert.equal(calls,1);assert.equal(one.data().counts.happy,2);assert.equal(two.id,'product:beta');
});
test('private writes send only the Google identity to the same-origin API and notify observers after success',async()=>{
  let events=0;
  globalThis.window={dispatchEvent:()=>{events++;}};
  globalThis.fetch=async(endpoint,options)=>{
    assert.equal(endpoint,'/api/data');assert.equal(options.headers.Authorization,'Bearer google-identity-token');
    assert.equal(JSON.parse(options.body).reference.path,'users/owner/likedProducts/alpha');
    return Response.json({documents:[]});
  };
  await client.setDoc(client.doc(null,'users','owner','likedProducts','alpha'),{productId:'alpha'});
  assert.equal(events,1);
});
test.after(()=>{globalThis.fetch=originalFetch;if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;});
