import { database, requestUser } from '@/lib/fund-store';
import { createNoahPublisherApi } from '@/lib/noah-publisher';
import { env } from 'cloudflare:workers';
const api=()=>createNoahPublisherApi({db:database(),authenticate:requestUser,bucket:(env as unknown as {BUCKET?:R2Bucket}).BUCKET});
export async function GET(r: Request) { return api().list(r); }
export async function POST(r: Request) { return api().create(r); }
export async function PATCH(r: Request) { return api().transition(r); }
