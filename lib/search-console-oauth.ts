import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getAdminDatabase } from "./firebase/admin";
import { AdminError } from "./admin-model";

type OAuthClient = { client_id: string; client_secret: string; redirect_uris?: string[] };
export type SearchCredentials = { type?: string; client_email?: string; private_key?: string; web?: OAuthClient; installed?: OAuthClient };
export async function readSearchCredentials(): Promise<SearchCredentials> {
  try {
    const raw = process.env.SEARCH_CONSOLE_CREDENTIALS_JSON || await readFile(process.env.SEARCH_CONSOLE_CREDENTIALS_FILE || "", "utf8");
    return JSON.parse(raw);
  } catch { throw new AdminError("Configure as credenciais do Search Console no servidor.", 503); }
}
function tokenKey() {
  const secret = process.env.SEARCH_CONSOLE_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new AdminError("Configure a chave privada de proteção da conexão no servidor.", 503);
  return createHash("sha256").update(secret).digest();
}
export function encryptSearchSecret(value: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from("comparacel-search-console-v1"));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(part => part.toString("base64url")).join(".");
}
export function decryptSearchSecret(value: string): Record<string, unknown> {
  try {
    const [iv, tag, ciphertext] = value.split(".").map(part => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAAD(Buffer.from("comparacel-search-console-v1"));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  } catch { throw new AdminError("Não foi possível abrir a conexão salva. Autorize o Search Console novamente.", 503); }
}
export const searchConnectionRef = () => getAdminDatabase().collection("adminSeoConnections").doc("searchConsole");
export async function searchConnectionStatus() {
  const connection = (await searchConnectionRef().get()).data();
  let credentials: SearchCredentials | null = null;
  try { credentials = await readSearchCredentials(); } catch {}
  const oauthAvailable = Boolean(credentials?.web?.client_id && credentials.web.client_secret && (process.env.SEARCH_CONSOLE_TOKEN_SECRET?.length || 0) >= 32);
  const connected = connection?.disabled !== true && Boolean(credentials?.type === "service_account" || credentials && process.env.SEARCH_CONSOLE_REFRESH_TOKEN || connection?.encryptedTokens && connection?.clientId === credentials?.web?.client_id);
  return { connected, oauthAvailable, connectedAt: typeof connection?.connectedAt === "string" ? connection.connectedAt : null, connectedBy: typeof connection?.email === "string" ? connection.email : null, reason: oauthAvailable ? "" : credentials?.installed ? "O cliente OAuth atual é Desktop. Para autorizar aqui, configure um cliente Aplicativo da Web com o retorno HTTPS do Comparacel." : "Configure um cliente OAuth Aplicativo da Web e a proteção de tokens no servidor." };
}
