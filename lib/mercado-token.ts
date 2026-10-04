import "server-only";
import { randomUUID } from "node:crypto";
import { AdminError } from "./admin-model";
import { getAdminDatabase } from "./firebase/admin";

// This document is denied to browser clients by the Firestore catch-all rule.
export async function getMercadoToken(expired?: string): Promise<string> {
  const ref = getAdminDatabase().doc("adminImportCredentials/mercadolivre");
  const lease = randomUUID();
  const state = await getAdminDatabase().runTransaction(async tx => {
    const data = (await tx.get(ref)).data() ?? {};
    const accessToken = typeof data.accessToken === "string" ? data.accessToken : process.env.ML_ACCESS_TOKEN || "";
    if (accessToken && (!expired || accessToken !== expired)) return { accessToken, refreshToken: "" };
    const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : process.env.ML_REFRESH_TOKEN || "";
    if (!refreshToken || !process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) throw new AdminError("Configure ML_ACCESS_TOKEN ou ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REFRESH_TOKEN no servidor para importar do Mercado Livre.", 503);
    if (Number(data.lockUntil) > Date.now()) throw new AdminError("A autenticação do Mercado Livre está sendo renovada. Tente novamente em alguns segundos.", 429);
    tx.set(ref, { lease, lockUntil: Date.now() + 30000 }, { merge: true });
    return { accessToken: "", refreshToken };
  });
  if (state.accessToken) return state.accessToken;
  try {
    const response = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: process.env.ML_CLIENT_ID!, client_secret: process.env.ML_CLIENT_SECRET!, refresh_token: state.refreshToken }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new AdminError("Não foi possível renovar o token do Mercado Livre. Confira as credenciais ou autorize novamente a aplicação.", 503); }
    const data = await response.json();
    if (typeof data.access_token !== "string" || !data.access_token || typeof data.refresh_token !== "string" || !data.refresh_token) throw new AdminError("O Mercado Livre retornou uma autenticação inválida.", 502);
    await getAdminDatabase().runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.lease !== lease) throw new AdminError("A renovação do Mercado Livre perdeu a reserva. Tente novamente.", 503);
      tx.set(ref, { accessToken: data.access_token, refreshToken: data.refresh_token, lockUntil: 0 });
    });
    return data.access_token;
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError("Falha ao renovar a autenticação do Mercado Livre. Tente novamente.", 502);
  } finally {
    await getAdminDatabase().runTransaction(async tx => { if ((await tx.get(ref)).data()?.lease === lease) tx.update(ref, { lockUntil: 0 }); }).catch(() => {});
  }
}
