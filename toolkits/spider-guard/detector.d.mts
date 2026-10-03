export type SensitiveFinding = {
  id: string;
  kind: 'secret' | 'personal';
  label: string;
  severity: 'critical' | 'high' | 'medium';
  start: number;
  end: number;
};
export const MAX_INSPECTION_CHARACTERS: number;
export const MAX_TEXT_LENGTH: number;
export class SensitiveDataBlockedError extends Error {
  code: 'SENSITIVE_DATA_BLOCKED';
  status: number;
  count: number;
  kinds: Array<'secret' | 'personal'>;
  constructor(count?: number, kinds?: Array<'secret' | 'personal'>);
}
export function detectSensitiveData(text: string): SensitiveFinding[];
export function redactSensitiveData(
  text: string,
  findings?: SensitiveFinding[],
): string;
export function assertSafeOutbound(value: unknown): void;
