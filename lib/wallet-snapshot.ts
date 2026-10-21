import { readOwnerScope } from './owner-intent.ts';

export type WalletSnapshot = {
  ownerScope?: string;
  currency: 'JPY';
  balance: number;
  revenue: number;
  expense: number;
  records: {
    id: string;
    kind: 'revenue' | 'expense';
    amount: number;
    source: string;
    occurredOn: string;
    reversesId: string | null;
    createdAt: number;
    reversed: number;
  }[];
  persistence: 'd1';
  transfers: 'not-connected';
  fund: {
    joined: boolean;
    status: 'simulation';
    commonRevenue: number;
    distributable: number;
    projectedShare: number;
    updatedAt: string | null;
  };
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** Validate the shared read model before either Wallet view or a save accepts it.
 * Older read-only snapshots may omit ownerScope; they never authorize writes.
 */
export function isWalletSnapshot(value: unknown): value is WalletSnapshot {
  if (!record(value) || value.currency !== 'JPY' || value.persistence !== 'd1' ||
      value.transfers !== 'not-connected' || !finite(value.balance) ||
      !finite(value.revenue) || !finite(value.expense) || !Array.isArray(value.records) ||
      (value.ownerScope !== undefined && !readOwnerScope(value.ownerScope))) return false;
  if (!value.records.every((entry: unknown) => record(entry) && text(entry.id) &&
      (entry.kind === 'revenue' || entry.kind === 'expense') && finite(entry.amount) &&
      text(entry.source) && typeof entry.occurredOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.occurredOn) &&
      (entry.reversesId === null || text(entry.reversesId)) && finite(entry.createdAt) &&
      (entry.reversed === 0 || entry.reversed === 1))) return false;
  const fund = value.fund;
  return record(fund) && typeof fund.joined === 'boolean' && fund.status === 'simulation' &&
    finite(fund.commonRevenue) && finite(fund.distributable) && finite(fund.projectedShare) &&
    (fund.updatedAt === null || typeof fund.updatedAt === 'string');
}
