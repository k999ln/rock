import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { ownerScopeFor } from './owner-intent.ts';
import type { NoahSourceProcessing } from './noah-upload-refactor.ts';

export type ProcessingReference = { id: string; token: string };
export type ProcessingExpected = { id: string; name: string; sha256: string; user: string };
export type ProcessingResolver = (request: Request, reference: ProcessingReference, expected: ProcessingExpected) => Promise<{ bytes: Uint8Array; report: NoahSourceProcessing }>;

// Only the authenticated local preview can resolve a host receipt. Public
// deployments require their own authenticated runner transport, never arbitrary
// caller URLs. The browser supplies a reference, not test results or source bytes.
export async function resolveLocalProcessing(request: Request, reference: ProcessingReference, expected: ProcessingExpected, fetcher: typeof fetch = fetch) {
  const url = new URL(request.url);
  if (expected.user !== 'local-preview:rockstar-owner' || url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new NoahAgentError('この登録先には検証済みの実行ホストが接続されていません。', 503);
  const scope = await ownerScopeFor(expected.user);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: url.origin, 'X-Rock-Owner-Scope': scope };
  for (const name of ['cookie', 'authorization', 'oai-authenticated-user-id']) { const value = request.headers.get(name); if (value) headers[name] = value; }
  let response: Response;
  try {
    // Workers supports manual/follow, but rejects the Fetch-standard error mode
    // before sending a request. Never forward owner credentials on a redirect.
    response = await fetcher(`${url.origin}/__noah/upload-refactor/${reference.id}/receipt`, { method: 'POST', headers, body: JSON.stringify({ token: reference.token }), redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch (error) {
    // No source, credentials, receipt token or headers are logged.
    console.error('Noah processor transport:', error instanceof Error ? error.message : 'unavailable');
    throw new NoahAgentError('整理済みの結果を保存先から確認できません。実行ホストの接続を確認して再試行してください。', 503);
  }
  if (!response.ok) { await response.body?.cancel(); throw new NoahAgentError('整理結果の期限・本人・実行ホストを確認してください。原本を変更していません。', response.status === 404 ? 409 : 503); }
  const reader = response.body?.getReader(); if (!reader) throw new NoahAgentError('整理結果がありません。', 503);
  let size = 0; const parts: Uint8Array[] = [];
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16 * 1024 * 1024) { await reader.cancel(); throw new NoahAgentError('整理結果が上限を超えました。', 413); } parts.push(part.value); }
  const raw = new Uint8Array(size); let offset = 0; for (const part of parts) { raw.set(part, offset); offset += part.length; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (value.id !== expected.id || value.ownerScope !== scope || value.name !== expected.name || value.originalSha256 !== expected.sha256 ||
    typeof value.base64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64) ||
    value.report?.engine !== 'noah-project-refactor/1' || value.report.originalSha256 !== expected.sha256 || !['refactored', 'unchanged', 'unsupported', 'failed'].includes(value.report.status) ||
    !Array.isArray(value.report.changes) || !Array.isArray(value.report.evidence?.fixedTests)) throw new NoahAgentError('整理結果と登録原本が一致しません。', 409);
  const bytes = Uint8Array.from(atob(value.base64), c => c.charCodeAt(0)), digest = await noahSha256(bytes);
  if (bytes.length > 10 * 1024 * 1024 || digest !== value.report.sourceSha256 ||
    (value.report.status !== 'refactored' && digest !== expected.sha256) ||
    (value.report.validation === 'fixed_tests' && (!value.report.evidence.baseline?.passed || !value.report.evidence.candidate?.passed || !value.report.evidence.fixedTests.length)) ||
    (value.report.status === 'refactored' && value.report.validation !== 'fixed_tests')) throw new NoahAgentError('修正コードの内容と検証結果を照合できません。', 409);
  return { bytes, report: value.report as NoahSourceProcessing };
}
