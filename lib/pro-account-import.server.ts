import { eveHistoryStore, eveHistoryOwnerBinding, eveThreadId, EveHistoryError, type EveHistoryKeys } from './eve-history.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { readBoundedStream } from './bounded-stream.ts';
import { ProImportError, proExact, proDecode, inspectProFile, proArchiveId, proFileMetadata, proPartId, proFilename, proSha256, PRO_FILE_LIMIT, PRO_CHUNK_SIZE, PRO_ARCHIVE_CONSENT, PRO_MANIFEST_ID } from './pro-account-import.ts';
import type { ZemaChatMessage } from './zema-chat-session.ts';

type Db = Parameters<typeof eveHistoryStore>[0];
type Manifest = ReturnType<typeof proFileMetadata> & { schema: 'pro-account-original/1'; consent: typeof PRO_ARCHIVE_CONSENT; createdAt: number };
type Store = ReturnType<typeof eveHistoryStore>;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
} });
const conflict = () => new ProImportError('IMPORT_CONFLICT', 409);
function manifestMessage(m: Manifest): ZemaChatMessage { return { id: PRO_MANIFEST_ID, side: 'me', text: JSON.stringify(m) }; }
async function readArchive(store: Store, id: string) {
  let first;
  try { first = await store.get(id); }
  catch (error) { if (error instanceof EveHistoryError && error.status === 404) return null; throw error; }
  const messages = [...first.session.messages]; let before = first.before;
  let pages = 1;
  while (before !== null) {
    if (++pages > 3) throw conflict();
    const next = await store.get(id, before);
    if (next.revision !== first.revision || next.before !== null && next.before >= before) throw conflict();
    messages.push(...next.session.messages); before = next.before;
  }
  if ((await store.get(id)).revision !== first.revision || first.remember || first.session.toolId !== 'sky-auto'
    || first.session.workflowStatus !== 'ready' || first.session.outcome !== null || first.session.agent !== undefined
    || messages.length > 118 || new Set(messages.map(m => m.id)).size !== messages.length
    || messages.some(m => m.side !== 'me' || m.tool !== undefined || m.suggestedTool !== undefined)) throw conflict();
  const raw = messages.find(m => m.id === PRO_MANIFEST_ID); if (!raw) throw conflict();
  let manifest: Manifest;
  try {
    const m = proExact(JSON.parse(raw.text), ['schema','consent','createdAt','filename','byteLength','fileSha256','contentSha256','operationId','requestDigest','chunkCount']);
    if (m.schema !== 'pro-account-original/1' || m.consent !== PRO_ARCHIVE_CONSENT
      || !Number.isSafeInteger(m.createdAt) || Number(m.createdAt) < 0 || m.createdAt !== first.session.createdAt
      || !Number.isSafeInteger(m.chunkCount) || Number(m.chunkCount) < 1 || Number(m.chunkCount) > 117) throw conflict();
    proFilename(m.filename);
    if (!Number.isSafeInteger(m.byteLength) || Number(m.byteLength) < 1 || Number(m.byteLength) > PRO_FILE_LIMIT
      || !['fileSha256','contentSha256','requestDigest'].every(k => typeof m[k] === 'string' && /^[a-f0-9]{64}$/.test(m[k] as string))
      || m.operationId !== `pro-local-${String(m.contentSha256)}`
      || m.chunkCount !== Math.ceil(4 * Math.ceil(Number(m.byteLength) / 3) / PRO_CHUNK_SIZE)) throw conflict();
    const expectedDigest = await proSha256(new TextEncoder().encode(JSON.stringify([
      'pro-account-original/1', m.filename, m.byteLength, m.fileSha256, m.contentSha256, m.operationId, PRO_ARCHIVE_CONSENT,
    ])));
    if (m.requestDigest !== expectedDigest) throw conflict();
    manifest = m as Manifest;
  } catch { throw conflict(); }
  const parts = new Map(messages.filter(m => m.id !== PRO_MANIFEST_ID).map(m => [m.id, m.text]));
  const saved = parts.size;
  if (saved > manifest.chunkCount) throw conflict();
  for (let i = 0; i < saved; i++) {
    const value = parts.get(proPartId(i));
    if (value === undefined || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > PRO_CHUNK_SIZE
      || i < manifest.chunkCount - 1 && value.length !== PRO_CHUNK_SIZE) throw conflict();
  }
  let fileBase64: string | undefined;
  if (saved === manifest.chunkCount) {
    fileBase64 = Array.from({ length: saved }, (_, i) => parts.get(proPartId(i))!).join('');
    const checked = await inspectProFile(manifest.filename, proDecode(fileBase64));
    if (JSON.stringify(proFileMetadata(checked)) !== JSON.stringify({ filename: manifest.filename, byteLength: manifest.byteLength,
      fileSha256: manifest.fileSha256, contentSha256: manifest.contentSha256, operationId: manifest.operationId,
      requestDigest: manifest.requestDigest, chunkCount: manifest.chunkCount })) throw conflict();
  }
  return { manifest, revision: first.revision, saved, parts, fileBase64 };
}
function response(id: string, value: Awaited<ReturnType<typeof readArchive>>) {
  if (!value) return { id, state: 'not_found', revision: 0, savedChunks: 0 };
  return { id, state: value.fileBase64 ? 'complete' : 'partial', revision: value.revision,
    savedChunks: value.saved, manifest: value.manifest, ...(value.fileBase64 ? { fileBase64: value.fileBase64 } : {}) };
}
/** Dependency injection permits real SQLite/HTTP auth negatives without production secrets. */
export function createProImportHandler(deps: {
  authenticate: (request: Request) => Promise<string>; database: () => Db; keys: () => EveHistoryKeys;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const owner = await deps.authenticate(request);
      if (request.method !== 'GET' && request.method !== 'POST') throw new ProImportError('METHOD', 405);
      const url = new URL(request.url);
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) throw new ProImportError('ORIGIN', 403);
      const keys = deps.keys();
      const [ownerScope, binding] = await Promise.all([ownerScopeFor(owner), eveHistoryOwnerBinding(owner, keys)]);
      if (request.method === 'GET' && !url.search) return json({ ownerScope, binding, destination: 'Private account archive', accountHint: ownerScope.slice(-8) });
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope || request.headers.get('X-Rock-Eve-Owner') !== binding)
        throw new ProImportError('OWNER_CHANGED', 409);
      const store = eveHistoryStore(deps.database(), owner, keys);
      if (request.method === 'GET') {
        if ([...url.searchParams.keys()].some(k => k !== 'id') || url.searchParams.getAll('id').length !== 1) throw new ProImportError('INVALID_INPUT');
        const id = eveThreadId(url.searchParams.get('id'));
        const value = await readArchive(store, id);
        if (value && await proArchiveId(ownerScope, value.manifest.operationId) !== id) throw conflict();
        return json(response(id, value));
      }
      if (url.search || request.headers.get('content-type') !== 'application/json') throw new ProImportError('INVALID_INPUT');
      const reader = request.body?.getReader(); if (!reader) throw new ProImportError('INVALID_INPUT');
      let body;
      try { body = proExact(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedStream(reader, 400000, () => new ProImportError('TOO_LARGE', 413)))), ['filename','fileBase64','operationId','expectedRevision','consent']); }
      finally { reader.releaseLock(); }
      if (body.consent !== PRO_ARCHIVE_CONSENT) throw new ProImportError('CONSENT_REQUIRED', 409);
      if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new ProImportError('INVALID_INPUT');
      const file = await inspectProFile(body.filename, proDecode(body.fileBase64));
      if (body.operationId !== file.operationId) throw new ProImportError('INVALID_INPUT');
      const id = await proArchiveId(ownerScope, file.operationId);
      const before = await readArchive(store, id);
      if (before) {
        if (JSON.stringify(proFileMetadata(file)) !== JSON.stringify({ filename: before.manifest.filename, byteLength: before.manifest.byteLength, fileSha256: before.manifest.fileSha256, contentSha256: before.manifest.contentSha256, operationId: before.manifest.operationId, requestDigest: before.manifest.requestDigest, chunkCount: before.manifest.chunkCount })) throw conflict();
        // Compare already persisted pieces as well as the digest before any append.
        for (let i = 0; i < before.saved; i++) if (before.parts.get(proPartId(i)) !== file.fileBase64.slice(i * PRO_CHUNK_SIZE, (i + 1) * PRO_CHUNK_SIZE)) throw conflict();
        if (before.fileBase64) return json(response(id, before));
      }
      if ((before?.revision ?? 0) !== body.expectedRevision) throw conflict();
      const manifest: Manifest = before?.manifest ?? { ...proFileMetadata(file), schema: 'pro-account-original/1', consent: PRO_ARCHIVE_CONSENT, createdAt: Date.now() };
      const messages: ZemaChatMessage[] = before ? [] : [manifestMessage(manifest)];
      for (let i = before?.saved ?? 0; i < manifest.chunkCount && messages.length < 16; i++)
        messages.push({ id: proPartId(i), side: 'me', text: file.fileBase64.slice(i * PRO_CHUNK_SIZE, (i + 1) * PRO_CHUNK_SIZE) });
      await store.save({ session: { version: 1, id, toolId: 'sky-auto', createdAt: manifest.createdAt,
        messages, activeRequest: null, workflowStatus: 'ready', outcome: null }, revision: body.expectedRevision, remember: false });
      return json(response(id, await readArchive(store, id)));
    } catch (error) {
      if (error instanceof ProImportError) return json({ error: error.code }, error.status);
      if (error instanceof EveHistoryError) return json({ error: error.status === 410 ? 'DELETED' : error.status === 409 ? 'IMPORT_CONFLICT' : 'UNAVAILABLE' }, error.status);
      if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: 'INVALID_INPUT' }, 400);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'UNAUTHORIZED' }, 401);
      if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'ORIGIN' }, 403);
      return json({ error: 'UNAVAILABLE' }, 503);
    }
  };
}
