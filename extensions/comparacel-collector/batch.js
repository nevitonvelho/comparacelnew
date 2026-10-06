/* global chrome */
const $ = selector => document.querySelector(selector);
const storageKey = "priceBatch";
const origins = ["https://*.amazon.com.br/*", "https://*.mercadolivre.com.br/*"];
let config, state, running = false, pauseRequested = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(method, body, query = "") {
  const response = await fetch(`${config.site}/api/extension/import${query}`, {
    method, headers: {Authorization: `Bearer ${config.key}`, "Content-Type": "application/json"},
    body: body ? JSON.stringify(body) : undefined, redirect: "error", signal: AbortSignal.timeout(70000)
  });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || `Falha HTTP ${response.status}`); error.status = response.status; throw error; }
  return data;
}
async function save() { await chrome.storage.local.set({[storageKey]: state}); render(); }
function render() {
  const completed = state?.index || 0, total = state?.queue.length || 0;
  $("#progress").max = Math.max(total, 1); $("#progress").value = completed;
  const updated = state?.results.filter(result => result.ok).length || 0;
  $("#counts").textContent = `${completed} de ${total} ofertas conferidas; ${updated} atualizadas; ${completed - updated} para revisão.`;
  $("#start").disabled = running || !total || completed >= total;
  $("#start").textContent = completed || state?.tabId ? "Continuar atualização" : "Iniciar atualização";
  $("#load").disabled = running; $("#days").disabled = running; $("#pause").disabled = !running;
  $("#skip").hidden = running || !state?.tabId || completed >= total;
  $("#results").replaceChildren();
  for (const result of state?.results || []) {
    const li = document.createElement("li"), link = document.createElement("a");
    link.href = result.pageUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = result.name;
    li.append(link, ` — ${result.ok ? "Preço atualizado" : result.error}`); $("#results").append(li);
  }
}
async function closeTab() {
  if (state.tabId) await chrome.tabs.remove(state.tabId).catch(() => {});
  state.tabId = null;
}
async function collect(tabId) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (pauseRequested) return null;
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") {
      try {
        await chrome.scripting.executeScript({target: {tabId}, files: ["collect.js"]});
        const [result] = await chrome.scripting.executeScript({target: {tabId}, func: () => {
          try { return {capture: globalThis.collectProduct()}; } catch (error) { return {error: error.message}; }
        }});
        if (result?.result?.capture) return result.result.capture;
        const message = result?.result?.error || "Não foi possível ler o anúncio.";
        if (/verificação|captcha/i.test(message)) { const error = new Error(message); error.blocked = true; throw error; }
        if (Date.now() + 3000 >= deadline) throw new Error(message);
      } catch (error) {
        if (error.blocked) throw error;
        // Redirects to login/challenge hosts may prevent script injection.
        if (/verification|captcha|\/login|signin/i.test(tab.url || "")) { error.blocked = true; throw error; }
        if (Date.now() + 3000 >= deadline) throw error;
      }
    }
    await sleep(3000);
  }
  throw new Error("A página demorou para carregar. Confira o anúncio manualmente.");
}
async function run() {
  if (running || !state || state.index >= state.queue.length) return;
  await navigator.locks.request("comparacel-price-batch", {ifAvailable: true}, async lock => {
    if (!lock) { $("#status").textContent = "Já existe uma atualização aberta em outra tela da extensão."; return; }
    running = true; pauseRequested = false; render();
    try {
      while (state.index < state.queue.length && !pauseRequested) {
        const item = state.queue[state.index];
        $("#status").textContent = `Conferindo ${item.name} (${item.source === "amazon" ? "Amazon" : "Mercado Livre"})…`;
        try {
          if (state.tabId) {
            try { await chrome.tabs.get(state.tabId); } catch { state.tabId = null; }
          }
          if (!state.tabId) { const tab = await chrome.tabs.create({url: item.pageUrl, active: false}); state.tabId = tab.id; await save(); }
          const capture = await collect(state.tabId);
          if (!capture || pauseRequested) break;
          await api("POST", {mode: "price", batch: true, productId: item.productId, storeId: item.storeId, offerUrl: item.offerUrl, capture});
          state.results.push({...item, ok: true});
        } catch (error) {
          if (error.blocked || [401, 403, 429].includes(error.status) || !error.status && /fetch|network|timeout/i.test(error.message)) {
            $("#status").textContent = `${error.message} Atualização pausada. Resolva e clique em Continuar.`;
            if (error.blocked && state.tabId) await chrome.tabs.update(state.tabId, {active: true});
            pauseRequested = true; break;
          }
          state.results.push({...item, ok: false, error: error.message});
        }
        state.index++; await closeTab(); await save();
        await sleep(5000);
      }
      if (!pauseRequested) $("#status").textContent = "Atualização concluída. Confira as pendências abaixo.";
      else if ($("#status").textContent.startsWith("Pausando")) $("#status").textContent = "Atualização pausada. Clique em Continuar quando desejar.";
    } catch (error) { $("#status").textContent = `${error.message} Clique em Continuar para tentar novamente.`; }
    finally { running = false; await save(); }
  });
}
$("#load").addEventListener("click", async () => {
  $("#load").disabled = true;
  try {
    const days = Number($("#days").value);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("Escolha um intervalo de 1 a 30 dias.");
    const data = await api("GET", null, `?queue=1&days=${days}`);
    if (!Array.isArray(data.queue)) throw new Error("O site conectado ainda não suporta a fila. Atualize o servidor Comparacel e tente novamente.");
    await navigator.locks.request("comparacel-price-batch", {ifAvailable: true}, async lock => {
      if (!lock) throw new Error("Já existe uma atualização em andamento em outra tela.");
      if (state) await closeTab();
      state = {site: config.site, queue: data.queue, index: 0, results: [], tabId: null}; await save();
      $("#status").textContent = data.queue.length ? `${data.queue.length} ofertas na fila. Clique em Iniciar atualização.` : "Nenhuma oferta com identificador precisa de atualização nesse intervalo.";
    });
  } catch (error) { $("#status").textContent = error.message; }
  finally { render(); }
});
$("#start").addEventListener("click", async () => {
  try {
    if (!await chrome.permissions.request({origins})) throw new Error("Permita acesso às lojas para atualizar os preços em lote.");
    // Reload progress in case another batch screen was used.
    const saved = (await chrome.storage.local.get(storageKey))[storageKey];
    if (saved?.site === config.site) state = saved;
    await run();
  } catch (error) { $("#status").textContent = error.message; }
});
$("#pause").addEventListener("click", () => { pauseRequested = true; $("#status").textContent = "Pausando após a operação atual…"; });
$("#skip").addEventListener("click", async () => {
  await navigator.locks.request("comparacel-price-batch", {ifAvailable: true}, async lock => {
    if (!lock) return;
    state = (await chrome.storage.local.get(storageKey))[storageKey];
    if (!state || state.index >= state.queue.length) return;
    state.results.push({...state.queue[state.index], ok: false, error: "Separado para revisão manual."});
    state.index++; await closeTab(); await save(); $("#status").textContent = "Anúncio separado para revisão. Clique em Continuar.";
  });
});
(async () => {
  config = await chrome.storage.local.get(["site", "key"]);
  if (!config.site || !config.key) return;
  const saved = (await chrome.storage.local.get(storageKey))[storageKey];
  state = saved?.site === config.site ? saved : null; render();
  $("#status").textContent = state ? "Progresso recuperado. Clique em Continuar ou carregue uma nova fila." : "Conectado. Carregue as ofertas desatualizadas.";
})();
