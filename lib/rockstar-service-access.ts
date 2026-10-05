import { rockstarEntitlementStore } from './rockstar-entitlement-claim.ts';

type Database = Pick<D1Database, 'prepare'>;

/** Preview stays compatible by default; launch environments opt into fail-closed scope checks. */
export async function rockstarServiceScopeAllowed(
  db: Database,
  ownerUserId: string,
  scope: string,
  enforcementSetting: unknown,
) {
  if (enforcementSetting !== 'true') return true;
  return rockstarEntitlementStore(db).hasActiveScope(ownerUserId, scope);
}

export function missingRockstarServiceScope(scope: string) {
  return Response.json({
    error: `RockstarOS ${scope}利用権を確認できません。購入claimを登録してください。`,
    code: 'SERVICE_ENTITLEMENT_REQUIRED',
  }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
