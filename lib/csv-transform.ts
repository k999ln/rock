import { Buffer } from 'node:buffer';
import iconv from 'iconv-lite';

import {
  CSV_LIMITS, CsvError, csvSpecification, parseCsv, serializeCsv, expectedRows, validateCsvTransformation,
  type CsvEncoding, type CsvReport
} from './csv-table.ts';
export { CSV_LIMITS, CsvError, csvSpecification, parseCsv, serializeCsv, validateCsvTransformation } from './csv-table.ts';
export type { CsvEncoding, CsvSpecification, CsvTable, CsvValidation, CsvReport } from './csv-table.ts';

const formulaLike = /^[=+\-@]/;

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
