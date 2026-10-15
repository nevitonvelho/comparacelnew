import "server-only";

type BackendSession = { user: { uid: string; displayName: string; email: string; photoURL: string | null } | null; csrfToken: string };
type BackendReply = { status: number; body: unknown; cookies: string[] };

function mergeCookies(header: string, additions: string[]) {
  const cookies = new Map(header.split(";").map(item => item.trim()).filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return [item.slice(0, index), item.slice(index + 1)] as const;
  }));
  for (const cookie of additions) {
    const pair = cookie.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function laravelAuth(method: "GET" | "POST" | "DELETE", cookieHeader: string, idToken?: string): Promise<BackendReply> {
  const configuredUrl = process.env.LARAVEL_BACKEND_URL;
  if (!configuredUrl) return { status: 200, body: { enabled: false, user: null }, cookies: [] };
  const base = new URL(configuredUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid backend URL");
  const sessionCookie = process.env.LARAVEL_SESSION_COOKIE || "comparacel_backend_session";
  if (method === "DELETE" && !cookieHeader.split(";").some(cookie => cookie.trim().startsWith(`${sessionCookie}=`))) {
    return { status: 200, body: { enabled: true, user: null }, cookies: [] };
  }
  const stateResponse = await fetch(new URL("/auth/session", base), {
    headers: { Accept: "application/json", Cookie: cookieHeader }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
  });
  const stateCookies = stateResponse.headers.getSetCookie();
  if (!stateResponse.ok) return { status: stateResponse.status, body: { error: "Não foi possível acessar sua sessão no backend." }, cookies: stateCookies };
  const state = await stateResponse.json() as BackendSession;
  if (method === "GET") return { status: 200, body: { enabled: true, user: state.user }, cookies: stateCookies };
  if (!state.csrfToken) throw new Error("Backend CSRF token missing");
  const response = await fetch(new URL(method === "POST" ? "/auth/google" : "/auth/session", base), {
    method, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-TOKEN": state.csrfToken, Cookie: mergeCookies(cookieHeader, stateCookies) },
    body: method === "POST" ? JSON.stringify({ idToken }) : undefined,
  });
  const payload = await response.json();
  const cookies = mergeResponseCookies(stateCookies, response.headers.getSetCookie());
  return {
    status: response.status,
    body: response.ok ? { enabled: true, user: payload.user } : { error: typeof payload.error === "string" ? payload.error : "Não foi possível autenticar sua conta no backend." },
    cookies,
  };
}

function mergeResponseCookies(initial: string[], updated: string[]) {
  const cookies = new Map<string, string>();
  for (const cookie of [...initial, ...updated]) cookies.set(cookie.split("=", 1)[0], cookie);
  return [...cookies.values()];
}
