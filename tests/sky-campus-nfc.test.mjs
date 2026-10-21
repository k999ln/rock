import assert from 'node:assert/strict';
import test from 'node:test';
import { campuses, ndefUri, skyCampusUrl } from '../scripts/generate-sky-campus-nfc.mjs';

void test('five campus NFC payloads are one short HTTPS URI record with no grant', () => {
  assert.equal(campuses.length, 5);
  for (const campus of campuses) {
    const url = skyCampusUrl(campus);
    const record = ndefUri(url);
    assert.deepEqual([...record.subarray(0, 2)], [0xd1, 0x01]);
    assert.equal(record[2], record.length - 4);
    assert.deepEqual([...record.subarray(3, 5)], [0x55, 0x04]);
    assert.equal(`https://${record.subarray(5).toString()}`, url);
    assert.equal(new URL(url).pathname, `/os/sky/campus/${campus}/hub`);
    assert.equal(new URL(url).searchParams.get('source'), 'nfc');
    assert.doesNotMatch(url, /token|grant|user|secret|key/i);
  }
});
