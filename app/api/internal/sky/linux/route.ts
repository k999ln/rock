import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import {
  linuxServiceStore,
  type LinuxServiceConfig,
} from '@/lib/sky-linux-service-store';
import {
  verifyLinuxEnvelope,
  verifyLinuxWorker,
  linuxRequestText,
  LinuxServiceError,
  type LinuxEventKey,
  type LinuxCommand,
} from '@/lib/sky-linux-service';
import { serviceSetupStore } from '@/lib/rockstar-service-setup-store';
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  try {
    const config = env as unknown as LinuxServiceConfig,
      raw = await linuxRequestText(request, 60000);
    const value = JSON.parse(raw),
      keys = JSON.parse(
        config.SKY_LINUX_EVENT_KEYS_JSON ?? '[]',
      ) as LinuxEventKey[];
    if (!Array.isArray(keys) || keys.length > 100)
      throw new LinuxServiceError('TRUST_CONFIG_REQUIRED', 503);
    const store = linuxServiceStore(database(), config),
      now = Date.now();
    if (value.event) {
      const event = await verifyLinuxEnvelope(value, keys, 'live', now);
      await store.event(event, now, {
        keyId: value.keyId,
        signature: value.signature,
      });
      return json({ accepted: true });
    }
    const verified = await verifyLinuxWorker(value, keys, now),
      input = verified.request;
    const doc = await store.get(verified.ownerId);
    if (!doc || doc.payload.id !== input.workspaceId)
      throw new LinuxServiceError('WORKSPACE_MISMATCH', 403);
    if (input.action === 'status')
      return json({
        workspace: doc,
        setup:
          config.ROCKSTAR_SERVICE_SETUP_ENABLED === 'true'
            ? ((
                await serviceSetupStore(
                  database(),
                  config as LinuxServiceConfig & Record<string, unknown>,
                ).get(verified.ownerId)
              )?.payload.runtime ?? null)
            : null,
      });
    if (input.action === 'setup-ready') {
      await serviceSetupStore(
        database(),
        config as LinuxServiceConfig & Record<string, unknown>,
      ).runtimeReady(verified.ownerId, input, {
        keyId: value.keyId,
        signature: value.signature,
      });
      return json({ accepted: true });
    }
    if (!['claim', 'heartbeat', 'close-month'].includes(input.action))
      throw new LinuxServiceError('UNSUPPORTED_ACTION', 400);
    const result = await store.command(
      verified.ownerId,
      input.revision!,
      input as LinuxCommand,
      now,
      true,
    );
    return json({ workspace: result });
  } catch (error) {
    return json(
      {
        error:
          error instanceof LinuxServiceError
            ? error.message
            : 'EVIDENCE_NOT_ACCEPTED',
      },
      error instanceof LinuxServiceError ? error.status : 403,
    );
  }
}
