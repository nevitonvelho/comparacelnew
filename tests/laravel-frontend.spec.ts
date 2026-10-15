import { test, expect } from "@playwright/test";

const baseURL = process.env.COMPARACEL_TEST_URL || "http://localhost:3000";
test.use({ baseURL });

test.beforeEach(async ({ page }) => {
  // Browser validation must not add production visit receipts.
  await page.route("**/api/engagement", route => route.fulfill({ json: { views: 0, likes: 0 } }));
});

test("catálogo usa imagens do Laravel e conserva as ofertas públicas", async ({ request }) => {
  const response = await request.get(`${baseURL}/api/catalog`);
  expect(response.status()).toBe(200);
  const products = await response.json();
  expect(products.length).toBeGreaterThan(200);
  expect(products.some((product: { imageUrl: string | null }) => product.imageUrl?.startsWith("https://api.comparacel.com.br/api/v1/media/"))).toBe(true);
  expect(products.some((product: { imageUrl: string | null }) => product.imageUrl?.includes("firebasestorage.googleapis.com"))).toBe(false);
  expect(products.some((product: { offers: { url: string | null }[] }) => product.offers.some(offer => offer.url && /amazon|amzn\.to|mercadolivre|mercadolibre|meli\.la/.test(offer.url)))).toBe(true);
});

test("produto mantém canonical, metadados e conteúdo indexável sem JavaScript", async ({ browser, request }) => {
  const products = await (await request.get(`${baseURL}/api/catalog`)).json();
  const product = products.find((item: { imageUrl: string | null }) => item.imageUrl);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, userAgent: "facebookexternalhit/1.1" });
  const page = await context.newPage();
  const response = await page.goto(`/produto/${product.id}`);
  expect(response!.status()).toBe(200);
  await expect(page.locator("main h1")).toContainText(product.name);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://comparacel.com.br/produto/${product.id}`);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", product.imageUrl);
  await expect(page.getByRole("heading", { name: "Ficha técnica completa" })).toBeVisible();
  const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(node => JSON.parse(node.textContent!)));
  expect(schemas.some(schema => schema["@type"] === "Product" && schema.name === product.name)).toBe(true);
  const offers = await page.locator("a[data-affiliate-link]").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  for (const offer of product.offers.filter((item: { url: string | null; available: boolean }) => item.available && item.url)) expect(offers).toContain(offer.url);
  await context.close();
});

test("sitemap e redirecionamentos mantêm as URLs existentes", async ({ request }) => {
  const sitemap = await request.get(`${baseURL}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  expect(urls.filter(url => url.includes("/produto/")).length).toBeGreaterThan(200);
  expect(new Set(urls).size).toBe(urls.length);
  expect(urls).toContain("https://comparacel.com.br/notebooks");
  const pair = new URL(urls.find(url => url.includes("/comparar/"))!).pathname;
  const legacy = await request.get(`${baseURL}${pair.replace("/comparar/", "/compare/")}`, { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers().location).toBe(pair);
  expect(await (await request.get(`${baseURL}/robots.txt`)).text()).toContain("Sitemap: https://comparacel.com.br/sitemap.xml");
});

test("navegação e contadores funcionam sem chamadas ao Firestore ou Storage", async ({ page }) => {
  const errors: string[] = [], firebaseRequests: string[] = [];
  const replies: number[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/^https:\/\/(firestore|firebasestorage)\.googleapis\.com\//.test(request.url())) firebaseRequests.push(request.url()); });
  page.on("response", response => { if (new URL(response.url()).pathname === "/api/data") replies.push(response.status()); });
  await page.goto("/notebooks");
  await expect(page.locator(".product-card").first()).toBeVisible();
  await expect.poll(() => replies.filter(status => status === 200).length, { timeout: 30000 }).toBeGreaterThan(0);
  await page.locator(".product-card h3 a").first().click();
  await expect(page).toHaveURL(/\/produto\//);
  await expect(page.getByRole("heading", { name: "Ficha técnica completa" })).toBeVisible();
  expect(replies.every(status => status === 200)).toBe(true);
  expect(errors).toEqual([]);
  expect(firebaseRequests).toEqual([]);
});

test("API do navegador bloqueia acesso privado e origem externa", async ({ request }) => {
  const input = { action: "read", reference: { type: "document", path: "users/other/likedProducts/alpha" } };
  const privateRead = await request.post(`${baseURL}/api/data`, { headers: { Origin: baseURL }, data: input });
  expect(privateRead.status()).toBe(403);
  const foreign = await request.post(`${baseURL}/api/data`, { headers: { Origin: "https://example.invalid" }, data: { action: "readMany", references: [{ type: "document", path: "reactionStats/product:alpha" }] } });
  expect(foreign.status()).toBe(403);
});
