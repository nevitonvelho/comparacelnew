import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const adminUrl=url(compile(await readFile('lib/admin-model.ts','utf8')));
const modelUrl=url(compile(await readFile('lib/admin-import-model.ts','utf8')).replace('"./admin-model"',JSON.stringify(adminUrl)));
const captureUrl=url(compile(await readFile('lib/product-capture.ts','utf8')).replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-import-model"',JSON.stringify(modelUrl)));
const {validateProductCapture,collectedFromProductCapture}=await import(captureUrl);
const capture={version:1,source:'mercadolivre',pageUrl:'https://www.mercadolivre.com.br/p/MLB12345',capturedAt:new Date().toISOString(),name:'Lavadora',brand:'Electrolux',description:'Descrição',price:2089.90,condition:'pix',imageUrl:'',specs:[{name:'Capacidade',value:'18 kg'}]};
test('Collected data preserves affiliate URL, cents, Pix and technical specifications',()=>{
  const result=collectedFromProductCapture(validateProductCapture(capture),'https://meli.la/affiliate https://www.mercadolivre.com.br/p/MLB12345');
  assert.equal(result.buyUrl,'https://meli.la/affiliate');assert.equal(result.externalId,'MLB12345');assert.equal(result.price,2089.90);assert.equal(result.priceCondition,'pix');assert.equal(result.specs[0].value,'18');assert.equal(result.specs[0].unit,'kg');
  assert.throws(()=>collectedFromProductCapture(capture,'https://meli.la/affiliate https://www.mercadolivre.com.br/p/MLB99999'));
});
test('Amazon and direct Mercado advertisements retain their source identifiers',()=>{
  const amazon=validateProductCapture({...capture,source:'amazon',condition:'standard',pageUrl:'https://www.amazon.com.br/dp/B0F5X5GYK3'});
  assert.equal(collectedFromProductCapture(amazon,'https://amzn.to/affiliate').externalId,'B0F5X5GYK3');
  assert.throws(()=>collectedFromProductCapture(amazon,'https://www.amazon.com.br/dp/B012345678'));
  const item=validateProductCapture({...capture,pageUrl:'https://produto.mercadolivre.com.br/MLB-12345-produto-_JM'});
  assert.equal(collectedFromProductCapture(item,'https://meli.la/affiliate '+item.pageUrl).externalId,'item-MLB12345');
});
test('Invalid, unrelated and expired captures never reach persistence',()=>{
  for(const changes of [{price:null},{price:0},{price:NaN},{source:'other'},{pageUrl:'https://evil.example/p/MLB12345'},{pageUrl:'https://meli.la/short'},{capturedAt:new Date(Date.now()-86400001).toISOString()},{specs:[{name:'x',value:42}]}])assert.throws(()=>validateProductCapture({...capture,...changes}));
  assert.equal(validateProductCapture({...capture,admin:true}).admin,undefined);
});
test('Editorial defaults are supported by explicit specifications; missing values never become drawbacks',()=>{
  const result=collectedFromProductCapture({...capture,specs:[{name:'Com NFC',value:'Sim'},{name:'Inclui carregador',value:'Não'},{name:'Com 5G',value:'Não informado'},{name:'Memória interna',value:'128 GB'}]},'https://meli.la/affiliate '+capture.pageUrl);
  assert.deepEqual(result.highlights.map(item=>item.kind),['pro','con']);
  assert.match(result.highlights[0].text,/NFC/);assert.match(result.highlights[1].text,/carregador/);
  assert.equal(collectedFromProductCapture({...capture,specs:[]},capture.pageUrl).highlights.length,0);
});
const keys=new Map();let accountDisabled=false;let permission=true;
globalThis.extensionTest={db:{doc:path=>({set:async data=>keys.set(path,data)}),collection:()=>({where:(_field,_operator,hash)=>({limit:()=>({get:async()=>({docs:[...keys.entries()].filter(([,data])=>data.hash===hash).map(([path,data])=>({id:path.split('/').at(-1),data:()=>data}))})})})})},auth:{getUser:async uid=>({uid,disabled:accountDisabled,emailVerified:true,email:'test@example.com',providerData:[{providerId:'google.com'}]})},access:()=>({permissions:permission?['import.manage']:[]})};
const firebaseUrl=url('export const getAdminDatabase=()=>globalThis.extensionTest.db; export const getAdminAuth=()=>globalThis.extensionTest.auth;');
const apiUrl=url('export const getStaffAccess=async()=>globalThis.extensionTest.access();');
const authUrl=url(compile(await readFile('lib/extension-auth.ts','utf8')).replace('import "server-only";','').replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-api"',JSON.stringify(apiUrl)).replace('"./firebase/admin"',JSON.stringify(firebaseUrl)));
const {createExtensionKey,requireExtension,extensionHeaders}=await import(authUrl);
const request=key=>({headers:new Headers({origin:'chrome-extension://'+'a'.repeat(32),authorization:`Bearer ${key}`})});
test('Extension keys are hashed, replaceable, revocable and checked against current permissions',async()=>{
  const first=await createExtensionKey('user');assert.match(first.key,/^ccx_[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...keys.values()]).includes(first.key));
  assert.equal((await requireExtension(request(first.key))).uid,'user');
  assert.equal((await requireExtension({headers:new Headers({authorization:`Bearer ${first.key}`})})).uid,'user');
  for(const origin of ['null','http://localhost:3000','https://other.example']) {
    assert.equal((await requireExtension({headers:new Headers({origin,authorization:`Bearer ${first.key}`})})).uid,'user');
    await assert.rejects(requireExtension({headers:new Headers({origin})}));
  }
  await assert.rejects(requireExtension({headers:new Headers()}));
  const second=await createExtensionKey('user');await assert.rejects(requireExtension(request(first.key)));
  permission=false;await assert.rejects(requireExtension(request(second.key)));permission=true;
  accountDisabled=true;await assert.rejects(requireExtension(request(second.key)));accountDisabled=false;
  keys.get('adminExtensionKeys/user').expiresAt=Date.now()-1;await assert.rejects(requireExtension(request(second.key)));
  const third=await createExtensionKey('user');keys.clear();await assert.rejects(requireExtension(request(third.key)));
  assert.equal(extensionHeaders({headers:new Headers({origin:'null'})})['Access-Control-Allow-Origin'],'*');
  assert.equal(extensionHeaders({headers:new Headers()})['Access-Control-Allow-Credentials'],undefined);
});

const productStubUrl=url('export const adminProductFromData=(id,data)=>({...data,id});');
const extensionProductsUrl=url(compile(await readFile('lib/extension-products.ts','utf8')).replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-import-model"',JSON.stringify(modelUrl)).replace('"./admin-store"',JSON.stringify(productStubUrl)));
const {extensionProductIdentity,offerMatchesIdentity,lookupExtensionProduct,searchExtensionProducts,extensionProductSimilarity,suggestExtensionProducts}=await import(extensionProductsUrl);
function productDatabase(records,mappings={}) {
  const snapshot=(id,data)=>({id,exists:!!data,data:()=>data});
  return {doc:path=>({get:async()=>{const [collection,id]=path.split('/');return snapshot(id,collection==='products'?records[id]:mappings[id]);}}),collection:()=>({get:async()=>({docs:Object.entries(records).map(([id,data])=>snapshot(id,data))})})};
}
test('extension identifies Amazon, Mercado catalog and item URLs without matching names',async()=>{
  const amazon={name:'Mesmo nome',category:'celulares',offers:[{storeId:'amazon',url:'https://amzn.to/owner',externalId:'B012345678'}]};
  const mercado={name:'Mesmo nome',category:'celulares',offers:[{storeId:'mercado-livre',url:'https://meli.la/owner',externalId:'item-MLB12345'}]};
  const db=productDatabase({amazon,mercado});
  assert.equal(extensionProductIdentity('https://www.amazon.com.br/gp/aw/d/B012345678?tag=owner','amazon'),'B012345678');
  assert.equal(extensionProductIdentity('https://produto.mercadolivre.com.br/MLB-12345-modelo-_JM','mercadolivre'),'item-MLB12345');
  assert.equal((await lookupExtensionProduct(db,'amazon','B012345678')).id,'amazon');
  assert.equal((await lookupExtensionProduct(db,'mercadolivre','item-MLB12345')).id,'mercado');
  assert.equal(await lookupExtensionProduct(db,'mercadolivre','MLB12345'),null);
  assert.equal(await lookupExtensionProduct(db,'amazon','B099999999'),null);
  assert.equal(offerMatchesIdentity({url:'https://www.amazon.com.br/dp/B012345678'},'amazon','B012345678'),true);
  assert.equal(offerMatchesIdentity({url:'https://www.mercadolivre.com.br/p/MLB12345'},'mercadolivre','MLB12345'),true);
  assert.equal(offerMatchesIdentity({url:'https://evil.example/p/MLB12345'},'mercadolivre','MLB12345'),false);
  await assert.rejects(lookupExtensionProduct(productDatabase({a:amazon,b:amazon}),'amazon','B012345678'),/mais de uma/);
});
test('extension mappings recognize cross-store links and search includes drafts with different titles',async()=>{
  const product={name:'Lavadora Electrolux 18 kg',category:'lavadoras',isActive:false,offers:[{storeId:'amazon',externalId:'B012345678',url:'https://amzn.to/owner'}]};
  const db=productDatabase({'lavadora-manual':product},{'mercadolivre-MLB12345':{productId:'lavadora-manual'}});
  assert.equal((await lookupExtensionProduct(db,'mercadolivre','MLB12345')).id,'lavadora-manual');
  const results=await searchExtensionProducts(db,'electrolux 18');
  assert.equal(results.length,1);assert.equal(results[0].id,'lavadora-manual');assert.equal(results[0].offers[0].url,'https://amzn.to/owner');
  assert.equal((await searchExtensionProducts(db,'lavadora-manual')).length,1);
  assert.equal((await searchExtensionProducts(db,'outro modelo')).length,0);
});

const mergeStoreUrl=url(compile(await readFile('lib/admin-import-store.ts','utf8')).replace('"./admin-model"',JSON.stringify(adminUrl)).replace('"./admin-store"',JSON.stringify(url('export function adminProductFromData(){};export function createAdminReference(){};export function saveAdminProduct(){};'))));
const {mergeImportedProduct}=await import(mergeStoreUrl);
const routeDependencies={
  'node:crypto': 'node:crypto',
  'firebase-admin/storage': url('export const getDownloadURL=async()=>"";'),
  'next/server': url('export class NextResponse extends Response {static json(body,options){return new NextResponse(JSON.stringify(body),options);}}'),
  '@/lib/extension-auth': url('export const extensionHeaders=()=>({});export const requireExtension=async()=>({uid:"user"});'),
  '@/lib/admin-model': adminUrl,
  '@/lib/admin-api': url('export const readAdminJson=async request=>request.body;'),
  '@/lib/firebase/admin': url('export const getAdminDatabase=()=>globalThis.extensionRoute.db;export const getAdminBucket=()=>{throw new Error("Unexpected image upload")};'),
  '@/lib/product-capture': captureUrl,
  '@/lib/admin-import-store': url('export const persistImportedProduct=async(...args)=>globalThis.extensionRoute.persist(...args);'),
  '@/lib/admin-import-fetch': url('export const fetchImportResource=async()=>{throw new Error("Unexpected image fetch")};'),
  '@/lib/admin-image': url('export const inspectAdminImage=async()=>{};'),
  '@/lib/server-catalog': url('export const invalidateServerCatalog=()=>{};'),
  '@/lib/admin-store': productStubUrl,
  '@/lib/extension-products': extensionProductsUrl,
  'next/cache': url('export const revalidatePath=()=>{};'),
};
let routeSource=compile(await readFile('app/api/extension/import/route.ts','utf8'));
for(const [specifier,replacement] of Object.entries(routeDependencies))routeSource=routeSource.replaceAll(JSON.stringify(specifier),JSON.stringify(replacement));
const {GET:extensionGet,POST:extensionPost}=await import(url(routeSource));
function routeFixture() {
  const record={id:'lavadora',revision:3,name:'Manual',description:'Manual',brandId:'marca',category:'lavadoras',imageUrl:'',isActive:true,overallScore:8,metaTitle:'SEO',metaDescription:'SEO',specs:[],offers:[{id:'amazon',storeId:'amazon',externalId:'B012345678',url:'https://amzn.to/owner',price:100,available:true}],highlights:[{kind:'pro',text:'Manual'}]};
  const records={lavadora:record};const db=productDatabase(records);
  const collection=db.collection;
  db.collection=kind=>kind==='categories'?{where:()=>({limit:()=>({get:async()=>({empty:false})})}),get:async()=>({docs:[{id:'lavadoras',data:()=>({slug:'lavadoras',name:'Lavadoras'})}]})}:collection(kind);
  db.runTransaction=async run=>run({get:async()=>({data:()=>({})}),set:()=>{},update:()=>{}});
  globalThis.extensionRoute={db,persist:async(_db,_actor,source,collected,existing,category,image,mode)=>{
    const product=mergeImportedProduct(collected,existing,category,'marca',source==='amazon'?'amazon':'mercado-livre',image,mode);
    product.offers.find(offer=>offer.storeId===(source==='amazon'?'amazon':'mercado-livre')).externalId=collected.externalId;
    records[product.id]=product;return {product,created:!existing};
  }};
  return {record,records};
}
const sendExtension=body=>extensionPost({body});
test('extension API links Mercado to an Amazon product, then recognizes and updates only its price',async()=>{
  const {record,records}=routeFixture();
  const added=await sendExtension({capture,mode:'offer',productId:'lavadora',affiliateUrl:'https://meli.la/owner'});
  assert.equal(added.status,200);assert.equal(records.lavadora.offers.length,2);assert.deepEqual(records.lavadora.offers[0],record.offers[0]);assert.equal(records.lavadora.name,'Manual');
  const identified=await extensionGet({nextUrl:new URL(`https://example.test/api/extension/import?${new URLSearchParams({source:'mercadolivre',pageUrl:capture.pageUrl})}`)});
  assert.equal((await identified.json()).product.id,'lavadora');
  const updated=await sendExtension({capture:{...capture,price:80},mode:'price',productId:'lavadora'});
  assert.equal(updated.status,200);assert.equal(records.lavadora.offers.find(offer=>offer.storeId==='mercado-livre').price,80);assert.equal(records.lavadora.offers.find(offer=>offer.storeId==='mercado-livre').url,'https://meli.la/owner');assert.equal(records.lavadora.name,'Manual');
});
test('extension API full refresh retains affiliate when blank and refuses wrong product targets',async()=>{
  const {records}=routeFixture();
  const amazon={...capture,source:'amazon',pageUrl:'https://www.amazon.com.br/dp/B012345678'};
  const full=await sendExtension({capture:amazon,mode:'full',productId:'lavadora',affiliateUrl:''});
  assert.equal(full.status,200);assert.equal(records.lavadora.name,capture.name);assert.equal(records.lavadora.offers[0].url,'https://amzn.to/owner');assert.equal(records.lavadora.isActive,true);assert.equal(records.lavadora.overallScore,8);
  assert.equal((await sendExtension({capture:amazon,mode:'offer',productId:'outro',affiliateUrl:'https://amzn.to/other'})).status,409);
  assert.equal((await sendExtension({capture,mode:'price',productId:'lavadora'})).status,400);
  assert.equal((await sendExtension({capture,mode:'offer',productId:'lavadora'})).status,400);
  assert.equal((await sendExtension({capture,mode:'offer',productId:'nao-existe',affiliateUrl:'https://meli.la/owner'})).status,404);
  assert.equal((await sendExtension({capture,mode:'unknown'})).status,400);
});


test('automatic suggestions recognize store title variations and reject different capacities and models', async()=>{
  const title='Micro-ondas Electrolux Branco 23L Efficient ME23S 127V';
  assert.ok(extensionProductSimilarity(title,'Electrolux Micro ondas ME23S Efficient Branco 23 litros 127 V')>0);
  assert.equal(extensionProductSimilarity(title,'Micro-ondas Electrolux Branco 23L Efficient ME23B 127V'),0);
  assert.equal(extensionProductSimilarity(title,'Micro-ondas Electrolux Branco 31L Efficient ME31S 127V'),0);
  assert.equal(extensionProductSimilarity(title,'Micro-ondas Electrolux Branco 23L Efficient ME23S 220V'),0);
  assert.equal(extensionProductSimilarity(title,'Samsung Galaxy A55 128 GB'),0);
  const records={same:{name:'Electrolux Micro ondas ME23S Efficient Branco 23 litros 127 V',category:'micro-ondas',offers:[]},other:{name:'Micro-ondas Electrolux Branco 31L Efficient ME31S 127V',category:'micro-ondas',offers:[]}};
  const suggestions=await suggestExtensionProducts(productDatabase(records),title);
  assert.deepEqual(suggestions.map(item=>item.id),['same']);
});
test('extension API provides automatic cross-store suggestions from the captured title',async()=>{
  const {records}=routeFixture();records.lavadora.name='Lavadora Electrolux 18 kg';
  const response=await extensionGet({nextUrl:new URL(`https://example.test/api/extension/import?${new URLSearchParams({source:'mercadolivre',pageUrl:capture.pageUrl,name:'Electrolux Lavadora 18kg Branca'})}`)});
  const data=await response.json();
  assert.equal(data.product,null);assert.equal(data.suggestions[0].id,'lavadora');
});


test('exact screenshot titles identify ME23B across stores despite Amazon description and missing Mercado voltage',async()=>{
  const amazon='Micro-ondas Electrolux 23L Branco Efficient com Descongelamento Assistido (ME23B) 127V';
  const mercado='Micro-ondas Electrolux Branco 23L Efficient ME23B';
  assert.ok(extensionProductSimilarity(amazon,mercado)>=0.9);
  assert.ok(extensionProductSimilarity(mercado,amazon)>=0.9);
  assert.equal(extensionProductSimilarity(amazon,mercado+' 220V'),0);
  assert.equal(extensionProductSimilarity(amazon,mercado.replace('ME23B','ME23S')),0);
  assert.equal(extensionProductSimilarity(amazon,mercado.replace('23L','31L')),0);
  const {records}=routeFixture();
  records.lavadora.name=mercado;records.lavadora.offers=[{storeId:'mercado-livre',externalId:'MLB19617679',url:'https://meli.la/owner',price:671.90}];
  const response=await extensionGet({nextUrl:new URL(`https://example.test/api/extension/import?${new URLSearchParams({source:'amazon',pageUrl:'https://www.amazon.com.br/dp/B0B8KWNK12',name:amazon})}`)});
  const data=await response.json();assert.equal(data.product,null);assert.equal(data.suggestions[0].id,'lavadora');assert.equal(data.automaticSuggestions,true);
});

test('manual search ranks copied titles, punctuation and Samsung short/complete models',async()=>{
  const db=productDatabase({tv:{name:'Samsung Smart TV 55" Crystal UHD 4K U8100F 2025',category:'televisores',offers:[]},other:{name:'Samsung Smart TV 50" Crystal UHD 4K U8100F 2025',category:'televisores',offers:[]}});
  for(const query of ['\'Samsung Smart TV 55" Crystal UHD 4K U8100F 2025\'', 'Samsung Smart TV 55 polegadas Crystal UHD 4K U8100F', 'Smart Tv Un55u8100fgxzd Crystal 55 4k Preto Samsung Bivolt']) {
    const results=await searchExtensionProducts(db,query);assert.equal(results[0]?.id,'tv',query);
    assert.ok(!results.some(product=>product.id==='other'),query);
  }
  assert.equal((await searchExtensionProducts(db,'U8100F')).length,2);
  assert.equal((await searchExtensionProducts(db,'geladeira Brastemp')).length,0);
  assert.equal(extensionProductSimilarity('Smart TV Samsung UN55U8100FGXZD Crystal 4K','Samsung Smart TV 55 polegadas U8000F Crystal 4K'),0);
});

test('indisponibilidade sem preço preserva afiliado, último preço e outras lojas',async()=>{
  const {record,records}=routeFixture();
  record.offers.push({id:'mercado',storeId:'mercado-livre',externalId:'MLB12345',url:'https://meli.la/owner',price:120,available:true});
  const unavailable={...capture,source:'amazon',pageUrl:'https://www.amazon.com.br/dp/B012345678',price:null};
  const result=await sendExtension({capture:unavailable,mode:'unavailable',productId:'lavadora'});
  assert.equal(result.status,200);
  assert.equal(records.lavadora.offers[0].available,false);
  assert.equal(records.lavadora.offers[0].url,'https://amzn.to/owner');
  assert.equal(records.lavadora.offers[0].price,100);
  assert.equal(records.lavadora.offers[1].available,true);
  assert.equal(records.lavadora.isActive,true);
  const invalid=await sendExtension({capture:unavailable,mode:'price',productId:'lavadora'});
  assert.equal(invalid.status,400);
  const restored=await sendExtension({capture:{...unavailable,price:105},mode:'price',productId:'lavadora'});
  assert.equal(restored.status,200);
  assert.equal(records.lavadora.offers[0].available,true);
});

test('price action can attach a selected cross-store offer without replacing product fields',async()=>{
  const {record,records}=routeFixture();
  const result=await sendExtension({capture,mode:'price',productId:'lavadora',affiliateUrl:'https://meli.la/owner'});
  assert.equal(result.status,200);
  assert.equal(records.lavadora.name,record.name);
  assert.equal(records.lavadora.description,record.description);
  assert.equal(records.lavadora.imageUrl,record.imageUrl);
  assert.deepEqual(records.lavadora.specs,record.specs);
  assert.deepEqual(records.lavadora.offers[0],record.offers[0]);
  assert.equal(records.lavadora.offers[1].url,'https://meli.la/owner');
  assert.equal(records.lavadora.offers[1].price,capture.price);
});
