// Executed only after the user clicks the extension, on the active product page.
globalThis.prepareProductCollection = async function () {
  if(!["mercadolivre.com.br","www.mercadolivre.com.br","produto.mercadolivre.com.br"].includes(location.hostname))return;
  const section=document.querySelector('.ui-vpp-striped-specs, .ui-pdp-specs, .ui-pdp-specs__table-container, #highlighted_specs_attrs, #specs');
  if(!section)return;
  const original={x:scrollX,y:scrollY};
  try {
    section.scrollIntoView({block:"center"});
    await new Promise(resolve=>setTimeout(resolve,700));
    const expand=[...section.querySelectorAll('button')].find(node=>/^(ver|mostrar) (todas |todos |mais )?(as )?características/i.test(node.textContent.trim()));
    expand?.click();
    if(expand)await new Promise(resolve=>setTimeout(resolve,500));
  }finally {scrollTo(original.x,original.y);}
};
globalThis.collectProduct = function () {
  if(location.protocol === "https:" && ["shopee.com.br","www.shopee.com.br"].includes(location.hostname)) {
    if(/captcha|verify|login|buyer\/login/i.test(location.pathname) || document.querySelector('#captcha, .g-recaptcha, iframe[src*="captcha"]'))throw new Error("Conclua a verificação da Shopee e abra o produto.");
    if(!/^\/product\/\d+\/\d+(?:\/|$)/.test(location.pathname) && !/-i\.\d+\.\d+(?:\/|$)/.test(location.pathname))throw new Error("Abra uma página de produto da Shopee, com a loja e o produto na URL.");
    const clean=value=>String(value || "").replace(/\s+/g," ").trim();
    const products=[];
    function readStructured(value) {
      if(Array.isArray(value)){value.forEach(readStructured);return;}
      if(!value || typeof value!=="object")return;
      if([value['@type']].flat().includes('Product'))products.push(value);
      if(value['@graph'])readStructured(value['@graph']);
    }
    for(const script of document.querySelectorAll('script[type="application/ld+json"]'))try{readStructured(JSON.parse(script.textContent));}catch{/* A broken optional JSON-LD block must not hide the visible product. */}
    const structured=products[0] || {};
    const title=document.querySelector('h1, [data-testid="product-title"]');
    const name=clean(title?.textContent || structured.name);
    if(!name)throw new Error("Aguarde a ficha do produto Shopee carregar antes de coletar.");
    function priceFromText(raw) {
      const value=clean(raw);
      const matches=[...value.matchAll(/R\$\s*(\d[\d.]*,\d{2})(?!\d)/g)];
      if(matches.length!==1)return null; // A price range requires a selected variation.
      const price=Number(matches[0][1].replaceAll('.', '').replace(',', '.'));
      return Number.isFinite(price) && price>0 ? price : null;
    }
    let price=null,condition="standard";
    const explicit=document.querySelector('[data-testid="product-price"], [data-testid="pdp-product-price"]');
    if(explicit) {
      if([...clean(explicit.textContent).matchAll(/R\$/g)].length>1)throw new Error("Selecione uma variação com preço único na Shopee antes de coletar.");
      price=priceFromText(explicit.textContent);
      if(price && /no pix/i.test(explicit.parentElement?.textContent || ""))condition="pix";
    }
    if(price===null && title) {
      const titleRect=title.getBoundingClientRect();
      const candidates=[];
      const walker=document.createTreeWalker(document.querySelector('main, [role="main"]') || document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        let raw=clean(walker.currentNode.textContent);const node=walker.currentNode.parentElement;
        if(node && (raw==='R$' || /^\d[\d.]*,\d{2}$/.test(raw))) {const context=clean(node.parentElement?.textContent);if(context.length<120 && context.includes("R$"))raw=context;}
        if(!raw.startsWith('R$') || !node || node.closest('s, del, script, style, button, [aria-hidden="true"]'))continue;
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node),font=parseFloat(style.fontSize);
        if(!rect.width || !rect.height || font<20 || style.visibility==='hidden' || style.display==='none' || style.opacity==='0' || style.textDecorationLine.includes('line-through') || rect.top<titleRect.top-10 || rect.top>titleRect.bottom+400 || rect.left<titleRect.left-30)continue;
        candidates.push({node,raw,font,top:rect.top});
      }
      candidates.sort((a,b)=>b.font-a.font || a.top-b.top);
      const primary=candidates[0];
      if(primary) {
        const range=clean(primary.node.parentElement?.textContent);
        if(range.length<180 && /R\$.*\d\s*[-–]\s*(?:R\$)?\s*\d/.test(range))throw new Error("Selecione uma variação com preço único na Shopee antes de coletar.");
        if((primary.raw.match(/R\$/g) || []).length>1 || /\d\s*[-–]\s*(?:R\$)?\s*\d/.test(primary.raw))throw new Error("Selecione uma variação com preço único na Shopee antes de coletar.");
        price=priceFromText(primary.raw);
        const context=clean(primary.node.parentElement?.textContent);
        if(price && context.length<400 && /no pix/i.test(context))condition="pix";
      }
    }
    if(price===null) {
      const offers=[structured.offers].flat().filter(Boolean);
      if(offers.length===1) {
        const offer=offers[0];
        if(offer.lowPrice!==undefined && offer.highPrice!==undefined && Number(offer.lowPrice)!==Number(offer.highPrice))throw new Error("Selecione uma variação com preço único na Shopee antes de coletar.");
        if(offer.availability && /OutOfStock|Discontinued|SoldOut/i.test(offer.availability))throw new Error("O preço principal não está disponível: anúncio Shopee sem estoque.");
        const amount=offer.price ?? offer.lowPrice;
        if((!offer.priceCurrency || offer.priceCurrency==='BRL') && amount!==undefined && /^\d+(?:\.\d+)?$/.test(String(amount)))price=Number(amount);
      }
    }
    if(!Number.isFinite(price) || price<=0)throw new Error("Não foi possível ler um preço único na Shopee. Aguarde o carregamento ou selecione a variação.");
    const specs=[],seen=new Set();
    const add=(label,value)=>{label=clean(label);value=clean(value);if(label && value && !seen.has(label.toLowerCase()) && specs.length<200){seen.add(label.toLowerCase());specs.push({name:label.slice(0,200),value:value.slice(0,2000)});}};
    for(const property of [structured.additionalProperty].flat().filter(Boolean))add(property.name,property.value);
    document.querySelectorAll('table tr, [data-testid="product-attribute"], [data-testid="product-specification"]').forEach(row=>{const cells=row.querySelectorAll('th,td,[data-testid="attribute-name"],[data-testid="attribute-value"]');add(cells[0]?.textContent,cells[1]?.textContent);});
    for(const label of document.querySelectorAll('label')) {
      const heading=label.parentElement?.parentElement?.parentElement?.textContent || '';
      if(/especificaç(?:ões|oes) do produto/i.test(heading) && !/categoria/i.test(label.textContent))add(label.textContent,label.nextElementSibling?.textContent);
    }
    const descriptionHeading=[...document.querySelectorAll('h2,h3,section > div')].find(node=>/^descriç(?:ão|ao) do produto$/i.test(clean(node.textContent)));
    const description=document.querySelector('[data-testid="product-description"]')?.textContent || structured.description || descriptionHeading?.nextElementSibling?.textContent || '';
    const hero=[...document.querySelectorAll('main img, [role="main"] img, img')].find(image=>{
      const rect=image.getBoundingClientRect(),heading=title?.getBoundingClientRect();
      return rect.width>=180 && rect.height>=180 && (!heading || rect.top<=heading.bottom+100 && rect.bottom>=heading.top-800);
    });
    const rawImage=document.querySelector('meta[property="og:image"]')?.content || [structured.image].flat().filter(Boolean)[0] || hero?.currentSrc || hero?.src || '';
    const imageUrl=typeof rawImage==='string'?rawImage:rawImage.url || '';
    const brand=specs.find(spec=>/^(marca|fabricante)$/i.test(spec.name))?.value || (typeof structured.brand==='string'?structured.brand:structured.brand?.name) || 'Genérico';
    return {version:1,source:"shopee",pageUrl:location.href,capturedAt:new Date().toISOString(),name:name.slice(0,300),price,condition,brand:clean(brand).slice(0,120),description:clean(description).slice(0,50000),imageUrl,specs};
  }

  if(location.protocol === "https:" && ["amazon.com.br","www.amazon.com.br"].includes(location.hostname)) {
    const text=selector=>document.querySelector(selector)?.textContent.trim() || "";
    if(document.querySelector("#captchacharacters, form[action*='validateCaptcha']"))throw new Error("Conclua a verificação da Amazon e abra o produto.");
    const name=text("#productTitle");
    if(!name)throw new Error("Abra uma página de produto da Amazon.");
    let price=null;
    for(const selector of ["#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)","#corePrice_feature_div .a-price:not(.a-text-price)","#apex_desktop .priceToPay","#apex_mobile .priceToPay","#priceblock_ourprice","#priceblock_dealprice"]) {
      const node=document.querySelector(selector);
      if(!node)continue;
      const whole=node.querySelector(".a-price-whole")?.textContent.replace(/[,\s]/g,"");
      const amount=node.querySelector(".a-offscreen")?.textContent || (whole ? `${whole},${node.querySelector(".a-price-fraction")?.textContent || "00"}` : node.textContent);
      const match=amount.match(/(\d[\d.]*,\d{2})/);
      if(match){price=Number(match[1].replace(/\./g,"").replace(",","."));break;}
    }
    if(!price || !Number.isFinite(price))throw new Error("O preço principal não está disponível na página.");
    const specs=[];const seen=new Set();
    document.querySelectorAll("#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, #productOverview_feature_div tr").forEach(row=>{
      const cells=row.querySelectorAll("th,td");const label=cells[0]?.textContent.trim();const value=cells[1]?.textContent.trim();
      if(label && value && !seen.has(label) && specs.length<200){seen.add(label);specs.push({name:label.slice(0,200),value:value.slice(0,2000)});}
    });
    const image=document.querySelector("#landingImage, #imgTagWrapperId img");
    return {version:1,source:"amazon",pageUrl:location.href,capturedAt:new Date().toISOString(),name:name.slice(0,300),price,condition:"standard",brand:(specs.find(spec=>/^(marca|fabricante)$/i.test(spec.name))?.value || text("#bylineInfo").replace(/^(Marca\s*:|Visite a loja|Brand\s*:)/i,"").trim() || "Genérico").slice(0,120),description:text("#productDescription").slice(0,50000),imageUrl:image?.getAttribute("data-old-hires") || image?.src || "",specs};
  }
  if (location.protocol !== "https:" || !["www.mercadolivre.com.br", "mercadolivre.com.br", "produto.mercadolivre.com.br"].includes(location.hostname)) throw new Error("Abra a página do produto no Mercado Livre.");
  if (document.querySelector('form[action*="captcha"], #captcha, .g-recaptcha') || /account-verification|\/login/.test(location.pathname)) throw new Error("Conclua a verificação do Mercado Livre e abra o produto antes de coletar.");
  const text = selector => document.querySelector(selector)?.textContent.trim() || "";
  const name = text(".ui-pdp-title");
  if (!name) throw new Error("Esta página não contém a ficha de um produto. Na vitrine, clique em ‘Ir para produto’.");
  const block = document.querySelector(".ui-pdp-price__second-line");
  const amount = block?.querySelector(".andes-money-amount:not(.andes-money-amount--previous)");
  const fraction = amount?.querySelector(".andes-money-amount__fraction")?.textContent.replace(/\D/g, "");
  const cents = amount?.querySelector(".andes-money-amount__cents")?.textContent.trim() || "00";
  if (!fraction || !/^\d{2}$/.test(cents)) throw new Error("O preço principal não está disponível. Aguarde a página carregar ou confira o anúncio.");
  const price = Number(`${fraction}.${cents}`);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Não foi possível confirmar o preço.");
  const labels = block.cloneNode(true);
  labels.querySelectorAll(".andes-money-amount, .andes-money-amount--previous").forEach(node => node.remove());
  const specs = [];
  const seen = new Set();
  function add(label,value) {
    label=String(label || "").replace(/\s+/g," ").trim();value=String(value || "").replace(/\s+/g," ").trim();
    const key=label.toLocaleLowerCase("pt-BR");
    if (label && value && !seen.has(key) && specs.length < 200) {
      seen.add(key); specs.push({name: label.slice(0,200), value: value.slice(0,2000)});
    }
  }
  document.querySelectorAll(".ui-pdp-specs__table tr, .ui-vpp-striped-specs__table tr, .ui-vpp-striped-specs [role='row'], .ui-vpp-striped-specs .andes-table__row, .ui-pdp-specs__table-container tr, #highlighted_specs_attrs tr, #specs tr, [data-testid='specs'] tr").forEach(row => {
    const cells = row.querySelectorAll("th,td,[role='rowheader'],[role='cell'],.andes-table__header,.andes-table__column");
    add(cells[0]?.textContent,cells[1]?.textContent);
  });
  document.querySelectorAll('.ui-pdp-specs__key-value, .ui-pdp-specs__specs-list li').forEach(row=>{
    const label=row.querySelector('.ui-pdp-specs__key, dt, strong');
    const value=row.querySelector('.ui-pdp-specs__value, dd');
    if(label && value)add(label.textContent,value.textContent);
  });
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script=>{
    try {
      const visit=value=>{
        if(Array.isArray(value)){value.forEach(visit);return;}
        if(!value || typeof value!=="object")return;
        if(value['@type']==='Product' || Array.isArray(value['@type']) && value['@type'].includes('Product')) {
          for(const spec of Array.isArray(value.additionalProperty)?value.additionalProperty:[])if(spec?.name && ['string','number','boolean'].includes(typeof spec.value))add(spec.name,spec.value);
          const brand=typeof value.brand==='string'?value.brand:value.brand?.name;
          if(brand)add('Marca',brand);
        }
        if(value['@graph'])visit(value['@graph']);
      };
      visit(JSON.parse(script.textContent));
    }catch{/* Ignore unrelated or malformed structured data. */}
  });
  const image = document.querySelector(".ui-pdp-gallery__figure img");
  return {
    version: 1, source: "mercadolivre", pageUrl: location.href,
    capturedAt: new Date().toISOString(), name: name.slice(0,300), price,
    condition: /\b(?:no|via|com)\s+pix\b/i.test(labels.textContent) ? "pix" : "standard",
    brand: (specs.find(spec => /^(marca|fabricante)$/i.test(spec.name))?.value || "Genérico").slice(0,120),
    description: text(".ui-pdp-description__content").slice(0,50000),
    imageUrl: image?.getAttribute("data-zoom") || image?.getAttribute("src") || document.querySelector('meta[property="og:image"]')?.content || "",
    specs
  };
};
