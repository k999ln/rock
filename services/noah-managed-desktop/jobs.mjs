import { createHash } from 'node:crypto';

const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
  status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
});
const hash = value => createHash('sha256').update(value).digest('hex');

// A dedicated runner owns this SQLite file. Hold its exclusive lock across
// requests so a second daemon cannot claim an unfinished job after a restart.
export function desktopJobs(db, prepare, packageSha) {
  db.exec(`PRAGMA locking_mode=EXCLUSIVE;
    BEGIN EXCLUSIVE;
    CREATE TABLE IF NOT EXISTS jobs
      (id TEXT PRIMARY KEY, package TEXT NOT NULL, input_hash TEXT, state TEXT NOT NULL, result TEXT);
    UPDATE jobs SET state='unknown' WHERE state IN ('running','stopping');
    COMMIT;`);
  const find = db.prepare('SELECT * FROM jobs WHERE id=?');
  const insert = db.prepare('INSERT INTO jobs (id,package,input_hash,state) VALUES (?,?,?,?)');
  const save = db.prepare('UPDATE jobs SET state=?, result=? WHERE id=?');
  let current;

  function status(job) {
    if (!job) return reply(404);
    if (job.state === 'completed') {
      return reply(200, { id: job.id, result: job.result, report: {
        done: ['専用画面で処理し、結果を取得しました。'], incomplete: [], unverified: [],
      } });
    }
    if (job.state === 'running' || job.state === 'stopping') return reply(202);
    return reply(409, { state: job.state });
  }

  async function execute(job, text) {
    let runtime, result, failure;
    try {
      runtime = await prepare(job.controller.signal);
      job.controller.signal.throwIfAborted();
      const output = await runtime.run(text, job.controller.signal);
      if (output.exitCode !== 0 || typeof output.text !== 'string' || !output.text.trim() ||
          output.text.length > 2048 || output.files?.length) throw Error('Unsupported result');
      result = output.text;
    } catch (error) { failure = error; }
    try { await runtime?.stop(); }
    catch { failure = { unconfirmed: true }; }
    const state = failure?.unconfirmed ? 'unknown' : job.controller.signal.aborted ? 'stopped' :
      failure ? 'failed' : 'completed';
    save.run(state, state === 'completed' ? result : null, job.id);
    current = undefined;
  }

  async function handle(method, id, body) {
    if (!/^[0-9a-f]{64}$/.test(id)) return reply(404);
    const existing = find.get(id);
    if (existing && existing.package !== packageSha) return reply(409);
    if (method === 'GET') return status(existing);
    if (method === 'DELETE') {
      if (!existing) insert.run(id, packageSha, null, 'stopped');
      else if (['completed', 'failed', 'unknown'].includes(existing.state)) return status(existing);
      else if (current?.id === id) {
        const job = current;
        save.run('stopping', null, id);
        job.controller.abort();
        await job.finished;
        if (find.get(id).state === 'unknown') return reply(409);
      }
      return reply(204);
    }
    if (method !== 'PUT') return reply(405);
    if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 500)
      return reply(400);
    const inputHash = hash(body.text);
    if (existing) return existing.input_hash === inputHash ? status(existing) : reply(409);
    if (current) return reply(429);
    insert.run(id, packageSha, inputHash, 'running');
    const job = { id, controller: new AbortController() };
    current = job;
    job.finished = execute(job, body.text);
    return reply(202);
  }
  return { handle };
}
