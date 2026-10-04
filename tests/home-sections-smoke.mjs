import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import packaged from '@sparticuz/chromium';
packaged.setGraphicsMode=false;
const browser=await chromium.launch({args:packaged.args,executablePath:await packaged.executablePath(),headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#home-top-title').waitFor({state:'visible',timeout:15000});
  await page.locator('#home-recent-title').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('.home-highlights .product-card').count(),9);
  assert.equal(await page.locator('.home-recent-card').count(),9);
  for(const id of ['home-top-carousel','home-recent-carousel']) {
    const next=page.locator(`button[aria-controls="${id}"]`).last();
    await next.click();
    await page.waitForFunction(id=>document.getElementById(id).scrollLeft>20,id);
    await page.locator(`button[aria-controls="${id}"]`).first().click();
    await page.waitForFunction(id=>document.getElementById(id).scrollLeft<3,id);
  }
  assert.ok(await page.locator('.home-recent-card').count()>0);
  await page.locator('.home-highlights').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/comparacel-home-sections-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.home-highlights').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/comparacel-home-sections-mobile.png'});
  console.log('Home local: dois carrosséis com nove produtos, setas funcionando e celular sem rolagem horizontal.');
} finally {await browser.close();}
