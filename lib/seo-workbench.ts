import { AdminError } from "./admin-model";

export type SeoFields = { title: string; metaDescription: string; description: string; tags: string[] };
export type SeoKind = "product" | "comparison";
export type SearchMetrics = { clicks: number; impressions: number; ctr: number; position: number };
export type SearchRow = SearchMetrics & { keys: string[] };
export type SearchSnapshot = { fetchedAt: string; startDate: string; endDate: string; previousStartDate: string; previousEndDate: string; rows: SearchRow[]; previousRows: SearchRow[]; truncated: boolean; property: string };
export type SeoPage = { path: string; kind: SeoKind; name: string; active: boolean; fields: SeoFields; fingerprint: string; score: number; issues: string[]; current: SearchMetrics | null; previous: SearchMetrics | null; performance: string };
export type SeoHistory = { id: string; at: string; email: string; before: SeoFields; after: SeoFields };
export type SeoDetail = { page: SeoPage; queries: SearchRow[]; queryWarning?: string; history: SeoHistory[] };
export type SeoPageSummary = Omit<SeoPage, "fields" | "fingerprint">;
export type SearchConnectionStatus = { connected: boolean; oauthAvailable: boolean; connectedAt: string | null; connectedBy: string | null; reason: string };
export type SeoReport = { connection: SearchConnectionStatus; pages: SeoPageSummary[]; snapshot: Omit<SearchSnapshot, "rows" | "previousRows"> | null; searchConfigured: boolean; geminiConfigured: boolean; truncated: boolean };

export function validateSeoPath(value: unknown): { path: string; kind: SeoKind; ids: string[] } {
  if (typeof value !== "string" || value.length > 900) throw new AdminError("Informe o caminho de um produto ou comparação.");
  const match = /^\/(produto|comparar)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value);
  if (!match) throw new AdminError("Use /produto/identificador ou /comparar/produto-a-vs-produto-b.");
  const ids = match[1] === "produto" ? [match[2]] : match[2].split("-vs-");
  if (ids.length !== (match[1] === "produto" ? 1 : 2) || new Set(ids).size !== ids.length || ids.some(id => !id || id.length > 400)) throw new AdminError("Caminho inválido.");
  if (ids.length === 2 && ids[0] > ids[1]) throw new AdminError("Use a URL canônica da comparação, com os identificadores em ordem alfabética.");
  return { path: value, kind: match[1] === "produto" ? "product" : "comparison", ids };
}

export function validateSeoFields(value: unknown): SeoFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminError("Confira os campos de SEO.");
  const data = value as Record<string, unknown>;
  function text(key: string, max: number, min = 1) {
    const value = data[key];
    if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /<[^>]*>|\u0000/.test(value)) throw new AdminError(`${key}: use texto simples entre ${min} e ${max} caracteres.`);
    return value.trim();
  }
  if (!Array.isArray(data.tags) || data.tags.length > 8 || data.tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 60 || /[<>\n\r]/.test(tag))) throw new AdminError("Use até 8 temas de no máximo 60 caracteres.");
  return { title: text("title", 70, 0), metaDescription: text("metaDescription", 160, 0), description: text("description", 12000, 0), tags: [...new Set(data.tags.map(tag => String(tag).trim()))] };
}

export function contentDiagnosis(fields: SeoFields, facts: { hasImage: boolean; specs: number; comparison?: boolean }) {
  const checks: [boolean, number, string][] = [
    [fields.title.trim().length >= 20 && fields.title.trim().length <= 70, 25, "Revise o título SEO: use um título descritivo e específico (20–70 caracteres como referência editorial)."],
    [fields.metaDescription.trim().length >= 90 && fields.metaDescription.trim().length <= 160, 25, "Escreva uma metadescrição específica (90–160 caracteres como referência editorial)."],
    [fields.description.trim().length >= 180, 25, "Amplie o conteúdo útil da descrição com fatos confirmados do cadastro."],
    [facts.hasImage, 10, "Cadastre uma imagem válida para os produtos."],
    [facts.specs >= (facts.comparison ? 10 : 5), 15, "Complete as especificações para dar mais informação à página."],
  ];
  return { score: checks.reduce((total, [pass, points]) => total + (pass ? points : 0), 0), issues: checks.filter(([pass]) => !pass).map(([, , issue]) => issue) };
}

export function performanceLabel(metrics: SearchMetrics | null) {
  if (!metrics) return "Sem dados no período";
  if (metrics.impressions < 30) return "Poucos dados";
  if (metrics.position <= 10 && metrics.ctr >= 0.02) return "Bom desempenho";
  if (metrics.position <= 20) return "Oportunidade de melhoria";
  return "Baixa visibilidade";
}

export function searchPeriods(now = new Date()) {
  // Search Console dates use Pacific Time. Leave three days for finalized data.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const date = new Date(`${today}T12:00:00Z`);
  const at = (offset: number) => { const value = new Date(date); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
  return { startDate: at(-30), endDate: at(-3), previousStartDate: at(-58), previousEndDate: at(-31) };
}

export function metricsForPath(rows: SearchRow[], path: string, origin: string): SearchMetrics | null {
  const url = new URL(path, origin).href;
  // Use canonical URLs exactly; do not merge different hosts, query strings or variants.
  const matches = rows.filter(row => row.keys[0] === url);
  const impressions = matches.reduce((sum, row) => sum + row.impressions, 0);
  if (!matches.length) return null;
  const clicks = matches.reduce((sum, row) => sum + row.clicks, 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? matches.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0 };
}
