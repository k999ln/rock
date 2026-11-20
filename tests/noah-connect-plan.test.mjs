import test from 'node:test';
import assert from 'node:assert/strict';
import { H, remote, pkg, recipe } from './fixtures/noah/connect.mjs';
import { parseNoahConnect } from '../lib/noah-connect-requirements.ts';
import { NOAH_CONNECTION_EVENTS, NOAH_CONNECTION_STATES, nextNoahConnectionState, noahPlanSha256, planNoahConnection } from '../lib/noah-connect-plan.ts';

const state = (change = {}) => ({
  signedIn: true, entitlement: 'none', price: { model: 'free' }, hasPaymentMethod: false, devices: [], cloudEnabled: false,
  ownAccountReady: false, grantedServices: [], serviceRegistration: {}, consentedSha256: null, connectSha256: H,
  permissions: ['read_user_input', 'write_results'], preference: 'auto', ...change,
});
const plan = (connect, change) => planNoahConnection(parseNoahConnect(connect), state(change));
const mac = { id: 'dev-mac', place: 'home', online: true };

void test('接続計画: 表の全行', () => {
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

void test('接続計画: つなげない物', () => {
  assert.equal(plan(recipe({ surface: 'own-device' }), { devices: [mac] }).badge, 'blocked');
  assert.equal(plan(remote(), { entitlement: 'revoked' }).badge, 'blocked');
  assert.equal(plan(pkg({ places: ['cloud'] }), { devices: [mac] }).badge, 'blocked', '雲だけの物で、雲が閉じている');
  assert.match(plan(pkg({ places: ['cloud'] }), {}).reason, /置き場所/);
});

void test('接続計画: 家の端末は、応答している物の先頭を選ぶ。計画の hash は条件が変わると変わる', async () => {
  const devices = [{ id: 'a', place: 'home', online: false }, { id: 'b', place: 'home', online: true }, { id: 'c', place: 'home', online: true }];
  const p = plan(recipe(), { devices });
  assert.equal(p.deviceId, 'b');
  const free = await noahPlanSha256(p, H, { model: 'free' });
  assert.equal(free, await noahPlanSha256(plan(recipe(), { devices }), H, { model: 'free' }));
  assert.notEqual(free, await noahPlanSha256(p, H, { model: 'one_time', amountMinor: 500, currency: 'JPY' }), '価格が変わった');
  assert.notEqual(free, await noahPlanSha256(plan(recipe(), { devices: [devices[2]] }), H, { model: 'free' }), '端末が変わった');
});

void test('接続の状態遷移: 全部の組み合わせ', () => {
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

