import { load } from "cheerio";
import { AdminError } from "./admin-model";
import { inferImportSpec, type CollectedProduct, type ImportEntry } from "./admin-import-model";
export function parseAmazonProduct(html: string, entry: ImportEntry): CollectedProduct {
  const $ = load(html);
  const name = $("#productTitle").text().trim();
  if (!name || $("#captchacharacters").length) throw new AdminError("A Amazon não entregou a ficha (possível captcha). Tente novamente mais tarde.", 502);
  const externalId = entry.externalId || $("input#ASIN").attr("value") || $("link[rel=canonical]").attr("href")?.match(/\/dp\/([A-Z0-9]{10})/)?.[1] || "";
  if (!/^[A-Z0-9]{10}$/.test(externalId)) throw new AdminError("Não foi possível identificar o ASIN do produto.");
  const specs: CollectedProduct["specs"] = [];
  const seen = new Set<string>();
  function add(label: string, value: string) {
    const spec = inferImportSpec(label.replace(/[\u200e\u200f:]/g, "").trim(), value.replace(/[\u200e\u200f]/g, ""), "Especificações", specs.length);
    if (spec.slug && spec.name && spec.value && !seen.has(spec.slug) && specs.length < 200) { specs.push(spec); seen.add(spec.slug); }
  }
  $("#productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, table.prodDetTable tr, #technicalSpecifications_section_1 tr, #productOverview_feature_div tr").each((_, row) => {
    const cells = $(row).find("th, td"); if (cells.length >= 2) add($(cells[0]).text(), $(cells[1]).text());
  });
  $("#detailBullets_feature_div li").each((_, row) => { const label = $(row).find(".a-text-bold").first().text(); if (label) add(label, $(row).text().replace(label, "").replace(/^\s*:/, "")); });
  const byline = $("#bylineInfo").text().trim().replace(/^(Marca\s*:|Visite a loja|Brand\s*:)/i, "").trim();
  const brand = byline || specs.find(spec => ["marca", "fabricante"].includes(spec.slug))?.value || "Genérico";
  const priceText = $("#corePriceDisplay_desktop_feature_div .a-price .a-offscreen, #corePrice_feature_div .a-price .a-offscreen").first().text();
  const priceMatch = priceText.match(/(\d[\d.]*,\d{2})/);
  const image = $("#landingImage, #imgTagWrapperId img").first();
  let imageUrl = image.attr("data-old-hires") || image.attr("src") || "";
  try { const images = JSON.parse(image.attr("data-a-dynamic-image") || "{}"); imageUrl = image.attr("data-old-hires") || Object.keys(images)[0] || imageUrl; } catch { /* Use the regular image when dynamic metadata is absent. */ }
  return { name: name.slice(0, 300), brand: brand.slice(0, 120), description: $("#productDescription").text().trim().slice(0, 50000), imageUrl, price: priceMatch ? Number(priceMatch[1].replace(/\./g, "").replace(",", ".")) : null, specs, externalId, buyUrl: entry.buyUrl };
}
type MercadoDetail = { id?: string; name?: string; short_description?: string; pictures?: { url?: string }[]; buy_box_winner?: { price?: number }; attributes?: { id?: string; name?: string; value_name?: string; attribute_group_name?: string }[] };
export function parseMercadoProduct(detail: MercadoDetail, entry: ImportEntry): CollectedProduct {
  if (!detail.name || detail.id !== entry.externalId) throw new AdminError("A API não retornou a ficha do produto solicitado.");
  const specs: CollectedProduct["specs"] = [];
  const seen = new Set<string>();
  for (const attr of detail.attributes ?? []) {
    if (attr.id === "BRAND" || !attr.name || !attr.value_name) continue;
    const spec = inferImportSpec(attr.name, String(attr.value_name), attr.attribute_group_name || "Especificações", specs.length);
    const key = `${spec.group}:${spec.slug}`;
    if (spec.slug && !seen.has(key) && specs.length < 200) { specs.push(spec); seen.add(key); }
  }
  const price = detail.buy_box_winner?.price;
  return { name: detail.name.slice(0, 300), description: (typeof detail.short_description === "string" ? detail.short_description : "").slice(0, 50000), brand: (detail.attributes?.find(attr => attr.id === "BRAND")?.value_name || "Genérico").slice(0, 120), imageUrl: detail.pictures?.[0]?.url || "", price: typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null, specs, externalId: entry.externalId, buyUrl: entry.buyUrl };
}
