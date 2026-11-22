import test from 'node:test';
import assert from 'node:assert/strict';
import { H, remote, pkg, recipe } from './fixtures/noah/connect.mjs';
import { NoahConnectError, canonicalJson, diffNoahConnect, looksLikeNoahSecret, noahConnectSha256, parseNoahConnect } from '../lib/noah-connect-requirements.ts';

// 鍵らしい文字列は、試験の中で組み立てる（どれも作り物で、どこの鍵でもない）。
// リポジトリの秘密値の検査（SPIDER。SECURITY.md）は履歴の全部を見るので、作り物でも、そのまま書くと鍵の候補として拾われる。
const glue = (...parts) => parts.join('');
const FAKE_SK = glue('sk', '-', 'abcdefgh', '12345678');
const FAKE_JWT_HEAD = glue('eyJ', 'hbGciOiJIUzI1NiJ9', 'abcdefgh');
const FAKE_GHP = glue('gh', 'p_', 'abcdefgh', '12345678');
const FAKE_BEARER = glue('Bearer', ' ', 'abcdEFGH', '1234abcd');
const FAKE_PAIR = glue('token', '=', 'A1b2C3', 'd4E5f6', 'G7h8I9', 'j0K1l2', 'M3n4O5', 'p6');
const FAKE_HF = glue('hf', '_', 'abcdefghijkl');
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const code = (value) => {
  try { parseNoahConnect(value); return 'ok'; } catch (error) { assert.ok(error instanceof NoahConnectError, String(error)); return error.code; }
};

void test('接続要件: 通る形', () => {
  assert.equal(code(remote()), 'ok');
  assert.equal(code(pkg()), 'ok');
  assert.equal(code(recipe()), 'ok');
  assert.equal(code(remote({ target: { url: 'https://api.example.com/mcp/{tenant}', headers: [{ name: 'Authorization', required: true, secret: true, template: 'Bearer {api_key}' }] }, egress: ['api.example.com'], secrets: ['Authorization', 'URL の tenant'] })), 'ok');
  assert.equal(code(pkg({ target: { registryType: 'pypi', identifier: 'gateco', version: '1.14.0', integrity: `sha256:${H}`, args: ['--transport', 'stdio'], command: 'gateco-mcp', extras: ['mcp'], env: ['GATECO_API_KEY'] } })), 'ok');
  assert.equal(code(pkg({ mouth: 'acp', places: ['home'], model: { use: 'own_account', needs: [], minContextTokens: 0 }, target: { registryType: 'binary', identifier: 'https://github.com/example/agent/releases/download/v1/agent-linux-aarch64.tar.gz', version: '1.0.0', integrity: `sha256:${H}`, args: [], command: './agent', env: [] } })), 'ok');
});

void test('接続要件: 拒否する形（規則ごとに 1 つ以上）', () => {
  const k = (name, value, expected) => ({ name, value, expected });
  const cases = [
    k('未知の項目', { ...remote(), extra: 1 }, 'unknown_key'),
    k('schema 違い', remote({ schema: 'noah-connect/2' }), 'schema'),
    k('指す物が両方', { ...remote(), packageKey: 'k', manifestSha256: H }, 'subject'),
    k('指す物が無い', without(remote(), ['candidateId', 'candidateDigest']), 'subject'),
    k('hash の形', remote({ candidateDigest: 'xyz' }), 'subject'),
    k('口の値', remote({ mouth: 'ssh' }), 'enum'),
    k('機種の名前の置き場所', pkg({ places: ['mac'] }), 'enum'),
    k('置き場所の重複', pkg({ places: ['home', 'home'] }), 'places'),
    k('相手のサーバーの口に home', remote({ places: ['provider', 'home'] }), 'places'),
    k('端末の口に provider', pkg({ places: ['provider'] }), 'places'),
    k('source でない物に pocket', pkg({ places: ['home', 'pocket'] }), 'places'),
    k('端末の口で面 none', pkg({ surface: 'none' }), 'surface'),
    k('相手のサーバーの口で面 terminal', remote({ surface: 'terminal' }), 'surface'),
    k('http の接続先', remote({ target: { url: 'http://mizan.ac/mcp', headers: [] } }), 'url'),
    k('数字のアドレス', remote({ target: { url: 'https://10.0.0.5/mcp', headers: [] }, egress: ['10.0.0.5'] }), 'url'),
    k('内部向けの名前', remote({ target: { url: 'https://db.internal/mcp', headers: [] }, egress: ['db.internal'] }), 'url'),
    k('URL の中の認証情報', remote({ target: { url: 'https://user:pass@mizan.ac/mcp', headers: [] } }), 'url'),
    k('host への差し込み', remote({ target: { url: 'https://{tenant}.example.com/mcp', headers: [] }, egress: ['x.example.com'] }), 'url'),
    k('予約された header', remote({ target: { url: 'https://mizan.ac/mcp', headers: [{ name: 'Cookie', required: true, secret: true }] } }), 'header'),
    k('秘密の header に固定の値', remote({ target: { url: 'https://mizan.ac/mcp', headers: [{ name: 'X-Key', required: true, secret: true, value: 'abc' }] } }), 'secret'),
    k('固定の値が鍵らしい', remote({ target: { url: 'https://mizan.ac/mcp', headers: [{ name: 'X-Key', required: true, secret: false, value: FAKE_SK }] } }), 'secret'),
    k('URL のパスに token', remote({ target: { url: `https://mizan.ac/mcp/${FAKE_JWT_HEAD}`, headers: [] } }), 'secret'),
    k('egress が接続先と違う', remote({ egress: ['other.example.com'] }), 'egress'),
    k('egress に * ', pkg({ egress: ['*'] }), 'egress'),
    k('codeDelivery の不一致', remote({ codeDelivery: 'cloud_only' }), 'codeDelivery'),
    k('本人の契約で cloud', pkg({ model: { use: 'own_account', needs: [], minContextTokens: 0 } }), 'places'),
    k('端末のモデルで cloud', pkg({ model: { use: 'local', needs: [], minContextTokens: 0 } }), 'places'),
    k('npm の識別子に記号', pkg({ target: { ...pkg().target, identifier: 'ok; rm -rf /' } }), 'identifier'),
    k('版が範囲', pkg({ target: { ...pkg().target, version: '^8.0.0' } }), 'identifier'),
    k('版が latest', pkg({ target: { ...pkg().target, version: 'latest' } }), 'identifier'),
    k('引数に shell の記号', pkg({ target: { ...pkg().target, args: ['$(id)'] } }), 'arg'),
    k('環境変数の名前', pkg({ target: { ...pkg().target, env: ['2BAD'] } }), 'env'),
    k('固定の hash の形', pkg({ target: { ...pkg().target, integrity: 'md5-abc' } }), 'integrity'),
    k('binary に hash が無い', pkg({ mouth: 'acp', places: ['home'], target: { registryType: 'binary', identifier: 'https://example.com/a.tgz', version: '', integrity: null, args: [], command: './a', env: [] } }), 'integrity'),
    k('起動する名前に ..', pkg({ target: { ...pkg().target, command: '../../bin/sh' } }), 'arg'),
    k('見本の入力に鍵', remote({ try: { input: `key is ${FAKE_GHP}` } }), 'secret'),
    k('サービスの重複', remote({ services: [{ id: 'a', method: 'oauth', required: true, purpose: 'A の許可' }, { id: 'a', method: 'oauth', required: true, purpose: 'A の許可' }] }), 'shape'),
  ];
  for (const { name, value, expected } of cases) assert.equal(code(value), expected, name);
  assert.equal(cases.length, 37);
});

void test('秘密値の見分け: 当てる物と当てない物', () => {
  for (const s of [FAKE_SK, FAKE_BEARER, FAKE_PAIR, FAKE_HF])
    assert.equal(looksLikeNoahSecret(s), true, s);
  assert.deepEqual([FAKE_SK.length, FAKE_BEARER.length, FAKE_PAIR.length, FAKE_HF.length, FAKE_GHP.length, FAKE_JWT_HEAD.length], [19, 23, 38, 15, 20, 28], '組み立てた値は、前に直に書いていた値と同じ長さ');
  for (const s of ['@modelcontextprotocol/server-memory', 'agent-observatory-sensor.nolimit-observatory.workers.dev', '--transport', 'テスト', '2842d69a', 'abcdefghijklmnopqrstuvwxyzabcdefghijkl'])
    assert.equal(looksLikeNoahSecret(s), false, s);
});

void test('hash: 鍵の順が違っても同じ。内容が違えば違う', async () => {
  const a = parseNoahConnect(remote());
  const b = parseNoahConnect(Object.fromEntries(Object.entries(remote()).reverse()));
  assert.equal(await noahConnectSha256(a), await noahConnectSha256(b));
  assert.notEqual(await noahConnectSha256(a), await noahConnectSha256(parseNoahConnect(remote({ try: { input: 'x' } }))));
  assert.equal(canonicalJson({ b: 1, a: [2, { d: undefined, c: 3 }] }), '{"a":[2,{"c":3}],"b":1}');
});

void test('更新の差: 聞き直しが要る変化と、要らない変化', () => {
  const base = parseNoahConnect(pkg({ target: { ...pkg().target, integrity: `sha256:${H}` } }));
  const bump = parseNoahConnect(pkg({ target: { ...pkg().target, version: '8.0.4', integrity: `sha256:${'b'.repeat(64)}` } }));
  assert.deepEqual(diffNoahConnect(base, bump), { changed: [], reconsent: false }, '版と hash だけの更新は自動で入る');
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: { ...base.target, integrity: `sha256:${H}` }, egress: ['api.example.com'] }))), { changed: ['egress'], reconsent: true });
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: { ...base.target, args: ['--write'] } }))), { changed: ['target'], reconsent: true });
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: base.target, try: { input: 'やあ' } }))), { changed: ['try'], reconsent: false });
});
