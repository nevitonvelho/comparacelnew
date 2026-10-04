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
