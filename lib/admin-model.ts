export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type AdminIdentity = { uid: string; email?: string; email_verified?: boolean; admin?: unknown; firebase?: { sign_in_provider?: string } };
export function isAdministrator(account: AdminIdentity, allowedEmails: string) {
  if (account.email_verified !== true || account.firebase?.sign_in_provider !== "google.com") return false;
  const emails = allowedEmails.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  return account.admin === true || Boolean(account.email && emails.includes(account.email.toLowerCase()));
}
export const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 200).replace(/-$/g, "");
export type AdminReference = { id: string; name: string; slug: string; website?: string };
export type AdminSpec = { slug: string; name: string; group: string; type: "text" | "number" | "bool"; value: string; unit: string; higherIsBetter: boolean | null; order: number };
export type AdminOffer = { id: string; storeId: string; price: number | null; url: string; available: boolean };
export type AdminProduct = { id: string; revision: number; name: string; description: string; brandId: string; category: string; imageUrl: string; isActive: boolean; overallScore: number; metaTitle: string; metaDescription: string; specs: AdminSpec[]; offers: AdminOffer[]; highlights: { kind: "pro" | "con"; text: string }[] };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminError("Dados inválidos.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, required = false) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new AdminError(`${field}: valor inválido (máximo ${max} caracteres).`);
  return value.trim();
}
function bool(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new AdminError(`${field}: valor inválido.`);
  return value;
}
function numeric(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new AdminError(`${field}: informe um número entre ${min} e ${max}.`);
  return value;
}
function list(value: unknown, field: string, max: number) {
  if (!Array.isArray(value) || value.length > max) throw new AdminError(`${field}: limite de ${max} itens.`);
  return value;
}
export function publicHttpUrl(value: unknown, field: string, optional = false) {
  const raw = text(value, field, 2000, !optional);
  if (!raw && optional) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new AdminError(`${field}: informe um link http ou https válido.`); }
}
export function validateAdminProduct(value: unknown): AdminProduct {
  const input = object(value);
  const id = text(input.id, "URL do produto", 400, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new AdminError("URL do produto: use letras minúsculas, números e hífens.");
  const revision = numeric(input.revision, "Versão", 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(revision)) throw new AdminError("Versão inválida.");
  const imageUrl = text(input.imageUrl, "Imagem", 2000);
  if (imageUrl && !imageUrl.startsWith("https://firebasestorage.googleapis.com/v0/b/comparacel.firebasestorage.app/o/products%2F")) throw new AdminError("Use uma imagem enviada ao Storage do Comparacel.");
  const specs = list(input.specs, "Especificações", 200).map(value => {
    const spec = object(value);
    const slug = text(spec.slug, "Identificador da especificação", 200, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AdminError("Identificador da especificação inválido.");
    if (!["text", "number", "bool"].includes(String(spec.type))) throw new AdminError("Tipo da especificação inválido.");
    const raw = text(spec.value, "Valor da especificação", 2000);
    if (spec.type === "number" && raw && !Number.isFinite(Number(raw))) throw new AdminError("Valor numérico da especificação inválido.");
    if (spec.type === "bool" && !["", "true", "false"].includes(raw)) throw new AdminError("Valor sim/não inválido.");
    if (spec.higherIsBetter !== null && typeof spec.higherIsBetter !== "boolean") throw new AdminError("Critério da especificação inválido.");
    const order = numeric(spec.order, "Ordem", 0, 10000);
    if (!Number.isInteger(order)) throw new AdminError("Ordem inválida.");
    return { slug, name: text(spec.name, "Nome da especificação", 200, true), group: text(spec.group, "Grupo", 200, true), type: spec.type as AdminSpec["type"], value: raw, unit: text(spec.unit, "Unidade", 60), higherIsBetter: spec.higherIsBetter as boolean | null, order };
  });
  if (new Set(specs.map(spec => `${spec.group}:${spec.slug}`)).size !== specs.length) throw new AdminError("Há especificações repetidas no mesmo grupo.");
  const offers = list(input.offers, "Ofertas", 50).map(value => {
    const offer = object(value);
    const storeId = text(offer.storeId, "Loja", 200, true);
    if (storeId.includes("/")) throw new AdminError("Loja inválida.");
    return { id: `store-${storeId}`, storeId, price: offer.price === null ? null : Math.round(numeric(offer.price, "Preço", 0.01, 100000000) * 100) / 100, url: publicHttpUrl(offer.url, "Link da oferta"), available: bool(offer.available, "Disponibilidade") };
  });
  if (new Set(offers.map(offer => offer.storeId)).size !== offers.length) throw new AdminError("Cadastre uma oferta por loja para este produto.");
  const highlights = list(input.highlights, "Destaques", 40).map(value => {
    const item = object(value);
    if (!["pro", "con"].includes(String(item.kind))) throw new AdminError("Tipo de destaque inválido.");
    return { kind: item.kind as "pro" | "con", text: text(item.text, "Destaque", 2000, true) };
  });
  const brandId = text(input.brandId, "Marca", 200, true);
  if (brandId.includes("/")) throw new AdminError("Marca inválida.");
  return { id, revision, name: text(input.name, "Nome", 300, true), description: text(input.description, "Descrição", 50000), brandId, category: text(input.category, "Categoria", 200, true), imageUrl, isActive: bool(input.isActive, "Ativação"), overallScore: numeric(input.overallScore, "Nota editorial", 0, 10), metaTitle: text(input.metaTitle, "Título SEO", 70), metaDescription: text(input.metaDescription, "Descrição SEO", 160), specs, offers, highlights };
}
export function validateReference(value: unknown) {
  const input = object(value);
  if (input.kind !== "brands" && input.kind !== "stores") throw new AdminError("Cadastro inválido.");
  const name = text(input.name, "Nome", 120, true);
  const slug = text(input.slug, "Identificador", 140, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new AdminError("Identificador inválido.");
  return { kind: input.kind, name, slug, website: publicHttpUrl(input.website ?? "", "Site", true) };
}
