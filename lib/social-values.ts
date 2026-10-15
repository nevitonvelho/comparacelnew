export function googlePhoto(value: unknown): string | null { return typeof value === "string" && /^https:\/\/lh3\.googleusercontent\.com\//.test(value) ? value : null; }
