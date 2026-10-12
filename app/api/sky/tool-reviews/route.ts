import { database } from '@/lib/fund-store';
import { requestSkyReviewer } from '@/lib/sky-review-auth';
import {
  parseSkyToolReview,
  skyToolReviewStore,
} from '@/lib/sky-tool-review';
import { SkySubmissionError } from '@/lib/sky-submission';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED_REVIEWER')
    return json({ error: '有効なSky審査者資格が必要です。' }, 401);
  if (error instanceof SyntaxError)
    return json({ error: '審査記録の形式を確認してください。' }, 400);
  return json({ error: 'Tool Packageを審査できませんでした。' }, 503);
}

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 32_768)
    throw new SkySubmissionError('審査記録は32 KB以下にしてください。', 413);
  return JSON.parse(raw) as unknown;
}

export async function GET(request: Request) {
  try {
    await requestSkyReviewer(request);
    const packageKey = new URL(request.url).searchParams.get('packageKey') ?? undefined;
    return json({ reviews: await skyToolReviewStore(database()).list(packageKey) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const reviewerId = await requestSkyReviewer(request);
    const reviewed = await skyToolReviewStore(database()).review(
      reviewerId,
      parseSkyToolReview(await body(request)),
    );
    return json(reviewed, 201);
  } catch (error) {
    return failure(error);
  }
}
