import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../lib/product-offers.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { purchaseOffers, lowestOfferPrice, offerCta, hasActiveOffer } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const offer = (id, price, available = true, url = `https://amzn.to/${id}?tag=partner`) => ({ id, price, available, url, store: 'Amazon' });
test('public eligibility requires an available link with a confirmed positive price', () => {
  assert.equal(hasActiveOffer({ offers: [] }), false);
  for (const candidate of [offer('inactive', 100, false), offer('missing', 100, true, null), offer('empty', 100, true, ''), offer('spaces', 100, true, '   '), offer('unknown', null), offer('zero', 0), offer('negative', -1), offer('invalid', NaN)]) {
    assert.equal(hasActiveOffer({ offers: [candidate] }), false);
    assert.deepEqual(purchaseOffers({ offers: [candidate] }), []);
  }
  assert.equal(hasActiveOffer({ offers: [offer('inactive', 100, false), offer('active', null)] }), false);
  assert.equal(hasActiveOffer({offers:[offer('priced', 100)]}), true);
});
test('purchase offers preserve affiliate URLs, exclude unavailable links and do not mutate catalog order', () => {
  const offers = [offer('unknown', null), offer('high', 300), offer('sold-out', 10, false), offer('no-link', 5, true, null), offer('low', 100)];
  const sorted = purchaseOffers({ offers });
  assert.deepEqual(sorted.map(item => item.id), ['low', 'high']);
  assert.equal(sorted[0].url, 'https://amzn.to/low?tag=partner');
  assert.equal(offers[0].id, 'unknown');
  assert.equal(lowestOfferPrice(sorted), 100);
});
test('unknown prices do not become zero and tied offers keep their identity', () => {
  assert.equal(lowestOfferPrice([]), null);
  assert.equal(lowestOfferPrice([offer('unknown', null)]), null);
  assert.equal(lowestOfferPrice([offer('free', 0)]), 0);
  assert.deepEqual(purchaseOffers({ offers: [offer('a', 50), offer('b', 50)] }).map(item => item.id), ['a', 'b']);
});
test('CTAs identify the merchant without inferring a promotion', () => {
  assert.equal(offerCta('Shopee'), 'Ver oferta na Shopee');
  assert.equal(offerCta('Mercado Livre'), 'Ver oferta no Mercado Livre');
  assert.equal(offerCta('Amazon.com.br'), 'Conferir preço na Amazon');
  assert.equal(offerCta('Loja local'), 'Ver oferta em Loja local');
});
