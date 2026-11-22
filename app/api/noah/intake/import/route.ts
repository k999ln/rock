import { createIntakeImportApi } from '@/lib/noah-intake-import';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
// 手元で計算した取り込みの結果を、本番へ入れる（審査者だけ）。lib/noah-intake-import.ts。
export const POST = (request: Request) => createIntakeImportApi(noahIntakeDependencies())(request);
