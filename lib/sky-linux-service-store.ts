import { skyToolPackageStore } from './sky-tool-package-store.ts';
import { skyCommerceStore } from './sky-commerce-store.ts';
import {
  resolveEsimCloudGrant,
  captureEsimAuthorityReads,
  currentEsimPackageReview,
  ESIM_COMMIT_NOW_SQL,
  type EsimCloudConfig,
} from './esim-cloud-grant.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import {
  requireServiceSetupReady,
  type ServiceSetup,
  type ServiceSetupConfig,
} from './rockstar-service-setup.ts';
import {
  applyLinuxEvent,
  createLinuxWorkspace,
  linuxCommand,
  assertLinuxDispatchWorkspace,
  linuxOwnerAccess,
  makeLinuxListing,
  parseLinuxTerms,
  LinuxServiceError,
  type LinuxCommand,
  type LinuxEvent,
  type LinuxListing,
  type LinuxWorkspace,
} from './sky-linux-service.ts';
type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Document<T> = {
  id: string;
  ownerId: string;
  revision: number;
  payload: T;
};
export type LinuxServiceConfig = EsimCloudConfig &
  ServiceSetupConfig & {
    SKY_LINUX_SERVICE_ENABLED?: string;
    SKY_LINUX_SERVICE_TERMS_JSON?: string;
    SKY_LINUX_EVENT_KEYS_JSON?: string;
  };
/** Optional dependency is server composition only; never passed from an HTTP body. */
export function linuxServiceStore(db: Database, config: LinuxServiceConfig,
  dependencies: { grant?: typeof resolveEsimCloudGrant } = {}) {
  async function document<T>(
    id: string,
    kind: string,
  ): Promise<Document<T> | null> {
    const row = await db
      .prepare(
        `SELECT id,owner_user_id AS ownerId,revision,payload FROM sky_linux_service_documents WHERE id=? AND kind=?`,
      )
      .bind(id, kind)
      .first<{
        id: string;
        ownerId: string;
        revision: number;
        payload: string;
      }>();
    return row ? { ...row, payload: JSON.parse(row.payload) as T } : null;
  }
  const workspaceId = async (owner: string) =>
    `workspace:${await sha256Hex(owner)}`;
  async function get(owner: string) {
    const doc = await document<LinuxWorkspace>(await workspaceId(owner), 'workspace');
    return doc && doc.ownerId === owner && doc.payload?.ownerId === owner ? doc : null;
  }
  async function catalog(readDb: Database = db, now = Date.now()): Promise<LinuxListing[]> {
    const rows = await readDb
      .prepare(
        `SELECT payload FROM sky_linux_service_documents WHERE kind='listing' ORDER BY updated_at DESC LIMIT 200`,
      )
      .all<{ payload: string }>();
    const registry = await skyToolPackageStore(readDb).listRegistry();
    // Exactly one relevant canonical listing review is supported. Secondary
    // rows (including negative rows owned by a reviewer, not the buyer) are
    // contradictory authority, never a historical positive fallback. The row owner
    // is original-reviewer provenance; the existing upsert can name a later
    // authorized reviewer in payload without changing that original row owner.
    const reviews = await readDb.prepare(`SELECT d.id,d.owner_user_id AS ownerId,d.revision,d.payload,
        json_extract(d.payload,'$.listingId') AS listingId,json_extract(d.payload,'$.digest') AS digest,
        CASE WHEN d.id='review:'||json_extract(d.payload,'$.listingId')
          AND (SELECT count(*) FROM json_each(d.payload))=6
          AND json_type(d.payload,'$.listingId')='text' AND json_type(d.payload,'$.digest')='text'
          AND json_type(d.payload,'$.decision')='text' AND json_extract(d.payload,'$.decision')='approved'
          AND json_type(d.payload,'$.reviewerId')='text' AND json_extract(d.payload,'$.reviewerId')<>''
          AND d.owner_user_id<>''
          AND json_type(d.payload,'$.reviewedAt')='integer' AND json_extract(d.payload,'$.reviewedAt')>=0
          AND json_extract(d.payload,'$.reviewedAt')<=MAX(?,${ESIM_COMMIT_NOW_SQL})
          AND json_type(d.payload,'$.expiresAt')='integer' AND json_extract(d.payload,'$.expiresAt')>MAX(?,${ESIM_COMMIT_NOW_SQL})
          AND NOT EXISTS(SELECT 1 FROM sky_linux_service_documents other WHERE other.kind='review'
            AND other.id<>d.id AND json_extract(other.payload,'$.listingId')=json_extract(d.payload,'$.listingId'))
        THEN 1 ELSE 0 END AS admissible
      FROM sky_linux_service_documents d WHERE d.kind='review'`)
      .bind(now, now).all<{ id: string; listingId: string | null; digest: string | null; admissible: number }>();
    const packages = new Map<string, boolean>();
    const admitted: LinuxListing[] = [];
    for (const row of rows.results) {
      const listing = JSON.parse(row.payload) as LinuxListing;
      const relevant = reviews.results.filter(r => r.id === `review:${listing.id}` || r.listingId === listing.id);
      if (!listing.active || relevant.length !== 1 || relevant[0].admissible !== 1 ||
        relevant[0].digest !== listing.digest || !registry.some(p => p.packageKey === listing.packageKey &&
          p.manifestSha256 === listing.packageSha256 && p.installable)) continue;
      const pin = `${listing.packageKey}:${listing.packageSha256}`;
      if (!packages.has(pin)) packages.set(pin, await currentEsimPackageReview(readDb, listing.packageKey, listing.packageSha256, now));
      if (packages.get(pin)) admitted.push(listing);
    }
    return admitted;
  }
  async function persist(
    before: Document<LinuxWorkspace>,
    after: LinuxWorkspace,
    event?: LinuxEvent,
    proof: unknown = null,
    authorityChecks: D1PreparedStatement[] = [],
  ) {
    const commands: D1PreparedStatement[] = [...authorityChecks];
    // A failing SQL assertion aborts the entire D1 batch, including the Eve writes.
    const assertion = (sql: string, values: unknown[]) =>
      db
        .prepare(
          `SELECT CASE WHEN (${sql}) THEN 1 ELSE json('SKY_LINUX_REVISION_CONFLICT') END`,
        )
        .bind(...values);
    commands.push(
      assertion(
        `EXISTS(SELECT 1 FROM sky_linux_service_documents WHERE id=? AND owner_user_id=? AND revision=? AND json(payload)=json(?))`,
        [before.id, before.ownerId, before.revision, JSON.stringify(before.payload)],
      ),
    );
    for (const j of after.jobs) {
      const old = before.payload.jobs.find((x) => x.id === j.id);
      if (old && JSON.stringify(old.run.job) === JSON.stringify(j.run.job))
        continue;
      commands.push(
        assertion(
          old
            ? `EXISTS(SELECT 1 FROM work_jobs WHERE id=? AND user_id=? AND revision=?)`
            : `NOT EXISTS(SELECT 1 FROM work_jobs WHERE id=?)`,
          old ? [j.id, before.ownerId, old.run.job.revision] : [j.id],
        ),
      );
      commands.push(
        db
          .prepare(
            `INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at`,
          )
          .bind(
            j.id,
            before.ownerId,
            JSON.stringify(j.run.job),
            j.run.job.revision,
            j.run.job.updatedAt,
          ),
      );
    }
    if (event)
      commands.push(
        db
          .prepare(
            `INSERT INTO sky_linux_service_receipts(id,workspace_id,digest,kind,payload,created_at) VALUES(?,?,?,?,?,?)`,
          )
          .bind(
            event.id,
            after.id,
            await sha256Hex(JSON.stringify(event)),
            event.kind,
            JSON.stringify({ event, proof }),
            Date.now(),
          ),
      );
    commands.push(
      db
        .prepare(
          `UPDATE sky_linux_service_documents SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND owner_user_id=? AND revision=?`,
        )
        .bind(
          JSON.stringify(after),
          Date.now(),
          before.id,
          before.ownerId,
          before.revision,
        ),
    );
    await db.batch(commands);
    return { ...before, revision: before.revision + 1, payload: after };
  }
  async function liveGrant(
    w: LinuxWorkspace,
    now: number,
    provisioning = false,
    readDb: Database = db,
  ) {
    if (config.SKY_LINUX_SERVICE_ENABLED !== 'true')
      throw new LinuxServiceError('専用Linuxサービスはまだ準備中です。', 503);
    const grant = await (dependencies.grant ?? resolveEsimCloudGrant)(
      readDb,
      config,
      w.ownerId,
      w.orderId,
      now,
    );
    if (
      !grant ||
      grant.deviceRef !== w.deviceRef ||
      !grant.scopes.includes('agents')
    )
      throw new LinuxServiceError(
        'eSIM由来の端末利用権を確認できません。',
        403,
      );
    if (config.ROCKSTAR_SERVICE_SETUP_ENABLED === 'true') {
      requireServiceSetupReady(config);
      const row = await readDb
        .prepare(
          `SELECT id,owner_user_id,revision,payload FROM rockstar_service_setups WHERE owner_user_id=?`,
        )
        .bind(w.ownerId)
        .first<{ payload: string }>();
      const setup = row ? (JSON.parse(row.payload) as ServiceSetup) : null;
      if (
        !setup ||
        setup.schema !== 'rockstar.service-setup/1' ||
        !setup.billing || !setup.runtime || !setup.terms ||
        setup.ownerId !== w.ownerId ||
        setup.orderId !== w.orderId ||
        setup.deviceRef !== w.deviceRef ||
        !Number.isSafeInteger(setup.acceptedAt) ||
        (setup.acceptedAt as number) > now ||
        !/^[a-f0-9]{64}$/.test(setup.agreementDigest ?? '') ||
        !Number.isSafeInteger(setup.billing.verifiedAt) ||
        (setup.billing.verifiedAt as number) > now ||
        JSON.stringify(setup.terms) !== JSON.stringify(w.terms) ||
        (!provisioning &&
          (setup.workspaceId !== w.id || !Number.isSafeInteger(setup.runtime.verifiedAt) ||
            (setup.runtime.verifiedAt as number) > now || !/^[a-f0-9]{64}$/.test(setup.runtime.receiptDigest ?? '')))
      )
        throw new LinuxServiceError(
          '契約・支払い準備・専用環境の利用開始を完了してください。',
          403,
        );
      parseLinuxTerms(setup.terms);
    }
    return grant;
  }
  /** Public disclosure is a fresh saved-version projection, not an execution
   * permit. Keep internal get/event/worker paths independent from this view.
   * A completed mutation may pass its result only as an expected version; it
   * never supplies the response body or substitutes for current owner authority.
   */
  async function ownerResponse(owner: string, expected?: Document<LinuxWorkspace>, now = Date.now()) {
    const denied = { workspace: null, access: null };
    try {
      const row = await db.prepare(`SELECT id,owner_user_id AS ownerId,revision,payload
        FROM sky_linux_service_documents WHERE id=? AND kind='workspace' AND owner_user_id=?`)
        .bind(await workspaceId(owner), owner)
        .first<{ id: string; ownerId: string; revision: number; payload: string }>();
      if (!row || !Number.isSafeInteger(row.revision) || row.revision < 0) return denied;
      const doc = { ...row, payload: JSON.parse(row.payload) as LinuxWorkspace };
      if (doc.ownerId !== owner || doc.payload?.ownerId !== owner ||
        (expected && (expected.id !== doc.id || expected.ownerId !== owner ||
          expected.revision !== doc.revision || JSON.stringify(expected.payload) !== row.payload))) return denied;
      let access = linuxOwnerAccess(doc.payload, owner, doc.ownerId, now);
      if (access.canRead !== true) return denied;
      if (access.canExecute) {
        try { await liveGrant(doc.payload, now); }
        catch { access = { ...access, canExecute: false, reason: 'current_authority_required' }; }
      }
      // This is the disclosure linearization point, after asynchronous checks.
      // Compare the original bytes, not a reserialized/normalized JSON value:
      // even a revision-preserving replacement must invalidate the chosen view.
      const current = await db.prepare(`SELECT id FROM sky_linux_service_documents
        WHERE id=? AND kind='workspace' AND owner_user_id=? AND revision=?
          AND payload COLLATE BINARY=?`)
        .bind(row.id, owner, row.revision, row.payload).first<{ id: string }>();
      return current?.id === row.id ? { workspace: doc, access } : denied;
    } catch {
      // Unknown/unavailable current read authority never revives a cached body.
      // No data is deleted and a mutation already committed is not repeated.
      return denied;
    }
  }
  return {
    get,
    catalog,
    ownerResponse,
    async access(owner: string, now = Date.now()) {
      const doc = await get(owner);
      if (!doc) return null;
      const access = linuxOwnerAccess(doc.payload, owner, doc.ownerId, now);
      if (!access.canExecute) return access;
      try { await liveGrant(doc.payload, now); return access; }
      catch { return { ...access, canExecute: false, reason: 'current_authority_required' }; }
    },
    async eligibleOrders(owner: string, now = Date.now()) {
      if (config.SKY_LINUX_SERVICE_ENABLED !== 'true') return [];
      const rows = await db
        .prepare(
          `SELECT sky_order_id AS orderId FROM esim_device_entitlements WHERE owner_user_id=? ORDER BY activated_at DESC LIMIT 20`,
        )
        .bind(owner)
        .all<{ orderId: string }>();
      const choices = [];
      for (const row of rows.results) {
        const grant = await (dependencies.grant ?? resolveEsimCloudGrant)(
          db,
          config,
          owner,
          row.orderId,
          now,
        );
        if (grant?.scopes.includes('agents'))
          choices.push({
            orderId: grant.orderId,
            deviceRef: grant.deviceRef,
            expiresAt: grant.expiresAt,
          });
      }
      return choices;
    },
    async review(
      reviewerId: string,
      input: {
        listingId: string;
        digest: string;
        decision: 'approved' | 'revoked';
        expiresAt: number;
      },
      now = Date.now(),
    ) {
      const listing = await document<LinuxListing>(
        'listing:' + linuxTextId(input.listingId),
        'listing',
      );
      if (
        !listing ||
        listing.payload.digest !== input.digest ||
        !['approved', 'revoked'].includes(input.decision) ||
        !Number.isSafeInteger(input.expiresAt) ||
        input.expiresAt <= now ||
        input.expiresAt > now + 90 * 86400000
      )
        throw new LinuxServiceError('登録の版・審査期限が一致しません。');
      if (
        !(await skyToolPackageStore(db).verifiedRegistryPackage(
          listing.payload.packageKey,
          listing.payload.packageSha256,
        ))
      )
        throw new LinuxServiceError('元Packageの審査を確認してください。');
      const key = `review:${input.listingId}`,
        payload = { ...input, reviewerId, reviewedAt: now };
      await db
        .prepare(`INSERT INTO sky_linux_service_documents(id,owner_user_id,kind,revision,payload,updated_at) VALUES(?,?,'review',0,?,?)
        ON CONFLICT(id) DO UPDATE SET revision=revision+1,payload=excluded.payload,updated_at=excluded.updated_at`)
        .bind(key, reviewerId, JSON.stringify(payload), now)
        .run();
      return payload;
    },
    async creatorEarnings(owner: string) {
      const rows = await db
        .prepare(`SELECT json_extract(i.value,'$.period') AS period,json_extract(i.value,'$.state') AS state,
        json_extract(a.value,'$.grossMinor') AS grossMinor,json_extract(a.value,'$.commissionMinor') AS commissionMinor,
        json_extract(a.value,'$.payableMinor') AS payableMinor,json_extract(a.value,'$.transferRef') AS transferRef,
        json_extract(a.value,'$.recoveryRequired') AS recoveryRequired
        FROM sky_linux_service_documents d,json_each(d.payload,'$.invoices') i,json_each(i.value,'$.allocations') a
        WHERE d.kind='workspace' AND json_extract(a.value,'$.creatorId')=? ORDER BY period DESC LIMIT 100`)
        .bind(owner)
        .all();
      return rows.results;
    },
    async register(
      owner: string,
      input: Omit<Parameters<typeof makeLinuxListing>[0], 'creatorId'>,
    ) {
      const pack = await skyCommerceStore(db).package(input.packageKey);
      if (
        !pack ||
        pack.userId !== owner ||
        !pack.installable ||
        pack.manifestSha256 !== input.packageSha256
      )
        throw new LinuxServiceError(
          '自分の審査済みPackageを指定してください。',
          403,
        );
      const listing = await makeLinuxListing({ ...input, creatorId: owner }),
        key = `listing:${linuxTextId(listing.id)}`;
      const old = await document<LinuxListing>(key, 'listing');
      if (old) {
        if (old.ownerId === owner && old.payload.digest === listing.digest)
          return old.payload;
        throw new LinuxServiceError(
          '登録済みの版は変更できません。新しいIDで登録してください。',
        );
      }
      await db
        .prepare(
          `INSERT INTO sky_linux_service_documents(id,owner_user_id,kind,revision,payload,updated_at) VALUES(?,?,'listing',0,?,?)`,
        )
        .bind(key, owner, JSON.stringify(listing), Date.now())
        .run();
      return listing;
    },
    async accept(
      owner: string,
      input: {
        orderId: string;
        deviceRef: string;
        termsDigest: string;
        accepted: true;
      },
      now = Date.now(),
    ) {
      if (config.SKY_LINUX_SERVICE_ENABLED !== 'true')
        throw new LinuxServiceError('専用Linuxサービスはまだ準備中です。', 503);
      const terms = parseLinuxTerms(
        JSON.parse(config.SKY_LINUX_SERVICE_TERMS_JSON ?? 'null'),
      );
      if (
        input.accepted !== true ||
        input.termsDigest !== (await sha256Hex(JSON.stringify(terms)))
      )
        throw new LinuxServiceError('契約・料金・月間上限に同意してください。');
      const old = await get(owner);
      if (old) {
        if (
          old.payload.orderId === input.orderId &&
          old.payload.deviceRef === input.deviceRef &&
          JSON.stringify(old.payload.terms) === JSON.stringify(terms)
        )
          return old;
        throw new LinuxServiceError('既存契約の版を確認してください。');
      }
      const w = await createLinuxWorkspace(
        owner,
        input.deviceRef,
        input.orderId,
        terms,
        'live',
        now,
      );
      if (config.ROCKSTAR_SERVICE_SETUP_ENABLED === 'true')
        w.serviceStartAt = null;
      await liveGrant(w, now, true);
      const id = await workspaceId(owner);
      await db
        .prepare(
          `INSERT INTO sky_linux_service_documents(id,owner_user_id,kind,revision,payload,updated_at) VALUES(?,?,'workspace',0,?,?)`,
        )
        .bind(id, owner, JSON.stringify(w), now)
        .run();
      // The insert is known to have succeeded. A later owner/read conflict must
      // withhold the public body, not erase this mutation acknowledgement.
      return { id, ownerId: owner, revision: 0, payload: w };
    },
    async activateSetup(
      owner: string,
      setupId: string,
      workspace: string,
      now = Date.now(),
    ) {
      requireServiceSetupReady(config);
      const before = await get(owner);
      const reads = captureEsimAuthorityReads(db);
      const row = await reads.database
        .prepare(
          `SELECT payload FROM rockstar_service_setups WHERE owner_user_id=?`,
        )
        .bind(owner)
        .first<{ payload: string }>();
      const setup = row ? (JSON.parse(row.payload) as ServiceSetup) : null;
      if (
        !before ||
        !setup ||
        setup.id !== setupId ||
        setup.workspaceId !== workspace ||
        before.payload.id !== workspace ||
        setup.runtime.verifiedAt === null ||
        setup.billing.verifiedAt === null
      )
        throw new LinuxServiceError(
          '利用開始の準備証拠を確認できません。',
          403,
        );
      const grant = await liveGrant(before.payload, now, true, reads.database);
      if (before.payload.serviceStartAt !== null) return before;
      const after = structuredClone(before.payload);
      after.serviceStartAt = now;
      let validUntil = grant.expiresAt;
      if (
        after.issuer.state === 'active' &&
        after.issuer.validUntil > now &&
        !after.serviceWindows.some((window) => window.end === null)
      ) {
        after.serviceWindows.push({ start: now, end: null });
        validUntil = Math.min(validUntil, after.issuer.validUntil);
      }
      // Activation starts the service clock. Recheck the captured setup/grant
      // and their expiry in the same batch as that first persistent transition.
      const checks = reads.assertions();
      checks.push(db.prepare(`SELECT CASE WHEN (? > MAX(?, ${ESIM_COMMIT_NOW_SQL}))
        THEN 1 ELSE json('ESIM_ACTIVATION_AUTHORITY_EXPIRED') END`).bind(validUntil, now));
      return persist(before, after, undefined, null, checks);
    },
    async command(
      owner: string,
      revision: number,
      command: LinuxCommand,
      now = Date.now(),
      worker = false,
    ) {
      const before = await get(owner);
      if (!Number.isSafeInteger(revision) || revision < 0 || !before || before.revision !== revision)
        throw new LinuxServiceError('状態が変わりました。再読み込みしてください。');
      assertLinuxDispatchWorkspace(before.payload);
      if (['claim', 'heartbeat', 'close-month'].includes(command.action) && !worker)
        throw new LinuxServiceError('実行環境の認証が必要です。', 403);
      const dispatch = ['run', 'add', 'claim', 'heartbeat'].includes(command.action);
      const reads = captureEsimAuthorityReads(db);
      const grant = dispatch ? await liveGrant(before.payload, now, false, reads.database) : null;
      const listings = await catalog(dispatch ? reads.database : db, now);
      const after = await linuxCommand(before.payload, command, listings, now);
      const checks = dispatch ? reads.assertions() : [];
      if (dispatch && grant) {
        let validUntil = Math.min(grant.expiresAt, before.payload.issuer.validUntil);
        if (command.action === 'claim' || command.action === 'heartbeat') {
          validUntil = Math.min(validUntil, after.jobs.find(j => j.id === command.jobId)?.leaseUntil ?? 0);
        }
        if (command.action === 'heartbeat') {
          const job = before.payload.jobs.find(j => j.id === command.jobId);
          validUntil = Math.min(validUntil, job?.leaseUntil ?? 0);
        }
        checks.push(db.prepare(`SELECT CASE WHEN (? > MAX(?, ${ESIM_COMMIT_NOW_SQL})
          AND strftime('%Y-%m','now') = ?)
          THEN 1 ELSE json('SKY_LINUX_AUTHORITY_EXPIRED') END`).bind(validUntil, now, new Date(now).toISOString().slice(0, 7)));
        const listingId = 'listingId' in command ? command.listingId
          : 'jobId' in command ? before.payload.jobs.find(j => j.id === command.jobId)?.listing.id : undefined;
        const listing = listings.find(l => l.id === listingId);
        if (!listing) throw new LinuxServiceError('実行対象の現在版を確認してください。', 403);

      }
      // A retry still commits its authority assertions, but never repeats writes.
      if (JSON.stringify(after) === JSON.stringify(before.payload)) {
        if (checks.length) {
          checks.push(db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM sky_linux_service_documents
            WHERE id=? AND owner_user_id=? AND revision=? AND json(payload)=json(?))
            THEN 1 ELSE json('SKY_LINUX_REVISION_CONFLICT') END`)
            .bind(before.id, owner, revision, JSON.stringify(before.payload)));
          await db.batch(checks);
        }
        return before;
      }
      return persist(before, after, undefined, null, checks);
    },
    async event(event: LinuxEvent, now = Date.now(), proof: unknown = null) {
      const row = await db
        .prepare(
          `SELECT id,owner_user_id AS ownerId,revision,payload FROM sky_linux_service_documents WHERE kind='workspace' AND json_extract(payload,'$.id')=?`,
        )
        .bind(event.workspaceId)
        .first<{
          id: string;
          ownerId: string;
          revision: number;
          payload: string;
        }>();
      if (!row) throw new LinuxServiceError('契約が見つかりません。', 404);
      const before = {
        ...row,
        payload: JSON.parse(row.payload) as LinuxWorkspace,
      };
      if (before.ownerId !== before.payload.ownerId)
        throw new LinuxServiceError('保存先の本人が一致しません。', 403);
      const duplicate = await db
        .prepare(
          `SELECT workspace_id AS workspaceId,digest FROM sky_linux_service_receipts WHERE id=?`,
        )
        .bind(event.id)
        .first<{ workspaceId: string; digest: string }>();
      if (duplicate) {
        if (
          duplicate.workspaceId !== event.workspaceId ||
          duplicate.digest !== (await sha256Hex(JSON.stringify(event)))
        )
          throw new LinuxServiceError('証拠IDが再使用されています。');
        return before;
      }
      return persist(
        before,
        await applyLinuxEvent(before.payload, event, now),
        event,
        proof,
      );
    },
  };
}
function linuxTextId(id: string) {
  if (!/^[a-zA-Z0-9._:@-]{1,160}$/.test(id))
    throw new LinuxServiceError('登録IDを確認してください。');
  return id;
}
