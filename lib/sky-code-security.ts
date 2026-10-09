import { inspectProgram } from '../toolkits/spider-guard/program-inspector.mjs';
import {
  CODE_PROTECTORS,
  codeSourceHash,
  type CodeDraft,
  type CodeInspection,
  type CodeProtector,
} from './sky-code.ts';
import { SkySubmissionError } from './sky-submission.ts';

// Only server-installed adapters participate. The browser cannot register a URL,
// execute scanner code, or supply its own trusted result.
export type CodeSecurityAdapter = CodeProtector & {
  version: string;
  inspect: (draft: CodeDraft, sourceSha256: string) => Promise<CodeInspection>;
};
function localAdapter(id: 'spider' | 'secret-check'): CodeSecurityAdapter {
  const provider = CODE_PROTECTORS.find((p) => p.id === id)!;
  return {
    ...provider,
    version: '1',
    async inspect(draft, sourceSha256) {
      const findings: CodeInspection['findings'] = [];
      let incomplete = false;
      const entries = [
        ...draft.files,
        {
          path: '公開情報',
          source: [
            draft.title,
            draft.author,
            draft.description,
            draft.message,
            draft.license,
            ...draft.files.map((f) => f.path),
          ].join('\n'),
        },
      ];
      for (const file of entries) {
        const language =
          id === 'secret-check'
            ? 'text'
            : /\.(?:[cm]?js|jsx|tsx?)$/.test(file.path)
              ? 'javascript'
              : file.path.endsWith('.py')
                ? 'python'
                : 'text';
        const report = inspectProgram(file.source, { language });
        incomplete ||= report.coverageLimited;
        findings.push(
          ...report.findings
            .slice(0, 100 - findings.length)
            .map((f) => ({ path: file.path, line: f.line, title: f.title })),
        );
      }
      if (incomplete && findings.length < 100)
        findings.push({
          path: '検査全体',
          line: 0,
          title: '検査が完了していません。入力を見直してください。',
        });
      return {
        provider: id,
        label: provider.label,
        version: '1',
        sourceSha256,
        status: findings.length || incomplete ? 'blocked' : 'passed',
        scope: provider.scope,
        findings,
      };
    },
  };
}
export function codeSecurityRegistry(adapters: CodeSecurityAdapter[] = []) {
  const installed = new Map<string, CodeSecurityAdapter>(
    ['spider', 'secret-check'].map((id) => {
      const adapter = localAdapter(id as 'spider' | 'secret-check');
      return [adapter.id, adapter];
    }),
  );
  for (const adapter of adapters) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(adapter.id) ||
      installed.has(adapter.id) ||
      adapter.id === 'none' ||
      !adapter.version
    )
      throw new Error('INVALID_CODE_SECURITY_ADAPTER');
    installed.set(adapter.id, adapter);
  }
  return {
    providers: [...installed.values()]
      .map(({ id, label, scope }) => ({ id, label, scope }))
      .concat(CODE_PROTECTORS.filter((p) => p.id === 'none')),
    async inspect(draft: CodeDraft): Promise<CodeInspection> {
      const sourceSha256 = await codeSourceHash(draft);
      if (draft.protector === 'none') {
        if (!draft.protectionChangeConfirmed)
          throw new SkySubmissionError(
            '検査を外して公開することを確認してください。',
          );
        return {
          provider: 'none',
          label: '検査なし',
          version: '1',
          sourceSha256,
          status: 'disabled',
          scope: '公開前の自動検査なし',
          findings: [],
        };
      }
      const adapter = installed.get(draft.protector);
      if (!adapter)
        throw new SkySubmissionError(
          '選んだ検査器は接続されていません。公開を停止しました。',
          409,
        );
      let result: CodeInspection;
      try {
        result = await adapter.inspect(draft, sourceSha256);
      } catch {
        throw new SkySubmissionError(
          '検査器が応答しませんでした。コードは公開されていません。',
          503,
        );
      }
      if (
        result.provider !== adapter.id ||
        result.sourceSha256 !== sourceSha256 ||
        result.version !== adapter.version ||
        !['passed', 'blocked'].includes(result.status) ||
        !Array.isArray(result.findings) ||
        result.findings.length > 100 ||
        (result.status === 'passed' && result.findings.length !== 0)
      )
        throw new SkySubmissionError(
          '検査結果が現在のコードと一致しません。公開を停止しました。',
          503,
        );
      return { ...result, label: adapter.label, scope: adapter.scope };
    },
  };
}
