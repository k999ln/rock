import { createHash, randomUUID } from "node:crypto";

export function nowIso(clock = Date) {
  return new clock().toISOString();
}

export function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function stableJson(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function parseJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function cleanText(value, label, max = 4000) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${label}_invalid`);
  return text;
}

export function safeId(value, label = "id") {
  const text = cleanText(String(value || ""), label, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(text)) throw new Error(`${label}_invalid`);
  return text;
}

export function currency(value) {
  const text = String(value || "JPY").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(text)) throw new Error("currency_invalid");
  return text;
}

export function jsonObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}_invalid`);
  return value;
}

export function assertSecretFree(value, location = "value") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSecretFree(item, `${location}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:password|cookie|access.?token|refresh.?token|api.?key|client.?secret|authorization)/i.test(key)) throw new Error(`${location}_contains_secret`);
    assertSecretFree(child, `${location}.${key}`);
  }
}

export function publicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/token|secret|authorization|api.?key/i.test(message)) return "provider_configuration_invalid";
  return message.slice(0, 300);
}
