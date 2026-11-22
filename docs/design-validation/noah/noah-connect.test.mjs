// 接続要件・接続計画・状態遷移の検証。実行: node --experimental-strip-types --test "docs/design-validation/noah/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOAH_CONNECTION_EVENTS, NOAH_CONNECTION_STATES, NoahConnectError, canonicalJson, diffNoahConnect, looksLikeNoahSecret,
  nextNoahConnectionState, noahConnectSha256, noahPlanSha256, parseNoahConnect, planNoahConnection,
} from '../../contracts/noah-connect-v1.ts';

const H = 'a'.repeat(64);
// 鍵らしい文字列は、試験の中で組み立てる（どれも作り物で、どこの鍵でもない）。
// リポジトリの秘密値の検査（SPIDER。SECURITY.md）は履歴の全部を見るので、作り物でも、そのまま書くと鍵の候補として拾われる。
const glue = (...parts) => parts.join('');
const FAKE_SK = glue('sk', '-', 'abcdefgh', '12345678');
const FAKE_JWT_HEAD = glue('eyJ', 'hbGciOiJIUzI1NiJ9', 'abcdefgh');
const FAKE_GHP = glue('gh', 'p_', 'abcdefgh', '12345678');
const FAKE_BEARER = glue('Bearer', ' ', 'abcdEFGH', '1234abcd');
const FAKE_PAIR = glue('token', '=', 'A1b2C3', 'd4E5f6', 'G7h8I9', 'j0K1l2', 'M3n4O5', 'p6');
const FAKE_HF = glue('hf', '_', 'abcdefghijkl');
const remote = (change = {}) => ({
  schema: 'noah-connect/1', candidateId: 'mcp-registry:ac.mizan/registry', candidateDigest: H, mouth: 'mcp-remote', surface: 'none',
  places: ['provider'], target: { url: 'https://mizan.ac/mcp', headers: [] }, codeDelivery: 'none',
  model: { use: 'provider', needs: [], minContextTokens: 0 }, egress: ['mizan.ac'], services: [], secrets: [], uses: [], ...change,
});
const pkg = (change = {}) => ({
  schema: 'noah-connect/1', candidateId: 'mcp-registry:ai.2kw/mcp-server', candidateDigest: H, mouth: 'mcp-package', surface: 'terminal',
  places: ['home', 'cloud'], target: { registryType: 'npm', identifier: '@2kw/ai-mcp-server', version: '8.0.3', integrity: null, args: [], env: [] },
  codeDelivery: 'device_allowed', model: { use: 'none', needs: [], minContextTokens: 0 }, egress: [], services: [], secrets: [], uses: [], ...change,
});
const recipe = (change = {}) => ({
  schema: 'noah-connect/1', packageKey: 'catalog:research-8782e21ebeda898af4b7', manifestSha256: H, mouth: 'source', surface: 'terminal',
  places: ['home'], target: { runtime: 'recipe', key: 'goose' }, codeDelivery: 'device_allowed',
  model: { use: 'local', needs: ['qwen2.5:1.5b'], minContextTokens: 0 }, egress: [], services: [], secrets: [], uses: [], ...change,
});
const without = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const code = (value) => {
  try { parseNoahConnect(value); return 'ok'; } catch (error) { assert.ok(error instanceof NoahConnectError, String(error)); return error.code; }
};

test('接続要件: 通る形', () => {
  assert.equal(code(remote()), 'ok');
  assert.equal(code(pkg()), 'ok');
  assert.equal(code(recipe()), 'ok');
  assert.equal(code(remote({ target: { url: 'https://api.example.com/mcp/{tenant}', headers: [{ name: 'Authorization', required: true, secret: true, template: 'Bearer {api_key}' }] }, egress: ['api.example.com'], secrets: ['Authorization', 'URL の tenant'] })), 'ok');
  assert.equal(code(pkg({ target: { registryType: 'pypi', identifier: 'gateco', version: '1.14.0', integrity: `sha256:${H}`, args: ['--transport', 'stdio'], command: 'gateco-mcp', extras: ['mcp'], env: ['GATECO_API_KEY'] } })), 'ok');
  assert.equal(code(pkg({ mouth: 'acp', places: ['home'], model: { use: 'own_account', needs: [], minContextTokens: 0 }, target: { registryType: 'binary', identifier: 'https://github.com/example/agent/releases/download/v1/agent-linux-aarch64.tar.gz', version: '1.0.0', integrity: `sha256:${H}`, args: [], command: './agent', env: [] } })), 'ok');
});

test('接続要件: 拒否する形（規則ごとに 1 つ以上）', () => {
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

test('秘密値の見分け: 当てる物と当てない物', () => {
  for (const s of [FAKE_SK, FAKE_BEARER, FAKE_PAIR, FAKE_HF])
    assert.equal(looksLikeNoahSecret(s), true, s);
  assert.deepEqual([FAKE_SK.length, FAKE_BEARER.length, FAKE_PAIR.length, FAKE_HF.length, FAKE_GHP.length, FAKE_JWT_HEAD.length], [19, 23, 38, 15, 20, 28], '組み立てた値は、前に直に書いていた値と同じ長さ');
  for (const s of ['@modelcontextprotocol/server-memory', 'agent-observatory-sensor.nolimit-observatory.workers.dev', '--transport', 'テスト', '2842d69a', 'abcdefghijklmnopqrstuvwxyzabcdefghijkl'])
    assert.equal(looksLikeNoahSecret(s), false, s);
});

test('hash: 鍵の順が違っても同じ。内容が違えば違う', async () => {
  const a = parseNoahConnect(remote());
  const b = parseNoahConnect(Object.fromEntries(Object.entries(remote()).reverse()));
  assert.equal(await noahConnectSha256(a), await noahConnectSha256(b));
  assert.notEqual(await noahConnectSha256(a), await noahConnectSha256(parseNoahConnect(remote({ try: { input: 'x' } }))));
  assert.equal(canonicalJson({ b: 1, a: [2, { d: undefined, c: 3 }] }), '{"a":[2,{"c":3}],"b":1}');
});

const state = (change = {}) => ({
  signedIn: true, entitlement: 'none', price: { model: 'free' }, hasPaymentMethod: false, devices: [], cloudEnabled: false,
  ownAccountReady: false, grantedServices: [], serviceRegistration: {}, consentedSha256: null, connectSha256: H,
  permissions: ['read_user_input', 'write_results'], preference: 'auto', ...change,
});
const plan = (connect, change) => planNoahConnection(parseNoahConnect(connect), state(change));
const mac = { id: 'dev-mac', place: 'home', online: true };

test('接続計画: 表の全行', () => {
  const oauth = remote({ services: [{ id: 'auth.example.com', method: 'oauth', required: true, purpose: 'Example の許可' }] });
  // row(名前, 接続要件, 本人の状態, 印, タップ, 入力, 置き場所, 足りない物)
  const row = (name, connect, change, ...expected) => ({ name, connect, change, expected });
  const rows = [
    row('鍵の要らない相手のサーバー、L2 済み、サインイン済み', remote(), { intakeLevel: 2 }, 'one_click', 0, 0, 'provider', null),
    row('同じ物、未サインイン', remote(), { intakeLevel: 2, signedIn: false }, 'taps', 1, 0, 'provider', 'サインイン'),
    row('同じ物、L1 まで', remote(), { intakeLevel: 1 }, 'unverified', 0, 0, 'provider', null),
    row('同じ物、L0', remote(), { intakeLevel: 0 }, 'unverified', 0, 0, 'provider', null),
    row('相手の許可が要る、Noah が登録できる', oauth, { intakeLevel: 2, serviceRegistration: { 'auth.example.com': 'available' } }, 'taps', 1, 0, 'provider', 'Example の許可'),
    row('相手の許可が要る、登録できない', oauth, { intakeLevel: 2, serviceRegistration: { 'auth.example.com': 'unavailable' } }, 'setup', 0, 1, 'provider', 'Example の許可'),
    row('相手の許可を既に持っている', oauth, { intakeLevel: 2, grantedServices: ['auth.example.com'] }, 'one_click', 0, 0, 'provider', null),
    row('鍵を貼る header がある', remote({ target: { url: 'https://mizan.ac/mcp', headers: [{ name: 'Authorization', required: true, secret: true }] }, secrets: ['Authorization'] }), { intakeLevel: 2 }, 'setup', 0, 1, 'provider', 'Authorization を入力'),
    row('有料、支払い方法あり', remote(), { intakeLevel: 2, price: { model: 'one_time', amountMinor: 500, currency: 'JPY' }, hasPaymentMethod: true }, 'taps', 2, 0, 'provider', '購入'),
    row('有料、支払い方法なし', remote(), { intakeLevel: 2, price: { model: 'one_time', amountMinor: 500, currency: 'JPY' } }, 'setup', 1, 1, 'provider', '支払い方法の登録'),
    row('有料、購入済み', remote(), { intakeLevel: 2, price: { model: 'one_time', amountMinor: 500, currency: 'JPY' }, entitlement: 'paid', consentedSha256: H }, 'one_click', 0, 0, 'provider', null),
    row('有料、試用中、同意がまだ', remote(), { intakeLevel: 2, price: { model: 'one_time', amountMinor: 500, currency: 'JPY' }, entitlement: 'trial' }, 'taps', 1, 0, 'provider', '権限の確認'),
    row('権限が多い無料の物', remote(), { intakeLevel: 2, permissions: ['read_user_input', 'write_results', 'send_external'] }, 'taps', 1, 0, 'provider', '権限の確認'),
    row('同じ物、前に同意済み', remote(), { intakeLevel: 2, permissions: ['send_external'], consentedSha256: H }, 'one_click', 0, 0, 'provider', null),
    row('今の 13 件、応答中の家の端末あり', recipe(), { devices: [mac] }, 'one_click', 0, 0, 'home', null),
    row('今の 13 件、端末が無い', recipe(), {}, 'setup', 0, 1, 'home', '端末を足す'),
    row('今の 13 件、端末が止まっている', recipe(), { devices: [{ ...mac, online: false }] }, 'setup', 0, 1, 'home', '端末を動かす'),
    row('package、家の端末あり、雲は閉じている', pkg(), { devices: [mac], intakeLevel: 2 }, 'one_click', 0, 0, 'home', null),
    row('package、家の端末なし、雲が開いている', pkg(), { cloudEnabled: true, intakeLevel: 2 }, 'one_click', 0, 0, 'cloud', null),
    row('package、家も雲もある（同数なら家）', pkg(), { devices: [mac], cloudEnabled: true, intakeLevel: 2 }, 'one_click', 0, 0, 'home', null),
    row('package、家が止まっていて雲がある（手数の少ない雲）', pkg(), { devices: [{ ...mac, online: false }], cloudEnabled: true, intakeLevel: 2 }, 'one_click', 0, 0, 'cloud', null),
    row('package、「自分の端末だけ」の希望、家が無い', pkg(), { cloudEnabled: true, preference: 'own_device', intakeLevel: 2 }, 'setup', 0, 1, 'home', '端末を足す'),
    row('package、「雲だけ」の希望', pkg(), { devices: [mac], cloudEnabled: true, preference: 'cloud_only', intakeLevel: 2 }, 'one_click', 0, 0, 'cloud', null),
    row('package、環境変数の鍵が要る', pkg({ target: { ...pkg().target, env: ['AI_2KW_API_KEY'] }, secrets: ['AI_2KW_API_KEY'] }), { devices: [mac], intakeLevel: 2 }, 'setup', 0, 1, 'home', 'AI_2KW_API_KEY を入力'),
    row('本人の契約で動く物、ログイン済み', recipe({ model: { use: 'own_account', needs: [], minContextTokens: 0 } }), { devices: [mac], ownAccountReady: true }, 'one_click', 0, 0, 'home', null),
    row('本人の契約で動く物、未ログイン', recipe({ model: { use: 'own_account', needs: [], minContextTokens: 0 } }), { devices: [mac] }, 'setup', 0, 1, 'home', '提供元のアカウントにログイン'),
    row('作者本人', recipe(), { devices: [mac], entitlement: 'owner', price: { model: 'one_time', amountMinor: 500, currency: 'JPY' }, consentedSha256: H }, 'one_click', 0, 0, 'home', null),
  ];
  for (const { name, connect, change, expected } of rows) {
    const p = plan(connect, change);
    assert.deepEqual([p.badge, p.cost.taps, p.cost.typed, p.place, p.need], expected, name);
    assert.deepEqual(p.steps.map((s) => s.kind).filter((k, i, all) => all.indexOf(k) === i), ['account', 'entitlement', 'place', 'runtime', 'model', 'services', 'secrets', 'consent'], `${name}: 段の順`);
  }
  assert.equal(rows.length, 27);
});

test('接続計画: つなげない物', () => {
  assert.equal(plan(recipe({ surface: 'own-device' }), { devices: [mac] }).badge, 'blocked');
  assert.equal(plan(remote(), { entitlement: 'revoked' }).badge, 'blocked');
  assert.equal(plan(pkg({ places: ['cloud'] }), { devices: [mac] }).badge, 'blocked', '雲だけの物で、雲が閉じている');
  assert.match(plan(pkg({ places: ['cloud'] }), {}).reason, /置き場所/);
});

test('接続計画: 家の端末は、応答している物の先頭を選ぶ。計画の hash は条件が変わると変わる', async () => {
  const devices = [{ id: 'a', place: 'home', online: false }, { id: 'b', place: 'home', online: true }, { id: 'c', place: 'home', online: true }];
  const p = plan(recipe(), { devices });
  assert.equal(p.deviceId, 'b');
  const free = await noahPlanSha256(p, H, { model: 'free' });
  assert.equal(free, await noahPlanSha256(plan(recipe(), { devices }), H, { model: 'free' }));
  assert.notEqual(free, await noahPlanSha256(p, H, { model: 'one_time', amountMinor: 500, currency: 'JPY' }), '価格が変わった');
  assert.notEqual(free, await noahPlanSha256(plan(recipe(), { devices: [devices[2]] }), H, { model: 'free' }), '端末が変わった');
});

test('接続の状態遷移: 全部の組み合わせ', () => {
  const allowed = {
    'planned/entitle_start': 'entitling', 'entitling/entitle_ok': 'preparing', 'entitling/entitle_needs_action': 'needs_action',
    'entitling/entitle_revoked': 'blocked', 'preparing/prepare_ok': 'probing', 'preparing/prepare_needs_action': 'needs_action',
    'preparing/prepare_failed': 'failed', 'probing/probe_ok': 'connected', 'probing/probe_failed': 'failed', 'probing/probe_unknown': 'unknown',
    'needs_action/resume': 'planned', 'connected/tools_changed': 'needs_action', 'connected/revoked': 'blocked', 'failed/retry': 'planned',
    'unknown/reconciled_ok': 'connected', 'unknown/reconciled_failed': 'failed',
  };
  let checked = 0;
  for (const s of NOAH_CONNECTION_STATES) for (const e of NOAH_CONNECTION_EVENTS) {
    const expected = e === 'disconnect' ? (s === 'disconnected' ? null : 'disconnected') : allowed[`${s}/${e}`] ?? null;
    assert.equal(nextNoahConnectionState(s, e), expected, `${s}/${e}`);
    checked++;
  }
  assert.equal(checked, NOAH_CONNECTION_STATES.length * NOAH_CONNECTION_EVENTS.length);
  // 結果不明を、自動でやり直さない
  assert.equal(nextNoahConnectionState('unknown', 'retry'), null);
  // 切った後、止められた後は、どこへも進まない
  for (const e of NOAH_CONNECTION_EVENTS) { assert.equal(nextNoahConnectionState('disconnected', e), null); if (e !== 'disconnect') assert.equal(nextNoahConnectionState('blocked', e), null); }
});

test('更新の差: 聞き直しが要る変化と、要らない変化', () => {
  const base = parseNoahConnect(pkg({ target: { ...pkg().target, integrity: `sha256:${H}` } }));
  const bump = parseNoahConnect(pkg({ target: { ...pkg().target, version: '8.0.4', integrity: `sha256:${'b'.repeat(64)}` } }));
  assert.deepEqual(diffNoahConnect(base, bump), { changed: [], reconsent: false }, '版と hash だけの更新は自動で入る');
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: { ...base.target, integrity: `sha256:${H}` }, egress: ['api.example.com'] }))), { changed: ['egress'], reconsent: true });
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: { ...base.target, args: ['--write'] } }))), { changed: ['target'], reconsent: true });
  assert.deepEqual(diffNoahConnect(base, parseNoahConnect(pkg({ target: base.target, try: { input: 'やあ' } }))), { changed: ['try'], reconsent: false });
});
