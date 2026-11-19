import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NOAH_TEST_MANIFEST_SHA256 } from '../lib/noah-local-connection.ts';

export function createTextCheckAdapter({ timeoutMs = 3000, runnerPath = fileURLToPath(new URL('./noah-test-agent.mjs', import.meta.url)) } = {}) {
  return {
    id: 'text-check/1', manifestSha256: NOAH_TEST_MANIFEST_SHA256,
    async start() {
      const child = fork(runnerPath, [], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [], env: { NODE_NO_WARNINGS: '1' },
      });
      const pending = new Map();
      const fail = () => { for (const waiter of pending.values()) waiter.reject(new Error('テストAgentとの接続が切れました。再接続してください。')); pending.clear(); };
      child.on('exit', fail); child.on('error', fail);
      child.on('message', message => {
        const waiter = pending.get(message?.id); if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error('テスト処理に失敗しました。')); else waiter.resolve(message.result);
      });
      function request(method, input) {
        return new Promise((resolve, reject) => {
          if (!child.connected || child.exitCode !== null || child.signalCode !== null) return reject(new Error('テストAgentが停止しています。再接続してください。'));
          const id = randomUUID();
          const timer = setTimeout(() => { pending.delete(id); reject(new Error('テストAgentの応答が時間内に届きませんでした。')); }, timeoutMs);
          pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
          child.send({ id, method, input }, error => { if (error) { const waiter = pending.get(id); pending.delete(id); waiter?.reject(error); } });
        });
      }
      return { child, request };
    },
    async probe(handle) {
      const nonce = randomUUID(), result = await handle.request('probe', { nonce });
      if (result?.protocol !== 'noah-text-check/1' || result.nonce !== nonce) throw new Error('接続先の応答を確認できません。');
    },
    async run(handle, input) { return handle.request('run', input); },
    async stop(handle) {
      const child = handle.child;
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
      await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
    },
  };
}
export function noahConnectionAdapters(root) { return [createTextCheckAdapter({ runnerPath: path.join(root, 'scripts/noah-test-agent.mjs') })]; }
