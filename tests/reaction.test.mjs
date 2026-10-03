import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../lib/reaction-model.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {reactionSummary,validReaction}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('small samples do not produce red or green seals',()=>{
 for(let sad=0;sad<10;sad++) assert.equal(reactionSummary({sad,happy:0,delighted:0}).status,'pending');
 assert.equal(reactionSummary({sad:0,happy:0,delighted:9}).status,'pending');
});
test('community seals reflect sufficient opinions with a smoothed average',()=>{
 assert.equal(reactionSummary({sad:10,happy:0,delighted:0}).status,'low');
 assert.equal(reactionSummary({sad:0,happy:10,delighted:0}).status,'high');
 assert.equal(reactionSummary({sad:5,happy:5,delighted:0}).status,'mixed');
 assert.equal(reactionSummary({sad:1,happy:0,delighted:10}).status,'high');
});
test('only the three reactions or withdrawal are accepted',()=>{
 for(const value of ['sad','happy','delighted',null]) assert.equal(validReaction(value),true);
 for(const value of ['dislike',5,undefined,{},'']) assert.equal(validReaction(value),false);
});
