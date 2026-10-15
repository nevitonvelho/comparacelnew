export const timestampKey = "__comparacel_timestamp";

export function encodeValues(value: unknown): unknown {
  if (value instanceof Date) return { [timestampKey]: value.toISOString() };
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return { [timestampKey]: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(encodeValues);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encodeValues(item)]));
  return value;
}

export function decodeValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeValues);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record[timestampKey] === "string" && Object.keys(record).length === 1) {
      const milliseconds = Date.parse(record[timestampKey]);
      return { seconds: Math.floor(milliseconds / 1000), nanoseconds: (milliseconds % 1000) * 1e6, toDate: () => new Date(milliseconds), toMillis: () => milliseconds };
    }
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decodeValues(item)]));
  }
  return value;
}
