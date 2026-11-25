import type { IntakeDb } from './noah-intake-db.ts';
import { NOAH_COLLECTION_SOURCES, noahCollectionBlocked, parseCollectionSnapshot } from './noah-collection.ts';
import { parseStoredNoahPin, parseNoahPinForStorage } from './noah-pin-storage.ts';
import { NOAH_PIN_REVIEW_SIZE, isVote, noahPinReviewCounts, type NoahPinReviewBatch, type NoahPinReviewEntry, type NoahPinReviewVote } from './noah-pin-review-model.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';

const KEY = 'noah/pin-review/v1/current.json';
type Bucket = Pick<R2Bucket, 'get' | 'put'>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export async function readNoahPinReview(bucket: Pick<Bucket, 'get'>) {
  const object = await bucket.get(KEY);
  if (!object) return null;
  const raw: unknown = await object.json();
  if (!record(raw) || typeof raw.id !== 'string' || typeof raw.createdAt !== 'number' || !Array.isArray(raw.entries)
    || raw.entries.length !== NOAH_PIN_REVIEW_SIZE || !record(raw.votes)) throw Error('pin_review_invalid');
  const seen = new Set<string>();
  const entries = raw.entries.map((entry): NoahPinReviewEntry => {
    if (!record(entry) || typeof entry.id !== 'string' || seen.has(entry.id) || typeof entry.name !== 'string' ||
      typeof entry.original !== 'string') throw Error('pin_review_invalid');
    const pin = parseNoahPinForStorage(entry.pin);
    if (!pin) throw Error('pin_review_invalid');
    seen.add(entry.id);
    return { id: entry.id, name: entry.name, original: entry.original, pin };
  });
  const votes = Object.fromEntries(Object.entries(raw.votes).filter(([id, vote]) => seen.has(id) && isVote(vote))) as Record<string, NoahPinReviewVote>;
  return { etag: object.etag, batch: { id: raw.id, createdAt: raw.createdAt, entries, votes } satisfies NoahPinReviewBatch };
}

/** 公開設定と全 200 件の確定結果がそろった場合だけ、公開を許します。 */
export async function noahGeneratedPinsPublic(bucket: Pick<Bucket, 'get'> | undefined, flags: { NOAH_PINS_PUBLIC?: string }) {
  if (flags.NOAH_PINS_PUBLIC !== 'true' || !bucket) return false;
  try {
    const review = await readNoahPinReview(bucket);
    return !!review && noahPinReviewCounts(review.batch).passed;
  } catch {
    return false;
  }
}

export async function loadNoahPinReviewCandidates(db: Pick<IntakeDb, 'prepare'>, bucket: Pick<Bucket, 'get'>, now: number) {
  const candidates = new Map<string, NoahPinReviewEntry>();
  const snapshots = await Promise.all(NOAH_COLLECTION_SOURCES.map(async (source) => {
    const object = await bucket.get(`noah/collection/v1/${source}.json`);
    if (!object) return null;
    try { return parseCollectionSnapshot(await object.json(), now); } catch { return null; }
  }));
  for (const snapshot of snapshots) for (const item of snapshot?.items ?? []) {
    if (!item.pin || item.expiresAt <= now || noahCollectionBlocked(item)) continue;
    const id = item.source === 'mcp-registry' ? item.id : item.url;
    if (!candidates.has(id)) candidates.set(id, { id, name: item.name, original: item.summary, pin: item.pin });
  }

  // 本番の列がまだ無い間は、紹介のスナップショットから審査できます。
  const table = await db.prepare("SELECT name FROM pragma_table_info('noah_intake_candidates') WHERE name='pin_json'").first();
  if (!table) return [...candidates.values()];
  let after = '';
  while (true) {
    const result = await db.prepare(`SELECT c.id,c.name,c.summary,c.repository,c.pin_json
      FROM noah_intake_candidates c
      JOIN noah_intake_families f ON f.id=c.family_id AND f.representative_id=c.id
      WHERE c.id>? AND c.pin_json IS NOT NULL AND c.state='active'
        AND f.listed=1 AND f.hidden_at IS NULL AND f.withdrawn_at IS NULL
      ORDER BY c.id LIMIT 500`).bind(after).all<{ id: string; name: string; summary: string; repository: string | null; pin_json: string }>();
    for (const row of result.results) {
      const pin = parseStoredNoahPin(row.pin_json);
      if (pin && !noahCollectionBlocked({ name: row.name, summary: row.summary, url: row.repository ?? '' })) {
        candidates.set(row.id, { id: row.id, name: row.name, original: row.summary, pin });
      }
    }
    if (result.results.length < 500) break;
    after = result.results[result.results.length - 1].id;
  }
  return [...candidates.values()];
}

function randomIndex(bound: number) {
  const words = new Uint32Array(1);
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % bound);
  do { crypto.getRandomValues(words); } while (words[0] >= limit);
  return words[0] % bound;
}

export function sampleNoahPinReviews(entries: readonly NoahPinReviewEntry[]) {
  const sample = [...new Map(entries.map((item) => [item.id, item])).values()];
  if (sample.length < NOAH_PIN_REVIEW_SIZE) return [];
  for (let i = 0; i < NOAH_PIN_REVIEW_SIZE; i++) {
    const position = i + randomIndex(sample.length - i);
    [sample[i], sample[position]] = [sample[position], sample[i]];
  }
  return sample.slice(0, NOAH_PIN_REVIEW_SIZE);
}

export function createNoahPinReviewApi(deps: { bucket?: Bucket; authenticate: (request: Request) => Promise<string>; reviewers: string[];
  load: () => Promise<NoahPinReviewEntry[]>; now?: () => number }) {
  return async (request: Request) => {
    try {
      const owner = await deps.authenticate(request);
      if (!deps.reviewers.includes(owner)) return json({ error: '審査者だけが開けます。' }, 403);
      if (!deps.bucket) return json({ error: '審査の保存先を利用できません。' }, 503);
      if (request.method === 'GET') {
        const current = await readNoahPinReview(deps.bucket);
        return json({ batch: current?.batch ?? null });
      }
      if (request.method !== 'POST') return json({ error: '対応しない操作です。' }, 405);
      if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: '同じ Noah から操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(owner)) return json({ error: 'アカウントが変わりました。読み直してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON で操作してください。' }, 415);
      const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 4096)));
      if (!record(body)) return json({ error: '操作を確認してください。' }, 400);
      const current = await readNoahPinReview(deps.bucket);
      let batch: NoahPinReviewBatch;
      if (body.action === 'sample') {
        if (current && (body.batchId !== current.batch.id || noahPinReviewCounts(current.batch).reviewed < NOAH_PIN_REVIEW_SIZE)) {
          return json({ error: 'いまの標本の審査を先に終えてください。' }, 409);
        }
        const available = await deps.load();
        const entries = sampleNoahPinReviews(available);
        if (!entries.length) return json({ error: '審査できる図解ピンが 200 件に達していません。', available: available.length }, 409);
        batch = { id: crypto.randomUUID(), createdAt: (deps.now ?? Date.now)(), entries, votes: {} };
      } else if (body.action === 'vote' && typeof body.id === 'string' && isVote(body.vote)) {
        if (!current || body.batchId !== current.batch.id) return json({ error: '標本が変わりました。読み直してください。' }, 409);
        if (!current.batch.entries.some(({ id }) => id === body.id)) return json({ error: '標本にない図解です。' }, 400);
        batch = { ...current.batch, votes: { ...current.batch.votes, [body.id]: body.vote } };
      } else return json({ error: '判定と理由を確認してください。' }, 400);
      const saved = await deps.bucket.put(KEY, JSON.stringify(batch), { onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json' } });
      if (!saved) return json({ error: '別の審査者が更新しました。読み直してください。' }, 409);
      return json(body.action === 'vote' ? { id: batch.id, votes: batch.votes } : { batch });
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
      if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
      return json({ error: '審査を読み書きできません。少し待ってから再試行してください。' }, 503);
    }
  };
}
