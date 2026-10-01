// Independent Node canonical-byte and Ed25519 check. No external packages.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../../os/game_exchange/fixtures/exchange-v1/',import.meta.url);
const domains={quote:'RockGameExchangeQuote-v1\0',approval:'RockGameExchangeApprovalReceipt-v1\0',
  apply:'RockGameGrantApply-v1\0',status:'RockGameGrantStatus-v1\0',reject:'RockGameGrantReject-v1\0',terminal:'RockGameGrantReceipt-v1\0'};
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  if(typeof value==='number')assert(Number.isSafeInteger(value));
  return JSON.stringify(value);
}
const hash=raw=>createHash('sha256').update(raw).digest('hex');let checked=0;
for(const name of readdirSync(root).filter(n=>n.endsWith('.json'))){
  const vector=JSON.parse(readFileSync(new URL(name,root),'utf8'));const {message,kind,record}=vector;
  const unsigned={...message};delete unsigned.signature;
  const raw=Buffer.from(domains[kind]+canonical(unsigned));
  assert.equal(raw.toString('hex'),vector.signing_bytes_hex);assert.equal(hash(raw),vector.signing_bytes_sha256);
  assert.equal(hash(canonical(message)),vector.canonical_sha256);
  const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(record.public_key,'base64url')])});
  const signature=Buffer.from(message.signature,'base64url');assert(verify(null,raw,key,signature));
  for(const other of Object.keys(domains))if(other!==kind)assert(!verify(null,Buffer.from(domains[other]+canonical(unsigned)),key,signature));
  checked++;
}
assert.equal(checked,6);console.log(JSON.stringify({status:'PASS',runtime:process.version,vectors:checked,checks:'exact canonical bytes, SHA256, Ed25519 and six separate signing domains',simulation_only:true}));
