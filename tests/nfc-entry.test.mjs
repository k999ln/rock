import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../app/manifest.ts';

const root = resolve(import.meta.dirname, '..');
const url = readFileSync(resolve(root, 'docs/nfc/rockstaros-url.txt'), 'utf8').trim();

void test('NFC URL opens the existing PWA home within its scope', () => {
  const entry = new URL(url);
  const pwa = manifest();
  assert.equal(entry.protocol, 'https:');
  assert.equal(entry.hostname, 'rockstaros-kaiya.noellesugar1.chatgpt.site');
  assert.equal(entry.pathname, pwa.start_url);
  assert.equal(entry.pathname, pwa.scope);
  assert.equal(entry.search, '?nfc=1');
});

void test('NDEF payload is one short well-known URI record for the same URL', () => {
  const bytes = readFileSync(resolve(root, 'docs/nfc/rockstaros-uri.ndef'));
  assert.equal(bytes[0], 0xd1);
  assert.equal(bytes[1], 1);
  assert.equal(bytes[2], bytes.length - 4);
  assert.equal(bytes[3], 0x55);
  assert.equal(bytes[4], 0x04);
  assert.equal(`https://${bytes.subarray(5).toString('utf8')}`, url);
  assert.ok(bytes.length <= 144, 'NTAG213の利用可能領域を超えない');
});

void test('NFC arrival shows a dismissible Web-install guide, not an OS-install claim', () => {
  const source = readFileSync(resolve(root, 'components/home-screen.tsx'), 'utf8');
  assert.match(source, /get\('nfc'\) === '1'/);
  assert.match(source, /nfcEntry && !installed && !installDismissed/);
  assert.match(source, /Safariの共有/);
  assert.match(source, /href="\/rockstaros#start"/);
  assert.match(source, /実OS版の配布状況を見る/);
  assert.match(source, /スマホ本体のOSは書き換わりません/);
});
