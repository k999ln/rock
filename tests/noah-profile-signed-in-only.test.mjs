import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createNoahProfileStore } from '../lib/noah-profile-store.ts';
import { createNoahProfileApi } from '../lib/noah-profile-api.ts';
import { PROFILE_CONSENT_VERSION } from '../lib/noah-profile-contract.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
function fixture(){
  const objects=new Map();let etag=0;
  const bucket={async get(key){const item=objects.get(key);return item?{size:item.text.length,etag:item.etag,text:async()=>item.text}:null;},async put(key,text,options){const old=objects.get(key);if(options?.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options?.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const item={text,etag:String(++etag)};objects.set(key,item);return item;},async delete(key){objects.delete(key);}};
  const keys={active:'v1',keys:{v1:randomBytes(32).toString('hex')}};
  const store=createNoahProfileStore(bucket,keys);
  const authenticate=async r=>{const user=r.headers.get('X-Test-User');if(!user)throw Error('UNAUTHORIZED');return user;};
  const api=createNoahProfileApi({store,authenticate});
  const request=async(body,user='alice',headers={})=>new Request('https://noah.test/api/noah/profile',{method:body?'POST':'GET',headers:{'X-Test-User':user,Origin:'https://noah.test','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor(user),...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {objects,bucket,keys,store,api,request,authenticate};
}

// 使い勝手の確かめ（2026-11-22）の抜け道 S9・本人の判断 Q3: 登録情報に、お金の受取口座と本人確認の書類を、
// ブラウザだけの本人（Cookie の保存先）で置けた。共有の端末では、同じブラウザを使う人が見られる。
// 決め（2026-11-23、本人「好きにしていいよ」）: ブラウザだけの本人には、新しく置かせない。既に置いた物は、読む・消す事だけできる。
// サインインした本人は、今までどおり置ける。
const browser = 'noah-browser:' + 'b'.repeat(64);
const save = (fields, revision) => ({ action: 'fields', revision, consentVersion: PROFILE_CONSENT_VERSION, reuse: true, fields });
const signedInOnly = /お金の受取口座と本人確認の書類は、サインインした本人だけが保存できます。/;

void test('ブラウザだけの本人は、受取口座・本人確認を新しく保存できず、ほかの項目は今までどおり保存できる', async () => {
  const f = fixture();
  for (const fields of [{ bankNumber: '1234567' }, { name: 'Synthetic Bob', bankHolder: 'SYNTHETIC BOB' }, { identityExpiry: '2030-01-01' }]) {
    const refused = await f.api.collection(await f.request(save(fields, 0), browser));
    assert.equal(refused.status, 403, JSON.stringify(fields));
    assert.match((await refused.json()).error, signedInOnly);
  }
  const saved = await f.api.collection(await f.request(save({ name: 'Synthetic Bob', email: 'bob@example.test' }, 0), browser));
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.browserOwned, true);
  assert.deepEqual(body.fields, { name: 'Synthetic Bob', email: 'bob@example.test' });
});

void test('ブラウザだけの本人が前に置いた受取口座は、変えずに残すか、消す事だけできる', async () => {
  const f = fixture();
  // 決めの前に置かれた物（store に直接）。
  await f.store.change(browser, 0, p => ({ ...p, fields: { name: 'Synthetic Bob', bankNumber: '7654321' } }));
  const keep = await f.api.collection(await f.request(save({ name: 'Synthetic Robert', bankNumber: '7654321' }, 1), browser));
  assert.equal(keep.status, 200, '同じ値のまま、ほかの項目を直せる');
  const change = await f.api.collection(await f.request(save({ name: 'Synthetic Robert', bankNumber: '1111111' }, 2), browser));
  assert.equal(change.status, 403, '受取口座を変える事はできない');
  const removed = await f.api.collection(await f.request(save({ name: 'Synthetic Robert' }, 2), browser));
  assert.equal(removed.status, 200, '消す事はできる');
  assert.deepEqual((await removed.json()).fields, { name: 'Synthetic Robert' });
});

void test('ブラウザだけの本人は、本人確認の書類を足せない。サインインした本人は足せる', async () => {
  const f = fixture();
  const upload = async user => f.api.documents(new Request('https://noah.test/api/noah/profile/documents', {
    method: 'POST',
    headers: { 'X-Test-User': user, Origin: 'https://noah.test', 'X-Rock-Owner-Scope': await ownerScopeFor(user), 'Content-Type': 'application/pdf', 'X-Noah-File-Name': 'identity.pdf', 'X-Noah-Profile-Revision': '0', 'X-Noah-Consent-Version': PROFILE_CONSENT_VERSION },
    body: new TextEncoder().encode('%PDF-1.7\nsynthetic'),
  }));
  const refused = await upload(browser);
  assert.equal(refused.status, 403);
  assert.match((await refused.json()).error, signedInOnly);
  assert.equal(f.objects.size, 0, '断った書類は保存先に書かない');
  const accepted = await upload('alice');
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).documents.length, 1);
});

void test('サインインした本人は、受取口座を今までどおり保存できる', async () => {
  const f = fixture();
  const saved = await f.api.collection(await f.request(save({ name: 'Synthetic Alice', bankNumber: '1234567' }, 0), 'alice'));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).fields.bankNumber, '1234567');
});

async function profileScreen(f) {
  const { screen } = await import('./fixtures/noah/screen.mjs');
  const ownerIntent = await import('../lib/owner-intent.ts');
  const ui = screen({ modules: { '@/lib/owner-intent': ownerIntent }, fetch: async r => {
    if (r.url === '/api/noah/profile') { const response = await f.api.collection(await f.request(r.body, browser)); return { status: response.status, body: await response.json() }; }
    if (r.url.startsWith('/api/noah/intake')) return { body: { items: [] } };
    if (r.url.startsWith('/api/noah/registration')) return { body: { providers: [] } };
    throw Error('Unexpected request');
  } });
  const page = ui.mount('components/noah-profile.tsx'); await page.flush();
  return page;
}

void test('登録情報の画面: ブラウザだけの本人には、受取口座・本人確認の入力と書類の追加を出さず、理由を書く', async () => {
  const page = await profileScreen(fixture());
  assert.match(page.text(), /サインインした本人だけ/);
  assert.match(page.text(), signedInOnly);
  const labels = page.find('label').map(n => page.text(n));
  assert.ok(labels.includes('氏名'), '基本情報は今までどおり');
  assert.ok(!labels.some(text => /^(銀行名|口座番号|口座名義|書類の有効期限)/.test(text)), '受取口座・本人確認の入力は出さない');
  assert.equal(page.find('input').filter(n => n.props.type === 'file').length, 0, '書類の追加は出さない');
});

void test('登録情報の画面: 前に置いた受取口座は、書き換えられない形で見せ、「受取口座を消す」で消せる', async () => {
  const f = fixture();
  await f.store.change(browser, 0, p => ({ ...p, fields: { name: 'Synthetic Bob', bankNumber: '7654321' } }));
  const page = await profileScreen(f);
  const number = page.find('label').find(n => page.text(n).startsWith('口座番号'));
  assert.ok(number);
  const input = page.nodes(number).find(n => n.type === 'input');
  assert.equal(input.props.value, '7654321');
  assert.equal(input.props.readOnly, true);
  await page.click('受取口座を消す'); await page.flush();
  const stored = (await f.store.load(browser)).profile.fields;
  assert.deepEqual(stored, { name: 'Synthetic Bob' });
});
