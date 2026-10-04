import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const model=url(compile(await readFile('lib/product-model.ts','utf8')));
const {comparisonRecommendations,cleanNoticeLedger,appendNotice,suggestionSpacing,suggestionLifetime}=await import(url(compile(await readFile('lib/product-recommendations.ts','utf8')).replace('"./product-model"',JSON.stringify(model))));
const day=86400000;
const product=(id,category,price,specs=[])=>({id,name:id,category,price,specs,brand:'Marca',offers:[],highlights:[],score:'0',imageUrl:null,label:''});
test('recommendations are immediate, compatible and exclude saved comparisons',()=>{
 const products=[product('favorite','celulares',1000),product('near','celulares',1100),product('far','celulares',3000),product('other','notebooks',1000)];
 const favorites=[{productIds:['favorite'],createdAt:day}];
 assert.ok(comparisonRecommendations(products,favorites,[],day).length>0);
 const first=comparisonRecommendations(products,favorites,[],2*day)[0];
 assert.equal(first.alternative.id,'near');assert.equal(first.href,'/comparar/favorite-vs-near');

 assert.equal(comparisonRecommendations(products,favorites,[{productIds:['near','favorite']}],2*day)[0].alternative.id,'far');
 assert.equal(comparisonRecommendations(products.filter(item=>item.category==='notebooks'),favorites,[],9*day).length,0);
 assert.equal(comparisonRecommendations(products,[],[],9*day).length,0);
});
test('missing prices are supported, similar specs win and notices remain bounded',()=>{
 const specs=[{slug:'ram'},{slug:'storage'}];
 const products=[product('favorite','celulares',null,specs),product('similar','celulares',null,specs),product('different','celulares',null,[])];
 assert.equal(comparisonRecommendations(products,[{productIds:['favorite'],createdAt:day}],[],2*day)[0].alternative.id,'similar');
 const many=Array.from({length:12},(_,i)=>product(`p${i}`,'celulares',1000));
 assert.ok(comparisonRecommendations(many,many.map(p=>({productIds:[p.id],createdAt:day})),[],2*day).length<=6);
});

test('one notice per ten minutes, six per day even after reading, and two-day expiry',()=>{
 const now=Date.now();const ledger=cleanNoticeLedger(null,now);
 assert.equal(appendNotice(ledger,'a',now),true);
 assert.equal(appendNotice(ledger,'b',now+1000),false);
 assert.equal(appendNotice(ledger,'b',now+suggestionSpacing),true);
 ledger.messages=[]; // Read notices are removed, but the budget is preserved.
 for(let i=2;i<6;i++)assert.equal(appendNotice(ledger,`p${i}`,now+i*suggestionSpacing),true);
 assert.equal(appendNotice(ledger,'extra',now+6*suggestionSpacing),false);
 assert.equal(ledger.count,6);
 const next=cleanNoticeLedger(ledger,now+86400000);
 assert.equal(next.count,0);assert.ok(next.messages.length>0);
 assert.equal(cleanNoticeLedger(ledger,now+suggestionLifetime+6*suggestionSpacing).messages.length,0);
 assert.equal(appendNotice(next,'tomorrow',now+86400000),true);
});
test('a visited product can provide comparison context without any favorite',()=>{
 const now=Date.now();const products=[product('visited','cafeteiras',100),product('similar','cafeteiras',110),product('other','notebooks',100)];
 assert.equal(comparisonRecommendations(products,[{productIds:['visited'],createdAt:now}],[],now)[0].alternative.id,'similar');
});
