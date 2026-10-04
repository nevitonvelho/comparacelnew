import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const adminUrl = url(compile(await readFile('lib/admin-model.ts', 'utf8')));
const modelUrl = url(compile(await readFile('lib/admin-import-model.ts', 'utf8')).replace('"./admin-model"', JSON.stringify(adminUrl)));
const { buildImportLine, parseImportLine, parseImportText, inferImportSpec } = await import(modelUrl);
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
  assert.equal(parseImportLine('https://meli.la/abc', 'mercadolivre').externalId, '');
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
  const mlEntry = parseImportLine('https://meli.la/afiliado https://www.mercadolivre.com.br/p/MLB12345678', 'mercadolivre');
  const ml = parseMercadoProduct(`<h1 class="ui-pdp-title">Produto ML</h1><div class="ui-pdp-price__second-line"><span class="andes-money-amount"><span class="andes-money-amount__fraction">1.299</span><span class="andes-money-amount__cents">90</span></span></div><table class="ui-pdp-specs__table"><tr><th>Marca</th><td>Teste</td></tr><tr><th>Peso</th><td>1,2 kg</td></tr></table>`, mlEntry);
  assert.equal(ml.price, 1299.9); assert.equal(ml.brand, 'Teste'); assert.equal(ml.specs.find(spec=>spec.slug==='peso').value,'1.2');
  assert.equal(ml.buyUrl, 'https://meli.la/afiliado');
  assert.throws(() => parseMercadoProduct('<title>Verifique o acesso</title>', mlEntry));
  assert.throws(() => parseMercadoProduct('<h1 class="ui-pdp-title">Produto</h1><form action="/captcha"></form>', mlEntry));
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

const resolverUrl = url(compile(await readFile('lib/admin-import-resolver.ts','utf8')).replace('"cheerio"', JSON.stringify(import.meta.resolve('cheerio'))).replace('"./admin-model"', JSON.stringify(adminUrl)).replace('"./admin-import-model"', JSON.stringify(modelUrl)).replace('"./admin-import-fetch"', JSON.stringify(fetchUrl)));
const {mercadoEntryFromPage,resolveMercadoEntry} = await import(resolverUrl);
test('short Mercado Livre links resolve safely and preserve affiliate tracking', async () => {
  const entry = parseImportLine('https://meli.la/31EQLJ3','mercadolivre');
  assert.equal(mercadoEntryFromPage(entry,'https://www.mercadolivre.com.br/p/MLB12345678','').externalId,'MLB12345678');
  const canonical = mercadoEntryFromPage(entry,'https://www.mercadolivre.com.br/product','<link rel="canonical" href="https://www.mercadolivre.com.br/p/MLB12345678">');
  assert.equal(canonical.buyUrl,entry.buyUrl);
  assert.throws(()=>mercadoEntryFromPage(entry,'https://www.mercadolivre.com.br/perfil','<a href="/p/MLB12345678">Unrelated product</a>'));
  assert.throws(()=>mercadoEntryFromPage(entry,'https://www.mercadolivre.com.br/product','<link rel="canonical" href="https://evil.example/p/MLB12345678">'));
  const original = globalThis.fetch;
  try {
    let calls=0;globalThis.fetch=async()=>++calls===1 ? new Response(null,{status:302,headers:{location:'https://www.mercadolivre.com.br/p/MLB12345678'}}) : new Response('<h1>Produto</h1>');
    assert.equal((await resolveMercadoEntry(entry)).externalId,'MLB12345678');
    globalThis.fetch=async()=>new Response('Forbidden',{status:403});
    await assert.rejects(resolveMercadoEntry(entry),error=>error.message.includes('Abra-o no navegador'));
  } finally {globalThis.fetch=original;}
});

test('Mercado Livre structured data supplies product details without credentials', () => {
  const entry = parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre');
  const product = {'@type':'Product',name:'Celular de teste',brand:{name:'Marca'},image:['https://http2.mlstatic.com/test.jpg'],description:'Descrição pública',offers:{'@type':'Offer',price:'999.90',priceCurrency:'BRL'},additionalProperty:[{name:'Memória RAM',value:'8 GB'}]};
  const html = `<script type="application/ld+json">invalid</script><script type="application/ld+json">${JSON.stringify({'@graph':[product]})}</script>`;
  const data = parseMercadoProduct(html,entry);
  assert.equal(data.name,product.name);assert.equal(data.price,999.9);assert.equal(data.brand,'Marca');assert.equal(data.imageUrl,product.image[0]);assert.equal(data.description,product.description);assert.equal(data.specs[0].value,'8');
  const noPrice = parseMercadoProduct(`<script type="application/ld+json">${JSON.stringify({...product,offers:undefined})}</script>`,entry);
  assert.equal(noPrice.price,null);
  const foreignCurrency = parseMercadoProduct(`<script type="application/ld+json">${JSON.stringify({...product,offers:{price:100,priceCurrency:'USD'}})}</script>`,entry);
  assert.equal(foreignCurrency.price,null);
});

test('Mercado Livre downloads public HTML without API or authorization headers', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (address, options) => {
      assert.equal(new URL(address).hostname,'www.mercadolivre.com.br');
      assert.equal(options.headers.Authorization,undefined);
      assert.equal(options.headers.Accept,'text/html');
      return new Response('<h1 class="ui-pdp-title">Produto público</h1>',{headers:{'Content-Type':'text/html'}});
    };
    const entry = parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre');
    const page = await fetchImportResource(entry.productUrl,'ml-link');
    assert.equal(parseMercadoProduct(page.bytes.toString('utf8'),entry).name,'Produto público');
    assert.throws(()=>allowedImportFetchUrl('https://api.mercadolibre.com/products/MLB12345678','ml-link'));
  } finally { globalThis.fetch = original; }
});

const mercadoApiUrl = url(compile(await readFile('lib/admin-import-mercado-api.ts','utf8')).replace('"./admin-model"', JSON.stringify(adminUrl)).replace('"./admin-import-model"', JSON.stringify(modelUrl)));
const { mapMercadoApiProduct, fetchMercadoApiProduct } = await import(mercadoApiUrl);
test('catalog API preserves affiliate URL, maps specs and never invents price', () => {
  const entry = parseImportLine('https://meli.la/abc https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre');
  const detail = {id:entry.externalId,name:'Ar condicionado',attributes:[{id:'BRAND',value_name:'LG'},{name:'Potência',value_name:'1200 W',attribute_group_name:'Desempenho'}],pictures:[{url:'http://http2.mlstatic.com/test.jpg'}],buy_box_winner:{price:100,currency_id:'USD'}};
  const product = mapMercadoApiProduct(detail,entry);
  assert.equal(product.brand,'LG'); assert.equal(product.buyUrl,entry.buyUrl); assert.equal(product.price,null);
  assert.equal(product.specs[0].value,'1200'); assert.equal(product.specs[0].group,'Desempenho');
  assert.throws(()=>mapMercadoApiProduct({...detail,id:'MLB999'},entry));
});
test('catalog API renews once on 401 without substituting another seller offer', async () => {
  const original=globalThis.fetch;
  const entry=parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre');
  const tokens=[]; let calls=0;
  try {
    globalThis.fetch=async(address,options)=>{
      assert.equal(new URL(address).hostname,'api.mercadolibre.com'); assert.equal(options.redirect,'error');
      if (++calls===1) return new Response(null,{status:401});
      assert.equal(options.headers.Authorization,'Bearer renewed');
      return Response.json(String(address).includes('/items?') ? {results:[{price:100,condition:'used',currency_id:'BRL'},{price:5,condition:'new',currency_id:'USD'},{price:200,condition:'new',currency_id:'BRL'},{price:1,condition:'new',currency_id:'BRL',status:'paused'}]} : {id:entry.externalId,name:'Produto'});
    };
    const product=await fetchMercadoApiProduct(entry,async expired=>{tokens.push(expired);return expired?'renewed':'original';});
    assert.equal(product.price,null); assert.deepEqual(tokens,[undefined,'original']); assert.equal(calls,2);
    globalThis.fetch=async()=>new Response(null,{status:403});
    await assert.rejects(fetchMercadoApiProduct(entry,async()=> 'token'),error=>error.message.includes('permissões'));
    globalThis.fetch=async address=>String(address).includes('/items?') ? new Response(null,{status:403}) : Response.json({id:entry.externalId,name:'Produto'});
    assert.equal((await fetchMercadoApiProduct(entry,async()=> 'token')).price,null);
  } finally {globalThis.fetch=original;}
});

const tokenStore = { data: {} };
globalThis.__mercadoTokenTestStore = tokenStore;
const fakeDatabaseUrl = url(`export function getAdminDatabase(){const store=globalThis.__mercadoTokenTestStore;return {doc:()=>({}),runTransaction:async fn=>fn({get:async()=>({data:()=>store.data}),set:(_ref,data,options)=>{store.data=options?.merge?{...store.data,...data}:data;},update:(_ref,data)=>{store.data={...store.data,...data};}})};}`);
const tokenUrl = url(compile(await readFile('lib/mercado-token.ts','utf8')).replace('import "server-only";', '').replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./firebase/admin"',JSON.stringify(fakeDatabaseUrl)));
const { getMercadoToken } = await import(tokenUrl);
test('token renewal persists rotation, reuses refreshed token and releases failed leases', async()=>{
  const names=['ML_ACCESS_TOKEN','ML_CLIENT_ID','ML_CLIENT_SECRET','ML_REFRESH_TOKEN'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const original=globalThis.fetch;
  try {
    Object.assign(process.env,{ML_ACCESS_TOKEN:'expired',ML_CLIENT_ID:'id',ML_CLIENT_SECRET:'secret',ML_REFRESH_TOKEN:'refresh'});
    tokenStore.data={}; let calls=0;
    globalThis.fetch=async(address,options)=>{
      calls++; assert.equal(address,'https://api.mercadolibre.com/oauth/token');
      assert.equal(options.body.get('refresh_token'),'refresh');
      return Response.json({access_token:'new',refresh_token:'rotated'});
    };
    assert.equal(await getMercadoToken(),'expired'); assert.equal(calls,0);
    assert.equal(await getMercadoToken('expired'),'new'); assert.equal(tokenStore.data.refreshToken,'rotated');
    assert.equal(await getMercadoToken('expired'),'new'); assert.equal(calls,1);
    globalThis.fetch=async()=>new Response(null,{status:400});
    await assert.rejects(getMercadoToken('new'));
    assert.equal(tokenStore.data.lockUntil,0); assert.equal(tokenStore.data.refreshToken,'rotated');
    tokenStore.data={}; delete process.env.ML_ACCESS_TOKEN;
    globalThis.fetch=async()=>Response.json({access_token:'initial',refresh_token:'initial-refresh'});
    assert.equal(await getMercadoToken(),'initial');
    tokenStore.data={}; names.forEach(name=>delete process.env[name]);
    await assert.rejects(getMercadoToken(),error=>error.status===503);
  } finally {globalThis.fetch=original; for (const name of names) {if(saved[name]===undefined) delete process.env[name]; else process.env[name]=saved[name];} delete globalThis.__mercadoTokenTestStore;}
});

test('user-product links identify listings only from original URL and preserve affiliate', async()=>{
 const line='https://meli.la/2ZXrY42 https://www.mercadolivre.com.br/liquidificador-mondial-turbo-power-l99fb/up/MLBU5122559357?pdp_filters=item_id%3AMLB5210551559';
 const entry=parseImportLine(line,'mercadolivre');
 const hashLine='https://meli.la/2ZXrY42 https://www.mercadolivre.com.br/up/MLBU5122559357#polycard_client=affiliates&wid=MLB5210551559';
 assert.equal(parseImportLine(parseImportText(hashLine)[0],'mercadolivre').externalId,'MLB5210551559');
 assert.equal(entry.kind,'item');assert.equal(entry.externalId,'MLB5210551559');assert.equal(entry.buyUrl,'https://meli.la/2ZXrY42');
 assert.throws(()=>parseImportLine('https://www.mercadolivre.com.br/p/MLBU5122559357','mercadolivre'),/Não troque/);
 assert.throws(()=>parseImportLine('https://www.mercadolivre.com.br/up/MLBU5122559357','mercadolivre'),/URL completa/);
 assert.equal(parseImportLine('https://produto.mercadolivre.com.br/MLB-5210551559-liquidificador-_JM','mercadolivre').externalId,'MLB5210551559');
 const original=globalThis.fetch;const calls=[];
 try {
  globalThis.fetch=async address=>{calls.push(String(address));return Response.json(String(address).includes('/description')?{plain_text:'Descrição do anúncio'}:{id:'MLB5210551559',title:'Liquidificador Mondial',status:'active',currency_id:'BRL',price:129.9,attributes:[{id:'BRAND',value_name:'Mondial'}],pictures:[{secure_url:'https://http2.mlstatic.com/test.jpg'}]});};
  const collected=await fetchMercadoApiProduct(entry,async()=> 'token');
  assert.equal(collected.name,'Liquidificador Mondial');assert.equal(collected.price,129.9);assert.equal(collected.brand,'Mondial');assert.equal(collected.externalId,'item-MLB5210551559');assert.equal(collected.buyUrl,entry.buyUrl);assert.equal(collected.description,'Descrição do anúncio');
  assert.equal(calls[0],'https://api.mercadolibre.com/items/MLB5210551559?include_attributes=all');
  globalThis.fetch=async()=>Response.json({id:'MLB5210551559',title:'Produto',status:'paused'});
  await assert.rejects(fetchMercadoApiProduct(entry,async()=> 'token'),/pausado/);
 } finally {globalThis.fetch=original;}
});

test('single-product builder combines affiliate links with catalog or item IDs', () => {
  const affiliate='https://meli.la/31EQLJ3';
  const catalog=buildImportLine(affiliate,'mlb66154233','mercadolivre');
  assert.equal(catalog,`${affiliate} https://www.mercadolivre.com.br/p/MLB66154233`);
  assert.equal(parseImportLine(catalog,'mercadolivre').kind,undefined);
  const item=buildImportLine(affiliate,'MLB-5210551559','mercadolivre','item');
  assert.equal(parseImportLine(item,'mercadolivre').kind,'item');
  assert.equal(parseImportLine(item,'mercadolivre').externalId,'MLB5210551559');
  assert.throws(()=>buildImportLine(affiliate,'MLBU5122559357','mercadolivre'));
  const original='https://www.mercadolivre.com.br/liquidificador/up/MLBU5122559357?pdp_filters=item_id%3AMLB5210551559';
  assert.equal(parseImportLine(buildImportLine(affiliate,original,'mercadolivre'),'mercadolivre').externalId,'MLB5210551559');
  assert.throws(()=>buildImportLine('https://evil.example','MLB123','mercadolivre'));
  const amazon='https://www.amazon.com.br/dp/B012345678?tag=owner-20';
  assert.equal(buildImportLine(amazon,'','amazon'),amazon);
});

test('Mercado catalog winner uses current marketplace sale price',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async address=>Response.json(String(address).includes('/sale_price')?{amount:2089,currency_id:'BRL'}:{id:'MLB12345678',name:'Lavadora',buy_box_winner:{item_id:'MLB5210551559',currency_id:'BRL',price:2144.01}});
  const result=await fetchMercadoApiProduct(parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre'),async()=> 'token',true);
  assert.equal(result.price,2089);
  globalThis.fetch=async address=>String(address).includes('/sale_price')?new Response(null,{status:403}):Response.json({id:'MLB12345678',name:'Lavadora',buy_box_winner:{item_id:'MLB5210551559',currency_id:'BRL',price:2144.01}});
  assert.equal((await fetchMercadoApiProduct(parseImportLine('https://www.mercadolivre.com.br/p/MLB12345678','mercadolivre'),async()=> 'token',true)).price,2144.01);
 }finally{globalThis.fetch=original;}
});

test('Amazon distinguishes access challenges from incomplete pages and supports priceToPay layout',()=>{
 const entry=parseImportLine('https://www.amazon.com.br/dp/B012345678','amazon');
 assert.throws(()=>parseAmazonProduct('<title>Robot Check</title>',entry),error=>error.status===429);
 assert.throws(()=>parseAmazonProduct('<title>Página indisponível</title>',entry),error=>error.status===502 && !error.message.includes('captcha'));
 const html='<span id="productTitle">Produto</span><div id="apex_desktop"><span class="a-price a-text-price"><span class="a-offscreen">R$ 999,99</span></span><span class="a-price priceToPay"><span class="a-price-whole">129,</span><span class="a-price-fraction">90</span></span></div>';
 assert.equal(parseAmazonProduct(html,entry).price,129.9);
});

const amazonFetchStub=url('export async function fetchImportResource(){globalThis.amazonAttempts++;return {bytes:Buffer.from(globalThis.amazonAttempts===1?globalThis.amazonFirst:globalThis.amazonSecond),url:"https://www.amazon.com.br/dp/B012345678"};}');
const amazonRetrySource=compile(await readFile('lib/admin-import-amazon.ts','utf8')).replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-import-fetch"',JSON.stringify(amazonFetchStub)).replace('"./admin-import-parser"',JSON.stringify(parserUrl)).replaceAll('8000','0');
const {fetchAmazonProduct}=await import(url(amazonRetrySource));
test('Amazon source attempts are bounded to two and included in errors',async()=>{
 const entry=parseImportLine('https://www.amazon.com.br/dp/B012345678','amazon');
 globalThis.amazonAttempts=0;globalThis.amazonFirst='<title>Unavailable</title>';globalThis.amazonSecond='<span id="productTitle">TV</span>';
 assert.equal((await fetchAmazonProduct(entry)).name,'TV');assert.equal(globalThis.amazonAttempts,2);
 globalThis.amazonAttempts=0;globalThis.amazonFirst='<title>Robot Check</title>';globalThis.amazonSecond=globalThis.amazonFirst;
 await assert.rejects(fetchAmazonProduct(entry),error=>error.status===429 && error.message.includes('2 tentativas'));assert.equal(globalThis.amazonAttempts,2);
 globalThis.amazonAttempts=0;globalThis.amazonFirst='<title>Unavailable</title>';globalThis.amazonSecond=globalThis.amazonFirst;
 await assert.rejects(fetchAmazonProduct(entry),error=>error.status===502);assert.equal(globalThis.amazonAttempts,2);
 delete globalThis.amazonAttempts;delete globalThis.amazonFirst;delete globalThis.amazonSecond;
});

const browserPriceSource=compile(await readFile('lib/mercado-browser-price.ts','utf8')).replace('"playwright-core"',JSON.stringify(import.meta.resolve('playwright-core'))).replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-import-fetch"',JSON.stringify(fetchUrl)).replace('"./admin-import-model"',JSON.stringify(modelUrl)).replace('"./admin-import-parser"',JSON.stringify(parserUrl)).replace('"cheerio"',JSON.stringify(import.meta.resolve('cheerio')));
const {readMercadoBrowserPrice}=await import(url(browserPriceSource));
test('browser prices verify product identity and only mark Pix beside the main price',()=>{
 const entry=parseImportLine('https://meli.la/example https://www.mercadolivre.com.br/p/MLB51054606','mercadolivre');
 const html='<h1 class="ui-pdp-title">Lavadora</h1><div class="ui-pdp-price__second-line"><span class="andes-money-amount"><span class="andes-money-amount__fraction">2.089</span></span><span>no Pix</span></div>';
 assert.deepEqual(readMercadoBrowserPrice(html,entry.productUrl,entry),{price:2089,condition:'pix'});
 assert.throws(()=>readMercadoBrowserPrice(html,'https://www.mercadolivre.com.br/p/MLB9999',entry));
 assert.equal(readMercadoBrowserPrice(html.replace('no Pix','em 10 parcelas'),entry.productUrl,entry).condition,'standard');
 assert.throws(()=>readMercadoBrowserPrice('<form action="/captcha"></form>',entry.productUrl,entry));
});

test('extension price-only updates preserve affiliate, specifications and other stores while reactivating the offer', () => {
  const existing={id:'produto',revision:4,name:'Manual',description:'Manual',brandId:'marca',category:'celulares',imageUrl:'old',isActive:true,overallScore:8,metaTitle:'SEO',metaDescription:'SEO',specs:[inferImportSpec('Memória','128 GB')],offers:[{id:'amazon',storeId:'amazon',externalId:'B012345678',price:100,url:'https://amzn.to/owner',available:false},{id:'ml',storeId:'mercado-livre',price:120,url:'https://meli.la/owner',available:true}],highlights:[{kind:'pro',text:'Manual'}]};
  const collected={name:'Remote',brand:'Remote',description:'Remote',price:90,specs:[],externalId:'B012345678',buyUrl:'https://www.amazon.com.br/dp/B012345678'};
  const result=mergeImportedProduct(collected,existing,'outro','outro','amazon','new','price');
  assert.deepEqual({...result,offers:existing.offers},existing);
  assert.deepEqual(result.offers.find(offer=>offer.storeId==='amazon'),{...existing.offers[0],price:90,available:true});
  assert.deepEqual(result.offers.find(offer=>offer.storeId==='mercado-livre'),existing.offers[1]);
  assert.throws(()=>mergeImportedProduct(collected,{...existing,offers:[]},'outro','marca','amazon','','price'));
});
test('extension attaches the other store without changing the product; full refresh replaces collected fields', () => {
  const existing={id:'produto',revision:2,name:'Manual',description:'Manual',brandId:'marca',category:'celulares',imageUrl:'old',isActive:true,overallScore:8,metaTitle:'SEO',metaDescription:'SEO',specs:[inferImportSpec('Memória','128 GB'),inferImportSpec('Cor','Azul')],offers:[{id:'amazon',storeId:'amazon',price:100,url:'https://amzn.to/owner',available:true}],highlights:[{kind:'pro',text:'Manual'}]};
  const collected={name:'Remote',brand:'Remote',description:'Remote',price:90,specs:[inferImportSpec('Memória','256 GB')],externalId:'MLB12345',buyUrl:'https://meli.la/new'};
  const offer=mergeImportedProduct(collected,existing,'outro','remote','mercado-livre','new','offer');
  assert.deepEqual({...offer,offers:existing.offers},existing);assert.equal(offer.offers.length,2);assert.equal(offer.offers[1].url,collected.buyUrl);
  const full=mergeImportedProduct(collected,offer,'outro','remote','mercado-livre','new','full');
  assert.equal(full.name,'Remote');assert.equal(full.description,'Remote');assert.equal(full.brandId,'remote');assert.equal(full.imageUrl,'new');assert.equal(full.specs[0].value,'256');assert.equal(full.specs[1].value,'Azul');
  assert.equal(full.category,existing.category);assert.equal(full.isActive,true);assert.equal(full.overallScore,8);assert.equal(full.metaTitle,'SEO');assert.deepEqual(full.highlights,existing.highlights);assert.deepEqual(full.offers[0],existing.offers[0]);
  assert.equal(mergeImportedProduct(collected,existing,'outro','remote','mercado-livre','','full').imageUrl,'old');
});
