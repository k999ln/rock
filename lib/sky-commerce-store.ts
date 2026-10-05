import type { SkyToolPackage } from './sky-tool-package.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
export type CommerceMode = 'test' | 'live';
export type CommerceStatus = 'pending' | 'paid' | 'expired' | 'failed' | 'refund_pending' | 'partially_refunded' | 'refunded' | 'disputed';
export type CommercePackage = { packageKey: string; userId: string; manifestSha256: string; manifest: string; installable: number };
export type CommerceSeller = { id: string; userId: string; mode: CommerceMode; accountId: string | null; createdAt: number };
export type CommerceOffer = {
  packageKey: string; sellerUserId: string; mode: CommerceMode; manifestSha256: string;
  amountMinor: number; currency: string; revision: number; active: number; termsUrl: string; refundPolicy: string;
};
export type CommerceOrder = {
  id: string; buyerUserId: string; sellerUserId: string; mode: CommerceMode;
  packageKey: string; manifestSha256: string; name: string; amountMinor: number;
  commissionMinor: number; refundedMinor: number; currency: string; accountId: string; offerRevision: number;
  termsUrl: string; refundPolicy: string; status: CommerceStatus; sessionId: string | null;
  paymentIntentId: string | null; checkoutUrl: string | null; receiptUrl: string | null;
  createdAt: number; updatedAt: number;
};

const offerColumns = `package_key AS packageKey, seller_user_id AS sellerUserId, mode,
  manifest_sha256 AS manifestSha256, amount_minor AS amountMinor, currency, revision, active,
  terms_url AS termsUrl, refund_policy AS refundPolicy`;
const orderColumns = `id, buyer_user_id AS buyerUserId, seller_user_id AS sellerUserId, mode,
  package_key AS packageKey, manifest_sha256 AS manifestSha256, name, amount_minor AS amountMinor,
  commission_minor AS commissionMinor, refunded_minor AS refundedMinor, currency, account_id AS accountId, offer_revision AS offerRevision,
  terms_url AS termsUrl, refund_policy AS refundPolicy, status, session_id AS sessionId,
  payment_intent_id AS paymentIntentId, checkout_url AS checkoutUrl, receipt_url AS receiptUrl,
  created_at AS createdAt, updated_at AS updatedAt`;
const eligibility = `p.status = 'verified' AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r
  WHERE r.package_key = p.package_key AND r.manifest_sha256 = p.manifest_sha256
  AND r.decision = 'verified' AND (r.expires_at IS NULL OR r.expires_at > ?))`;

export function skyCommerceStore(db: Database) {
  return {
    async package(packageKey: string): Promise<CommercePackage | null> {
      return db.prepare(`SELECT p.package_key AS packageKey, p.user_id AS userId,
        p.manifest_sha256 AS manifestSha256, p.manifest, (${eligibility}) AS installable
        FROM sky_tool_packages p WHERE p.package_key = ?`).bind(Date.now(), packageKey).first<CommercePackage>();
    },
    async packages(userId: string) {
      const rows = await db.prepare(`SELECT p.package_key AS packageKey, p.user_id AS userId,
        p.manifest_sha256 AS manifestSha256, p.manifest, (${eligibility}) AS installable
        FROM sky_tool_packages p WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 200`)
        .bind(Date.now(), userId).all<CommercePackage>();
      return rows.results;
    },
    async seller(userId: string, mode: CommerceMode) {
      return db.prepare(`SELECT id, user_id AS userId, mode, account_id AS accountId, created_at AS createdAt
        FROM sky_commerce_sellers WHERE user_id = ? AND mode = ?`).bind(userId, mode).first<CommerceSeller>();
    },
    async reserveSeller(userId: string, mode: CommerceMode) {
      await db.prepare(`INSERT OR IGNORE INTO sky_commerce_sellers (id,user_id,mode,created_at)
        VALUES (?,?,?,?)`).bind(crypto.randomUUID(), userId, mode, Date.now()).run();
      return (await this.seller(userId, mode))!;
    },
    async attachAccount(id: string, accountId: string) {
      await db.prepare(`UPDATE sky_commerce_sellers SET account_id = ? WHERE id = ? AND account_id IS NULL`)
        .bind(accountId, id).run();
    },
    async offer(packageKey: string, mode: CommerceMode) {
      return db.prepare(`SELECT ${offerColumns} FROM sky_commerce_offers WHERE package_key = ? AND mode = ?`)
        .bind(packageKey, mode).first<CommerceOffer>();
    },
    async offers(mode: CommerceMode, userId?: string) {
      const rows = await db.prepare(`SELECT ${offerColumns} FROM sky_commerce_offers WHERE mode = ?
        ${userId ? 'AND seller_user_id = ?' : 'AND active = 1'} ORDER BY updated_at DESC LIMIT 200`)
        .bind(...(userId ? [mode, userId] : [mode])).all<CommerceOffer>();
      return rows.results;
    },
    async saveOffer(input: Omit<CommerceOffer, 'revision'>) {
      await db.prepare(`INSERT INTO sky_commerce_offers
        (package_key,seller_user_id,mode,manifest_sha256,amount_minor,currency,revision,active,terms_url,refund_policy,updated_at)
        VALUES (?,?,?,?,?,?,1,?,?,?,?)
        ON CONFLICT(package_key,mode) DO UPDATE SET manifest_sha256=excluded.manifest_sha256,
        amount_minor=excluded.amount_minor,currency=excluded.currency,revision=sky_commerce_offers.revision+1,
        active=excluded.active,terms_url=excluded.terms_url,refund_policy=excluded.refund_policy,updated_at=excluded.updated_at
        WHERE sky_commerce_offers.seller_user_id=excluded.seller_user_id`)
        .bind(input.packageKey, input.sellerUserId, input.mode, input.manifestSha256, input.amountMinor,
          input.currency, input.active, input.termsUrl, input.refundPolicy, Date.now()).run();
      return this.offer(input.packageKey, input.mode);
    },
    async order(id: string) {
      return db.prepare(`SELECT ${orderColumns} FROM sky_commerce_orders WHERE id = ?`).bind(id).first<CommerceOrder>();
    },
    async activeOrder(userId: string, packageKey: string, mode: CommerceMode) {
      return db.prepare(`SELECT ${orderColumns} FROM sky_commerce_orders WHERE active_key = ?`)
        .bind(JSON.stringify([mode, userId, packageKey])).first<CommerceOrder>();
    },
    async reserveOrder(order: Omit<CommerceOrder, 'sessionId' | 'paymentIntentId' | 'checkoutUrl' | 'receiptUrl'>) {
      await db.prepare(`INSERT OR IGNORE INTO sky_commerce_orders
        (id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,commission_minor,currency,
         account_id,offer_revision,terms_url,refund_policy,status,active_key,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(order.id, order.buyerUserId, order.sellerUserId, order.mode, order.packageKey, order.manifestSha256,
          order.name, order.amountMinor, order.commissionMinor, order.currency, order.accountId, order.offerRevision,
          order.termsUrl, order.refundPolicy, order.status,
          JSON.stringify([order.mode, order.buyerUserId, order.packageKey]), order.createdAt, order.updatedAt).run();
      return (await this.activeOrder(order.buyerUserId, order.packageKey, order.mode))!;
    },
    async attachSession(id: string, sessionId: string, url: string | null) {
      await db.prepare(`UPDATE sky_commerce_orders SET session_id = ?, checkout_url = ?, updated_at = ?
        WHERE id = ? AND (session_id IS NULL OR session_id = ?)`)
        .bind(sessionId, url, Date.now(), id, sessionId).run();
    },
    async orders(userId: string, mode: CommerceMode, seller = false) {
      const rows = await db.prepare(`SELECT ${orderColumns} FROM sky_commerce_orders
        WHERE ${seller ? 'seller_user_id' : 'buyer_user_id'} = ? AND mode = ? ORDER BY created_at DESC LIMIT 100`)
        .bind(userId, mode).all<CommerceOrder>();
      return rows.results;
    },
    async refundRequestedAt(orderId: string) {
      return db.prepare('SELECT created_at AS createdAt FROM sky_commerce_events WHERE id = ?')
        .bind(`refund-request:${orderId}`).first<{ createdAt: number }>();
    },
    async record(order: CommerceOrder, status: CommerceStatus, eventId: string, paymentIntentId: string | null, receiptUrl: string | null, refundedMinor = order.refundedMinor) {
      // The order is also the entitlement: only paid + a still-reviewed package grants access.
      // Success is monotonic; late success cannot undo a refund or a dispute.
      const allowed = status === 'paid' ? "status IN ('pending','paid')"
        : status === 'pending' || status === 'failed' || status === 'expired' ? "status = 'pending'"
        : status === 'refund_pending' ? "status IN ('paid','partially_refunded','refund_pending')"
        : status === 'partially_refunded' ? "status NOT IN ('refunded','disputed','refund_pending')"
        : status === 'disputed' ? "status != 'refunded'" : '1 = 1';
      const release = ['expired', 'failed', 'refunded'].includes(status);
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO sky_commerce_events (id,order_id,status,created_at) VALUES (?,?,?,?)`)
          .bind(eventId, order.id, status, Date.now()),
        db.prepare(`UPDATE sky_commerce_orders SET status = ?, payment_intent_id = COALESCE(?,payment_intent_id),
          receipt_url = COALESCE(?,receipt_url), refunded_minor = MAX(refunded_minor,?), updated_at = ?, active_key = ${release ? 'NULL' : 'active_key'}
          WHERE id = ? AND ${allowed}`)
          .bind(status, paymentIntentId, receiptUrl, refundedMinor, Date.now(), order.id),
      ]);
      return (await this.order(order.id))!;
    },
    async access(order: CommerceOrder) {
      if (order.status !== 'paid') return null;
      const item = await this.package(order.packageKey);
      if (!item?.installable || item.manifestSha256 !== order.manifestSha256) return null;
      return JSON.parse(item.manifest) as SkyToolPackage;
    },
  };
}
