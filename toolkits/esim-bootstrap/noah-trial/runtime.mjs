import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

function bundle(name) {
  const entry = fileURLToPath(
    new URL(
      '../../../services/noah-test-runtime/src/esim-trial/' + name + '.mjs',
      import.meta.url,
    ),
  );
  return buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  }).outputFiles[0].text;
}
const controllerScript = bundle('worker');
const packageScript = bundle('agent');
const distributionScript = bundle('distribution-work');
const cloudWorkScript = bundle('cloud-work');
const textAgentScript = bundle('text-agent');
export class TrialError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export class TrialRuntime {
  constructor(directory, checkLine, routeBindings = {}) {
    this.secret = randomBytes(32).toString('base64url');
    const persist = join(directory, 'worker');
    const local = convertV4MiniflareOptions({
      host: '127.0.0.1',
      durableObjectsPersist: persist,
      workers: [
        {
          name: '',
          script: controllerScript,
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: { JOBS: { className: 'TrialJobs', useSQLite: true } },
          bindings: { BRIDGE: this.secret },
          outboundService: () => new Response(null, { status: 403 }),
          serviceBindings: {
            LINE: async (req) =>
              Response.json(await checkLine(await req.text())),
            GUIDE: 'noah-trial-guide',
          },
        },
        {
          name: 'noah-cloud-work',
          script: cloudWorkScript,
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: { JOBS: { className: 'CloudWork', useSQLite: true } },
          bindings: { BRIDGE: this.secret },
          outboundService: () => new Response(null, { status: 403 }),
          serviceBindings: {
            LINE: async (req) =>
              Response.json(await checkLine((await req.json()).owner)),
            NOAH: 'noah-local-text',
            PROVIDER: 'provider-local-text',
            REGISTERED: 'registered-local-text',
            ...routeBindings,
          },
        },
        {
          name: 'noah-distribution-agent',
          script: distributionScript,
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: {
            NOTICES: { className: 'DistributionWork', useSQLite: true },
          },
          serviceBindings: {
            LINE: async (req) =>
              Response.json(await checkLine((await req.json()).owner)),
          },
          outboundService: () => new Response(null, { status: 403 }),
        },
        ...[
          'noah-local-text',
          'provider-local-text',
          'registered-local-text',
        ].map((name) => ({
          name,
          script: textAgentScript,
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: {
            RESULTS: { className: 'TextResult', useSQLite: true },
          },
          outboundService: () => new Response(null, { status: 403 }),
        })),
        {
          name: 'noah-trial-distribution-store',
          script:
            'export default { fetch() { return new Response(null, {status: 404}) } }',
          modules: true,
          compatibilityDate: '2026-10-01',
          d1Databases: ['DISTRIBUTIONS'],
        },
        {
          name: 'noah-trial-guide',
          script: packageScript,
          modules: true,
          compatibilityDate: '2026-10-01',
          durableObjects: {
            EXECUTIONS: { className: 'GuideExecution', useSQLite: true },
          },
          outboundService: () => new Response(null, { status: 403 }),
        },
      ],
    });
    this.runtime = new Miniflare({
      ...local,
      resourcePersistencePath: persist,
      isolatedResourcePersistencePath: persist,
    });
  }
  async distributionDb() {
    if (!this.ledger)
      this.ledger = this.openDistributionDb().catch((error) => {
        this.ledger = undefined;
        throw error;
      });
    return this.ledger;
  }
  async openDistributionDb() {
    const db = await this.runtime.getD1Database(
      'DISTRIBUTIONS',
      'noah-trial-distribution-store',
    );
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS trial_applied_migrations(name TEXT PRIMARY KEY)',
      )
      .run();
    for (const name of [
      '0003_distribution',
      '0004_distribution_fulfillment',
      '0005_distribution_plans',
    ]) {
      if (
        await db
          .prepare('SELECT 1 FROM trial_applied_migrations WHERE name=?')
          .bind(name)
          .first()
      )
        continue;
      const sql = readFileSync(
        new URL(
          '../../../services/operator-dock/migrations/' + name + '.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const statements = sql
        .split(';')
        .filter((part) => part.trim())
        .map((part) => db.prepare(part));
      await db.batch([
        ...statements,
        db.prepare('INSERT INTO trial_applied_migrations VALUES(?)').bind(name),
      ]);
    }
    return db;
  }
  async command(owner, action, input = {}, cloudWork = false) {
    const url = 'https://fixture.invalid/' + action;
    const options = {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.secret,
        'X-Trial-Owner': owner,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    };
    const response = cloudWork
      ? await (
          await this.runtime.getWorker('noah-cloud-work')
        ).fetch(url, options)
      : await this.runtime.dispatchFetch(url, options);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new TrialError(
        response.status,
        data?.error ?? '試験用クラウドに接続できませんでした。',
      );
    }
    return response.json();
  }
  close() {
    return this.runtime.dispose();
  }
}
