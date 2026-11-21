import { env } from 'cloudflare:workers';
import { requestUser } from './request-auth';
import { createNoahSessionApi } from './noah-esim-access';
import { parseEsimCloudPolicies, type EsimCloudConfig } from './esim-cloud-grant';

export function noahSessionApi() {
  const config = env as unknown as EsimCloudConfig;
  return createNoahSessionApi({
    authenticate: requestUser,
    esimConfigured: Boolean(config.ESIMGO_PLAN_CATALOG_JSON && config.ESIM_INSTALL_RECEIPT_KEYS && config.ESIM_DEVICE_GATEWAY_KEYS &&
      parseEsimCloudPolicies(config.ESIM_CLOUD_ACCESS_POLICIES_JSON).some(policy => policy.scopes.includes('noah'))),
  });
}
