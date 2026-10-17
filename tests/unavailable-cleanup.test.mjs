import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compiled=ts.transpileModule(await readFile('lib/admin-unavailable-cleanup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore')));
const {reconcileUnavailableOffers}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now=Date.UTC(2026,9,17);
const good={id:'good',url:'https://meli.la/good',priceCents:10000,is_available:true};
const bad={id:'bad',url:'https://meli.la/bad',priceCents:null,is_available:true};
const product=offers=>({offers,isActive:true,is_active:true,bestPriceCents:10000});
test('one unpriced offer among five is disabled while four monetizable links stay active',()=>{
  const result=reconcileUnavailableOffers(product([bad,...Array.from({length:4},(_,i)=>({...good,id:`good-${i}`}))]),now);
  assert.equal(result.isActive,true);
  assert.equal(result.offers.length,5);
  assert.equal(result.offers[0].is_available,false);
  assert.equal(result.offers[0].unavailableSince.toMillis(),now);
  assert.equal(result.offers.filter(offer=>offer.is_available).length,4);
  assert.equal(reconcileUnavailableOffers({...result},now+86400000).changed,false);
});
test('a single unpriced link disables the product for review, including empty products',()=>{
  for(const offers of [[bad],[],[{...good,url:''}],[{...good,priceCents:0}]]) {
    const result=reconcileUnavailableOffers(product(offers),now);
    assert.equal(result.isActive,false);
    assert.equal(result.is_active,false);
    assert.equal(result.bestPriceCents,null);
  }
});
test('after 60 days only expired links are removed; the product remains for review',()=>{
  const expired={...bad,is_available:false,unavailableSince:now-60*86400000};
  const result=reconcileUnavailableOffers(product([expired,good]),now);
  assert.equal(result.removed,1);
  assert.deepEqual(result.offers,[good]);
  assert.equal(result.isActive,true);
  const empty=reconcileUnavailableOffers(product([expired]),now);
  assert.equal(empty.isActive,false);
  assert.deepEqual(empty.offers,[]);
  const recovered=reconcileUnavailableOffers(product([{...good,unavailableSince:expired.unavailableSince}]),now);
  assert.equal(recovered.removed,0);
});
