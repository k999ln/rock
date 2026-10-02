import { env } from 'cloudflare:workers';
import { resolveSkyOsPolicy } from '@/lib/sky-os-policy';

export function GET() {
  return Response.json(
    resolveSkyOsPolicy(env as unknown as Record<string, unknown>),
    {
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
