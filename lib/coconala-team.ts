export type TeamCaseStatus = 'draft' | 'assigned' | 'delivered' | 'accepted';

export type TeamTerms = {
  title: string;
  orderReference: string;
  clientLabel: string;
  workerName: string;
  scope: string;
  deliveryDate: string;
  deliveryPlace: string;
  inspectionDate: string;
  revisionScope: string;
  rights: string;
  grossYen: number;
  estimatedPlatformFeePercent: number;
  workerFeeYen: number;
  workerPaymentDate: string;
  platformRulesReference: string;
  customerDisclosureReference: string;
  workerTermsReference: string;
};

export type TeamMoneyEntry = {
  id: string;
  amountYen: number;
  reference: string;
  at: string;
};

export type TeamCase = {
  id: string;
  revision: number;
  status: TeamCaseStatus;
  terms: TeamTerms;
  customerReceipts: TeamMoneyEntry[];
  customerRefunds: TeamMoneyEntry[];
  workerPayments: TeamMoneyEntry[];
  events: { id: string; action: string; note: string; at: string }[];
  createdAt: string;
  updatedAt: string;
};

export class TeamCaseError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function teamId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new TeamCaseError('操作IDの形式を確認してください。');
  return value.toLowerCase();
}

function inputObject(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key)))
    throw new TeamCaseError('入力項目を確認してください。');
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      Array.from(value).some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && !['\t', '\n', '\r'].includes(char)) || code === 127;
      }))
    throw new TeamCaseError(`${label}を入力してください（${max}文字まで）。`);
  return value.trim();
}

function yen(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100_000_000)
    throw new TeamCaseError(`${label}を0〜1億円の整数で入力してください。`);
  return Number(value);
}

function date(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new TeamCaseError(`${label}を日付で指定してください。`);
  return value;
}

export function parseTeamTerms(value: unknown): TeamTerms {
  const v = inputObject(value, [
    'title', 'orderReference', 'clientLabel', 'workerName', 'scope',
    'deliveryDate', 'deliveryPlace', 'inspectionDate', 'revisionScope',
    'rights', 'grossYen', 'estimatedPlatformFeePercent', 'workerFeeYen',
    'workerPaymentDate', 'platformRulesReference',
    'customerDisclosureReference', 'workerTermsReference',
  ]);
  const grossYen = yen(v.grossYen, '受注額');
  const workerFeeYen = yen(v.workerFeeYen, '担当者報酬');
  const feePercent = v.estimatedPlatformFeePercent;
  if (grossYen === 0 || workerFeeYen === 0 ||
      typeof feePercent !== 'number' || !Number.isFinite(feePercent) ||
      feePercent < 0 || feePercent > 100 || Math.round(feePercent * 100) !== feePercent * 100)
    throw new TeamCaseError('受注額・担当者報酬・販売手数料率を確認してください。');
  const estimatedNet = grossYen - Math.round(grossYen * feePercent / 100);
  if (workerFeeYen > estimatedNet)
    throw new TeamCaseError('担当者報酬が手数料控除後の見込額を超えています。条件を見直してください。');
  const deliveryDate = date(v.deliveryDate, '納品予定日');
  const workerPaymentDate = date(v.workerPaymentDate, '担当者への支払期日');
  const limit = new Date(`${deliveryDate}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 60);
  if (workerPaymentDate > limit.toISOString().slice(0, 10))
    throw new TeamCaseError('担当者への支払期日は納品予定日から60日以内にしてください。実際の受領日も別途確認してください。');
  return {
    title: text(v.title, '案件名', 120),
    orderReference: text(v.orderReference, 'ココナラの案件番号・参照', 120),
    clientLabel: text(v.clientLabel, '顧客の表示名', 120),
    workerName: text(v.workerName, '制作担当者名', 120),
    scope: text(v.scope, '委託する作業', 2000),
    deliveryDate,
    deliveryPlace: text(v.deliveryPlace, '納品先・方法', 240),
    inspectionDate: date(v.inspectionDate, '検査完了予定日'),
    revisionScope: text(v.revisionScope, '修正範囲', 500),
    rights: text(v.rights, '成果物の権利・利用条件', 500),
    grossYen,
    estimatedPlatformFeePercent: feePercent,
    workerFeeYen,
    workerPaymentDate,
    platformRulesReference: text(v.platformRulesReference, '規約・再委託条件の確認記録', 500),
    customerDisclosureReference: text(v.customerDisclosureReference, '顧客へのチーム制作説明記録', 500),
    workerTermsReference: text(v.workerTermsReference, '担当者への発注条件明示記録', 500),
  };
}

export function teamMoney(caseFile: TeamCase) {
  const receipts = caseFile.customerReceipts.reduce((sum, item) => sum + item.amountYen, 0);
  const refunds = caseFile.customerRefunds.reduce((sum, item) => sum + item.amountYen, 0);
  const paid = caseFile.workerPayments.reduce((sum, item) => sum + item.amountYen, 0);
  const { grossYen, estimatedPlatformFeePercent, workerFeeYen } = caseFile.terms;
  const estimatedFee = Math.round(grossYen * estimatedPlatformFeePercent / 100);
  return {
    estimatedFee,
    estimatedNet: grossYen - estimatedFee,
    estimatedOperatorMargin: grossYen - estimatedFee - workerFeeYen,
    manuallyRecordedCustomerNet: receipts - refunds,
    workerPaid: paid,
    workerRemaining: workerFeeYen - paid,
  };
}

export function createTeamCase(value: unknown, now = new Date().toISOString()): TeamCase {
  const v = inputObject(value, ['id', 'terms']);
  return {
    id: teamId(v.id), revision: 0, status: 'draft', terms: parseTeamTerms(v.terms),
    customerReceipts: [], customerRefunds: [], workerPayments: [], events: [],
    createdAt: now, updatedAt: now,
  };
}

export function applyTeamAction(caseFile: TeamCase, value: unknown, revision: unknown,
  now = new Date().toISOString()): TeamCase {
  const v = inputObject(value, ['id', 'action', 'note', 'amountYen', 'reference', 'terms']);
  const id = teamId(v.id);
  const action = v.action;
  if (typeof action !== 'string' || ![
    'update_terms', 'assign', 'deliver', 'accept', 'record_customer_receipt',
    'record_refund', 'record_worker_payment',
  ].includes(action)) throw new TeamCaseError('操作を確認してください。');
  const prior = caseFile.events.find((event) => event.id === id);
  if (prior) throw new TeamCaseError('同じ操作IDは既に使用されています。', 409);
  if (!Number.isInteger(revision) || revision !== caseFile.revision)
    throw new TeamCaseError('別の操作で更新されています。再読込してください。', 409);
  const next: TeamCase = {
    ...caseFile, revision: caseFile.revision + 1, updatedAt: now,
    customerReceipts: [...caseFile.customerReceipts],
    customerRefunds: [...caseFile.customerRefunds],
    workerPayments: [...caseFile.workerPayments],
    events: [...caseFile.events],
  };
  let note = '';
  if (action === 'update_terms') {
    if (caseFile.status !== 'draft') throw new TeamCaseError('担当開始後の条件変更は、新しい合意として別案件にしてください。', 409);
    next.terms = parseTeamTerms(v.terms);
    note = '発注前の条件を更新';
  } else if (action === 'assign') {
    if (caseFile.status !== 'draft') throw new TeamCaseError('担当開始済みです。', 409);
    next.status = 'assigned';
    note = '規約確認・顧客説明・担当者への条件明示を本人が記録して担当開始';
  } else if (action === 'deliver') {
    if (caseFile.status !== 'assigned') throw new TeamCaseError('担当開始後に納品を記録してください。', 409);
    note = text(v.note, '成果物の受領・検査記録', 2000);
    next.status = 'delivered';
  } else if (action === 'accept') {
    if (caseFile.status !== 'delivered') throw new TeamCaseError('納品確認後に顧客の検収を記録してください。', 409);
    note = text(v.note, '顧客の検収記録', 2000);
    next.status = 'accepted';
  } else {
    if (caseFile.status === 'draft') throw new TeamCaseError('担当開始前には入出金を記録できません。', 409);
    const amountYen = yen(v.amountYen, '金額');
    if (amountYen === 0) throw new TeamCaseError('金額を入力してください。');
    const reference = text(v.reference, '外部明細・振込の参照番号', 240);
    const entry = { id, amountYen, reference, at: now };
    if (action === 'record_customer_receipt') next.customerReceipts.push(entry);
    if (action === 'record_refund') {
      if (teamMoney(caseFile).manuallyRecordedCustomerNet < amountYen)
        throw new TeamCaseError('返金額が記録済み入金額を超えています。');
      next.customerRefunds.push(entry);
    }
    if (action === 'record_worker_payment') {
      if (teamMoney(caseFile).workerRemaining < amountYen)
        throw new TeamCaseError('支払記録が合意済み報酬を超えています。');
      next.workerPayments.push(entry);
    }
    note = `${action}: ${amountYen}円 / ${reference}`;
  }
  next.events.push({ id, action, note, at: now });
  return next;
}
