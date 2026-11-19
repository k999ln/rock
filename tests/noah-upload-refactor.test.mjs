import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { refactorNoahSource } from '../lib/noah-upload-refactor.ts';

const encode = x => new TextEncoder().encode(x);
const decode = x => new TextDecoder().decode(x);
void test('boolean return rewrite preserves output and one evaluation for truthy/falsy values, both directions and shadowed Boolean', async () => {
  for (const branches of ['if (read()) { return true; } else { return false; }', 'if (read()) return false; else return true;']) {
    const source = `function f(read, Boolean) { ${branches} }`;
    const result = await refactorNoahSource('agent.js', encode(source));
    assert.equal(result.report.status, 'refactored'); assert.equal(result.report.validation, 'syntax');
    for (const input of [undefined, null, 0, -0, NaN, 1, '', 'value', [], {}, 0n, 1n]) {
      let before = 0, after = 0;
      const oldFn = vm.runInNewContext(source + '; f'), newFn = vm.runInNewContext(decode(result.bytes) + '; f');
      const a = oldFn(() => { before++; return input; }, () => { throw new Error('shadowed'); });
      const b = newFn(() => { after++; return input; }, () => { throw new Error('shadowed'); });
      assert.equal(a, b); assert.equal(before, 1); assert.equal(after, 1);
    }
  }
});
void test('TS, JSX, nested conditions and adjacent dangling else keep valid structure', async () => {
  const ts = 'export function accepts(x: number): boolean { if (x > 0) return true; else return false; }';
  const result = await refactorNoahSource('agent.ts', encode(ts)); assert.match(decode(result.bytes), /return !!\(x > 0\);/);
  const source = 'function f(a,b){if(a) if(b) return true; else return false; else return 42;}';
  const fixed = await refactorNoahSource('agent.js', encode(source));
  for (const a of [0, 1]) for (const b of [0, 1]) assert.equal(vm.runInNewContext(source + `;f(${a},${b})`), vm.runInNewContext(decode(fixed.bytes) + `;f(${a},${b})`));
  const jsx = await refactorNoahSource('agent.tsx', encode('const view = <div/>; function f(x: string) { if(x) return true; else return false; }'));
  assert.equal(jsx.report.status, 'refactored'); assert.match(decode(jsx.bytes), /<div\/>/);
});
void test('comments, directives, strings, side effects and nonboolean return expressions are not rewritten', async () => {
  for (const source of [
    'function f(x){if(x) { /* licence */ return true; } else return false;}',
    'function f(x){if(x) { work(); return true; } else return false;}',
    'function f(x){if(x) return true;}',
    'function f(x){if(x) return 1; else return 0;}',
    'const text = "if(x) return true; else return false;";',
    'function f(x){if(x) return true; else return true;}',
  ]) {
    const result = await refactorNoahSource('agent.js', encode(source));
    assert.equal(result.report.status, 'unchanged'); assert.equal(decode(result.bytes), source);
  }
});
void test('unsupported, oversized, invalid UTF-8 and invalid syntax preserve original bytes and never claim refactored', async () => {
  for (const [name, bytes, status] of [
    ['agent.py', encode('print(42)'), 'unsupported'], ['agent.zip', new Uint8Array([80,75,5,6]), 'failed'],
    ['agent.js', encode('//'.repeat(32769)), 'unsupported'], ['agent.ts', encode('function broken('), 'failed'],
    ['agent.js', encode('export function f(x: number) { if(x) return true; else return false; }'), 'failed'],
    ['agent.js', new Uint8Array([255,255,255,255]), 'failed'],
  ]) {
    const result = await refactorNoahSource(name, bytes); assert.deepEqual(result.bytes, bytes); assert.equal(result.report.status, status); assert.equal(result.report.validation, 'not_run');
  }
});
void test('UTF-8 BOM, CRLF and surrounding licence survive; repeated processing is stable', async () => {
  const input = encode('\ufeff/* licence */\r\nfunction f(x){if(x) return true; else return false;}\r\n');
  const result = await refactorNoahSource('agent.js', input);
  assert.deepEqual(result.bytes.slice(0,3), new Uint8Array([239,187,191])); assert.match(decode(result.bytes), /^\/\* licence \*\/\r\n/);
  const next = await refactorNoahSource('agent.js', result.bytes); assert.equal(next.report.status, 'unchanged'); assert.deepEqual(next.bytes, result.bytes);
});
