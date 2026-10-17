import {test,expect} from "@playwright/test";
import {createRequire} from "node:module";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
const root=process.cwd();const fixture=path.join(root,"test-results","price-history-fixture");let bundle:string;let css:string;
test.beforeAll(async () => {
  await mkdir(fixture, { recursive: true });
  const loadPackage = createRequire(path.join(root, "package.json"));
  const { webpack } = loadPackage("next/dist/compiled/webpack/webpack");
  await writeFile(path.join(fixture, "navigation.js"), "export function useSearchParams(){return new URLSearchParams();}");
  await writeFile(path.join(fixture, "image.js"), "import React from 'react';export default function Image({src,alt,fill,style,onError,sizes,loading}){return React.createElement('img',{src,alt,onError,sizes,loading,style:{...style,...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{})}});}");
  await writeFile(path.join(fixture, "entry.js"), `import React from 'react';import {createRoot} from 'react-dom/client';import {PriceHistoryChart} from ${JSON.stringify(path.join(root, "app/components/price-history-chart.tsx"))};const now=Date.now();const points=Array.from({length:8},(_,index)=>({date:new Date(now-index*2*86400000).toISOString(),price:100+index,storeId:'a'}));points.push({date:points[0].date,price:200,storeId:'b'});createRoot(document.getElementById('root')).render(React.createElement(PriceHistoryChart,{points,stores:[{id:'a',name:'Amazon'},{id:'b',name:'Mercado Livre'}]}));`);
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

test("unified history shows one curve, real daily averages and keyboard details on desktop and mobile",async({page})=>{
 await page.route("http://price-fixture.test/**",route=>route.request().url().endsWith(".js")?route.fulfill({contentType:"text/javascript; charset=utf-8",body:bundle}):route.fulfill({contentType:"text/html",body:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main style="max-width:1000px;margin:auto;padding:16px"><div id="root"></div></main><script src="/bundle.js"></script>`}));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto("http://price-fixture.test/");
  await expect(page.locator("svg polyline")).toHaveCount(1);await expect(page.locator("svg circle")).toHaveCount(8);
  await expect(page.getByText("Inteligência de preços · Comparacel Radar")).toBeVisible();
  await expect(page.locator(".price-intelligence-grid > div").filter({hasText:"Média em 30 dias"})).toContainText("103,50");
  await page.locator("svg circle").first().focus();await page.keyboard.press("Enter");await expect(page.locator(".price-history-selection")).toContainText("Amazon");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
