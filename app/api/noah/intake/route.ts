import { noahIntakeApi } from '@/lib/noah-intake-server';
// 系列の ID は `/` と `:` を含むので、パスに入れない（?id= で受ける）。
export const GET = (request: Request) => noahIntakeApi().handle(request);
export const POST = (request: Request) => noahIntakeApi().handle(request);
