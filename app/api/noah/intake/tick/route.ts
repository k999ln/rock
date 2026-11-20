import { noahIntakeApi } from '@/lib/noah-intake-server';
// 巡回の合図（services/noah-patrol-wake）。署名つきの空の POST だけを受ける。
export const POST = (request: Request) => noahIntakeApi().tick(request);
