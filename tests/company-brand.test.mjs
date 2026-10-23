import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const json=p=>JSON.parse(read(p).toString());
const sha=b=>createHash('sha256').update(b).digest('hex');
void test('new company logo preserves the exact owner supplied original and common product scope',()=>{
 const brand=json('data/company-brand.json'),source=read(brand.source);
 assert.equal(sha(source),'99718729b2caaf0c52ddcf1db48c48da2c0b1eb61d7ff2c1775ce44d545bf6b9');assert.equal(brand.sourceSha256,sha(source));
 assert.deepEqual([source.readUInt32BE(16),source.readUInt32BE(20)],[1920,1080]);
 for(const name of ['RockstarOS','Eve','avocadoMini','avocadoPro'])assert.ok(brand.scope.includes(name));
 assert.ok(brand.scope.some(name=>name.startsWith('smis')));
});
void test('compiled Web/PWA/native/product assets match their manifest and preserve icon dimensions',()=>{
 const assets=json('data/company-brand-assets.json'),icon=read('public/company-mark.png');
 assert.equal(assets.sourceSha256,json('data/company-brand.json').sourceSha256);
 for(const [path,hash] of Object.entries(assets.files))assert.equal(sha(read(path)),hash,path);
 assert.deepEqual([icon.readUInt32BE(16),icon.readUInt32BE(20)],[512,512]);
 const small=read('public/rock-icon-192.png');assert.deepEqual([small.readUInt32BE(16),small.readUInt32BE(20)],[192,192]);
 for(const path of ['public/favicon.svg','public/company-mark-192.svg','public/rock-icon-maskable.svg']){
  const svg=read(path).toString(),match=svg.match(/href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);assert.ok(match,path);assert.deepEqual(Buffer.from(match[1],'base64'),icon);
 }
 assert.equal(assets.publicDeployed,false);assert.equal(assets.pixelInstalled,false);
});
