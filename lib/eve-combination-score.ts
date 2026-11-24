/**
 * 採点（Jev）と、作者の受け取りの計算。task 130 段 5・6。
 *
 * 数えるのは外部の記録だけ（ASP の成果・売り場の売上・入金の明細・Work の receipt）。本人の申告やクリックを、
 * 承認・入金へ昇格させない。7 段の数（作った → 出した → 見られた → 押された → 申し込まれた → 承認された → 入金された）、
 * 費用・承認額・入金額を出し、一番数が落ちている段と、その段の前で責めを負う工程を返す。
 * 決まった式だけ（学習・乱数・LLM なし）。同じ入力なら同じ成績表。
 * 仕様: docs/services/eve-si.md の「AMCの工程」7・8 と「Jevの合格条件」。
 */

import { NOAH_BUILTIN_CAPABILITIES, noahTrialDecision } from './noah-business.ts';
import type { EveAuthor, EveCombination } from './eve-combination.ts';
import type { EveSaleRecord } from './eve-demand.ts';

export const EVE_FUNNEL = ['made', 'sent', 'seen', 'clicked', 'applied', 'approved', 'paid'] as const;
export type EveFunnelStage = (typeof EVE_FUNNEL)[number];
export const EVE_FUNNEL_LABEL: Readonly<Record<EveFunnelStage, string>> = {
  made: '作った',
  sent: '出した',
  seen: '見られた',
  clicked: '押された',
  applied: '申し込まれた',
  approved: '承認された',
  paid: '入金された',
};

/** 記録の元。self（本人の申告）は、どの段にも数えない。 */
export type EveRecordSource = 'work' | 'platform' | 'asp' | 'market' | 'bank' | 'self';

/** 段ごとに、数えてよい記録の元。承認・入金は、相手（ASP・売り場・受注の場・銀行）の記録だけ。 */
export const EVE_STAGE_SOURCES: Readonly<Record<EveFunnelStage, readonly EveRecordSource[]>> = {
  made: ['work'],
  sent: ['work', 'platform'],
  seen: ['platform', 'asp', 'market'],
  clicked: ['platform', 'asp', 'market'],
  applied: ['platform', 'asp', 'market'],
  approved: ['platform', 'asp', 'market'],
  paid: ['bank', 'platform', 'asp', 'market'],
};

/** 外部の記録 1 件。reference は参照番号（Work の receipt の id・ASP の成果の id・入金の明細の番号）。 */
export type EveOutcomeRecord = {
  combinationId: string;
  version: number;
  stage: EveFunnelStage;
  count: number;
  /** approved と paid は金額が要る（0 円でも書く）。made は実費を costYen に書く。 */
  amountYen?: number;
  costYen?: number;
  source: EveRecordSource;
  reference: string;
  at: string;
};

/**
 * 段の数が落ちた時に、責めを負う能力（その段の前の工程）。ここに無い段（入金）は、相手の支払いを待つだけで、作り直す工程は無い。
 * 作った → 出した: 出す工程と、出す前の点検。出した → 見られた: 何を・どこに出すか。見られた → 押された: 中身。
 * 押された → 申し込まれた: 受け皿（LP・案件の選び方）。申し込まれた → 承認された: 案件の条件と、納品・対応の質。
 */
export const EVE_FUNNEL_BLAME: Readonly<Partial<Record<EveFunnelStage, readonly string[]>>> = {
  sent: ['publish.sns', 'publish.blog', 'publish.listing', 'gig.apply', 'site.host', 'compliance.check'],
  seen: ['research.market', 'publish.sns', 'publish.blog', 'publish.listing', 'ads.run'],
  clicked: ['content.article', 'content.script', 'content.image', 'content.video', 'content.voice', 'product.digital'],
  applied: ['site.build', 'research.offer', 'product.digital'],
  approved: ['research.offer', 'gig.deliver', 'order.fulfill', 'support.reply'],
};

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$/u;

/** 記録 1 件を数えてよいか。だめなら理由（数えない）。 */
export function eveOutcomeRecordProblem(r: EveOutcomeRecord, c: Pick<EveCombination, 'id' | 'version'>): string | null {
  if (r.combinationId !== c.id || r.version !== c.version) return '別の組み合わせ・版の記録です。';
  if (!(EVE_FUNNEL as readonly string[]).includes(r.stage)) return '段の名前が違います。';
  if (r.source === 'self') return '本人の申告は数えません（外部の記録だけを数えます）。';
  if (!EVE_STAGE_SOURCES[r.stage].includes(r.source)) return `「${EVE_FUNNEL_LABEL[r.stage]}」は ${EVE_STAGE_SOURCES[r.stage].join('・')} の記録だけを数えます（${r.source} は数えません）。`;
  if (typeof r.reference !== 'string' || !REF.test(r.reference)) return '参照番号がありません。';
  if (!Number.isSafeInteger(r.count) || r.count < 0) return '件数が不正です。';
  if (!Number.isFinite(Date.parse(r.at))) return '時刻が不正です。';
  if ((r.stage === 'approved' || r.stage === 'paid') && !(Number.isSafeInteger(r.amountYen) && (r.amountYen as number) >= 0)) return '承認・入金の記録に金額がありません。';
  if ((r.stage === 'approved' || r.stage === 'paid') && r.count === 0 && (r.amountYen as number) > 0) return '承認・入金が0件の記録には正の金額を付けられません。';
  if (r.costYen !== undefined && !(Number.isSafeInteger(r.costYen) && r.costYen >= 0)) return '費用が不正です。';
  if (r.costYen !== undefined && r.stage !== 'made') return '費用は「作った」（Work の receipt）の記録にだけ書きます。';
  return null;
}

export type EveFunnel = Record<EveFunnelStage, number | null>;
export type EveFunnelDrop = { from: EveFunnelStage; stage: EveFunnelStage; rate: number; basis: 'peers' | 'raw' };

/**
 * 一番数が落ちている段。段の間の通る割合を (次 + 1) ÷ (前 + 2) で見る（件数が少ない間に 0 と 1 へ振れない）。
 * 同じ設計図の他の成績表（peers）があれば、その段の中央値に対する比で比べる。無ければ割合そのもので比べる。
 * 測っていない段（記録が 1 件も無い段）は飛ばして、前の測った段と比べる。同じなら早い段。
 */
export function eveFunnelDrop(funnel: EveFunnel, peers: readonly EveFunnel[] = []): EveFunnelDrop | null {
  const rate = (f: EveFunnel, from: EveFunnelStage, to: EveFunnelStage) => ((f[to] as number) + 1) / ((f[from] as number) + 2);
  let prev: EveFunnelStage | null = null;
  let worst: EveFunnelDrop | null = null;
  let worstScore = Infinity;
  for (const stage of EVE_FUNNEL) {
    if (funnel[stage] === null) continue;
    if (prev !== null && (funnel[prev] as number) > 0) {
      const r = rate(funnel, prev, stage);
      const same = peers.filter((p) => p[prev!] !== null && p[stage] !== null && (p[prev!] as number) > 0).map((p) => rate(p, prev!, stage)).sort((a, b) => a - b);
      const median = same.length ? (same.length % 2 ? same[(same.length - 1) / 2] : (same[same.length / 2 - 1] + same[same.length / 2]) / 2) : null;
      const score = median ? r / median : r;
      if (score < worstScore) {
        worstScore = score;
        worst = { from: prev, stage, rate: Math.round(r * 1e6) / 1e6, basis: median ? 'peers' : 'raw' };
      }
    }
    prev = stage;
  }
  return worst;
}

/** 落ちた段の前で、責めを負う工程（auto の工程だけ。本人の工程・つなぎ目・決まった式・本人が自分でやる工程は除く）。 */
export function eveBlamedSteps(c: EveCombination, stage: EveFunnelStage): { step: string; capability: string }[] {
  const caps = EVE_FUNNEL_BLAME[stage] ?? [];
  return c.steps
    .filter((s) => s.kind === 'auto' && !s.glue && s.capability && caps.includes(s.capability) && !NOAH_BUILTIN_CAPABILITIES.includes(s.capability as never) && !c.keepForSelf.includes(s.id))
    .map((s) => ({ step: s.id, capability: s.capability! }));
}

export type EveScorecard = {
  combinationId: string;
  version: number;
  author: EveAuthor;
  demandId: string | null;
  from: string;
  to: string;
  days: number;
  funnel: EveFunnel;
  costYen: number;
  /** この期間に明示された実費があり、渡されたWorkの費用票に期間外・欠損・食い違いがない。 */
  costComplete?: boolean;
  approvedYen: number;
  paidYen: number;
  /** 承認額 − 費用（承認・確定した収益だけ。発生・未承認は数えない）。 */
  profitYen: number;
  dailyProfitYen: number;
  /** 1 円の費用あたりの承認額。費用 0 なら null。 */
  yieldPerYen: number | null;
  drop: EveFunnelDrop | null;
  blame: { step: string; capability: string }[];
  /** 続ける・増やす・止める（noahTrialDecision）。 */
  decision: ReturnType<typeof noahTrialDecision>;
  counted: number;
  rejected: { reference: string; stage: string; reason: string }[];
  /** 採点は Jev（決まった式）。Eve は採点しない。 */
  judge: 'jev';
  notes: string[];
};

/** 成績表を作る。from〜to の外の記録は数えない。同じ元・同じ参照番号は 1 回だけ数える。 */
export function eveScore(
  c: EveCombination,
  records: readonly EveOutcomeRecord[],
  window: { from: string; to: string; peers?: readonly EveFunnel[] },
): EveScorecard {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new Error('score_window_invalid');
  const funnel = Object.fromEntries(EVE_FUNNEL.map((s) => [s, null])) as EveFunnel;
  const rejected: EveScorecard['rejected'] = [];
  const seen = new Map<string, EveOutcomeRecord>();
  let costComplete = true;
  let costYen = 0;
  let approvedYen = 0;
  let paidYen = 0;
  let counted = 0;
  const sorted = [...records].sort((a, b) => a.at.localeCompare(b.at) || a.stage.localeCompare(b.stage) || a.source.localeCompare(b.source) || a.reference.localeCompare(b.reference));
  for (const r of sorted) {
    if (r.combinationId !== c.id || r.version !== c.version) continue;
    const at = Date.parse(r.at);
    if (Number.isFinite(at) && (at < from || at > to)) {
      if (at < from && r.stage === 'made' && r.source === 'work') costComplete = false;
      continue;
    }
    const problem = eveOutcomeRecordProblem(r, c);
    if (problem) {
      if (r.stage === 'made' && r.source === 'work') costComplete = false;
      rejected.push({ reference: String(r.reference ?? ''), stage: String(r.stage), reason: problem });
      continue;
    }
    const key = `${r.stage}|${r.source}|${r.reference}`;
    const earlier = seen.get(key);
    if (earlier) {
      if (r.stage === 'made' && (earlier.costYen !== r.costYen || earlier.count !== r.count)) costComplete = false;
      if ((r.stage === 'paid' || r.stage === 'approved') && (earlier.amountYen !== r.amountYen || earlier.count !== r.count)) throw new Error('score_conflicting_receipt');
      rejected.push({ reference: r.reference, stage: r.stage, reason: '同じ参照番号の記録は 1 回だけ数えます。' });
      continue;
    }
    seen.set(key, r);
    counted += 1;
    funnel[r.stage] = (funnel[r.stage] ?? 0) + r.count;
    if (r.stage === 'made') {
      if (r.costYen === undefined) costComplete = false;
      else costYen += r.costYen;
    }
    if (r.stage === 'approved') approvedYen += r.amountYen ?? 0;
    if (r.stage === 'paid') paidYen += r.amountYen ?? 0;
  }
  if (![costYen, approvedYen, paidYen].every(Number.isSafeInteger)) throw new Error('score_amount_out_of_range');
  const notes: string[] = [];
  let last: EveFunnelStage | null = null;
  for (const s of EVE_FUNNEL) {
    if (funnel[s] === null) continue;
    if (last && (funnel[s] as number) > (funnel[last] as number)) notes.push(`「${EVE_FUNNEL_LABEL[s]}」が「${EVE_FUNNEL_LABEL[last]}」より多いです。記録の取り方を確かめてください（数は直しません）。`);
    last = s;
  }
  if (funnel.paid !== null && paidYen > approvedYen && funnel.approved !== null) notes.push('入金額が承認額より多いです。前の期間の承認の入金かもしれません。');
  const days = Math.max(1, Math.ceil((to - from) / 86_400_000));
  const profitYen = approvedYen - costYen;
  const drop = eveFunnelDrop(funnel, window.peers);
  return {
    combinationId: c.id,
    version: c.version,
    author: c.author,
    demandId: c.demand?.id ?? null,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    days,
    funnel,
    costYen,
    costComplete: costComplete && funnel.made !== null,
    approvedYen,
    paidYen,
    profitYen,
    dailyProfitYen: Math.floor(profitYen / days),
    yieldPerYen: costYen > 0 ? Math.round((approvedYen / costYen) * 1000) / 1000 : null,
    drop,
    blame: drop ? eveBlamedSteps(c, drop.stage) : [],
    decision: noahTrialDecision({ startedAt: from, now: to, outputs: funnel.sent ?? 0, clicks: funnel.clicked ?? 0, approved: funnel.approved ?? 0, approvedYen, costYen }),
    counted,
    rejected,
    judge: 'jev',
    notes,
  };
}

/**
 * 実績を需要の台帳の「売れる見込み」へ戻す。出した数を offered、承認された数を sold にする（需要の id ごとに足す）。
 * 出した数か承認の数を測っていない成績表は戻さない（0 と測っていないを混ぜない）。
 */
export function eveSaleRecordsFromScores(scores: readonly EveScorecard[]): Record<string, EveSaleRecord> {
  const out: Record<string, EveSaleRecord> = {};
  for (const s of [...scores].sort((a, b) => a.combinationId.localeCompare(b.combinationId) || a.version - b.version || a.from.localeCompare(b.from))) {
    if (!s.demandId || s.funnel.sent === null || s.funnel.approved === null) continue;
    const r = (out[s.demandId] ??= { offered: 0, sold: 0 });
    r.offered += s.funnel.sent;
    r.sold += Math.min(s.funnel.approved, s.funnel.sent);
  }
  return out;
}

/** 作者の割合（万分率）。2026-11-24 13:54 の本人回答で 20%（設計書 13 章 I2。Noah の Agent の作者と同じ割合）。元は「入金 − 費用」（I8）。 */
export const EVE_AUTHOR_SHARE_BPS: number | null = 2_000;

export type EveAuthorShare = {
  combinationId: string;
  version: number;
  userId: string;
  payee: { kind: 'operator' } | { kind: 'person'; id: string };
  /** 入金された額 − 費用（0 より下は 0）。 */
  baseYen: number | null;
  shareBps: number | null;
  shareYen: number | null;
  status: 'none' | 'pending-cost' | 'pending-rate' | 'due';
  reason: string;
};

/**
 * 組み合わせを使ってもらった作者の分（2 つ目のお金の道）。外部の入金の記録で確定した額だけが元。
 * 元は「入金された額 − 費用」（使った人が損をした回は 0）。Eve が作った組み合わせの作者の分は運営に入る。
 * 同じ利用者・案件の費用と入金を含む累積記録で計算する。期間の表示を足し合わせて支払額にしない。
 * 自分の組み合わせを自分で使った分は計算しない。割合に null を渡した時は額を出さない。eve.si は送金しない（払うのは Wallet）。
 */
export function eveAuthorShare(score: EveScorecard, userId: string, shareBps: number | null = EVE_AUTHOR_SHARE_BPS): EveAuthorShare {
  const payee: EveAuthorShare['payee'] = score.author.kind === 'eve' ? { kind: 'operator' } : { kind: 'person', id: score.author.id };
  const base = { combinationId: score.combinationId, version: score.version, userId, payee };
  if (shareBps !== null && !(Number.isSafeInteger(shareBps) && shareBps >= 0 && shareBps <= 10_000)) throw new Error('share_bps_invalid');
  if (score.author.kind === 'person' && score.author.id === userId)
    return { ...base, baseYen: 0, shareBps, shareYen: null, status: 'none', reason: '自分の組み合わせを自分で使った分は、作者の分を計算しません。' };
  if (!score.funnel.paid || score.paidYen <= 0)
    return { ...base, baseYen: 0, shareBps, shareYen: null, status: 'none', reason: '外部の記録で確定した入金が、まだありません。' };
  if (score.costComplete !== true)
    return { ...base, baseYen: null, shareBps, shareYen: null, status: 'pending-cost', reason: 'この利用の実費がそろうと、作者の分が決まります。' };
  const baseYen = Math.max(0, score.paidYen - score.costYen);
  if (baseYen === 0) return { ...base, baseYen, shareBps, shareYen: null, status: 'none', reason: '入金が費用を超えていないので、作者の分はありません。' };
  if (shareBps === null) return { ...base, baseYen, shareBps, shareYen: null, status: 'pending-rate', reason: '作者に入る割合が、まだ決まっていません（本人待ち）。' };
  const shareYen = Number(BigInt(baseYen) * BigInt(shareBps) / BigInt(10_000));
  return { ...base, baseYen, shareBps, shareYen, status: 'due', reason: '入金の記録で確定した分です。払うのは Wallet です。' };
}
