import {
  beginLinuxRun,
  finishLinuxRun,
  cancelLinuxRun,
  confirmLinuxRun,
  parseLinuxAgent,
  type LinuxLocalRun,
} from './sky-linux-local.ts';
import { parseLinuxModel, type LinuxModel } from './sky-linux-models.ts';
import { marketplaceCommissionMinor } from './sky-marketplace-policy.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';

/** Amounts are USD cents. These are service records, never evidence of money movement. */
export const SKY_LINUX_BASE_MINOR = 1600;
export class LinuxServiceError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}
export type LinuxTerms = {
  schema: 'sky.linux-terms/1';
  version: string;
  currency: 'USD';
  baseMinor: 1600;
  cpuUnitMs: number;
  cpuUnitMinor: number;
  includedCpuMs: number;
  monthlyCapMinor: number;
  graceDays: number;
  leaseSeconds: number;
  retentionDays: number;
  termsUrl: string;
};
export type LinuxListing = {
  id: string;
  packageKey: string;
  packageSha256: string;
  creatorId: string;
  model: LinuxModel;
  agent: ReturnType<typeof parseLinuxAgent>;
  authorFeeMinor: number;
  digest: string;
  active: boolean;
};
export type LinuxJob = {
  id: string;
  listing: LinuxListing;
  period: string;
  inputSha256: string;
  reservedMinor: number;
  cpuLimitMs: number;
  approvedAt: number;
  state:
    | 'queued'
    | 'running'
    | 'review'
    | 'completed'
    | 'cancel_requested'
    | 'cancelled'
    | 'unknown';
  leaseUntil: number;
  claimId: string | null;
  receiptId: string | null;
  cpuMs: number;
  computeMinor: number;
  authorMinor: number;
  run: LinuxLocalRun;
};
export type LinuxInvoice = {
  id: string;
  period: string;
  contractDigest: string;
  baseMinor: number;
  computeMinor: number;
  authorMinor: number;
  amountMinor: number;
  dueAt: number;
  state: 'open' | 'paid' | 'reversed';
  paymentSequence: number;
  paymentRef: string | null;
  providerInvoiceId: string | null;
  collectionUrl: string | null;
  collectionRequestedAt: number | null;
  allocations: {
    creatorId: string;
    grossMinor: number;
    commissionMinor: number;
    payableMinor: number;
    transferRef: string | null;
    transferRequestedAt: number | null;
    recoveryRequired: boolean;
  }[];
};
export type LinuxWorkspace = {
  schema: 'sky.linux-workspace/1';
  id: string;
  ownerId: string;
  deviceRef: string;
  orderId: string;
  mode: 'sandbox' | 'live';
  terms: LinuxTerms;
  contractDigest: string;
  proofSalt: string;
  proofCommitment: string;
  acceptedAt: number;
  /** Undefined preserves legacy contracts; null defers billing/execution until verified setup. */
  serviceStartAt?: number | null;
  epoch: number;
  serviceWindows: { start: number; end: number | null }[];
  issuer: {
    sequence: number;
    state: 'active' | 'suspended' | 'terminated' | 'unknown';
    validUntil: number;
  };
  attachments: string[];
  jobs: LinuxJob[];
  invoices: LinuxInvoice[];
  receipts: { id: string; digest: string }[];
};
function fail(message: string): never {
  throw new LinuxServiceError(message);
}
export function linuxText(value: unknown, max = 200): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some(
      (char) =>
        char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)),
    )
  )
    fail('入力の形式を確認してください。');
  return value as string;
}
export function linuxInt(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max)
    fail('金額・使用量・期限を確認してください。');
  return Number(value);
}
export function parseLinuxTerms(value: unknown): LinuxTerms {
  const v = value as LinuxTerms;
  if (
    !v ||
    v.schema !== 'sky.linux-terms/1' ||
    v.currency !== 'USD' ||
    v.baseMinor !== SKY_LINUX_BASE_MINOR
  )
    fail('最初のプランは月額16米ドルです。');
  linuxText(v.version, 80);
  linuxInt(v.cpuUnitMs);
  linuxInt(v.cpuUnitMinor);
  linuxInt(v.includedCpuMs);
  if (!v.includedCpuMs)
    fail('月額16米ドルのプランにはLinuxの利用枠が必要です。');
  linuxInt(v.monthlyCapMinor, 100_000_000);
  linuxInt(v.graceDays, 31);
  linuxInt(v.leaseSeconds, 300);
  linuxInt(v.retentionDays, 3650);
  if (
    !v.cpuUnitMs ||
    !v.leaseSeconds ||
    !v.retentionDays ||
    v.monthlyCapMinor < v.baseMinor
  )
    fail('料金の単位・上限・保持期間を確認してください。');
  const url = new URL(linuxText(v.termsUrl, 1000));
  if (url.protocol !== 'https:' || url.username || url.password)
    fail('契約条件のHTTPS URLが必要です。');
  return {
    schema: v.schema,
    version: v.version,
    currency: 'USD',
    baseMinor: 1600,
    cpuUnitMs: v.cpuUnitMs,
    cpuUnitMinor: v.cpuUnitMinor,
    includedCpuMs: v.includedCpuMs,
    monthlyCapMinor: v.monthlyCapMinor,
    graceDays: v.graceDays,
    leaseSeconds: v.leaseSeconds,
    retentionDays: v.retentionDays,
    termsUrl: url.href,
  };
}
export async function makeLinuxListing(value: {
  id: string;
  packageKey: string;
  packageSha256: string;
  creatorId: string;
  model: unknown;
  agent: unknown;
  authorFeeMinor: number;
}): Promise<LinuxListing> {
  const base = {
    id: linuxText(value.id),
    packageKey: linuxText(value.packageKey),
    packageSha256: linuxText(value.packageSha256),
    creatorId: linuxText(value.creatorId, 256),
    model: parseLinuxModel(value.model),
    agent: parseLinuxAgent(value.agent),
    authorFeeMinor: linuxInt(value.authorFeeMinor, 100_000),
  };
  if (
    !/^[a-f0-9]{64}$/.test(base.packageSha256) ||
    base.agent.modelId !== base.model.id
  )
    fail('PackageとAIの版が一致しません。');
  return {
    ...base,
    active: true,
    digest: await sha256Hex(JSON.stringify(base)),
  };
}
export const linuxPeriod = (now: number) =>
  new Date(now).toISOString().slice(0, 7);
function periodEnd(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    fail('請求月を確認してください。');
  const [year, month] = period.split('-').map(Number);
  return Date.UTC(year, month, 1);
}
export async function createLinuxWorkspace(
  ownerId: string,
  deviceRef: string,
  orderId: string,
  termsValue: unknown,
  mode: 'sandbox' | 'live',
  now: number,
): Promise<LinuxWorkspace> {
  const terms = parseLinuxTerms(termsValue),
    id = crypto.randomUUID();
  linuxText(ownerId, 256);
  linuxText(deviceRef, 256);
  linuxText(orderId, 256);
  linuxInt(now);
  const agreement = {
    schema: 'sky.linux-agreement/1',
    id,
    ownerId,
    deviceRef,
    orderId,
    mode,
    terms,
    acceptedAt: now,
  };
  const contractDigest = await sha256Hex(JSON.stringify(agreement));
  const proofSalt = crypto.randomUUID() + crypto.randomUUID();
  // The public commitment contains neither identity nor the enumerable terms digest alone.
  const proofCommitment = await sha256Hex(
    `sky.linux-proof/1:${proofSalt}:${contractDigest}`,
  );
  return {
    schema: 'sky.linux-workspace/1',
    id,
    ownerId,
    deviceRef,
    orderId,
    mode,
    terms,
    contractDigest,
    proofSalt,
    proofCommitment,
    acceptedAt: now,
    epoch: 1,
    issuer: { sequence: 0, state: 'unknown', validUntil: 0 },
    serviceWindows: [],
    attachments: [],
    jobs: [],
    invoices: [],
    receipts: [],
  };
}
export function linuxAccess(w: LinuxWorkspace, now: number) {
  const debt = w.invoices.some(
    (i) => i.state === 'reversed' || (i.state === 'open' && i.dueAt <= now),
  );
  const unreconciled = w.jobs.some(
    (j) =>
      j.period < linuxPeriod(now) && !j.receiptId && j.state !== 'cancelled',
  );
  const active =
    w.serviceStartAt !== null &&
    w.issuer.state === 'active' &&
    w.issuer.validUntil > now &&
    !debt &&
    !unreconciled;
  return {
    state: active ? 'added' : 'restricted',
    canExecute: active,
    canRead: true,
    canExport: true,
    reason: unreconciled
      ? 'usage_reconciliation_required'
      : debt
        ? 'payment_required'
        : w.serviceStartAt === null
          ? 'environment_required'
          : w.issuer.state !== 'active'
            ? 'entitlement_required'
            : w.issuer.validUntil <= now
              ? 'entitlement_expired'
              : null,
    dataRetained: true,
    retentionDays: w.terms.retentionDays,
  };
}
function requireAccess(w: LinuxWorkspace, now: number) {
  if (!linuxAccess(w, now).canExecute)
    fail(
      'LinuxのAddは停止中です。契約と支払いを確認してください。データは保持されています。',
    );
}
function priceCpu(
  w: LinuxWorkspace,
  cpuMs: number,
  period: string,
  omitJob?: string,
) {
  const prior = w.jobs
    .filter((j) => j.period === period && j.id !== omitJob && j.receiptId)
    .reduce((sum, j) => sum + j.cpuMs, 0);
  const before = Math.max(0, prior - w.terms.includedCpuMs),
    after = Math.max(0, prior + cpuMs - w.terms.includedCpuMs);
  const rate = (units: number) => {
    const n = BigInt(units) * BigInt(w.terms.cpuUnitMinor),
      d = BigInt(w.terms.cpuUnitMs);
    const result = Number((n + d - BigInt(1)) / d);
    if (!Number.isSafeInteger(result))
      fail('使用量が料金計算の上限を超えています。');
    return result;
  };
  return rate(after) - rate(before);
}
export function linuxMonthTotal(w: LinuxWorkspace, period: string) {
  return (
    w.terms.baseMinor +
    w.jobs
      .filter((j) => j.period === period)
      .reduce(
        (sum, j) =>
          sum +
          (j.receiptId
            ? j.computeMinor + j.authorMinor
            : ['cancelled'].includes(j.state)
              ? 0
              : j.reservedMinor),
        0,
      )
  );
}
export type LinuxEvent = {
  schema: 'sky.linux-event/1';
  id: string;
  workspaceId: string;
  issuedAt: number;
  kind: 'issuer' | 'result' | 'collection' | 'payment' | 'transfer';
  payload: Record<string, unknown>;
};
export type LinuxCommand =
  | { action: 'add'; listingId: string }
  | {
      action: 'run';
      listingId: string;
      requestId: string;
      input: string;
      maximumMinor: number;
      cpuLimitMs: number;
      accepted: true;
    }
  | { action: 'claim'; jobId: string; claimId: string }
  | { action: 'heartbeat'; jobId: string; claimId: string }
  | { action: 'cancel'; jobId: string }
  | { action: 'confirm'; jobId: string }
  | { action: 'close-month'; period: string };
export async function linuxCommand(
  original: LinuxWorkspace,
  command: LinuxCommand,
  catalog: LinuxListing[],
  now: number,
) {
  const w: LinuxWorkspace = structuredClone(original);
  const listing = (id: string) =>
    catalog.find((x) => x.id === id && x.active) ??
    fail('このモデル・Agentは現在利用できません。');
  const job = (id: string) =>
    w.jobs.find((j) => j.id === id) ?? fail('仕事が見つかりません。');
  if (command.action === 'add') {
    requireAccess(w, now);
    listing(command.listingId);
    if (!w.attachments.includes(command.listingId))
      w.attachments.push(command.listingId);
  } else if (command.action === 'run') {
    requireAccess(w, now);
    const item = listing(command.listingId);
    if (command.accepted !== true || !w.attachments.includes(item.id))
      fail('追加・料金・実行内容を確認してください。');
    const input = linuxText(command.input, 4000),
      inputSha256 = await sha256Hex(input);
    if (!/^[a-f0-9-]{36}$/.test(command.requestId))
      fail('仕事IDを確認してください。');
    const old = w.jobs.find((j) => j.id === command.requestId);
    if (old) {
      if (
        old.inputSha256 !== inputSha256 ||
        old.listing.digest !== item.digest ||
        old.cpuLimitMs !== command.cpuLimitMs ||
        old.reservedMinor !== command.maximumMinor
      )
        fail('同じ仕事IDの内容が異なります。');
      return w;
    }
    if (w.jobs.length >= 100) fail('保存上限です。成果を持ち出してください。');
    const cpuLimitMs = linuxInt(command.cpuLimitMs, 170000),
      reservedMinor = linuxInt(command.maximumMinor, w.terms.monthlyCapMinor);
    // Reserve without relying on remaining included units: concurrent jobs must not spend those units twice.
    const upper =
      Number(
        (BigInt(cpuLimitMs) * BigInt(w.terms.cpuUnitMinor) +
          BigInt(w.terms.cpuUnitMs - 1)) /
          BigInt(w.terms.cpuUnitMs),
      ) + item.authorFeeMinor;
    if (
      !cpuLimitMs ||
      upper > reservedMinor ||
      linuxMonthTotal(w, linuxPeriod(now)) + reservedMinor >
        w.terms.monthlyCapMinor
    )
      fail('今回または月間の承認上限を超えます。');
    const agent = { ...item.agent, id: item.id, sha256: item.digest };
    const run = beginLinuxRun(
      agent,
      input,
      command.requestId,
      item.model.sha256,
    );
    run.job.templateId = 'sky-linux-service';
    w.jobs.unshift({
      id: command.requestId,
      listing: structuredClone(item),
      period: linuxPeriod(now),
      inputSha256,
      reservedMinor,
      cpuLimitMs,
      approvedAt: now,
      state: 'queued',
      claimId: null,
      leaseUntil: 0,
      receiptId: null,
      cpuMs: 0,
      computeMinor: 0,
      authorMinor: 0,
      run,
    });
  } else if (command.action === 'claim' || command.action === 'heartbeat') {
    requireAccess(w, now);
    const j = job(command.jobId);
    const current = listing(j.listing.id);
    if (
      current.digest !== j.listing.digest ||
      j.receiptId ||
      j.period !== linuxPeriod(now)
    )
      fail('モデル版・仕事・請求月を確認してください。');
    if (command.action === 'claim') {
      if (j.state !== 'queued') fail('受付済みの仕事は自動で再実行しません。');
      j.claimId = linuxText(command.claimId);
      j.state = 'running';
    } else if (
      j.state !== 'running' ||
      j.claimId !== command.claimId ||
      j.leaseUntil <= now
    )
      fail('実行許可が失効しました。停止して使用量を返してください。');
    j.leaseUntil = Math.min(
      now + w.terms.leaseSeconds * 1000,
      w.issuer.validUntil,
      periodEnd(j.period),
    );
  } else if (command.action === 'cancel') {
    const j = job(command.jobId);
    if (!j.receiptId && j.state !== 'cancelled') {
      j.state = j.state === 'queued' ? 'cancelled' : 'cancel_requested';
      j.leaseUntil = 0;
      j.run = cancelLinuxRun(j.run);
      if (j.state === 'cancelled') j.run.stop = 'confirmed';
    }
  } else if (command.action === 'confirm') {
    const j = job(command.jobId);
    if (j.state !== 'review') fail('確認する下書きがありません。');
    j.run = confirmLinuxRun(j.run);
    j.state = 'completed';
  } else if (command.action === 'close-month') {
    if (
      periodEnd(command.period) > now ||
      command.period < linuxPeriod(w.acceptedAt)
    )
      fail('請求対象月がまだ終了していません。');
    if (w.invoices.some((i) => i.period === command.period)) return w;
    const jobs = w.jobs.filter((j) => j.period === command.period);
    if (
      !jobs.length &&
      (w.serviceStartAt === null ||
        (w.serviceStartAt !== undefined &&
          w.serviceStartAt >= periodEnd(command.period)))
    )
      return w;
    if (jobs.some((j) => !j.receiptId && j.state !== 'cancelled'))
      fail('使用量未確定の仕事があります。照合してから締めてください。');
    const computeMinor = jobs.reduce((s, j) => s + j.computeMinor, 0),
      authorMinor = jobs.reduce((s, j) => s + j.authorMinor, 0);
    const creators = [...new Set(jobs.map((j) => j.listing.creatorId))];
    const allocations = creators
      .map((creatorId) => {
        const grossMinor = jobs
          .filter((j) => j.listing.creatorId === creatorId)
          .reduce((s, j) => s + j.authorMinor, 0);
        const commissionMinor = marketplaceCommissionMinor(grossMinor);
        return {
          creatorId,
          grossMinor,
          commissionMinor,
          payableMinor: grossMinor - commissionMinor,
          transferRef: null,
          transferRequestedAt: null,
          recoveryRequired: false,
        };
      })
      .filter((a) => a.grossMinor > 0);
    const end = periodEnd(command.period),
      start = Date.parse(command.period + '-01T00:00:00Z');
    const activeMs = w.serviceWindows.reduce(
      (sum, window) =>
        sum +
        Math.max(
          0,
          Math.min(end, window.end ?? w.issuer.validUntil) -
            Math.max(start, window.start),
        ),
      0,
    );
    const baseMinor = Math.ceil((w.terms.baseMinor * activeMs) / (end - start));
    if (baseMinor === 0 && jobs.length === 0)
      fail('有効なサービス期間がありません。');
    w.invoices.push({
      id: `${w.id}:${command.period}`,
      period: command.period,
      contractDigest: w.contractDigest,
      baseMinor,
      computeMinor,
      authorMinor,
      amountMinor: baseMinor + computeMinor + authorMinor,
      dueAt: periodEnd(command.period) + w.terms.graceDays * 86400000,
      state: 'open',
      paymentSequence: 0,
      paymentRef: null,
      providerInvoiceId: null,
      collectionUrl: null,
      collectionRequestedAt: null,
      allocations,
    });
  } else fail('対応する操作を選んでください。');
  return w;
}
/** Only call after role-specific signature verification; browser commands cannot invoke this. */
export async function applyLinuxEvent(
  original: LinuxWorkspace,
  event: LinuxEvent,
  now: number,
) {
  const w = structuredClone(original),
    p = event.payload;
  linuxInt(event.issuedAt);
  if (
    event.schema !== 'sky.linux-event/1' ||
    event.workspaceId !== w.id ||
    Math.abs(event.issuedAt - now) > 300000
  )
    fail('証拠の宛先・期限が一致しません。');
  linuxText(event.id);
  const digest = await sha256Hex(JSON.stringify(event));
  const prior = w.receipts.find((r) => r.id === event.id);
  if (prior) {
    if (prior.digest !== digest) fail('同じ証拠IDの内容が異なります。');
    return w;
  }
  if (w.receipts.length >= 1000)
    fail('証拠の保存上限です。照合・持出しが必要です。');
  if (event.kind === 'issuer') {
    const sequence = linuxInt(p.sequence);
    if (
      p.orderId !== w.orderId ||
      p.deviceRef !== w.deviceRef ||
      sequence <= w.issuer.sequence ||
      !['active', 'suspended', 'terminated', 'unknown'].includes(
        String(p.state),
      )
    )
      fail('利用権の順序・注文・端末が一致しません。');
    const validUntil = linuxInt(p.validUntil);
    if (
      validUntil > now + 86400000 ||
      (p.state === 'active' && validUntil <= now)
    )
      fail('利用権の確認期限を超えています。');
    const open = w.serviceWindows.find((window) => window.end === null);
    if (p.state === 'active' && w.serviceStartAt !== null) {
      if (open && w.issuer.validUntil < now) {
        open.end = w.issuer.validUntil;
        w.serviceWindows.push({ start: now, end: null });
      } else if (!open) w.serviceWindows.push({ start: now, end: null });
    } else if (open) open.end = Math.min(now, w.issuer.validUntil);
    w.issuer = {
      sequence,
      state: p.state as LinuxWorkspace['issuer']['state'],
      validUntil,
    };
    w.epoch++;
  } else if (event.kind === 'result') {
    const j =
      w.jobs.find((j) => j.id === p.jobId) ?? fail('仕事が見つかりません。');
    if (
      j.receiptId ||
      !j.claimId ||
      p.claimId !== j.claimId ||
      p.contractDigest !== w.contractDigest ||
      p.listingDigest !== j.listing.digest ||
      p.inputSha256 !== j.inputSha256
    )
      fail('実行の証拠が依頼と一致しません。');
    if (
      !['succeeded', 'cancelled', 'failed'].includes(String(p.outcome)) ||
      p.meter !== 'linux-wait4-child-cpu/1'
    )
      fail('実行結果と実測方法を確認してください。');
    const cpuMs = linuxInt(p.cpuMs, j.cpuLimitMs),
      durationMs = linuxInt(p.durationMs, 240000);
    j.cpuMs = cpuMs;
    j.computeMinor = priceCpu(w, cpuMs, j.period, j.id);
    const stopped = j.state === 'cancel_requested' || p.outcome !== 'succeeded';
    j.authorMinor = stopped ? 0 : j.listing.authorFeeMinor;
    if (j.computeMinor + j.authorMinor > j.reservedMinor)
      fail('実測料金が承認上限を超えています。');
    if (stopped) {
      j.run = cancelLinuxRun(j.run);
      j.run.stop = 'confirmed';
      j.state = 'cancelled';
    } else {
      j.run = finishLinuxRun(j.run, {
        text: linuxText(p.text, 32000),
        modelSha256: j.listing.model.sha256,
        durationMs,
      });
      j.state = 'review';
    }
    j.receiptId = event.id;
    j.leaseUntil = 0;
  } else if (event.kind === 'collection') {
    const invoice =
      w.invoices.find((i) => i.id === p.invoiceId) ??
      fail('請求書が見つかりません。');
    if (p.state === 'requested') {
      if (
        invoice.state !== 'open' ||
        p.amountMinor !== invoice.amountMinor ||
        p.currency !== 'USD'
      )
        fail('請求書の受付内容が一致しません。');
      if (!invoice.collectionRequestedAt) invoice.collectionRequestedAt = now;
      w.receipts.push({ id: event.id, digest });
      return w;
    }
    if (
      invoice.state !== 'open' ||
      p.amountMinor !== invoice.amountMinor ||
      p.currency !== 'USD' ||
      typeof p.providerInvoiceId !== 'string' ||
      !/^in_[A-Za-z0-9]+$/.test(p.providerInvoiceId)
    )
      fail('請求書の照合に失敗しました。');
    if (
      invoice.providerInvoiceId &&
      invoice.providerInvoiceId !== p.providerInvoiceId
    )
      fail('請求書の二重作成を拒否しました。');
    let url: string | null = null;
    if (p.collectionUrl) {
      if (typeof p.collectionUrl !== 'string')
        fail('請求書URLが一致しません。');
      const parsed = new URL(p.collectionUrl);
      if (
        parsed.protocol !== 'https:' ||
        parsed.hostname !== 'invoice.stripe.com' ||
        parsed.username ||
        parsed.password
      )
        fail('請求書URLが一致しません。');
      url = parsed.href;
    }
    invoice.providerInvoiceId = p.providerInvoiceId;
    invoice.collectionUrl = url;
  } else if (event.kind === 'payment') {
    const invoice =
      w.invoices.find((i) => i.id === p.invoiceId) ??
      fail('請求書が見つかりません。');
    const sequence = linuxInt(p.sequence);
    if (
      sequence <= invoice.paymentSequence ||
      p.amountMinor !== invoice.amountMinor ||
      p.currency !== 'USD' ||
      !['paid', 'reversed'].includes(String(p.state))
    )
      fail('入金の金額・通貨・順序が一致しません。');
    invoice.state = p.state as 'paid' | 'reversed';
    invoice.paymentSequence = sequence;
    invoice.paymentRef = linuxText(p.paymentRef);
    for (const a of invoice.allocations)
      a.recoveryRequired =
        invoice.state === 'reversed' && a.transferRef !== null;
    w.epoch++;
  } else if (event.kind === 'transfer') {
    const invoice =
      w.invoices.find((i) => i.id === p.invoiceId) ??
      fail('請求書が見つかりません。');
    const a =
      invoice.allocations.find((a) => a.creatorId === p.creatorId) ??
      fail('作者の精算が見つかりません。');
    if (p.state === 'reversed') {
      if (
        invoice.state !== 'reversed' ||
        !a.transferRef ||
        p.transferRef !== a.transferRef ||
        p.amountMinor !== a.payableMinor ||
        p.currency !== 'USD'
      )
        fail('作者送金の取消と一致しません。');
      a.recoveryRequired = false;
    } else {
      if (
        invoice.state !== 'paid' ||
        p.paymentRef !== invoice.paymentRef ||
        a.transferRef ||
        p.amountMinor !== a.payableMinor ||
        p.currency !== 'USD'
      )
        fail('入金確認と作者への送金が一致しません。');
      if (p.state === 'requested') {
        if (!a.transferRequestedAt) a.transferRequestedAt = now;
      } else {
        if (!a.transferRequestedAt) fail('作者送金の受付記録がありません。');
        a.transferRef = linuxText(p.transferRef);
      }
    }
  } else fail('証拠の種類を確認してください。');
  w.receipts.push({ id: event.id, digest });
  return w;
}

export type LinuxEventKey = {
  id: string;
  role: LinuxEvent['kind'] | 'worker';
  publicKey: string;
  mode: 'sandbox' | 'live';
  ownerId?: string;
  workspaceId?: string;
};
export async function verifyLinuxEnvelope(
  value: unknown,
  keys: LinuxEventKey[],
  mode: 'sandbox' | 'live',
  now: number,
) {
  const v = value as { keyId: string; event: LinuxEvent; signature: string };
  const key = keys.find(
    (k) =>
      k.id === v?.keyId &&
      k.mode === mode &&
      (k.role === v?.event?.kind ||
        (k.role === 'worker' && v?.event?.kind === 'result')),
  );
  if (
    !key ||
    !Number.isSafeInteger(v.event.issuedAt) ||
    typeof v.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(v.signature)
  )
    fail('信頼できる証拠の署名が必要です。');
  if (
    key.role === 'worker' &&
    (!key.workspaceId || key.workspaceId !== v.event.workspaceId)
  )
    fail('実行環境と契約が一致しません。');
  const decode = (text: string) =>
    Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
      c.charCodeAt(0),
    );
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    decode(key.publicKey),
    'Ed25519',
    false,
    ['verify'],
  );
  const message = new TextEncoder().encode(
    `sky.linux-event-signature/1:${mode}:${JSON.stringify(v.event)}`,
  );
  if (
    !(await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      decode(v.signature),
      message,
    )) ||
    Math.abs(v.event.issuedAt - now) > 300000
  )
    fail('証拠の署名または期限を確認できません。');
  return v.event;
}

export type LinuxWorkerRequest = {
  schema: 'sky.linux-worker-request/1';
  workspaceId: string;
  issuedAt: number;
  action: 'status' | 'claim' | 'heartbeat' | 'close-month' | 'setup-ready';
  jobId?: string;
  claimId?: string;
  period?: string;
  revision?: number;
  contractDigest?: string;
  setupChallenge?: string;
  probeSha256?: string;
};
export async function verifyLinuxWorker(
  value: unknown,
  keys: LinuxEventKey[],
  now: number,
) {
  const v = value as {
    keyId: string;
    request: LinuxWorkerRequest;
    signature: string;
  };
  const key = keys.find(
    (k) =>
      k.id === v?.keyId &&
      k.role === 'worker' &&
      k.mode === 'live' &&
      k.workspaceId === v?.request?.workspaceId &&
      k.ownerId,
  );
  if (
    !key ||
    v.request.schema !== 'sky.linux-worker-request/1' ||
    !Number.isSafeInteger(v.request.issuedAt) ||
    Math.abs(now - v.request.issuedAt) > 60000 ||
    !/^[A-Za-z0-9_-]{86}$/.test(v.signature)
  )
    fail('実行環境の認証を確認できません。');
  const decode = (s: string) =>
    Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
      c.charCodeAt(0),
    );
  const publicKey = await crypto.subtle.importKey(
    'spki',
    decode(key.publicKey),
    'Ed25519',
    false,
    ['verify'],
  );
  if (
    !(await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      decode(v.signature),
      new TextEncoder().encode(
        `sky.linux-worker-request/1:live:${JSON.stringify(v.request)}`,
      ),
    ))
  )
    fail('実行環境の署名を確認できません。');
  return { ownerId: key.ownerId!, request: v.request };
}

export async function linuxRequestText(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel();
      throw new LinuxServiceError('入力が長すぎます。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
