import { eveRuntimeRecoveryPaused } from '@/lib/eve-runtime-recovery';
import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { eveHistoryKeys, EveHistoryError } from '@/lib/eve-history';
import { eveRuntimeSyncStore } from '@/lib/eve-runtime-sync';
import { rockstarDeviceLinkStore } from '@/lib/rockstar-device-link';
import {
  LinkedExecutionError,
  linkedFields,
  linkedId,
} from '@/lib/rockstar-linked-execution';
import { AdapterError } from '@/lib/rockstar-adapters';
import { readBoundedStream } from '@/lib/bounded-stream';

const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
async function handle(request: Request) {
  try {
    const db = database(), owner = await requestUser(request);
    const expectedOwner = request.headers.get('x-sky-owner');
    if (expectedOwner !== null && expectedOwner !== owner)
      return json({ error: 'アカウントが変わりました。元の仕事を確認してください。', code: 'OWNER_CHANGED' }, 409);
    const recoveryPaused=eveRuntimeRecoveryPaused((env as unknown as {EVE_RUNTIME_RECOVERY_MODE?:unknown}).EVE_RUNTIME_RECOVERY_MODE);
    const keys = eveHistoryKeys(
        (env as unknown as { EVE_HISTORY_KEYRING?: string })
          .EVE_HISTORY_KEYRING,
      ),
      store = eveRuntimeSyncStore(db, owner, keys, recoveryPaused);
    const auth = request.headers.get('authorization') ?? '';
    const device = auth.startsWith('Bearer rock_session_')
      ? await rockstarDeviceLinkStore(db).identity(auth.slice(7))
      : null;
    if (device && device.userId !== owner)
      throw new LinkedExecutionError('DEVICE_RECONNECT_REQUIRED', 401);
    if (request.method === 'GET') {
      const url = new URL(request.url),
        id = url.searchParams.get('id');
      const requestId = url.searchParams.get('requestId');
      if (url.searchParams.has('savedJobs')) {
        if (device) return json({error:'BROWSER_APPROVAL_REQUIRED'},403);
        if (url.searchParams.get('savedJobs') !== '1' || [...url.searchParams.keys()].some(key=>!['savedJobs','threadId','cursor'].includes(key))) return json({error:'REQUEST_QUERY_CONFLICT'},400);
        return json(await store.ownerPage(linkedId(url.searchParams.get('threadId')),url.searchParams.get('cursor')??''));
      }
      const preparationThreadId=url.searchParams.get('preparationThreadId');
      if(preparationThreadId!==null){
        if(id!==null||requestId!==null||url.searchParams.has('preparationId')||url.searchParams.has('agentPreparations'))return json({error:'REQUEST_QUERY_CONFLICT'},400);
        if(device)return json({error:'BROWSER_APPROVAL_REQUIRED'},403);
        return json(await store.preparations.listOwner(linkedId(preparationThreadId)));
      }
      const preparationId=url.searchParams.get('preparationId');
      if(preparationId!==null){if(id!==null||url.searchParams.has('requestId')||url.searchParams.has('agentPreparations'))return json({error:'REQUEST_QUERY_CONFLICT'},400);return json(await store.preparations.read(linkedId(preparationId),device?.id));}
      if(url.searchParams.has('agentPreparations')){if(url.searchParams.get('agentPreparations')!=='1'||id!==null||requestId!==null)return json({error:'REQUEST_QUERY_CONFLICT'},400);if(!device)return json({error:'APPROVED_DEVICE_REQUIRED'},403);return json({ownerUserId:owner,deviceId:device.id,preparations:await store.preparations.commands(device.id)});}

      if (requestId !== null) {
        if (id !== null) return json({ error: 'REQUEST_QUERY_CONFLICT' }, 400);
        return json(await store.inspectOwnerRequest(linkedId(requestId), device?.id));
      }
      if (id)
        return json({ execution: await store.read(linkedId(id), device?.id) });
      return json(
        device
          ? {
              ownerUserId: owner,
              deviceId: device.id,
              commands: await store.commands(device.id),
            }
          : {
              ownerUserId: owner,
              ...(recoveryPaused?{recovery:{state:'paused'}}:{}),
              devices: await store.devices(),
              pending: await store.pendingOwner(url.searchParams.get('threadId') ?? ''),
              executions: (
                await store.list(url.searchParams.get('threadId') ?? '')
              ).slice(0, 20),
            },
      );
    }
    if (request.headers.get('origin') !== new URL(request.url).origin)
      return json({ error: 'ORIGIN_REJECTED' }, 403);
    if(recoveryPaused)return json({error:'保存復旧の照合中です。端末実行と停止確認は保留しています。',code:'RUNTIME_RECOVERY_REQUIRED'},503);
    if (
      request.headers.get('content-type')?.split(';')[0] !== 'application/json'
    )
      return json({ error: 'JSON_REQUIRED' }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'BODY_REQUIRED' }, 400);
    let raw: unknown;
    try {
      raw = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await readBoundedStream(
            reader,
            120000,
            () => new LinkedExecutionError('BODY_TOO_LARGE', 413),
          ),
        ),
      );
    } finally {
      reader.releaseLock();
    }
    if (request.method === 'POST') {
      if (device) return json({ error: 'BROWSER_APPROVAL_REQUIRED' }, 403);
      return json(await store.enqueue(raw));
    }
    const value = raw as Record<string, unknown>;
    if(value?.action==='prepare-agent'){
      if(device)return json({error:'BROWSER_APPROVAL_REQUIRED'},403);
      linkedFields(raw,['action','request']);return json(await store.preparations.enqueue(value.request));
    }
    if(value?.action==='cancel-agent-preparation'){
      if(device)return json({error:'BROWSER_APPROVAL_REQUIRED'},403);
      linkedFields(raw,['action','id']);return json(await store.preparations.cancel(linkedId(value.id)));
    }
    if (value?.action === 'fence-start') {
      if (device) return json({error:'BROWSER_APPROVAL_REQUIRED'},403);
      linkedFields(raw,['action','request']);
      return json(await store.fenceStart(value.request));
    }
    if (value?.action === 'stop') {
      if (device) return json({ error: 'BROWSER_APPROVAL_REQUIRED' }, 403);
      linkedFields(raw, ['action', 'request']);
      return json(await store.requestStop(value.request));
    }
    if (!device) return json({ error: 'APPROVED_DEVICE_REQUIRED' }, 403);
    if(value?.action==='claim-agent-preparation'){
      linkedFields(raw,['action','claim']);return json(await store.preparations.claim(device.id,value.claim));
    }
    if(value?.action==='authorize-agent-preparation'){
      linkedFields(raw,['action','id','claimId']);return json(await store.preparations.authorize(device.id,linkedId(value.id),linkedId(value.claimId)));
    }
    if(value?.action==='unknown-agent-preparation'){
      linkedFields(raw,['action','receipt']);return json(await store.preparations.unknown(device.id,value.receipt));
    }
    if(value?.action==='ack-agent-preparation'){
      linkedFields(raw,['action','receipt']);return json(await store.preparations.acknowledge(device.id,value.receipt));
    }
    if (value?.action === 'stop-receipt') {
      linkedFields(raw, ['action', 'receipt']);
      return json(await store.stopReceipt(device.id, value.receipt));
    }
    if (value?.action === 'presence') {
      linkedFields(raw, ['action', 'presence']);
      return json(await store.presence(value.presence, device.id));
    }
    if (value?.action === 'claim') {
      linkedFields(raw, ['action', 'claim']);
      return json(await store.claim(device.id, value.claim));
    }
    if (value?.action === 'authorize') {
      linkedFields(raw, ['action', 'id', 'claimId']);
      return json(
        await store.authorize(
          device.id,
          linkedId(value.id),
          linkedId(value.claimId),
        ),
      );
    }
    if (value?.action === 'report') {
      linkedFields(raw, ['action', 'value']);
      return json(await store.publish(device.id, value.value));
    }
    if (value?.action === 'ack') {
      linkedFields(raw, ['action', 'id', 'claimId']);
      return json(
        await store.acknowledge(
          device.id,
          linkedId(value.id),
          linkedId(value.claimId),
        ),
      );
    }
    return json({ error: 'INVALID_RUNTIME_ACTION' }, 400);
  } catch (error) {
    if (
      error instanceof EveHistoryError ||
      error instanceof LinkedExecutionError
    )
      return json({ error: error.message }, error.status);
    if (error instanceof AdapterError) return json({ error: error.code }, 409);
    if (error instanceof SyntaxError || error instanceof TypeError)
      return json({ error: 'INVALID_RUNTIME_DATA' }, 400);
    if (error instanceof Error && error.message === 'ORIGIN')
      return json({ error: 'ORIGIN_REJECTED' }, 403);
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return json({ error: 'DEVICE_RECONNECT_REQUIRED' }, 401);
    return json({ error: 'RUNTIME_SYNC_UNAVAILABLE' }, 503);
  }
}
export const GET = handle;
export const PUT = handle;
export const POST = handle;
