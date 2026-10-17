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
const seoPage = { path: "/produto/teste", kind: "product", name: "Produto de teste", active: true, fields: original, fingerprint: "fixture", score: 50, issues: [], current: null, previous: null, performance: "Sem dados no período" };

test.beforeAll(async () => {
  await mkdir(fixture, { recursive: true });
  const loadPackage = createRequire(path.join(root, "package.json"));
  const { webpack } = loadPackage("next/dist/compiled/webpack/webpack");
  await writeFile(path.join(fixture, "navigation.js"), "export function useSearchParams(){return new URLSearchParams();}");
  await writeFile(path.join(fixture, "entry.js"), `import React from 'react';import {createRoot} from 'react-dom/client';import {AdminSeo} from ${JSON.stringify(path.join(root, "app/components/admin-seo.tsx"))};const user={uid:'fixture',getIdToken:async()=> 'fixture-token'};createRoot(document.getElementById('root')).render(React.createElement(AdminSeo,{user,onSaved:async()=>{},canConnect:true}));`);
  await writeFile(path.join(fixture, "ts-loader.cjs"), `const ts=require(${JSON.stringify(loadPackage.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
  await new Promise<void>((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, context: root, entry: path.join(fixture, "entry.js"), output: { path: fixture, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": root, "next/navigation": path.join(fixture, "navigation.js") }, modules: [path.join(root, "node_modules")] }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: { loader: path.join(fixture, "ts-loader.cjs") } }] } });
    compiler.run((error: Error | null, stats: { hasErrors(): boolean; toString(): string }) => {
      compiler.close(() => {});
      if (error || stats?.hasErrors()) reject(error || new Error(stats.toString())); else resolve();
    });
  });
  bundle = await readFile(path.join(fixture, "bundle.js"), "utf8");
  css = (await readFile(path.join(root, "app/globals.css"), "utf8")).replace('@import "tailwindcss";', "");
});

async function setup(page: Page, response: { status: number; body: object }) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let published = 0;
  await page.route("http://seo-fixture.test/**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") published++;
    if (url.pathname === "/bundle.js") return route.fulfill({ contentType: "application/javascript; charset=utf-8", body: bundle });
    if (url.pathname === "/api/admin/seo/generate") { await gate; return route.fulfill({ status: response.status, json: response.body }); }
    if (url.pathname === "/api/admin/seo/page") return route.fulfill({ json: { page: seoPage, queries: [], history: [] } });
    if (url.pathname === "/api/admin/seo") return route.fulfill({ json: { connection: { connected: true, oauthAvailable: true }, pages: [seoPage], snapshot: null, searchConfigured: true, geminiConfigured: true, truncated: false } });
    return route.fulfill({ contentType: "text/html", body: `<html><head><meta charset="utf-8"><style>${css}</style></head><body><main class="admin-page"><aside>Administração</aside><div id="root"></div></main><script src="/bundle.js"></script></body></html>` });
  });
  await page.goto("http://seo-fixture.test/");
  await page.getByRole("button", { name: "Revisar SEO de Produto de teste" }).click();
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
