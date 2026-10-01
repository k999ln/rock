import { env } from 'cloudflare:workers';
import { acceptCsvJob, csvApiError } from '@/lib/csv-job-store';
import { csvTrialPayments } from '@/lib/csv-trial-payment';
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 65536)
      return new Response(null, { status: 413 });
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536)
      return new Response(null, { status: 413 });
    return Response.json(
      await csvTrialPayments(env, acceptCsvJob).webhook(
        raw,
        request.headers.get('stripe-signature'),
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'STRIPE_SIGNATURE_INVALID' ||
        error instanceof SyntaxError)
    )
      return Response.json(
        { error: '決済通知を確認できません。' },
        { status: 400 },
      );
    return csvApiError(error);
  }
}
