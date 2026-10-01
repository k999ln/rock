import { createHmac, timingSafeEqual } from "node:crypto";
import { id, nowIso, sha256, stableJson } from "./util.mjs";

function base64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signature(encoded, secret) {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function requireApprovalSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) throw new Error("approval_secret_not_configured");
  return secret;
}

export function createApproval(store, { action, risk, payload, summary, ttlSeconds = 900 }, clock = Date) {
  const createdAt = nowIso(clock);
  const approvalId = id("apr");
  const payloadJson = stableJson(payload);
  const digest = sha256(payloadJson);
  const expiresAt = new Date(new clock(createdAt).getTime() + ttlSeconds * 1000).toISOString();
  store.run(
    `INSERT INTO approval_requests
      (id, action, risk, payload_json, payload_digest, summary, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    approvalId, action, risk, payloadJson, digest, summary, expiresAt, createdAt, createdAt,
  );
  return { approval_id: approvalId, action, risk, summary, payload_digest: digest, expires_at: expiresAt, status: "pending" };
}

export function signApprovalGrant(request, actorId, secret, options = {}) {
  requireApprovalSecret(secret);
  if (!request || request.status !== "pending") throw new Error("approval_not_pending");
  const nowMs = options.nowMs ?? Date.now();
  const claims = {
    approval_id: request.id,
    payload_digest: request.payload_digest,
    actor_id: String(actorId || "").trim(),
    iat: Math.floor(nowMs / 1000),
    exp: Math.min(Math.floor(Date.parse(request.expires_at) / 1000), Math.floor(nowMs / 1000) + 900),
  };
  if (!claims.actor_id || claims.actor_id.length > 160) throw new Error("approval_actor_invalid");
  const encoded = base64url(stableJson(claims));
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyApprovalGrant(token, request, secret, options = {}) {
  requireApprovalSecret(secret);
  const [encoded, supplied, extra] = String(token || "").split(".");
  if (!encoded || !supplied || extra) throw new Error("approval_grant_invalid");
  const expected = signature(encoded, secret);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("approval_grant_invalid");
  let claims;
  try { claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new Error("approval_grant_invalid"); }
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (claims.approval_id !== request.id || claims.payload_digest !== request.payload_digest) throw new Error("approval_grant_scope_mismatch");
  if (!claims.actor_id || claims.exp < nowSeconds || claims.iat > nowSeconds + 30) throw new Error("approval_grant_expired");
  if (Date.parse(request.expires_at) <= nowSeconds * 1000) throw new Error("approval_request_expired");
  return claims;
}
