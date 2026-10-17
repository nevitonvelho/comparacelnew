import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('lib/price-history.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {priceHistoryPoints}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('price history orders real dates, converts cents, preserves stores and drops invalid points',()=>{
 const result=priceHistoryPoints([{recorded_at:'2026-10-03T10:00:00Z',priceCents:25000,storeId:'a'},{recorded_at:'2026-10-01T10:00:00Z',price:100,store:2},{recorded_at:'bad',price:99},{recorded_at:'2026-10-01',priceCents:-10}]);
 assert.equal(result.length,2);assert.equal(result[0].price,100);assert.equal(result[0].storeId,'2');assert.equal(result[1].price,250);
});
const {unifiedPriceHistory,priceIntelligence}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('one daily minimum combines stores and does not fabricate unobserved days',()=>{
 const points=[{date:'2026-10-01T10:00:00Z',price:200,storeId:'a'},{date:'2026-10-01T11:00:00Z',price:90,storeId:'b'},{date:'2026-10-03T10:00:00Z',price:150,storeId:'a'}];
 assert.deepEqual(unifiedPriceHistory(points).map(point=>point.price),[90,150]);
 const result=priceIntelligence(points,Date.parse('2026-10-04'));
 assert.equal(result.minimum,90);assert.equal(result.maximum,200);assert.equal(result.recentMinimum,90);
 assert.equal(result.average30,null);assert.equal(result.discount,null);assert.equal(result.classification,'Sem classificação');
});
test('averages weight observed days equally, require a spread and reject future captures',()=>{
 const now=Date.parse('2026-10-17T12:00:00Z');
 const points=Array.from({length:8},(_,index)=>({date:new Date(now-index*2*86400000).toISOString(),price:100,storeId:'a'}));
 points.push({date:points[0].date,price:200,storeId:'b'},{date:new Date(now+86400000).toISOString(),price:1,storeId:'a'});
 const result=priceIntelligence(points,now);
 assert.equal(result.average30,100);assert.equal(result.average90,100);assert.equal(result.observedDays,8);assert.equal(result.minimum,100);
 assert.equal(priceIntelligence(points.map(point=>({...point,date:new Date(now).toISOString()})),now).average30,null);
 assert.equal(priceIntelligence(points,now+200*86400000).average180,null);
});
