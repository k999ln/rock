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
  if (Object.keys(dedupeObject).some((key) => !['keys', 'mode'].includes(key)))
    throw new CsvError('SPEC', '重複処理に未対応の指定が含まれています。');
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
    if (Object.keys(row).some((key) => !['column', 'direction'].includes(key)))
      throw new CsvError('SPEC', '並び替えに未対応の指定が含まれています。');
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
  if (
    source.spreadsheetSafe !== undefined &&
    typeof source.spreadsheetSafe !== 'boolean'
  )
    throw new CsvError(
      'SPEC',
      '表計算向け安全版はtrueまたはfalseで指定してください。',
    );
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

function compare(a: string, b: string) {
  let aIndex = 0;
  let bIndex = 0;
  while (aIndex < a.length && bIndex < b.length) {
    const aPoint = a.codePointAt(aIndex)!;
    const bPoint = b.codePointAt(bIndex)!;
    if (aPoint !== bPoint) return aPoint < bPoint ? -1 : 1;
    aIndex += aPoint > 0xffff ? 2 : 1;
    bIndex += bPoint > 0xffff ? 2 : 1;
  }
  return aIndex < a.length ? 1 : bIndex < b.length ? -1 : 0;
}

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

export function expectedRows(table: CsvTable, spec: CsvSpecification) {
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
  if (keyIndexes.length) {
    for (const item of rows) {
      const key = JSON.stringify(keyIndexes.map((index) => item.cells[index]));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
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
