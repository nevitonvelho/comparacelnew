export const PRICE_SOURCE_COOLDOWN_MS = 15 * 60 * 1000;

export function sourceAccessBlocked(message: string) {
  return /HTTP\s+(?:403|429)\b|captcha|verificação de acesso/i.test(message);
}

export function priceBudgetWait(data: Record<string, unknown>, now = Date.now()) {
  const lock = Math.max(0, Number(data.lockUntil ?? 0) - now);
  const interval = Math.max(0, 4100 - (now - Number(data.lastAt ?? 0)));
  const hourly = now - Number(data.windowAt ?? 0) < 3600000 && Number(data.count) >= 500
    ? Math.max(0, Number(data.windowAt) + 3600000 - now) : 0;
  return Math.max(lock, interval, hourly);
}
