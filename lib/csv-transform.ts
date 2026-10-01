import { Buffer } from 'node:buffer';
import iconv from 'iconv-lite';

export const CSV_LIMITS = {
  bytes: 10 * 1024 * 1024,
  rows: 50_000,
  columns: 100,
} as const;

export type CsvEncoding = 'utf8' | 'utf8-bom' | 'cp932';
export type CsvSpecification = {
  renames: Record<string, string>;
  order: string[];
  trim: string[];
  dedupe: { keys: string[]; mode: 'report_only' | 'first' | 'last' };
  sort: { column: string; direction: 'asc' | 'desc' }[];
  outputEncoding: CsvEncoding;
  spreadsheetSafe: boolean;
};

export type CsvTable = { headers: string[]; rows: string[][] };
export type CsvValidation = {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
};
export type CsvReport = {
  version: 'csv-cleanup/1';
  input: {
    encoding: CsvEncoding;
    bytes: number;
    rows: number;
    columns: number;
  };
  output: {
    encoding: CsvEncoding;
    bytes: number;
    rows: number;
    columns: number;
  };
  changes: {
    renamed: { from: string; to: string }[];
    reordered: boolean;
    trimmedCells: number;
    duplicateRows: number;
    removedRows: number;
    sortedBy: CsvSpecification['sort'];
  };
  warnings: string[];
  validation: CsvValidation;
};

export class CsvError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const blankSpec: CsvSpecification = {
  renames: {},
  order: [],
  trim: [],
  dedupe: { keys: [], mode: 'report_only' },
  sort: [],
  outputEncoding: 'utf8-bom',
  spreadsheetSafe: false,
};

function text(value: unknown, max = 120) {
  if (typeof value !== 'string' || value.length > max)
    throw new CsvError('SPEC', '指定内容の文字列が不正です。');
  return value;
}

export function csvSpecification(value: unknown): CsvSpecification {
  if (value === undefined || value === null || value === '')
    return structuredClone(blankSpec);
  let input = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value);
    } catch {
      throw new CsvError('SPEC', '指定内容のJSONが不正です。');
    }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new CsvError('SPEC', '指定内容はオブジェクトにしてください。');
  const source = input as Record<string, unknown>;
  const allowed = new Set([
    'renames',
    'order',
    'trim',
    'dedupe',
    'sort',
    'outputEncoding',
    'spreadsheetSafe',
  ]);
  if (Object.keys(source).some((key) => !allowed.has(key)))
    throw new CsvError('SPEC', '未対応の指定が含まれています。');
  const renames: Record<string, string> = {};
  if (source.renames !== undefined) {
    if (
      !source.renames ||
      typeof source.renames !== 'object' ||
      Array.isArray(source.renames)
    )
      throw new CsvError('SPEC', '列名変更の指定が不正です。');
    for (const [from, to] of Object.entries(source.renames))
      renames[text(from)] = text(to);
  }
  const strings = (candidate: unknown, label: string) => {
    if (candidate === undefined) return [];
    if (!Array.isArray(candidate) || candidate.length > CSV_LIMITS.columns)
      throw new CsvError('SPEC', `${label}の指定が不正です。`);
    return candidate.map((item) => text(item));
  };
  const dedupeInput = source.dedupe ?? {};
  if (
    !dedupeInput ||
    typeof dedupeInput !== 'object' ||
    Array.isArray(dedupeInput)
  )
    throw new CsvError('SPEC', '重複処理の指定が不正です。');
  const dedupeObject = dedupeInput as Record<string, unknown>;
  const mode = dedupeObject.mode ?? 'report_only';
  if (
    typeof mode !== 'string' ||
    !['report_only', 'first', 'last'].includes(mode)
  )
    throw new CsvError(
      'SPEC',
      '重複処理は確認のみ・先頭・末尾から選んでください。',
    );
  const sortInput = source.sort ?? [];
  if (!Array.isArray(sortInput) || sortInput.length > 8)
    throw new CsvError('SPEC', '並び替えの指定が不正です。');
  const sort = sortInput.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new CsvError('SPEC', '並び替えの指定が不正です。');
    const row = item as Record<string, unknown>;
    const direction = row.direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc')
      throw new CsvError('SPEC', '並び順は昇順または降順にしてください。');
    return { column: text(row.column), direction: direction as 'asc' | 'desc' };
  });
  const outputEncoding = source.outputEncoding ?? 'utf8-bom';
  if (
    typeof outputEncoding !== 'string' ||
    !['utf8', 'utf8-bom', 'cp932'].includes(outputEncoding)
  )
    throw new CsvError('SPEC', '出力文字コードが不正です。');
  return {
    renames,
    order: strings(source.order, '列順'),
    trim: strings(source.trim, '空白除去'),
    dedupe: {
      keys: strings(dedupeObject.keys, '重複キー'),
      mode: mode as CsvSpecification['dedupe']['mode'],
    },
    sort,
    outputEncoding: outputEncoding as CsvEncoding,
    spreadsheetSafe: source.spreadsheetSafe === true,
  };
}

export function decodeCsv(bytes: Uint8Array): {
  text: string;
  encoding: CsvEncoding;
} {
  if (!bytes.length) throw new CsvError('EMPTY', 'CSVが空です。');
  if (bytes.length > CSV_LIMITS.bytes)
    throw new CsvError('TOO_LARGE', 'CSVは10MB以下にしてください。');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(3)),
      encoding: 'utf8-bom',
    };
  }
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      encoding: 'utf8',
    };
  } catch {
    const decoded = iconv.decode(Buffer.from(bytes), 'cp932');
    if (decoded.includes('\uFFFD'))
      throw new CsvError('ENCODING', 'UTF-8またはCP932として読み取れません。');
    return { text: decoded, encoding: 'cp932' };
  }
}

export function parseCsv(source: string): CsvTable {
  if (source.includes('\0'))
    throw new CsvError('NUL', 'NUL文字を含むCSVは処理できません。');
  const records: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closedQuote = false;
  const pushField = () => {
    row.push(field);
    field = '';
    closedQuote = false;
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else field += char;
      continue;
    }
    if (closedQuote && char !== ',' && char !== '\r' && char !== '\n')
      throw new CsvError('CSV_SYNTAX', '引用符の後に不正な文字があります。');
    if (char === '"') {
      if (field.length)
        throw new CsvError('CSV_SYNTAX', '引用符の位置が不正です。');
      quoted = true;
    } else if (char === ',') pushField();
    else if (char === '\n') pushRow();
    else if (char === '\r') {
      if (source[i + 1] === '\n') i += 1;
      pushRow();
    } else field += char;
  }
  if (quoted) throw new CsvError('CSV_SYNTAX', '引用符が閉じていません。');
  if (field.length || row.length || !records.length) pushRow();
  while (records.length > 1 && records.at(-1)?.every((cell) => cell === ''))
    records.pop();
  const headers = records.shift() ?? [];
  if (!headers.length || headers.some((header) => !header))
    throw new CsvError('HEADER', '空の列名があります。');
  if (new Set(headers).size !== headers.length)
    throw new CsvError('HEADER', '同じ列名が複数あります。');
  if (headers.length > CSV_LIMITS.columns)
    throw new CsvError('TOO_MANY_COLUMNS', '列数は100以下にしてください。');
  if (records.length > CSV_LIMITS.rows)
    throw new CsvError(
      'TOO_MANY_ROWS',
      'データ行は50,000行以下にしてください。',
    );
  records.forEach((record, index) => {
    if (record.length !== headers.length)
      throw new CsvError(
        'ROW_WIDTH',
        `${index + 2}行目の列数が見出しと一致しません。`,
      );
  });
  return { headers, rows: records };
}

const edgeWhitespace = /^[\s\u3000]+|[\s\u3000]+$/gu;
const formulaLike = /^[=+\-@]/;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function plan(table: CsvTable, spec: CsvSpecification) {
  const renamed = table.headers.map((header) => spec.renames[header] ?? header);
  if (
    renamed.some((header) => !header) ||
    new Set(renamed).size !== renamed.length
  )
    throw new CsvError(
      'SPEC_COLUMNS',
      '列名変更後の列名が空または重複しています。',
    );
  for (const from of Object.keys(spec.renames))
    if (!table.headers.includes(from))
      throw new CsvError('SPEC_COLUMNS', `変更元の列「${from}」がありません。`);
  const outputHeaders = spec.order.length ? spec.order : renamed;
  if (
    outputHeaders.length !== renamed.length ||
    new Set(outputHeaders).size !== renamed.length ||
    outputHeaders.some((header) => !renamed.includes(header))
  )
    throw new CsvError(
      'SPEC_COLUMNS',
      '列順には変更後の全列を重複なく指定してください。',
    );
  for (const column of [
    ...spec.trim,
    ...spec.dedupe.keys,
    ...spec.sort.map((item) => item.column),
  ])
    if (!renamed.includes(column))
      throw new CsvError('SPEC_COLUMNS', `指定列「${column}」がありません。`);
  return {
    renamed,
    outputHeaders,
    sourceIndex: new Map(renamed.map((header, index) => [header, index])),
  };
}

function expectedRows(table: CsvTable, spec: CsvSpecification) {
  const { outputHeaders, sourceIndex } = plan(table, spec);
  let trimmedCells = 0;
  let rows = table.rows.map((record, originalIndex) => ({
    originalIndex,
    cells: outputHeaders.map((header) => {
      const raw = record[sourceIndex.get(header)!];
      if (!spec.trim.includes(header)) return raw;
      const clean = raw.replace(edgeWhitespace, '');
      if (clean !== raw) trimmedCells += 1;
      return clean;
    }),
  }));
  const keyIndexes = spec.dedupe.keys.map((key) => outputHeaders.indexOf(key));
  const counts = new Map<string, number>();
  for (const item of rows) {
    const key = JSON.stringify(keyIndexes.map((index) => item.cells[index]));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateRows = [...counts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  if (keyIndexes.length && spec.dedupe.mode !== 'report_only') {
    const chosen = new Map<string, (typeof rows)[number]>();
    for (const item of rows) {
      const key = JSON.stringify(keyIndexes.map((index) => item.cells[index]));
      if (spec.dedupe.mode === 'last' || !chosen.has(key))
        chosen.set(key, item);
    }
    const kept = new Set(
      [...chosen.values()].map((item) => item.originalIndex),
    );
    rows = rows.filter((item) => kept.has(item.originalIndex));
  }
  if (spec.sort.length) {
    const sorting = spec.sort.map((entry) => ({
      index: outputHeaders.indexOf(entry.column),
      direction: entry.direction,
    }));
    rows.sort((a, b) => {
      for (const item of sorting) {
        const value = compare(a.cells[item.index], b.cells[item.index]);
        if (value) return item.direction === 'asc' ? value : -value;
      }
      return a.originalIndex - b.originalIndex;
    });
  }
  return {
    headers: outputHeaders,
    rows: rows.map((item) => item.cells),
    trimmedCells,
    duplicateRows,
  };
}

function csvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
export function serializeCsv(table: CsvTable) {
  return (
    [table.headers, ...table.rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n') + '\r\n'
  );
}

export function encodeCsv(value: string, encoding: CsvEncoding) {
  if (encoding === 'cp932') {
    const bytes = iconv.encode(value, 'cp932');
    if (iconv.decode(bytes, 'cp932') !== value)
      throw new CsvError(
        'CP932_UNREPRESENTABLE',
        'CP932で表現できない文字が含まれています。UTF-8を選んでください。',
      );
    return new Uint8Array(bytes);
  }
  const bytes = new TextEncoder().encode(value);
  if (encoding === 'utf8-bom')
    return Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
  return bytes;
}

export function validateCsvTransformation(
  input: CsvTable,
  output: CsvTable,
  spec: CsvSpecification,
): CsvValidation {
  const expected = expectedRows(input, spec);
  const checks = [
    {
      name: 'header',
      passed:
        JSON.stringify(output.headers) === JSON.stringify(expected.headers),
      detail: `${output.headers.length}列`,
    },
    {
      name: 'row_count',
      passed: output.rows.length === expected.rows.length,
      detail: `${output.rows.length}行`,
    },
    {
      name: 'cell_values',
      passed: JSON.stringify(output.rows) === JSON.stringify(expected.rows),
      detail: '指定外の補完・型変換なし',
    },
    {
      name: 'limits',
      passed:
        output.headers.length <= CSV_LIMITS.columns &&
        output.rows.length <= CSV_LIMITS.rows,
      detail: '列・行上限内',
    },
  ];
  return { passed: checks.every((item) => item.passed), checks };
}

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function transformCsv(bytes: Uint8Array, rawSpec: unknown) {
  const spec = csvSpecification(rawSpec);
  const decoded = decodeCsv(bytes);
  const input = parseCsv(decoded.text);
  const expected = expectedRows(input, spec);
  const outputTable = { headers: expected.headers, rows: expected.rows };
  const output = encodeCsv(serializeCsv(outputTable), spec.outputEncoding);
  const reparsed = parseCsv(decodeCsv(output).text);
  const validation = validateCsvTransformation(input, reparsed, spec);
  if (!validation.passed)
    throw new CsvError('QUALITY', '独立検査に合格しませんでした。');
  const formulaCells = outputTable.rows
    .flat()
    .filter((cell) => formulaLike.test(cell)).length;
  const safeTable = spec.spreadsheetSafe
    ? {
        headers: outputTable.headers,
        rows: outputTable.rows.map((row) =>
          row.map((cell) => (formulaLike.test(cell) ? `'${cell}` : cell)),
        ),
      }
    : null;
  const safeOutput = safeTable
    ? encodeCsv(serializeCsv(safeTable), spec.outputEncoding)
    : null;
  const report: CsvReport = {
    version: 'csv-cleanup/1',
    input: {
      encoding: decoded.encoding,
      bytes: bytes.byteLength,
      rows: input.rows.length,
      columns: input.headers.length,
    },
    output: {
      encoding: spec.outputEncoding,
      bytes: output.byteLength,
      rows: outputTable.rows.length,
      columns: outputTable.headers.length,
    },
    changes: {
      renamed: Object.entries(spec.renames).map(([from, to]) => ({ from, to })),
      reordered: spec.order.length > 0,
      trimmedCells: expected.trimmedCells,
      duplicateRows: expected.duplicateRows,
      removedRows: input.rows.length - outputTable.rows.length,
      sortedBy: spec.sort,
    },
    warnings: formulaCells
      ? [
          `数式として解釈され得る値が${formulaCells}件あります。原本結果は変更していません。`,
        ]
      : [],
    validation,
  };
  return {
    spec,
    input,
    outputTable,
    output,
    safeOutput,
    report,
    inputSha256: await sha256(bytes),
    outputSha256: await sha256(output),
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
}
export function csvReportHtml(report: CsvReport, jobId: string) {
  const rows = [
    [
      '入力',
      `${report.input.rows}行・${report.input.columns}列・${report.input.encoding}`,
    ],
    [
      '出力',
      `${report.output.rows}行・${report.output.columns}列・${report.output.encoding}`,
    ],
    ['前後空白を除去', `${report.changes.trimmedCells}セル`],
    [
      '重複候補',
      `${report.changes.duplicateRows}行（除外 ${report.changes.removedRows}行）`,
    ],
    ['独立検査', report.validation.passed ? '合格' : '不合格'],
  ];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CSV作業報告</title><style>body{font:16px/1.7 system-ui;margin:40px;max-width:760px;color:#202625}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dce2dc;padding:12px;text-align:left}th{width:35%;background:#f3f6f1}code{word-break:break-all}</style></head><body><h1>CSV作業報告</h1><p>受付番号 <code>${escapeHtml(jobId)}</code></p><table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table><h2>注意</h2><ul>${(report.warnings.length ? report.warnings : ['追加の警告はありません。']).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul><p>この報告は入力と指定内容に対する機械検査です。内容の事実性や業務上の妥当性は保証しません。</p></body></html>`;
}
