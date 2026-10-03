import { test, expect } from '@playwright/test';

test('sitemap e robots incluem páginas públicas e preservam caminhos antigos', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  expect(urls.filter(url => url.includes('/produto/')).length).toBeGreaterThan(200);
  expect(urls).toContain('https://comparacel.com.br/notebooks');
  expect(urls.some(url => url.includes('/marca/'))).toBe(true);
  expect(urls.some(url => /\/(minha-conta|perfil|api|blog)/.test(url))).toBe(false);
  expect(new Set(urls).size).toBe(urls.length);
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain('Sitemap: https://comparacel.com.br/sitemap.xml');
  expect(await robots.text()).toContain('Disallow: /api/');
  const pair = urls.find(url => url.includes('/comparar/'))!;
  expect(pair).toBeTruthy();
  const legacy = await request.get(new URL(pair).pathname.replace('/comparar/', '/compare/'), { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers().location).toBe(new URL(pair).pathname);
  const oldList = await request.get('/comparacoes', { maxRedirects: 0 });
  expect(oldList.headers().location).toBe('/comunidade');
});

test('produto entrega ficha, canonical, imagem social e JSON-LD sem JavaScript', async ({ browser, request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const path = new URL([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].find(match => match[1].includes('/produto/'))![1]).pathname;
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: 'facebookexternalhit/1.1', baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  const response = await page.goto(path);
  expect(response!.status()).toBe(200);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ficha técnica completa' })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://comparacel.com.br${path}`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://comparacel.com.br${path}`);
  const title = await page.title();
  expect(title).toContain('preços e ficha técnica');
  const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent!)));
  expect(schemas.some(schema => schema['@type'] === 'Product' && schema.name)).toBe(true);
  expect(schemas.some(schema => schema['@type'] === 'BreadcrumbList')).toBe(true);
  expect(schemas.find(schema => schema['@type'] === 'Product').aggregateRating).toBeUndefined();
  await expect(page.locator('noscript iframe')).toHaveAttribute('src', /GTM-PN53J4BW/);
  await context.close();
});

test('categoria tem conteúdo inicial, páginas inválidas retornam 404 e conta usa noindex', async ({ page, request }) => {
  await page.goto('/notebooks');
  await expect(page.getByRole('heading', { level: 1, name: 'Notebooks', exact: true })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://comparacel.com.br/notebooks');
  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as Window & { dataLayer?: {event:string;page_path:string}[] }).dataLayer?.some(item => item.event === 'comparacel_page_view' && item.page_path === '/notebooks'))).toBe(true);
  await expect(page.locator('script[src*="gtm.js?id=GTM-PN53J4BW"]')).toHaveCount(1);
  expect(await page.evaluate(() => (window as Window & { dataLayer?: {event:string;page_path:string}[] }).dataLayer?.filter(item => item.event === 'comparacel_page_view' && item.page_path === '/notebooks').length)).toBe(1);
  await page.getByRole('navigation').getByRole('link', { name: 'Início' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { dataLayer?: {event:string;page_path:string}[] }).dataLayer?.some(item => item.event === 'comparacel_page_view' && item.page_path === '/'))).toBe(true);
  const invalid = await request.get('/produto/produto-inexistente', { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  expect(invalid.status()).toBe(404);
  const account = await request.get('/minha-conta', { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  expect(await account.text()).toMatch(/name="robots" content="noindex, nofollow"/);
});


test('comparação entrega metadados e ficha sem JavaScript e normaliza pares invertidos', async ({ browser, request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const url = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].find(match => match[1].includes('/comparar/'))![1];
  const path = new URL(url).pathname;
  const context = await browser.newContext({ javaScriptEnabled: false, userAgent: 'facebookexternalhit/1.1', baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
  await expect(page.locator('.compare-product h2')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'O que muda entre eles?' })).toBeVisible();
  expect(await page.title()).toContain(' vs ');
  const ids = path.replace('/comparar/', '').split('-vs-');
  const reversed = await request.get(`/comparar/${ids.reverse().join('-vs-')}`, { maxRedirects: 0, headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  expect(reversed.status()).toBe(308);
  expect(reversed.headers().location).toBe(path);
  await context.close();
});
