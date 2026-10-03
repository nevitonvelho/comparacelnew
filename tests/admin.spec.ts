import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function mockAdministrator(page: Page) {
  // Browser-only fixture. Every administrative request is intercepted;
  // this identity cannot authorize any real server write.
  const config = await readFile('.env.example', 'utf8');
  const apiKey = config.match(/^NEXT_PUBLIC_FIREBASE_API_KEY=(.*)$/m)![1];
  const now = Math.floor(Date.now() / 1000);
  const token = [Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: 'test-admin', user_id: 'test-admin', email: 'admin@example.com', email_verified: true, iat: now, auth_time: now, exp: now + 3600, firebase: { sign_in_provider: 'google.com', identities: { 'google.com': ['admin@example.com'] } } })).toString('base64url'), 'test-only'].join('.');
  await page.addInitScript(({ apiKey, token }) => localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({ uid: 'test-admin', email: 'admin@example.com', emailVerified: true, displayName: 'Administrador', isAnonymous: false, providerData: [{ providerId: 'google.com', uid: 'test-admin', displayName: 'Administrador', email: 'admin@example.com', photoURL: null }], stsTokenManager: { refreshToken: 'test-only', accessToken: token, expirationTime: Date.now() + 3600000 }, createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]' })), { apiKey, token });
  await page.route('**/identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { users: [{ localId: 'test-admin', email: 'admin@example.com', emailVerified: true, displayName: 'Administrador', providerUserInfo: [{ providerId: 'google.com', rawId: 'test-admin', email: 'admin@example.com', displayName: 'Administrador' }] }] } }));
  await page.route('**/firestore.googleapis.com/**', route => route.abort());
  const products = [{ id: 'cafeteira-painel', revision: 0, name: 'Cafeteira do painel', description: '', brandId: 'marca', category: 'cafeteiras', imageUrl: '', isActive: true, overallScore: 7, metaTitle: '', metaDescription: '', specs: [], offers: [{ id: 'offer', storeId: 'loja', price: 200, url: 'https://shop.example/product', available: true }], highlights: [] }];
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/admin/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/import')) {
      const body = request.postDataJSON(); submitted.push(body);
      const isSecond = body.line.includes('B098765432');
      if (isSecond && submitted.filter(item => String(item.line).includes('B098765432')).length === 1) return route.fulfill({ status: 502, json: {error: 'A fonte recusou o acesso.'} });
      return route.fulfill({json: {product: {...products[0], name: isSecond ? 'Segundo produto importado' : 'Primeiro produto importado'}, created: true, warnings: []}});
    }
    if (path.endsWith('/session')) return route.fulfill({ json: { uid: 'test-admin', email: 'admin@example.com' } });
    if (path.endsWith('/dashboard')) return route.fulfill({ json: { total: products.length, active: products.filter(product => product.isActive).length, noImage: products.length, noPrice: 0, productViews: 123, comparisonViews: 45, reactions: 9, offers: 1, audit: [] } });
    if (path.endsWith('/products') && request.method() === 'GET') return route.fulfill({ json: { products, brands: [{ id: 'marca', name: 'Marca de teste', slug: 'marca' }], stores: [{ id: 'loja', name: 'Loja de teste', slug: 'loja' }], categories: [{ id: 'cafeteiras', name: 'Cafeteiras' }] } });
    if (path.includes('/products') && ['POST', 'PATCH'].includes(request.method())) {
      const body = request.postDataJSON();
      submitted.push(body);
      const product = { ...body, revision: body.revision + 1 };
      const index = products.findIndex(item => item.id === product.id);
      if (index >= 0) products[index] = product; else products.push(product);
      return route.fulfill({ json: { product } });
    }
    return route.fulfill({ status: 400, json: { error: 'Operação de teste não implementada.' } });
  });
  return submitted;
}

test('admin bloqueia visitantes e API não aceita gravação sem credenciais', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Seu catálogo, em um só lugar.' })).toBeVisible();
  const response = await request.post('/api/admin/products', { headers: { Origin: 'http://localhost:3000' }, data: { name: 'Não gravar' } });
  expect(response.status()).toBe(401);
  const foreign = await request.post('/api/admin/upload', { headers: { Origin: 'https://foreign.example' } });
  expect(foreign.status()).toBe(403);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin edita preço e ficha técnica, cria rascunho e funciona no celular', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const submitted = await mockAdministrator(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: 'test-results/admin-dashboard.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Painel administrativo' }).getByRole('button', { name: /Produtos/ }).click();
  await page.getByRole('button', { name: 'Editar Cafeteira do painel' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Cafeteira compacta');
  await page.getByLabel('Preço da oferta 1').fill('129.90');
  await page.getByRole('button', { name: 'Adicionar característica' }).click();
  await page.getByLabel('Nome da característica 1').fill('Potência');
  await page.getByLabel('Grupo da característica 1').fill('Energia');
  await page.getByLabel('Tipo da característica 1').selectOption('number');
  await page.getByLabel('Valor da característica 1').fill('1000');
  await page.getByLabel('Unidade da característica 1').fill('W');
  await page.getByLabel('Vantagem da característica 1').selectOption('true');
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText('Produto salvo com sucesso.')).toBeVisible();
  expect(submitted[0].name).toBe('Cafeteira compacta');
  expect((submitted[0].offers as { price: number }[])[0].price).toBe(129.9);
  expect((submitted[0].specs as { slug: string; higherIsBetter: boolean }[])[0]).toMatchObject({ slug: 'potencia', higherIsBetter: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: 'test-results/admin-editor-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Voltar aos produtos' }).click();
  await page.getByRole('button', { name: 'Novo produto' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Nova cafeteira');
  await expect(page.getByLabel('Produto ativo no site')).not.toBeChecked();
  await page.getByRole('button', { name: 'Salvar produto' }).click();
  await expect(page.getByText('Produto salvo com sucesso.')).toBeVisible();
  expect(submitted[1]).toMatchObject({ id: 'nova-cafeteira', isActive: false, revision: 0 });
  expect(errors).toEqual([]);
});


test('admin importa arquivo de links, mostra falhas e repete somente os itens com erro', async ({ page, request }) => {
  const submitted = await mockAdministrator(page);
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Painel administrativo' }).getByRole('button', { name: 'Importar em massa' }).click();
  await page.getByLabel('Arquivo de links (.txt)').setInputFiles({name:'produtos.txt',mimeType:'text/plain',buffer:Buffer.from('# lista\nhttps://www.amazon.com.br/dp/B012345678?tag=owner\nhttps://www.amazon.com.br/dp/B098765432\nhttps://www.amazon.com.br/dp/B012345678?tag=owner')});
  await page.getByRole('button', {name:'Iniciar importação'}).click();
  await expect(page.getByText('Lote concluído.', {exact:false})).toBeVisible({timeout:30000});
  await expect(page.getByText('1 criados', {exact:true})).toBeVisible();
  await expect(page.getByText('1 falhas', {exact:true})).toBeVisible();
  expect(submitted).toHaveLength(2);
  expect(submitted[0]).toMatchObject({source:'amazon',category:'cafeteiras',downloadImages:true,line:'https://www.amazon.com.br/dp/B012345678?tag=owner'});
  await page.getByRole('button', {name:'Repetir itens com falha'}).click();
  await expect(page.getByText('0 falhas', {exact:true})).toBeVisible({timeout:30000});
  expect(submitted).toHaveLength(3);
  expect(submitted[2].line).toContain('B098765432');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('heading', {level:1,name:'Importar em massa'})).toBeVisible();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({path:'test-results/admin-import-mobile.png',fullPage:true});
  const unauthorized = await request.post('/api/admin/import', {headers:{Origin:'http://localhost:3000'},data:{source:'amazon'}});
  expect(unauthorized.status()).toBe(401);
});


test('admin aceita um link meli.la sozinho e envia a fonte correta', async ({ page }) => {
  const submitted = await mockAdministrator(page);
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Painel administrativo' }).getByRole('button', { name: 'Importar em massa' }).click();
  await page.getByRole('combobox',{name:'Fonte',exact:true}).selectOption('mercadolivre');
  await page.getByLabel('Links dos produtos').fill('https://meli.la/31EQLJ3');
  await page.getByRole('button',{name:'Iniciar importação'}).click();
  await expect(page.getByText('Lote concluído.',{exact:false})).toBeVisible();
  expect(submitted[0]).toMatchObject({source:'mercadolivre',line:'https://meli.la/31EQLJ3'});
});

test('atributo inserido por extensão no body não causa aviso de hidratação', async ({page}) => {
  const hydration: string[] = [];
  page.on('console',message=>{if(message.type()==='error' && /hydrat|server rendered HTML/i.test(message.text())) hydration.push(message.text());});
  await mockAdministrator(page);
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => { if (document.body) { document.body.setAttribute('cz-shortcut-listen','true'); observer.disconnect(); } });
    observer.observe(document.documentElement ?? document, {childList:true,subtree:true});
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading',{level:1,name:'Visão geral'})).toBeVisible({timeout:30000});
  await expect(page.locator('body')).toHaveAttribute('cz-shortcut-listen','true');
  expect(hydration).toEqual([]);
});
