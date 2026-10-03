import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const {outputText}=ts.transpileModule(await readFile('lib/comparison-activity.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {activityDays}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('ranking keeps today and six preceding days, dropping stale and future counts',()=>{
 const now=Date.parse('2026-10-03T15:00:00Z');
 assert.deepEqual(activityDays(now,{'2026-09-26':20,'2026-09-27':4,'2026-10-03':2,'2026-10-04':8},true),{'2026-09-27':4,'2026-10-03':3});
});
