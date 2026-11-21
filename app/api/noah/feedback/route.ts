import { noahFeedbackApi } from '@/lib/noah-feedback-server';
export const GET = (request: Request) => noahFeedbackApi()(request);
export const POST = GET;
