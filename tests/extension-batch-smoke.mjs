// Browser flow with mocked Chrome APIs; no requests to stores or production data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import packaged from '@sparticuz/chromium';
packaged.setGraphicsMode=false;
const browser=await chromium.launch({args:packaged.args,executablePath:await packaged.executablePath(),headless:true});
try {
  const page=await browser.newPage();
  const html=(await readFile('extensions/comparacel-collector/batch.html','utf8')).replace('<script src="batch.js"></script>','').replaceAll(/<link[^>]+>/g,'');
  await page.route('http://localhost:3000/**',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://localhost:3000/batch-test');
  await page.evaluate(()=>{
    const item={productId:'phone',name:'Phone',source:'amazon',storeId:'amazon',identity:'B012345678',offerUrl:'https://amzn.to/owner',pageUrl:'https://www.amazon.com.br/dp/B012345678'};
    const data={site:'http://localhost:3000',key:'ccx_'+'a'.repeat(64)};
    const tabs=new Map();let nextId=1;
    globalThis.batchTest={data,tabs,posts:[],blocked:true,missing:false};
    const timer=window.setTimeout.bind(window);
    window.setTimeout=(fn,ms,...args)=>timer(fn,ms <= 5000?1:ms,...args);
    globalThis.chrome={
      storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data[key])])),set:async values=>Object.assign(data,structuredClone(values))}},
      permissions:{request:async()=>true},
      tabs:{create:async options=>{const tab={id:nextId++,url:options.url,status:'complete'};tabs.set(tab.id,tab);return tab;},get:async id=>{if(!tabs.has(id))throw new Error('Closed');return tabs.get(id);},remove:async id=>tabs.delete(id),update:async()=>{}},
      scripting:{executeScript:async options=>{
        if(options.files)return [];
        return [{result:batchTest.blocked?{error:'Conclua a verificação da Amazon e abra o produto.'}:batchTest.missing?{error:'O preço principal não está disponível na página.',unavailableCapture:{source:'amazon',pageUrl:item.pageUrl,price:null}}:{capture:{source:'amazon',pageUrl:item.pageUrl,price:123}}}];
      }}
    };
    window.fetch=async (_url,options)=>{
      if(options.method==='GET')return new Response(JSON.stringify({queue:[item,{...item,productId:'changed',name:'Changed'}]}));
      const body=JSON.parse(options.body);batchTest.posts.push(body);
      return body.productId==='changed'?new Response(JSON.stringify({error:'O anúncio não corresponde à oferta cadastrada.'}),{status:409}):new Response(JSON.stringify({message:'OK'}));
    };
  });
  await page.addScriptTag({content:await readFile('extensions/comparacel-collector/batch.js','utf8')});
  await page.click('#load');
  await page.waitForFunction(()=>document.querySelector('#counts').textContent.startsWith('0 de 2'));
  await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Atualização pausada'));
  assert.equal(await page.evaluate(()=>batchTest.posts.length),0);
  assert.equal(await page.evaluate(()=>batchTest.data.priceBatch.index),0);
  assert.equal(await page.locator('#skip').isVisible(),true);
  await page.evaluate(()=>{batchTest.blocked=false;});
  await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('concluída'));
  assert.equal(await page.locator('#counts').textContent(),'2 de 2 ofertas conferidas; 1 atualizadas; 0 indisponíveis; 1 para revisão.');
  assert.equal(await page.evaluate(()=>batchTest.tabs.size),0);
  const saved=await page.evaluate(()=>batchTest.data.priceBatch);
  assert.equal(saved.results[0].ok,true);assert.equal(saved.results[1].ok,false);
  const post=await page.evaluate(()=>batchTest.posts[0]);
  assert.equal(post.mode,'price');assert.equal(post.batch,true);assert.equal(post.offerUrl,'https://amzn.to/owner');assert.equal(post.storeId,'amazon');
  await page.click('#load');
  await page.evaluate(()=>{batchTest.blocked=true;});
  await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Atualização pausada'));
  await page.click('#skip');
  await page.waitForFunction(()=>document.querySelector('#counts').textContent.startsWith('1 de 2'));
  assert.equal(await page.evaluate(()=>batchTest.tabs.size),0);
  assert.match(await page.locator('#results').textContent(),/Separado para revisão manual/);
  await page.click('#load');
  await page.evaluate(()=>{batchTest.blocked=false;batchTest.missing=true;batchTest.posts=[];});
  await page.click('#start');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('concluída'));
  assert.match(await page.locator('#counts').textContent(),/0 atualizadas; 1 indisponíveis; 1 para revisão/);
  assert.equal(await page.evaluate(()=>batchTest.posts[0].mode),'unavailable');
  assert.equal(await page.evaluate(()=>batchTest.posts[0].capture.price),null);
  assert.match(await page.locator('#results').textContent(),/Oferta marcada como indisponível/);
  console.log('Batch browser flow passed: queue, challenge pause, resume, exact-offer payload, pending failure and progress.');
} finally {await browser.close();}
