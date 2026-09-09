/** Independent literal wire/crypto fixtures only; not a client, SDK or endpoint.
 * No Python import, subprocess, private key, network, database or mutation.
 * The source fixture is pinned and trusted; JSON.parse here is NOT a general
 * untrusted-wire decoder (it does not retain duplicate keys or numeric lexemes).
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURES = [
  {id:'historical-UUID-account',file:'connection-v1-vectors.json',sha256:'c2382e94932bd42a284ac64dec30519c762eeddcc13b5ee76ae836b82a011871'},
  {id:'existing-prefixed-account',file:'connection-v1-prefixed-account-vectors.json',sha256:'120f3edc5d5b19b6442e7ba87f2bdee7cd31435534bd5f82af77ef67b6daa346'},
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
let fixtureId = 'cross-fixture';
function check(id, action, category = 'positive') {
  try { action(); results.push({ id:fixtureId + '/' + id, category, status: 'PASS' }); }
  catch (error) { results.push({ id:fixtureId + '/' + id, category, status: 'FAIL', error: error.message }); throw error; }
}
function reject(id, action) { check(id, () => assert.throws(action), 'rejection'); }

// This encoder independently implements the bounded Python wire representation.
// JSON.stringify of a reconstructed object would reorder integer-looking keys;
// encode entries directly so all ASCII keys follow lexical sorting instead.
function canonical(value) {
  let nodes = 2048;
  function encode(item, depth) {
    assert.ok(depth <= 12 && --nodes >= 0, 'structural limit');
    if (item === null || typeof item === 'boolean') return String(item);
    if (typeof item === 'number') {
      assert.ok(Number.isSafeInteger(item) && item >= 0 && !Object.is(item, -0), 'exact nonnegative safe integer');
      return String(item);
    }
    if (typeof item === 'string') {
      assert.ok([...item].length <= 65536 && !/[\uD800-\uDFFF]/u.test(item), 'valid scalar string');
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) {
      assert.ok(item.length <= nodes, 'array node budget');
      assert.ok(Array.from({length:item.length},(_,index)=>Object.hasOwn(item,index)).every(Boolean), 'dense JSON array');
      return '[' + item.map(child => encode(child, depth + 1)).join(',') + ']';
    }
    assert.ok(item && Object.getPrototypeOf(item) === Object.prototype, 'plain JSON object');
    const keys = Object.keys(item).sort();
    assert.equal(Reflect.ownKeys(item).length, keys.length, 'enumerable string keys only');
    assert.ok(keys.every(key => /^[\x00-\x7f]{0,80}$/.test(key)), 'ASCII schema keys');
    return '{' + keys.map(key => JSON.stringify(key) + ':' + encode(item[key], depth + 1)).join(',') + '}';
  }
  const bytes = Buffer.from(encode(value, 0), 'utf8');
  assert.ok(bytes.length <= 65536, 'JSON byte limit');
  return bytes;
}
function b64url(value, length) {
  assert.ok(typeof value === 'string' && /^[A-Za-z0-9_-]*$/.test(value), 'unpadded base64url');
  const bytes = Buffer.from(value, 'base64url');
  assert.equal(bytes.toString('base64url'), value, 'canonical base64url');
  if (length !== undefined) assert.equal(bytes.length, length);
  return bytes;
}
function domain(text) { assert.ok(!text.includes('\0')); return Buffer.from(text + '\0', 'ascii'); }
const domains = {
  proof: domain('RockGameConnectionProof-v1'),
  shared: domain('RockGameConnectionReceipt-v1'),
  cursor: domain('RockGameConnectionCursor-v1'),
};
const purposes = { proof: 'game.connection.proof', shared: 'wallet.connection.receipt', cursor: 'wallet.connection.cursor' };
const payload = (kind, value, prefix = domains[kind]) => {
  assert.ok(Buffer.isBuffer(prefix));
  const { signature, ...body } = value; assert.equal(typeof signature, 'string');
  return Buffer.concat([prefix, canonical(body)]);
};
const digest = (name, value) => hash(Buffer.concat([domain(name), canonical(value)]));
function publicKey(hex) {
  assert.match(hex, /^[a-f0-9]{64}$/);
  return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });
}
function recordFor(v, kind, object) {
  const issuer = kind === 'proof' ? object.game_authority_id : kind === 'cursor' ? object.issuer : object.publication.wallet_authority_id;
  const records = v.keys.filter(k => k.issuer === issuer && k.purpose === purposes[kind] && k.key_id === object.credential_id && k.revision === object.credential_revision);
  assert.equal(records.length, 1, 'one purpose/issuer/key/revision binding');
  return records[0];
}
function signature(v, kind, object, prefix) {
  const key = recordFor(v, kind, object);
  assert.equal(object.algorithm, 'Ed25519');
  assert.ok(verify(null, payload(kind, object, prefix), publicKey(key.public_key), b64url(object.signature, 64)), 'Ed25519 signature mismatch');
}
// Narrow context checks needed to exercise the literal proof rejection vectors.
// This deliberately does not claim parity with the full Python schema/registry.
function proofContext(v, object, { now = v.fixed_now, audience = v.owner_context.wallet_authority_id, prefix } = {}) {
  const keys = ['schema','environment','game_authority_id','game_id','game_revision','player_id','player_display','player_display_revision','audience','nonce','issued_at','expires_at','requested_scopes','algorithm','credential_id','credential_revision','signature'].sort();
  assert.deepEqual(Object.keys(object).sort(), keys);
  assert.equal(object.schema, 'rock-game-connection-proof/1'); assert.equal(object.environment, 'synthetic');
  for (const key of ['game_revision','player_display_revision','credential_revision','issued_at','expires_at']) assert.ok(Number.isSafeInteger(object[key]) && object[key] >= 1);
  assert.equal(object.player_display.normalize('NFC'), object.player_display);
  assert.ok(!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(object.player_display));
  assert.ok(object.issued_at <= now && now < object.expires_at && object.expires_at <= object.issued_at + 120);
  assert.equal(object.audience, audience); b64url(object.nonce, 32);
  const game = Object.values(v.games).find(game => game.game_authority_id === object.game_authority_id && game.game_id === object.game_id && game.revision === object.game_revision);
  assert.ok(game); assert.deepEqual(object.requested_scopes, [...new Set(object.requested_scopes)].sort());
  assert.ok(object.requested_scopes.includes('connection:read') && object.requested_scopes.every(scope => game.scopes.includes(scope)));
  const record = recordFor(v, 'proof', object);
  assert.equal(record.revoked_at, null); assert.equal(record.retired_at, null);
  assert.ok(record.not_before <= object.issued_at && object.issued_at < record.not_after && now < record.not_after);
  signature(v, 'proof', object, prefix);
}

function accountJoins(v) {
  const owner = v.owner_context;
  assert.match(owner.account_id, /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}$/);
  const objects = v.objects;
  for (const bound of [objects.binding,objects.intent.binding,objects.owner_consent.binding,objects.subject_reservation.binding,objects.cursor_scope]) {
    for (const field of ['wallet_authority_id','owner_ref','account_id','device_ref','credential_revision']) assert.equal(bound[field],owner[field], 'exact authenticated context ' + field);
  }
}

function verifyFixture(v) {
  assert.equal(v.schema, 'rock-game-connection-vectors/1');
  const o = v.objects;
  check('existing-account-context-exact-joins', () => accountJoins(v));
  reject('substituted-context-account', () => accountJoins({...v,owner_context:{...v.owner_context,account_id:'acct-'+ 'f'.repeat(32)}}));
  check('literal-object-inventory', () => assert.deepEqual(Object.keys(o).sort(), Object.keys(v.canonical_hex).sort()));
  for (const [name, object] of Object.entries(o)) {
    check('canonical-literal-' + name, () => assert.equal(canonical(object).toString('hex'), v.canonical_hex[name]));
    check('reordered-keys-' + name, () => assert.deepEqual(canonical(Object.fromEntries(Object.entries(object).reverse())), canonical(object)));
  }
  const signed = { proof_a:'proof', proof_b:'proof', shared_receipt:'shared', revoked_shared_receipt:'shared', cursor:'cursor' };
  check('literal-signing-inventory', () => assert.deepEqual(Object.keys(signed).sort(), Object.keys(v.signing_payload_hex).sort()));
  for (const [name, kind] of Object.entries(signed)) {
    check('signing-payload-literal-' + name, () => assert.equal(payload(kind, o[name]).toString('hex'), v.signing_payload_hex[name]));
    check('ed25519-' + name, () => signature(v, kind, o[name]));
    reject('changed-signature-' + name, () => {
      const raw = b64url(o[name].signature, 64); raw[7] ^= 1;
      signature(v, kind, { ...o[name], signature: raw.toString('base64url') });
    });
    reject('domain-without-NUL-' + name, () => signature(v, kind, o[name], domains[kind].subarray(0, -1)));
    reject('domain-literal-backslash-zero-' + name, () => signature(v, kind, o[name], Buffer.from(domains[kind].subarray(0, -1).toString('ascii') + '\\0')));
  }
  const digestLinks = [
    ['proof', 'RockGameProofDigest-v1', o.proof_a, v.digests.proof],
    ['binding', 'RockGameConnectionBinding-v1', o.binding, v.digests.binding],
    ['consent', 'RockGameOwnerConsent-v1', o.owner_consent, v.digests.consent],
    ['binding-proof', 'RockGameProofDigest-v1', o.proof_a, o.binding.proof_sha256],
    ['intent-binding', 'RockGameConnectionBinding-v1', o.binding, o.intent.binding_sha256],
    ['approval-binding', 'RockGameConnectionBinding-v1', o.binding, o.owner_approval.binding_sha256],
    ['consent-binding', 'RockGameConnectionBinding-v1', o.binding, o.owner_consent.binding_sha256],
    ['reservation-binding', 'RockGameConnectionBinding-v1', o.binding, o.subject_reservation.binding_sha256],
    ['intent-request', 'RockGameOwnerRequest-v1', o.begin_request, o.intent.request_sha256],
    ['consent-request', 'RockGameOwnerRequest-v1', o.owner_approval, o.owner_consent.request_sha256],
    ['consent-assertion', 'RockGameOwnerAssertion-v1', o.owner_approval.credential, o.owner_consent.assertion_sha256],
    ['publication-binding', 'RockGameConnectionBinding-v1', o.binding, o.shared_receipt.publication.binding_sha256],
    ['publication-consent', 'RockGameOwnerConsent-v1', o.owner_consent, o.shared_receipt.publication.consent_sha256],
    ['shared-request', 'RockGameConnectionPublication-v1', o.shared_receipt.publication, o.shared_receipt.request_sha256],
    ['revoked-request', 'RockGameConnectionPublication-v1', o.revoked_shared_receipt.publication, o.revoked_shared_receipt.request_sha256],
    ['owner-receipt', 'RockGameSharedReceipt-v1', o.shared_receipt, o.owner_view.receipt_sha256],
    ['author-receipt', 'RockGameSharedReceipt-v1', o.shared_receipt, o.author_active_view.receipt_sha256],
    ['revoked-author-receipt', 'RockGameSharedReceipt-v1', o.revoked_shared_receipt, o.author_revoked_view.receipt_sha256],
    ['cursor-scope', 'RockGameConnectionCursorScope-v1', o.cursor_scope, o.cursor.scope_sha256],
    ['nested-intent-proof', 'RockGameProofDigest-v1', o.proof_a, o.intent.binding.proof_sha256],
    ['nested-consent-proof', 'RockGameProofDigest-v1', o.proof_a, o.owner_consent.binding.proof_sha256],
    ['nested-reservation-proof', 'RockGameProofDigest-v1', o.proof_a, o.subject_reservation.binding.proof_sha256],
    ['owner-view-binding', 'RockGameConnectionBinding-v1', o.binding, o.owner_view.connection.binding_sha256],
    ['owner-view-consent', 'RockGameOwnerConsent-v1', o.owner_consent, o.owner_view.connection.consent_sha256],
    ['revoked-publication-binding', 'RockGameConnectionBinding-v1', o.binding, o.revoked_shared_receipt.publication.binding_sha256],
    ['revoked-publication-consent', 'RockGameOwnerConsent-v1', o.owner_consent, o.revoked_shared_receipt.publication.consent_sha256],
  ];
  for (const [name, prefix, value, expected] of digestLinks) {
    check('digest-' + name, () => assert.equal(digest(prefix, value), expected));
    reject('digest-domain-change-' + name, () => assert.equal(digest(prefix + '-different', value), expected));
  }
  check('cursor-token-literal', () => assert.equal(canonical(o.cursor).toString('base64url'), v.cursor_token));
  check('cursor-token-exact-bytes', () => assert.deepEqual(b64url(v.cursor_token), canonical(o.cursor)));
  check('top-level-signature-removal-only', () => assert.equal(payload('proof', { signature:'remove', child:{ signature:'keep' } }).subarray(domains.proof.length).toString(), '{"child":{"signature":"keep"}}'));
  check('numeric-ASCII-key-order', () => assert.equal(canonical({ '2':'two','10':'ten' }).toString(), '{"10":"ten","2":"two"}'));
  check('UTF8-scalar-and-control-escaping', () => assert.equal(canonical({ z:'雪😀', a:'\u0000\b\t\n\f\r\\"' }).toString('hex'), Buffer.from('{"a":"\\u0000\\b\\t\\n\\f\\r\\\\\\\"","z":"雪😀"}').toString('hex')));
  check('safe-integer-boundary', () => assert.equal(canonical({ n:9007199254740991 }).toString(), '{"n":9007199254740991}'));
  for (const [name, value] of [['sparse-array',Array(1)],['symbol-key',{[Symbol('invalid')]:1}],['fraction',1.5],['negative',-1],['negative-zero',-0],['unsafe-integer',9007199254740992],['NaN',NaN],['infinity',Infinity],['BigInt',1n],['undefined',undefined],['lone-surrogate','\ud800'],['nonASCII-key',{'雪':1}],['long-key',{['x'.repeat(81)]:1}],['structural-array',Array(2048).fill(null)],['byte-limit','雪'.repeat(22000)],['excess-depth',Array.from({length:14}).reduce(value=>[value],0)]]) reject('canonical-reject-' + name, () => canonical(value));
  for (const [name, token] of [['padding',o.proof_a.signature+'='],['invalid-character','*'],['nonminimal-bits','AB']]) reject('base64url-reject-' + name, () => b64url(token));
  check('proof-a-context', () => proofContext(v, o.proof_a));
  check('proof-b-context', () => proofContext(v, o.proof_b));
  for (const vector of v.rejection_vectors) reject('literal-negative-' + vector.name, () => {
    const proof = structuredClone(o.proof_a);
    for (const key of ['requested_scopes','player_display']) if (Object.hasOwn(vector,key)) proof[key]=vector[key];
    proofContext(v, proof, {now:vector.now ?? v.fixed_now,audience:vector.audience ?? v.owner_context.wallet_authority_id,prefix:vector.replacement_domain_hex ? Buffer.from(vector.replacement_domain_hex,'hex') : undefined});
  });
  // Independently verify the original signed WebAuthn bytes too; no challenge
  // consumption, counter commit, durable consent or hardware authentication.
  const credential=o.owner_approval.credential, response=credential.response;
  const clientBytes=b64url(response.clientDataJSON), client=JSON.parse(clientBytes.toString('utf8'));
  const authData=b64url(response.authenticatorData,37), ownerKey=publicKey(v.owner_auth_record_before.public_key);
  const ownerPayload=Buffer.concat([authData,Buffer.from(hash(clientBytes),'hex')]);
  check('owner-assertion-context', () => {
    assert.equal(client.type,'webauthn.get'); assert.equal(client.challenge,o.intent.options.publicKey.challenge);
    assert.equal(client.origin,'https://wallet.rock-star-os.test'); assert.equal(client.crossOrigin,false);
    assert.deepEqual(authData.subarray(0,32),Buffer.from(hash(Buffer.from('wallet.rock-star-os.test')),'hex'));
    assert.equal(authData[32],5); assert.equal(authData.readUInt32BE(33),o.owner_consent.credential_sign_count);
    assert.ok(authData.readUInt32BE(33)>v.owner_auth_record_before.sign_count);
    assert.equal(credential.id,v.owner_auth_record_before.credential_id); assert.equal(credential.rawId,credential.id);
    assert.equal(response.userHandle,v.owner_user_handle);
  });
  check('owner-ed25519-assertion', () => assert.ok(verify(null,ownerPayload,ownerKey,b64url(response.signature,64))));
  reject('owner-client-bytes-tamper', () => { const bytes=Buffer.from(ownerPayload);bytes[bytes.length-1]^=1;assert.ok(verify(null,bytes,ownerKey,b64url(response.signature,64))); });
  reject('proof-other-game-key', () => assert.ok(verify(null,payload('proof',o.proof_a),publicKey(recordFor(v,'proof',o.proof_b).public_key),b64url(o.proof_a.signature,64))));
  reject('shared-payload-tamper', () => signature(v,'shared',{...o.shared_receipt,publication:{...o.shared_receipt.publication,player_id:'fixture-other'}}));
  return {literal_objects:Object.keys(o).length,signing_payloads:Object.keys(signed).length,game_signatures:5,owner_assertion_signatures:1,digest_links:digestLinks.length};
}
function main() {
  const inventories = [], values = [];
  for (const fixture of FIXTURES) {
    fixtureId = fixture.id;
    const start = results.length;
    const bytes = readFileSync(new URL('../os/game_exchange/fixtures/' + fixture.file,import.meta.url));
    check('fixed-public-fixture-sha256', () => assert.equal(hash(bytes), fixture.sha256));
    const value = JSON.parse(bytes.toString('utf8')); values.push(value);
    if (fixtureId === 'existing-prefixed-account') check('literal-existing-account-format', () => assert.match(value.owner_context.account_id,/^acct-[a-f0-9]{32}$/));
    const counts = verifyFixture(value);
    counts.checks = results.length-start;
    counts.rejections = results.slice(start).filter(item=>item.category==='rejection').length;
    inventories.push({...fixture,counts});
  }
  fixtureId = 'cross-fixture';
  reject('historical-binding-with-prefixed-context', () => accountJoins({...values[0],owner_context:values[1].owner_context}));
  reject('prefixed-binding-with-historical-context', () => accountJoins({...values[1],owner_context:values[0].owner_context}));
  return {schema:'rock-game-node-wire-verification/2',executed_at:new Date().toISOString(),status:'PASS_SCOPED_WIRE',scope:'Independent Node standard crypto over pinned public literal fixtures; no SDK/API/DB/session/game acceptance',fixtures:inventories,verifier_sha256:hash(readFileSync(fileURLToPath(import.meta.url))),node:process.version,openssl:process.versions.openssl,platform:process.platform,architecture:process.arch,counts:{checks:results.length,rejections:results.filter(item=>item.category==='rejection').length},results};
}
try { process.stdout.write(JSON.stringify(main(),null,2)+'\n'); }
catch (error) { process.stderr.write(JSON.stringify({schema:'rock-game-node-wire-verification/1',status:'FAIL',error:error.message,results},null,2)+'\n');process.exitCode=1; }
