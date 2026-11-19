const MAX_BODY_BYTES = 2048;
const CONSENT_VERSION = '2026-10-19.1';
const MAX_DAILY_SUBMISSIONS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const choices = {
  kit: new Set(['value', 'performance', 'compact']),
  gpu: new Set(['5060ti', '5090', 'gb10']),
  ram: new Set(['64', '128']),
  ssd: new Set(['2', '4']),
  chassis: new Set(['studio', 'expanded', 'integrated']),
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

function validConfiguration(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  if (!Object.entries(choices).every(([key, options]) => options.has(value[key]))) return false;
  if (value.kit === 'compact') return value.gpu === 'gb10' && value.ram === '128' && value.ssd === '4' && value.chassis === 'integrated';
  if (value.gpu === 'gb10') return false;
  if (value.gpu === '5090' && value.chassis !== 'expanded') return false;
  return true;
}

function cleanText(value, maxLength) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length <= maxLength && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

async function bodyFrom(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return { error: json({ error: 'invalid_origin' }, 403) };
  if (!request.headers.get('content-type')?.startsWith('application/json')) return { error: json({ error: 'invalid_format' }, 415) };
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid body');
    return { value };
  } catch { return { error: json({ error: 'invalid_format' }, 400) }; }
}

async function sha256(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function rateAllowed(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.PARTICIPATION_ABUSE_KEY) return false;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = await sha256(`${env.PARTICIPATION_ABUSE_KEY}:pro-interest:${day}:${ip}`);
  await env.DB.prepare('DELETE FROM pro_interest_attempts WHERE created_at < ?').bind(now - 2 * DAY_MS).run();
  const result = await env.DB.prepare('INSERT INTO pro_interest_attempts (key, count, created_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?')
    .bind(key, now, MAX_DAILY_SUBMISSIONS).run();
  return result.meta?.changes === 1;
}

export async function availability(env) {
  if (!env.DB || !env.PARTICIPATION_ABUSE_KEY) return json({ open: false });
  try {
    await env.DB.prepare('SELECT id FROM pro_purchase_interests LIMIT 0').all();
    return json({ open: true, consentVersion: CONSENT_VERSION });
  } catch { return json({ open: false }); }
}

export async function submit(request, env) {
  if (new URL(request.url).hostname !== 'avocadopro.si') return json({ error: 'wrong_host' }, 404);
  if (!env.DB || !env.PARTICIPATION_ABUSE_KEY) return json({ error: 'unavailable' }, 503);
  const parsed = await bodyFrom(request);
  if (parsed.error) return parsed.error;
  const { value } = parsed;
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
  const region = cleanText(value.region, 80);
  const note = cleanText(value.note, 500);
  if (value.website || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,40}$/.test(email)
      || email.length > 254 || region === null || note === null || !validConfiguration(value.configuration)
      || value.contactConsent !== true || value.consentVersion !== CONSENT_VERSION) {
    return json({ error: 'invalid_submission' }, 400);
  }
  if (!await rateAllowed(request, env)) return json({ error: 'rate_limited' }, 429);
  const id = crypto.randomUUID();
  const removalCode = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  const configuration = Object.fromEntries(Object.keys(choices).map(key => [key, value.configuration[key]]));
  await env.DB.prepare('INSERT INTO pro_purchase_interests (id, email, region, note, configuration_json, status, removal_hash, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, region, note, JSON.stringify(configuration), 'received', await sha256(removalCode), CONSENT_VERSION, now).run();
  return json({ id, removalCode, status: 'received' }, 201);
}

export async function remove(request, env) {
  if (new URL(request.url).hostname !== 'avocadopro.si') return json({ error: 'wrong_host' }, 404);
  if (!env.DB) return json({ error: 'unavailable' }, 503);
  const parsed = await bodyFrom(request);
  if (parsed.error) return parsed.error;
  const { id, removalCode } = parsed.value;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)
      || typeof removalCode !== 'string' || !/^[0-9a-f-]{72}$/.test(removalCode)) return json({ error: 'invalid_receipt' }, 400);
  const result = await env.DB.prepare('DELETE FROM pro_purchase_interests WHERE id = ? AND removal_hash = ?')
    .bind(id, await sha256(removalCode)).run();
  return json({ removed: result.meta?.changes === 1 });
}

