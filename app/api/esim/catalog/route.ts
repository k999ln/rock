import { env } from 'cloudflare:workers';
import { readEsimPublicCatalog } from '@/lib/esim-public-catalog';
import { EsimPlanCatalogError } from '@/lib/esim-plan-catalog';
import { database } from '@/lib/fund-store';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

export async function GET() {
  const config = env as unknown as {
    ESIMGO_PLAN_CATALOG_JSON?: string;
    ESIM_PUBLIC_CATALOG_JSON?: string;
  };
  try {
    if (!config.ESIMGO_PLAN_CATALOG_JSON || !config.ESIM_PUBLIC_CATALOG_JSON)
      return json(await readEsimPublicCatalog(config.ESIMGO_PLAN_CATALOG_JSON, config.ESIM_PUBLIC_CATALOG_JSON));
    const registry = await skyToolPackageStore(database()).listRegistry();
    return json(await readEsimPublicCatalog(
      config.ESIMGO_PLAN_CATALOG_JSON,
      config.ESIM_PUBLIC_CATALOG_JSON,
      registry,
    ));
  } catch (error) {
    if (error instanceof EsimPlanCatalogError && error.code === 'CATALOG_NOT_CONFIGURED')
      return json({ commerceState: 'catalog_not_configured', purchaseEnabled: false, plans: [] });
    return json({ error: 'esim_catalog_unavailable', purchaseEnabled: false }, 503);
  }
}
