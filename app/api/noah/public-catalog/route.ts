import { noahResearchCatalog } from '@/lib/noah-research-catalog';
import { createNoahPublicCatalogApi } from '@/lib/noah-public-catalog-api';
export const GET = (request: Request) => createNoahPublicCatalogApi(noahResearchCatalog)(request);
