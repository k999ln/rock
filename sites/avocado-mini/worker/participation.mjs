const MAX_BODY_BYTES = 4096;
const MAX_DAILY_SUBMISSIONS = 10;
const ATTEMPT_RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const CATEGORIES = new Set(['play', 'accessibility', 'creation', 'device', 'other']);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function plainText(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function httpsUrl(value, required) {
  if (value == null || value === '') return required ? null : '';
  if (typeof value !== 'string' || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.href;
  } catch { return null; }
}

async function payload(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return { error: json({ error: 'invalid_origin' }, 403) };
  if (!request.headers.get('content-type')?.startsWith('application/json')) return { error: json({ error: 'invalid_format' }, 415) };
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { error: json({ error: 'too_large' }, 413) };
    const data = JSON.parse(raw);
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('invalid JSON object');
    return { data };
  } catch { return { error: json({ error: 'invalid_format' }, 400) }; }
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function acceptAttempt(request, env) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.PARTICIPATION_ABUSE_KEY) return false;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = await sha256(`${env.PARTICIPATION_ABUSE_KEY}:${day}:${ip}`);
  await env.DB.prepare('DELETE FROM mini_creator_attempts WHERE created_at < ?').bind(now - ATTEMPT_RETENTION_MS).run();
  const result = await env.DB.prepare('INSERT INTO mini_creator_attempts (key, count, created_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?')
    .bind(key, now, MAX_DAILY_SUBMISSIONS).run();
  return result.meta?.changes === 1;
}

export async function availability(env) {
  if (!env.DB || !env.PARTICIPATION_ABUSE_KEY) return json({ open: false });
  try {
    await env.DB.prepare('SELECT id FROM mini_creator_submissions LIMIT 0').all();
    return json({ open: true, types: ['idea', 'game'] });
  } catch { return json({ open: false }); }
}

export async function submit(request, env) {
  if (!env.DB || !env.PARTICIPATION_ABUSE_KEY) return json({ error: 'unavailable' }, 503);
  const parsed = await payload(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  // A hidden browser field reduces accidental bot traffic; it never becomes a public post.
  if (body.website) return json({ error: 'invalid_submission' }, 400);
  const kind = body.kind;
  const title = plainText(body.title, 5, 100);
  const description = plainText(body.description, 20, 2000);
  const category = kind === 'idea' && CATEGORIES.has(body.category) ? body.category : null;
  const demoUrl = httpsUrl(body.demoUrl, kind === 'game');
  const sourceUrl = httpsUrl(body.sourceUrl, false);
  if (!['idea', 'game'].includes(kind) || !title || !description || demoUrl === null || sourceUrl === null
      || (kind === 'idea' && !category) || body.reviewConsent !== true) {
    return json({ error: 'invalid_submission' }, 400);
  }
  if (!await acceptAttempt(request, env)) return json({ error: 'rate_limited' }, 429);
  const id = crypto.randomUUID();
  const removalCode = crypto.randomUUID() + crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO mini_creator_submissions (id, kind, category, title, description, demo_url, source_url, status, removal_hash, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, kind, category, title, description, kind === 'game' ? demoUrl : null, sourceUrl || null,
      'received', await sha256(removalCode), '2026-10-18.1', now).run();
  return json({ id, removalCode, status: 'received', createdAt: now }, 201);
}

export async function remove(request, env) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);
  const parsed = await payload(request);
  if (parsed.error) return parsed.error;
  const { id, removalCode } = parsed.data;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)
      || typeof removalCode !== 'string' || !/^[0-9a-f-]{72}$/.test(removalCode)) {
    return json({ error: 'invalid_receipt' }, 400);
  }
  const result = await env.DB.prepare('DELETE FROM mini_creator_submissions WHERE id = ? AND removal_hash = ?')
    .bind(id, await sha256(removalCode)).run();
  return json({ removed: result.meta?.changes === 1 });
}
