import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { persistEsimGoWebhook, readEsimGoV3Request } from '@/lib/esimgo-webhook';

function response(status: number, body: unknown) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const config = env as unknown as {
    ESIMGO_API_KEY?: string;
    ESIMGO_CALLBACK_DEDUPE_SECRET?: string;
    ESIMGO_PROFILE_HASH_SECRET?: string;
  };
  try {
    const event = await readEsimGoV3Request(
      request, config.ESIMGO_API_KEY, config.ESIMGO_CALLBACK_DEDUPE_SECRET,
      config.ESIMGO_PROFILE_HASH_SECRET,
    );
    const status = await persistEsimGoWebhook(database(), event, Date.now());
    return response(200, { received: true, duplicate: status === 'duplicate' });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'BODY_SIZE') return response(413, { error: 'payload_too_large' });
    if (code === 'WEBHOOK_NOT_CONFIGURED') return response(503, { error: 'webhook_not_configured' });
    if (code === 'INVALID_SIGNATURE') return response(401, { error: 'invalid_signature' });
    if (code === 'INVALID_BODY' || code === 'INVALID_EVENT_TYPE')
      return response(400, { error: 'invalid_payload' });
    return response(503, { error: 'temporarily_unavailable' });
  }
}
