import { noahOutboxApi } from '@/lib/noah-outbox-server';
export const GET=(request:Request)=>noahOutboxApi()(request);
export const POST=GET;
