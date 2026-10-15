import type { User } from "firebase/auth";

const pending = new Map<string, Promise<void>>();
export function syncLaravelSession(user: User): Promise<void> {
  const existing = pending.get(user.uid);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch("/api/auth/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await user.getIdToken() }), cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok || (body.enabled && body.user?.uid !== user.uid)) throw new Error("Não foi possível vincular seu acesso ao backend. Tente novamente.");
  })();
  pending.set(user.uid, request);
  void request.then(() => pending.delete(user.uid), () => pending.delete(user.uid));
  return request;
}

export async function endLaravelSession() {
  // A pending login must finish before logout, otherwise it could recreate the session.
  await Promise.allSettled([...pending.values()]);
  const response = await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível encerrar a sessão no backend. Tente novamente.");
}
