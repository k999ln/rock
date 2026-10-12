import assert from 'node:assert/strict';
import test from 'node:test';
import { skyMarkdownDownloadHref } from '../lib/sky-result-download.ts';

const prefix = 'data:text/markdown;charset=utf-8,';
const decoded = (text) => {
  const href = skyMarkdownDownloadHref(text);
  assert.ok(href.startsWith(prefix));
  return decodeURIComponent(href.slice(prefix.length));
};

void test('Markdown export preserves Unicode, leading BOM, CRLF and URL delimiters', () => {
  const text = '\ufeff# 日本語 🌤\r\n<&"%?#> [資料](https://example.com/?a=1&b=2#ref)\n';
  assert.equal(decoded(text), text);
  assert.deepEqual(Buffer.from(decoded(text)), Buffer.from(text));
});

void test('unpaired UTF-16 exports as the same replacement bytes as a UTF-8 file', () => {
  const text = 'A\ud800B\udc00C 🌤';
  assert.deepEqual(Buffer.from(decoded(text)), Buffer.from(text));
});

void test('bounded large results remain complete and cannot become an external URL', () => {
  const text = 'https://example.com/?x=#%\n'.repeat(6000);
  const href = skyMarkdownDownloadHref(text);
  assert.equal(new URL(href).protocol, 'data:');
  assert.equal(decoded(text), text);
});
