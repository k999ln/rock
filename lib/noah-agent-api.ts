import { prepareDraftRegistration, finishDraftRegistration } from './noah-draft-registration.ts';
import type { DraftBucket } from './noah-draft-storage.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { NOAH_CODE_LIMIT, NOAH_MANIFEST_LIMIT, NOAH_SOURCE_LIMIT, NoahAgentError, noahSha256, noahUploadId, parseNoahAgentManifest } from './noah-agent-upload.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { refactorNoahSource } from './noah-upload-refactor.ts';
import { createNoahBrowserQuota, NOAH_BROWSER_QUOTA_MESSAGE, noahBrowserOwner } from './noah-browser-quota.ts';
import { importNoahSource } from './noah-source-import.ts';
import type { ProcessingReference, ProcessingResolver } from './noah-processing-receipt.ts';

export async function boundedNoahBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new NoahAgentError('送信内容がありません。');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw new NoahAgentError('アップロードの上限を超えています。定義は32KiB、ファイルは10MiB、貼り付けコードは64KiBまでです。', 413); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function createNoahAgentApi(deps: {
  authenticate: (request: Request) => Promise<string>;
  db: Pick<D1Database, 'prepare'>;
  bucket?: DraftBucket;
  fetcher?: typeof fetch;
  resolveProcessing?: ProcessingResolver;
}) {
  async function owner(request: Request, mutate = false) {
    const user = await deps.authenticate(request);
    if (mutate) {
      if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
      if (request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(user))
        throw new NoahAgentError('アカウントが変わったか確認できません。画面を開き直してください。', 409);
    }
    return user;
  }
  async function respond(work: () => Promise<Response>) {
    try { return await work(); }
    catch (e) {
      if (e instanceof NoahAgentError) return json({ error: e.message }, e.status);
      if (e instanceof SyntaxError) return json({ error: 'Agent定義のJSON形式を確認してください。' }, 400);
      if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'サインインすると自分のAgentを保存できます。' }, 401);
      if (e instanceof Error && e.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
      return json({ error: '保存先に接続できません。入力を残したまま再試行してください。' }, 503);
    }
  }
  return {
    importSource: (request: Request) => respond(async () => {
      const user = await owner(request, true);
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで取得先を指定してください。', 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 2048)));
      // GitHub・Hugging Face の API の枠は Noah 全体で共有する。ブラウザだけの本人を全員まとめた 1 日の上限（task 129 の D1）。
      if (!(await createNoahBrowserQuota(deps.db).take(user, 'imports'))) throw new NoahAgentError(NOAH_BROWSER_QUOTA_MESSAGE, 429);
      const result = await importNoahSource(input, deps.fetcher);
      return new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="${result.name}"`, 'X-Noah-Source-Commit': result.record.commit,
        'X-Noah-Source-Files': String(result.record.files.length), 'X-Noah-Source-Omitted': String(result.record.omittedFiles), 'X-Noah-Source-SHA256': await noahSha256(result.bytes) } });
    }),
    list: (request: Request) => respond(async () => {
      const user = await owner(request);
      return json({ agents: await noahAgentStore(deps.db, user).list(), ownerScope: await ownerScopeFor(user) });
    }),
    get: (request: Request, id: string) => respond(async () => {
      const user = await owner(request); const agent = await noahAgentStore(deps.db, user).get(noahUploadId(id));
      if (!agent) throw new NoahAgentError('Agentが見つかりません。', 404);
      return json({ agent, ownerScope: await ownerScopeFor(user) });
    }),
    create: (request: Request) => respond(async () => {
      const user = await owner(request, true);
      const multipart = request.headers.get('content-type')?.startsWith('multipart/form-data;');
      if (!multipart && !request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONまたはアップロードフォームを使ってください。', 415);
      const bytes = await boundedNoahBody(request, multipart ? NOAH_SOURCE_LIMIT + NOAH_MANIFEST_LIMIT + 8192 : NOAH_MANIFEST_LIMIT + NOAH_CODE_LIMIT * 6 + 2048);
      let input: Record<string, unknown>; let file: File | null = null;
      if (multipart) {
        let form: FormData;
        try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
        catch { throw new NoahAgentError('アップロード形式を確認してください。'); }
        if ([...form.keys()].some(k => !['id', 'manifest', 'rightsConfirmed', 'source', 'processingReceipt', 'draft'].includes(k) || form.getAll(k).length !== 1)) throw new NoahAgentError('重複または未対応の項目があります。');
        const raw = form.get('manifest');
        if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > NOAH_MANIFEST_LIMIT) throw new NoahAgentError('定義JSONは32KiBまでです。', 413);
        input = { id: form.get('id'), manifest: JSON.parse(raw), rightsConfirmed: form.get('rightsConfirmed') === 'true' };
        const receipt = form.get('processingReceipt');
        if (receipt !== null) { if (typeof receipt !== 'string' || receipt.length > 512) throw new NoahAgentError('整理結果の確認情報を確認してください。'); input.processingReceipt = JSON.parse(receipt); }
        const draft = form.get('draft');
        if (draft !== null) { if (typeof draft !== 'string' || draft.length > 200) throw new NoahAgentError('下書きの参照を確認してください。'); input.draft = JSON.parse(draft); }
        const source = form.get('source');
        if (source !== null) {
          if (typeof source === 'string') throw new NoahAgentError('コードまたは配布ファイルを選んでください。');
          file = source;
        }
      } else {
        try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { throw new NoahAgentError('JSONはUTF-8形式で入力してください。'); }
      }
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id', 'manifest', 'rightsConfirmed', 'code', 'processingReceipt', 'draft'].includes(k)) || input.rightsConfirmed !== true)
        throw new NoahAgentError('登録内容とファイルを保存する権利を確認してください。');
      if (input.code !== undefined) {
        const code = input.code as { name?: unknown; content?: unknown };
        if (!code || typeof code !== 'object' || Array.isArray(code) || Object.keys(code).some(k => !['name', 'content'].includes(k)) || typeof code.name !== 'string' || typeof code.content !== 'string') throw new NoahAgentError('貼り付けるコードとファイル名を指定してください。');
        const content = new TextEncoder().encode(code.content);
        if (content.byteLength > NOAH_CODE_LIMIT) throw new NoahAgentError('貼り付けコードは64KiBまでです。', 413);
        file = new File([content], code.name);
      }
      if (new TextEncoder().encode(JSON.stringify(input.manifest)).length > NOAH_MANIFEST_LIMIT) throw new NoahAgentError('定義JSONは32KiBまでです。', 413);
      const id = noahUploadId(input.id), manifest = parseNoahAgentManifest(input.manifest);
      const processingReference = input.processingReceipt as ProcessingReference | undefined;
      if (processingReference !== undefined && (!processingReference || typeof processingReference !== 'object' || Array.isArray(processingReference) || Object.keys(processingReference).some(k => !['id', 'token'].includes(k)) || processingReference.id !== id || !/^[a-f0-9]{64}$/.test(processingReference.token))) throw new NoahAgentError('整理結果と登録IDを確認してください。');
      const manifestSha256 = await noahSha256(new TextEncoder().encode(JSON.stringify(manifest)));
      let source: { key: string; name: string; bytes: number; sha256: string } | null = null;
      let sourceBytes: Uint8Array | null = null;
      if (file) {
        if (file.size > NOAH_SOURCE_LIMIT) throw new NoahAgentError('ファイルは10MiBまでです。', 413);
        if (file.size < 4) throw new NoahAgentError('ファイルは4バイト以上で指定してください。');
        if (!/^[^/\\]{1,120}$/u.test(file.name) || file.name.startsWith('.') || Array.from(file.name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new NoahAgentError('パスや隠しファイルを含まないファイル名を指定してください。');
        sourceBytes = new Uint8Array(await file.arrayBuffer());
        if (/\.zip$/i.test(file.name) && (sourceBytes[0] !== 0x50 || sourceBytes[1] !== 0x4b ||
          !((sourceBytes[2] === 3 && sourceBytes[3] === 4) || (sourceBytes[2] === 5 && sourceBytes[3] === 6)))) throw new NoahAgentError('ZIP形式を確認してください。');
        if (!deps.bucket) throw new NoahAgentError('ファイル保存先が未設定です。接続先URLのみの登録は利用できます。', 503);
        const sha256 = await noahSha256(sourceBytes), namespace = await noahSha256(new TextEncoder().encode(user));
        source = { key: `noah/private/${namespace}/${id}/${sha256}`, name: file.name, bytes: file.size, sha256 };
      }
      if (manifest.adapter === 'source' && !source) throw new NoahAgentError('ソース登録にはコードまたはファイルが必要です。');
      if (processingReference && (!source || !deps.resolveProcessing)) throw new NoahAgentError('原本または整理結果の確認先がありません。', 503);
      const store = noahAgentStore(deps.db, user);
      // 新しい登録だけ、ブラウザだけの本人を全員まとめた 1 日の上限に数える（task 129 の D1）。同じ ID の送り直しは数えない。
      if (noahBrowserOwner(user) && !(await store.get(id))) {
        const quota = createNoahBrowserQuota(deps.db);
        if (!(await quota.take(user, 'agents')) || (sourceBytes && !(await quota.take(user, 'uploadBytes', sourceBytes.byteLength))))
          throw new NoahAgentError(NOAH_BROWSER_QUOTA_MESSAGE, 429);
      }
      const draft = await prepareDraftRegistration(deps.db, deps.bucket, user, input.draft, { id, manifest, source });
      const reserved = await store.reserve({ id, manifest, manifestSha256, source });
      let agent = reserved.upload;
      if (processingReference && agent.uploadState === 'ready' && agent.processing?.engine !== 'noah-project-refactor/1') throw new NoahAgentError('この登録IDは別の整理方式で保存済みです。新しいIDで登録してください。', 409);
      if (agent.uploadState === 'pending' && source && sourceBytes) {
        // Reserve before R2 so failed uploads remain owned, bounded and retryable.
        await deps.bucket!.put(source.key, sourceBytes, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { sha256: source.sha256 } });
        const processed = processingReference ? await deps.resolveProcessing!(request, processingReference, { id, name: source.name, sha256: source.sha256, user }) : await refactorNoahSource(source.name, sourceBytes);
        const digest = await noahSha256(processed.bytes);
        const result = { ...source, key: source.key.slice(0, source.key.lastIndexOf('/') + 1) + digest, bytes: processed.bytes.byteLength, sha256: digest };
        if (digest !== source.sha256) await deps.bucket!.put(result.key, processed.bytes, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { sha256: digest } });
        agent = await store.complete(id, result, processed.report);
      }
      const draftCleanup = await finishDraftRegistration(deps.db, deps.bucket, user, id, draft);
      return json({ agent, draftCleanup }, reserved.created ? 201 : 200);
    }),
    remove: (request: Request, id: string) => respond(async () => {
      const user = await owner(request, true); await noahAgentStore(deps.db, user).remove(noahUploadId(id));
      return json({ removed: true });
    }),
    download: (request: Request, id: string) => respond(async () => {
      const user = await owner(request); const store = noahAgentStore(deps.db, user);
      const variant = new URL(request.url).searchParams.get('variant');
      if (variant !== null && variant !== 'original') throw new NoahAgentError('ダウンロードの種類を確認してください。');
      const agent = await store.get(noahUploadId(id)), key = await store.sourceKey(id, variant === 'original');
      const source = variant === 'original' ? agent?.original : agent?.source;
      if (!source || !key) throw new NoahAgentError('ダウンロードできるファイルがありません。', 404);
      const object = await deps.bucket?.get(key);
      if (!object) throw new NoahAgentError('ファイル保存先に接続できません。', 503);
      return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="agent-source"; filename*=UTF-8''${encodeURIComponent(source.name)}`,
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-SHA256': source.sha256 } });
    }),
  };
}
