import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = `data:text/javascript;base64,${Buffer.from(compile(await readFile(new URL('../lib/product-model.ts', import.meta.url), 'utf8'))).toString('base64')}`;
const source = compile(await readFile(new URL('../lib/seo.ts', import.meta.url), 'utf8')).replace('"./product-model"', JSON.stringify(model));
const { productSchema, serializeJsonLd, pageMetadata, absoluteUrl, productModifiedAt } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const product = { id: 'teste', name: 'Produto teste', brand: 'Marca', category: 'celulares', imageUrl: null, offers: [] };
test('structured offers only use available offers with known positive prices and never fake ratings', () => {
  assert.equal(productSchema(product).offers, undefined);
  const result = productSchema({ ...product, offers: [
    { available: true, price: 100, url: 'https://loja.example/um', store: 'Uma' },
    { available: true, price: 200, url: 'https://loja.example/dois', store: 'Duas' },
    { available: false, price: 1, url: 'https://loja.example/tres' },
    { available: true, price: null, url: 'https://loja.example/quatro' },
  ] });
  assert.equal(result.offers.offerCount, 2);
  assert.equal(result.offers.lowPrice, 100);
  assert.equal(result.offers.highPrice, 200);
  assert.equal(result.aggregateRating, undefined);
  assert.equal(result.offers.offers[0].availability, undefined);
});
test('JSON-LD cannot terminate its script and metadata shares one absolute canonical URL', () => {
  const value = { name: '</script><script>alert(1)</script>' };
  const serialized = serializeJsonLd(value);
  assert(!serialized.includes('<'));
  assert.deepEqual(JSON.parse(serialized), value);
  const metadata = pageMetadata('Título', 'Descrição', '/produto/teste');
  assert.equal(metadata.alternates.canonical, absoluteUrl('/produto/teste'));
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.equal(metadata.twitter.card, 'summary_large_image');
});

test('sitemap update date uses actual product and price dates, ignoring invalid or future timestamps',()=>{
  const now=Date.parse('2026-10-04T12:00:00Z');
  assert.equal(productModifiedAt({...product,updatedAt:'2026-10-01',offers:[{priceUpdatedAt:'2026-10-03'},{priceUpdatedAt:'2099-01-01'},{priceUpdatedAt:'bad'}]},now),'2026-10-03T00:00:00.000Z');
  assert.equal(productModifiedAt(product,now),undefined);
});
