import test from 'node:test';
import assert from 'node:assert/strict';
import { collectSelectedData, encryptDataCollection, decryptDataCollection, collectedFileBytes, DATA_COLLECTION_FORMAT, MAX_COLLECTION_BYTES } from '../lib/data-collection.ts';
import { encryptBackupEnvelope } from '../lib/backup-crypto.ts';
import { encryptDeviceBackup, decryptDeviceBackup } from '../lib/system-backup.ts';
const pass = 'fixture recovery passphrase';
test('only explicitly selected bytes and note round trip through encrypted archive', async () => {
 const data = await collectSelectedData([new File([new Uint8Array([0,255,11])],'選択.bin'),new File(['hello'],'note.txt')], '私のメモ');
 const encrypted = await encryptDataCollection(data,pass);
 assert.ok(!encrypted.includes('私のメモ') && !encrypted.includes('note.txt'));
 const restored = await decryptDataCollection(encrypted,pass);
 assert.deepEqual(restored,data);
 assert.deepEqual([...collectedFileBytes(restored.files[0])],[0,255,11]);
});
test('wrong password, changed ciphertext and format substitution are rejected', async () => {
 const text = await encryptDataCollection(await collectSelectedData([], 'selected note'),pass);
 await assert.rejects(decryptDataCollection(text,'different passphrase'));
 const e = JSON.parse(text); e.ciphertext = (e.ciphertext[0] === 'A' ? 'B' : 'A') + e.ciphertext.slice(1);
 await assert.rejects(decryptDataCollection(JSON.stringify(e),pass));
 await assert.rejects(decryptDeviceBackup(text,pass));
 await assert.rejects(decryptDataCollection(await encryptDeviceBackup({},pass),pass));
});
test('oversized selection is refused before reading files', async () => {
 let reads=0; const f={name:'huge.bin',size:MAX_COLLECTION_BYTES+1,arrayBuffer:async()=>{reads++;return new ArrayBuffer(0);}};
 await assert.rejects(collectSelectedData([f],'')); assert.equal(reads,0);
 await assert.rejects(collectSelectedData(Array.from({length:21},()=>new File(['x'],'x.txt')),''));
 await assert.rejects(collectSelectedData([], 'あ'.repeat(30000)));
 await assert.rejects(collectSelectedData([], ''));
});
test('untrusted restored metadata is validated even when envelope authentication succeeds', async () => {
 const valid = await collectSelectedData([new File(['abc'],'safe.txt')],'');
 for(const edit of [v=>v.files[0].name='../unsafe',v=>v.files[0].sha256='0'.repeat(64),v=>v.files[0].size=99,v=>v.files.push(v.files[0]),v=>v.files[0].data='!!!!']) {
  const data=structuredClone(valid); edit(data);
  const sealed=await encryptBackupEnvelope(new TextEncoder().encode(JSON.stringify(data)),pass,DATA_COLLECTION_FORMAT,4*1024*1024);
  await assert.rejects(decryptDataCollection(sealed,pass));
 }
});
test('KDF cost and envelope size are bounded before decryption', async () => {
 const encrypted=JSON.parse(await encryptDataCollection(await collectSelectedData([], 'note'),pass));
 encrypted.iterations=2**32;
 await assert.rejects(decryptDataCollection(JSON.stringify(encrypted),pass));
 await assert.rejects(decryptDataCollection('x'.repeat(8*1024*1024+1),pass));
});
test('unsafe names and changed file sizes fail closed; zero-byte files can round trip', async () => {
 for (const name of ['../escape','a\\b','a\n.txt']) await assert.rejects(collectSelectedData([{name,size:0,arrayBuffer:async()=>new ArrayBuffer(0)}],''));
 await assert.rejects(collectSelectedData([{name:'changed',size:1,arrayBuffer:async()=>new ArrayBuffer(2)}],''));
 const data=await collectSelectedData([new File([],'empty.txt')],'');
 assert.deepEqual(await decryptDataCollection(await encryptDataCollection(data,pass),pass),data);
});
