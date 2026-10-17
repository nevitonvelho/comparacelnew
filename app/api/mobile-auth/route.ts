import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDatabase } from "@/lib/firebase/admin";
export const runtime = "nodejs";
const lifetime = 5 * 60 * 1000;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function key() {
  const value =
    process.env.MOBILE_AUTH_ENCRYPTION_KEY || process.env.VIEWS_COOKIE_SECRET;
  if (!value) throw new Error("Mobile auth encryption unavailable");
  return createHash("sha256")
    .update(`comparacel-mobile-auth:${value}`)
    .digest();
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
function decrypt(value: string) {
  const [iv, tag, data] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    cipher.update(Buffer.from(data, "base64url")),
    cipher.final(),
  ]).toString("utf8");
}
function validReturn(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return (
      ["exp:", "exps:", "comparacel:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search
    );
  } catch {
    return false;
  }
}
function result(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("request");
  if (!validId(id)) return result({ error: "Solicitação inválida." }, 400);
  try {
    const data = (
      await getAdminDatabase().doc(`mobileLoginRequests/${id}`).get()
    ).data();
    if (
      !data ||
      data.expiresAt.toMillis() <= Date.now() ||
      data.status === "consumed"
    )
      return result(
        { error: "Esta solicitação expirou. Inicie o login novamente no app." },
        410,
      );
    return result({ status: data.status, returnUrl: data.returnUrl });
  } catch {
    return result({ error: "Não foi possível verificar a solicitação." }, 503);
  }
}
export async function POST(request: NextRequest) {
  try {
    key();
    const raw = await request.text();
    if (raw.length > 16000)
      return result({ error: "Solicitação inválida." }, 400);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      return result({ error: "Solicitação inválida." }, 400);
    }
    if (!body || typeof body !== "object")
      return result({ error: "Solicitação inválida." }, 400);
    const db = getAdminDatabase();
    const now = Date.now();
    if (body.action === "start") {
      if (
        typeof body.secret !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.secret) ||
        !validReturn(body.returnUrl)
      )
        return result({ error: "Solicitação inválida." }, 400);
      const ip = (request.headers.get("x-forwarded-for") || "unknown")
        .split(",")[0]
        .trim();
      const limit = db.doc(`mobileLoginLimits/${hash(ip)}`);
      const allowed = await db.runTransaction(async (tx) => {
        const previous = (await tx.get(limit)).data();
        const current = previous?.until?.toMillis?.() > now;
        const count = current ? Number(previous?.count || 0) : 0;
        if (count >= 10) return false;
        tx.set(limit, {
          count: count + 1,
          until: current ? previous!.until : new Date(now + 10 * 60 * 1000),
        });
        return true;
      });
      if (!allowed)
        return result(
          { error: "Muitas tentativas. Aguarde alguns minutos." },
          429,
        );
      const id = randomUUID(),
        code = String(randomInt(100000, 1000000));
      await db
        .doc(`mobileLoginRequests/${id}`)
        .create({
          secretHash: hash(body.secret),
          codeHash: hash(code),
          returnUrl: body.returnUrl,
          expiresAt: new Date(now + lifetime),
          status: "pending",
          attempts: 0,
        });
      return result({
        id,
        code,
        loginUrl: `${request.nextUrl.origin}/entrar-app?request=${id}`,
      });
    }
    if (!validId(body.id))
      return result({ error: "Solicitação inválida." }, 400);
    const reference = db.doc(`mobileLoginRequests/${body.id}`);
    if (body.action === "complete") {
      if (request.headers.get("origin") !== request.nextUrl.origin)
        return result({ error: "Origem inválida." }, 403);
      if (
        typeof body.code !== "string" ||
        !/^\d{6}$/.test(body.code) ||
        typeof body.googleIdToken !== "string" ||
        body.googleIdToken.length > 10000
      )
        return result({ error: "Informe o código exibido no app." }, 400);
      const authorization = request.headers.get("authorization");
      if (!authorization?.startsWith("Bearer "))
        return result({ error: "Entre com Google." }, 401);
      let account;
      try {
        account = await getAdminAuth().verifyIdToken(
          authorization.slice(7),
          true,
        );
      } catch {
        return result({ error: "Sua sessão expirou. Entre novamente." }, 401);
      }
      if (
        account.firebase.sign_in_provider !== "google.com" ||
        account.email_verified !== true
      )
        return result({ error: "Use uma conta Google verificada." }, 403);
      const checked = await db.runTransaction(async (tx) => {
        const data = (await tx.get(reference)).data();
        if (
          !data ||
          data.expiresAt.toMillis() <= now ||
          data.status !== "pending"
        )
          return "expired";
        if (data.attempts >= 5) return "locked";
        if (!equal(data.codeHash, hash(body.code as string))) {
          tx.update(reference, { attempts: data.attempts + 1 });
          return "wrong";
        }
        return "valid";
      });
      if (checked !== "valid")
        return result(
          {
            error:
              checked === "wrong"
                ? "O código não confere. Confira o código exibido no app."
                : "Solicitação expirada. Inicie novamente no app.",
          },
          checked === "wrong" ? 400 : 410,
        );
      // Validate the original Google credential against the SAME Firebase project.
      // A custom Firebase token would change the sign-in provider and break reaction rules.
      const verification = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            postBody: new URLSearchParams({
              id_token: body.googleIdToken,
              providerId: "google.com",
            }).toString(),
            requestUri: request.nextUrl.origin,
            returnSecureToken: true,
          }),
        },
      );
      const identity = await verification.json();
      if (
        !verification.ok ||
        identity.localId !== account.uid ||
        identity.providerId !== "google.com"
      )
        return result(
          { error: "Não foi possível confirmar a conta Google." },
          401,
        );
      const encryptedCredential = encrypt(body.googleIdToken);
      const committed = await db.runTransaction(async (tx) => {
        const data = (await tx.get(reference)).data();
        if (
          !data ||
          data.expiresAt.toMillis() <= Date.now() ||
          data.status !== "pending" ||
          data.attempts >= 5
        )
          return false;
        tx.update(reference, { encryptedCredential, status: "ready" });
        return true;
      });
      if (!committed)
        return result(
          { error: "Solicitação expirada. Inicie novamente no app." },
          410,
        );
      return result({ status: "ready" });
    }
    if (body.action === "claim" || body.action === "cancel") {
      if (
        typeof body.secret !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.secret)
      )
        return result({ error: "Solicitação inválida." }, 400);
      const claim = await db.runTransaction(async (tx) => {
        const data = (await tx.get(reference)).data();
        if (!data || !equal(data.secretHash, hash(body.secret as string)))
          return { error: "Solicitação inválida." };
        if (data.expiresAt.toMillis() <= now || data.status === "consumed") {
          tx.delete(reference);
          return { expired: true };
        }
        if (body.action === "cancel") {
          tx.delete(reference);
          return { cancelled: true };
        }
        if (data.status !== "ready") return { pending: true };
        const googleIdToken = decrypt(data.encryptedCredential);
        tx.delete(reference);
        return { googleIdToken };
      });
      if ("error" in claim) return result({ error: claim.error }, 403);
      if ("expired" in claim)
        return result({ error: "O login expirou. Tente novamente." }, 410);
      return result(claim);
    }
    return result({ error: "Solicitação inválida." }, 400);
  } catch {
    return result(
      { error: "Não foi possível conectar o login ao app. Tente novamente." },
      503,
    );
  }
}
