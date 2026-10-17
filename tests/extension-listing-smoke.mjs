import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import packaged from '@sparticuz/chromium';
packaged.setGraphicsMode=false;
const browser=await chromium.launch({args:packaged.args,executablePath:await packaged.executablePath(),headless:true});
try {
  const context=await browser.newContext();
  for(const source of ['amazon','mercadolivre']) {
    const page=await context.newPage();
    const card=(id,name)=>source==='amazon'?`<div data-component-type="s-search-result" data-asin="${id}"><a href="/dp/${id}"><h2>${name}</h2></a></div>`:`<li class="ui-search-layout__item"><div class="poly-card"><a class="poly-component__title" href="https://click1.mercadolivre.com.br/mclics/clicks?item=${id}">${name}</a></div></li>`;
    const ids=source==='amazon'?['B012345678','B012345679','B012345680']:['MLB12345','MLB12346','MLB12347'];
    const origin=source==='amazon'?'https://www.amazon.com.br/s?k=ar':'https://lista.mercadolivre.com.br/ar';
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<style>[data-component-type], .ui-search-layout__item {display:inline-block;vertical-align:top;width:300px;height:400px;margin:8px;} .poly-card {height:400px;} h2,.poly-component__title {display:block;padding-top:220px;}</style>'+card(ids[0],'Ar Midea')+card(ids[1],'Ar Elgin')}));
    await page.goto(origin);
    await page.evaluate(()=>{
      globalThis.calls=0;
      globalThis.chrome={storage:{onChanged:{addListener(){}}},runtime:{sendMessage:async message=>{
        globalThis.calls++;
        return {origin:'https://comparacel.com.br',results:message.entries.map((entry,index)=>({...entry,product:index===0?{id:'midea',name:'Midea',editPath:'/admin?produto=midea',offers:[{url:'https://amzn.to/owner'}]}:null,suggestions:index===1?[{id:'elgin',name:'Elgin',editPath:'/admin?produto=elgin',offers:[{url:'https://amzn.to/owner'}]}]:[]}))};
      }}};
    });
    await page.addStyleTag({content:await readFile('extensions/comparacel-collector/listing.css','utf8')});
    const before = await page.locator(source==='amazon'?'[data-component-type="s-search-result"]':'.ui-search-layout__item').first().boundingBox();
    await page.addScriptTag({content:await readFile('extensions/comparacel-collector/listing.js','utf8')});
    await page.waitForSelector('.comparacel-listing[data-state="suggestion"]');
    assert.equal(await page.locator('.comparacel-listing:not(.comparacel-search-status)[data-state]').count(),2);
    const after = await page.locator(source==='amazon'?'[data-component-type="s-search-result"]':'.ui-search-layout__item').first().boundingBox();
    assert.equal(after.height,before.height,'badges must not increase card height');
    const badge = page.locator('.comparacel-product-badge').first();
    assert.equal(await badge.getAttribute('aria-expanded'),'false');
    await badge.click();
    await page.waitForSelector('.comparacel-product-details:popover-open');
    assert.equal(await badge.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('.comparacel-product-details:popover-open') && document.querySelector('.comparacel-product-badge').getAttribute('aria-expanded')==='false');
    assert.equal(await badge.getAttribute('aria-expanded'),'false');
    assert.match(await page.locator('[data-state="exact"]').textContent(),/anúncio já cadastrado/);
    assert.match(await page.locator('[data-state="suggestion"]').textContent(),/possível produto cadastrado/);
    if(source==='mercadolivre')assert.match(await page.locator('[data-state="suggestion"]').textContent(),/Pode adicionar outro anúncio de Mercado Livre/);
    await page.evaluate(html=>document.body.insertAdjacentHTML('beforeend',html),card(ids[2],'Outro produto'));
    await page.waitForFunction(()=>document.querySelectorAll('.comparacel-listing:not(.comparacel-search-status)[data-state]').length===3);
    assert.equal(await page.evaluate(()=>calls),2);
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(()=>calls),2);
    await page.close();
  }
  console.log('Amazon and Mercado Livre listing badges, cross-store actions, dynamic results and request deduplication passed.');
}finally{await browser.close();}
