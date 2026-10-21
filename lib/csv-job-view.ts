import { readOwnerScope } from './owner-intent.ts';

export type CsvClientJob = {
  id: string;
  status: string;
  paymentStatus: string;
  inputName: string;
  inputBytes: number;
  inputSha256: string;
  inputEncoding: string;
  quoteMinor: number;
  currency: string;
  outputSha256: string | null;
  validation: { passed?: boolean } | null;
  attempt: number;
  revision: number;
  errorCode: string | null;
  expiresAt: number;
  createdAt: number;
  completedAt: number | null;
  artifacts: string[];
};

export type CsvHistory = { jobs: CsvClientJob[]; ownerScope?: string; trialPayment?: { available: boolean; mode: string | null } };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableText = (value: unknown) => value === null || text(value);

/** Validate the existing client read model before rendering or confirming a save. */
export function isCsvClientJob(value: unknown): value is CsvClientJob {
  return object(value) && text(value.id) && text(value.status) && text(value.paymentStatus) &&
    text(value.inputName) && integer(value.inputBytes) && text(value.inputSha256) && text(value.inputEncoding) &&
    integer(value.quoteMinor) && text(value.currency) && nullableText(value.outputSha256) &&
    (value.validation === null || (object(value.validation) && (value.validation.passed === undefined || typeof value.validation.passed === 'boolean'))) &&
    integer(value.attempt) && integer(value.revision) && nullableText(value.errorCode) &&
    integer(value.expiresAt) && integer(value.createdAt) && (value.completedAt === null || integer(value.completedAt)) &&
    Array.isArray(value.artifacts) && value.artifacts.every(item => typeof item === 'string' && ['result', 'spreadsheet-safe', 'report-json', 'report-html'].includes(item));
}
export function isCsvHistory(value: unknown): value is CsvHistory {
  if (!object(value) || !Array.isArray(value.jobs) || !value.jobs.every(isCsvClientJob) ||
      (value.ownerScope !== undefined && !readOwnerScope(value.ownerScope))) return false;
  const payment = value.trialPayment;
  return payment === undefined || (object(payment) && typeof payment.available === 'boolean' &&
    (payment.mode === null || typeof payment.mode === 'string'));
}
