import { skyToolPackageStore } from './sky-tool-package-store.ts';
import { skyCommerceStore } from './sky-commerce-store.ts';
import {
  resolveEsimCloudGrant,
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
export function linuxServiceStore(db: Database, config: LinuxServiceConfig) {
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
    return document<LinuxWorkspace>(await workspaceId(owner), 'workspace');
  }
  async function catalog(): Promise<LinuxListing[]> {
    const rows = await db
      .prepare(
        `SELECT payload FROM sky_linux_service_documents WHERE kind='listing' ORDER BY updated_at DESC LIMIT 200`,
      )
      .all<{ payload: string }>();
    const registry = await skyToolPackageStore(db).listRegistry();
    const reviews = await db
      .prepare(
        `SELECT payload FROM sky_linux_service_documents WHERE kind='review'`,
      )
      .all<{ payload: string }>();
    const admitted = reviews.results.map(
      (r) =>
        JSON.parse(r.payload) as {
          listingId: string;
          digest: string;
          decision: string;
          expiresAt: number;
        },
    );
    return rows.results
      .map((r) => JSON.parse(r.payload) as LinuxListing)
      .filter(
        (l) =>
          l.active &&
          admitted.some(
            (r) =>
              r.listingId === l.id &&
              r.digest === l.digest &&
              r.decision === 'approved' &&
              r.expiresAt > Date.now(),
          ) &&
          registry.some(
            (p) =>
              p.packageKey === l.packageKey &&
              p.manifestSha256 === l.packageSha256 &&
              p.installable,
          ),
      );
  }
  async function persist(
    before: Document<LinuxWorkspace>,
    after: LinuxWorkspace,
    event?: LinuxEvent,
    proof: unknown = null,
  ) {
    const commands: D1PreparedStatement[] = [];
    // A failing SQL assertion aborts the entire D1 batch, including the Eve writes.
    const assertion = (sql: string, values: unknown[]) =>
      db
        .prepare(
          `SELECT CASE WHEN (${sql}) THEN 1 ELSE json('SKY_LINUX_REVISION_CONFLICT') END`,
        )
        .bind(...values);
    commands.push(
      assertion(
        `EXISTS(SELECT 1 FROM sky_linux_service_documents WHERE id=? AND owner_user_id=? AND revision=?)`,
        [before.id, before.ownerId, before.revision],
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
  ) {
    if (config.SKY_LINUX_SERVICE_ENABLED !== 'true')
      throw new LinuxServiceError('専用Linuxサービスはまだ準備中です。', 503);
    const grant = await resolveEsimCloudGrant(
      db,
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
      const row = await db
        .prepare(
          `SELECT payload FROM rockstar_service_setups WHERE owner_user_id=?`,
        )
        .bind(w.ownerId)
        .first<{ payload: string }>();
      const setup = row ? (JSON.parse(row.payload) as ServiceSetup) : null;
      if (
        !setup ||
        setup.ownerId !== w.ownerId ||
        setup.orderId !== w.orderId ||
        setup.deviceRef !== w.deviceRef ||
        setup.acceptedAt === null ||
        !setup.agreementDigest ||
        setup.billing.verifiedAt === null ||
        JSON.stringify(setup.terms) !== JSON.stringify(w.terms) ||
        (!provisioning &&
          (setup.workspaceId !== w.id || setup.runtime.verifiedAt === null))
      )
        throw new LinuxServiceError(
          '契約・支払い準備・専用環境の利用開始を完了してください。',
          403,
        );
    }
  }
  return {
    get,
    catalog,
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
        const grant = await resolveEsimCloudGrant(
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
      return (await get(owner))!;
    },
    async activateSetup(
      owner: string,
      setupId: string,
      workspace: string,
      now = Date.now(),
    ) {
      requireServiceSetupReady(config);
      const before = await get(owner);
      const row = await db
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
      await liveGrant(before.payload, now, true);
      if (before.payload.serviceStartAt !== null) return before;
      const after = structuredClone(before.payload);
      after.serviceStartAt = now;
      if (
        after.issuer.state === 'active' &&
        after.issuer.validUntil > now &&
        !after.serviceWindows.some((window) => window.end === null)
      )
        after.serviceWindows.push({ start: now, end: null });
      return persist(before, after);
    },
    async command(
      owner: string,
      revision: number,
      command: LinuxCommand,
      now = Date.now(),
      worker = false,
    ) {
      const before = await get(owner);
      if (!before || before.revision !== revision)
        throw new LinuxServiceError(
          '状態が変わりました。再読み込みしてください。',
        );
      if (
        ['claim', 'heartbeat', 'close-month'].includes(command.action) &&
        !worker
      )
        throw new LinuxServiceError('実行環境の認証が必要です。', 403);
      if (['run', 'add', 'claim', 'heartbeat'].includes(command.action))
        await liveGrant(before.payload, now);
      return persist(
        before,
        await linuxCommand(before.payload, command, await catalog(), now),
      );
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
