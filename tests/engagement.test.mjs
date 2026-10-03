import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../lib/engagement-model.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {pageIdentity,shouldCountVisit,VISIT_WINDOW_MS,popularity}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('comparison counters use a canonical pair and reject invalid targets',()=>{
 assert.deepEqual(pageIdentity('comparison',['b','a']),pageIdentity('comparison',['a','b']));
 for(const [kind,ids] of [['product',[]],['product',['../a']],['comparison',['a','a']],['comparison',['a']],['profile',['a']]]) assert.equal(pageIdentity(kind,ids),null);
});
test('refreshes and visits before 30 minutes do not increase the counter',()=>{
 assert.equal(shouldCountVisit(undefined,100),true);
 assert.equal(shouldCountVisit(100,100),false);
 assert.equal(shouldCountVisit(100,100+VISIT_WINDOW_MS-1),false);
 assert.equal(shouldCountVisit(100,100+VISIT_WINDOW_MS),true);
});
test('thermometer follows the published weighting and boundaries',()=>{
 assert.equal(popularity({views:0,likes:0}).label,'Começando');
 assert.equal(popularity({views:24,likes:0}).level,1);
 assert.equal(popularity({views:25,likes:0}).level,2);
 assert.equal(popularity({views:0,likes:10}).level,3);
 assert.equal(popularity({views:299,likes:0}).level,3);
 assert.equal(popularity({views:300,likes:0}).level,4);
 assert.equal(popularity({views:1000,likes:0}).level,5);
});
