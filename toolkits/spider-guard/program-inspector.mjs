import { detectSensitiveData } from './detector.mjs';

export const MAX_PROGRAM_BYTES = 65_536;
export const MAX_PROGRAM_LINES = 2_000;
export const MAX_PROGRAM_FINDINGS = 100;

export class ProgramInspectionError extends Error {
  constructor(code = 'CODE_INSPECTION_INVALID_INPUT') {
    const allowed = ['CODE_INSPECTION_INVALID_INPUT', 'CODE_INSPECTION_TOO_LARGE', 'CODE_INSPECTION_UNSUPPORTED_LANGUAGE'];
    const safeCode = allowed.includes(code) ? code : allowed[0];
    super(safeCode);
    this.name = 'ProgramInspectionError';
    this.code = safeCode;
  }
}

const BASE_LIMITATIONS = [
  '入力を実行せず、対応する静的パターンだけを検査します。候補は脆弱性の証明ではありません。',
  '検出なしは安全の保証ではありません。別名・動的な組み立て・データの流れ・依存パッケージは完全には解析しません。',
];
const RULES = {
  dynamic_eval: {
    severity: 'high', title: '動的なコード実行の可能性',
    why: '文字列をコードとして扱う呼び出しがあります。外部入力が渡ると、意図しない処理を実行する可能性があります。',
    remediation: '文字列の評価を避け、許可した操作と通常の関数呼び出しに置き換えてください。',
  },
  shell_execution: {
    severity: 'high', title: 'シェルを介した実行の可能性',
    why: 'シェルを介する実行パターンがあります。入力の連結方法によっては、意図しないコマンドが実行される可能性があります。',
    remediation: 'シェルを使わない引数配列のAPIを選び、実行するプログラムと引数を明示的に制限してください。',
  },
  unsafe_html: {
    severity: 'high', title: 'HTMLとしての挿入を要確認',
    why: 'HTMLを解釈する代入があります。信頼できない入力が混ざると、スクリプトが動作する可能性があります。',
    remediation: '文字表示にはtextContentを使ってください。HTMLが必要な場合は、信頼境界と適切なサニタイズ処理を確認してください。',
  },
  tls_verification_disabled: {
    severity: 'high', title: 'TLSの証明書検証を無効にする設定',
    why: '証明書検証を無効にするパターンがあります。接続先の正当性を確認できなくなる可能性があります。',
    remediation: '証明書検証を有効にし、必要な認証局証明書を明示的に設定してください。',
  },
};

// Keep UTF-16 offsets/newlines unchanged, matching the shared detector.
function maskNonCode(source, language) {
  const output = source.split('');
  let incomplete = false, interpolation = false;
  const blank = (start, end) => {
    for (let index = start; index < end; index++)
      if (source[index] !== '\n' && source[index] !== '\r') output[Number(index)] = ' ';
  };
  for (let index = 0; index < source.length;) {
    const start = index, char = source[index];
    if ((language === 'python' && char === '#') || (language === 'javascript' && source.startsWith('//', index))) {
      while (index < source.length && !/[\r\n]/.test(source[index])) index++;
      blank(start, index); continue;
    }
    if (language === 'javascript' && source.startsWith('/*', index)) {
      const close = source.indexOf('*/', index + 2);
      incomplete ||= close < 0;
      index = close < 0 ? source.length : close + 2;
      blank(start, index); continue;
    }
    if (char === '"' || char === "'" || (language === 'javascript' && char === '`')) {
      const triple = language === 'python' && source.startsWith(char.repeat(3), index);
      const delimiter = triple ? char.repeat(3) : char;
      const formattedPython = language === 'python' && /(?:^|[^\w])(?:[rub]*f[rub]*)$/i.test(source.slice(Math.max(0, index - 5), index));
      index += delimiter.length;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\') { index += Math.min(2, source.length - index); continue; }
        if (source.startsWith(delimiter, index)) { index += delimiter.length; closed = true; break; }
        if ((char === '`' && source.startsWith('${', index)) || (formattedPython && source[index] === '{')) interpolation = true;
        if (!triple && char !== '`' && /[\r\n]/.test(source[index])) break;
        index++;
      }
      incomplete ||= !closed;
      blank(start, index); continue;
    }
    // Recognize common JavaScript regex-literal positions; avoid treating its
    // source as executable calls. This lexer is deliberately not a full parser.
    if (language === 'javascript' && char === '/') {
      let previous = index - 1;
      while (previous >= 0 && /\s/.test(source[previous])) previous--;
      const prefix = source.slice(Math.max(0, previous - 14), previous + 1);
      if (!prefix || /[=(:,\[!&|?;{}]$/.test(prefix) || /\b(?:return|throw|case|yield)$/.test(prefix)) {
        index++;
        let characterClass = false, closed = false;
        while (index < source.length && !/[\r\n]/.test(source[index])) {
          if (source[index] === '\\') { index += Math.min(2, source.length - index); continue; }
          if (source[index] === '[') characterClass = true;
          if (source[index] === ']') characterClass = false;
          if (source[index] === '/' && !characterClass) { index++; closed = true; break; }
          index++;
        }
        while (closed && /[A-Za-z]/.test(source[index] || '')) index++;
        incomplete ||= !closed;
        blank(start, index); continue;
      }
    }
    index++;
  }
  return { code: output.join(''), incomplete, interpolation };
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r') {
      if (source[index + 1] === '\n') index++;
      starts.push(index + 1);
    } else if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function sourceLine(starts, offset) {
  let low = 0, high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= offset) low = middle; else high = middle;
  }
  return low + 1;
}

function callEnds(code) {
  const stack = [], ends = new Map();
  for (let index = 0; index < code.length; index++) {
    if (code[index] === '(') stack.push(index);
    else if (code[index] === ')' && stack.length) ends.set(stack.pop(), index + 1);
  }
  return ends;
}

/** Inspect source as data only: no evaluation, network, storage, or mutation. */
export function inspectProgram(source, options = {}) {
  if (typeof source !== 'string' || !options || typeof options !== 'object' || Array.isArray(options))
    throw new ProgramInspectionError();
  const descriptor = Object.getOwnPropertyDescriptor(options, 'language');
  if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new ProgramInspectionError();
  const language = descriptor?.value ?? 'javascript';
  if (!['javascript', 'python', 'text'].includes(language))
    throw new ProgramInspectionError('CODE_INSPECTION_UNSUPPORTED_LANGUAGE');
  if (source.length > MAX_PROGRAM_BYTES || new TextEncoder().encode(source).byteLength > MAX_PROGRAM_BYTES)
    throw new ProgramInspectionError('CODE_INSPECTION_TOO_LARGE');
  const starts = lineStarts(source);
  if (starts.length > MAX_PROGRAM_LINES) throw new ProgramInspectionError('CODE_INSPECTION_TOO_LARGE');
  const limitations = [...BASE_LIMITATIONS];
  if (language === 'text') limitations.push('テキストでは秘密情報・個人情報の候補だけを検査し、コードの動作は解析しません。');
  else limitations.push('構文・型の完全な検証は行いません。対象は明示した4種類の静的パターンです。');
  let coverageLimited = false;
  const candidates = [];
  const add = (start, end, rule, kind, metadata) => candidates.push({
    rule, kind, ...metadata, line: sourceLine(starts, start), endLine: sourceLine(starts, Math.max(start, end - 1)),
  });
  try {
    for (const finding of detectSensitiveData(source)) {
      // This is a reference to managed credentials, not an embedded value.
      // Do not exempt a quoted string that merely contains the same spelling.
      if (finding.kind === 'secret' && /[:=]\s*$/.test(source.slice(Math.max(0, finding.start - 200), finding.start)) &&
          /^os\.(?:getenv|environ\.get)\s*\(/.test(source.slice(finding.start))) continue;
      add(finding.start, finding.end, `sensitive.${finding.kind}`, finding.kind, {
      severity: finding.severity, title: `${finding.label}の候補`,
      why: finding.kind === 'secret' ? '秘密情報に似た値が入力に含まれています。共有や送信の前に確認が必要です。' : '個人情報に似た値が入力に含まれています。利用目的と共有範囲の確認が必要です。',
      remediation: finding.kind === 'secret' ? '値の直接記載を避け、環境変数などの管理方法を使用してください。漏えい済みなら発行元で失効・再発行してください。' : '不要な個人情報を削除または伏せ、必要な範囲だけを扱ってください。',
      });
    }
  } catch (_) {
    coverageLimited = true;
    limitations.push('機密情報の検査を完了できませんでした。入力を小さく分けて再確認してください。');
  }
  if (language !== 'text') {
    const masked = maskNonCode(source, language), code = masked.code, ends = callEnds(code);
    if (masked.incomplete || masked.interpolation) {
      coverageLimited = true;
      limitations.push(masked.incomplete ? '閉じていない文字列・コメント等があり、コード検査は不完全です。' : '埋め込み式を含む文字列の内部は解析していません。');
    }
    const scan = (expression, rule, condition = () => true) => {
      for (const match of code.matchAll(expression)) {
        const open = match.index + match[0].indexOf('(');
        const end = match[0].includes('(') ? ends.get(open) ?? open + 1 : match.index + match[0].length;
        if (condition(code.slice(match.index, end))) add(match.index, end, rule, 'code', RULES[rule]);
      }
    };
    if (language === 'javascript') {
      scan(/(?<![\w$\p{L}\p{N}.])(?:eval|Function)\s*\(/gu, 'dynamic_eval');
      scan(/(?<![\w$\p{L}\p{N}.])(?:child_process|childProcess)\s*\.\s*(?:exec|execSync)\s*\(/gu, 'shell_execution');
      scan(/\.\s*(?:innerHTML|outerHTML)\s*=(?!=)/g, 'unsafe_html');
      scan(/(?<![\w$\p{L}\p{N}])rejectUnauthorized\s*:\s*false\b/gu, 'tls_verification_disabled');
    } else {
      scan(/(?<![\w\p{L}\p{N}.])(?:eval|exec)\s*\(/gu, 'dynamic_eval');
      scan(/(?<![\w\p{L}\p{N}.])os\s*\.\s*(?:system|popen)\s*\(/gu, 'shell_execution');
      scan(/(?<![\w\p{L}\p{N}.])subprocess\s*\.\s*(?:run|call|Popen|check_call|check_output)\s*\(/gu, 'shell_execution', call => /\bshell\s*=\s*True\b/.test(call));
      scan(/(?<![\w\p{L}\p{N}.])requests\s*\.\s*(?:get|post|put|patch|delete|head|options|request)\s*\(/gu, 'tls_verification_disabled', call => /\bverify\s*=\s*False\b/.test(call));
      scan(/(?<![\w\p{L}\p{N}.])ssl\s*\.\s*_create_unverified_context\s*\(/gu, 'tls_verification_disabled');
    }
  }
  const priority = { secret: 0, personal: 1, code: 2 };
  candidates.sort((a, b) => priority[a.kind] - priority[b.kind] || a.line - b.line || a.endLine - b.endLine || a.rule.localeCompare(b.rule));
  if (candidates.length > MAX_PROGRAM_FINDINGS) {
    coverageLimited = true;
    limitations.push('候補が上限を超えたため、秘密情報・個人情報・コードの順に優先して100件だけを表示しています。');
  }
  const findings = candidates.slice(0, MAX_PROGRAM_FINDINGS).map((finding, index) => ({ id: `${finding.rule}:${finding.line}:${index}`, ...finding }));
  const counts = { secret: 0, personal: 0, code: 0, total: findings.length };
  for (const finding of findings) counts[finding.kind]++;
  const state = findings.length ? 'needs_review' : coverageLimited ? 'incomplete' : source.trim() ? 'no_findings' : 'empty';
  return { schemaVersion: 1, language, findings, counts, coverageLimited, state, limitations };
}
