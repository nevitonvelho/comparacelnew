import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('lib/admin-price-guard.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {sourceAccessBlocked,priceBudgetWait}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('Source blocks are distinguished from missing prices, network errors and internal limits',()=>{
  for(const value of ['O navegador recebeu HTTP 403.','A fonte recusou o acesso (HTTP 429).','A Amazon exigiu uma verificação de acesso.','captcha'])assert.equal(sourceAccessBlocked(value),true);
  for(const value of ['Preço não retornado','Outra atualização está em andamento.','Não foi possível acessar a fonte','HTTP 500'])assert.equal(sourceAccessBlocked(value),false);
});
test('Budget calculates lock, spacing and hourly waits without issuing requests',()=>{
  const now=10000000;
  assert.equal(priceBudgetWait({},now),0);
  assert.equal(priceBudgetWait({lockUntil:now+60000,lastAt:now-5000},now),60000);
  assert.equal(priceBudgetWait({lastAt:now-1000},now),3100);
  assert.equal(priceBudgetWait({count:500,windowAt:now-1000},now),3599000);
  assert.equal(priceBudgetWait({count:500,windowAt:now-3600000},now),0);
});
