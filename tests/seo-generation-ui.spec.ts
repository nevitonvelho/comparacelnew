import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const fixture = path.join(root, "test-results", "seo-generation-fixture");
let bundle: string;
let css: string;
const original = { title: "Título atual do produto", metaDescription: "Descrição atual da ficha do produto para comparação.", description: "Conteúdo original que deve ser preservado.", tags: ["Tela"] };
const suggestion = { title: "Título sugerido para revisão", metaDescription: "Metadescrição sugerida com informações do cadastro para ajudar a comparar o produto.", description: "Descrição sugerida para revisão humana antes de aplicar.", tags: ["Produto"] };
const seoPage = { products: [{ id: "teste", name: "Produto de teste", imageUrl: "/fixture-product.svg" }], path: "/produto/teste", kind: "product", name: "Produto de teste", active: true, fields: original, fingerprint: "fixture", score: 50, issues: [], current: null, previous: null, performance: "Sem dados no período" };

test.beforeAll(async () => {
  await mkdir(fixture, { recursive: true });
  const loadPackage = createRequire(path.join(root, "package.json"));
  const { webpack } = loadPackage("next/dist/compiled/webpack/webpack");
  await writeFile(path.join(fixture, "navigation.js"), "export function useSearchParams(){return new URLSearchParams();}");
  await writeFile(path.join(fixture, "image.js"), "import React from 'react';export default function Image({src,alt,fill,style,onError,sizes,loading}){return React.createElement('img',{src,alt,onError,sizes,loading,style:{...style,...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{})}});}");
  await writeFile(path.join(fixture, "entry.js"), `import React from 'react';import {createRoot} from 'react-dom/client';import {AdminSeo} from ${JSON.stringify(path.join(root, "app/components/admin-seo.tsx"))};const user={uid:'fixture',getIdToken:async()=> 'fixture-token'};createRoot(document.getElementById('root')).render(React.createElement(AdminSeo,{user,onSaved:async()=>{},canConnect:true}));`);
  await writeFile(path.join(fixture, "ts-loader.cjs"), `const ts=require(${JSON.stringify(loadPackage.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, context: root, entry: path.join(fixture, "entry.js"), output: { path: fixture, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root, "next/navigation": path.join(fixture, "navigation.js"), "next/image": path.join(fixture, "image.js") }, modules: [path.join(root, "node_modules")] }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: { loader: path.join(fixture, "ts-loader.cjs") } }] } });
    compiler.run((error: Error | null, stats: { hasErrors(): boolean; toString(): string }) => {
      compiler.close(() => {});
      if (error || stats?.hasErrors()) reject(error || new Error(stats.toString())); else resolve();
    });
  });
  bundle = await readFile(path.join(fixture, "bundle.js"), "utf8");
  css = (await readFile(path.join(root, "app/globals.css"), "utf8")).replace('@import "tailwindcss";', "");
});

async function setup(page: Page, response: { status: number; body: object }, pages = [seoPage]) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let published = 0;
  await page.route("http://seo-fixture.test/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") published++;
    if (url.pathname.endsWith(".svg")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect x="4" y="2" width="32" height="56" rx="5" fill="#0061e8"/></svg>' });
    if (url.pathname === "/bundle.js") return route.fulfill({ contentType: "application/javascript; charset=utf-8", body: bundle });
    if (url.pathname === "/api/admin/seo/generate") { await gate; return route.fulfill({ status: response.status, json: response.body }); }
    if (url.pathname === "/api/admin/seo/page") return route.fulfill({ json: { page: seoPage, queries: [], history: [] } });
    if (url.pathname === "/api/admin/seo") return route.fulfill({ json: { connection: { connected: true, oauthAvailable: true }, pages, snapshot: null, searchConfigured: true, geminiConfigured: true, truncated: false } });
    return route.fulfill({ contentType: "text/html", body: `<html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="admin-page"><aside>Administração</aside><div id="root"></div></main><script src="/bundle.js"></script></body></html>` });
  });
  await page.goto("http://seo-fixture.test/");
  await page.locator(".seo-table tbody tr").first().getByRole("button", { name: /^Revisar SEO de/ }).click();
  return { release, published: () => published };
}

test("generation shows loading beside its button and preserves edits after timeout", async ({ page }) => {
  const request = await setup(page, { status: 504, body: { error: "O Gemini excedeu o tempo de resposta." } });
  const draft = page.locator(".seo-draft-fields textarea").first();
  await draft.fill("Minha edição ainda não aplicada");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Gerar sugestão com Gemini" }).click();
  await expect(page.getByRole("button", { name: "Gerando sugestão…" })).toBeDisabled();
  await expect(page.locator(".seo-editor-feedback")).toContainText("Gerando sugestão com Gemini");
  await expect(page.locator(".seo-draft-skeleton")).toBeVisible();
  await expect(page.locator(".seo-draft-fields")).toHaveAttribute("aria-busy", "true");
  request.release();
  await expect(page.locator(".seo-editor-feedback [role=alert]")).toContainText("O Gemini excedeu");
  await expect(page.getByRole("button", { name: "Tentar gerar novamente" })).toBeEnabled();
  await expect(draft).toHaveValue("Minha edição ainda não aplicada");
  expect(request.published()).toBe(0);
});

test("successful generation fills review fields and confirms it has not been published", async ({ page }) => {
  const request = await setup(page, { status: 200, body: { fields: suggestion, model: "fixture-gemini" } });
  await page.getByRole("button", { name: "Gerar sugestão com Gemini" }).click();
  await expect(page.locator(".seo-draft-skeleton")).toBeVisible();
  request.release();
  await expect(page.locator(".seo-draft-fields textarea").first()).toHaveValue(suggestion.title);
  await expect(page.locator(".seo-editor-feedback [role=status]")).toContainText("nada foi aplicado");
  await expect(page.getByRole("button", { name: "Aplicar conteúdo revisado" })).toBeEnabled();
  expect(request.published()).toBe(0);
});


test("SEO rows show product images and keep long names compact on desktop and mobile", async ({ page }) => {
  const longName = "Ar-Condicionado Split HW Inverter Springer Midea Xtreme Save Connect 9.000 BTUs R-32 Só Frio 220V";
  const comparison = { ...seoPage, path: "/comparar/a-vs-b", kind: "comparison", name: `${longName} vs Outro produto com nome longo`, products: [{ id: "a", name: longName, imageUrl: "/fixture-product.svg" }, { id: "b", name: "Outro produto", imageUrl: "/fixture-product-b.svg" }] };
  await setup(page, { status: 200, body: {} }, [{ ...seoPage, name: longName }, comparison]);
  const rows = page.locator(".seo-table tbody tr");
  await expect(rows.first().locator("img")).toHaveCount(1);
  await expect(rows.nth(1).locator("img")).toHaveCount(2);
  await expect(rows.first().locator(".seo-page-identity")).toHaveAttribute("title", longName);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    expect(dimensions.every(height => height < 115)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
