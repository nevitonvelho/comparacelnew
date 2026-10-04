import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('lib/price-history.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {priceHistoryPoints}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('price history orders real dates, converts cents, preserves stores and drops invalid points',()=>{
 const result=priceHistoryPoints([{recorded_at:'2026-10-03T10:00:00Z',priceCents:25000,storeId:'a'},{recorded_at:'2026-10-01T10:00:00Z',price:100,store:2},{recorded_at:'bad',price:99},{recorded_at:'2026-10-01',priceCents:-10}]);
 assert.equal(result.length,2);assert.equal(result[0].price,100);assert.equal(result[0].storeId,'2');assert.equal(result[1].price,250);
});
