import { noahResearchCatalog } from '@/lib/noah-research-catalog';
import { createNoahPublicCatalogApi } from '@/lib/noah-public-catalog-api';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return createNoahPublicCatalogApi(noahResearchCatalog)(request, (await params).id);
}
