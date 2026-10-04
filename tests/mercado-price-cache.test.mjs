import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('lib/mercado-price-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {MERCADO_PRICE_CACHE_MS,mercadoPriceCacheKey,validMercadoPriceCache,readMercadoPriceCache,writeMercadoPriceCache}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('Mercado cache expires exactly after 24 hours and rejects invalid values',()=>{
  const now=100000000;
  const value={price:2089.90,condition:'pix',checkedAt:now};
  assert.equal(validMercadoPriceCache(value,now+MERCADO_PRICE_CACHE_MS-1).price,2089.90);
  assert.equal(validMercadoPriceCache(value,now+MERCADO_PRICE_CACHE_MS),null);
  for(const changed of [{price:0},{price:NaN},{checkedAt:now+1},{condition:'unknown'}])assert.equal(validMercadoPriceCache({...value,...changed},now),null);
});
test('Cache separates exact affiliate links, product identifiers and consultation sources',()=>{
  const entry={buyUrl:'https://meli.la/test',externalId:'MLB12345',kind:'catalog'};
  const key=mercadoPriceCacheKey(entry,'browser');
  for(const changed of [{buyUrl:'https://meli.la/other'},{externalId:'MLB54321'},{kind:'item'}])assert.notEqual(mercadoPriceCacheKey({...entry,...changed},'browser'),key);
  assert.notEqual(mercadoPriceCacheKey(entry,'api'),key);
});
test('Cache is persisted and reuses the original consultation time',async()=>{
  const docs=new Map();
  const db={doc:path=>({get:async()=>({data:()=>docs.get(path)}),set:async value=>docs.set(path,value)})};
  const entry={buyUrl:'https://meli.la/test',externalId:'MLB12345',kind:'catalog'};
  assert.equal(await readMercadoPriceCache(db,entry,'browser'),null);
  const checkedAt=Date.now()-1000;
  await writeMercadoPriceCache(db,entry,'browser',2089.90,'pix',checkedAt);
  const cached=await readMercadoPriceCache(db,entry,'browser');
  assert.equal(cached.checkedAt,checkedAt);
  assert.equal(cached.expiresAt,checkedAt+MERCADO_PRICE_CACHE_MS);
});
