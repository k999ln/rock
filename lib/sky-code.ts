import { SkySubmissionError } from './sky-submission.ts';
import type { WorkJob } from './workflow.ts';

export type CodeFile = { path: string; source: string };
export type CodeDraft = {
  id: string;
  repoId: string;
  expectedRevision: number;
  title: string;
  author: string;
  description: string;
  message: string;
  license: string;
  files: CodeFile[];
  protector: string;
  publishConfirmed: true;
  protectionChangeConfirmed: boolean;
};
export type CodeInspection = {
  provider: string;
  label: string;
  version: string;
  sourceSha256: string;
  status: 'passed' | 'blocked' | 'disabled';
  scope: string;
  findings: { path: string; line: number; title: string }[];
};
export type CodeCommit = {
  id: string;
  repoId: string;
  revision: number;
  parentId: string | null;
  title: string;
  author: string;
  description: string;
  message: string;
  license: string;
  files: CodeFile[];
  sourceSha256: string;
  inspection: CodeInspection;
  workflow: WorkJob;
  createdAt: number;
};
export type CodeSummary = Omit<
  CodeCommit,
  'files' | 'workflow' | 'inspection'
> & {
  paths: string[];
  inspection: Omit<CodeInspection, 'findings'>;
  canEdit: boolean;
  hidden: boolean;
  repoRevision: number;
};
export type CodeDetail = {
  commit: CodeCommit;
  parent: CodeCommit | null;
  history: CodeSummary[];
  canEdit: boolean;
  hidden: boolean;
  repoRevision: number;
};
export type CodeProtector = { id: string; label: string; scope: string };
export const CODE_PROTECTORS: CodeProtector[] = [
  {
    id: 'spider',
    label: 'SPIDER（標準）',
    scope: '秘密情報・個人情報とJavaScript／Pythonの危険パターン',
  },
  {
    id: 'secret-check',
    label: 'Secret Check',
    scope: '秘密情報・個人情報のみ。コードの動作は検査しません',
  },
  {
    id: 'none',
    label: '取り外す（検査なし）',
    scope: '公開前の自動検査を行いません',
  },
];
export const CODE_MAX_BYTES = 65536;
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function codeId(value: unknown): string {
  if (typeof value !== 'string' || !idPattern.test(value))
    throw new SkySubmissionError('コードのIDを確認してください。');
  return value;
}
function text(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some(
      (c) =>
        (c.charCodeAt(0) < 32 && c !== '\n' && c !== '\t') ||
        c.charCodeAt(0) === 127,
    )
  )
    throw new SkySubmissionError(`入力を確認してください（1〜${max}文字）。`);
  return value.trim();
}
export function parseCodeDraft(value: unknown): CodeDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SkySubmissionError('コードの入力形式を確認してください。');
  const v = value as Record<string, unknown>;
  if (v.publishConfirmed !== true)
    throw new SkySubmissionError(
      'コード全文と履歴を一般公開することを確認してください。',
    );
  if (
    !Number.isSafeInteger(v.expectedRevision) ||
    Number(v.expectedRevision) < 0
  )
    throw new SkySubmissionError('現在の版を確認してください。');
  if (!Array.isArray(v.files) || v.files.length < 1 || v.files.length > 8)
    throw new SkySubmissionError('ファイルは1〜8個にしてください。');
  const files: CodeFile[] = v.files
    .map((file: unknown) => {
      if (!file || typeof file !== 'object')
        throw new SkySubmissionError('ファイルを確認してください。');
      const f = file as Record<string, unknown>;
      const path = text(f.path, 120);
      if (
        !/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*\.(?:js|jsx|mjs|cjs|ts|tsx|py|json|md|txt)$/.test(
          path,
        ) ||
        path.split('/').some((p) => !p || p === '.' || p === '..')
      )
        throw new SkySubmissionError(
          '相対ファイル名と拡張子（JS／TS／Python／JSON／Markdown／txt）を確認してください。',
        );
      if (typeof f.source !== 'string' || f.source.includes('\0'))
        throw new SkySubmissionError('テキストコードを入力してください。');
      const source = f.source.replace(/\r\n?/g, '\n');
      if (source.split('\n').length > 2000)
        throw new SkySubmissionError('1ファイル2,000行以内にしてください。');
      return { path, source };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(files.map((f) => f.path.toLowerCase())).size !== files.length)
    throw new SkySubmissionError('ファイル名が重複しています。');
  if (
    !files.some((f) => f.source.trim()) ||
    files.reduce(
      (sum, f) => sum + new TextEncoder().encode(f.source).length,
      0,
    ) > CODE_MAX_BYTES
  )
    throw new SkySubmissionError(
      'コードは空にせず、合計64 KiB以内にしてください。',
    );
  const protector =
    v.protector === undefined ? 'spider' : text(v.protector, 64);
  if (!/^[a-z][a-z0-9-]*$/.test(protector))
    throw new SkySubmissionError('検査器を選んでください。');
  return {
    id: codeId(v.id),
    repoId: codeId(v.repoId),
    expectedRevision: Number(v.expectedRevision),
    title: text(v.title, 80),
    author: text(v.author, 60),
    description: text(v.description, 240),
    message: text(v.message, 200),
    license: text(v.license, 80),
    files,
    protector,
    publishConfirmed: true,
    protectionChangeConfirmed: v.protectionChangeConfirmed === true,
  };
}
export async function codeSourceHash(
  draft: Pick<
    CodeDraft,
    'files' | 'title' | 'author' | 'description' | 'message' | 'license'
  >,
) {
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      draft.title,
      draft.author,
      draft.description,
      draft.message,
      draft.license,
      draft.files,
    ]),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
// A bounded line diff: common prefix/suffix plus changed blocks, never HTML.
export function codeDiff(before: string, after: string) {
  const a = before.split('\n'),
    b = after.split('\n');
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return [
    ...a.slice(0, start).map((text) => ({ kind: 'same' as const, text })),
    ...a
      .slice(start, a.length - end)
      .map((text) => ({ kind: 'removed' as const, text })),
    ...b
      .slice(start, b.length - end)
      .map((text) => ({ kind: 'added' as const, text })),
    ...b.slice(b.length - end).map((text) => ({ kind: 'same' as const, text })),
  ];
}
