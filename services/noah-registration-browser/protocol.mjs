export const SESSION_MS = 240_000;
const enc = new TextEncoder();
export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
export async function boundedJson(request, maximum = 16_384) {
  const reader = request.body?.getReader(); if (!reader) throw Error('body');
  let size = 0, result = ''; const decoder = new TextDecoder();
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > maximum) throw Error('size'); result += decoder.decode(value, { stream: true }); } return JSON.parse(result + decoder.decode()); }
  finally { await reader.cancel().catch(() => {}); }
}
export async function signature(secret, timestamp, body) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}\n${body}`)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function authenticate(secret, request, body, now = Date.now()) {
  const time = request.headers.get('X-Noah-Time'), sig = request.headers.get('X-Noah-Signature');
  if (!secret || secret.length < 32 || !/^\d{13}$/.test(time ?? '') || Math.abs(now - Number(time)) > 30_000 || !/^[a-f0-9]{64}$/.test(sig ?? '')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(sig.match(/../g), x => parseInt(x, 16)), enc.encode(`${time}\n${body}`));
}
export function validEnvelope(input) {
  return input && /^[a-f0-9]{64}$/.test(input.owner) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id) && /^[a-z][a-z0-9_-]{0,79}$/.test(input.providerId) && ['register','status','frame','input','resume','cancel'].includes(input.action);
}
export function recipes(raw) {
  try {
    const list = JSON.parse(raw || '[]'); if (!Array.isArray(list) || list.length > 20) return [];
    const ids = new Set();
    for (const r of list) {
      if (!/^[a-z][a-z0-9_-]{0,79}$/.test(r.id) || r.id === 'fixture' || ids.has(r.id) || !Number.isSafeInteger(r.revision) || r.revision < 1) throw Error('recipe');
      ids.add(r.id);
      if (!Array.isArray(r.domains) || !r.domains.length || r.domains.length > 20 || r.domains.some(d => !/^(?!localhost$)(?!.*\.local$)[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}$/.test(d))) throw Error('domains');
      for (const value of [r.startUrl, r.verifyUrl]) { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.port || !r.domains.includes(u.hostname)) throw Error('url'); }
      if (!Array.isArray(r.fields) || !r.fields.length || r.fields.length > 16 || r.fields.some(f => !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) || ['constructor','prototype','__proto__'].includes(f.key) || typeof f.selector !== 'string' || f.selector.length > 160) || new Set(r.fields.map(f => f.key)).size !== r.fields.length) throw Error('fields');
      if (typeof r.submit !== 'string' || !r.submit || r.submit.length > 160 || typeof r.credentialSelector !== 'string' || !r.credentialSelector || r.credentialSelector.length > 160 || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(r.identityField)) throw Error('verification');
    }
    return list;
  } catch { return []; }
}
export function validValues(recipe, values) {
  return values && typeof values === 'object' && !Array.isArray(values) && Object.keys(values).every(k => recipe.fields.some(f => f.key === k)) && recipe.fields.every(f => typeof values[f.key] === 'string' && values[f.key].length <= 1024 && (!f.required || values[f.key].trim()));
}
export function validInput(input) {
  if (!input || !Number.isSafeInteger(input.sequence) || input.sequence < 1) return false;
  if (input.kind === 'click') return Number.isFinite(input.x) && Number.isFinite(input.y) && input.x >= 0 && input.x < 390 && input.y >= 0 && input.y < 640;
  if (input.kind === 'text') return typeof input.text === 'string' && input.text.length > 0 && input.text.length <= 1024 && !Array.from(input.text).some(c => [0,10,13].includes(c.charCodeAt(0)));
  if (input.kind === 'key') return ['Tab','Backspace','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(input.key);
  if (input.kind === 'scroll') return Number.isFinite(input.delta) && Math.abs(input.delta) <= 640;
  return false;
}
