import data from '@/data/noah-agent-registry.json';
import { createVerifiedRegistryApi, type VerifiedRegistry } from '@/lib/noah-verified-registry';
export const GET = createVerifiedRegistryApi(data as VerifiedRegistry);
