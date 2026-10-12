import { test, expect, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function events(page: Page, event: string) {
  return page.evaluate(name => (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer?.filter(item => item.event === name) ?? [], event);
}

test('oferta do card preserva URL e registra uma impressão e um clique por interação', async ({ page }) => {
  await page.goto('/notebooks');
  const link = page.locator('.product-card a[data-affiliate-link]').first();
  await expect(link).toBeVisible();
  await link.scrollIntoViewIfNeeded();
  const id = await link.getAttribute('data-offer-id');
  const productId = await link.getAttribute('data-product-id');
  await expect.poll(async () => (await events(page, 'offer_view')).filter(item => item.offer_id === id && item.product_id === productId).length).toBe(1);
  const url = await link.getAttribute('href');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer sponsored');
  await link.evaluate(element => element.addEventListener('click', event => event.preventDefault()));
  await link.click();
  const clicks = await events(page, 'affiliate_click');
  expect(clicks).toHaveLength(1);
  expect(clicks[0]).toMatchObject({ offer_id: id, page_type: 'category', button_position: 'product_card' });
  await expect(link).toHaveAttribute('href', url!);
  await page.getByRole('textbox', { name: 'Buscar produto', exact: true }).fill(await link.getAttribute('data-product-name') ?? '');
  await link.focus();
  await page.keyboard.press('Enter');
  expect(await events(page, 'affiliate_click')).toHaveLength(2);
  expect((await events(page, 'affiliate_click'))[1].page_type).toBe('search');
  await page.getByRole('combobox', { name: 'Ordenar', exact: true }).selectOption('price');
  await expect.poll(async () => (await events(page, 'offer_view')).filter(item => item.offer_id === id && item.product_id === productId).length).toBe(1);
});

test('produto mostra compra, transparência e FAQ; barra mobile cede espaço à comparação', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/notebooks');
  const card = page.locator('.product-card').filter({ has: page.locator('a[data-affiliate-link]') }).first();
  const path = await card.locator('h3 a').getAttribute('href');
  await page.goto(path!);
  await expect(page.locator('.detail-purchase-actions a[data-affiliate-link]')).toBeVisible();
  await expect.poll(async () => (await events(page, 'product_view')).length).toBe(1);
  await expect(page.locator('.mobile-offer-bar')).toBeVisible();
  await page.screenshot({ path: 'test-results/cro-product-mobile-viewport.png' });
  await expect(page.locator('.offers .affiliate-disclosure')).toContainText('sem custo adicional');
  const offerId = await page.locator('.detail-purchase-actions a[data-affiliate-link]').getAttribute('data-offer-id');
  await page.locator('#ofertas-produto').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await events(page, 'offer_view')).filter(item => item.offer_id === offerId).length).toBe(1);
  await page.locator('#duvidas-produto summary').first().click();
  await expect(page.locator('#duvidas-produto details').first()).toHaveAttribute('open', '');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Adicionar à comparação', exact: true }).click();
  await expect(page.locator('.comparison-bar')).toBeVisible();
  await expect(page.locator('.mobile-offer-bar')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/cro-product-mobile.png', fullPage: true });
});

test('comparação oferece escolha orientada por dados e eventos sem duplicação', async ({ page }) => {
  await page.goto('/notebooks');
  const paths = await page.locator('.product-card h3 a').evaluateAll(links => links.slice(0, 2).map(link => link.getAttribute('href')!.split('/').at(-1)!));
  await page.goto(`/comparar/${paths.sort().join('-vs-')}`);
  await expect(page.getByRole('heading', { name: 'Qual produto escolher?' })).toBeVisible();
  await expect.poll(async () => (await events(page, 'comparison_view')).length).toBe(1);
  await expect(page.locator('.compare-product a[data-affiliate-link]').first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#ofertas').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/cro-comparison-mobile.png', fullPage: true });
  expect(await events(page, 'comparison_view')).toHaveLength(1);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
