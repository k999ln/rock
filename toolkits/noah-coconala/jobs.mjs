import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { mkdir, open, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

export const site = 'https://coconala.com';
export const maxBytes = 32 * 1024 * 1024;
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const states = {
  preparing: 'ページを確認中',
  sending: '送信結果を確認中',
  completed: 'ココナラ側で確認済み',
  owner_confirmed: '本人がココナラの履歴で送信済みと確認しました。',
  blocked: '送信前に停止。ログイン・入力・対象ページを確認してください。',
  unknown:
    '結果未確認。ココナラの履歴を照合してください。自動再送は停止しました。',
};
export function validId(id) {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
  )
    throw Error('受付番号が不正です。');
  return id;
}
export function validFilename(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > 180 ||
    name.startsWith('.') ||
    /[\\/:\x00-\x1f\x7f]/.test(name)
  )
    throw Error('添付ファイル名が不正です。');
  return name;
}
export function actionInput(kind, args) {
  const extra =
    kind === 'apply'
      ? ['price', 'due']
      : kind === 'deliver'
        ? ['filename', 'sha256']
        : [];
  if (
    !['reply', 'room_reply', 'apply', 'deliver'].includes(kind) ||
    !args ||
    typeof args !== 'object' ||
    Object.keys(args).some(
      (k) => !['requestId', 'target', 'message', ...extra].includes(k),
    )
  )
    throw Error('操作の入力形式を確認してください。');
  validId(args.requestId);
  if (
    typeof args.target !== 'string' ||
    !/^\d{1,20}$/.test(args.target) ||
    typeof args.message !== 'string' ||
    !args.message.trim() ||
    args.message.length > 10000
  )
    throw Error('対象番号と本文を確認してください。');
  const result = { kind, target: args.target, message: args.message.trim() };
  if (kind === 'apply') {
    if (
      !Number.isSafeInteger(args.price) ||
      args.price < 1 ||
      args.price > 99999999 ||
      typeof args.due !== 'string' ||
      !/^\d{4}-\d\d-\d\d$/.test(args.due) ||
      !Number.isFinite(Date.parse(args.due)) ||
      new Date(args.due).toISOString().slice(0, 10) !== args.due
    )
      throw Error('応募金額と納品予定日を確認してください。');
    Object.assign(result, { price: args.price, due: args.due });
  }
  if (kind === 'deliver') {
    if (typeof args.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(args.sha256))
      throw Error('ファイルのSHA-256が不正です。');
    Object.assign(result, {
      filename: validFilename(args.filename),
      sha256: args.sha256,
    });
  }
  return result;
}
export function targetUrl(job) {
  const route = {
    reply: 'mypage/direct_message',
    room_reply: 'talkrooms',
    apply: 'offers/add',
    deliver: 'talkrooms',
  }[job.kind];
  return site + '/' + route + '/' + job.target;
}
export async function stageFile(root, path) {
  const name = validFilename(basename(path));
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let bytes;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
      throw Error('1バイト〜32 MiBの通常ファイルを選んでください。');
    bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead)
        throw Error('ファイルが更新されました。再度選んでください。');
      offset += bytesRead;
    }
    if ((await file.stat()).size !== info.size)
      throw Error('ファイルが更新されました。');
  } finally {
    await file.close();
  }
  const hash = sha(bytes);
  await mkdir(join(root, 'files'), { recursive: true, mode: 0o700 });
  const dest = join(root, 'files', hash);
  try {
    const f = await open(dest, 'wx', 0o600);
    try {
      await f.writeFile(bytes);
    } finally {
      await f.close();
    }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  return { filename: name, sha256: hash };
}
export async function readArtifact(root, job) {
  const f = await open(
    join(root, 'files', job.sha256),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const st = await f.stat();
    if (!st.isFile() || st.size > maxBytes || st.size < 1)
      throw Error('添付を確認できません。');
    const buffer = await f.readFile();
    if (sha(buffer) !== job.sha256) throw Error('添付が変更されています。');
    return { name: job.filename, mimeType: 'application/octet-stream', buffer };
  } finally {
    await f.close();
  }
}

export async function jobStore(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const info = await stat(root);
  if (info.uid !== process.getuid() || info.mode & 0o077)
    throw Error('本人専用の保存先を使用してください。');
  const db = new DatabaseSync(join(root, 'receipts.sqlite'));
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, target_key TEXT NOT NULL,
      state TEXT NOT NULL, pid INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id));`);
  const byReceipt = (id) =>
    db
      .prepare(
        'SELECT j.* FROM jobs j JOIN receipts r ON j.id=r.job_id WHERE r.id=?',
      )
      .get(id);
  const result = (row) => ({
    requestId: row.id,
    state: row.state,
    message: states[row.state],
  });
  const update = (id, state) =>
    db
      .prepare('UPDATE jobs SET state=?, pid=? WHERE id=?')
      .run(state, process.pid, id);
  // Taking a reservation and recording the alias are one transaction, even across connector processes.
  function reserve(receiptId, job) {
    const fingerprint = sha(JSON.stringify(job));
    const targetKey = job.kind + '/' + job.target;
    db.exec('BEGIN IMMEDIATE');
    try {
      const bound = byReceipt(receiptId);
      if (bound && bound.fingerprint !== fingerprint)
        throw Error('同じ受付番号の内容が変更されています。');
      const existing =
        bound ??
        db.prepare('SELECT * FROM jobs WHERE fingerprint=?').get(fingerprint);
      const id = existing?.id ?? receiptId;
      const execute = !existing || existing.state === 'blocked';
      if (execute) {
        const unresolved = db
          .prepare(
            "SELECT id FROM jobs WHERE target_key=? AND state='unknown' AND id<>?",
          )
          .get(targetKey, id);
        if (unresolved)
          throw Error(
            'この対象には結果未確認の操作があります。ココナラの履歴を確認してください。',
          );
        if (
          job.kind === 'apply' &&
          db
            .prepare(
              "SELECT id FROM jobs WHERE target_key=? AND state IN ('completed','owner_confirmed')",
            )
            .get(targetKey)
        )
          throw Error('この案件への応募をすでに確認しています。');
        if (
          db
            .prepare(
              "SELECT id FROM jobs WHERE state IN ('preparing','sending')",
            )
            .get()
        )
          throw Error('別の操作を実行中です。完了後にお試しください。');
        if (existing) update(id, 'preparing');
        else
          db.prepare("INSERT INTO jobs VALUES (?,?,?,'preparing',?)").run(
            id,
            fingerprint,
            targetKey,
            process.pid,
          );
      }
      db.prepare('INSERT OR IGNORE INTO receipts VALUES (?,?)').run(
        receiptId,
        id,
      );
      db.exec('COMMIT');
      return { id, execute };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return {
    status(id) {
      const row = byReceipt(validId(id));
      if (!row) throw Error('このMacに受付記録がありません。');
      return result(row);
    },
    async run(id, job, execute) {
      const reservation = reserve(validId(id), job);
      if (reservation.execute) {
        let sending = false;
        try {
          await execute(job, () => {
            update(reservation.id, 'sending');
            sending = true;
          });
          if (!sending) throw Error('送信操作が記録されていません。');
          update(reservation.id, 'completed');
        } catch {
          update(reservation.id, sending ? 'unknown' : 'blocked');
        }
      }
      return result(byReceipt(id));
    },
    reconcile(id, outcome) {
      const row = byReceipt(validId(id));
      if (
        !row ||
        row.state !== 'unknown' ||
        !['sent', 'not-sent'].includes(outcome)
      )
        throw Error('未確認の受付番号と照合結果を指定してください。');
      const state = outcome === 'sent' ? 'owner_confirmed' : 'blocked';
      const changed = db
        .prepare("UPDATE jobs SET state=? WHERE id=? AND state='unknown'")
        .run(state, row.id);
      if (changed.changes !== 1) throw Error('受付の状態が変更されています。');
      return result(byReceipt(id));
    },
    recover() {
      for (const row of db
        .prepare(
          "SELECT id,pid,state FROM jobs WHERE state IN ('preparing','sending')",
        )
        .all()) {
        try {
          process.kill(row.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH')
            db.prepare(
              'UPDATE jobs SET state=? WHERE id=? AND state=? AND pid=?',
            ).run(
              row.state === 'sending' ? 'unknown' : 'blocked',
              row.id,
              row.state,
              row.pid,
            );
        }
      }
    },
    close() {
      db.close();
    },
  };
}
