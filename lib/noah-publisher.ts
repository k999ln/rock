import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';
import { SkySubmissionError } from './sky-submission.ts';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from './sky-tool-package.ts';
import { skyToolPackageStore, type SkyToolPackageStatus } from './sky-tool-package-store.ts';
import { stageNoahReleaseSource, noahPublicationSourceReference } from './noah-release.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const states: SkyToolPackageStatus[] = ['submitted','published_declared','verified','rejected','revoked'];
export function createNoahPublisherApi(deps: { db: Pick<D1Database,'prepare'>; authenticate: (r: Request) => Promise<string>; bucket?: Pick<R2Bucket, 'get' | 'put'> }) {
  const store = skyToolPackageStore(deps.db);
  async function handle(request: Request, mutation: boolean, fn: (owner: string) => Promise<Response>) {
    try {
      const owner = await deps.authenticate(request);
      if (mutation && request.headers.get('origin') !== new URL(request.url).origin) throw new SkySubmissionError('同じNoahから操作してください。',403);
      if (mutation && request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(owner)) throw new SkySubmissionError('アカウントが変わりました。再読込してください。',409);
      return await fn(owner);
    } catch (e) {
      if (e instanceof SkySubmissionError || e instanceof NoahAgentError) return json({error:e.message}, e.status);
      if (e instanceof SyntaxError || e instanceof TypeError) return json({error:'公開仕様のJSON形式を確認してください。'},400);
      if (e instanceof Error && e.message==='UNAUTHORIZED') return json({error:'サインインすると公開仕様を管理できます。'},401);
      return json({error:'公開仕様を確認できません。再試行してください。'},503);
    }
  }
  async function input(request: Request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SkySubmissionError('JSONで操作してください。',415);
    const v: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await boundedNoahBody(request,131072)));
    if (!v || typeof v!=='object' || Array.isArray(v)) throw new SkySubmissionError('公開仕様を確認してください。');
    return v as Record<string,unknown>;
  }
  return {
    list: (r: Request) => handle(r,false,async owner=>json({packages:await store.listOwner(owner),ownerScope:await ownerScopeFor(owner)})),
    create: (r: Request) => handle(r,true,async owner=>{
      const v=await input(r);
      const c=v.confirmations as Record<string,unknown> | undefined;
      if (Object.keys(v).some(k=>!['manifest','confirmations','upload'].includes(k)) || !c || ['rights','pricing','sideEffects','tests'].some(k=>c[k]!==true)) throw new SkySubmissionError('権利・料金・副作用・テスト内容を確認してください。');
      const manifest=parseSkyToolPackage(v.manifest);
      if (manifest.source.artifact) throw new SkySubmissionError('配布ファイルは登録済みAgentの選択から指定してください。');
      if (v.upload !== undefined) {
        if (c.distributeSource !== true) throw new SkySubmissionError('選択した保存版コードを購入者・利用権を持つ人に配布することを確認してください。');
        const ref=noahPublicationSourceReference(v.upload), existing=await store.getOwner(owner,skyToolPackageKey(manifest)), artifact=existing?.manifest.source.artifact;
        if (artifact && artifact.uploadId===ref.id && artifact.uploadManifestSha256===ref.manifestSha256 && artifact.sha256===ref.sourceSha256) manifest.source.artifact=artifact;
        else manifest.source.artifact = await stageNoahReleaseSource(deps,owner,v.upload);
      }
      const validated = parseSkyToolPackage(manifest);
      const hash=await skyToolPackageSha256(validated), key=skyToolPackageKey(validated);
      const created=await store.create(owner,validated);
      const saved=created || await store.getOwner(owner,key);
      if (!saved || saved.manifestSha256!==hash) throw new SkySubmissionError('このIDまたは版は使用済みです。同じ所有者の新しい版で登録してください。',409);
      // An identical retry returns the current state; it never resurrects a withdrawn version.
      return json({package:saved,ownerScope:await ownerScopeFor(owner)},created?201:200);
    }),
    transition: (r: Request) => handle(r,true,async owner=>{
      const v=await input(r);
      if (Object.keys(v).some(k=>!['action','packageKey','manifestSha256','status'].includes(k)) || !['submit','withdraw'].includes(String(v.action)) || typeof v.packageKey!=='string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@[0-9]+\.[0-9]+\.[0-9]+$/.test(v.packageKey) || typeof v.manifestSha256!=='string' || !/^[0-9a-f]{64}$/.test(v.manifestSha256) || !states.includes(v.status as SkyToolPackageStatus)) throw new SkySubmissionError('対象の版・状態・操作を確認してください。');
      const current=await store.getOwner(owner,v.packageKey);
      if (!current || current.manifestSha256!==v.manifestSha256) throw new SkySubmissionError('対象が見つからないか、版が変わりました。',409);
      if (v.action==='submit') {
        if (v.status!=='submitted') throw new SkySubmissionError('保存済みの仕様だけを提出できます。',409);
        if (current.status!=='published_declared') {
          if (current.status!=='submitted' || !await store.publishDeclared(owner,v.packageKey,v.manifestSha256)) throw new SkySubmissionError('状態が変わりました。再読込してください。',409);
        }
      } else if (current.status!=='revoked' && !await store.withdraw(owner,v.packageKey,v.manifestSha256,v.status as SkyToolPackageStatus)) throw new SkySubmissionError('状態が変わりました。再読込してください。',409);
      return json({package:await store.getOwner(owner,v.packageKey),ownerScope:await ownerScopeFor(owner)});
    }),
  };
}
