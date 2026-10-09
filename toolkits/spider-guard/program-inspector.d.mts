export type ProgramLanguage = 'javascript' | 'python' | 'text';
export type ProgramFinding = {
  id: string;
  rule: string;
  kind: 'secret' | 'personal' | 'code';
  severity: 'critical' | 'high' | 'medium';
  line: number;
  endLine: number;
  title: string;
  why: string;
  remediation: string;
};
export type ProgramReport = {
  schemaVersion: 1;
  language: ProgramLanguage;
  findings: ProgramFinding[];
  counts: { secret: number; personal: number; code: number; total: number };
  coverageLimited: boolean;
  state: 'needs_review' | 'no_findings' | 'incomplete' | 'empty';
  limitations: string[];
};
export const MAX_PROGRAM_BYTES: number;
export const MAX_PROGRAM_LINES: number;
export const MAX_PROGRAM_FINDINGS: number;
export class ProgramInspectionError extends Error {
  code: 'CODE_INSPECTION_INVALID_INPUT' | 'CODE_INSPECTION_TOO_LARGE' | 'CODE_INSPECTION_UNSUPPORTED_LANGUAGE';
  constructor(code?: string);
}
export function inspectProgram(source: string, options?: { language?: ProgramLanguage }): ProgramReport;
