import { createNoahBoardsApi } from '@/lib/noah-pins-api';
import { noahPinsDependencies } from '@/lib/noah-pins-server';
// ボード（保存・公開・フォロー・表示しない。task 115）。lib/noah-pins-api.ts。
export const GET = (request: Request) => createNoahBoardsApi(noahPinsDependencies())(request);
export const POST = (request: Request) => createNoahBoardsApi(noahPinsDependencies())(request);
