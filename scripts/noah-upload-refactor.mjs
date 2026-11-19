import { sourceProject, projectCandidate, applyProjectCandidate } from '../lib/noah-source-project.ts';
import { noahSha256 } from '../lib/noah-agent-upload.ts';
import { validateProject } from './noah-project-validation.mjs';

// Callers supply an authenticated, local-model proposer. No model output is
// adopted until both original and candidate pass the same immutable tests.
export async function refactorUploadProject({ root, name, bytes, signal, propose, validate = validateProject, onStage = () => {} }) {
  const originalSha256 = await noahSha256(bytes);
  const report = { engine: 'noah-project-refactor/1', status: 'failed', validation: 'not_run', changes: [], files: [],
    message: '検証を完了できなかったため、原本を保持しました。', originalSha256, sourceSha256: originalSha256,
    evidence: { baseline: null, candidate: null, proposer: null, fixedTests: [] } };
  try {
    const original = await sourceProject(name, bytes);
    report.evidence.fixedTests = await Promise.all(original.files.filter(f => original.tests.includes(f.name)).map(async f => ({ name: f.name, sha256: await noahSha256(new TextEncoder().encode(f.content)) })));
    signal.throwIfAborted(); onStage('validating_original');
    const baseline = await validate({ root, project: original, signal }); report.evidence.baseline = baseline;
    if (!baseline.passed) {
      report.status = ['unverified', 'dependencies'].includes(baseline.stage) ? 'unsupported' : 'failed';
      report.message = baseline.message || '変更前の固定テスト・構文・型を確認できません。原本を保持しました。';
      return { bytes, report };
    }
    signal.throwIfAborted(); onStage('refactoring');
    const proposal = await propose(original, signal); signal.throwIfAborted();
    report.evidence.proposer = proposal.evidence;
    const candidate = await projectCandidate(original, proposal.value);
    onStage('validating_candidate');
    const validated = await validate({ root, project: candidate, signal }); report.evidence.candidate = validated;
    if (!validated.passed) {
      report.message = '修正後の固定テスト・構文・型を確認できません。変更を採用せず原本を保持しました。';
      return { bytes, report };
    }
    signal.throwIfAborted();
    const edits = candidate.files.filter(f => f.content !== original.files.find(o => o.name === f.name).content);
    const result = edits.length ? applyProjectCandidate(name, bytes, candidate) : bytes;
    return { bytes: result, report: { ...report, status: edits.length ? 'refactored' : 'unchanged', validation: 'fixed_tests',
      message: `${original.tests.length}個の固定テストファイルで変更前後を確認しました。${edits.length}ファイルを変更しました。試験対象外の業務・外部接続は未検証です。`,
      sourceSha256: await noahSha256(result),
      changes: edits.map(f => ({ rule: 'agent-refactor', file: f.name, line: 1, before: original.files.find(o => o.name === f.name).content, after: f.content })),
      files: candidate.files.map(f => ({ name: f.name, status: edits.some(e => e.name === f.name) ? 'refactored' : 'unchanged', message: original.tests.includes(f.name) ? '変更前の固定テストを保持' : edits.some(e => e.name === f.name) ? '変更前後の固定テスト確認済み' : '原本を保持' })),
    } };
  } catch (error) {
    signal.throwIfAborted();
    report.message = `${error?.status && typeof error.message === 'string' ? error.message : '検証器またはAgentの結果を確認できません。'} 原本を保持しました。`;
    return { bytes, report };
  }
}
