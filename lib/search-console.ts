import "server-only";
import { createHash } from "node:crypto";
import { readSearchCredentials, searchConnectionRef, decryptSearchSecret } from "./search-console-oauth";
import { createSign } from "node:crypto";
import { AdminError } from "./admin-model";
import { searchPeriods, type SearchRow, type SearchSnapshot } from "./seo-workbench";

const scope = "https://www.googleapis.com/auth/webmasters.readonly";
let cachedToken: { token: string; expires: number; source: string } | undefined;
export function searchConsoleConfigured() {
  return Boolean(process.env.SEARCH_CONSOLE_CREDENTIALS_JSON || process.env.SEARCH_CONSOLE_CREDENTIALS_FILE);
}
async function accessToken() {
  const credentials = await readSearchCredentials();
  const connection = (await searchConnectionRef().get()).data();
  if (connection?.disabled === true) throw new AdminError("Autorize o Search Console pelo botão no painel.", 503);
  const client = credentials.web || credentials.installed;
  let refreshToken = process.env.SEARCH_CONSOLE_REFRESH_TOKEN;
  if (connection?.encryptedTokens) {
    if (connection.clientId !== client?.client_id) throw new AdminError("O cliente Google mudou. Autorize novamente no painel.", 503);
    const saved = decryptSearchSecret(connection.encryptedTokens);
    refreshToken = typeof saved.refreshToken === "string" ? saved.refreshToken : undefined;
  }
  const source = createHash("sha256").update(JSON.stringify({ credentials, refreshToken })).digest("hex");
  if (cachedToken && cachedToken.source === source && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  const params = new URLSearchParams();
  if (credentials.type === "service_account") {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: credentials.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(credentials.private_key || "", "base64url");
    params.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"); params.set("assertion", `${unsigned}.${signature}`);
  } else {
    if (!client?.client_id || !client.client_secret || !refreshToken) throw new AdminError("Autorize a conta Google pelo botão no painel de SEO.", 503);
    params.set("client_id", client.client_id); params.set("client_secret", client.client_secret);
    params.set("refresh_token", refreshToken!); params.set("grant_type", "refresh_token");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: params, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new AdminError("O Google recusou a autorização do Search Console. Reconecte a conta e confira as permissões.", 502);
  const data = await response.json();
  if (typeof data.access_token !== "string") throw new AdminError("O Google não retornou uma autorização válida.", 502);
  cachedToken = { source, token: data.access_token, expires: Date.now() + Math.min(Number(data.expires_in) || 3600, 3600) * 1000 };
  return data.access_token as string;
}

export async function querySearchConsole(body: Record<string, unknown>): Promise<{ rows: SearchRow[] }> {
  const property = process.env.SEARCH_CONSOLE_PROPERTY || "sc-domain:comparacel.com.br";
  const token = await accessToken();
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: "web", dataState: "final", ...body }), cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new AdminError(response.status === 403 ? "Sem acesso à propriedade do Search Console. Confira a conta autorizada, a propriedade e a ativação da API." : "Não foi possível consultar o Search Console. Tente novamente mais tarde.", 502);
  const data = await response.json();
  return { rows: (Array.isArray(data.rows) ? data.rows : []).filter((row: SearchRow) => Array.isArray(row.keys) && row.keys.every(key => typeof key === "string") && [row.clicks, row.impressions, row.ctr, row.position].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) };
}

export async function fetchSearchSnapshot(): Promise<SearchSnapshot> {
  const periods = searchPeriods();
  async function period(startDate: string, endDate: string) {
    const rows: SearchRow[] = [];
    for (let page = 0; page < 4; page++) {
      const result = await querySearchConsole({ startDate, endDate, dimensions: ["page"], aggregationType: "byPage", rowLimit: 25000, startRow: page * 25000 });
      rows.push(...result.rows);
      if (result.rows.length < 25000) return { rows, truncated: false };
    }
    return { rows, truncated: true };
  }
  const [current, previous] = await Promise.all([period(periods.startDate, periods.endDate), period(periods.previousStartDate, periods.previousEndDate)]);
  return { ...periods, rows: current.rows, previousRows: previous.rows, truncated: current.truncated || previous.truncated, fetchedAt: new Date().toISOString(), property: process.env.SEARCH_CONSOLE_PROPERTY || "sc-domain:comparacel.com.br" };
}
