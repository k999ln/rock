import type ts from 'typescript';
import { NOAH_CODE_LIMIT } from './noah-agent-upload.ts';
import { readNoahArchive, writeNoahArchive } from './noah-source-archive.ts';

export type NoahSourceProcessing = {
  engine: 'noah-syntax-refactor/1' | 'noah-archive-refactor/1' | 'noah-project-refactor/1';
  status: 'refactored' | 'unchanged' | 'unsupported' | 'failed';
  validation: 'syntax' | 'not_run' | 'fixed_tests';
  message: string;
  changes: { rule: 'boolean-return' | 'agent-refactor'; line: number; before: string; after: string; file?: string }[];
  files?: { name: string; status: NoahSourceProcessing['status']; message: string }[];
  originalSha256?: string;
  sourceSha256?: string;
  evidence?: { baseline: unknown; candidate: unknown; proposer: unknown; fixedTests: { name: string; sha256: string }[] };
};

// Only syntax-directed, deterministic edits. Never evaluates code, imports a
// submitted dependency, loads tsconfig/plugins, or calls an external model.
export async function refactorNoahSource(name: string, bytes: Uint8Array): Promise<{ bytes: Uint8Array; report: NoahSourceProcessing }> {
  const report: NoahSourceProcessing = { engine: 'noah-syntax-refactor/1', status: 'unsupported', validation: 'not_run', changes: [], message: 'この形式は自動整理の対象外です。原本を保存しました。' };
  if (/\.zip$/i.test(name)) {
    const archiveReport: NoahSourceProcessing = { ...report, engine: 'noah-archive-refactor/1', files: [] };
    try {
      const files = readNoahArchive(bytes);
      const candidates = files.filter(f => /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(f.name));
      if (candidates.length > 32 || candidates.reduce((n, f) => n + f.bytes.length, 0) > 512 * 1024) throw new Error('code limit');
      let checked = 0;
      for (const file of files) {
        if (file.name.endsWith('/')) continue;
        const result = /\.zip$/i.test(file.name) ? { bytes: file.bytes, report } : await refactorNoahSource(file.name, file.bytes);
        archiveReport.files!.push({ name: file.name, status: result.report.status, message: result.report.message });
        if (result.report.status === 'failed') throw new Error('invalid source');
        if (result.report.validation === 'syntax') checked++;
        file.bytes = result.bytes;
        archiveReport.changes.push(...result.report.changes.map(c => ({ ...c, file: file.name })));
      }
      const changed = archiveReport.changes.length > 0;
      return { bytes: changed ? writeNoahArchive(files) : bytes, report: { ...archiveReport, status: changed ? 'refactored' : checked ? 'unchanged' : 'unsupported', validation: checked ? 'syntax' : 'not_run', message: `ZIP内の${checked}ファイルを構文確認しました。${changed ? '対応する条件分岐を整理しました。' : '変更はありません。'}他のファイルの内容は保持しています。型・動作は未検証です。` } };
    } catch {
      return { bytes, report: { ...archiveReport, files: archiveReport.files?.map(f => ({ ...f, status: 'unchanged', message: '全体検査が通らなかったため、変更を採用せず原本を保持しました。' })), status: 'failed', changes: [], validation: 'not_run', message: 'ZIPの形式・展開量、またはコードの構文を確認できません。ZIP全体を変更せず原本のまま保存しました。' } };
    }
  }
  if (!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(name)) return { bytes, report };
  if (bytes.byteLength > NOAH_CODE_LIMIT) return { bytes, report: { ...report, message: '自動整理は64KiBまでです。原本を保存しました。' } };
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { bytes, report: { ...report, status: 'failed', message: 'UTF-8のコードとして読み取れません。原本を保存しました。' } }; }
  const compiler = await import('typescript');
  const filename = '/noah-input/' + name.toLowerCase();
  const parse = (source: string) => compiler.createSourceFile(filename, source, compiler.ScriptTarget.Latest, true);
  const errors = (file: ts.SourceFile) => {
    // getSyntacticDiagnostics also rejects TS-only syntax in .js files. The
    // parser alone accepts those annotations. This host has no filesystem.
    const host: ts.CompilerHost = {
      getSourceFile: n => n === filename ? file : undefined,
      getDefaultLibFileName: () => '', writeFile: () => {},
      getCurrentDirectory: () => '/noah-input', getDirectories: () => [],
      fileExists: n => n === filename, readFile: n => n === filename ? file.text : undefined,
      getCanonicalFileName: n => n, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    };
    return compiler.createProgram([filename], { allowJs: true, noLib: true, noResolve: true, target: compiler.ScriptTarget.Latest, jsx: compiler.JsxEmit.Preserve }, host).getSyntacticDiagnostics(file);
  };
  try {
    const original = parse(text);
    if (errors(original).length) return { bytes, report: { ...report, status: 'failed', message: '構文を確認できません。原本を保存しました。型・動作は未検証です。' } };
    const edits: { start: number; end: number; after: string }[] = [];
    function booleanReturn(statement: ts.Statement | undefined): boolean | undefined {
      if (!statement) return undefined;
      if (compiler.isBlock(statement)) {
        if (statement.statements.length !== 1) return undefined;
        statement = statement.statements[0];
      }
      if (!compiler.isReturnStatement(statement)) return undefined;
      return statement.expression?.kind === compiler.SyntaxKind.TrueKeyword ? true : statement.expression?.kind === compiler.SyntaxKind.FalseKeyword ? false : undefined;
    }
    function visit(node: ts.Node) {
      if (edits.length >= 128) return;
      if (compiler.isIfStatement(node)) {
        const yes = booleanReturn(node.thenStatement), no = booleanReturn(node.elseStatement);
        const before = node.getText(original);
        // Preserve all comments, including licence/directive comments. A false
        // positive inside a string simply leaves that branch unchanged.
        if (yes !== undefined && no !== undefined && yes !== no && !/\/\/|\/\*/.test(before)) {
          const after = `return ${yes ? '!!' : '!'}(${node.expression.getText(original)});`;
          edits.push({ start: node.getStart(original), end: node.end, after });
          report.changes.push({ rule: 'boolean-return', line: original.getLineAndCharacterOfPosition(node.getStart(original)).line + 1, before, after });
          return;
        }
      }
      compiler.forEachChild(node, visit);
    }
    visit(original);
    let result = text;
    for (const edit of [...edits].reverse()) result = result.slice(0, edit.start) + edit.after + result.slice(edit.end);
    if (errors(parse(result)).length) throw new Error('invalid output');
    return { bytes: edits.length ? new TextEncoder().encode(result) : bytes, report: { ...report, status: edits.length ? 'refactored' : 'unchanged', validation: 'syntax', message: edits.length ? '条件分岐を整理し、変更後の構文を確認しました。型・動作は未検証です。' : '適用できる変更はありませんでした。構文確認済み、型・動作は未検証です。' } };
  } catch {
    return { bytes, report: { ...report, status: 'failed', changes: [], message: 'コードの構文処理を完了できません。原本を保存しました。' } };
  }
}
