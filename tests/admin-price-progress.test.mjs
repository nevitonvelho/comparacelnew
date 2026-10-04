import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await readFile('lib/admin-price-progress.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { readPriceRefreshJob } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const job = { version: 1, queue: [{ id: 'one', name: 'One', offerId: 'a' }, { id: 'two', name: 'Two', offerId: 'b' }], next: 1, changed: 1, checked: 0, skipped: 0, failed: 0, errors: [{ productId: 'one', message: 'Aviso' }], updatedAt: 1234 };
test('saved price refresh preserves original queue, checkpoint, counts and edit targets', () => {
  const restored = readPriceRefreshJob(JSON.stringify(job));
  assert.deepEqual(restored, job);
  assert.equal(restored.queue[restored.next].id, 'two');
  assert.equal(readPriceRefreshJob(JSON.stringify({ ...job, next: 2 })).next, 2);
});
test('corrupt or incompatible checkpoints fail safely', () => {
  for (const value of [null, '{', 'null', JSON.stringify({ ...job, version: 2 }), JSON.stringify({ ...job, next: 3 }), JSON.stringify({ ...job, next: -1 }), JSON.stringify({ ...job, changed: 0.5 }), JSON.stringify({ ...job, queue: [{}] }), JSON.stringify({ ...job, errors: ['oops'] })]) assert.equal(readPriceRefreshJob(value), null);
});
