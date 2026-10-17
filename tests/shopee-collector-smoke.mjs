import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 const script=await readFile('extensions/comparacel-collector/collect.js','utf8');
 const original='https://shopee.com.br/product/528144318/58253377016';
 await page.route('https://shopee.com.br/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<meta charset="utf-8"><meta property="og:image" content="https://down-br.img.susercontent.com/file/blender"><main><h1>Liquidificador Easy Power 1,9 L 550 W Preto Mondial</h1><s style="font-size:30px">R$199,90</s><div><span style="font-size:28px">R$126,26</span> no Pix</div><p>Ou R$132,90 com outros métodos de pagamento</p><span style="font-size:14px">12x R$12,90</span><table><tr><th>Marca</th><td>Mondial</td></tr><tr><th>Potência</th><td>550 W</td></tr></table><div data-testid="product-description">Liquidificador com jarra de 1,9 litros.</div></main>`}));
 await page.goto(original);await page.addScriptTag({content:script});
 const captured=await page.evaluate(()=>globalThis.collectProduct());
 assert.equal(captured.source,'shopee');assert.equal(captured.price,126.26);assert.equal(captured.condition,'pix');assert.equal(captured.brand,'Mondial');assert.equal(captured.specs.length,2);assert.match(captured.imageUrl,/susercontent/);assert.match(captured.description,/1,9/);
 await page.setContent('<h1>Produto Shopee</h1><div style="font-size:28px"><span>R$</span><span>126,26</span> no Pix</div>');
 assert.equal((await page.evaluate(()=>globalThis.collectProduct())).price,126.26);
 await page.setContent('<h1>Produto com variações</h1><div data-testid="product-price">R$100,00 - R$200,00</div>');
 assert.match(await page.evaluate(()=>{try{globalThis.collectProduct();return '';}catch(error){return error.message;}}),/variação/);
 await page.setContent('<h1>Produto com variações</h1><div><span style="font-size:28px">R$100,00</span> - <span style="font-size:28px">R$200,00</span></div>');
 assert.match(await page.evaluate(()=>{try{globalThis.collectProduct();return '';}catch(error){return error.message;}}),/variação/);
 await page.setContent('<h1>Produto carregando</h1><p>12x R$12,90</p>');
 assert.match(await page.evaluate(()=>{try{globalThis.collectProduct();return '';}catch(error){return error.message;}}),/preço único/);
 await page.setContent(`<h1>Produto estruturado</h1><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Produto estruturado',offers:{price:'132.90',priceCurrency:'BRL'},brand:{name:'Mondial'}})}</script>`);
 assert.equal((await page.evaluate(()=>globalThis.collectProduct())).price,132.9);
 await page.setContent('<h1>Produto</h1><div id="captcha"></div>');
 assert.match(await page.evaluate(()=>{try{globalThis.collectProduct();return '';}catch(error){return error.message;}}),/verificação/);
 const popup=await browser.newPage();
 const html=(await readFile('extensions/comparacel-collector/popup.html','utf8')).replace('<script src="popup.js"></script>','').replace('<link rel="stylesheet" href="popup.css">','');
 await popup.setContent(html);
 await popup.evaluate(capture=>{
  globalThis.chrome={storage:{local:{get:async()=>({site:'https://comparacel.com.br',key:'ccx_'+'a'.repeat(64)}),set:async()=>{}}},tabs:{query:async()=>[{id:1,url:capture.pageUrl}]},scripting:{executeScript:async()=>[{result:{data:capture}}]}};
  const product={id:'mondial',name:capture.name,category:'liquidificadores',offers:[{id:'a',storeId:'amazon',url:'https://amzn.to/first',price:150}],editPath:'/admin?produto=mondial'};
  globalThis.sent=[];
  globalThis.fetch=async(input,options)=>{
   const url=new URL(input);let body;
   if(options.method==='POST') {const request=JSON.parse(options.body);globalThis.sent.push(request);product.offers.push({id:'s',storeId:'shopee',externalId:'SHP528144318-58253377016',url:request.affiliateUrl,price:capture.price});body={product,message:'Oferta salva.',warnings:[]};}
   else if(url.searchParams.has('pageUrl'))body={product:null,suggestions:[product]};
   else body={categories:[{id:'liquidificadores',name:'Liquidificadores'}]};
   return new Response(JSON.stringify(body));
  };
 },captured);
 await popup.addScriptTag({content:await readFile('extensions/comparacel-collector/popup.js','utf8')});
 await popup.waitForFunction(()=>document.querySelector('#product').value==='mondial');
 await popup.locator('#affiliate').fill('https://s.shopee.com.br/my-affiliate');await popup.locator('#save-offer').click();
 await popup.waitForFunction(()=>document.querySelector('#status').textContent.includes('Oferta salva.'));
 const request=await popup.evaluate(()=>globalThis.sent[0]);assert.equal(request.capture.source,'shopee');assert.equal(request.productId,'mondial');assert.equal(request.mode,'offer');assert.equal(request.affiliateUrl,'https://s.shopee.com.br/my-affiliate');
 assert.match(await popup.locator('#existing-offers').textContent(),/Shopee/);
 assert.equal(await popup.locator('#update-price').isVisible(),true);
 console.log('Shopee: coleta do preço/Pix, parcelas excluídas, variações rejeitadas, ficha/imagem, JSON-LD, bloqueio e vínculo pelo popup: OK');
} finally {await browser.close();}
