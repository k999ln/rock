import { noahFeedbackApi } from '@/lib/noah-feedback-server';
export const GET = (request: Request) => noahFeedbackApi(request)(request);
export const POST = GET;
