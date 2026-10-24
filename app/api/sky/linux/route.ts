import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { requestDeveloperUser } from '@/lib/sky-developer-auth';
import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from '@/lib/sky-linux-service-store';
import {
  linuxMonthTotal,
  linuxPeriod,
  parseLinuxTerms,
  linuxRequestText,
  LinuxServiceError,
  type LinuxCommand,
} from '@/lib/sky-linux-service';
import { sha256Hex } from '@/lib/rockstar-entitlement-claim';
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof LinuxServiceError)
    return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return json({ error: 'JSON形式を確認してください。' }, 400);
  if (
    error instanceof Error &&
    ['UNAUTHORIZED', 'ORIGIN'].includes(error.message)
  )
    return json(
      { error: 'サインインしてSkyから操作してください。' },
      error.message === 'ORIGIN' ? 403 : 401,
    );
  return json(
    { error: '専用Linuxの状態を確認できません。再読み込みしてください。' },
    503,
  );
}
async function ownerResponse(
  store: ReturnType<typeof linuxServiceStore>, owner: string,
  expected?: Awaited<ReturnType<typeof store.command>>,
) {
  // A missing/unknown adapter is a denied projection, never a legacy body fallback.
  try {
    const view = typeof store.ownerResponse === 'function' ? await store.ownerResponse(owner, expected) : null;
    return view?.workspace && view.access?.canRead === true
      ? view : { workspace: null, access: null };
  } catch { return { workspace: null, access: null }; }
}
async function mutationResponse(
  store: ReturnType<typeof linuxServiceStore>, owner: string,
  saved: Awaited<ReturnType<typeof store.command>>, status = 200,
) {
  const view = await ownerResponse(store, owner, saved);
  return json({ accepted: true, revision: saved.revision, ...view,
    ...(view.workspace ? {} : { reconciliation: 'refresh_required' }) }, status);
}
export async function GET(request: Request) {
  try {
    const config = env as unknown as LinuxServiceConfig,
      store = linuxServiceStore(database(), config);
    const owner = await requestUser(request);
    const terms = config.SKY_LINUX_SERVICE_TERMS_JSON
      ? parseLinuxTerms(JSON.parse(config.SKY_LINUX_SERVICE_TERMS_JSON))
      : null;
    // Collect unrelated metadata first, so the fresh disclosure projection is
    // the last awaited operation before serialization of private workspace data.
    const termsDigest = terms ? await sha256Hex(JSON.stringify(terms)) : null,
      catalog = await store.catalog(),
      eligibleOrders = await store.eligibleOrders(owner),
      creatorEarnings = await store.creatorEarnings(owner);
    const { workspace: doc, access } = await ownerResponse(store, owner);
    let currentMonthMaximumMinor: number | null = null;
    if (doc && access?.reason !== 'dispatch_schema_unsupported') {
      try { currentMonthMaximumMinor = linuxMonthTotal(doc.payload, linuxPeriod(Date.now())); }
      catch { /* Dispatch metadata is not the retained-data ACL. */ }
    }
    return json({
      plan: { name: 'Sky Linux 16', currency: 'USD', baseMinor: 1600 },
      enabled: config.SKY_LINUX_SERVICE_ENABLED === 'true',
      terms,
      termsDigest,
      catalog,
      eligibleOrders,
      workspace: doc,
      creatorEarnings,
      access,
      currentMonthMaximumMinor,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const db = database(),
      owner = await requestUser(request),
      raw = await linuxRequestText(request, 48000);
    const value = JSON.parse(raw),
      store = linuxServiceStore(db, env as unknown as LinuxServiceConfig);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError();
    if (value.action === 'register') {
      const developer = await requestDeveloperUser(request, db);
      if (developer !== owner || value.rightsAccepted !== true)
        throw new LinuxServiceError('作者と権利・料金の確認が必要です。', 403);
      return json({ listing: await store.register(owner, value.listing) }, 201);
    }
    if (value.action === 'accept')
      return mutationResponse(store, owner, await store.accept(owner, value), 201);
    if (!['add', 'run', 'cancel', 'confirm'].includes(value.action))
      throw new LinuxServiceError('対応する操作を選んでください。', 400);
    const fields: Record<string, string[]> = {
      add: ['action', 'revision', 'listingId'],
      run: ['action', 'revision', 'listingId', 'requestId', 'input', 'maximumMinor', 'cpuLimitMs', 'accepted'],
      cancel: ['action', 'revision', 'jobId'],
      confirm: ['action', 'revision', 'jobId'],
    };
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 ||
      Object.keys(value).length !== fields[value.action].length ||
      Object.keys(value).some(key => !fields[value.action].includes(key))) throw new SyntaxError();
    return mutationResponse(store, owner,
      await store.command(owner, value.revision, value as LinuxCommand));
  } catch (error) {
    return failure(error);
  }
}
