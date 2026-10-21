import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as boundedStream from '../lib/bounded-stream.ts';
import * as workflow from '../lib/workflow.ts';
import * as team from '../lib/coconala-team.ts';
import * as operations from '../lib/operations.ts';
import * as materialStudy from '../lib/material-study.ts';

const cases = [
  { path: 'app/api/work-jobs/route.ts', name: 'body', limit: 12_000 },
  { path: 'app/api/amc/route.ts', name: 'body', limit: 2_000_000, strict: true },
  { path: 'app/api/material-invention/route.ts', name: 'body', limit: materialStudy.MATERIAL_STUDY_MAX_BYTES, strict: true },
  { path: 'app/api/coconala-team/route.ts', name: 'body', limit: 16_000, contentType: true },
  { path: 'app/api/sky/a2a-delegations/route.ts', name: 'body', limit: 12_000, objectOnly: true },
  { path: 'app/api/sky/a2a-delegations/[id]/route.ts', name: 'readBody', limit: 12_000, objectOnly: true },
  { path: 'app/api/sky/a2a-delegations/[id]/broker-authorization/route.ts', name: 'readBody', limit: 12_000, objectOnly: true },
  { path: 'lib/operations-api.ts', name: 'body', limit: 4096, contentType: true, strict: true, release: true },
];

// Exercise each real parser independently of its route's database/auth services.
// Only imports used while parsing are supplied; the handlers are not invoked.
function parser(entry) {
  const source = readFileSync(new URL(`../${entry.path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const modules = {
    '@/lib/bounded-stream': boundedStream, './bounded-stream.ts': boundedStream,
    '@/lib/workflow': workflow, '@/lib/coconala-team': team,
    './operations': operations, '@/lib/material-study': materialStudy,
  };
  const exports = {};
  runInNewContext(`${compiled}\nexports.parseBody = ${entry.name};`, {
    exports, Error, SyntaxError, Response, TextDecoder, TextEncoder, Uint8Array,
    require: (name) => modules[name] ?? {},
  });
  return exports.parseBody;
}

function request(bytes, contentType = 'application/json') {
  let offset = 0, cancelled = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) return controller.close();
      // Split non-ASCII sequences too; parsing must decode the joined bytes.
      const end = Math.min(bytes.length, offset + (offset < 16 ? 1 : 8191));
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
    },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  return {
    body, headers: new Headers(contentType ? { 'content-type': contentType } : {}),
    cancelled: () => cancelled,
  };
}

for (const entry of cases) void test(`${entry.path}: preserves byte limit, decoding and parser policy`, async () => {
  const parse = parser(entry), encode = (text) => new TextEncoder().encode(text);
  const multibyte = request(encode('{"x":"あ😀"}'));
  assert.equal((await parse(multibyte)).x, 'あ😀');
  assert.equal(multibyte.body.locked, !entry.release, 'reader release remains the caller policy');
  const exact = request(encode(JSON.stringify({ x: 'x'.repeat(entry.limit - 8) })));
  assert.equal((await parse(exact)).x.length, entry.limit - 8);
  assert.equal(exact.cancelled(), 0);
  const excess = request(encode(JSON.stringify({ x: 'x'.repeat(entry.limit - 7) })));
  await assert.rejects(parse(excess), (error) => entry.objectOnly
    ? error.message === 'BODY_TOO_LARGE' : error.status === 413);
  assert.equal(excess.cancelled(), 1);
  const invalidUtf8 = request(new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]));
  if (entry.strict) await assert.rejects(parse(invalidUtf8), { status: 400 });
  else assert.equal((await parse(invalidUtf8)).x, '\ufffd');
  const wrongType = request(encode('{"x":1}'), 'text/plain');
  if (entry.contentType) {
    await assert.rejects(parse(wrongType), { status: 415 });
    assert.equal(wrongType.body.locked, false, 'Content-Type is checked before acquiring a reader');
  } else assert.equal((await parse(wrongType)).x, 1);
  const array = request(encode('[]'));
  if (entry.objectOnly) await assert.rejects(parse(array), { message: 'INVALID_BODY' });
  else assert.equal(Array.isArray(await parse(array)), true);
  await assert.rejects(parse({ body: null, headers: new Headers({ 'content-type': 'application/json' }) }),
    entry.objectOnly ? { message: 'INVALID_BODY' } : { status: 400 });
});

void test('bounded reader stops at overflow and preserves cancellation/read failures', async () => {
  const tooLarge = new Error('overflow');
  let reads = 0, cancellations = 0;
  const reader = {
    async read() { reads++; return { done: false, value: new Uint8Array(3) }; },
    async cancel() { cancellations++; },
  };
  await assert.rejects(boundedStream.readBoundedStream(reader, 2, () => tooLarge), (error) => error === tooLarge);
  assert.equal(reads, 1); assert.equal(cancellations, 1);
  const cancelled = new Error('cancel failed');
  await assert.rejects(boundedStream.readBoundedStream({ ...reader, async cancel() { throw cancelled; } }, 2,
    () => { assert.fail('overflow error is not substituted for cancellation failure'); }), (error) => error === cancelled);
  const readFailure = new Error('read failed');
  await assert.rejects(boundedStream.readBoundedStream({ async read() { throw readFailure; }, async cancel() { assert.fail(); } }, 2,
    () => tooLarge), (error) => error === readFailure);
});
