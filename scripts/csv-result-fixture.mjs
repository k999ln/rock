// Local synthetic delivery using the production transform and literal golden bytes.
// This is development evidence, not an authenticated job or production inspection API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvReportHtml, transformCsv } from '../lib/csv-transform.ts';

const destination = process.argv[2];
if (!destination || process.argv.length !== 3)
  throw new Error('Usage: node --experimental-strip-types scripts/csv-result-fixture.mjs <new-output-directory>');

const input = Buffer.from([
  'customer_id,name,reference,note',
  '002,　佐藤　,900719925474099312345,=1+1',
  '001, 山田 ,000012340000000000001,"一行目\n二行目"',
  '002,差し替え候補,999,重複行',
].join('\r\n') + '\r\n');
const spec = {
  renames: { customer_id: '顧客番号', name: '氏名', reference: '参照番号', note: '備考' },
  order: ['顧客番号', '氏名', '参照番号', '備考'],
  trim: ['氏名'],
  dedupe: { keys: ['顧客番号'], mode: 'first' },
  sort: [{ column: '顧客番号', direction: 'asc' }],
  outputEncoding: 'utf8',
  spreadsheetSafe: true,
};
// These expectations do not call the production serializer, parser or expectedRows.
const golden = Buffer.from('顧客番号,氏名,参照番号,備考\r\n001,山田,000012340000000000001,"一行目\n二行目"\r\n002,佐藤,900719925474099312345,=1+1\r\n');
const goldenSafe = Buffer.from('顧客番号,氏名,参照番号,備考\r\n001,山田,000012340000000000001,"一行目\n二行目"\r\n002,佐藤,900719925474099312345,\'=1+1\r\n');
const result = await transformCsv(input, spec);
assert.deepEqual(Buffer.from(result.output), golden);
assert.deepEqual(Buffer.from(result.safeOutput), goldenSafe);
assert.deepEqual(result.report.input, { encoding: 'utf8', bytes: input.length, rows: 3, columns: 4 });
assert.deepEqual(result.report.output, { encoding: 'utf8', bytes: golden.length, rows: 2, columns: 4 });
assert.deepEqual(result.report.changes, {
  renamed: Object.entries(spec.renames).map(([from, to]) => ({ from, to })),
  reordered: true, trimmedCells: 2, duplicateRows: 1, removedRows: 1, sortedBy: spec.sort,
});
assert.deepEqual(result.report.warnings, ['数式として解釈され得る値が1件あります。原本結果は変更していません。']);
assert.equal(result.report.validation.passed, true);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(result.inputSha256, sha256(input));
assert.equal(result.outputSha256, sha256(golden));
const files = {
  'input.csv': input,
  'spec.json': JSON.stringify(spec, null, 2) + '\n',
  'result.csv': result.output,
  'spreadsheet-safe.csv': result.safeOutput,
  'report.json': JSON.stringify(result.report, null, 2) + '\n',
  'report.html': csvReportHtml(result.report, 'local-synthetic-csv-delivery'),
};
const inspection = {
  kind: 'development-fixture-inspection',
  passed: true,
  data: 'synthetic; no customer data or external services',
  method: 'literal UTF-8 golden bytes and explicit report assertions independent of production expectedRows',
  sourceSha256: sha256(await readFile(new URL('../lib/csv-transform.ts', import.meta.url))),
  generatorSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  artifacts: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) }])),
  remaining: ['product validator shares expectedRows', 'no versioned job-bound inspection API', 'no authenticated storage, real provider or customer acceptance'],
};
await mkdir(destination, { recursive: false });
for (const [name, bytes] of Object.entries(files))
  await writeFile(path.join(destination, name), bytes, { flag: 'wx' });
await writeFile(path.join(destination, 'inspection.json'), JSON.stringify(inspection, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ output: path.resolve(destination), passed: true, files: [...Object.keys(files), 'inspection.json'] }) + '\n');
