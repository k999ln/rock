import { publicError, sha256 } from "../util.mjs";

export async function requestJson(url, options = {}) {
  const timeoutMs = options.timeoutMs || 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw_digest: sha256(text) }; }
    if (!response.ok) {
      const error = new Error(`provider_http_${response.status}`);
      error.providerStatus = response.status;
      error.providerBodyDigest = sha256(text);
      throw error;
    }
    return { body, status: response.status, readback_digest: sha256(body) };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("provider_timeout");
    if (error.providerStatus) throw error;
    throw new Error(publicError(error));
  } finally {
    clearTimeout(timeout);
  }
}

export function required(value, code) {
  if (!value) throw new Error(code);
  return value;
}

export function allowlistedUrl(value, config) {
  const url = new URL(required(value, "provider_url_not_configured"));
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("provider_url_invalid");
  if (!config.allowedHosts?.includes(url.hostname.toLowerCase())) throw new Error("provider_host_not_allowlisted");
  return url.toString().replace(/\/$/, "");
}

export function authHeaders(token) {
  return { authorization: `Bearer ${required(token, "provider_token_not_configured")}` };
}
