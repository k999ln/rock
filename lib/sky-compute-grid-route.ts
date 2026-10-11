// Worker wiring of the Compute Grid API: the D1 binding, the deployment
// configuration, the existing session authentication and the Sky entitlement.
import { env } from 'cloudflare:workers';
import { database } from './fund-store';
import { requestRockstarUser } from './rockstar-device-link';
import { rockstarServiceScopeAllowed } from './rockstar-service-access';
import { computeGridApi } from './sky-compute-grid-api';

type Configuration = {
  SKY_COMPUTE_GRID_MODE?: string;
  SKY_COMPUTE_GRID_DATA_KEY?: string;
  ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string;
};

export function computeGridRouteApi() {
  const configuration = env as unknown as Configuration;
  const db = database();
  return computeGridApi({
    db,
    configuration,
    authenticate: (request) => requestRockstarUser(request, db),
    scopeAllowed: (ownerUserId, request) => rockstarServiceScopeAllowed(
      db, ownerUserId, 'sky', configuration.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request),
  });
}
