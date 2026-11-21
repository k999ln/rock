import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { join } from 'node:path';
import { EsimBootstrap, FixtureEsimProvider } from '../core.mjs';

import { TrialError, TrialRuntime } from './runtime.mjs';
import {
  sampleOffers,
  trialExecutionQuote,
} from '../../../services/noah-test-runtime/src/esim-trial/guide.mjs';
export {
  PACKAGE,
  DELAY_MS,
  regions,
  goods,
} from '../../../services/noah-test-runtime/src/esim-trial/guide.mjs';
export { TrialError } from './runtime.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const capabilities = {
  esimSupported: true,
  receiverInstalled: true,
  localRuntimePresent: false,
  modelAssetsVerified: false,
};
export const TRIAL_MS = 24 * 60 * 60 * 1000;
function requireTrial(condition, status, message) {
  if (!condition) throw new TrialError(status, message);
}

// Only the local harness constructs this service. No provider credentials or payment adapter.
export class NoahTrial {
  constructor(
    directory,
    {
      now = Date.now,
      provider,
      readOffers = () => sampleOffers,
      readQuote = () => trialExecutionQuote,
    } = {},
  ) {
    this.now = now;
    this.readOffers = readOffers;
    this.readQuote = readQuote;
    this.provider =
      provider ??
      new FixtureEsimProvider(join(directory, 'fixture-provider.sqlite'));
    this.core = new EsimBootstrap({
      filename: join(directory, 'trial.sqlite'),
      provider: this.provider,
      ...generateKeyPairSync('ed25519'),
      now,
    });
    this.db = this.core.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trial_owners (
        owner TEXT PRIMARY KEY, credential TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS trial_sessions (
        digest TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES trial_owners(owner));
      CREATE TABLE IF NOT EXISTS trial_handset (
        slot INTEGER PRIMARY KEY CHECK(slot=1), owner TEXT NOT NULL, enrollment TEXT NOT NULL, device TEXT NOT NULL);
    `);
    this.runtime = new TrialRuntime(directory, (owner) =>
      this.runtimePermit(owner),
    );
  }
  async close() {
    await this.runtime.close();
    this.core.close();
    this.provider.close();
  }
  invite(owner, credential, expires) {
    requireTrial(
      typeof credential === 'string' &&
        credential.length >= 32 &&
        Number.isSafeInteger(expires),
      400,
      '招待情報を確認してください。',
    );
    this.db
      .prepare(
        'INSERT INTO trial_owners(owner,credential,expires) VALUES(?,?,?)',
      )
      .run(owner, hash(credential), expires);
  }
  login(credential) {
    const record = this.db
      .prepare(
        'SELECT owner FROM trial_owners WHERE credential=? AND expires>?',
      )
      .get(hash(credential), this.now());
    requireTrial(record, 403, '招待コードか有効期限を確認してください。');
    const token = secret();
    this.db
      .prepare('INSERT INTO trial_sessions VALUES(?,?)')
      .run(hash(token), record.owner);
    return token;
  }
  session(token) {
    if (typeof token !== 'string' || token.length !== 43) return null;
    return (
      this.db
        .prepare(`SELECT o.owner, o.expires FROM trial_owners o JOIN trial_sessions s USING(owner)
      WHERE s.digest=? AND o.expires>?`)
        .get(hash(token), this.now()) ?? null
    );
  }
  logout(token) {
    this.db
      .prepare('DELETE FROM trial_sessions WHERE digest=?')
      .run(hash(token));
  }
  order(owner) {
    return this.db
      .prepare(
        "SELECT * FROM esim_enrollments WHERE owner=? AND request_key='free-trial-v1'",
      )
      .get(owner);
  }
  async freeLineAvailable() {
    try {
      const q = await this.provider.quoteFreeTrial();
      return (
        q?.currency === 'JPY' &&
        q.autoRenew === false &&
        ['issueMinor', 'recurringMinor', 'trafficMinor', 'endMinor'].every(
          (key) => q[key] === 0,
        )
      );
    } catch {
      return false;
    }
  }
  async enroll(owner) {
    const row = this.core.createFixtureEnrollment(
      owner,
      'free-trial-v1',
      'lifeline',
    );
    requireTrial(
      row.access === 'active',
      403,
      'この試験回線は失効しています。',
    );
    if (row.state === 'requested') {
      requireTrial(
        await this.freeLineAvailable(),
        409,
        '事業者側の0円条件を確認できるまで、申込は準備待ちです。',
      );
      await this.core.provision(owner, row.id);
    } else await this.core.reconcile(owner, row.id);
    return this.order(owner);
  }
  async install(owner) {
    const order = this.order(owner);
    requireTrial(
      order?.access === 'active' && ['issued', 'enabled'].includes(order.state),
      409,
      '模擬回線の発行を先に確認してください。',
    );
    const device = 'fixture-handset-1';
    this.db
      .prepare('INSERT OR IGNORE INTO trial_handset VALUES(1,?,?,?)')
      .run(owner, order.id, device);
    const phone = this.db
      .prepare('SELECT * FROM trial_handset WHERE slot=1')
      .get();
    requireTrial(
      phone.owner === owner && phone.enrollment === order.id,
      409,
      'この模擬端末には別の回線が登録されています。',
    );
    this.provider.enableIssued(order.id);
    await this.core.reconcile(owner, order.id);
    this.core.registerFixtureDevice(owner, device, capabilities);
  }
  phone(owner) {
    const row = this.db
      .prepare(`SELECT h.device, e.id FROM trial_handset h JOIN esim_enrollments e ON h.enrollment=e.id
      JOIN esim_devices d ON d.id=h.device AND d.owner=h.owner
      WHERE h.slot=1 AND h.owner=? AND e.owner=h.owner AND e.state='enabled' AND e.access='active'`)
      .get(owner);
    return row;
  }
  async gate(owner, dedicated) {
    requireTrial(
      dedicated,
      403,
      '結果とパッケージは模擬専用回線から開いてください。',
    );
    const phone = this.phone(owner);
    requireTrial(phone, 403, 'この端末の回線を確認できませんでした。');
    await this.core.reconcile(owner, phone.id);
    requireTrial(
      this.phone(owner),
      403,
      'この端末の回線を確認できませんでした。',
    );
    const envelope = this.core.bootstrap(owner, phone.id, phone.device);
    this.core.validateOnline(owner, phone.id, phone.device, envelope);
    return phone;
  }
  async runtimePermit(owner) {
    const now = this.now();
    const phone = this.phone(owner);
    const expires = this.db
      .prepare('SELECT expires FROM trial_owners WHERE owner=?')
      .get(owner)?.expires;
    if (!phone || !expires || expires <= now) return { active: false, now };
    await this.core.reconcile(owner, phone.id);
    if (!this.phone(owner)) return { active: false, now };
    let offers;
    try {
      offers = this.readOffers();
    } catch {
      offers = null;
    }
    return {
      active: true,
      quote: this.readQuote(),
      enrollment: phone.id,
      device: phone.device,
      now,
      expires,
      offers,
    };
  }
  async approve(owner, dedicated, input) {
    await this.gate(owner, dedicated);
    return this.runtime.command(owner, 'approve', input);
  }
  stop(owner, id) {
    return this.runtime.command(owner, 'stop', { id });
  }
  async revoke(owner) {
    const order = this.order(owner);
    if (order) this.core.revoke(owner, order.id);
    await this.runtime.command(owner, 'revoke');
  }
  async recoverAlarms() {
    // Enter persistent objects after a host restart, including owners whose invite expired while offline.
    for (const { owner } of this.db
      .prepare('SELECT owner FROM trial_owners')
      .all())
      await this.runtime.command(owner, 'wake');
  }
  jobs(owner) {
    return this.runtime.command(owner, 'list');
  }
  async receive(owner, dedicated, id) {
    await this.gate(owner, dedicated);
    return this.runtime.command(owner, 'read', { id });
  }
  hasUpdate(owner) {
    return this.runtime.command(owner, 'notice');
  }
}
export function newCredential() {
  return secret();
}
export function newApproval() {
  return randomUUID();
}
