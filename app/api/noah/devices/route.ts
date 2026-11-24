import { database, requestUser } from '@/lib/fund-store';
import { createNoahDevicePairing } from '@/lib/noah-device-pairing';
export const GET = (request: Request) => createNoahDevicePairing(database(), requestUser)(request);
export const POST = GET;
