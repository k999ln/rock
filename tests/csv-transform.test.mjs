import test from 'node:test';
import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import {
  CsvError,
  csvReportHtml,
  csvSpecification,
  decodeCsv,
  parseCsv,
  transformCsv,
} from '../lib/csv-transform.ts';

const bytes = (value) => new TextEncoder().encode(value);

await test('quoted newlines, leading zeroes and long numbers survive the requested deterministic pipeline', async () => {
  const source =
    'customer_id,name,note,long\r\n001, 佐藤 ,"改行\nあり",12345678901234567890\r\n001,後勝ち,重複,00001\r\n002, 鈴木 ,=1+1,999\r\n';
  const result = await transformCsv(bytes(source), {
    renames: { customer_id: '顧客ID', name: '氏名' },
    order: ['顧客ID', '氏名', 'note', 'long'],
    trim: ['氏名'],
    dedupe: { keys: ['顧客ID'], mode: 'first' },
    sort: [{ column: '顧客ID', direction: 'desc' }],
    outputEncoding: 'utf8-bom',
    spreadsheetSafe: true,
  });
  assert.deepEqual(result.outputTable, {
    headers: ['顧客ID', '氏名', 'note', 'long'],
    rows: [
      ['002', '鈴木', '=1+1', '999'],
      ['001', '佐藤', '改行\nあり', '12345678901234567890'],
    ],
  });
  assert.equal(result.report.changes.duplicateRows, 1);
  assert.equal(result.report.changes.removedRows, 1);
  assert.equal(result.report.validation.passed, true);
  assert.match(decodeCsv(result.safeOutput).text, /'=1\+1/);
  assert.equal(result.output[0], 0xef);
});

await test('report-only keeps duplicate rows and last-mode keeps the last input occurrence', async () => {
  const source = bytes('id,value\n01,a\n01,b\n');
  const reportOnly = await transformCsv(source, {
    dedupe: { keys: ['id'], mode: 'report_only' },
    outputEncoding: 'utf8',
  });
  assert.equal(reportOnly.outputTable.rows.length, 2);
  assert.equal(reportOnly.report.changes.duplicateRows, 1);
  const last = await transformCsv(source, {
    dedupe: { keys: ['id'], mode: 'last' },
    outputEncoding: 'utf8',
  });
  assert.deepEqual(last.outputTable.rows, [['01', 'b']]);
});

await test('unknown nested transformation options fail closed instead of silently losing instructions', async () => {
  for (const spec of [
    { dedupe: { keys: ['id'], mode: 'first', keep: 'last' } },
    { sort: [{ column: 'id', direction: 'asc', numeric: true }] },
  ]) {
    for (const rawSpec of [spec, JSON.stringify(spec)]) {
      await assert.rejects(
        () => transformCsv(bytes('id,value\n01,a\n01,b\n'), rawSpec),
        (error) => error instanceof CsvError && error.code === 'SPEC',
      );
    }
  }
});

await test('spreadsheetSafe accepts only a boolean and preserves the requested separate safe output', async () => {
  const source = bytes('id,value\n01,=1+1\n');
  for (const spreadsheetSafe of ['true', 'false', 1, 0, null, {}, []]) {
    await assert.rejects(
      () => transformCsv(source, { spreadsheetSafe }),
      (error) => error instanceof CsvError && error.code === 'SPEC',
    );
  }
  for (const spec of [{}, { spreadsheetSafe: false }]) {
    const result = await transformCsv(source, spec);
    assert.equal(result.safeOutput, null);
    assert.deepEqual(result.outputTable.rows, [['01', '=1+1']]);
  }
  const safe = await transformCsv(source, {
    spreadsheetSafe: true,
    outputEncoding: 'utf8',
  });
  assert.equal(decodeCsv(safe.output).text, 'id,value\r\n01,=1+1\r\n');
  assert.equal(decodeCsv(safe.safeOutput).text, "id,value\r\n01,'=1+1\r\n");
});

await test('unselected duplicate keys neither count nor remove rows in any duplicate mode', async () => {
  const source = bytes('id,value\n01,a\n01,a\n02,b\n');
  const specs = [
    {},
    ...['report_only', 'first', 'last'].map((mode) => ({
      dedupe: { keys: [], mode },
    })),
  ];
  for (const spec of specs) {
    const result = await transformCsv(source, spec);
    assert.equal(result.report.changes.duplicateRows, 0);
    assert.equal(result.report.changes.removedRows, 0);
    assert.deepEqual(result.outputTable.rows, [
      ['01', 'a'],
      ['01', 'a'],
      ['02', 'b'],
    ]);
    assert.equal(result.report.validation.passed, true);
  }
});

await test('sorting follows Unicode code points, preserves prefixes and stable equal keys', async () => {
  const source = bytes(
    'id,value\n1,\u{10000}\n2,\uE000\n3,\u{1F600}\n4,\uFFFF\n5,aa\n6,a\n7,\u{10000}\n8,\n',
  );
  for (const [direction, expectedIds] of [
    ['asc', ['8', '6', '5', '2', '4', '1', '7', '3']],
    ['desc', ['3', '1', '7', '4', '2', '5', '6', '8']],
  ]) {
    const result = await transformCsv(source, {
      sort: [{ column: 'value', direction }],
      outputEncoding: 'utf8',
    });
    assert.deepEqual(
      result.outputTable.rows.map((row) => row[0]),
      expectedIds,
    );
    assert.equal(result.report.validation.passed, true);
  }
  const secondary = await transformCsv(source, {
    sort: [
      { column: 'value', direction: 'asc' },
      { column: 'id', direction: 'desc' },
    ],
  });
  assert.deepEqual(
    secondary.outputTable.rows.map((row) => row[0]),
    ['8', '6', '5', '2', '4', '7', '1', '3'],
  );
});

await test('CP932 is detected, transformed and emitted without mojibake', async () => {
  const input = new Uint8Array(
    iconv.encode('番号,名前\r\n001,髙橋\r\n', 'cp932'),
  );
  const result = await transformCsv(input, { outputEncoding: 'cp932' });
  assert.equal(result.report.input.encoding, 'cp932');
  assert.equal(decodeCsv(result.output).text, '番号,名前\r\n001,髙橋\r\n');
});

await test('CP932 output rejects characters that cannot round-trip', async () => {
  await assert.rejects(
    () => transformCsv(bytes('id,note\n1,😀\n'), { outputEncoding: 'cp932' }),
    (error) =>
      error instanceof CsvError && error.code === 'CP932_UNREPRESENTABLE',
  );
});

await test('malformed width, quotes, duplicate headers and unknown columns fail closed', async () => {
  for (const [source, code] of [
    ['a,b\n1\n', 'ROW_WIDTH'],
    ['a,b\n"open,1\n', 'CSV_SYNTAX'],
    ['a,a\n1,2\n', 'HEADER'],
  ])
    assert.throws(
      () => parseCsv(source),
      (error) => error instanceof CsvError && error.code === code,
    );
  await assert.rejects(
    () => transformCsv(bytes('a,b\n1,2\n'), { trim: ['missing'] }),
    (error) => error instanceof CsvError && error.code === 'SPEC_COLUMNS',
  );
  assert.throws(
    () => csvSpecification('{not-json'),
    (error) => error instanceof CsvError && error.code === 'SPEC',
  );
});

await test('HTML report escapes job identifiers and never embeds executable script', async () => {
  const result = await transformCsv(bytes('id,value\n1,ok\n'), {});
  const html = csvReportHtml(result.report, '<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
