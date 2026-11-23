/**
 * 需要の台帳。task 130 段 3。
 *
 * 需要 ＝「ある成果に、誰かがお金を払っている」という事実。eve.si は、ここから逆算して組み合わせを探す。
 * 1 件ごとに、成果の型・払う人と場所・単価・量・競合・出典を持つ。出典の無い物は入れない。
 *
 * 元にする物（どれも、リポジトリで既に読んでいる物）:
 * - 受注の募集（GigPosting）: 買い手の予算。lib/sky-gig-desk.ts が読む募集。
 * - ASP の案件（noah-affiliate の offer）: 成果 1 件あたりの報酬。toolkits/noah-affiliate-agents。
 * - 売り場の公開価格（人か Eve が、出典 URL と一緒に記録した物）。
 * X の紹介（data/noah-scout/leads.json）は、需要ではなくエージェントの側（供給）なので、ここには入れない。
 *
 * 決まった式だけ（学習・乱数なし）。仕様: docs/services/eve-si.md
 */

import type { GigOffer, GigPosting } from './sky-gig-desk.ts';

export type EveDemandSource = { url: string; checkedAt: string; note?: string };
export type EveDemandOrigin = 'gig' | 'affiliate' | 'market';

export type EveDemand = {
  id: string;
  origin: EveDemandOrigin;
  /** 買われる成果の型（素材の型と同じ書き方）。組み合わせの地図の終点になる。 */
  outcome: string;
  label: string;
  /** 誰が払うか。 */
  payer: string;
  /** どこで払われるか。 */
  place: string;
  /** 1 件あたりの単価（円。複数の観測は中央値）。 */
  priceYen: number;
  /** 1 週間あたりの件数（分からなければ null）。 */
  volumePerWeek: number | null;
  /** 同じ物を出している数・応募の数（分からなければ null）。 */
  competitors: number | null;
  /** 金融の分野か（本人が表現を確かめる）。 */
  finance: boolean;
  sources: readonly EveDemandSource[];
  /** 最も古い出典の日付（この日より後に、台帳を作り直す）。 */
  checkedAt: string;
};

/** 出典が古すぎる需要は使わない（日数。候補）。 */
export const EVE_DEMAND_MAX_AGE_DAYS = 90;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : 0;
};
const httpsUrl = (url: unknown) => {
  try {
    return typeof url === 'string' && new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};
const isoTime = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'x';

/** 需要 1 件の問題（無ければ空）。 */
export function eveDemandProblems(d: EveDemand, now: number): string[] {
  const out: string[] = [];
  if (!d.sources.length) out.push('出典がありません。');
  for (const s of d.sources) {
    if (!httpsUrl(s.url)) out.push(`出典が https の URL ではありません: ${s.url}`);
    if (!isoTime(s.checkedAt)) out.push('出典を確かめた日がありません。');
    else if (Date.parse(s.checkedAt) > now) out.push('出典を確かめた日が未来です。');
    else if (now - Date.parse(s.checkedAt) > EVE_DEMAND_MAX_AGE_DAYS * DAY) out.push(`出典が ${EVE_DEMAND_MAX_AGE_DAYS} 日より古いです（${s.checkedAt.slice(0, 10)}）。`);
  }
  if (!Number.isSafeInteger(d.priceYen) || d.priceYen <= 0) out.push('単価が 1 円以上の整数ではありません。');
  if (d.volumePerWeek !== null && !(Number.isFinite(d.volumePerWeek) && d.volumePerWeek >= 0)) out.push('量が不正です。');
  if (d.competitors !== null && !(Number.isSafeInteger(d.competitors) && d.competitors >= 0)) out.push('競合の数が不正です。');
  return out;
}

/**
 * 受注の募集から、需要を作る。売れる型（GigOffer）の語が題名か本文に入っている募集を、その型の需要として数える。
 * 予算（買い手が払う額）と URL（出典）が無い募集は数えない。量は、観測した日から 7 日以内の件数。
 */
export function eveDemandFromGigPostings(
  observed: readonly { observedAt: string; posting: GigPosting }[],
  offers: readonly GigOffer[],
  now: number,
): EveDemand[] {
  const groups = new Map<string, { offer: GigOffer; channel: string; rows: { observedAt: string; posting: GigPosting }[] }>();
  for (const row of observed) {
    const p = row.posting;
    const price = p.budgetMaxYen ?? p.budgetMinYen;
    if (!p.url || !httpsUrl(p.url) || price === null || !isoTime(row.observedAt)) continue;
    const haystack = `${p.title}\n${p.body}`.toLowerCase();
    const offer = offers.find((o) => o.keywords.some((k) => haystack.includes(k.toLowerCase())));
    if (!offer) continue;
    const key = `${offer.id}|${p.channel}`;
    const g = groups.get(key) ?? { offer, channel: p.channel, rows: [] };
    g.rows.push(row);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ offer, channel, rows }) => {
    const sources = rows.map((r) => ({ url: r.posting.url!, checkedAt: r.observedAt, note: r.posting.title.slice(0, 80) }));
    const applicants = rows.map((r) => r.posting.applicants).filter((n): n is number => Number.isSafeInteger(n));
    return {
      id: `gig:${offer.id}:${slug(channel)}`,
      origin: 'gig' as const,
      outcome: `delivery:${offer.id}`,
      label: `${offer.name}（${channel} の募集）`,
      payer: '募集の依頼者',
      place: channel,
      priceYen: median(rows.map((r) => (r.posting.budgetMaxYen ?? r.posting.budgetMinYen)!)),
      volumePerWeek: rows.filter((r) => now - Date.parse(r.observedAt) <= WEEK && Date.parse(r.observedAt) <= now).length,
      competitors: applicants.length ? median(applicants) : null,
      finance: false,
      sources,
      checkedAt: sources.map((s) => s.checkedAt).sort()[0],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** ASP の案件（toolkits/noah-affiliate-agents の offer と証拠）の、台帳が読む所。 */
export type EveAffiliateOffer = {
  id: string;
  productName: string;
  serviceKey: string;
  rewardYen: number;
  event: 'account' | 'deposit' | 'trade' | 'purchase' | 'consultation';
  partnered?: boolean;
  evidence: readonly { url: string; note?: string; checkedAt: string }[];
};
const EVENT_LABEL: Record<EveAffiliateOffer['event'], string> = { account: '口座の開設', deposit: '入金', trade: '取引', purchase: '購入', consultation: '相談の申込' };

/** ASP の案件から、需要を作る（成果 1 件あたりの報酬）。口座・入金・取引が成果の案件は、金融として扱う。 */
export function eveDemandFromAffiliateOffers(offers: readonly EveAffiliateOffer[]): EveDemand[] {
  return offers.filter((o) => Number.isSafeInteger(o.rewardYen) && o.rewardYen > 0).map((o) => {
    const sources = o.evidence.map((e) => ({ url: e.url, checkedAt: e.checkedAt, ...(e.note ? { note: e.note } : {}) }));
    return {
      id: `affiliate:${slug(o.serviceKey)}:${slug(o.id)}`,
      origin: 'affiliate' as const,
      outcome: `conversion:${slug(o.serviceKey)}:${o.event}`,
      label: `${o.productName}（${EVENT_LABEL[o.event]}）${o.partnered ? '' : '・提携前'}`,
      payer: '広告主（ASP 経由）',
      place: 'ASP',
      priceYen: o.rewardYen,
      volumePerWeek: null,
      competitors: null,
      finance: ['account', 'deposit', 'trade'].includes(o.event),
      sources,
      checkedAt: sources.map((s) => s.checkedAt).sort()[0] ?? '',
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** 売り場の公開価格の観測（人か Eve が、出典 URL と一緒に記録する）。 */
export type EveMarketObservation = {
  place: string;
  item: string;
  outcome: string;
  priceYen: number;
  /** 1 週間あたりに売れた・注文が来た件数（売り場が公開している時だけ）。 */
  soldPerWeek?: number;
  /** 同じ物を出している数。 */
  listings?: number;
  url: string;
  checkedAt: string;
};

/** 売り場の公開価格から、需要を作る。同じ場所・同じ成果の観測は 1 件にまとめる（単価は中央値）。 */
export function eveDemandFromMarket(observations: readonly EveMarketObservation[]): EveDemand[] {
  const groups = new Map<string, EveMarketObservation[]>();
  for (const o of observations) {
    const key = `${slug(o.place)}|${o.outcome}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const sold = rows.map((r) => r.soldPerWeek).filter((n): n is number => typeof n === 'number');
    const listings = rows.map((r) => r.listings).filter((n): n is number => Number.isSafeInteger(n));
    const sources = rows.map((r) => ({ url: r.url, checkedAt: r.checkedAt, note: r.item.slice(0, 80) }));
    return {
      id: `market:${key.replace('|', ':')}`,
      origin: 'market' as const,
      outcome: rows[0].outcome,
      label: `${rows[0].item}（${rows[0].place}）`,
      payer: `${rows[0].place} の買い手`,
      place: rows[0].place,
      priceYen: median(rows.map((r) => r.priceYen)),
      volumePerWeek: sold.length ? median(sold) : null,
      competitors: listings.length ? median(listings) : null,
      finance: false,
      sources,
      checkedAt: sources.map((s) => s.checkedAt).sort()[0],
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 台帳を組む。問題のある需要は入れず、理由と一緒に rejected に返す。同じ id は、新しく確かめた方を残す。
 */
export function eveDemandLedger(entries: readonly EveDemand[], now: number): { entries: EveDemand[]; rejected: { id: string; reasons: string[] }[] } {
  const byId = new Map<string, EveDemand>();
  const rejected: { id: string; reasons: string[] }[] = [];
  for (const d of entries) {
    const reasons = eveDemandProblems(d, now);
    if (reasons.length) {
      rejected.push({ id: d.id, reasons });
      continue;
    }
    const prev = byId.get(d.id);
    if (!prev || prev.checkedAt < d.checkedAt) byId.set(d.id, d);
  }
  return { entries: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)), rejected };
}

/** 回した実績（出した数・売れた数）。売れた数は、外部の記録で確定した物だけ。 */
export type EveSaleRecord = { offered: number; sold: number };

/** 実績が何回たまったら、控えめな見積りから実績に切り替えるか。 */
export const EVE_RECORD_MIN = 5;

/**
 * 売れる見込み（1 回出して、1 件売れる確率）。
 * - 実績が 5 回以上: (売れた数 + 1) ÷ (出した数 + 2)。
 * - それ未満: 控えめな見積り。量が 0 なら 0。競合が分かれば 1 ÷ (2 + 競合)。分からなければ 0.1。どれも 0.5 を上限。
 */
export function eveSaleRate(d: EveDemand, record?: EveSaleRecord): { rate: number; basis: 'record' | 'prior' } {
  if (record && Number.isSafeInteger(record.offered) && Number.isSafeInteger(record.sold) && record.sold >= 0 && record.sold <= record.offered && record.offered >= EVE_RECORD_MIN)
    return { rate: (record.sold + 1) / (record.offered + 2), basis: 'record' };
  if (d.volumePerWeek === 0) return { rate: 0, basis: 'prior' };
  const prior = d.competitors === null ? 0.1 : 1 / (2 + d.competitors);
  return { rate: Math.min(0.5, prior), basis: 'prior' };
}

/**
 * 見込みの利益（1 回）＝ 売れる見込み × 単価 − 実費 − 本人の手間の値段。円未満は切り捨て。
 * 本人が自分でやりたい工程の分数は、手間に数えない（呼ぶ側で除いて渡す）。
 */
export function eveExpectedProfit(input: { demand: EveDemand; record?: EveSaleRecord; costYen: number; ownerMinutes: number; ownerMinuteValueYen: number }) {
  const { rate, basis } = eveSaleRate(input.demand, input.record);
  const value = rate * input.demand.priceYen - input.costYen - input.ownerMinutes * input.ownerMinuteValueYen;
  return { profitYen: Math.floor(value), rate, basis };
}
