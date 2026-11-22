import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { readBoundedStream } from '@/lib/bounded-stream';
import { cloudBudget, readCloudSpend, type CloudBudgetEnv } from '@/lib/cloud-operations';
import { CloudTelemetryError, ingestCloudProbe, ingestCloudUsage } from '@/lib/cloud-operations-store';
import { database } from '@/lib/fund-store';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

function authorized(request: Request, source: 'usage' | 'probe') {
  const config = env as unknown as { CLOUD_USAGE_INGEST_TOKEN?: string; CLOUD_PROBE_TOKEN?: string };
  const expected = source === 'usage' ? config.CLOUD_USAGE_INGEST_TOKEN : config.CLOUD_PROBE_TOKEN;
  const candidate = /^Bearer ([A-Za-z0-9_-]{32,256})$/u.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!expected || config.CLOUD_USAGE_INGEST_TOKEN === config.CLOUD_PROBE_TOKEN ||
    !/^[A-Za-z0-9_-]{32,256}$/u.test(expected) || !candidate || request.headers.has('origin')) {
    return false;
  }
  const digest = (secret: string) => createHash('sha256').update(secret).digest();
  return timingSafeEqual(digest(expected), digest(candidate));
}

export async function GET(request: Request) {
  if (!authorized(request, 'probe')) return json({ error: 'not_found' }, 404);
  try {
    // Exercise the same D1 cost query as admission without reserving or dispatching work.
    const budget = cloudBudget(env as unknown as CloudBudgetEnv);
    const spend = await readCloudSpend(database(), 'synthetic:cloud-admission', Date.now());
    if (spend.unpriced > 0) return json({ cloudAdmissionReady: false }, 503);
    return json({
      cloudAdmissionReady: true,
      acceptsNewWork: spend.totalUsd < budget.totalUsd && spend.userUsd < budget.userUsd,
    });
  } catch {
    return json({ cloudAdmissionReady: false }, 503);
  }
}

export async function POST(request: Request) {
  const source = new URL(request.url).searchParams.get('source');
  if ((source !== 'usage' && source !== 'probe') || !authorized(request, source)) return json({ error: 'not_found' }, 404);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'invalid_body' }, 400);
    const body = await readBoundedStream(reader, 4096, () => new CloudTelemetryError(400));
    const value: unknown = JSON.parse(new TextDecoder().decode(body));
    const write = source === 'usage' ? ingestCloudUsage : ingestCloudProbe;
    const inserted = await write(database(), value, Date.now());
    return json({ inserted }, inserted ? 201 : 200);
  } catch (error) {
    if (error instanceof CloudTelemetryError) return json({ code: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'invalid_body' }, 400);
    return json({ error: 'telemetry_unavailable' }, 503);
  }
}
