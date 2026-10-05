import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { handleRockstarEntitlementDeliveryRequest } from '@/lib/rockstar-entitlement-delivery-http';

export const runtime = 'edge';

export async function GET(request: Request) {
  const configuration = env as unknown as {
    ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS?: string;
    ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string;
    ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS?: string;
  };
  return handleRockstarEntitlementDeliveryRequest(request, database(), configuration);
}

export async function POST(request: Request) {
  const configuration = env as unknown as {
    ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS?: string;
    ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string;
    ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS?: string;
  };
  return handleRockstarEntitlementDeliveryRequest(request, database(), configuration);
}

export async function PATCH(request: Request) {
  const configuration = env as unknown as {
    ROCKSTAR_ENTITLEMENT_DELIVERY_SELLERS?: string;
    ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string;
    ROCKSTAR_ENTITLEMENT_DELIVERY_CODE_KEYS?: string;
  };
  return handleRockstarEntitlementDeliveryRequest(request, database(), configuration);
}
