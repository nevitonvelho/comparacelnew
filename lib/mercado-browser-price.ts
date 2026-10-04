import { chromium } from "playwright-core";
import { AdminError } from "./admin-model";
import { allowedImportFetchUrl } from "./admin-import-fetch";
import { parseImportLine, type ImportEntry } from "./admin-import-model";
import { parseMercadoProduct } from "./admin-import-parser";
import { load } from "cheerio";
export function readMercadoBrowserPrice(html:string,url:string,entry:ImportEntry) {
  const resolved=parseImportLine(url,"mercadolivre");
  if(resolved.externalId!==entry.externalId || (resolved.kind ?? "catalog")!==(entry.kind ?? "catalog"))throw new AdminError("O link abriu outro produto. O preço anterior foi preservado.",502);
  const product=parseMercadoProduct(html,entry);
  if(product.price===null)throw new AdminError("A página não confirmou o preço do produto.",502);
  const $=load(html);
  const priceBlock=$('.ui-pdp-price__second-line').first();
  // Identify a payment condition only next to the extracted main price.
  const labels=priceBlock.clone();labels.find(".andes-money-amount, .andes-money-amount--previous").remove();
  const condition=/\b(?:no|via|com)\s+pix\b/i.test(labels.text())?"pix":"standard";
  return {price:product.price,condition:condition as "pix"|"standard"};
}
export async function fetchMercadoBrowserPrice(entry:ImportEntry, maximumAttempts=2) {
  const endpoint=process.env.ML_BROWSER_WS_ENDPOINT;
  const buyUrl=allowedImportFetchUrl(entry.buyUrl,"ml-link").href;
  const limit=maximumAttempts===1?1:2;
  for(let attempt=1;attempt<=limit;attempt++) {
    let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
    try {
      if(endpoint)browser=await chromium.connectOverCDP(endpoint,{timeout:15000});
      else if(process.env.VERCEL) {
        const {default:serverChromium}=await import("@sparticuz/chromium");
        serverChromium.setGraphicsMode=false;
        browser=await chromium.launch({headless:true,args:serverChromium.args,executablePath:await serverChromium.executablePath(),timeout:15000});
      } else browser=await chromium.launch({headless:true,channel:"chromium",timeout:15000});
      const context=await browser.newContext({locale:"pt-BR",timezoneId:"America/Sao_Paulo",viewport:{width:1366,height:768},extraHTTPHeaders:{"Accept-Language":"pt-BR,pt;q=0.9,en;q=0.7"}});
      await context.route('**/*',async route=>{
        const request=route.request();
        const url=new URL(request.url());
        const allowed=url.protocol==='https:' && !url.port && ['mercadolivre.com.br','mercadolibre.com','mlstatic.com'].some(host=>url.hostname===host || url.hostname.endsWith(`.${host}`)) || url.protocol==='https:' && url.hostname==='meli.la' && !url.port;
        if(!allowed || ['image','font','media'].includes(request.resourceType()))await route.abort();else await route.continue();
      });
      const page=await context.newPage();
      const response=await page.goto(buyUrl,{waitUntil:"domcontentloaded",timeout:20000});
      if(!response?.ok())throw new AdminError(`O navegador recebeu HTTP ${response?.status() ?? "sem resposta"}.`,502);
      await page.locator('.ui-pdp-title').first().waitFor({timeout:8000});
      const html=await page.content();
      if(Buffer.byteLength(html)>3*1024*1024)throw new AdminError("A página excedeu o limite de tamanho.",502);
      return {...readMercadoBrowserPrice(html,page.url(),entry),attempts:attempt};
    } catch(error) {
      if(attempt===limit)throw new AdminError(`Não foi possível confirmar o preço pelo navegador (${limit} tentativa${limit===1?"":"s"}). Último preço preservado.${error instanceof AdminError?` ${error.message}`:""}`,502);
    } finally { await browser?.close().catch(()=>{}); }
    await new Promise(resolve=>setTimeout(resolve,4100));
  }
  throw new AdminError("Preço não confirmado pelo navegador.",502);
}
