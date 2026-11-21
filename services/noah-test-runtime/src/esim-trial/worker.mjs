// Local Workers fixture. The application does not mount this worker on a public route.
import {
  PACKAGE,
  DELAY_MS,
  regions,
  goods,
  acceptGuideResult,
  usableSource,
  withinFreeTrialBudget,
} from './guide.mjs';
async function executionId(owner, id) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([owner, id])),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
const json = (value, status = 200) => Response.json(value, { status });
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sameLine = (job, permit) =>
  permit.active &&
  job.enrollment === permit.enrollment &&
  job.device === permit.device;

export default {
  async fetch(request, env) {
    if (
      request.method !== 'POST' ||
      !env.BRIDGE ||
      request.headers.get('Authorization') !== 'Bearer ' + env.BRIDGE
    )
      return json({ error: '試験用の入口から開いてください。' }, 403);
    const owner = request.headers.get('X-Trial-Owner');
    if (!owner || !/^[a-zA-Z0-9._:-]{1,128}$/.test(owner))
      return json({ error: '本人を確認できません。' }, 400);
    return env.JOBS.get(env.JOBS.idFromName(owner)).fetch(request);
  },
};
export class TrialJobs {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS jobs(
      id TEXT PRIMARY KEY,owner TEXT NOT NULL,enrollment TEXT NOT NULL,device TEXT NOT NULL,
      package TEXT NOT NULL,region TEXT NOT NULL,item TEXT NOT NULL,budget INTEGER NOT NULL CHECK(budget=0),
      approved INTEGER NOT NULL,due INTEGER NOT NULL,state TEXT NOT NULL,result TEXT,completed INTEGER);
      CREATE UNIQUE INDEX IF NOT EXISTS trial_active_run ON jobs(owner) WHERE state IN ('scheduled','running');
      CREATE TABLE IF NOT EXISTS dispatches(job TEXT PRIMARY KEY,input TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(job TEXT PRIMARY KEY,runs INTEGER NOT NULL CHECK(runs=1),
        yen INTEGER NOT NULL CHECK(yen=0),read_at INTEGER);`);
  }
  one(query, ...args) {
    return this.sql.exec(query, ...args).toArray()[0];
  }
  pending() {
    return this.one(
      "SELECT * FROM jobs WHERE state IN ('scheduled','running') LIMIT 1",
    );
  }
  async permit(owner) {
    const response = await this.env.LINE.fetch(
      'https://fixture.invalid/permit',
      { method: 'POST', body: owner },
    );
    if (!response.ok) throw Error('試験用回線を照合できませんでした。');
    return response.json();
  }
  async arm(due, now) {
    await this.ctx.storage.setAlarm(Date.now() + Math.max(1, due - now));
  }
  // One owner has at most one scheduled job. The same ID can be retried after completion or stop.
  async approve(owner, input) {
    if (
      typeof input.id !== 'string' ||
      !uuid.test(input.id) ||
      !Object.hasOwn(regions, input.region) ||
      !Object.hasOwn(goods, input.item)
    )
      return json({ error: '地域と品目を選んでください。' }, 400);
    const permit = await this.permit(owner);
    if (!permit.active)
      return json({ error: '専用回線と利用期限を確認してください。' }, 403);
    const previous = this.one('SELECT * FROM jobs WHERE id=?', input.id);
    if (previous) {
      if (
        previous.owner !== owner ||
        previous.item !== input.item ||
        previous.region !== input.region
      )
        return json({ error: 'この申込は別の内容で保存済みです。' }, 409);
      if (['scheduled', 'running'].includes(previous.state))
        await this.arm(previous.due, permit.now);
      return json({ accepted: true });
    }
    if (!withinFreeTrialBudget(permit.quote))
      return json(
        { error: '利用者と運営の両方の実行費用を0円と確認できません。' },
        409,
      );
    if (permit.expires <= permit.now + DELAY_MS)
      return json({ error: '試験の利用期限までに実行できません。' }, 403);
    if (this.pending())
      return json({ error: '予定済みの仕事があります。' }, 409);
    const due = permit.now + DELAY_MS;
    this.sql.exec(
      `INSERT INTO jobs(id,owner,enrollment,device,package,region,item,budget,approved,due,state)
      VALUES(?,?,?,?,?,?,?,0,?,?,'scheduled')`,
      input.id,
      owner,
      permit.enrollment,
      permit.device,
      PACKAGE,
      input.region,
      input.item,
      permit.now,
      due,
    );
    await this.arm(due, permit.now);
    return json({ accepted: true });
  }
  async alarm() {
    const candidate = this.pending();
    if (!candidate) return;
    const permit = await this.permit(candidate.owner);
    if (
      !this.one(
        "SELECT 1 AS ok FROM jobs WHERE id=? AND state IN ('scheduled','running')",
        candidate.id,
      )
    )
      return;
    if (
      !sameLine(candidate, permit) ||
      permit.expires <= permit.now ||
      candidate.package !== PACKAGE ||
      !withinFreeTrialBudget(permit.quote) ||
      candidate.budget !== 0
    ) {
      this.sql.exec(
        "UPDATE jobs SET state=CASE state WHEN 'running' THEN 'interrupted' ELSE 'stopped' END WHERE id=? AND state IN ('scheduled','running')",
        candidate.id,
      );
      return;
    }
    if (candidate.due > permit.now) {
      await this.arm(candidate.due, permit.now);
      return;
    }
    // Persist the approved input before dispatch. Retrying after a lost reply uses the
    // same work ID, source snapshot and package execution record.
    const input = JSON.stringify({
      region: candidate.region,
      item: candidate.item,
      records: usableSource(permit.offers) ? permit.offers : null,
    });
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT OR IGNORE INTO dispatches VALUES(?,?)',
        candidate.id,
        input,
      );
      this.sql.exec(
        "UPDATE jobs SET state='running' WHERE id=? AND state='scheduled'",
        candidate.id,
      );
    });
    const snapshot = this.one(
      'SELECT input FROM dispatches WHERE job=?',
      candidate.id,
    ).input;
    const response = await this.env.GUIDE.fetch('https://guide.invalid/run', {
      method: 'POST',
      headers: {
        'X-Work-Id': await executionId(candidate.owner, candidate.id),
      },
      body: snapshot,
    });
    if (!response.ok)
      throw Error('試験パッケージの実行結果を照合できませんでした。');
    const saved = await response.json();
    const trusted = JSON.parse(snapshot);
    if (
      saved.region !== candidate.region ||
      saved.item !== candidate.item ||
      !acceptGuideResult(
        trusted.records,
        candidate.region,
        candidate.item,
        saved.result,
      )
    )
      throw Error('成果が承認した試験用資料と一致しません。');
    const result = saved.result;
    this.ctx.storage.transactionSync(() => {
      if (
        !this.one(
          "SELECT 1 AS ok FROM jobs WHERE id=? AND state IN ('scheduled','running')",
          candidate.id,
        )
      )
        return;
      this.sql.exec(
        "UPDATE jobs SET state='delivered',result=?,completed=? WHERE id=? AND state='running'",
        JSON.stringify(result),
        permit.now,
        candidate.id,
      );
      this.sql.exec(
        'INSERT INTO receipts(job,runs,yen) VALUES(?,1,0)',
        candidate.id,
      );
    });
  }
  async fetch(request) {
    const owner = request.headers.get('X-Trial-Owner');
    const action = new URL(request.url).pathname;
    const input = await request.json();
    if (action === '/approve') return this.approve(owner, input);
    if (action === '/wake') {
      await this.alarm();
      return json({ checked: true });
    }
    if (action === '/stop') {
      if (
        this.one(
          "SELECT 1 AS running FROM jobs WHERE id=? AND owner=? AND state='running'",
          input.id,
          owner,
        )
      )
        return json(
          { error: 'この1回はすでに実行中です。結果を確認してください。' },
          409,
        );
      this.sql.exec(
        "UPDATE jobs SET state='stopped' WHERE owner=? AND id=? AND state='scheduled'",
        owner,
        input.id,
      );
      return json({ stopped: true });
    }
    if (action === '/revoke') {
      this.sql.exec(
        "UPDATE jobs SET state=CASE state WHEN 'running' THEN 'interrupted' ELSE 'stopped' END WHERE owner=? AND state IN ('scheduled','running')",
        owner,
      );
      return json({ revoked: true });
    }
    if (action === '/notice')
      return json(
        !!this.one(
          'SELECT 1 AS found FROM receipts r JOIN jobs j ON j.id=r.job WHERE j.owner=? AND r.read_at IS NULL LIMIT 1',
          owner,
        ),
      );
    if (action === '/list')
      return json(
        this.sql
          .exec(
            `SELECT j.id,j.region,j.item,j.due,j.state,j.result,j.completed,r.runs,r.yen,r.read_at FROM jobs j
      LEFT JOIN receipts r ON r.job=j.id WHERE j.owner=? ORDER BY j.approved DESC,j.rowid DESC`,
            owner,
          )
          .toArray(),
      );
    if (action === '/read') {
      if (
        !this.one(
          "SELECT 1 AS found FROM jobs WHERE id=? AND owner=? AND state='delivered'",
          input.id,
          owner,
        )
      )
        return json({ error: '成果が見つかりません。' }, 404);
      this.sql.exec(
        'UPDATE receipts SET read_at=COALESCE(read_at,?) WHERE job=?',
        Date.now(),
        input.id,
      );
      return json({ received: true });
    }
    return json({ error: '操作が見つかりません。' }, 404);
  }
}
