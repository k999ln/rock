/**
 * Eve が作った部品: 案件を比べる（能力 research.offer）。task 130、2026-11-25。
 *
 * 2026-11-24 の確かめで、Noah の一覧にこの能力をこなせる候補が無かった。LLM は使わない決まった式で、外へ通信しない。
 * 1. 受け取る物: 需要の台帳の項目（`需要の台帳`。lib/eve-demand.ts の形）か、案件の一覧（`offers`）。ASP の名前（`asp`）。
 * 2. 外す物（理由と一緒に dropped へ）: 単価が 0 以下・出典が無い・出典が https でない・出典が 90 日より古い・
 *    金融の案件（組み合わせが金融以外の時。`finance: true` を渡した時だけ残す）・ASP が違う物。
 * 3. 並べる: 見込みの報酬 = 単価 × 承認の見込み。承認の見込みは、承認と発生の記録が 5 件以上あれば (承認 + 1) ÷ (発生 + 2)、
 *    無ければ 0.5 の控えめな値（lib/eve-demand.ts の EVE_RECORD_MIN と同じ考え）。同じなら id の順。
 * 推量で単価や条件を足さない。台帳に無い事は書かない。
 */

import type { EveDemand } from './eve-demand.ts';

export const EVE_PART_OFFERS_REF = 'eve-part:offer-compare';

const DAY = 86_400_000;
const MAX_AGE_DAYS = 90;
const RECORD_MIN = 5;
const PRIOR = 0.5;

export type EveOfferInput = {
  id: string;
  name: string;
  condition: string;
  rewardYen: number;
  place: string;
  finance?: boolean;
  sources: readonly { url: string; checkedAt: string }[];
  record?: { occurred: number; approved: number };
};
export type EveOffer = {
  id: string;
  name: string;
  condition: string;
  rewardYen: number;
  place: string;
  source: string;
  checkedAt: string;
  approvalRate: number;
  approvalBasis: 'record' | 'prior';
  expectedYen: number;
};
export type EveOfferComparison = { offers: EveOffer[]; chosen: string; dropped: { id: string; reason: string }[]; basis: string; checkedAt: string };

const https = (url: unknown) => {
  try {
    return typeof url === 'string' && new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/** 需要の台帳の 1 件を、案件の形にする（ASP の紹介だけ）。 */
export function eveOfferFromDemand(d: EveDemand): EveOfferInput | null {
  if (d.origin !== 'affiliate') return null;
  return { id: d.id, name: d.item ?? d.label, condition: d.condition ?? d.label, rewardYen: d.priceYen, place: d.place, finance: d.finance, sources: d.sources };
}

export function eveCompareOffers(input: Record<string, unknown>, deps: { now?: () => number } = {}): EveOfferComparison {
  const now = (deps.now ?? Date.now)();
  const asp = typeof input.asp === 'string' && input.asp.trim() ? input.asp.trim() : null;
  const allowFinance = input.finance === true;
  const fromLedger = Array.isArray(input['需要の台帳']) ? (input['需要の台帳'] as EveDemand[]).map(eveOfferFromDemand).filter((o): o is EveOfferInput => !!o) : [];
  const given = Array.isArray(input.offers) ? (input.offers as EveOfferInput[]) : [];
  const all = [...fromLedger, ...given];
  if (!all.length) throw new Error('比べる案件（需要の台帳か offers）がありません。');
  if (all.length > 500) throw new Error('案件は 500 件までです。');
  const dropped: { id: string; reason: string }[] = [];
  const kept: EveOffer[] = [];
  for (const o of all) {
    const id = typeof o?.id === 'string' ? o.id : '(id なし)';
    const drop = (reason: string) => dropped.push({ id, reason });
    if (typeof o?.name !== 'string' || !o.name.trim() || typeof o.condition !== 'string' || !o.condition.trim()) { drop('名前か成果の条件がありません。'); continue; }
    if (!Number.isSafeInteger(o.rewardYen) || o.rewardYen <= 0) { drop('単価が 0 円以下か、整数の円ではありません。'); continue; }
    if (asp && o.place !== asp) { drop(`ASP が違います（${String(o.place)}）。`); continue; }
    if (o.finance && !allowFinance) { drop('金融の案件です（この組み合わせは金融以外）。'); continue; }
    const sources = Array.isArray(o.sources) ? o.sources.filter((s) => https(s?.url) && Number.isFinite(Date.parse(s?.checkedAt))) : [];
    if (!sources.length) { drop('https の出典と確かめた日がありません。'); continue; }
    const newest = [...sources].sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt))[0];
    if (now - Date.parse(newest.checkedAt) > MAX_AGE_DAYS * DAY) { drop(`出典が ${MAX_AGE_DAYS} 日より古いです（${newest.checkedAt.slice(0, 10)}）。`); continue; }
    if (kept.some((k) => k.id === id)) { drop('同じ id が 2 回あります。'); continue; }
    const rec = o.record;
    const useRecord = !!rec && Number.isSafeInteger(rec.occurred) && Number.isSafeInteger(rec.approved) && rec.occurred >= RECORD_MIN && rec.approved >= 0 && rec.approved <= rec.occurred;
    const approvalRate = useRecord ? (rec.approved + 1) / (rec.occurred + 2) : PRIOR;
    kept.push({
      id, name: o.name.trim(), condition: o.condition.trim(), rewardYen: o.rewardYen, place: o.place, source: newest.url, checkedAt: newest.checkedAt,
      approvalRate: Math.round(approvalRate * 1e4) / 1e4, approvalBasis: useRecord ? 'record' : 'prior', expectedYen: Math.round(o.rewardYen * approvalRate),
    });
  }
  if (!kept.length) throw new Error(`使える案件がありません（外した ${dropped.length} 件）。`);
  kept.sort((a, b) => b.expectedYen - a.expectedYen || a.id.localeCompare(b.id));
  return {
    offers: kept,
    chosen: kept[0].id,
    dropped,
    basis: `見込みの報酬 = 単価 × 承認の見込み（記録 ${RECORD_MIN} 件以上は (承認+1)÷(発生+2)、無ければ ${PRIOR}）。`,
    checkedAt: new Date(now).toISOString(),
  };
}
