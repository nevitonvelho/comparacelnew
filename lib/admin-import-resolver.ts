import { load } from "cheerio";
import { AdminError } from "./admin-model";
import { parseImportLine, type ImportEntry } from "./admin-import-model";
import { fetchImportResource } from "./admin-import-fetch";
export function mercadoEntryFromPage(entry: ImportEntry, url: string, html: string): ImportEntry {
  const $ = load(html);
  const candidates = [url, $("link[rel=canonical]").attr("href"), $('meta[property="og:url"]').attr("content")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { const result = parseImportLine(new URL(candidate, url).href, "mercadolivre"); if (result.externalId) return { ...result, buyUrl: entry.buyUrl }; } catch { /* Only verified catalog URLs may identify the product. */ }
  }
  throw new AdminError("O link curto não revelou uma URL de catálogo. Abra-o no navegador e cole: link meli.la + espaço + URL final do produto (/p/MLB…).");
}
export async function resolveMercadoEntry(entry: ImportEntry) {
  if (entry.externalId) return entry;
  let page;
  try { page = await fetchImportResource(entry.productUrl, "ml-link"); }
  catch { throw new AdminError("O Mercado Livre bloqueou ou não respondeu ao link curto. Abra-o no navegador e cole: link meli.la + espaço + URL final do produto (/p/MLB…).", 502); }
  return mercadoEntryFromPage(entry, page.url, page.bytes.toString("utf8"));
}
