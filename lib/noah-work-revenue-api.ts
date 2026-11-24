import { eveCombinationFile } from './eve-combination-catalog.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { createNoahBrowserQuota } from './noah-browser-quota.ts';
import {
  initialNoahRevenue,
  revenueAuthorRelation,
  isNoahRevenueOperation,
  revenueDispatchHash,
  storedRevenueDispatch,
  type NoahRevenueConfig,
  type RevenueStage,
} from './noah-revenue-operation.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import { verifyReceiptSignature } from './receipt-signature.ts';
import { type WorkJob } from './workflow.ts';

type Db = Pick<D1Database, 'prepare'>;
type Dependencies = {
  db: Db;
  authenticate(request: Request): Promise<string>;
  now?: () => number;
  revenueConfig?: NoahRevenueConfig;
};
// Existing provider clients use the full UUID-shaped identifier range accepted by Noah.
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const token = (v: unknown, max = 160): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= max &&
  /^[\x21-\x7e]+$/.test(v);
const sources = {
  approved: 'asp-approval',
  paid: 'bank-deposit',
  cost: 'final-work-cost',
} as const;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const bad = (status: number, error: string) =>
  new NoahAgentError(error, status);
function record(raw: string, keys: readonly string[]): Record<string, unknown> {
  const data: unknown = JSON.parse(raw);
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some((key) => !keys.includes(key))
  )
    throw bad(400, '送信内容を確認してください。');
  return data as Record<string, unknown>;
}
async function rawBody(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw bad(415, 'JSONで送信してください。');
  return new TextDecoder('utf-8', { fatal: true }).decode(
    await boundedNoahBody(request, 4096),
  );
}
async function sha256(parts: unknown[]) {
  const data = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(parts)),
  );
  return Array.from(new Uint8Array(data), (n) =>
    n.toString(16).padStart(2, '0'),
  ).join('');
}
async function respond(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof NoahAgentError)
      return json({ error: e.message }, e.status);
    if (
      e instanceof SyntaxError ||
      (e instanceof TypeError && /encoded data/i.test(e.message))
    )
      return json({ error: '送信内容を読み取れません。' }, 400);
    if (e instanceof Error && e.message === 'UNAUTHORIZED')
      return json({ error: '本人確認が必要です。' }, 401);
    return json(
      { error: '記録を保存できません。時間をおいて再試行してください。' },
      503,
    );
  }
}
export function createNoahWorkRevenueApi(deps: Dependencies) {
  const db = deps.db,
    now = deps.now ?? Date.now,
    cfg = deps.revenueConfig;
  return {
    start: (request: Request) =>
      respond(async () => {
        if (request.headers.get('origin') !== new URL(request.url).origin)
          throw bad(403, 'このサイトから操作してください。');
        const owner = await deps.authenticate(request),
          ownerScope = await ownerScopeFor(owner);
        if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope)
          throw bad(409, '保存先のアカウントを確認してください。');
        const body = record(await rawBody(request), [
          'combinationId',
          'requestId',
        ]);
        if (
          typeof body.requestId !== 'string' ||
          !uuid.test(body.requestId) ||
          !token(body.combinationId)
        )
          throw bad(400, '仕事と操作IDを確認してください。');
        const c = eveCombinationFile(body.combinationId);
        if (!c) throw bad(404, '収益運用の組み合わせが見つかりません。');
        // Owner-scoped deterministic UUID. Retrying one start cannot create a second case.
        const key = await sha256([
          'noah-revenue-start/1',
          owner,
          body.requestId,
        ]);
        const workId = [
          key.slice(0, 8),
          key.slice(8, 12),
          '8' + key.slice(13, 16),
          'a' + key.slice(17, 20),
          key.slice(20, 32),
        ].join('-');
        const replay = async () => {
          const existing = await db
            .prepare('SELECT payload FROM work_jobs WHERE id=? AND user_id=?')
            .bind(workId, owner)
            .first<{ payload: string }>();
          if (!existing) return false;
          const job = JSON.parse(existing.payload) as WorkJob;
          if (
            !isNoahRevenueOperation(job) ||
            job.noahRevenue.combinationId !== c.id
          )
            throw bad(409, 'この操作IDは別の仕事に使用されています。');
          return true;
        };
        if (await replay()) return json({ workId, ownerScope });
        const at = now(),
          stamp = new Date(at).toISOString(),
          title = c.title + 'の収益記録';
        if (!(await createNoahBrowserQuota(db, now).take(owner, 'asks')))
          throw bad(429, '本日の受付上限に達しました。');
        const revenue = initialNoahRevenue(c, owner, cfg);
        if (cfg?.providerId) revenue.issuer = cfg.providerId;
        const job: WorkJob = {
          id: workId,
          title,
          templateId: 'noah-revenue-operation',
          revision: 0,
          status: 'review',
          steps: [],
          events: [],
          plan: { schemaVersion: 1, objective: title, approvalGates: [] },
          createdAt: stamp,
          updatedAt: stamp,
          noahRevenue: revenue,
        };
        await db
          .prepare(`INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) SELECT ?,?,?,0,?
        WHERE (SELECT COUNT(*) FROM work_jobs WHERE user_id=? AND json_extract(payload,'$.templateId')='noah-revenue-operation'
          AND json_extract(payload,'$.createdAt')>=?) < 100 ON CONFLICT(id) DO NOTHING`)
          .bind(
            workId,
            owner,
            JSON.stringify(job),
            stamp,
            owner,
            new Date(at - 86_400_000).toISOString(),
          )
          .run();
        if (!(await replay())) throw bad(429, '本日の受付上限に達しました。');
        return json({ workId, ownerScope }, 201);
      }),
    receipt: (request: Request) =>
      respond(async () => {
        if (!cfg?.providerId || !cfg.secret || cfg.secret.length < 32)
          throw bad(503, '収益記録の提供元は未接続です。');
        const raw = await rawBody(request),
          at = now();
        try {
          await verifyReceiptSignature(
            raw,
            request.headers.get('avocado-provider-signature'),
            cfg.secret,
            Math.floor(at / 1000),
          );
        } catch {
          throw bad(401, '提供元を確認できません。');
        }
        const e = record(raw, [
          'schema',
          'providerId',
          'workId',
          'combinationId',
          'version',
          'stage',
          'source',
          'amountYen',
          'currency',
          'reference',
          'observedAt',
          'evidenceSha256',
          'operatorRef',
          'dispatchProof',
        ]);
        if (
          e.schema !== 'noah-revenue-receipt/1' ||
          e.providerId !== cfg.providerId ||
          typeof e.workId !== 'string' ||
          !uuid.test(e.workId) ||
          !token(e.combinationId) ||
          !Number.isSafeInteger(e.version) ||
          typeof e.stage !== 'string' ||
          !Object.hasOwn(sources, e.stage) ||
          e.source !== sources[e.stage as RevenueStage] ||
          e.currency !== 'JPY' ||
          !token(e.reference) ||
          !Number.isSafeInteger(e.amountYen) ||
          Number(e.amountYen) < (e.stage === 'paid' ? 1 : 0) ||
          !Number.isSafeInteger(e.observedAt) ||
          Number(e.observedAt) <= 0 ||
          Number(e.observedAt) > at ||
          typeof e.evidenceSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(e.evidenceSha256) ||
          (e.dispatchProof !== undefined &&
            (typeof e.dispatchProof !== 'string' ||
              !/^[a-f0-9]{64}$/.test(e.dispatchProof))) ||
          (e.operatorRef !== undefined && !token(e.operatorRef))
        )
          throw bad(400, '証憑の形式・通貨・段階・金額を確認してください。');
        const row = await db
          .prepare('SELECT user_id,payload,revision FROM work_jobs WHERE id=?')
          .bind(e.workId)
          .first<{ user_id: string; payload: string; revision: number }>();
        if (!row) throw bad(404, '対象の収益運用を確認できません。');
        const job = JSON.parse(row.payload) as WorkJob;
        // Every incoming statement must identify the independently verified payee for this Work owner.
        if (
          !e.operatorRef ||
          cfg.operatorAccounts[row.user_id] !== e.operatorRef
        )
          throw bad(404, '対象の収益運用を確認できません。');
        if (!isNoahRevenueOperation(job)) {
          const r = job.noahRemote;
          if (!r?.tool || !job.noahRevenue?.target)
            throw bad(404, '実行時の収益運用記録を確認できません。');
          if (r.state === 'running' || r.state === 'queued')
            throw bad(409, '実行結果の保存後に再試行してください。');
          const pinned = storedRevenueDispatch(job);
          if (
            !pinned ||
            typeof e.dispatchProof !== 'string' ||
            (await revenueDispatchHash(e.dispatchProof)) !== pinned
          )
            throw bad(404, 'この仕事に送った証明を確認できません。');
        }
        const op = job.noahRevenue;
        if (
          !op ||
          (op.issuer && op.issuer !== cfg.providerId) ||
          op.combinationId !== e.combinationId ||
          op.version !== e.version ||
          Number(e.observedAt) < Date.parse(job.createdAt)
        )
          throw bad(409, '仕事と証憑の帰属を確認してください。');
        const stage = e.stage as RevenueStage,
          reference = await sha256([
            'noah-revenue-ref/1',
            cfg.providerId,
            stage,
            e.reference,
          ]);
        const receipt = {
          stage,
          source: sources[stage],
          amountYen: Number(e.amountYen),
          reference,
          observedAt: Number(e.observedAt),
          evidenceSha256: e.evidenceSha256,
        };
        const existing = op.receipts.find(
          (item) => item.reference === reference,
        );
        if (existing) {
          if (
            existing.stage !== stage ||
            existing.amountYen !== receipt.amountYen ||
            existing.observedAt !== receipt.observedAt ||
            existing.evidenceSha256 !== receipt.evidenceSha256
          )
            throw bad(409, '同じ証憑の記録内容が異なります。');
          return json({ recorded: true });
        }
        const previous = op.receipts.filter((item) => item.stage === stage);
        if (
          previous.some(
            (item) => item.evidenceSha256 === receipt.evidenceSha256,
          ) ||
          op.receipts.length >= 512 ||
          (stage === 'cost' && previous.length) ||
          !Number.isSafeInteger(
            previous.reduce(
              (sum, item) => sum + item.amountYen,
              receipt.amountYen,
            ),
          )
        )
          throw bad(409, 'この段階の記録を照合してください。');
        op.issuer = cfg.providerId;
        if (op.authorRelation === 'unknown')
          op.authorRelation = revenueAuthorRelation(
            op.author,
            row.user_id,
            cfg,
          );
        op.receipts.push(receipt);
        job.revision = row.revision + 1;
        job.updatedAt = new Date(at).toISOString();
        // The CAS and global uniqueness check execute as one SQLite write across all owners and Work types.
        const saved = await db
          .prepare(`UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE id=? AND user_id=? AND revision=?
        AND NOT EXISTS (SELECT 1 FROM work_jobs other, json_each(other.payload,'$.noahRevenue.receipts') receipt
          WHERE other.id<>? AND (json_extract(receipt.value,'$.reference')=? OR
            (json_extract(other.payload,'$.noahRevenue.issuer')=? AND json_extract(receipt.value,'$.stage')=? AND json_extract(receipt.value,'$.evidenceSha256')=?)))`)
          .bind(
            JSON.stringify(job),
            job.revision,
            job.updatedAt,
            job.id,
            row.user_id,
            row.revision,
            job.id,
            reference,
            cfg.providerId,
            stage,
            receipt.evidenceSha256,
          )
          .run();
        if (saved.meta.changes !== 1)
          throw bad(
            409,
            '別の記録と競合しています。照合して再試行してください。',
          );
        return json({ recorded: true }, 201);
      }),
  };
}
