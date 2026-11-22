import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { validId } from './jobs.mjs';

const interval = 15 * 60_000;
const worker = fileURLToPath(new URL('./anicca/read_only.py', import.meta.url));
export function runPass(input, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Error('停止しました。'));
    const child = spawn('python3', ['-E', '-s', '-B', worker], {
      shell: false,
      env: { PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const kill = () => child.kill('SIGKILL');
    const timeout = setTimeout(kill, 230_000);
    signal.addEventListener('abort', kill, { once: true });
    let data = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      data += chunk;
      if (data.length > 64_000) kill();
    });
    child.stdin.on('error', () => {});
    child.on('error', () => reject(Error('Macで python3 を起動できません。')));
    child.on('close', (code) => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', kill);
      try {
        if (code !== 0 || signal.aborted)
          throw Error('読み取りを中断しました。');
        const result = JSON.parse(data);
        if (result.error) throw Error(result.error);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.write(JSON.stringify(input) + '\n');
  });
}

export function draftRunner(path, pass = runPass, delay = interval) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, state TEXT NOT NULL, pass INTEGER NOT NULL DEFAULT 0,
      scanned INTEGER NOT NULL DEFAULT 0, next_at INTEGER, note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS drafts (run_id TEXT NOT NULL, listing TEXT NOT NULL, title TEXT NOT NULL,
      reason TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(run_id, listing));
    UPDATE runs SET state='interrupted',next_at=NULL WHERE state IN ('scanning','waiting','stopping');`);
  let active;
  function status(id) {
    const run = db
      .prepare(
        'SELECT state,pass,scanned,next_at AS nextAt,note FROM runs WHERE id=?',
      )
      .get(validId(id));
    if (!run) throw Error('このMacに実行記録がありません。');
    const drafts = db
      .prepare(
        'SELECT listing AS listingId,title,reason,body FROM drafts WHERE run_id=? ORDER BY rowid DESC LIMIT 10',
      )
      .all(id);
    return { ...run, requestId: id, drafts };
  }
  async function cycle(job) {
    const { id, controller } = job;
    const prior = db.prepare('SELECT pass FROM runs WHERE id=?').get(id);
    db.prepare("UPDATE runs SET state='scanning',next_at=NULL WHERE id=?").run(
      id,
    );
    try {
      const seen = db
        .prepare(
          'SELECT listing FROM drafts WHERE run_id=? ORDER BY rowid DESC LIMIT 300',
        )
        .all(id)
        .map((row) => row.listing);
      const result = await pass({ seen, turn: prior.pass }, controller.signal);
      if (controller.signal.aborted) return;
      if (
        !Number.isSafeInteger(result.scanned) ||
        !Array.isArray(result.drafts)
      )
        throw Error('募集の読み取り結果が不正です。');
      db.exec('BEGIN');
      try {
        for (const draft of result.drafts) {
          if (
            !/^[1-9][0-9]{0,14}$/.test(draft.listingId) ||
            !['title', 'reason', 'body'].every(
              (k) =>
                typeof draft[k] === 'string' &&
                draft[k].length > 0 &&
                draft[k].length <= 3500,
            )
          )
            throw Error('下書きの形式が不正です。');
          db.prepare('INSERT OR IGNORE INTO drafts VALUES (?,?,?,?,?)').run(
            id,
            draft.listingId,
            draft.title,
            draft.reason,
            draft.body,
          );
        }
        db.prepare("UPDATE runs SET scanned=?,note='' WHERE id=?").run(
          result.scanned,
          id,
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      db.prepare('UPDATE runs SET note=? WHERE id=?').run(
        String(error.message).slice(0, 200),
        id,
      );
    }
    db.prepare(
      "UPDATE runs SET state='waiting',pass=pass+1,next_at=? WHERE id=?",
    ).run(Date.now() + delay, id);
    job.timer = setTimeout(() => {
      job.running = cycle(job);
    }, delay);
  }
  function start(id) {
    validId(id);
    if (db.prepare('SELECT 1 FROM runs WHERE id=?').get(id)) return status(id);
    if (active)
      throw Error('このMacでAgentが実行中です。先に停止してください。');
    db.prepare("INSERT INTO runs(id,state) VALUES (?,'scanning')").run(id);
    active = { id, controller: new AbortController(), timer: null };
    active.running = cycle(active);
    return status(id);
  }
  async function stop(id) {
    validId(id);
    const job = active;
    if (job?.id === id) {
      clearTimeout(job.timer);
      db.prepare(
        "UPDATE runs SET state='stopping',next_at=NULL WHERE id=?",
      ).run(id);
      job.controller.abort();
      await job.running;
      db.prepare("UPDATE runs SET state='stopped',next_at=NULL WHERE id=?").run(
        id,
      );
      if (active === job) active = undefined;
    }
    return status(id);
  }
  return {
    start,
    status,
    stop,
    async close() {
      if (active) await stop(active.id);
      db.close();
    },
  };
}
