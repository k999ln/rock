import { localAgents, agentCommand, gameTasks } from './agents.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { createWorkJob, updateComposedWork, applyWorkCommand } from '../../lib/workflow.ts';
import { executeCompositionNode } from '../../lib/work-composition-executor.ts';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function check(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
const text = (value, max) => {
  check(typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= max, `本文は1〜${max} bytesです。`);
  return value.trim();
};
const uuid = value => check(typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value), '操作IDが不正です。');
export class BridgeStore {
  constructor(path, binding, clock = Date.now) {
    this.binding = Object.freeze({ ...binding });
    this.clock = clock;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS bridge_state(owner TEXT PRIMARY KEY, body TEXT NOT NULL);');
    this.queue = Promise.resolve();
  }
  read(owner) {
    const row = this.db.prepare('SELECT body FROM bridge_state WHERE owner=?').get(owner);
    const state = row ? JSON.parse(row.body) : { version: 1, binding: this.binding, revision: 0, cards: [], operations: {} };
    check(state.version === 1 && digest(state.binding) === digest(this.binding), '接続条件が変わりました。旧保存先を保持して別の保存先で開始してください。', 409);
    return state;
  }
  snapshot(owner) {
    const { operations: _operations, ...state } = this.read(owner);
    return { ...state, agents: [...localAgents,...(state.customAgents ?? [])], tasks: state.tasks ?? [], cards: state.cards.map(card => ({ ...card, expired: card.expiresAt !== null && this.clock() >= card.expiresAt })) };
  }
  command(owner, actor, input) {
    const operation = this.queue.then(() => this.apply(owner, actor, input));
    this.queue = operation.catch(() => {});
    return operation;
  }
  async apply(owner, actor, input) {
    check(typeof owner === 'string' && owner.length > 0, '本人未確認', 401);
    check(actor === 'os' || actor === 'game', '接続元が不正です。', 403);
    check(input && typeof input === 'object' && !Array.isArray(input), '入力が不正です。');
    const keys = ['id', 'action', 'revision', 'cardId', 'text', 'hash', 'binding', 'agent', 'agentId', 'objective', 'taskId'];
    check(Object.keys(input).every(key => keys.includes(key)), '未対応の入力です。');
    uuid(input.id);
    const state = this.read(owner);
    check(digest(input.binding) === digest(this.binding), '接続先が一致しません。', 403);
    const fingerprint = digest({ actor, input });
    const duplicate = state.operations[input.id];
    if (duplicate) {
      check(duplicate === fingerprint, '同じ操作IDの内容が変わっています。', 409);
      return this.snapshot(owner);
    }
    check(input.revision === state.revision, '別の操作で更新されました。更新して再操作してください。', 409);
    check(Object.keys(state.operations).length < 1000, '試験履歴上限です。保存先を分けてください。', 409);
    const now = this.clock();
    const card = state.cards.find(item => item.id === input.cardId);
    if (typeof input.action === 'string' && input.action.startsWith('agent_')) {
      await agentCommand(state, actor, input, now);
    } else if (input.action === 'draft') {
      check(state.cards.length < 100, 'カード上限です。', 409);
      state.cards.push({ id: input.id, text: text(input.text, 4096), origin: actor, status: 'draft', hash: null, expiresAt: null, job: null, receipt: null });
    } else {
      check(card, 'カードが見つかりません。', 404);
      if (input.action === 'publish') {
        check(actor === 'os' && card.status === 'draft', '現実側で未送信カードを承認してください。', 403);
        check(!state.cards.some(item => item.status === 'sent' && item.expiresAt > now), '先のカードを確認または停止してください。', 409);
        card.expiresAt = now + 300_000;
        card.hash = digest({ version: 1, id: card.id, text: card.text, binding: this.binding, expiresAt: card.expiresAt });
        const job = createWorkJob({ id: card.id, title: 'ゲーム境界カードの確認', templateId: 'composition', plan: {
          version: 1, objective: '承認したカードを対象playerへ渡し、同じ内容の確認を受け取る', acceptance: '本文の検査とゲーム側の確認後、現実側で検収', inputKind: 'text', budgetMinor: 0, currency: 'JPY', deadline: '',
          nodes: [{ id: 's1', tool: 'compose-check', inputs: ['source'], config: { minChars: 1, requiredText: [] } }],
        } }, new Date(now).toISOString());
        const result = await executeCompositionNode(job.composition, job.composition.plan.nodes[0], card.text);
        card.job = updateComposedWork(job, { id: randomUUID(), fingerprint: card.hash, revision: job.revision, action: 'run', stepId: 's1', source: card.text, result }, new Date(now).toISOString());
        card.status = 'sent';
      } else if (input.action === 'observe') {
        check(actor === 'game', 'ゲーム側だけが確認を返せます。', 403);
        check(card.status === 'sent' && now < card.expiresAt, '期限切れ、停止済み、または確認済みです。', 409);
        check(input.hash === card.hash, '表示内容のhashが一致しません。', 409);
        card.receipt = { id: input.id, hash: card.hash, binding: this.binding, at: new Date(now).toISOString(), evidence: this.binding.mode === 'fixture' ? 'host_fixture_confirmation' : 'fivem_player_confirmation_unaccepted' };
        card.status = 'observed';
      } else if (input.action === 'complete') {
        check(actor === 'os' && card.status === 'observed' && card.receipt?.hash === card.hash, '同一カードの確認後、現実側で検収してください。', 409);
        card.job = applyWorkCommand(card.job, { id: input.id, action: 'complete', note: '接続先と同一hashの確認記録を検収（環境区分はreceiptを参照）' }, card.job.revision, new Date(now).toISOString());
        card.status = 'completed';
      } else if (input.action === 'cancel') {
        check(actor === 'os' && !['completed', 'cancelled'].includes(card.status), '停止できません。', 409);
        if (card.job) card.job = applyWorkCommand(card.job, { id: input.id, action: 'cancel' }, card.job.revision, new Date(now).toISOString());
        card.status = 'cancelled';
      } else check(false, 'この操作は許可されていません。', 403);
    }
    state.operations[input.id] = fingerprint;
    state.revision += 1;
    this.db.prepare('INSERT INTO bridge_state(owner,body) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body').run(owner, JSON.stringify(state));
    return this.snapshot(owner);
  }
  gameSnapshot(owner) {
    const state = this.snapshot(owner);
    return { version: state.version, revision: state.revision, binding: state.binding, agents: state.agents.map(({id,name,description,kind,price})=>({id,name,description,kind,price})), tasks: gameTasks(state.tasks), cards: state.cards.filter(card => card.status === 'sent' && !card.expired).map(({ id, text, hash, expiresAt, status }) => ({ id, text, hash, expiresAt, status })) };
  }
  close() { this.db.close(); }
}
