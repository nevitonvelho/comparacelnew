import { AdminError, slugify, type AdminSpec } from "./admin-model";
export type ImportSource = "amazon" | "mercadolivre";
export type ImportEntry = { buyUrl: string; productUrl: string; externalId: string; kind?: "catalog" | "item" };
export type CollectedProduct = { highlights?: {kind:"pro"|"con";text:string}[]; priceCondition?: "pix" | "standard"; attempts?: number; name: string; brand: string; description: string; imageUrl: string; price: number | null; specs: AdminSpec[]; externalId: string; buyUrl: string };
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
  for (const url of urls) {
    if (url.hostname === "meli.la") continue;
    const up = url.pathname.match(/\/up\/(MLBU\d+)(?:\/|$)/);
    const directItem = url.pathname.match(/^\/MLB-(\d+)(?:-|\/|$)/);
    if (!up && !directItem) continue;
    const hash = new URLSearchParams(url.hash.slice(1));
    const filter = url.searchParams.get("pdp_filters")?.match(/(?:^|[|,])item_id:(MLB\d+)(?:$|[|,])/i)?.[1];
    const itemId = directItem ? `MLB${directItem[1]}` : filter || url.searchParams.get("wid") || hash.get("wid");
    if (!itemId || !/^MLB\d+$/.test(itemId)) throw new AdminError("Este link /up/MLBU… precisa conter o anúncio: copie a URL completa, incluindo pdp_filters=item_id:MLB… ou wid=MLB….");
    return { buyUrl, productUrl: url.href, externalId: itemId, kind: "item" };
  }
  if (urls.some(url => /\/p\/MLBU\d+/.test(url.pathname))) throw new AdminError("Não troque /up/ por /p/. Cole a URL original completa do produto, incluindo o identificador do anúncio.");
  const product = urls.find(url => /^\/(?:.*\/)?p\/MLB\d+(?:\/|$)/.test(url.pathname));
  const externalId = product?.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1];
  if (!product || !externalId) {
    if (urls.length === 1 && urls[0].hostname === "meli.la") return { buyUrl, productUrl: buyUrl, externalId: "" };
    throw new AdminError("Não foi possível identificar o produto. Use /p/MLB… ou a URL original /up/MLBU… com pdp_filters=item_id:MLB…; coloque o link de afiliado primeiro.");
  }
  return { buyUrl, productUrl: product.href, externalId };
}
export function parseImportText(raw: string) {
  if (raw.length > 200000) throw new AdminError("O arquivo deve ter até 200 KB.");
  const lines = [...new Set(raw.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim().startsWith("#") ? "" : line.replace(/\s+#.*$/, "").trim()).filter(Boolean))];
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

export function inferImportHighlights(specs: AdminSpec[]): {kind:"pro"|"con";text:string}[] {
  const result:{kind:"pro"|"con";text:string}[]=[];
  for(const spec of specs) {
    const name=spec.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const yes=spec.type==="bool" && spec.value==="true";
    const no=spec.type==="bool" && spec.value==="false";
    // Editorial defaults only for explicitly declared features; no title guesses,
    // relative performance claims or missing-value negatives.
    if(yes && /\b(5g|nfc|bluetooth|wi-?fi|inverter|cancelamento de ruido)\b/.test(name))result.push({kind:"pro",text:`${spec.name}: Sim, conforme a ficha do anúncio.`});
    else if(no && /\b(carregador|carregamento sem fio|memoria expansivel|5g)\b/.test(name))result.push({kind:"con",text:`${spec.name}: Não, conforme a ficha do anúncio.`});
    else if(/^(rede movel|tipo de rede|rede de dados)$/.test(name) && /\b5g\b/i.test(spec.value))result.push({kind:"pro",text:"Rede móvel 5G informada na ficha do anúncio."});
    if(result.length>=8)break;
  }
  return result;
}

export function buildImportLine(affiliate: string, identity: string, source: ImportSource, kind: "catalog" | "item" = "catalog") {
  const buyUrl = affiliate.trim();
  if (!buyUrl) throw new AdminError("Informe o link de compra ou de afiliado.");
  if (source === "amazon") { parseImportLine(buyUrl, source); return buyUrl; }
  const value = identity.trim();
  if (!value) throw new AdminError("Informe também o ID ou a URL do produto.");
  let productUrl = value;
  if (/^MLBU\d+$/i.test(value)) throw new AdminError("Para MLBU…, cole a URL /up/ completa com item_id ou wid.");
  if (/^MLB-?\d+$/i.test(value)) {
    const id = value.toUpperCase().replace("-", "");
    productUrl = kind === "item" ? `https://produto.mercadolivre.com.br/MLB-${id.slice(3)}` : `https://www.mercadolivre.com.br/p/${id}`;
  }
  const line = `${buyUrl} ${productUrl}`;
  parseImportLine(line, source);
  return line;
}
