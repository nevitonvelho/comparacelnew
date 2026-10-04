import { load } from "cheerio";
import { AdminError } from "./admin-model";
import { inferImportSpec, type CollectedProduct, type ImportEntry } from "./admin-import-model";
export function parseAmazonProduct(html: string, entry: ImportEntry): CollectedProduct {
  const $ = load(html);
  const name = $("#productTitle").text().trim();
  if ($("#captchacharacters, form[action*='validateCaptcha']").length || /robot check|captcha/i.test($("title").text())) throw new AdminError("A Amazon exigiu uma verificação de acesso. Tente atualizar este produto mais tarde.", 429);
  if (!name) throw new AdminError("A Amazon retornou uma página sem a ficha do produto. O preço anterior foi preservado; confira o link e tente mais tarde.", 502);
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
  let amazonPrice: number | null = null;
  const selectors = ["#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)", "#corePrice_feature_div .a-price:not(.a-text-price)", "#apex_desktop .priceToPay", "#apex_mobile .priceToPay", "#priceblock_ourprice", "#priceblock_dealprice"];
  for (const selector of selectors) {
    const node = $(selector).first();
    const amount = node.find(".a-offscreen").first().text() || (node.find(".a-price-whole").length ? `${node.find(".a-price-whole").first().text().replace(/[,\s]/g, "")},${node.find(".a-price-fraction").first().text()}` : node.text());
    const match = amount.match(/(\d[\d.]*,\d{2})/);
    const value = match ? Number(match[1].replace(/\./g, "").replace(",", ".")) : NaN;
    if (Number.isFinite(value) && value > 0) { amazonPrice = value; break; }
  }
  const image = $("#landingImage, #imgTagWrapperId img").first();
  let imageUrl = image.attr("data-old-hires") || image.attr("src") || "";
  try { const images = JSON.parse(image.attr("data-a-dynamic-image") || "{}"); imageUrl = image.attr("data-old-hires") || Object.keys(images)[0] || imageUrl; } catch { /* Use the regular image when dynamic metadata is absent. */ }
  return { name: name.slice(0, 300), brand: brand.slice(0, 120), description: $("#productDescription").text().trim().slice(0, 50000), imageUrl, price: amazonPrice, specs, externalId, buyUrl: entry.buyUrl };
}
export function parseMercadoProduct(html: string, entry: ImportEntry): CollectedProduct {
  const $ = load(html);
  if ($('form[action*="captcha"], #captcha, .g-recaptcha, input[name="captcha"]').length) throw new AdminError("O Mercado Livre exibiu uma verificação de acesso. Tente novamente mais tarde.", 502);
  const products: Record<string, unknown>[] = [];
  function collect(value: unknown, depth = 0) {
    if (!value || typeof value !== "object" || depth > 12) return;
    if (Array.isArray(value)) { value.forEach(item => collect(item, depth + 1)); return; }
    const object = value as Record<string, unknown>;
    const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
    if (types.includes("Product")) products.push(object);
    if (object["@graph"]) collect(object["@graph"], depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, node) => { try { collect(JSON.parse($(node).text())); } catch { /* Ignore malformed structured data. */ } });
  const product = products[0];
  const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  const name = clean($('.ui-pdp-title').first().text()) || clean(product?.name);
  if (!name || !entry.externalId) throw new AdminError("O Mercado Livre não entregou a ficha pública do produto (possível bloqueio). Tente novamente mais tarde.", 502);
  const specs: CollectedProduct["specs"] = [];
  const seen = new Set<string>();
  let brand = "";
  function add(label: string, value: string, group = "Especificações") {
    label = clean(label); value = clean(value);
    if (/^marca$/i.test(label)) brand = value;
    const spec = inferImportSpec(label, value, group, specs.length);
    const key = `${spec.group}:${spec.slug}`;
    if (spec.slug && spec.value && !seen.has(key) && specs.length < 200) { specs.push(spec); seen.add(key); }
  }
  $('.ui-pdp-specs__table tr, .andes-table tr').each((_, row) => {
    const cells = $(row).find('th, td');
    if (cells.length < 2) return;
    const group = clean($(row).closest('.ui-pdp-specs__table, .ui-pdp-specs__table-container').find('h2,h3,.ui-pdp-specs__table__title').first().text()) || "Especificações";
    add($(cells[0]).text(), $(cells[1]).text(), group);
  });
  const properties = product?.additionalProperty;
  if (Array.isArray(properties)) for (const item of properties) if (item && typeof item === "object") add(clean(item.name), typeof item.value === "number" ? String(item.value) : clean(item.value));
  const structuredBrand = product?.brand;
  brand ||= clean(typeof structuredBrand === "object" && structuredBrand ? (structuredBrand as Record<string, unknown>).name : structuredBrand) || "Genérico";
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const offer = offers && typeof offers === "object" ? offers as Record<string, unknown> : undefined;
  const priceNode = $('.ui-pdp-price__second-line .andes-money-amount').first();
  const fraction = priceNode.find('.andes-money-amount__fraction').first().text().replace(/[^0-9]/g, "");
  const cents = priceNode.find('.andes-money-amount__cents').first().text().trim();
  const domPrice = fraction ? Number(`${fraction}.${cents || "00"}`) : NaN;
  const structuredPrice = offer?.priceCurrency === "BRL" ? Number(offer.price ?? offer.lowPrice) : NaN;
  const price = Number.isFinite(domPrice) && domPrice > 0 ? domPrice : Number.isFinite(structuredPrice) && structuredPrice > 0 ? structuredPrice : null;
  const image = product?.image;
  const structuredImage = Array.isArray(image) ? image[0] : image;
  const imageUrl = clean(typeof structuredImage === "object" && structuredImage ? (structuredImage as Record<string, unknown>).url : structuredImage) || $('.ui-pdp-gallery__figure img').first().attr('data-zoom') || $('.ui-pdp-gallery__figure img').first().attr('src') || $('meta[property="og:image"]').attr('content') || "";
  const description = $('.ui-pdp-description__content').text().trim() || clean(product?.description);
  return { name: name.slice(0, 300), brand: brand.slice(0, 120), description: description.slice(0, 50000), imageUrl, price, specs, externalId: entry.externalId, buyUrl: entry.buyUrl };
}
