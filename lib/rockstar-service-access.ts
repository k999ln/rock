import { requestUsesEsimCloudIdentity } from './request-auth.ts';
import { rockstarEntitlementStore } from './rockstar-entitlement-claim.ts';
import { esimCloudAccessStore, esimCloudRequestToken } from './esim-cloud-access.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;

/** Preview stays compatible by default; launch environments opt into fail-closed scope checks. */
export async function rockstarServiceScopeAllowed(
  db: Database,
  ownerUserId: string,
  scope: string,
  enforcementSetting: unknown,
  cloudConfig?: unknown,
  request?: Request,
) {
  // A cloud credential cannot inherit broader scopes from another account entitlement.
  const secret = request && esimCloudRequestToken(request);
  if (request && requestUsesEsimCloudIdentity(request)) {
    try { return await esimCloudAccessStore(db, cloudConfig).authenticate(secret ?? '', scope) === ownerUserId; }
    catch { return false; }
  }
  if (enforcementSetting !== 'true') return true;
  if (await rockstarEntitlementStore(db).hasActiveScope(ownerUserId, scope)) return true;
  return cloudConfig ? esimCloudAccessStore(db, cloudConfig).hasScope(ownerUserId, scope) : false;
}

export function missingRockstarServiceScope(scope: string) {
  return Response.json({
    error: `RockstarOS ${scope}利用権を確認できません。購入claimの登録またはeSIMクラウドアクセスの状態を確認してください。`,
    code: 'SERVICE_ENTITLEMENT_REQUIRED',
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
