import { createNoahPinsApi } from '@/lib/noah-pins-api';
import { noahPinsDependencies } from '@/lib/noah-pins-server';
// ピンタレスト風の一覧（task 115）。lib/noah-pins-api.ts。
export const GET = (request: Request) => createNoahPinsApi(noahPinsDependencies())(request);
