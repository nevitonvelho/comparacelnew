import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const reactions=url(compile(await readFile('lib/reaction-model.ts','utf8')));
const source=compile(await readFile('lib/product-score.ts','utf8')).replace('"./reaction-model"',JSON.stringify(reactions));
const {productScore,medianPrice}=await import(url(source));
const empty={sad:0,happy:0,delighted:0};
const metrics={views:0,favorites:0,saved:0};
test('new products have a provisional middle score, missing prices are valid',()=>{
 const initial=productScore(metrics,empty,100,100);
 assert.equal(initial.provisional,true);
 assert(initial.value>=5&&initial.value<=7);
 assert(Number.isFinite(productScore(metrics,empty,null,100).value));
 assert.equal(medianPrice([10,null,0,20,30,40]),25);
});
test('higher interest and positive reactions help; negative reactions lower the index',()=>{
 const initial=productScore(metrics,empty,100,100).value;
 assert(productScore({views:1000,favorites:50,saved:50},empty,100,100).value>initial);
 assert(productScore(metrics,{sad:10,happy:0,delighted:0},100,100).value<initial);
 assert(productScore(metrics,{sad:0,happy:0,delighted:10},100,100).value>initial);
 assert(productScore(metrics,empty,50,100).value>productScore(metrics,empty,200,100).value);
});
test('score stays between 1 and 10 and repeated volume has capped influence',()=>{
 for(const counts of [empty,{sad:100000,happy:0,delighted:0},{sad:0,happy:0,delighted:100000}])for(const price of [null,1,1e9]){
  const result=productScore({views:1e9,favorites:1e9,saved:1e9},counts,price,100);
  assert(result.value>=1&&result.value<=10);
 }
 assert.equal(productScore({views:1000,favorites:50,saved:50},empty,100,100).value,productScore({views:100000,favorites:5000,saved:5000},empty,100,100).value);
});
