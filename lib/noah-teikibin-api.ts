/**
 * 定期便の台帳の入口（task 123）。GET・POST /api/noah/teikibin。仕様: docs/noah/spec-123-teikibin-ledger.md の 8 章。
 *
 * - 利用者: 自分の定期便を読む（締めた月の実数だけ。R14）。申し込む（join）・有料を本人の分から払うかを選ぶ（plan）。
 *   切り替え NOAH_TEIKIBIN が閉の間は、額を返さず、申し込みも受けない（R15）。審査者は閉でも使える。
 * - 運営（審査者だけ）: 入金と費用・寄与の記録、受け取る人を確かめる・止める、月の締め、払い出しと定期便の記録。
 * - 書き込みの検査は、ほかの Noah の入口と同じ（同じ Origin・本人の印・JSON・本文の大きさ。R16）。
 * - お金は送らない。振込は運営が台帳の外で行い、ここには結果だけを書く。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import {
  TEIKIBIN_CONTRIBUTION_KINDS,
  TEIKIBIN_ENTRY_KINDS,
  TEIKIBIN_FORMS,
  TEIKIBIN_LIMITS,
  TEIKIBIN_METHODS,
  TEIKIBIN_SOURCES,
  teikibinAmount,
  teikibinBps,
  teikibinCode,
  teikibinIdentityKey,
  teikibinMonth,
  teikibinNote,
  teikibinOneOf,
  teikibinPrice,
  teikibinRate,
  teikibinReason,
  teikibinReference,
  teikibinUnits,
  type NoahTeikibinFlags,
} from './noah-teikibin.ts';
import { createNoahTeikibinStore, type TeikibinCloseParams, type TeikibinDependencies } from './noah-teikibin-store.ts';

export type TeikibinApiDependencies = TeikibinDependencies & {
  authenticate: (request: Request) => Promise<string>;
  reviewers: string[];
  flags: NoahTeikibinFlags;
};

const HEADERS = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: HEADERS });
const NOT_FOUND = '見つかりません。';

function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
  return json({ error: '定期便の台帳を確認できません。少し待ってから再試行してください。' }, 503);
}

/** 決まった項目だけを受ける。required は必ず、optional は有っても無くてもよい。 */
function exactly(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const keys = Object.keys(value);
  if (!required.every((key) => keys.includes(key)) || !keys.every((key) => key === 'action' || required.includes(key) || optional.includes(key))) {
    throw new NoahAgentError('操作の項目を確認してください。');
  }
}

const id = (value: unknown) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value)) {
    throw new NoahAgentError('記録の ID を確認してください。');
  }
  return value;
};

const closeParams = (value: { form: unknown; reserve: unknown; dividend: unknown; price: unknown }): TeikibinCloseParams => ({
  form: teikibinOneOf(value.form, TEIKIBIN_FORMS, '渡し方は cash か goods です。'),
  reserveBps: teikibinBps(value.reserve, '予備の率'),
  dividendBps: teikibinBps(value.dividend, '本人の分の率'),
  planPriceMinor: teikibinPrice(value.price),
});

/** 検索の文字（?reserve=500 など）を数にする。空は null。 */
const numberParam = (raw: string | null): number | null => {
  if (raw === null || raw === '') return null;
  if (!/^\d{1,10}$/u.test(raw)) throw new NoahAgentError('数を確認してください。');
  return Number(raw);
};

export function createNoahTeikibinApi(deps: TeikibinApiDependencies) {
  const store = createNoahTeikibinStore(deps);
  const now = () => deps.now();

  async function read(url: URL, owner: string | null, reviewer: boolean, ownerScope: string | null) {
    const query = url.searchParams;
    const operator = ['state', 'month', 'preview', 'people', 'payouts', 'export'].some((key) => query.has(key));
    if (operator) {
      if (!reviewer) return json({ error: NOT_FOUND }, 404);
      if (query.has('export')) {
        const month = teikibinMonth(query.get('export'), now());
        return new Response(await store.exportCsv(month), {
          status: 200,
          headers: { ...HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="noah-teikibin-${month}.csv"` },
        });
      }
      if (query.has('preview')) {
        const month = teikibinMonth(query.get('preview'), now());
        const params = closeParams({
          form: query.get('form') ?? 'cash',
          reserve: numberParam(query.get('reserve')) ?? 0,
          dividend: numberParam(query.get('dividend')) ?? 0,
          price: numberParam(query.get('price')),
        });
        return json({ ...(await store.preview(month, params)), ownerScope });
      }
      if (query.has('month')) return json({ ...(await store.monthDetail(teikibinMonth(query.get('month'), now()))), ownerScope });
      if (query.has('payouts')) {
        const month = teikibinMonth(query.get('payouts'), now());
        return json({ month, lines: await store.payouts(month), ownerScope });
      }
      if (query.has('people')) {
        const after = query.get('after') ?? '';
        return json({ ...(await store.people(after === '' ? '' : teikibinCode(after))), ownerScope });
      }
      const target = numberParam(query.get('target')) ?? 0;
      return json({
        ...(await store.overview(Math.min(target, 100_000_000))),
        open: deps.flags.open,
        keyReady: deps.flags.key !== null,
        warnings: deps.flags.warnings,
        ownerScope,
      });
    }
    if (!owner) return json({ open: deps.flags.open, signedIn: false });
    if (!deps.flags.open && !reviewer) return json({ open: false, signedIn: true, ownerScope });
    return json({ open: true, reviewerPreview: !deps.flags.open, signedIn: true, ...(await store.userView(owner)), ownerScope });
  }

  async function write(input: Record<string, unknown>, owner: string, reviewer: boolean) {
    const action = input.action;
    if (action === 'join' || action === 'plan') {
      if (!deps.flags.open && !reviewer) return json({ error: NOT_FOUND }, 404);
      if (action === 'join') {
        exactly(input, []);
        await store.join(owner);
      } else {
        exactly(input, ['optIn']);
        if (typeof input.optIn !== 'boolean') throw new NoahAgentError('有料を選ぶかどうかを確認してください。');
        await store.setPlan(owner, input.optIn);
      }
      return json({ open: true, reviewerPreview: !deps.flags.open, signedIn: true, ...(await store.userView(owner)) });
    }
    if (!reviewer) return json({ error: NOT_FOUND }, 404);
    switch (action) {
      case 'entry': {
        exactly(input, ['month', 'kind', 'amount', 'source', 'reference'], ['note']);
        return json({
          entry: await store.addEntry(owner, {
            month: teikibinMonth(input.month, now()),
            kind: teikibinOneOf(input.kind, TEIKIBIN_ENTRY_KINDS, '記録の種類を確認してください。'),
            amount: teikibinAmount(input.amount),
            source: teikibinOneOf(input.source, TEIKIBIN_SOURCES, '出どころを確認してください。'),
            reference: teikibinReference(input.reference),
            note: teikibinNote(input.note),
          }),
        });
      }
      case 'void-entry':
        exactly(input, ['id', 'reason']);
        return json({ entry: await store.voidEntry(owner, id(input.id), teikibinReason(input.reason)) });
      case 'contribution':
        exactly(input, ['month', 'code', 'kind', 'units', 'rate', 'reference']);
        return json({
          contribution: await store.addContribution(owner, {
            month: teikibinMonth(input.month, now()),
            code: teikibinCode(input.code),
            kind: teikibinOneOf(input.kind, TEIKIBIN_CONTRIBUTION_KINDS, '寄与の種類を確認してください。'),
            units: teikibinUnits(input.units),
            rate: teikibinRate(input.rate),
            reference: teikibinReference(input.reference),
          }),
        });
      case 'void-contribution':
        exactly(input, ['id', 'reason']);
        return json({ contribution: await store.voidContribution(owner, id(input.id), teikibinReason(input.reason)) });
      case 'verify': {
        exactly(input, ['code', 'method', 'identity']);
        if (!deps.flags.key) throw new NoahAgentError('受け取る人を確かめる鍵（NOAH_TEIKIBIN_KEY）が設定されていません。', 503);
        const method = teikibinOneOf(input.method, TEIKIBIN_METHODS, '確かめ方を確認してください。');
        // 生の値は、ここで HMAC にして捨てる。台帳にも応答にも残さない。
        const key = await teikibinIdentityKey(deps.flags.key, method, input.identity);
        return json({ person: await store.verify(owner, teikibinCode(input.code), method, key) });
      }
      case 'revoke':
        exactly(input, ['code', 'reason']);
        return json({ person: await store.revoke(owner, teikibinCode(input.code), teikibinReason(input.reason)) });
      case 'close': {
        exactly(input, ['month', 'form', 'reserveBps', 'dividendBps', 'planPrice', 'digest']);
        if (typeof input.digest !== 'string' || !/^[0-9a-f]{64}$/u.test(input.digest)) throw new NoahAgentError('下書きをもう一度見てください。');
        const params = closeParams({ form: input.form, reserve: input.reserveBps, dividend: input.dividendBps, price: input.planPrice });
        return json({ month: await store.close(owner, teikibinMonth(input.month, now()), params, input.digest) });
      }
      case 'paid':
        exactly(input, ['month', 'code', 'payoutRef']);
        return json({
          line: await store.markPaid(owner, teikibinMonth(input.month, now()), teikibinCode(input.code), teikibinReference(input.payoutRef)),
        });
      case 'hold':
      case 'release':
        exactly(input, ['month', 'code']);
        return json({ line: await store.setHold(teikibinMonth(input.month, now()), teikibinCode(input.code), action === 'hold') });
      case 'goods':
        exactly(input, ['month', 'code', 'assignmentRef']);
        return json({
          line: await store.assignGoods(owner, teikibinMonth(input.month, now()), teikibinCode(input.code), teikibinReference(input.assignmentRef)),
        });
      default:
        throw new NoahAgentError('対応しない操作です。');
    }
  }

  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      try {
        owner = await deps.authenticate(request);
      } catch (error) {
        if (!(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error;
      }
      const reviewer = !!owner && deps.reviewers.includes(owner);
      const url = new URL(request.url);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      if (request.method === 'GET') return await read(url, owner, reviewer, ownerScope);
      if (!owner) return json({ error: 'サインインしてください。' }, 401);
      if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      let bytes: Uint8Array;
      try {
        bytes = await boundedNoahBody(request, TEIKIBIN_LIMITS.body);
      } catch (error) {
        if (error instanceof NoahAgentError && error.status === 413) throw new NoahAgentError('送信内容が大きすぎます（4 KiB まで）。', 413);
        throw error;
      }
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!input || typeof input !== 'object' || Array.isArray(input) || typeof (input as { action?: unknown }).action !== 'string') {
        throw new NoahAgentError('入力形式を確認してください。');
      }
      return await write(input as Record<string, unknown>, owner, reviewer);
    } catch (error) {
      return failure(error);
    }
  };
}
