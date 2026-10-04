import { AdminError } from "./admin-model";
import { inferImportSpec, type CollectedProduct, type ImportEntry } from "./admin-import-model";

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const price = (value: unknown) => {
  const number = typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function mapMercadoApiProduct(value: unknown, entry: ImportEntry): CollectedProduct {
  const data = object(value);
  if (data.id !== entry.externalId || !text(data.name)) throw new AdminError("A API não retornou a ficha do produto solicitado.", 502);
  const attributes = Array.isArray(data.attributes) ? data.attributes.map(object) : [];
  const specs: CollectedProduct["specs"] = [];
  const seen = new Set<string>();
  for (const attribute of attributes) {
    if (attribute.id === "BRAND" || !text(attribute.name) || !text(attribute.value_name)) continue;
    const spec = inferImportSpec(text(attribute.name), text(attribute.value_name), text(attribute.attribute_group_name) || "Especificações", specs.length);
    const key = `${spec.group}:${spec.slug}`;
    if (spec.slug && !seen.has(key) && specs.length < 200) { specs.push(spec); seen.add(key); }
  }
  const picture = object(Array.isArray(data.pictures) ? data.pictures[0] : undefined);
  const winner = object(data.buy_box_winner);
  return {
    name: text(data.name).slice(0, 300),
    brand: (text(attributes.find(attribute => attribute.id === "BRAND")?.value_name) || "Genérico").slice(0, 120),
    description: (text(data.short_description) || text(data.name)).slice(0, 50000),
    imageUrl: text(picture.secure_url) || text(picture.url),
    price: winner.currency_id === "BRL" ? price(winner.price) : null,
    specs, externalId: entry.externalId, buyUrl: entry.buyUrl,
  };
}

export function mapMercadoApiItem(value: unknown, entry: ImportEntry): CollectedProduct {
  const data = object(value);
  if (data.id !== entry.externalId || !text(data.title)) throw new AdminError("A API não retornou o anúncio solicitado.", 502);
  if (data.status !== "active") throw new AdminError("Este anúncio está pausado ou indisponível. Use um anúncio ativo.", 502);
  const collected = mapMercadoApiProduct({ ...data, name: data.title, short_description: data.title, buy_box_winner: { price: data.price, currency_id: data.currency_id } }, entry);
  return { ...collected, externalId: `item-${entry.externalId}` };
}

export async function fetchMercadoApiProduct(entry: ImportEntry, getToken: (expired?: string) => Promise<string>, priceOnly = false) {
  if (!/^MLB\d+$/.test(entry.externalId)) throw new AdminError("Abra o link de afiliado e informe também a URL do produto com /p/MLB….");
  let token = await getToken();
  async function request(path: string) {
    const send = () => fetch(`https://api.mercadolibre.com${path}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    try {
      let response = await send();
      if (response.status === 401) { await response.body?.cancel(); token = await getToken(token); response = await send(); }
      if (!response.ok) {
        await response.body?.cancel();
        const message = response.status === 401 ? "Token do Mercado Livre expirado. Configure as credenciais de renovação."
          : response.status === 403 ? "A API do Mercado Livre recusou o acesso. Confira as permissões da aplicação."
          : response.status === 404 ? "Produto ou anúncio não encontrado no Mercado Livre. Confira a URL original."
          : `A API do Mercado Livre respondeu com HTTP ${response.status}. Tente novamente mais tarde.`;
        throw new AdminError(message, response.status === 429 ? 429 : 502);
      }
      return object(await response.json());
    } catch (error) {
      if (error instanceof AdminError) throw error;
      throw new AdminError("Não foi possível consultar a API do Mercado Livre. Tente novamente.", 502);
    }
  }
  async function currentSalePrice(itemId: string, fallback: number | null) {
    if (!/^MLB\d+$/.test(itemId)) return fallback;
    try {
      const sale = await request(`/items/${itemId}/sale_price?context=channel_marketplace`);
      return sale.currency_id === "BRL" ? price(sale.amount) ?? fallback : fallback;
    } catch(error) { if(error instanceof AdminError && error.status === 429)throw error; return fallback; }
  }
  if (entry.kind === "item") {
    const collected = mapMercadoApiItem(await request(`/items/${entry.externalId}?include_attributes=all`), entry);
    collected.price = await currentSalePrice(entry.externalId, collected.price);
    if (!priceOnly) try { const description = await request(`/items/${entry.externalId}/description`); collected.description = text(description.plain_text).slice(0, 50000) || collected.description; }
    catch (error) { if (error instanceof AdminError && error.status === 429) throw error; }
    return collected;
  }
  const detail = await request(`/products/${entry.externalId}`);
  const collected = mapMercadoApiProduct(detail, entry);
  const winner = object(detail.buy_box_winner);
  collected.price = await currentSalePrice(text(winner.item_id) || text(winner.id), collected.price);
  // A different seller's catalog offer cannot confirm the affiliate link price.
  // Leave null when the API does not identify a priced catalog winner.
  return collected;
}
