import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as chatProtocol from '../lib/eve-chat.ts';
import * as local from '../lib/eve-chat-local.ts';
import * as guidance from '../lib/noah-engineering-eve.ts';
import * as intent from '../lib/owner-intent.ts';
const scope = await intent.ownerScopeFor('eve-test');
const plan = { name: '議事録', summary: '担当者のタスクを整理', input: 'メモ', outcome: 'タスク', acceptance: '担当者がある', steps: [{ agentId: null, role: '整理', output: '一覧' }] };
function setup({ saved = [], failedSave = false, failedReply = false, confirm = false } = {}) {
  const storage = new Map(saved.map(c => [c.id, c]));
  const ui = screen({ modules: { '@/lib/noah-engineering-eve': guidance, '@/lib/owner-intent': intent, '@/lib/eve-chat': chatProtocol,
    '@/lib/eve-chat-local': { ...local, eveLocalStore: () => ({ list: async owner => [...storage.values()].filter(c => c.owner === owner), get: async (owner, id) => storage.get(id)?.owner === owner ? storage.get(id) : null, save: async chat => { if (failedSave) throw Error('保存できません'); const next = { ...chat, revision: chat.revision + 1 }; storage.set(chat.id, structuredClone(next)); return next; } }) },
  }, fetch({ method, body, headers, url }) {
    if (method === 'GET') return { body: { ownerScope: scope, available: true } };
    assert.equal(headers[intent.OWNER_SCOPE_HEADER], scope);
    if (url.includes('/drafts/')) { assert.equal(body.content.rights, false); assert.equal(body.content.manifest.name, plan.name); assert.equal('messages' in body.content, false); return { body: {} }; }
    if (failedReply) return { status: 429, body: { error: '利用枠が埋まっています' } };
    if (confirm && !body.confirm) return { status: 409, body: { confirmationRequired: true } };
    return { body: { ownerScope: scope, reply: '案を作りました。', plan, candidates: [] } };
  } });
  return { ui, storage, page: ui.mount('components/noah-engineering-eve.tsx', { emptyDraft: true }) };
}
void test('examples never send; submitted turns persist, follow-up includes plan and explicit draft export excludes chat', async () => {
  const { ui, page, storage } = setup(); await page.flush();
  await page.click('会議メモから担当者別のタスクを作りたい');
  assert.equal(ui.calls.filter(c => c.method === 'POST').length, 0);
  await page.submit(page.find('form')[0]); await page.flush();
  assert.match(page.text(), /案を作りました/); assert.match(page.text(), /まだ確認していません/);
  assert.equal([...storage.values()][0].messages.length, 2);
  await page.change(page.find('textarea')[0], '出力はCSVにしてください');
  await page.submit(page.find('form')[0]); await page.flush();
  const second = ui.calls.filter(c => c.method === 'POST')[1].body;
  assert.equal(second.messages.length, 3); assert.match(second.messages[1].content, /議事録/);
  await page.press(page.find('button', '設計案をNoahの下書きに保存')[0]); await page.flush();
  assert.equal(ui.calls.filter(c => c.method === 'PUT').length, 1); assert.match(ui.visits.at(-1), /engineering\?step=create&draft=/);
  const resumed = setup({ saved: [...storage.values()] }); await resumed.page.flush();
  assert.match(resumed.page.text(), /出力はCSVにしてください/); assert.equal(resumed.ui.calls.filter(c => c.method === 'POST').length, 0);
});
void test('storage failure prevents sending; quota failure preserves question for editing; confirmation is explicit', async () => {
  const blocked = setup({ failedSave: true }); await blocked.page.flush(); await blocked.page.change(blocked.page.find('textarea')[0], 'テスト相談'); await blocked.page.submit(blocked.page.find('form')[0]); await blocked.page.flush();
  assert.equal(blocked.ui.calls.filter(c => c.method === 'POST').length, 0); assert.match(blocked.page.text(), /保存できません/);
  const failed = setup({ failedReply: true }); await failed.page.flush(); await failed.page.change(failed.page.find('textarea')[0], 'テスト相談'); await failed.page.submit(failed.page.find('form')[0]); await failed.page.flush();
  assert.equal(failed.page.find('textarea')[0].props.value, 'テスト相談'); assert.equal([...failed.storage.values()][0].messages[0].content, 'テスト相談');
  const confirmed = setup({ confirm: true }); await confirmed.page.flush(); await confirmed.page.change(confirmed.page.find('textarea')[0], 'テスト相談'); await confirmed.page.submit(confirmed.page.find('form')[0]); await confirmed.page.flush();
  assert.equal(confirmed.page.find('button', '確認して送信').length, 1); await confirmed.page.click('確認して送信'); await confirmed.page.flush();
  assert.equal(confirmed.ui.calls.filter(c => c.method === 'POST').at(-1).body.confirm, true); assert.equal([...confirmed.storage.values()][0].messages.length, 2);
});
