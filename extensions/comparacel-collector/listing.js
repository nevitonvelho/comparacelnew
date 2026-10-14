/* global chrome */
(() => {
  if(globalThis.comparacelListingLoaded)return;
  globalThis.comparacelListingLoaded = true;
  const amazon = location.hostname.includes("amazon");
  const selector = amazon ? '[data-component-type="s-search-result"][data-asin]' : '.ui-search-layout__item, .poly-card';
  const cache = new Map();
  let busy = false, timer;
  const panel = document.createElement('div');
  panel.className = 'comparacel-listing comparacel-search-status';
  panel.setAttribute('role', 'status');
  const label = document.createElement('span');
  label.textContent = 'Comparacel: verificando produtos da busca…';
  const retry = document.createElement('button');
  retry.textContent = 'Verificar novamente';
  panel.append(label, retry);
  if(document.querySelector(selector))document.body.append(panel);
  retry.addEventListener('click', () => {
    cache.clear();document.querySelectorAll('[data-comparacel-url]').forEach(card => delete card.dataset.comparacelUrl);
    void scan();
  });
  function entry(card) {
    const title = card.querySelector(amazon ? 'h2' : '.poly-component__title, .ui-search-item__title');
    const anchor = amazon ? title?.closest('a') || card.querySelector('a:has(h2)') || title?.querySelector('a') : title?.closest('a') || title?.querySelector('a') || card.querySelector('a.poly-component__title, a.ui-search-link');
    if(!title || !anchor?.href)return null;
    const url = new URL(anchor.href, location.href);
    const asin = card.getAttribute('data-asin');
    let pageUrl;
    if(amazon) {
      if(!/^[A-Z0-9]{10}$/.test(asin || ""))return null;
      pageUrl = `https://www.amazon.com.br/dp/${asin}`;
    }else {
      if(!/(^|\.)mercadolivre\.com\.br$/.test(url.hostname))return null;
      // Ads can use /mclics/clicks rather than a product URL. Keep the
      // tracking link to open it and request suggestions using its title.
      pageUrl = /MLB-?\d+/i.test(url.pathname) ? `${url.origin}${url.pathname}` : url.href.split('#')[0].slice(0,4500);
    }
    return {pageUrl, name: title.textContent.trim().replace(/\s+/g, " ").slice(0, 300)};
  }
  function render(card, item, response) {
    let box = card.querySelector('.comparacel-listing');
    if(!box){box = document.createElement('div');box.className = 'comparacel-listing';card.append(box);}
    box.replaceChildren();
    const result = response.results?.find(result => result.pageUrl === item.pageUrl);
    const product = result?.product || result?.suggestions?.[0];
    box.dataset.state = result?.product ? 'exact' : product ? 'suggestion' : 'none';
    const heading = document.createElement('strong');
    heading.textContent = response.error ? 'Comparacel: consulta indisponível' : result?.conflict ? 'Comparacel: anúncio em mais de uma ficha' : result?.product ? 'Comparacel: anúncio já cadastrado' : product ? 'Comparacel: possível produto cadastrado' : 'Comparacel: nenhum correspondente encontrado';
    box.append(heading);
    const detail = document.createElement('span');
    detail.textContent = response.error || (product ? product.name : 'Abra o anúncio e use a extensão para importar.');
    box.append(detail);
    if(product) {
      const stores = new Set(product.offers.map(offer => {
        try { const host = new URL(offer.url).hostname;return /(^|\.)amazon\.com\.br$/.test(host) || host === 'amzn.to' ? 'Amazon' : /(^|\.)mercadolivre\.com(?:\.br)?$/.test(host) || host === 'meli.la' ? 'Mercado Livre' : ''; }catch{return '';}
      }).filter(Boolean));
      const info = document.createElement('span');
      const current = amazon ? 'Amazon' : 'Mercado Livre';
      info.textContent = `Lojas: ${[...stores].join(', ') || 'sem oferta destas lojas'}. ${stores.has(current) ? 'Pode atualizar a oferta desta loja.' : `Pode adicionar ${current} à mesma ficha.`} ${result.product ? '' : 'Confira modelo, capacidade e versão.'}`;
      box.append(info);
      const edit = document.createElement('a');edit.href = new URL(product.editPath, response.origin).href;edit.target = '_blank';edit.rel = 'noopener noreferrer';edit.textContent = 'Ver ficha no painel';box.append(edit);
    }
    const open = document.createElement('a');open.href = item.pageUrl;open.textContent = product ? 'Abrir anúncio e usar extensão' : 'Abrir anúncio';box.append(open);
  }
  async function scan() {
    if(busy)return;
    const cards = [...document.querySelectorAll(selector)].filter(card => !card.parentElement?.closest(selector));
    const pending = new Map();
    for(const card of cards) {
      const item = entry(card);if(!item)continue;
      const cached = cache.get(item.pageUrl);
      if(cached){if(card.dataset.comparacelUrl !== item.pageUrl){render(card,item,cached);card.dataset.comparacelUrl = item.pageUrl;}}
      else if(pending.size < 60)pending.set(item.pageUrl,item);
    }
    if(!pending.size){
      if(!cards.length && panel.isConnected && label.textContent !== 'Comparacel: nenhum cartão de produto identificado nesta página.')label.textContent = 'Comparacel: nenhum cartão de produto identificado nesta página.';
      return;
    }
    if(!panel.isConnected)document.body.append(panel);
    label.textContent = 'Comparacel: consultando sua base de produtos…';
    busy = true;
    try {
      const response = await chrome.runtime.sendMessage({type:'comparacel-listing', entries:[...pending.values()]});
      if(!response)throw new Error('Sem resposta da extensão. Recarregue a extensão e esta página.');
      label.textContent = response.error ? `Comparacel: ${response.error}` : 'Comparacel: busca verificada. Veja as marcações nos produtos.';
      for(const [url] of pending)cache.set(url,response);
      for(const card of cards){const item = entry(card);if(item && pending.has(item.pageUrl)){render(card,item,response);card.dataset.comparacelUrl = item.pageUrl;}}
    }catch(error){label.textContent = `Comparacel: ${error.message || 'falha na consulta. Recarregue a extensão e esta página.'}`;}
    finally{busy = false;}
  }
  const observer = new MutationObserver(() => {clearTimeout(timer);timer = setTimeout(scan,700);});
  observer.observe(document.body,{childList:true,subtree:true});
  chrome.storage.onChanged.addListener((_changes, area) => {
    if(area === 'local' && (_changes.key || _changes.site)){cache.clear();document.querySelectorAll('[data-comparacel-url]').forEach(card => delete card.dataset.comparacelUrl);void scan();}
  });
  void scan();
})();
