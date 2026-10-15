import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let source = ts.transpileModule(await readFile('lib/server-catalog.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dependencies = {
  'server-only': url(''),
  'react': url('export const cache = fn => fn;'),
  'firebase-admin/firestore': url('export const FieldPath = {};'),
  'next/cache': url(`
    export const unstable_cache = fn => fn;
    export const revalidateTag = (...args) => globalThis.publicRevalidationCalls.push(['tag', ...args]);
    export const revalidatePath = (...args) => globalThis.publicRevalidationCalls.push(['path', ...args]);
  `),
  './public-cache': url('export const PUBLIC_CATALOG_TAG="public-catalog"; export const publicCacheOptions={revalidate:1800,tags:[PUBLIC_CATALOG_TAG]};'),
  './firebase/admin': url('export const getAdminDatabase = () => { throw new Error("Revalidation must not read Firestore"); };'),
  './product-data': url('export const productFromData = () => {}; export const PUBLIC_PRODUCT_FIELDS=[];'),
  './product-model': url('export const comparisonSlug = () => {};'),
};
for (const [name, replacement] of Object.entries(dependencies)) {
  source = source.replaceAll(JSON.stringify(name), JSON.stringify(replacement));
}
const { invalidateServerCatalog } = await import(url(source));
test('catalog changes expire data, public pages and sitemap without querying Firestore', () => {
  globalThis.publicRevalidationCalls = [];
  invalidateServerCatalog();
  assert.deepEqual(globalThis.publicRevalidationCalls, [
    ['tag', 'public-catalog', { expire: 0 }],
    ['path', '/', 'layout'],
    ['path', '/sitemap.xml'],
  ]);
  delete globalThis.publicRevalidationCalls;
});
