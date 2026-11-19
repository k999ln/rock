import path from 'node:path';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { NOAH_MODELS, noahModel } from '../lib/noah-model-catalog.mjs';
import { InstallError } from './noah-source-fetch.mjs';
import { deriveModelTemplate } from './noah-model-template.mjs';

const BASE = 'http://127.0.0.1:11434';
const managers = new Map();
export function getNoahModelManager(root) {
  root = path.resolve(root);
  if (!managers.has(root))
    managers.set(
      root,
      createNoahModelManager({ root }).catch((e) => {
        managers.delete(root);
        throw e;
      }),
    );
  return managers.get(root);
}
export async function closeNoahModelManager(root) {
  root = path.resolve(root);
  const pending = managers.get(root);
  if (!pending) return;
  try {
    await (await pending).close();
  } finally {
    if (managers.get(root) === pending) managers.delete(root);
  }
}
export async function createNoahModelManager({ root, fetcher = fetch } = {}) {
  const directory = path.join(root, 'work/runtime-state/noah-models');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const guard = path.join(directory, 'manager.lock'),
    token = randomUUID();
  try {
    const f = await open(guard, 'wx', 0o600);
    await f.writeFile(JSON.stringify({ pid: process.pid, token }));
    await f.close();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const lock = await open(guard, constants.O_RDONLY | constants.O_NOFOLLOW);
    let previous;
    try {
      if (!(await lock.stat()).isFile()) throw new InstallError('モデル管理のロックを確認してください。', 503);
      previous = JSON.parse(await lock.readFile('utf8'));
    } finally { await lock.close(); }
    if (!Number.isInteger(previous.pid) || previous.pid < 1)
      throw new InstallError('モデル管理の保存領域を確認してください。', 503);
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') alive = false;
      else throw error;
    }
    if (alive)
      throw new InstallError(
        'この保存先のモデル管理は別のNoahが使用中です。',
        409,
      );
    await unlink(guard);
    return createNoahModelManager({ root, fetcher });
  }
  const file = path.join(directory, 'state.json');
  let records = {};
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (
      saved.schema !== 1 ||
      !saved.models ||
      typeof saved.models !== 'object' ||
      Array.isArray(saved.models)
    )
      throw new Error('invalid model state');
    records = saved.models;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      await unlink(guard);
      throw e;
    }
  }
  const namespace = createHash('sha256')
    .update(path.resolve(root))
    .digest('hex')
    .slice(0, 16);
  const alias = (m) =>
    `noah-${namespace}/${m.id.replace(':', '-')}:${m.digest.slice(0, 16)}`;
  let writing = Promise.resolve(),
    closed = false;
  const jobs = new Map(),
    leases = new Map(),
    deleting = new Set();
  for (const m of NOAH_MODELS)
    if (
      records[m.id] &&
      ['preparing', 'removing'].includes(records[m.id].state)
    )
      records[m.id] = {
        ...records[m.id],
        state: 'interrupted',
        message: '前回の操作が中断しました。状態を確認して再試行してください。',
      };
  async function save(m, state, message, extra = {}) {
    const task = writing.then(async () => {
      const next = {
        ...records,
        [m.id]: {
          id: m.id,
          digest: m.digest,
          alias: alias(m),
          state,
          message,
          ...extra,
        },
      };
      const tmp = file + '.' + randomUUID();
      await writeFile(tmp, JSON.stringify({ schema: 1, models: next }), {
        mode: 0o600,
      });
      await rename(tmp, file);
      const f = await open(file, 'r');
      try {
        await f.sync();
      } finally {
        await f.close();
      }
      records = next;
    });
    writing = task.catch(() => {});
    await task;
  }
  async function request(
    endpoint,
    { method = 'GET', body, signal, timeout = 10000 } = {},
  ) {
    const r = await fetcher(BASE + endpoint, {
      method,
      redirect: 'error',
      signal: AbortSignal.any([
        ...(signal ? [signal] : []),
        AbortSignal.timeout(timeout),
      ]),
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (!r.ok)
      throw new InstallError(
        r.status === 404
          ? 'モデルが見つかりません。'
          : 'Ollamaのモデル処理に失敗しました。保存容量と起動状態を確認してください。',
        503,
      );
    return r;
  }
  async function boundedJson(r) {
    if (!r.body) throw new InstallError('モデルの応答がありません。', 503);
    const reader = r.body.getReader(),
      chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 131072)
          throw new InstallError('モデル一覧が大きすぎます。', 503);
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  }
  async function inventory(endpoint = '/api/tags') {
    const data = await boundedJson(await request(endpoint));
    if (!Array.isArray(data.models) || data.models.length > 100)
      throw new InstallError('モデル一覧を確認できません。', 503);
    return data.models;
  }
  const verified = (rows, name, m) =>
    rows.some(
      (r) => r.name === name && r.digest === m.digest && r.size === m.bytes,
    );
  async function validate(m) {
    if (!verified(await inventory(), alias(m), m))
      throw new InstallError(
        'モデルの版が変更・削除されました。モデル管理から準備し直してください。',
        409,
      );
  }
  async function pull(m, signal) {
    const r = await request('/api/pull', {
      method: 'POST',
      body: { model: m.id, stream: true },
      signal,
      timeout: 1800000,
    });
    const reader = r.body?.getReader();
    if (!reader) throw new InstallError('モデル取得の応答がありません。', 503);
    let buffer = '',
      size = 0,
      success = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16 * 1024 * 1024)
          throw new InstallError('モデル取得の応答が上限を超えました。', 503);
        buffer += Buffer.from(value).toString();
        let n;
        while ((n = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, n);
          buffer = buffer.slice(n + 1);
          if (!line.trim()) continue;
          const v = JSON.parse(line);
          if (v.error)
            throw new InstallError(
              'モデルを取得できません。保存容量と通信を確認して再試行してください。',
              503,
            );
          if (v.status === 'success') success = true;
          if (
            Number.isSafeInteger(v.total) &&
            Number.isSafeInteger(v.completed) &&
            v.total >= 0 &&
            v.total <= m.bytes + 1048576 &&
            v.completed >= 0 &&
            v.completed <= v.total
          )
            records[m.id] = {
              ...records[m.id],
              completed: v.completed,
              total: v.total,
            };
        }
        if (buffer.length > 16384)
          throw new InstallError('モデル取得の応答を確認できません。', 503);
      }
      if (buffer.trim()) {
        const v = JSON.parse(buffer);
        if (v.error) throw new Error('pull failed');
        success ||= v.status === 'success';
      }
      if (!success)
        throw new InstallError('モデル取得の完了を確認できません。', 503);
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  const api = {
    async list() {
      const rows = await inventory();
      return NOAH_MODELS.map((m) => {
        const prepared = verified(rows, alias(m), m);
        const stale = records[m.id]?.state === 'ready' && !prepared;
        return {
          ...m,
          alias: alias(m),
          prepared,
          sourceAvailable: m.derivedFrom
            ? verified(rows, m.derivedFrom.id, noahModel(m.derivedFrom.id))
            : verified(rows, m.id, m),
          state: jobs.has(m.id)
            ? 'preparing'
            : deleting.has(m.id)
              ? 'removing'
              : stale
                ? 'interrupted'
                : records[m.id]?.state || 'absent',
          message: stale
            ? 'モデルが変更・削除されました。準備状態を確認してください。'
            : records[m.id]?.message || '',
          completed: records[m.id]?.completed,
          total: records[m.id]?.total,
          connections: leases.get(m.id) || 0,
        };
      });
    },
    async prepare(id, signal) {
      signal?.throwIfAborted();
      const m = noahModel(id);
      if (!m) throw new InstallError('対応するモデルを選んでください。', 400);
      if (closed || deleting.has(id))
        throw new InstallError('モデルを停止・削除中です。', 409);
      if (!jobs.has(id)) {
        const controller = new AbortController(),
          job = { controller, promise: null };
        jobs.set(id, job);
        job.promise = (async () => {
          try {
            await save(m, 'preparing', '必要なモデルを裏側で準備しています。');
            let rows = await inventory();
            if (verified(rows, alias(m), m)) {
              await save(m, 'ready', '固定したモデルを使えます。');
              return;
            }
            if (rows.some((r) => r.name === alias(m)))
              throw new InstallError(
                'Noah用モデルの内容が一致しません。変更された版を自動上書きしません。',
                409,
              );
            if (m.derivedFrom) {
              const source = noahModel(m.derivedFrom.id);
              if (!source || source.derivedFrom)
                throw new InstallError('修正版の基底モデルを確認できません。', 409);
              // Reuse preparation and its lease, so preparing both versions
              // cannot duplicate the download or race deletion of our base ref.
              const base = await api.acquire(source.id, controller.signal);
              try {
                if (!verified(await inventory(), source.id, source))
                  throw new InstallError('元モデルの版が変わりました。', 409);
                const shown = await boundedJson(await request('/api/show', {
                  method: 'POST', body: { model: source.id }, signal: controller.signal,
                }));
                const template = deriveModelTemplate(m, shown.template);
                const created = await boundedJson(await request('/api/create', {
                  method: 'POST',
                  body: { from: source.id, model: alias(m), template, stream: false },
                  signal: controller.signal, timeout: 60000,
                }));
                if (created.status !== 'success')
                  throw new InstallError('モデルのTool修正版の準備を確認できません。', 503);
                await validate(m);
                controller.signal.throwIfAborted();
                await save(m, 'ready', '元モデルを残して、Tool接続版を準備しました。');
                return;
              } finally { base.release(); }
            }
            if (!rows.some((r) => r.name === m.id)) {
              await pull(m, controller.signal);
              rows = await inventory();
            }
            if (!verified(rows, m.id, m))
              throw new InstallError(
                '配布元のモデルが確認済みの版と異なります。自動更新せず停止しました。',
                409,
              );
            controller.signal.throwIfAborted();
            await request('/api/copy', {
              method: 'POST',
              body: { source: m.id, destination: alias(m) },
              signal: controller.signal,
            });
            await validate(m);
            controller.signal.throwIfAborted();
            await save(m, 'ready', '固定したモデルを使えます。');
          } catch (e) {
            await save(
              m,
              'failed',
              e instanceof InstallError
                ? e.message
                : '準備を中断しました。再試行してください。',
            ).catch(() => {});
            throw e;
          } finally {
            if (jobs.get(id) === job) jobs.delete(id);
          }
        })();
        job.promise.catch(() => {});
      }
      const promise = jobs.get(id).promise;
      if (!signal) return promise;
      signal.throwIfAborted();
      let abort;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => {
            abort = () => reject(signal.reason);
            signal.addEventListener('abort', abort, { once: true });
          }),
        ]);
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
    async acquire(id, signal) {
      const m = noahModel(id);
      if (!m) throw new InstallError('モデルを確認してください。', 400);
      if (closed || deleting.has(id))
        throw new InstallError(
          'モデルの削除が終わってから接続してください。',
          409,
        );
      leases.set(id, (leases.get(id) || 0) + 1);
      let released = false;
      const release = () => {
        if (!released) {
          released = true;
          leases.set(id, Math.max(0, (leases.get(id) || 1) - 1));
        }
      };
      try {
        await api.prepare(id, signal);
        return {
          model: alias(m),
          digest: m.digest,
          validate: () => validate(m),
          release,
        };
      } catch (e) {
        release();
        throw e;
      }
    },
    async remove(id, expectedDigest, references) {
      const m = noahModel(id);
      if (!m || expectedDigest !== m.digest)
        throw new InstallError('削除するモデルの版を確認してください。', 409);
      if (
        closed ||
        jobs.has(id) ||
        deleting.has(id) ||
        (leases.get(id) || 0) > 0
      )
        throw new InstallError(
          'このモデルを準備中または接続中のAgentがあります。先に停止してください。',
          409,
        );
      deleting.add(id);
      try {
        if ((await references(id)).length)
          throw new InstallError(
            'このモデルを使うAgent・仕事・運用が残っています。参照先を確認してください。',
            409,
          );
        const rows = await inventory(),
          name = alias(m);
        if (!rows.some((r) => r.name === name)) {
          await save(m, 'removed', 'Noah用のモデルを削除しました。');
          return;
        }
        if (!verified(rows, name, m))
          throw new InstallError('削除するモデルの内容が変わりました。', 409);
        if ((await inventory('/api/ps')).some((r) => r.name === name))
          throw new InstallError(
            'モデルが処理中です。終了してから削除してください。',
            409,
          );
        await save(m, 'removing', 'Noah用のモデルを削除しています。');
        await request('/api/delete', {
          method: 'DELETE',
          body: { model: name },
        });
        if ((await inventory()).some((r) => r.name === name))
          throw new InstallError('削除の完了を確認できません。', 503);
        await save(
          m,
          'removed',
          'Noah用のモデルを削除しました。本人の元モデルと成果は残っています。',
        );
      } catch (e) {
        if (records[id]?.state === 'removing')
          await save(
            m,
            'interrupted',
            '削除結果を確認できません。状態を再確認してください。',
          ).catch(() => {});
        throw e;
      } finally {
        deleting.delete(id);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const j of jobs.values()) j.controller.abort();
      await Promise.allSettled([...jobs.values()].map((j) => j.promise));
      await writing;
      const own = JSON.parse(await readFile(guard, 'utf8'));
      if (own.token === token) await unlink(guard);
    },
  };
  return api;
}
