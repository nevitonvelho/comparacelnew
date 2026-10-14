/* global chrome */
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if(message?.type !== "comparacel-listing")return;
  const host = new URL(sender.url || "https://invalid.local").hostname;
  const source = ["amazon.com.br", "www.amazon.com.br"].includes(host) ? "amazon" : ["mercadolivre.com.br", "www.mercadolivre.com.br", "lista.mercadolivre.com.br"].includes(host) ? "mercadolivre" : null;
  if(!source || !sender.tab)return;
  void (async () => {
    try {
      const {site, key} = await chrome.storage.local.get(["site", "key"]);
      if(!key)throw new Error("Conecte a extensão ao Comparacel para conferir os produtos.");
      const url = new URL(site || "http://localhost:3000");
      if(url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")))throw new Error("Confira o endereço na extensão.");
      const response = await fetch(`${url.origin}/api/extension/import`, {
        method: "POST", headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
        body: JSON.stringify({mode: "lookup-listing", source, entries: message.entries}),
        redirect: "error", signal: AbortSignal.timeout(25000)
      });
      const data = await response.json();
      if(!response.ok || !Array.isArray(data.results))throw new Error(data.error || "Atualize o Comparacel para conferir a busca.");
      respond({results: data.results, origin: url.origin});
    }catch(error){respond({error: error.message || "Não foi possível consultar o Comparacel."});}
  })();
  return true;
});
