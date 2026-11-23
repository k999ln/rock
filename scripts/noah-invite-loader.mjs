import { createNoahLocalRequest } from './noah-local-api.mjs';
import { readNoahSourceBytes, NOAH_SOURCE_DOWNLOAD_LIMIT } from './noah-source-bytes.mjs';
import { InstallError } from './noah-source-fetch.mjs';
import { isNoahInviteAgentId } from '../lib/noah-invite-contract.mjs';
import { parseNoahRuntime } from '../lib/noah-runtime-contract.mjs';

// Only invoked after the existing loopback Host/Origin/account checks.
export function inviteSourceLoader(incoming, scope, id, getOwner, fetcher = fetch) {
  if (!isNoahInviteAgentId(id)) throw new InstallError('招待IDを確認してください。', 400);
  const inviteId = id.slice(7), endpoint = `/api/noah/invites/${inviteId}`, request = createNoahLocalRequest(incoming, fetcher);
  const read = async () => {
    const owner = await getOwner(incoming);
    if (!owner.localHostOwner || owner.ownerScope !== scope) throw new InstallError('本人の接続が変わりました。', 403);
    const response = await request(endpoint), data = await response.json(), a = data.agent;
    if (!response.ok) throw new InstallError(data.error || '招待の実行許可を確認できません。', response.status);
    if (data.ownerScope !== scope || a?.inviteId !== inviteId || !a.executionAllowed || a.access !== 'source' || !a.source ||
      !Number.isSafeInteger(a.revision) || a.revision < 1 || !Number.isSafeInteger(a.expiresAt) || a.expiresAt <= Date.now()) throw new InstallError('招待の実行許可・期限を確認できません。', 403);
    const runtime = parseNoahRuntime(a.manifest?.runtime);
    return { id, manifest: a.manifest, manifestSha256: a.manifestSha256, source: a.source, uploadState: 'ready',
      invite: { inviteId, uploadId: a.uploadId, manifestSha256: a.manifestSha256, sourceSha256: a.source.sha256, runtime, revision: a.revision, expiresAt: a.expiresAt } };
  };
  return async download => {
    const agent = await read(); if (!download) return { agent };
    if (agent.source.bytes > NOAH_SOURCE_DOWNLOAD_LIMIT) throw new InstallError('コードの容量が実行上限を超えています。', 413);
    const response = await request(endpoint + '/source');
    if (!response.ok || !response.body || response.headers.get('x-content-sha256') !== agent.source.sha256) throw new InstallError('招待されたコードを取得できません。', response.ok ? 409 : response.status);
    const bytes = await readNoahSourceBytes(response, agent.source.bytes, { mismatch: '招待の版・許可が変わりました。' });
    if (JSON.stringify(agent) !== JSON.stringify(await read())) throw new InstallError('招待の版・許可が変わりました。', 409);
    return { agent, bytes };
  };
}

// Independent of page visibility. Await the runner's abort/teardown before reporting failure.
export async function runWithInviteGrant({ run, revalidate, expiresAt, input, intervalMs = 2000 }) {
  const controller = new AbortController(); let authorityError, timer, deadline, done = false; let pending = Promise.resolve();
  const fail = error => { authorityError ??= error; controller.abort(error); };
  const expire = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) fail(new InstallError('招待の有効期限が切れたため実行を停止しました。', 403));
    else deadline = setTimeout(expire, Math.min(remaining, 2147483647));
  };
  const check = async () => {
    try { await revalidate(); } catch (e) { if (!done) fail(e); }
    if (!done && !controller.signal.aborted) timer = setTimeout(() => { pending = check(); }, intervalMs);
  };
  try {
    await revalidate(); expire();
    if (!controller.signal.aborted) timer = setTimeout(() => { pending = check(); }, intervalMs);
    const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
    signal.throwIfAborted();
    const result = await run({ ...input, signal });
    done = true; clearTimeout(timer); await pending;
    if (authorityError) throw authorityError;
    await revalidate();
    if (Date.now() >= expiresAt) throw new InstallError('招待の有効期限が切れました。', 403);
    return result;
  } catch (e) { throw authorityError || e; }
  finally { done = true; clearTimeout(timer); clearTimeout(deadline); await pending; }
}
