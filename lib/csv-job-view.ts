import { readOwnerScope } from './owner-intent.ts';
export type CsvClientJob = {
  id: string; status: string; paymentStatus: string; inputName: string; inputBytes: number;
  inputSha256: string; inputEncoding: string; quoteMinor: number; currency: string;
  outputSha256: string | null; validation: { passed?: boolean } | null; attempt: number;
  revision: number; errorCode: string | null; expiresAt: number; createdAt: number;
  completedAt: number | null; approvedAt: number | null; deliveryRevision: number;
  revisionReason: string | null; specification: Record<string, unknown>; artifacts: string[];
};
export type CsvBillingAccount = { status: string; cancelAtMonth: string | null; monthlyFeeEnabled: boolean; ownerScope?: string };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const nullableText = (v: unknown) => v === null || text(v);
const nullableTime = (v: unknown) => v === null || integer(v);
/** The public CSV projection retains delivery revisions and billing semantics. */
export function isCsvClientJob(v: unknown): v is CsvClientJob {
  return object(v) && text(v.id) && text(v.status) && text(v.paymentStatus) && text(v.inputName) &&
    integer(v.inputBytes) && text(v.inputSha256) && text(v.inputEncoding) && integer(v.quoteMinor) &&
    typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency) && nullableText(v.outputSha256) &&
    (v.validation === null || object(v.validation) && (v.validation.passed === undefined || typeof v.validation.passed === 'boolean')) &&
    integer(v.attempt) && integer(v.revision) && nullableText(v.errorCode) && integer(v.expiresAt) && integer(v.createdAt) &&
    nullableTime(v.completedAt) && nullableTime(v.approvedAt) && integer(v.deliveryRevision) && nullableText(v.revisionReason) && object(v.specification) &&
    Array.isArray(v.artifacts) && v.artifacts.every(item => typeof item === 'string' && ['result', 'spreadsheet-safe', 'report-json', 'report-html'].includes(item));
}
export function isCsvHistory(v: unknown): v is { jobs: CsvClientJob[]; ownerScope: string } {
  return object(v) && Array.isArray(v.jobs) && v.jobs.every(isCsvClientJob) && Boolean(readOwnerScope(v.ownerScope));
}
export function isCsvBilling(v: unknown): v is CsvBillingAccount {
  return object(v) && text(v.status) && (v.cancelAtMonth === null || typeof v.cancelAtMonth === 'string' && /^\d{4}-\d{2}$/.test(v.cancelAtMonth)) &&
    typeof v.monthlyFeeEnabled === 'boolean' && (v.ownerScope === undefined || Boolean(readOwnerScope(v.ownerScope)));
}
