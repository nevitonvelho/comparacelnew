import { AdminError } from "./admin-model";
type Purpose = "amazon" | "image" | "ml-api" | "ml-link";
export function allowedImportFetchUrl(raw: string, purpose: Purpose) {
  const url = new URL(raw);
  const hosts = purpose === "amazon" ? ["amazon.com.br", "www.amazon.com.br", "amzn.to"] : purpose === "ml-api" ? ["api.mercadolibre.com"] : purpose === "ml-link" ? ["meli.la", "mercadolivre.com.br", "www.mercadolivre.com.br", "produto.mercadolivre.com.br"] : ["m.media-amazon.com", "images-na.ssl-images-amazon.com", "images-eu.ssl-images-amazon.com", "http2.mlstatic.com"];
  if (purpose === "image" && url.protocol === "http:" && url.hostname === "http2.mlstatic.com") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname)) throw new AdminError("A fonte retornou um endereço não permitido.");
  return url;
}
export async function fetchImportResource(raw: string, purpose: Purpose, token?: string) {
  let url = allowedImportFetchUrl(raw, purpose);
  const maximum = purpose === "image" ? 5 * 1024 * 1024 : 3 * 1024 * 1024;
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    let response: Response;
    try { response = await fetch(url, { redirect: "manual", cache: "no-store", signal, headers: purpose === "ml-api" ? { Authorization: `Bearer ${token ?? ""}` } : { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9", Accept: purpose === "image" ? "image/*" : "text/html" } }); }
    catch { throw new AdminError("Não foi possível acessar a fonte; tente novamente.", 502); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new AdminError("Redirecionamento inválido da fonte.");
      url = allowedImportFetchUrl(new URL(location, url).href, purpose);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new AdminError(response.status === 401 && purpose === "ml-api" ? "O token do Mercado Livre expirou. Atualize ML_ACCESS_TOKEN no servidor." : `A fonte recusou o acesso (HTTP ${response.status}).`, 502); }
    if (Number(response.headers.get("content-length")) > maximum) { await response.body?.cancel(); throw new AdminError("Arquivo da fonte excedeu o limite de tamanho."); }
    const reader = response.body?.getReader();
    if (!reader) throw new AdminError("A fonte retornou um arquivo vazio.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > maximum) { await reader.cancel(); throw new AdminError("Arquivo da fonte excedeu o limite de tamanho."); } chunks.push(value); }
    } catch (error) { if (error instanceof AdminError) throw error; throw new AdminError("A transferência da fonte foi interrompida.", 502); }
    return { bytes: Buffer.concat(chunks), url: url.href, contentType: response.headers.get("content-type")?.split(";")[0] ?? "" };
  }
  throw new AdminError("A fonte redirecionou muitas vezes.");
}
