import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createNoahReviewApi } from '@/lib/noah-launch-review';
export const GET=(r:Request)=>createNoahReviewApi({db:database(),authenticate:requestUser,bucket:(env as unknown as {BUCKET?:R2Bucket}).BUCKET,reviewers:((env as unknown as {NOAH_REVIEWER_USER_IDS?:string}).NOAH_REVIEWER_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean)})(r);
export const POST=GET;
