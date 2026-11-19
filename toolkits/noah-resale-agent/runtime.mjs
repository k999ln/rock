import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { workStore } from '../../lib/work-store.ts';
import { resaleService } from '../../lib/noah-resale-service.ts';
import { ebayResaleProvider, digest } from '../../lib/noah-resale-provider.ts';
import { totals, txt, amount, item } from '../../lib/noah-resale.ts';
import { fixtureProvider } from './fixture.mjs';

export const template = {
  schema: 'noah.resale.cli/1',
  mode: 'ebay-sandbox',
  currency: 'USD',
  budget: 0,
  perItemCap: 0,
  searches: {
    street: 'Manhattan zip hoodie',
    archive: 'designer archive jacket',
    objects: 'limited edition design object',
  },
  intervalSeconds: 900,
};
export function readJson(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32000)
    throw Error('JSONは32KB以内の通常ファイルにしてください。');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function object(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw Error('入力項目を確認してください。');
  return value;
}
export function settings(value) {
  const c = object(value, Object.keys(template));
  if (
    c.schema !== template.schema ||
    !['ebay-sandbox', 'ebay-production', 'fixture'].includes(c.mode) ||
    !['USD', 'JPY'].includes(c.currency)
  )
    throw Error('設定の版・接続先・通貨を確認してください。');
  const searches = object(c.searches, ['street', 'archive', 'objects']);
  for (const role of ['street', 'archive', 'objects']) txt(searches[role], 120);
  if (amount(c.perItemCap) > amount(c.budget))
    throw Error('1点上限は総予算以下にしてください。');
  if (
    !Number.isInteger(c.intervalSeconds) ||
    c.intervalSeconds < 60 ||
    c.intervalSeconds > 86400
  )
    throw Error('探索間隔は60〜86400秒です。');
  return c;
}
export function privateWrite(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
}
export function initialize(directory, config = template) {
  const c = settings(config),
    root = resolve(directory);
  if (existsSync(root)) {
    if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())
      throw Error('保存先は通常のディレクトリにしてください。');
    if (
      existsSync(join(root, 'identity.json')) ||
      existsSync(join(root, 'work.sqlite'))
    )
      throw Error('初期化済みです。statusで再開してください。');
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  privateWrite(join(root, 'agent.json'), c);
  privateWrite(join(root, 'identity.json'), {
    schema: 'noah.resale.cli-owner/1',
    owner: `terminal:${randomUUID()}`,
    mode: c.mode,
  });
  return root;
}
export function openRuntime(directory, environment = process.env) {
  const root = resolve(directory);
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())
    throw Error('通常の保存ディレクトリを指定してください。');
  chmodSync(root, 0o700);
  const config = settings(readJson(join(root, 'agent.json'))),
    identity = readJson(join(root, 'identity.json'));
  if (
    identity.schema !== 'noah.resale.cli-owner/1' ||
    !/^terminal:[\da-f-]{36}$/.test(identity.owner) ||
    identity.mode !== config.mode
  )
    throw Error(
      '保存先の本人ID/接続モードが不一致です。別モードは別の保存先で初期化してください。',
    );
  const dbPath = join(root, 'work.sqlite');
  if (
    existsSync(dbPath) &&
    (!lstatSync(dbPath).isFile() || lstatSync(dbPath).isSymbolicLink())
  )
    throw Error('保存DBは通常ファイルにしてください。');
  const db = new DatabaseSync(dbPath);
  chmodSync(dbPath, 0o600);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS work_jobs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS resale_cli_leases (name TEXT PRIMARY KEY,token TEXT NOT NULL,expires INTEGER NOT NULL)',
  );
  const repo = workStore({
    prepare(sql) {
      return {
        bind(...args) {
          const q = db.prepare(sql);
          return {
            async first() {
              return q.get(...args) || null;
            },
            async all() {
              return { results: q.all(...args) };
            },
            async run() {
              return { meta: { changes: Number(q.run(...args).changes) } };
            },
          };
        },
      };
    },
  });
  const env = {
    ...environment,
    RESALE_EBAY_ENV:
      config.mode === 'ebay-production' ? 'production' : 'sandbox',
  };
  const provider =
      config.mode === 'fixture' ? fixtureProvider() : ebayResaleProvider(env),
    service = resaleService(repo, provider, { transport: 'terminal' }),
    owner = identity.owner;
  const account = () =>
    digest({
      mode: config.mode,
      buyer: env.RESALE_EBAY_BUYER_TOKEN || '',
      seller: env.RESALE_EBAY_SELLER_TOKEN || '',
      location: env.RESALE_EBAY_LOCATION || '',
      fulfillment: env.RESALE_EBAY_FULFILLMENT_POLICY || '',
      payment: env.RESALE_EBAY_PAYMENT_POLICY || '',
      returns: env.RESALE_EBAY_RETURN_POLICY || '',
    });
  async function get() {
    return service.get(owner);
  }
  async function run(action, fields = {}) {
    const j = await get();
    return service.run(owner, { ...fields, action, revision: j.revision });
  }
  async function configure(c) {
    settings(c);
    if (c.mode !== config.mode)
      throw Error('モードの変更は別の保存先で初期化してください。');
    await run('configure', {
      currency: c.currency,
      budget: c.budget,
      perItemCap: c.perItemCap,
      confirm: true,
    });
    return run('searches', c.searches);
  }
  async function view() {
    const j = await get();
    return {
      mode: config.mode,
      simulated: config.mode === 'fixture',
      workspace: root,
      ready: provider.ready,
      revision: j.revision,
      paused: j.resale.paused,
      currency: j.resale.currency,
      totals: totals(j.resale),
      searches: j.resale.searches,
      scan: j.resale.scan,
      items: j.resale.items,
      operations: j.resale.operations,
    };
  }
  async function makeReview(
    action,
    itemId,
    operationId = randomUUID(),
    createdAt = Date.now(),
  ) {
    if (!['purchase', 'publish'].includes(action))
      throw Error('reviewはpurchase/publishを指定してください。');
    const j = await get(),
      i = item(j.resale, itemId),
      terms = action === 'purchase' ? i.checkout : i.listing;
    if (!terms) throw Error('購入見積または出品原稿を先に保存してください。');
    return {
      schema: 'noah.resale.cli-approval/1',
      owner,
      mode: config.mode,
      accountFingerprint: await account(),
      revision: j.revision,
      action,
      itemId,
      operationId,
      createdAt,
      expiresAt: createdAt + 300000,
      digest: await digest(terms),
      preview: { title: i.title, url: i.url, currency: i.currency, terms },
    };
  }
  async function execute(review, confirmation) {
    object(review, [
      'schema',
      'owner',
      'mode',
      'accountFingerprint',
      'revision',
      'action',
      'itemId',
      'operationId',
      'createdAt',
      'expiresAt',
      'digest',
      'preview',
    ]);
    if (
      !Number.isSafeInteger(review.createdAt) ||
      review.createdAt > Date.now() ||
      review.expiresAt !== review.createdAt + 300000 ||
      review.expiresAt <= Date.now()
    )
      throw Error('確認書の期限が切れています。reviewを作り直してください。');
    if (confirmation !== (await digest(review)))
      throw Error(
        '表示内容を確認し、確認書のSHA-256を--confirmで指定してください。',
      );
    const expected = await makeReview(
      review.action,
      review.itemId,
      review.operationId,
      review.createdAt,
    );
    if ((await digest(expected)) !== confirmation)
      throw Error(
        '保存先・接続アカウント・価格・状態・revisionが変わりました。reviewを作り直してください。',
      );
    return service.run(owner, {
      action: review.action,
      itemId: review.itemId,
      operationId: review.operationId,
      revision: review.revision,
      digest: review.digest,
      confirm: true,
    });
  }
  function claim(token, ttl) {
    const result = db
      .prepare(
        'INSERT INTO resale_cli_leases(name,token,expires) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE resale_cli_leases.expires<=? OR resale_cli_leases.token=?',
      )
      .run('watch', token, Date.now() + ttl, Date.now(), token);
    return Number(result.changes) === 1;
  }
  return {
    root,
    config,
    owner,
    get,
    run,
    configure,
    view,
    makeReview,
    execute,
    claim,
    release(token) {
      db.prepare('DELETE FROM resale_cli_leases WHERE name=? AND token=?').run(
        'watch',
        token,
      );
    },
    close() {
      db.close();
    },
  };
}
export const actionFields = {
  import: ['role', 'title', 'url', 'currency', 'price'],
  assess: ['itemId', 'resalePrice', 'costs', 'floorProfit', 'evidence'],
  receive: ['itemId', 'condition', 'notes'],
  draft: ['itemId', 'price', 'conditionCode', 'categoryId', 'images'],
  settlement: [
    'itemId',
    'reference',
    'gross',
    'fees',
    'shipping',
    'other',
    'refunds',
  ],
  record_purchase: ['itemId', 'reference', 'total'],
  record_listing: ['itemId', 'reference'],
  remove_candidate: ['itemId'],
  searches: ['street', 'archive', 'objects'],
};
export function parseAction(value) {
  const fields = actionFields[value?.action];
  if (!fields)
    throw Error(
      'applyで実行できない操作です。購入/公開にはreview→executeを使ってください。',
    );
  object(value, ['action', ...fields]);
  return { ...value, confirm: true };
}
