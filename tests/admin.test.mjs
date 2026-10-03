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
const authUrl = url('export function getAdminAuth(){return {verifyIdToken: async (token, revoked) => {globalThis.adminCheckedRevoked=revoked;if(token!=="valid")throw new Error("invalid");return globalThis.adminVerifiedAccount;}}}');
const apiSource = compile(await readFile('lib/admin-api.ts', 'utf8')).replace('import "server-only";', '').replace('"next/server"', JSON.stringify(import.meta.resolve('next/server.js'))).replace('"./firebase/admin"', JSON.stringify(authUrl)).replace('"./admin-model"', JSON.stringify(modelUrl));
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
