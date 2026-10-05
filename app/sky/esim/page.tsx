import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import EsimCatalog from '@/components/esim-catalog';
import { readEsimPublicCatalog, type EsimPublicCatalogState } from '@/lib/esim-public-catalog';
import { database } from '@/lib/fund-store';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

export const metadata: Metadata = {
  title: 'RockstarOS利用用 SIM/eSIM — Sky',
  description: 'RockstarOSサービス利用権と接続するSIM/eSIMプランの条件・提供状況を確認する。',
};

export default async function EsimCatalogPage() {
  const config = env as unknown as {
    ESIMGO_PLAN_CATALOG_JSON?: string;
    ESIM_PUBLIC_CATALOG_JSON?: string;
  };
  let initialCatalog: EsimPublicCatalogState | null = null;
  let initialError = false;
  try {
    if (config.ESIMGO_PLAN_CATALOG_JSON && config.ESIM_PUBLIC_CATALOG_JSON) {
      const registry = await skyToolPackageStore(database()).listRegistry();
      initialCatalog = await readEsimPublicCatalog(
        config.ESIMGO_PLAN_CATALOG_JSON,
        config.ESIM_PUBLIC_CATALOG_JSON,
        registry,
      );
    } else {
      initialCatalog = await readEsimPublicCatalog(config.ESIMGO_PLAN_CATALOG_JSON, config.ESIM_PUBLIC_CATALOG_JSON);
    }
  } catch {
    initialError = true;
  }
  return <EsimCatalog initialCatalog={initialCatalog} initialError={initialError} />;
}
