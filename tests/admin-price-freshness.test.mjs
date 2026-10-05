import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('lib/admin-price-freshness.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {offerPriceFreshness,productPriceFreshness,priceAgeLabel,offerProductPage}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const now=Date.parse('2026-10-04T21:00:00Z');
const offer={id:'amazon',storeId:'amazon',price:100,url:'https://amzn.to/example',available:true,priceUpdatedAt:'2026-10-04T12:00:00Z'};
test('price priority uses each offer check date instead of the product edit date',()=>{
  assert.equal(offerPriceFreshness(offer,7,now).state,'fresh');
  const old={...offer,storeId:'mercado-livre',priceUpdatedAt:new Date(now-8*86400000).toISOString()};
  const product={updatedAt:new Date(now).toISOString(),offers:[offer,old]};
  assert.equal(productPriceFreshness(product,7,now).state,'due');
  assert.equal(productPriceFreshness(product,7,now).oldest,Date.parse(old.priceUpdatedAt));
  assert.equal(productPriceFreshness({...product,offers:[offer]},7,now).state,'fresh');
});
test('review interval honors exact cutoff, missing prices, unknown dates and multiple stores',()=>{
  assert.equal(offerPriceFreshness({...offer,priceUpdatedAt:new Date(now-7*86400000).toISOString()},7,now).state,'due');
  assert.equal(offerPriceFreshness({...offer,priceUpdatedAt:new Date(now-4*86400000).toISOString()},7,now).state,'attention');
  assert.equal(offerPriceFreshness({...offer,priceUpdatedAt:new Date(now-4*86400000).toISOString()},3,now).state,'due');
  assert.equal(offerPriceFreshness({...offer,price:null},7,now).state,'due');
  for(const date of [undefined,'invalid',new Date(now+120000).toISOString()])assert.equal(offerPriceFreshness({...offer,priceUpdatedAt:date},7,now).state,'never');
  assert.equal(productPriceFreshness({offers:[offer,{...offer,storeId:'other',priceUpdatedAt:undefined}]},7,now).state,'never');
  assert.equal(productPriceFreshness({offers:[]},7,now).state,'no-offers');
  assert.equal(priceAgeLabel(0),'Conferido hoje');assert.equal(priceAgeLabel(1),'Há 1 dia');assert.equal(priceAgeLabel(9),'Há 9 dias');
});
test('extension shortcuts open source pages for Amazon, Mercado catalog and advertisements',()=>{
  assert.equal(offerProductPage({...offer,externalId:'B0B8KWNK12'},'Amazon'),'https://www.amazon.com.br/dp/B0B8KWNK12');
  assert.equal(offerProductPage({...offer,externalId:'MLB19617679'},'Mercado Livre'),'https://www.mercadolivre.com.br/p/MLB19617679');
  assert.equal(offerProductPage({...offer,externalId:'item-MLB5210551637'},'Mercado Livre'),'https://produto.mercadolivre.com.br/MLB-5210551637');
  assert.equal(offerProductPage(offer,'Amazon'),offer.url);
  assert.equal(offerProductPage({...offer,url:'javascript:alert(1)'},'Outra'),'');
});

test('unavailable offers are checked without needing a price and keep their review interval',()=>{
 const unavailable={...offer,price:null,available:false};
 assert.equal(offerPriceFreshness(unavailable,7,now).state,'fresh');
 assert.equal(offerPriceFreshness({...unavailable,priceUpdatedAt:undefined},7,now).state,'unavailable');
 assert.equal(offerPriceFreshness({...unavailable,priceUpdatedAt:new Date(now-8*86400000).toISOString()},7,now).state,'due');
 assert.equal(productPriceFreshness({offers:[unavailable,{...offer,storeId:'other',priceUpdatedAt:undefined}]},7,now).state,'never');
});
