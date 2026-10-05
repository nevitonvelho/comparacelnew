import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { NextRequest } from 'next/server.js';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelUrl = url(compile(await readFile('lib/admin-model.ts', 'utf8')));
const { validateAdminProduct, isAdministrator } = await import(modelUrl);
const account = { uid: 'owner', email: 'owner@example.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const product = { id: 'teste', revision: 0, name: 'Teste', description: '', brandId: 'marca', category: 'celulares', imageUrl: '', isActive: false, overallScore: 0, metaTitle: '', metaDescription: '', specs: [], offers: [], highlights: [] };
test('admin access fails closed, requires verified Google identity and explicit role', () => {
  assert.equal(isAdministrator(account, ''), false);
  assert.equal(isAdministrator(account, 'other@example.com'), false);
  assert.equal(isAdministrator(account, ' OWNER@EXAMPLE.COM '), true);
  assert.equal(isAdministrator({ ...account, admin: true }, ''), true);
  assert.equal(isAdministrator({ ...account, admin: 'true' }, ''), false);
  assert.equal(isAdministrator({ ...account, email_verified: false, admin: true }, 'owner@example.com'), false);
  assert.equal(isAdministrator({ ...account, firebase: { sign_in_provider: 'password' }, admin: true }, 'owner@example.com'), false);
});
test('product input rejects path traversal, unsafe links, arbitrary images and duplicate specs', () => {
  assert.equal(validateAdminProduct(product).name, 'Teste');
  for (const patch of [{ id: '../outside' }, { imageUrl: 'https://external.example/photo.jpg' }, { isActive: 'true' }, { overallScore: 11 }, { revision: 1.1 }, { brandId: '../brands' }]) assert.throws(() => validateAdminProduct({ ...product, ...patch }));
  const spec = { slug: 'peso', name: 'Peso', group: 'Design', type: 'number', value: '100', unit: 'g', order: 0, higherIsBetter: false };
  assert.throws(() => validateAdminProduct({ ...product, specs: [spec, spec] }));
  assert.throws(() => validateAdminProduct({ ...product, specs: [{ ...spec, value: 'NaN' }] }));
  const offer = { id: 'a', storeId: 'loja', price: 10, url: 'javascript:alert(1)', available: true };
  assert.throws(() => validateAdminProduct({ ...product, offers: [offer] }));
  assert.throws(() => validateAdminProduct({ ...product, offers: [{ ...offer, url: 'https://user:password@shop.example' }] }));
});
const permissionsUrl = url(compile(await readFile("lib/admin-permissions.ts","utf8")).replace('"./admin-model"',JSON.stringify(modelUrl)));
const {validateStaffAccess}=await import(permissionsUrl);
const authUrl = url('export function getAdminDatabase(){return {doc:()=>({get:async()=>({data:()=>globalThis.adminStaffAccess})})};}export function getAdminAuth(){return {verifyIdToken: async (token, revoked) => {globalThis.adminCheckedRevoked=revoked;if(token!=="valid")throw new Error("invalid");return globalThis.adminVerifiedAccount;}}}');
const apiSource = compile(await readFile('lib/admin-api.ts', 'utf8')).replace('import "server-only";', '').replace('"next/server"', JSON.stringify(import.meta.resolve('next/server.js'))).replaceAll('"./firebase/admin"', JSON.stringify(authUrl)).replace('"./admin-permissions"',JSON.stringify(permissionsUrl)).replace('"./admin-model"', JSON.stringify(modelUrl));
const { requireAdministrator, readAdminBytes } = await import(url(apiSource));
test('API verifies revoked tokens, rejects unauthenticated calls and cross-origin writes', async () => {
  const previous = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'owner@example.com';
  globalThis.adminVerifiedAccount = account;
  try {
    await assert.rejects(requireAdministrator(new NextRequest('http://localhost/api/admin/products')), error => error.status === 401);
    await assert.rejects(requireAdministrator(new NextRequest('http://localhost/api/admin/products', { headers: { Authorization: 'Bearer invalid' } })), error => error.status === 401);
    const headers = { Authorization: 'Bearer valid', Origin: 'https://foreign.example' };
    await assert.rejects(requireAdministrator(new NextRequest('http://localhost/api/admin/products', { method: 'POST', headers })), error => error.status === 403);
    const result = await requireAdministrator(new NextRequest('http://localhost/api/admin/products', { method: 'POST', headers: { ...headers, Origin: 'http://localhost' } }));
    assert.equal(result.uid, 'owner');
    assert.equal(globalThis.adminCheckedRevoked, true);
    globalThis.adminVerifiedAccount = { ...account, email: 'ordinary@example.com' };
    await assert.rejects(requireAdministrator(new NextRequest('http://localhost/api/admin/products', { headers: { Authorization: 'Bearer valid' } })), error => error.status === 403);
    await assert.rejects(readAdminBytes(new NextRequest('http://localhost/api/admin/products', { method: 'POST', body: '123456' }), 5), error => error.status === 413);
  } finally { if (previous === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = previous; delete globalThis.adminVerifiedAccount; delete globalThis.adminCheckedRevoked; }
});

const imageSource = compile(await readFile('lib/admin-image.ts', 'utf8')).replace('"sharp"', JSON.stringify(import.meta.resolve('sharp'))).replace('"./admin-model"', JSON.stringify(modelUrl));
const { inspectAdminImage, MAX_ADMIN_IMAGE_SIZE } = await import(url(imageSource));
test('uploads verify actual image data instead of trusting a MIME type', async () => {
  const png = await readFile('public/brand/google-g.png');
  assert.equal((await inspectAdminImage(png, 'image/png')).extension, 'png');
  await assert.rejects(inspectAdminImage(png, 'image/jpeg'));
  await assert.rejects(inspectAdminImage(Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/png'));
  await assert.rejects(inspectAdminImage(Buffer.from([137,80,78,71,13,10,26,10,0,0,0]), 'image/png'));
  await assert.rejects(inspectAdminImage(Buffer.alloc(MAX_ADMIN_IMAGE_SIZE + 1), 'image/png'));
});

 test('employee module authorization rejects escalation and reacts to revoked access',async()=>{
 const old=process.env.ADMIN_EMAILS;process.env.ADMIN_EMAILS='';
 globalThis.adminVerifiedAccount={...account,email:'staff@example.com'};
 globalThis.adminStaffAccess={role:'employee',permissions:['products.view','products.edit','users.manage','unknown']};
 const req=new NextRequest('http://localhost/api/admin/products',{headers:{Authorization:'Bearer valid'}});
 try {
  assert.equal((await requireAdministrator(req,'products.edit')).access.role,'employee');
  await assert.rejects(requireAdministrator(req,'categories.manage'),error=>error.status===403);
  await assert.rejects(requireAdministrator(req,'users.manage'),error=>error.status===403);
  globalThis.adminStaffAccess={role:'user',permissions:['products.edit']};
  await assert.rejects(requireAdministrator(req,'products.edit'),error=>error.status===403);
  globalThis.adminStaffAccess={role:'administrator'};
  assert.equal((await requireAdministrator(req,'users.manage')).access.role,'administrator');
  globalThis.adminVerifiedAccount={...account,email_verified:false};
  await assert.rejects(requireAdministrator(req),error=>error.status===403);
 } finally {if(old===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=old;delete globalThis.adminVerifiedAccount;delete globalThis.adminStaffAccess;}
 assert.throws(()=>validateStaffAccess({role:'employee',permissions:['users.manage']}));
 assert.deepEqual(validateStaffAccess({role:'user',permissions:['products.edit']}).permissions,[]);
 assert.deepEqual(validateStaffAccess({role:'employee',permissions:['products.edit']}).permissions,['products.edit','products.view']);
 });

const statusStoreSource=compile(await readFile('lib/admin-store.ts','utf8')).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./admin-model"',JSON.stringify(modelUrl)).replace('"./category-settings"',JSON.stringify(url('export async function readCategorySettings(){return {categories:[],homeLimit:0};}')));
const statusSource=compile(await readFile("lib/admin-product-status.ts","utf8")).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve("firebase-admin/firestore"))).replace('"./admin-model"',JSON.stringify(modelUrl)).replace('"./admin-store"',JSON.stringify(url(statusStoreSource)));
const {setAdminProductActive}=await import(url(statusSource));
test('status toggle preserves product data, rejects stale revisions and records audit',async()=>{
 let data={name:'Produto',adminRevision:2,isActive:false,is_active:false,imageUrl:'legacy-image',offers:[{id:'offer',priceCents:1000,is_available:true}],specs:[],categorySlug:'celulares',meta_title:'SEO'};
 const audits=[];
 const db={collection:kind=>({doc:id=>({kind,id})}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>data}),update:(_ref,patch)=>{data={...data,...patch};},create:(_ref,entry)=>audits.push(entry)})};
 const result=await setAdminProductActive(db,{uid:'owner'},'product',{revision:2,isActive:true});
 assert.equal(result.isActive,true);assert.equal(result.revision,3);assert.equal(data.is_active,true);
 assert.equal(data.imageUrl,'legacy-image');assert.equal(data.meta_title,'SEO');assert.equal(data.offers[0].priceCents,1000);
 assert.equal(audits.length,1);assert.equal(audits[0].action,'product.status');
 await assert.rejects(setAdminProductActive(db,{uid:'owner'},'product',{revision:2,isActive:false}),error=>error.status===409);
 assert.equal(data.isActive,true);assert.equal(audits.length,1);
 await assert.rejects(setAdminProductActive(db,{uid:'owner'},'product',{revision:3,isActive:'true'}));
});

const priceSource=compile(await readFile('lib/admin-price-update.ts','utf8')).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./admin-model"',JSON.stringify(modelUrl));
const {saveRefreshedPrice}=await import(url(priceSource));
test('refresh only changes selected offer, keeps affiliate and records changed prices atomically',async()=>{
 let data={name:'Manual',adminRevision:1,isActive:true,imageUrl:'image',specs:[{key:'manual'}],offers:[{id:'a',storeId:'amazon',url:'affiliate',priceCents:10000,price:100,is_available:true},{id:'b',storeId:'other',url:'other',priceCents:15000,is_available:true}],bestPriceCents:10000};
 const histories=[];
 const db={doc:id=>({id}),collection:kind=>({doc:()=>({kind})}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>data}),update:(_ref,patch)=>{data={...data,...patch};},create:(ref,entry)=>{if(ref.kind==='priceHistory')histories.push(entry);}})};
 assert.equal((await saveRefreshedPrice(db,{uid:'owner'},'p','a','affiliate',90,10000)).changed,true);
 assert.equal(data.name,'Manual');assert.equal(data.imageUrl,'image');assert.equal(data.specs[0].key,'manual');assert.equal(data.isActive,true);
 assert.equal(data.offers[0].url,'affiliate');assert.equal(data.offers[1].priceCents,15000);assert.equal(data.bestPriceCents,9000);
 assert.equal(histories.length,1);assert.equal(histories[0].previousPriceCents,10000);
 assert.equal((await saveRefreshedPrice(db,{uid:'owner'},'p','a','affiliate',90,9000)).changed,false);assert.equal(histories.length,1);
 assert.equal((await saveRefreshedPrice(db,{uid:'owner'},'p','a','affiliate',null,9000)).changed,false);assert.equal(data.bestPriceCents,9000);
 await assert.rejects(saveRefreshedPrice(db,{uid:'owner'},'p','a','changed-url',80,9000),error=>error.status===409);
 await assert.rejects(saveRefreshedPrice(db,{uid:'owner'},'p','a','affiliate',80,10000),error=>error.status===409);
});

test('replacement source identifiers survive validation and reject invalid identifiers',()=>{
 const offer={storeId:'amazon',price:10,url:'https://www.amazon.com.br/dp/B0F48L2CZS',available:true,externalId:'B0F48L2CZS'};
 assert.equal(validateAdminProduct({...product,offers:[offer]}).offers[0].externalId,'B0F48L2CZS');
 assert.equal(validateAdminProduct({...product,offers:[{...offer,externalId:'item-MLB5210551559'}]}).offers[0].externalId,'item-MLB5210551559');
 assert.throws(()=>validateAdminProduct({...product,offers:[{...offer,externalId:'../bad'}]}));
});
const storeSource=compile(await readFile('lib/admin-store.ts','utf8')).replace('"firebase-admin/firestore"',JSON.stringify(import.meta.resolve('firebase-admin/firestore'))).replace('"./admin-model"',JSON.stringify(modelUrl)).replace('"./category-settings"',JSON.stringify(url('export function readCategorySettings(){return {};}')));
const {saveAdminProduct,deleteAdminProduct}=await import(url(storeSource));
test('saving replacement keeps product identity and other offers, updates source and price history',async()=>{
 let data={adminRevision:0,name:'Old',offers:[{id:'a',storeId:'amazon',url:'https://www.amazon.com.br/dp/B000000001',external_id:'B000000001',priceCents:1000,is_available:true},{id:'b',storeId:'other',url:'https://shop.example/product',priceCents:1200,is_available:true}]};
 const histories=[];
 const db={collection:kind=>({doc:id=>({kind,id}),where:()=>({limit:()=>({query:true})})}),runTransaction:async fn=>fn({get:async ref=>ref.query?{empty:false,docs:[{id:'category',data:()=>({})}]}:{exists:true,data:()=>data},getAll:async(...refs)=>refs.map(ref=>({exists:true,id:ref.id,data:()=>({name:ref.id})})),set:(_ref,patch)=>{data={...data,...patch};},create:(ref,value)=>{if(ref.kind==='priceHistory')histories.push(value);}})};
 const offers=[{id:'a',storeId:'amazon',url:'https://www.amazon.com.br/dp/B000000002',externalId:'B000000002',price:11,available:true},{id:'b',storeId:'other',url:'https://shop.example/product',price:12,available:true}];
 const saved=await saveAdminProduct(db,{uid:'owner'},{...product,name:'New',offers},false);
 assert.equal(saved.id,product.id);assert.equal(saved.revision,1);assert.equal(data.offers[0].external_id,'B000000002');assert.equal(data.offers[0].id,'a');assert.equal(data.offers[1].url,offers[1].url);assert.equal(histories.length,1);assert.equal(histories[0].priceCents,1100);
});

test('first successful unchanged price check creates one baseline without fake earlier prices',async()=>{
 let baseline=null;
 let data={name:'Product',offers:[{id:'a',storeId:'amazon',url:'url',priceCents:10000,price:100,is_available:true}],adminRevision:1};
 const db={doc:id=>({id}),collection:kind=>({doc:()=>({kind})}),runTransaction:async fn=>fn({get:async ref=>ref.id.startsWith('priceHistory/')?{exists:!!baseline,data:()=>baseline}:{exists:true,data:()=>data},update:(_ref,patch)=>{data={...data,...patch};},create:(ref,value)=>{if(ref.id?.startsWith('priceHistory/')){assert.equal(baseline,null);baseline=value;}}})};
 assert.equal((await saveRefreshedPrice(db,{uid:'owner'},'p','a','url',100,10000)).changed,false);
 assert.equal(baseline.priceCents,10000);assert.equal(baseline.source,'admin-baseline');assert.ok(Date.parse(baseline.recorded_at));
 const first=baseline;
 await saveRefreshedPrice(db,{uid:'owner'},'p','a','url',100,10000);assert.equal(baseline,first);
});

test('product deletion checks revision and atomically removes product and collector links with audit',async()=>{
  const removed=[],audits=[];
  const productRef={kind:'products',id:'teste'};
  const db={collection:kind=>({doc:id=>kind==='products'?productRef:{kind,id},where:()=>({query:true})}),runTransaction:async run=>run({
    get:async ref=>ref.query?{size:2,docs:[{ref:{id:'amazon-old'}},{ref:{id:'ml-old'}}]}:{exists:true,data:()=>({name:'Teste',adminRevision:2})},
    delete:ref=>removed.push(ref.id),create:(_ref,entry)=>audits.push(entry)
  })};
  await assert.rejects(()=>deleteAdminProduct(db,account,'teste',1),error=>error.status===409);
  await assert.rejects(()=>deleteAdminProduct(db,account,'../teste',2));
  assert.deepEqual(removed,[]);
  assert.deepEqual(await deleteAdminProduct(db,account,'teste',2),{id:'teste',name:'Teste'});
  assert.deepEqual(removed,['amazon-old','ml-old','teste']);
  assert.equal(audits[0].action,'product.delete');assert.equal(audits[0].actorUid,account.uid);
  db.runTransaction=async run=>run({get:async()=>({exists:false})});
  await assert.rejects(()=>deleteAdminProduct(db,account,'teste',2),error=>error.status===404);
});
