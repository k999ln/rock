/**
 * Sky device tiers — 仕事の1工程を、どの計算機で動かすかを決める。
 *
 * 前提（2026-11 時点の実測・公開情報。変わったら表を直す）:
 * - 携帯: Pixel 10 で Qwen3-0.6B / 1.5B が機内モードで動く（docs/local-ai-os-integration-20260915.md）。
 *   分類・抜き出し・照合はできる。売り物の文章やコードの制作には足りない。
 * - 家の計算機（PC / Mac / mii。一般向けGPU 1枚）: 30B級の公開モデルが動く
 *   （例: Meta Muse Glimmer。4bit量子化で20GB弱、Apache-2.0）。長文・コード・画像の読み取りまでできる。
 * - 会社のクラウド: 何でもできるが、1回ごとに外部へ実費を払う。
 *
 * ここは置き場所と検証方法を返すだけ。実行・課金・送金は許可しない。
 */

import type { Contribution } from './sky-company-order.ts';

export type StepTask =
  | 'classify' | 'extract' | 'check' | 'judge-assist'
  | 'draft-short' | 'draft-long' | 'code' | 'vision';

export type Executor = 'member-phone' | 'member-home' | 'company-home' | 'cloud';

/**
 * 資料の持ち主と範囲。
 * - own: 実行する端末の持ち主自身の資料（自分の絵・文章・記録）。
 * - public: 公開されている資料。
 * - client-consented: 依頼者が「社外の端末で扱ってよい」と承諾した資料。
 * - client-secret: 依頼者の資料で、承諾が無い・個人情報や秘密を含む。
 */
export type DataScope = 'own' | 'public' | 'client-consented' | 'client-secret';

const CAN: Record<Executor, ReadonlySet<StepTask>> = {
  'member-phone': new Set(['classify', 'extract', 'check', 'judge-assist']),
  'member-home': new Set(['classify', 'extract', 'check', 'judge-assist', 'draft-short', 'draft-long', 'code', 'vision']),
  'company-home': new Set(['classify', 'extract', 'check', 'judge-assist', 'draft-short', 'draft-long', 'code', 'vision']),
  cloud: new Set(['classify', 'extract', 'check', 'judge-assist', 'draft-short', 'draft-long', 'code', 'vision']),
};

/** 安い順。参加者の端末は外部への実費が0、会社の家の計算機は電気代だけ、クラウドは従量。 */
const ORDER: readonly Executor[] = ['member-phone', 'member-home', 'company-home', 'cloud'];

export class DeviceTierError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type ExecutorChoice = {
  executor: Executor;
  /** duplicate_quorum: 別の持ち主の端末2台以上で同じ結果が出たら合格 / reviewer: 人か Jev が見る / none: 持ち主が自分で見る。 */
  verification: 'duplicate_quorum' | 'reviewer' | 'none';
  /** 作業料の対象か。自分の資料を自分の端末で処理するのは自分の仕事なので対象外。 */
  paysMember: boolean;
  reason: string;
};

/**
 * 1工程の置き場所を決める。
 * - 依頼者の秘密は、参加者の端末へ出さない。会社の計算機かクラウドだけ。
 * - 持ち主自身の資料は、持ち主の端末を先に使う（外へ出さない）。
 * - 公開・承諾済みの資料は、できる中で最も安い所。参加者の端末を使う時は複数台の一致で検証する。
 */
export function chooseExecutor(input: {
  task: StepTask;
  data: DataScope;
  /** いま使える置き場所。 */
  available: readonly Executor[];
}): ExecutorChoice {
  if (!CAN.cloud.has(input?.task))
    throw new DeviceTierError('TIER_TASK', '工程の種類が不正です。');
  if (!['own', 'public', 'client-consented', 'client-secret'].includes(input.data))
    throw new DeviceTierError('TIER_DATA', '資料の範囲が不正です。');
  const available = new Set(input.available);
  for (const executor of available)
    if (!ORDER.includes(executor)) throw new DeviceTierError('TIER_EXECUTOR', '置き場所が不正です。');
  const allowed = ORDER.filter((executor) => {
    if (!available.has(executor) || !CAN[executor].has(input.task)) return false;
    if (input.data === 'client-secret') return executor === 'company-home' || executor === 'cloud';
    return true;
  });
  if (!allowed.length)
    throw new DeviceTierError('TIER_NONE', input.data === 'client-secret'
      ? '依頼者の秘密を扱える置き場所（会社の計算機かクラウド）がありません。'
      : 'この工程をこなせる置き場所がありません。');
  const executor = allowed[0];
  const member = executor === 'member-phone' || executor === 'member-home';
  if (input.data === 'own' && member)
    return { executor, verification: 'none', paysMember: false, reason: '持ち主の資料を持ち主の端末で処理。外へ出さない' };
  if (member)
    return { executor, verification: 'duplicate_quorum', paysMember: true, reason: '参加者の端末で処理し、別の持ち主の端末と結果が一致したものだけ採用' };
  return {
    executor, verification: 'reviewer', paysMember: false,
    reason: input.data === 'client-secret' ? '依頼者の秘密を含むので会社の管理下で処理' : '参加者の端末ではこなせない工程なので会社側で処理',
  };
}

export type DeviceResult = { unitId: string; memberRef: string; outputSha256: string };

/**
 * 参加者の端末の結果を突き合わせる。
 * 同じ単位について、別の参加者 quorum 人以上が同じ出力を出したものだけ採用し、一致した人に作業料の寄与を付ける。
 * 同じ人が同じ単位に何度出しても1回と数える。稼働時間・台数は見ない。
 */
export function settleDeviceResults(input: {
  orderId: string;
  results: readonly DeviceResult[];
  quorum: 2 | 3;
  /** 採用された1単位あたりの作業料（最小通貨単位）。 */
  unitRateMinor: number;
}) {
  const ref = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/u;
  if (!ref.test(input?.orderId ?? '')) throw new DeviceTierError('SETTLE_ORDER', '受注IDが不正です。');
  if (input.quorum !== 2 && input.quorum !== 3) throw new DeviceTierError('SETTLE_QUORUM', '一致に要る人数は2か3です。');
  if (!Number.isSafeInteger(input.unitRateMinor) || input.unitRateMinor < 0) throw new DeviceTierError('SETTLE_RATE', '単価が不正です。');
  const first = new Map<string, DeviceResult>();
  for (const result of input.results) {
    if (!ref.test(result.unitId) || !ref.test(result.memberRef) || !/^[0-9a-f]{64}$/u.test(result.outputSha256))
      throw new DeviceTierError('SETTLE_RESULT', '結果の形式が不正です。');
    const key = `${result.unitId}|${result.memberRef}`;
    if (!first.has(key)) first.set(key, result);
  }
  const byUnit = new Map<string, DeviceResult[]>();
  for (const result of first.values()) byUnit.set(result.unitId, [...(byUnit.get(result.unitId) ?? []), result]);
  const accepted: { unitId: string; outputSha256: string }[] = [];
  const unresolved: string[] = [];
  const contributions: Contribution[] = [];
  for (const [unitId, results] of [...byUnit.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const tally = new Map<string, DeviceResult[]>();
    for (const result of results) tally.set(result.outputSha256, [...(tally.get(result.outputSha256) ?? []), result]);
    const [top] = [...tally.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (top[1].length < input.quorum) {
      unresolved.push(unitId);
      continue;
    }
    accepted.push({ unitId, outputSha256: top[0] });
    for (const result of top[1])
      contributions.push({
        id: `${input.orderId}:${unitId}:${result.memberRef}`, participantRef: result.memberRef, kind: 'compute',
        acceptedUnits: 1, unitRateMinor: input.unitRateMinor,
      });
  }
  return { accepted, unresolved, contributions };
}
