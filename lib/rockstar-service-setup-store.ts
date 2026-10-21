import { resolveEsimCloudGrant } from './esim-cloud-grant.ts';
import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from './sky-linux-service-store.ts';
import {
  linuxAccess,
  parseLinuxTerms,
  type LinuxWorkerRequest,
} from './sky-linux-service.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { serviceSetupBilling } from './rockstar-service-setup-billing.ts';
import {
  acceptServiceSetup,
  createServiceSetup,
  requireServiceSetupReady,
  serviceSetupReadiness,
  serviceSetupView,
  ServiceSetupError,
  setupId,
  type ServiceSetup,
  type ServiceSetupConfig,
} from './rockstar-service-setup.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Config = LinuxServiceConfig & ServiceSetupConfig & Record<string, unknown>;
type Document = {
  id: string;
  ownerId: string;
  revision: number;
  payload: ServiceSetup;
};
type Dependencies = {
  grant?: typeof resolveEsimCloudGrant;
  linux?: ReturnType<typeof linuxServiceStore>;
  billing?: typeof serviceSetupBilling;
};
/** One onboarding record; jobs, invoices, usage and money remain in their existing authorities. */
export function serviceSetupStore(
  db: Database,
  config: Config,
  deps: Dependencies = {},
) {
  const linux = deps.linux ?? linuxServiceStore(db, config);
  const grant = deps.grant ?? resolveEsimCloudGrant;
  const billing = deps.billing ?? serviceSetupBilling;
  const key = async (owner: string) =>
    `service-setup:${await sha256Hex(owner)}`;
  async function get(owner: string): Promise<Document | null> {
    const r = await db
      .prepare(
        `SELECT id,owner_user_id AS ownerId,revision,payload FROM rockstar_service_setups WHERE id=? AND owner_user_id=?`,
      )
      .bind(await key(owner), owner)
      .first<{
        id: string;
        ownerId: string;
        revision: number;
        payload: string;
      }>();
    return r ? { ...r, payload: JSON.parse(r.payload) as ServiceSetup } : null;
  }
  async function save(before: Document, payload: ServiceSetup, now: number) {
    const r = await db
      .prepare(
        `UPDATE rockstar_service_setups SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND owner_user_id=? AND revision=?`,
      )
      .bind(
        JSON.stringify(payload),
        now,
        before.id,
        before.ownerId,
        before.revision,
      )
      .run();
    if (r.meta.changes !== 1)
      throw new ServiceSetupError(
        '状態が変わりました。再読み込みしてください。',
      );
    return { ...before, payload, revision: before.revision + 1 };
  }
  async function current(owner: string, revision: number, now: number) {
    requireServiceSetupReady(config);
    const doc = await get(owner);
    if (!doc || doc.revision !== revision)
      throw new ServiceSetupError(
        '状態が変わりました。再読み込みしてください。',
      );
    const g = await grant(db, config, owner, doc.payload.orderId, now);
    if (
      !g ||
      g.deviceRef !== doc.payload.deviceRef ||
      !(['rockstaros_access', 'sky', 'zema', 'agents'] as const).every((s) =>
        g.scopes.includes(s),
      )
    )
      throw new ServiceSetupError(
        'eSIMと本人の利用権を再確認してください。',
        403,
      );
    const terms = parseLinuxTerms(
      JSON.parse(config.SKY_LINUX_SERVICE_TERMS_JSON ?? 'null'),
    );
    if (
      !doc.payload.workspaceId &&
      JSON.stringify(terms) !== JSON.stringify(doc.payload.terms)
    )
      throw new ServiceSetupError(
        '料金の版が変わりました。契約内容の再確認が必要です。',
      );
    return doc;
  }
  return {
    get,
    async view(owner: string, now = Date.now()) {
      const readiness = serviceSetupReadiness(config);
      if (!readiness.osReady)
        return {
          readiness,
          setup: null,
          eligibleOrders: [],
          access: serviceSetupView(null, {
            readiness,
            currentGrant: false,
            workspaceMatches: false,
            linuxCanExecute: false,
            linuxReason: null,
          }),
        };
      const doc = await get(owner);
      const g = doc
        ? await grant(db, config, owner, doc.payload.orderId, now)
        : null;
      const w = doc?.payload.workspaceId ? await linux.get(owner) : null;
      const matches =
        !!w &&
        w.payload.id === doc?.payload.workspaceId &&
        w.payload.orderId === doc.payload.orderId &&
        w.payload.deviceRef === doc.payload.deviceRef;
      const access = w ? linuxAccess(w.payload, now) : null;
      return {
        readiness,
        setup: doc,
        access: serviceSetupView(doc?.payload ?? null, {
          readiness,
          currentGrant:
            !!g &&
            g.deviceRef === doc?.payload.deviceRef &&
            (['rockstaros_access', 'sky', 'zema', 'agents'] as const).every(
              (s) => g.scopes.includes(s),
            ),
          workspaceMatches: matches,
          linuxCanExecute: matches && access?.canExecute === true,
          linuxReason: access?.reason ?? null,
        }),
        eligibleOrders: readiness.osReady
          ? await linux.eligibleOrders(owner, now)
          : [],
      };
    },
    async draft(owner: string, order: unknown, now = Date.now()) {
      requireServiceSetupReady(config);
      const orderId = setupId(order),
        g = await grant(db, config, owner, orderId, now);
      if (
        !g ||
        !(['rockstaros_access', 'sky', 'zema', 'agents'] as const).every((s) =>
          g.scopes.includes(s),
        )
      )
        throw new ServiceSetupError(
          'eSIM追加後の本人・端末の利用権確認が必要です。',
          403,
        );
      const terms = parseLinuxTerms(
        JSON.parse(config.SKY_LINUX_SERVICE_TERMS_JSON ?? 'null'),
      );
      const old = await get(owner);
      if (old) {
        if (
          old.payload.orderId !== orderId ||
          old.payload.deviceRef !== g.deviceRef
        )
          throw new ServiceSetupError('既存の契約と端末交換の照合が必要です。');
        if (old.payload.acceptedAt !== null || old.payload.expiresAt > now)
          return old;
        return save(
          old,
          await createServiceSetup(owner, orderId, g.deviceRef, terms, now),
          now,
        );
      }
      const payload = await createServiceSetup(
          owner,
          orderId,
          g.deviceRef,
          terms,
          now,
        ),
        id = await key(owner);
      await db
        .prepare(
          `INSERT OR IGNORE INTO rockstar_service_setups(id,owner_user_id,revision,payload,updated_at) VALUES(?,?,0,?,?)`,
        )
        .bind(id, owner, JSON.stringify(payload), now)
        .run();
      const result = (await get(owner))!;
      if (
        result.payload.orderId !== orderId ||
        result.payload.deviceRef !== g.deviceRef
      )
        throw new ServiceSetupError('別の利用開始手続きが進行しています。');
      return result;
    },
    async accept(
      owner: string,
      revision: number,
      input: Record<string, unknown>,
      now = Date.now(),
    ) {
      const doc = await current(owner, revision, now);
      const value = await acceptServiceSetup(
        doc.payload,
        input.quoteDigest,
        input.accepted,
        input.recurringAccepted,
        now,
      );
      return value === doc.payload ? doc : save(doc, value, now);
    },
    async startBilling(owner: string, revision: number, now = Date.now()) {
      let doc = await current(owner, revision, now);
      if (!doc.payload.agreementDigest)
        throw new ServiceSetupError('契約内容への同意が必要です。');
      if (doc.payload.billing.verifiedAt !== null)
        return { setup: doc, url: null };
      if (doc.payload.billing.requestedAt === null)
        doc = await save(
          doc,
          {
            ...doc.payload,
            billing: { ...doc.payload.billing, requestedAt: now },
          },
          now,
        );
      // Persist the intent first. Lost responses reuse the same provider idempotency key.
      const session = await billing(config, owner).start(doc.payload, now);
      const after = await save(
        doc,
        {
          ...doc.payload,
          billing: { ...doc.payload.billing, sessionId: session.sessionId },
        },
        now,
      );
      return { setup: after, url: session.url };
    },
    async reconcileBilling(owner: string, revision: number, now = Date.now()) {
      const doc = await current(owner, revision, now);
      if (doc.payload.billing.verifiedAt !== null) return doc;
      const result = await billing(config, owner).reconcile(doc.payload);
      return result
        ? save(
            doc,
            {
              ...doc.payload,
              billing: { ...doc.payload.billing, ...result, verifiedAt: now },
            },
            now,
          )
        : doc;
    },
    async provision(owner: string, revision: number, now = Date.now()) {
      const doc = await current(owner, revision, now);
      if (
        doc.payload.acceptedAt === null ||
        doc.payload.billing.verifiedAt === null
      )
        throw new ServiceSetupError(
          '契約と月末の支払い準備を確認してください。',
        );
      const existing = await linux.get(owner);
      if (
        doc.payload.workspaceId &&
        existing?.payload.id === doc.payload.workspaceId &&
        existing.payload.orderId === doc.payload.orderId &&
        existing.payload.deviceRef === doc.payload.deviceRef
      )
        return doc;
      const w = await linux.accept(
        owner,
        {
          orderId: doc.payload.orderId,
          deviceRef: doc.payload.deviceRef,
          termsDigest: await sha256Hex(JSON.stringify(doc.payload.terms)),
          accepted: true,
        },
        now,
      );
      if (doc.payload.workspaceId === w.payload.id) return doc;
      // The canonical Linux workspace is idempotent per owner, including a lost setup response.
      return save(
        doc,
        {
          ...doc.payload,
          workspaceId: w.payload.id,
          runtime: { ...doc.payload.runtime, requestedAt: now },
        },
        now,
      );
    },
    async runtimeReady(
      owner: string,
      request: LinuxWorkerRequest,
      proof: unknown,
      now = Date.now(),
    ) {
      requireServiceSetupReady(config);
      const doc = await get(owner),
        w = await linux.get(owner);
      if (
        !doc ||
        !w ||
        request.action !== 'setup-ready' ||
        request.workspaceId !== doc.payload.workspaceId ||
        w.payload.id !== request.workspaceId ||
        request.contractDigest !== w.payload.contractDigest ||
        request.setupChallenge !== doc.payload.runtime.challenge ||
        !/^[a-f0-9]{64}$/.test(request.probeSha256 ?? '') ||
        doc.payload.acceptedAt === null ||
        doc.payload.billing.verifiedAt === null
      )
        throw new ServiceSetupError(
          '実行環境の準備証拠が契約と一致しません。',
          403,
        );
      await current(owner, doc.revision, now);
      const result =
        doc.payload.runtime.verifiedAt !== null
          ? doc
          : await save(
              doc,
              {
                ...doc.payload,
                runtime: {
                  ...doc.payload.runtime,
                  verifiedAt: now,
                  receiptDigest: await sha256Hex(
                    JSON.stringify({ request, proof }),
                  ),
                },
              },
              now,
            );
      await linux.activateSetup(
        owner,
        result.payload.id,
        request.workspaceId,
        now,
      );
      return result;
    },
    async ownerForSession(sessionId: string) {
      if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) return null;
      const row = await db
        .prepare(
          `SELECT owner_user_id AS ownerId FROM rockstar_service_setups WHERE json_extract(payload,'$.billing.sessionId')=?`,
        )
        .bind(sessionId)
        .first<{ ownerId: string }>();
      return row?.ownerId ?? null;
    },
  };
}
