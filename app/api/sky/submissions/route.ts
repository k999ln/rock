import { database, requestUser } from '@/lib/fund-store';
import { parseSkySubmission, SkySubmissionError } from '@/lib/sky-submission';
import { skySubmissionStore } from '@/lib/sky-submission-store';
import {
  inspectRemoteMcp,
  McpInspectionError,
} from '@/lib/mcp-inspection';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

async function body(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16_384)
    throw new SkySubmissionError('掲載情報は16 KB以下にしてください。', 413);
  return JSON.parse(raw) as unknown;
}

function failure(error: unknown) {
  if (error instanceof SkySubmissionError)
    return json({ error: error.message }, error.status);
  if (error instanceof McpInspectionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると掲載申請を保存できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このSky画面から申請してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力形式を確認してください。' }, 400);
  return json({ error: '掲載申請を保存できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    return json({
      submissions: await skySubmissionStore(database()).list(
        await requestUser(request),
      ),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const submission = parseSkySubmission(await body(request));
    const mcpInspection =
      submission.connectionType === 'mcp_streamable_http'
        ? await inspectRemoteMcp(submission.endpointUrl)
        : null;
    if (mcpInspection?.status === 'unreachable')
      throw new SkySubmissionError(mcpInspection.message, 422);
    const saved = await skySubmissionStore(database()).create(user, submission);
    if (!saved)
      throw new SkySubmissionError('同じ掲載IDが使用されています。', 409);
    return json({ submission: saved, mcpInspection }, 201);
  } catch (error) {
    return failure(error);
  }
}
