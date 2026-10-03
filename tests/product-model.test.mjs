import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../lib/product-model.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { selectProduct, comparisonRows, comparisonSection } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const spec = (number, higherIsBetter = true) => ({ key: 'Bateria:capacidade', name: 'Capacidade', group: 'Bateria', order: 0, display: String(number), number, higherIsBetter });
const a = { id: 'a', category: 'celulares', specs: [spec(5000)] };
const b = { id: 'b', category: 'celulares', specs: [spec(6000)] };
const c = { id: 'c', category: 'celulares', specs: [] };
const laptop = { id: 'laptop', category: 'notebooks', specs: [] };
test('third selection and incompatible categories preserve selected products', () => {
 assert.deepEqual(selectProduct(['a', 'b'], c, [a,b,c]).ids, ['a','b']);
 assert(selectProduct(['a', 'b'], c, [a,b,c]).error);
 assert.deepEqual(selectProduct(['a'], laptop, [a,laptop]).ids, ['a']);
 assert.deepEqual(selectProduct(['a','b'], a, [a,b]).ids, ['b']);
});
test('comparison preserves missing fields and respects numeric criteria', () => {
 assert.equal(comparisonRows(a,b)[0].winner, 'b');
 assert.equal(comparisonRows(a,c)[0].b, '—');
 assert.equal(comparisonRows(a,c)[0].winner, null);
 assert.equal(comparisonRows(a,{...b,specs:[spec(6000,null)]})[0].winner, null);
 assert.equal(comparisonRows({...a,specs:[spec(5000,false)]},{...b,specs:[spec(6000,false)]})[0].winner, 'a');
});

test('generic specs become useful sections while authored groups remain intact', () => {
 assert.equal(comparisonSection({group:'Especificações',slug:'capacidade-da-bateria'}),'Bateria e energia');
 assert.equal(comparisonSection({group:'Especificações',slug:'memoria-ram-instalada'}),'Desempenho e armazenamento');
 assert.equal(comparisonSection({group:'Especificações',slug:'resolucao-do-sensor-fotografico-traseiro-da-camara'}),'Câmeras');
 assert.equal(comparisonSection({group:'Refrigeração',slug:'temperatura'}),'Refrigeração');
 assert.equal(comparisonSection({group:'Especificações',slug:'fabricante'}),'Outras especificações');
});
