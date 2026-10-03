import { AdminError, slugify, type AdminSpec } from "./admin-model";
export type ImportSource = "amazon" | "mercadolivre";
export type ImportEntry = { buyUrl: string; productUrl: string; externalId: string };
export type CollectedProduct = { name: string; brand: string; description: string; imageUrl: string; price: number | null; specs: AdminSpec[]; externalId: string; buyUrl: string };
export function importUrl(raw: string, source: ImportSource) {
  try {
    const url = new URL(raw);
    const hosts = source === "amazon" ? ["amazon.com.br", "www.amazon.com.br", "amzn.to"] : ["mercadolivre.com.br", "www.mercadolivre.com.br", "produto.mercadolivre.com.br", "meli.la"];
    if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname)) throw new Error();
    return url;
  } catch { throw new AdminError(`Use um link https válido ${source === "amazon" ? "da Amazon Brasil ou amzn.to" : "do Mercado Livre ou meli.la"}.`); }
}
export function parseImportLine(line: string, source: ImportSource): ImportEntry {
  const tokens = line.trim().split(/\s+/);
  if (!line.trim() || tokens.length > (source === "amazon" ? 1 : 2)) throw new AdminError("Formato da linha inválido.");
  const urls = tokens.map(token => importUrl(token, source));
  const buyUrl = urls[0].href;
  if (source === "amazon") {
    const externalId = urls[0].pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase() ?? "";
    if (!externalId && urls[0].hostname !== "amzn.to") throw new AdminError("O link da Amazon precisa conter /dp/ASIN ou ser um link amzn.to.");
    return { buyUrl, productUrl: externalId ? `https://www.amazon.com.br/dp/${externalId}` : buyUrl, externalId };
  }
  const product = urls.find(url => /^\/(?:.*\/)?p\/MLB\d+(?:\/|$)/.test(url.pathname));
  const externalId = product?.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1];
  if (!product || !externalId) throw new AdminError("Informe a URL de catálogo /p/MLB…; com afiliado, use: link meli.la + espaço + URL do produto.");
  return { buyUrl, productUrl: product.href, externalId };
}
export function parseImportText(raw: string) {
  if (raw.length > 200000) throw new AdminError("O arquivo deve ter até 200 KB.");
  const lines = [...new Set(raw.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.split("#", 1)[0].trim()).filter(Boolean))];
  if (!lines.length) throw new AdminError("Nenhum link encontrado.");
  if (lines.length > 200) throw new AdminError("Importe até 200 linhas por lote.");
  return lines;
}
export function inferImportSpec(name: string, value: string, group = "Especificações", order = 0): AdminSpec {
  const clean = value.trim().slice(0, 2000);
  const lower = clean.toLowerCase();
  const boolean = ["sim", "yes", "true"].includes(lower) ? "true" : ["não", "nao", "no", "false"].includes(lower) ? "false" : null;
  const numeric = clean.match(/^(-?\d+(?:[.,]\d+)?)\s*([^\d.,]{0,16})$/);
  return { slug: slugify(name), name: name.trim().slice(0, 200), group: group.trim().slice(0, 200), type: boolean !== null ? "bool" : numeric ? "number" : "text", value: boolean ?? (numeric ? numeric[1].replace(",", ".") : clean), unit: numeric && boolean === null ? numeric[2].trim() : "", higherIsBetter: null, order };
}
