import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl=dataUrl(compile(await readFile('lib/reaction-model.ts','utf8')));
const storeSource=compile(await readFile('lib/reaction-store.ts','utf8')).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./reaction-model"',JSON.stringify(modelUrl));
const {recordReaction}=await import(dataUrl(storeSource));
export async function testReactions(env) {
 const app=initializeApp({projectId:'demo-comparacel'},'reactions-test');
 try {
  const db=getFirestore(app);
  const a={kind:'product',ids:['a'],key:'product:a'};
  const b={kind:'product',ids:['b'],key:'product:b'};
  const now=Date.now();
  await Promise.all(Array.from({length:4},()=>recordReaction(db,'voter',a,'sad',now)));
  assert.deepEqual((await db.doc('reactionStats/product:a').get()).data().counts,{sad:1,happy:0,delighted:0});
  await assert.rejects(recordReaction(db,'voter',b,'sad',now+1000),error=>error.status===429);
  await assert.rejects(recordReaction(db,'voter',a,'delighted',now+10000),error=>error.status===429);
  await recordReaction(db,'voter',a,'delighted',now+60000);
  assert.deepEqual((await db.doc('reactionStats/product:a').get()).data().counts,{sad:0,happy:0,delighted:1});
  await recordReaction(db,'voter',a,null,now+61000);
  assert.equal((await db.doc('reactionStats/product:a').get()).data().total,0);
  await assert.rejects(recordReaction(db,'voter',a,'sad',now+62000),error=>error.status===429);
  const subjects=await Promise.all(Array.from({length:21},async(_,i)=>{
   const id=`quota-${i}`;await db.doc(`products/${id}`).set({isActive:true,categorySlug:'celulares'});
   return {kind:'product',ids:[id],key:`product:${id}`};
  }));
  for(let i=0;i<20;i++)await recordReaction(db,'quota-user',subjects[i],'sad',now+i*60001);
  await assert.rejects(recordReaction(db,'quota-user',subjects[20],'sad',now+20*60001),error=>error.status===429);
  await recordReaction(db,'quota-user',subjects[0],null,now+21*60001);
  await assert.rejects(recordReaction(db,'quota-user',subjects[20],'happy',now+22*60001),error=>error.status===429);
  await recordReaction(db,'quota-user',subjects[20],'happy',now+24*60*60*1000);
  await assert.rejects(recordReaction(db,'voter',{kind:'comparison',ids:['a','laptop'],key:'comparison:a-vs-laptop'},'sad',now),error=>error.status===404);
  const pair={kind:'comparison',ids:['a','b'],key:'comparison:a-vs-b'};
  await recordReaction(db,'pair-voter',pair,'happy',now);
  assert.equal((await db.doc('reactionStats/comparison:a-vs-b').get()).data().counts.happy,1);
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(),'reactionStats/product:a')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('voter').firestore(),'users/voter/reactions/product:a')));
  await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(),'users/voter/reactions/product:a')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users/voter/reactions/product:a')));
  await assertFails(setDoc(doc(env.authenticatedContext('voter').firestore(),'users/voter/reactions/product:a'),{reaction:'delighted'}));
  await assertFails(setDoc(doc(env.authenticatedContext('voter').firestore(),'reactionStats/product:a'),{total:9999}));
  await assertFails(getDoc(doc(env.authenticatedContext('voter').firestore(),'reactionBudgets/voter')));
  const {readProductMetrics}=await import(dataUrl(compile(await readFile('lib/product-metrics-store.ts','utf8'))));
  await db.doc('users/metric-user/savedComparisons/a-vs-b').set({productIds:['a','b']});
  await db.doc('users/metric-user/savedComparisons/a-vs-quota-0').set({productIds:['a','quota-0']});
  await db.doc('users/metric-other/savedComparisons/a-vs-b').set({productIds:['a','b']});
  assert.equal((await readProductMetrics(db,'a')).saved,2);
  assert.equal((await readProductMetrics(db,'a')).favorites,1);
  console.log('Métricas: múltiplos salvamentos da mesma pessoa contam uma vez por produto.');
  console.log('Reações: voto único, concorrência, troca, retirada, bloqueio de spam, limite em 24h, pares e privacidade verificados.');
 }finally{await deleteApp(app);}
}
