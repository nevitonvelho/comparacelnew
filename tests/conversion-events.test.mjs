import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../lib/conversion-events.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { conversionPayload, pageType } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('analytics allows product and offer fields, excludes identities, queries and URLs', () => {
  const payload = conversionPayload('affiliate_click', { productId: 'phone', productName: 'Phone', merchant: 'Amazon', buttonPosition: 'product_card', offerId: 'offer-1', email: 'private@example.test', url: 'https://example.test/?tag=partner', search: 'private search' }, '/produto/phone');
  assert.deepEqual(payload, { event: 'affiliate_click', product_id: 'phone', product_name: 'Phone', merchant: 'Amazon', page_type: 'product', button_position: 'product_card', offer_id: 'offer-1', comparison_id: null });
});
test('missing parameters clear prior data layer values and page types distinguish funnels', () => {
  const payload = conversionPayload('comparison_view', { comparisonId: 'a-vs-b' }, '/comparar/a-vs-b');
  assert.equal(payload.product_id, null);
  assert.equal(payload.offer_id, null);
  assert.equal(payload.comparison_id, 'a-vs-b');
  for (const [path, expected] of [['/', 'home'], ['/catalogo', 'catalog'], ['/notebooks', 'category'], ['/marca/apple', 'brand'], ['/comparar', 'comparison']]) assert.equal(pageType(path), expected);
});

test('search context is identified without capturing the search text', () => {
  const payload = conversionPayload('affiliate_click', { pageType: 'search', search: 'private search' }, '/notebooks');
  assert.equal(payload.page_type, 'search');
  assert.equal(Object.hasOwn(payload, 'search'), false);
  assert.equal(conversionPayload('affiliate_click', { pageType: 'arbitrary user text' }, '/notebooks').page_type, 'category');
});
