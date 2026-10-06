import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const url = readFileSync(resolve(root, 'docs/nfc/rockstaros-url.txt'), 'utf8').trim();
const parsed = new URL(url);
if (parsed.protocol !== 'https:' || parsed.hostname !== 'rockstaros-kaiya.noellesugar1.chatgpt.site' || parsed.pathname !== '/' || parsed.search !== '?nfc=1' || parsed.hash) {
  throw new Error('NFC URLが承認済みRockstarOSホームを指していません。');
}

// NDEF short well-known URI record: MB|ME|SR|TNF=1, type U, URI prefix https://.
const suffix = Buffer.from(url.slice('https://'.length), 'utf8');
const payload = Buffer.concat([Buffer.from([0x04]), suffix]);
if (payload.length > 255) throw new Error('NDEF短レコードの上限を超えています。');
const record = Buffer.concat([
  Buffer.from([0xd1, 0x01, payload.length, 0x55]),
  payload,
]);
writeFileSync(resolve(root, 'docs/nfc/rockstaros-uri.ndef'), record);
console.log(`NDEF URI: ${url} (${record.length} bytes)`);
