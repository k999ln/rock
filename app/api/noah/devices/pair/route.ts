import { database, requestUser } from '@/lib/fund-store';
import { createNoahDevicePairing } from '@/lib/noah-device-pairing';
export const POST = (request: Request) => createNoahDevicePairing(database(), requestUser)(request);
