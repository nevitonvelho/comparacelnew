/* global chrome */
let captured;
const status = document.querySelector("#status");
const collect = document.querySelector("#collect");
const site=document.querySelector("#site"),key=document.querySelector("#key");
const connectionStatus=document.querySelector("#connection-status");
let connected=false;
let draftKey;
let restoredDraft=false;
let pendingCategory;
function siteOrigin() {
  const url=new URL(site.value.trim());
  if(url.username || url.password || (url.protocol!=="https:" && !(url.protocol==="http:" && url.hostname==="localhost")))throw new Error("Use o endereço https do Comparacel ou http://localhost:3000.");
  return url.origin;
}
async function api(method,body,query="") {
  if(!/^ccx_[a-f0-9]{64}$/.test(key.value.trim()))throw new Error("Gere uma chave de conexão na importação do painel.");
  let response;
  try {response=await fetch(`${siteOrigin()}/api/extension/import${query}`,{method,headers:{Authorization:`Bearer ${key.value.trim()}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(method==="GET"?15000:70000)});}
  catch(error){throw new Error(error.name==="TimeoutError"?"O site demorou para responder. Confira se o servidor está ligado e tente novamente.":"Não foi possível acessar o Comparacel. Confira o endereço, a permissão da extensão e se o servidor está ligado.");}
  const data=await response.json().catch(()=>{throw new Error(`O site respondeu HTTP ${response.status} sem a resposta esperada. Reinicie o servidor e confira o endereço.`);});
  if(!response.ok) {
    if(body?.mode==="unavailable" && data.error==="Operação inválida.")throw new Error(`O Comparacel em ${siteOrigin()} ainda está usando a API anterior. Atualize esse site/servidor para aceitar ofertas indisponíveis e tente novamente. Seus campos foram mantidos.`);
    throw new Error(data.error || "Falha ao importar.");
  }
  return data;
}
async function categories() {
  const data=await api("GET");const select=document.querySelector("#category");select.replaceChildren();
  for(const category of data.categories){const option=document.createElement("option");option.value=category.id;option.textContent=category.name;select.append(option);}
  const saved=await chrome.storage.local.get("category");
  if(data.categories.some(category=>category.id===saved.category))select.value=saved.category;
  if(pendingCategory && data.categories.some(category=>category.id===pendingCategory))select.value=pendingCategory;
  connected=true;
  if(captured && !restoredDraft)await identifyProduct();
}
async function initializePopup() {
  const config=await chrome.storage.local.get(["site","key"]);
  site.value=config.site || "http://localhost:3000";key.value=config.key || "";
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id && tab.url) {
    const url=new URL(tab.url);
    draftKey=`productDraft:${tab.id}:${url.origin}${url.pathname}`;
    const saved=(await chrome.storage.local.get(draftKey))[draftKey];
    if(saved?.capture && saved.site===site.value && Date.now()-saved.savedAt<7*86400000) {
      captured=saved.capture;matchedProduct=saved.matchedProduct;
      for(const product of saved.products || [])products.set(product.id,product);
      showCapture();renderProducts(saved.selected);
      document.querySelector("#search").value=saved.search || "";
      document.querySelector("#affiliate").value=saved.affiliate || "";
      document.querySelector("#search-controls").open=Boolean(saved.searchOpen);
      document.querySelector("#match-status").textContent=saved.matchStatus || "";
      status.textContent=saved.status || "";
      restoredDraft=true;
      pendingCategory=saved.category;
    }
  }
  if(config.key)try{connectionStatus.textContent="Conectando…";await categories();connectionStatus.textContent="Conectado.";document.querySelector("#connection").open=false;}catch(error){connectionStatus.textContent=error.message;document.querySelector("#connection").open=true;}
  else document.querySelector("#connection").open=true;
  if(!restoredDraft)collect.click();
  else if(!products.size && connected)void identifyProduct().catch(error=>{status.textContent=error.message;});
}
for(const field of [site,key])field.addEventListener("input",()=>{connected=false;++lookupVersion;matchedProduct=null;products.clear();renderProducts();document.querySelector("#category").replaceChildren();});
document.querySelector("#connect").addEventListener("click",async()=>{
  const button=document.querySelector("#connect");
  if(button.disabled)return;
  button.disabled=true;button.textContent="Conectando…";connectionStatus.textContent="Verificando a conexão e carregando categorias…";connected=false;
  try {
    const origin=siteOrigin();
    // Permission is requested only for the site explicitly configured by the user.
    if(origin.startsWith("https:") && !await chrome.permissions.request({origins:[`${origin}/*`]}))throw new Error("Permita o acesso ao seu Comparacel para conectar.");
    await categories();await chrome.storage.local.set({site:origin,key:key.value.trim()});
    connectionStatus.textContent="Conectado. Categorias carregadas.";
    status.textContent=products.size?"Confira o produto identificado e escolha a ação desejada.":"Conectado. Escolha a categoria, cole o link de afiliado e importe.";document.querySelector("#connection").open=false;
  }catch(error){connectionStatus.textContent=error.message;document.querySelector("#connection").open=true;}
  finally{button.disabled=false;button.textContent="Conectar e carregar categorias";}
});
collect.addEventListener("click", async () => {
  collect.disabled = true;captured = undefined;document.querySelector("#preview").hidden = true;
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url || "about:blank");
    if (!tab?.id || url.protocol!=="https:" || !["mercadolivre.com.br","www.mercadolivre.com.br","produto.mercadolivre.com.br","amazon.com.br","www.amazon.com.br"].includes(url.hostname)) throw new Error("Abra um produto no Mercado Livre ou Amazon e tente novamente.");
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:["collect.js"]});
    const [result] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{try{await globalThis.prepareProductCollection();return {data:globalThis.collectProduct()};}catch(error){if(/preço principal|confirmar o preço/.test(error.message)) {
      const name=document.querySelector("#productTitle, .ui-pdp-title")?.textContent.trim();
      if(name)return {data:{version:1,source:location.hostname.includes("amazon")?"amazon":"mercadolivre",pageUrl:location.href,capturedAt:new Date().toISOString(),name:name.slice(0,300),price:null,condition:"standard",brand:"Genérico",description:"",imageUrl:"",specs:[]}};
    }
    return {error:error.message};}}});
    if (!result?.result?.data) throw new Error(result?.result?.error || "Não foi possível ler a página.");
    captured = result.result.data;
    showCapture();
    document.querySelector("#affiliate").value="";document.querySelector("#edit").hidden=true;
    document.querySelector("#preview").hidden = false;status.textContent = "Cole o link de afiliado, escolha a categoria e importe.";
    matchedProduct=null;products.clear();renderProducts();
    document.querySelector("#search").value="";
    restoredDraft=false;pendingCategory=undefined;persistDraft();
    if(connected)await identifyProduct();
    else document.querySelector("#match-status").textContent="Conecte para verificar se este produto já foi importado.";
  } catch(error) {status.textContent = error.message;}
  finally {collect.disabled = false;persistDraft();}
});
const productSelect=document.querySelector("#product");
const products=new Map();
let matchedProduct=null;
let lookupVersion=0;
let saving=false;
function renderProducts(selected=matchedProduct?.id || "") {
  productSelect.replaceChildren();
  if(!matchedProduct){const option=document.createElement("option");option.value="";option.textContent="Importar como produto novo";productSelect.append(option);}
  for(const product of products.values()) {
    const option=document.createElement("option");option.value=product.id;option.textContent=`${product.name} (${product.category})`;productSelect.append(option);
  }
  productSelect.value=selected;
  renderActions();
}
function savedAffiliateForSource(product) {
  return product?.offers?.find(offer=>{
    try {
      const host=new URL(offer.url).hostname.toLowerCase();
      return captured?.source==="amazon" ? host==="amzn.to" || host==="amazon.com.br" || host.endsWith(".amazon.com.br") : host==="meli.la" || host==="mercadolivre.com.br" || host.endsWith(".mercadolivre.com.br") || host==="mercadolivre.com" || host.endsWith(".mercadolivre.com");
    } catch {return false;}
  });
}
function renderActions() {
  const product=products.get(productSelect.value);
  const exact=product && product.id===matchedProduct?.id;
  document.querySelector("#import").hidden=Boolean(product);
  document.querySelector("#mark-unavailable").hidden=!exact;
  for(const id of ["import","update-price","update-full","save-offer"])document.querySelector(`#${id}`).disabled=captured?.price==null;
  document.querySelector("#update-price").hidden=!product;
  document.querySelector("#update-full").hidden=!product;
  document.querySelector("#save-offer").hidden=!product;
  document.querySelector("#update-help").hidden=!product;
  document.querySelector("#category").disabled=Boolean(product);
  document.querySelector("#search-controls").hidden=Boolean(matchedProduct);
  const affiliate=document.querySelector("#affiliate");
  affiliate.placeholder=(exact || savedAffiliateForSource(product))?"Deixe vazio para manter o afiliado cadastrado":"https://meli.la/… ou https://amzn.to/…";
  const edit=document.querySelector("#edit");edit.hidden=!product;
  if(product)document.querySelector("#category").value=product.category;
  if(product)edit.href=new URL(product.editPath,siteOrigin()).href;
}
productSelect.addEventListener("change",renderActions);
async function identifyProduct() {
  const version=++lookupVersion;const snapshot=captured;
  document.querySelector("#match-status").textContent="Verificando se este anúncio já está cadastrado…";
  const data=await api("GET",undefined,`?${new URLSearchParams({pageUrl:snapshot.pageUrl,source:snapshot.source,name:snapshot.name})}`);
  if(version!==lookupVersion || snapshot!==captured)return;
  // Older site versions may identify linked ads but omit automatic suggestions.
  // Search the explicit model automatically instead of reporting a false absence.
  if(!data.product && !Array.isArray(data.suggestions)) {
    const tokens=snapshot.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().match(/[a-z0-9]+/g) || [];
    const model=tokens.find(word=>/[a-z]/.test(word) && /\d/.test(word) && !/^(?:\d+(?:gb|tb|mb|kg|l|v|w|pol)|4k|8k|5g|4g|3g)$/.test(word));
    if(model) {
      const fallback=await api("GET",undefined,`?${new URLSearchParams({q:model.replace(/^un\d{2}([a-z]\d{4}[a-z])[a-z0-9]*$/, "$1")})}`);
      if(version!==lookupVersion || snapshot!==captured)return;
      data.suggestions=fallback.products || [];
    } else {
      document.querySelector("#match-status").textContent="O site conectado ainda não oferece identificação automática entre lojas. Atualize/reinicie o Comparacel para verificar este produto.";
      return;
    }
  }
  matchedProduct=data.product;products.clear();
  if(matchedProduct)products.set(matchedProduct.id,matchedProduct);
  for(const product of data.suggestions || [])products.set(product.id,product);
  const suggested=(data.suggestions || [])[0];
  renderProducts(matchedProduct?.id || suggested?.id || "");
  if(!document.querySelector("#search").value)document.querySelector("#search").value=snapshot.name;
  document.querySelector("#search-controls").open=false;
  document.querySelector("#match-status").textContent=matchedProduct?`Já cadastrado: ${matchedProduct.name}. Escolha o que deseja atualizar.`:suggested?`Possível produto já cadastrado: ${suggested.name}. Confira modelo, capacidade e versão. Atualizar apenas o preço mantém o afiliado salvo nesta loja; para adicionar uma nova loja, informe o afiliado.`:"Nenhum produto equivalente encontrado automaticamente. Você pode importar um novo produto ou abrir a busca abaixo.";
  persistDraft();
}
async function searchProducts() {
  if(saving)return;
  const button=document.querySelector("#search-button");button.disabled=true;
  const searchStatus=document.querySelector("#search-status");searchStatus.textContent="Buscando produtos cadastrados…";
  try {
    if(!connected)throw new Error("Conecte a extensão primeiro.");
    let query=document.querySelector("#search").value.trim();
    if(query.startsWith("http")) {const url=new URL(query);query=url.searchParams.get("produto") || url.pathname.match(/\/produto\/([^/]+)/)?.[1] || query;}
    if(query.length<2)throw new Error("Digite pelo menos dois caracteres do nome ou modelo.");
    const snapshot=captured;const version=lookupVersion;
    let data=await api("GET",undefined,`?${new URLSearchParams({q:query})}`);
    if(!Array.isArray(data.products))throw new Error("O site conectado precisa ser atualizado/reiniciado para oferecer a busca de produtos.");
    if(!data.products.length) {
      const tokens=query.toLowerCase().match(/[a-z0-9]+/g) || [];
      const model=tokens.find(word=>/[a-z]/.test(word) && /\d/.test(word) && !/^(?:\d+(?:gb|tb|mb|kg|l|v|w|pol)|4k|8k|5g|4g|3g)$/.test(word));
      if(model && model!==query.toLowerCase())data=await api("GET",undefined,`?${new URLSearchParams({q:model.replace(/^un\d{2}([a-z]\d{4}[a-z])[a-z0-9]*$/, "$1")})}`);
    }
    if(!Array.isArray(data.products))throw new Error("A busca do site não retornou a lista de produtos. Atualize/reinicie o Comparacel.");
    if(snapshot!==captured || version!==lookupVersion)return;
    products.clear();if(matchedProduct)products.set(matchedProduct.id,matchedProduct);
    for(const product of data.products)products.set(product.id,product);
    renderProducts(matchedProduct?.id || data.products[0]?.id || "");
    searchStatus.textContent=data.products.length?`${data.products.length} produto(s) encontrado(s). Confira a ficha selecionada acima; outras opções estão em Produto no Comparacel.`:"Nenhum produto encontrado. Tente buscar pelo modelo ou por parte do nome.";
    document.querySelector("#match-status").textContent=data.products.length?`Resultado da busca: ${products.get(productSelect.value)?.name}. Confira se é o mesmo produto antes de adicionar a oferta.`:"Nenhum produto encontrado nesta busca.";
    status.textContent=data.products.length?"Selecione a ficha do mesmo produto para adicionar a oferta desta loja.":"Nenhum produto encontrado. Tente buscar pelo modelo ou por parte do nome.";
    persistDraft();
  }catch(error){searchStatus.textContent=error.message;status.textContent=error.message;}
  finally{button.disabled=false;}
}
document.querySelector("#search-button").addEventListener("click",searchProducts);
document.querySelector("#search").addEventListener("keydown",event=>{if(event.key==="Enter")void searchProducts();});
async function saveProduct(mode) {
  if(!captured || saving)return;
  saving=true;
  const controls=[...document.querySelectorAll("button,input,select")];
  const disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
  try {
    if(!connected)throw new Error("Conecte a extensão ao Comparacel primeiro.");
    const affiliateUrl=document.querySelector("#affiliate").value.trim();const category=document.querySelector("#category").value;const productId=productSelect.value;
    if(mode!=="unavailable" && !affiliateUrl && !matchedProduct && !(mode==="price" && savedAffiliateForSource(products.get(productId))))throw new Error("Informe o link de afiliado desta loja.");
    if(!productId && !category)throw new Error("Escolha uma categoria.");
    if(!productId)await chrome.storage.local.set({category});
    status.textContent=mode==="unavailable"?"Marcando oferta como indisponível…":mode==="price"?"Atualizando o preço…":mode==="offer"?"Salvando oferta e link de afiliado…":"Salvando produto e imagem…";
    const result=await api("POST",{capture:captured,affiliateUrl,category,mode,...(productId?{productId}:{})});
    matchedProduct=result.product;products.clear();products.set(result.product.id,result.product);renderProducts();
    document.querySelector("#match-status").textContent=`Já cadastrado: ${result.product.name}.`;
    status.textContent=`${result.message} ${(result.warnings || []).join(" ")}`;
  }catch(error){status.textContent=error.message;}
  finally{controls.forEach((control,index)=>control.disabled=disabled[index]);saving=false;renderActions();persistDraft();}
}
for(const [id,mode] of [["import","import"],["update-price","price"],["mark-unavailable","unavailable"],["update-full","full"],["save-offer","offer"]])document.querySelector(`#${id}`).addEventListener("click",()=>void saveProduct(mode));
document.querySelector("#download").addEventListener("click",()=>{
  if (!captured) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(captured,null,2)],{type:"application/json"}));
  const link = document.createElement("a");link.href=url;link.download=`comparacel-${captured.source}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function showCapture() {
    document.querySelector("#name").textContent = captured.name;
    document.querySelector("#price").textContent = (captured.price===null?"Preço não disponível":new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(captured.price)) + (captured.condition === "pix" ? " no Pix" : "");
    document.querySelector("#specs-status").textContent=captured.specs.length?`${captured.specs.length} características coletadas para a ficha técnica.`:"Nenhuma característica encontrada. Abra a seção de características do anúncio e clique em coletar novamente antes de importar.";
  document.querySelector("#preview").hidden=false;
}
function persistDraft() {
  if(!draftKey || !captured)return;
  void chrome.storage.local.set({[draftKey]:{
    capture:captured,site:site.value,savedAt:Date.now(),matchedProduct,
    products:[...products.values()],selected:productSelect.value,
    search:document.querySelector("#search").value,affiliate:document.querySelector("#affiliate").value,
    category:document.querySelector("#category").value,searchOpen:document.querySelector("#search-controls").open,
    matchStatus:document.querySelector("#match-status").textContent,status:status.textContent
  }});
}
for(const id of ["search","affiliate","category","product"]) {
  document.querySelector(`#${id}`).addEventListener("input",persistDraft);
  document.querySelector(`#${id}`).addEventListener("change",persistDraft);
}
document.querySelector("#search-controls").addEventListener("toggle",persistDraft);
// Restore the current announcement before deciding whether to collect again.
void initializePopup().catch(error=>{status.textContent=error.message;});
