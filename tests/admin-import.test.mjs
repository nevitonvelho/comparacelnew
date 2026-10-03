import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const adminUrl = url(compile(await readFile('lib/admin-model.ts', 'utf8')));
const modelUrl = url(compile(await readFile('lib/admin-import-model.ts', 'utf8')).replace('"./admin-model"', JSON.stringify(adminUrl)));
const { parseImportLine, parseImportText, inferImportSpec } = await import(modelUrl);
const parserUrl = url(compile(await readFile('lib/admin-import-parser.ts', 'utf8')).replace('"cheerio"', JSON.stringify(import.meta.resolve('cheerio'))).replace('"./admin-model"', JSON.stringify(adminUrl)).replace('"./admin-import-model"', JSON.stringify(modelUrl)));
const { parseAmazonProduct, parseMercadoProduct } = await import(parserUrl);
const fetchUrl = url(compile(await readFile('lib/admin-import-fetch.ts', 'utf8')).replace('"./admin-model"', JSON.stringify(adminUrl)));
const { allowedImportFetchUrl, fetchImportResource } = await import(fetchUrl);
const storeUrl = url(compile(await readFile('lib/admin-import-store.ts', 'utf8')).replace('"./admin-model"', JSON.stringify(adminUrl)).replace('"./admin-store"', JSON.stringify(url('export function adminProductFromData(){};export function createAdminReference(){};export function saveAdminProduct(){};'))));
const { mergeImportedProduct } = await import(storeUrl);
test('import lists preserve affiliate links, remove duplicates and reject arbitrary hosts', () => {
  const line = 'https://www.amazon.com.br/dp/B012345678?tag=owner-20';
  assert.deepEqual(parseImportText(`\uFEFF# comentário\n${line}\n\n${line} # repetido`), [line]);
  assert.equal(parseImportLine(line, 'amazon').buyUrl, line);
  assert.equal(parseImportLine('https://meli.la/abc https://www.mercadolivre.com.br/p/MLB12345678', 'mercadolivre').externalId, 'MLB12345678');
  for (const raw of ['https://localhost/dp/B012345678', 'https://amazon.com.br.evil.test/dp/B012345678', 'https://user@amazon.com.br/dp/B012345678', 'https://amazon.com.br:8443/dp/B012345678', 'http://amazon.com.br/dp/B012345678']) assert.throws(() => parseImportLine(raw, 'amazon'));
  assert.throws(() => parseImportLine('https://meli.la/abc', 'mercadolivre'));
  assert.throws(() => parseImportText(Array.from({length:201}, (_, index) => `https://amzn.to/${index}`).join('\n')));
});
test('parsers extract real product data without inventing prices or comparative advantages', () => {
  const entry = parseImportLine('https://www.amazon.com.br/dp/B012345678?tag=owner', 'amazon');
  const data = parseAmazonProduct(`<span id="productTitle">Cafeteira &amp; teste</span><a id="bylineInfo">Marca: TRES</a><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">R$ 1.299,90</span></span></div><table id="productDetails_techSpec_section_1"><tr><th>Potência</th><td>1200 W</td></tr><tr><th>Marca</th><td>TRES</td></tr></table><img id="landingImage" src="https://m.media-amazon.com/test.jpg">`, entry);
  assert.equal(data.name, 'Cafeteira & teste'); assert.equal(data.brand, 'TRES'); assert.equal(data.price, 1299.9); assert.equal(data.buyUrl, entry.buyUrl);
  assert.deepEqual(data.specs[0], {slug:'potencia',name:'Potência',group:'Especificações',type:'number',value:'1200',unit:'W',higherIsBetter:null,order:0});
  assert.equal(inferImportSpec('Inverter', 'Sim').value, 'true');
  assert.equal(inferImportSpec('Resolução', '1080 x 2340').type, 'text');
  assert.throws(() => parseAmazonProduct('<form id="captchacharacters"></form>', entry));
  const ml = parseMercadoProduct({id:'MLB12345678',name:'Produto ML',attributes:[{id:'BRAND',value_name:'Teste'},{name:'Peso',value_name:'1,2 kg'}]}, parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678', 'mercadolivre'));
  assert.equal(ml.price, null); assert.equal(ml.brand, 'Teste'); assert.equal(ml.specs[0].value,'1.2');
  assert.throws(() => parseMercadoProduct({id:'MLB99',name:'Errado'}, {externalId:'MLB12345678'}));
});
test('import updates preserve manual edits, publication, images, offers and editorial scores', () => {
  const spec = inferImportSpec('Potência', '1200 W');
  const collected = {name:'Nome remoto',brand:'Remota',description:'Descrição remota',price:null,specs:[spec],externalId:'B012345678',buyUrl:'https://amzn.to/abc'};
  const existing = {id:'ficha-original',revision:3,name:'Nome manual',description:'Descrição manual',brandId:'manual',category:'cafeteiras',imageUrl:'existing',isActive:true,overallScore:8,metaTitle:'SEO manual',metaDescription:'Desc SEO',specs:[{...spec,value:'1000',higherIsBetter:true}],offers:[{id:'oferta',storeId:'amazon',price:99,url:'old',available:true},{id:'outra',storeId:'outra',price:110,url:'other',available:true}],highlights:[{kind:'pro',text:'Manual'}]};
  const merged = mergeImportedProduct(collected, existing, 'celulares','remota','amazon','new-image');
  assert.equal(merged.id,'ficha-original');assert.equal(merged.category,'cafeteiras');assert.equal(merged.name,'Nome manual');assert.equal(merged.imageUrl,'existing');assert.equal(merged.isActive,true);assert.equal(merged.specs[0].value,'1000');assert.equal(merged.specs[0].higherIsBetter,true);assert.equal(merged.offers.find(offer=>offer.storeId==='amazon').price,99);assert.equal(merged.offers.length,2);assert.equal(merged.overallScore,8);
  assert.equal(mergeImportedProduct(collected,null,'cafeteiras','marca','amazon','').isActive,false);
});
test('network fetch blocks off-domain redirects and excessive response bodies', async () => {
  for (const address of ['https://127.0.0.1/a','https://m.media-amazon.com.evil.test/a','https://m.media-amazon.com:444/a','https://user@http2.mlstatic.com/a']) assert.throws(() => allowedImportFetchUrl(address,'image'));
  assert.equal(allowedImportFetchUrl('http://http2.mlstatic.com/image.jpg','image').protocol,'https:');
  const original = globalThis.fetch;
  try {
    let calls=0;
    globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
    await assert.rejects(fetchImportResource('https://amzn.to/abc','amazon'));assert.equal(calls,1);
    globalThis.fetch=async()=>new Response(new Uint8Array(3*1024*1024+1));
    await assert.rejects(fetchImportResource('https://www.amazon.com.br/dp/B012345678','amazon'));
  } finally {globalThis.fetch=original;}
});
