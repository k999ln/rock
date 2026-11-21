// Local-only CSV minimizer. Explicit column mapping; never uploads the raw file.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const IMPORT_COLUMNS = {
  import_conversions: {
    id: 'string',
    offerId: 'string',
    uix: 'nullable',
    occurredOn: 'date',
    status: 'string',
    rewardYen: 'money',
    decisionOn: 'nullableDate',
    reason: 'nullable',
    observedOn: 'date',
  },
  import_payouts: {
    id: 'string',
    conversionIds: 'ids',
    adjustmentsYen: 'signed',
    adjustmentReason: 'nullable',
    amountYen: 'money',
    paidOn: 'date',
  },
  import_deposits: {
    id: 'string',
    payoutId: 'string',
    amountYen: 'money',
    receivedOn: 'date',
  },
  import_costs: {
    id: 'string',
    campaign: 'string',
    category: 'string',
    amountYen: 'money',
    incurredOn: 'date',
  },
};
const ensure = (ok, message) => {
  if (!ok) throw new Error(message);
};
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"') {
      ensure(!field && !closed, 'CSVの引用符を確認してください。');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      }
    } else {
      ensure(!closed, '閉じた引用符の後に文字があります。');
      field += c;
    }
  }
  ensure(!quoted, 'CSVの引用符が閉じていません。');
  if (field || row.length || closed) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
export function normalizeBusinessCSV(bytes, mapping) {
  ensure(bytes.length <= 5000000, '元ファイルは5MB以内にしてください。');
  ensure(
    mapping &&
      Object.keys(mapping).every((k) =>
        ['action', 'encoding', 'fields'].includes(k),
      ) &&
      Object.hasOwn(IMPORT_COLUMNS, mapping.action),
    '取込種類を指定してください。',
  );
  ensure(
    ['utf-8', 'shift_jis'].includes(mapping.encoding),
    '文字コードを明示してください。',
  );
  const fields = IMPORT_COLUMNS[mapping.action],
    rules = mapping.fields;
  ensure(
    rules &&
      Object.keys(rules).length === Object.keys(fields).length &&
      Object.keys(fields).every((k) => Object.hasOwn(rules, k)),
    '全ての必要列の対応を明示してください。',
  );
  const table = parseCSV(
    new TextDecoder(mapping.encoding, { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, ''),
  );
  ensure(
    table.length >= 2 && table.length <= 101,
    '1〜100件のCSVに分けてください。',
  );
  const [header, ...data] = table;
  ensure(
    header.every(Boolean) && new Set(header).size === header.length,
    '見出しの空欄・重複を修正してください。',
  );
  const digest = createHash('sha256').update(bytes).digest('hex');
  const rows = data.map((row, index) => {
    ensure(
      row.length === header.length,
      `CSV ${index + 2}行目の列数が違います。`,
    );
    const out = {};
    for (const [key, type] of Object.entries(fields)) {
      const rule = rules[key];
      ensure(
        rule &&
          Object.keys(rule).every((k) =>
            ['column', 'constant', 'values', 'separator'].includes(k),
          ) &&
          Object.hasOwn(rule, 'column') !== Object.hasOwn(rule, 'constant'),
        '列指定か固定値のどちらかを指定してください。',
      );
      if (Object.hasOwn(rule, 'column'))
        ensure(
          typeof rule.column === 'string' && header.includes(rule.column),
          '指定された見出しがありません。',
        );
      let value = Object.hasOwn(rule, 'column')
        ? row[header.indexOf(rule.column)]
        : rule.constant;
      if (rule.values) {
        ensure(
          typeof rule.values === 'object' &&
            Object.hasOwn(rule.values, String(value)),
          '対応表にない値があります。',
        );
        value = rule.values[String(value)];
      }
      if (type === 'nullable' || type === 'nullableDate') {
        if (value === null || value === '') {
          out[key] = null;
          continue;
        }
      }
      if (type === 'ids') {
        ensure(
          typeof value === 'string' &&
            typeof rule.separator === 'string' &&
            rule.separator.length === 1,
          '成果IDの区切り文字を明示してください。',
        );
        value = value.split(rule.separator).map((x) => x.trim());
        ensure(
          value.length &&
            value.every((x) => /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,99}$/.test(x)),
          '成果IDを確認してください。',
        );
      } else if (['money', 'signed'].includes(type)) {
        ensure(
          typeof value === 'number' || typeof value === 'string',
          '金額を確認してください。',
        );
        const str = String(value);
        ensure(
          /^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(str),
          '金額は整数の円で指定してください。',
        );
        value = Number(str.replaceAll(',', ''));
        ensure(
          Number.isSafeInteger(value) &&
            Math.abs(value) <= 100000000 &&
            (type === 'signed' || value >= 0),
          '金額が範囲外です。',
        );
      } else if (type === 'date' || type === 'nullableDate') {
        ensure(
          typeof value === 'string' && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(value),
          '日付はYYYY-MM-DDまたはYYYY/MM/DDで指定してください。',
        );
        value = value.replaceAll('/', '-');
        ensure(
          Number.isFinite(Date.parse(value)) &&
            new Date(value).toISOString().slice(0, 10) === value,
          '存在しない日付です。',
        );
      } else
        ensure(
          typeof value === 'string' && value.length <= 1000,
          '文字列の値を確認してください。',
        );
      out[key] = value;
    }
    out.sourceRef = `sha256:${digest}:row:${index + 2}`;
    return out;
  });
  return { action: mapping.action, rows };
}
async function main() {
  const [input, map, output, ...extra] = process.argv.slice(2);
  ensure(
    input && map && output && !extra.length,
    'Usage: node business-import.mjs input.csv mapping.json output.json',
  );
  const result = normalizeBusinessCSV(
    await readFile(input),
    JSON.parse(await readFile(map, 'utf8')),
  );
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  console.log(
    `${result.rows.length}行の必要列を保存しました。元資料と照合してから運営画面で取り込んでください。`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
