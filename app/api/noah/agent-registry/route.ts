import data from '@/data/noah-agent-registry.json';
import research from '@/data/noah-agent-connection-assessment.json';
import { createVerifiedRegistryApi, type VerifiedRegistry } from '@/lib/noah-verified-registry';
const byId = new Map(research.items.map(row => [row.id, row]));
export const GET = createVerifiedRegistryApi({ ...data, revision: data.revision + '-' + research.revision,
  products: data.products.map(product => ({ ...product, assessment: byId.get(product.id) })) } as VerifiedRegistry);
