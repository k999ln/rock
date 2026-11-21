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
export class TrialError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export class TrialRuntime {
  constructor(directory, checkLine) {
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
    const sql = readFileSync(
      new URL(
        '../../../services/operator-dock/migrations/0003_distribution.sql',
        import.meta.url,
      ),
      'utf8',
    );
    for (const statement of sql.split(';').filter((part) => part.trim()))
      await db.prepare(statement).run();
    return db;
  }
  async command(owner, action, input = {}) {
    const response = await this.runtime.dispatchFetch(
      'https://fixture.invalid/' + action,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.secret,
          'X-Trial-Owner': owner,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
    );
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
