import { isNoahInviteAgentId, NOAH_INVITE_VALID } from './noah-invite-contract.mjs';
import { resolveNoahInviteExecution } from './noah-invite-execution.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { NoahAgentError, noahSha256, noahUploadId } from './noah-agent-upload.ts';
import { authorizedNoahRelease, type NoahReleaseDependencies } from './noah-release.ts';
import { recipeFor, modelFor } from './noah-execution-contract.mjs';
import { boundedNoahBody } from './noah-agent-api.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';

export type NoahAgentPin = { agentId: string; family: string; kind: 'upload' | 'release' | 'catalog' | 'invite'; invite?: { id: string; revision: number; expiresAt: number }; name: string;
  version: string; manifestSha256: string; sourceSha256: string | null; model: string; permissions: string[]; priceNote: string; digest: string };
type Pending = { id: string; claimSha256: string; pin: NoahAgentPin; startedAt: number };
type Payload = { active: NoahAgentPin | null; history: NoahAgentPin[]; pending: Pending | null; removed: boolean;
  last: { id: string; state: 'selected'|'failed'|'cancelled'; pin: NoahAgentPin; error?: string } | null };
type Row = { id: string; owner_id: string; family_key: string; payload: string; revision: number; created_at: number; updated_at: number };
export type NoahInstance = { id: string; revision: number; updatedAt: number; active: NoahAgentPin | null; history: NoahAgentPin[];
  pending: Omit<Pending, 'claimSha256'> | null; removed: boolean; last: Payload['last'] };
const hash = (v: unknown) => noahSha256(new TextEncoder().encode(JSON.stringify(v)));
const payload = (r: Row): Payload => JSON.parse(r.payload);
const present = (r: Row): NoahInstance => {
  const p = payload(r);
  return { id: r.id, revision: r.revision, updatedAt: r.updated_at, ...p,
    pending: p.pending ? { id: p.pending.id, pin: p.pending.pin, startedAt: p.pending.startedAt } : null };
};
const digest = (value: unknown) => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new NoahAgentError('版の照合情報を確認してください。'); return value; };
const revision = (v: unknown) => { if (!Number.isSafeInteger(v) || (v as number) < 0) throw new NoahAgentError('変更前の版を確認してください。'); return v as number; };

/** Resolves authoritative source/rights, never caller-provided commands or display names. */
export async function resolveNoahPin(deps: NoahReleaseDependencies, owner: string, agentId: string): Promise<NoahAgentPin> {
  let pin: Omit<NoahAgentPin,'digest'>;
  const recipe = recipeFor(agentId);
  if (recipe) {
    pin = { agentId, family: `catalog:${agentId}`, kind: 'catalog', name: recipe.name, version: recipe.version,
      manifestSha256: await hash(recipe), sourceSha256: recipe.artifact?.sha256 ?? null, model: modelFor(recipe),
      permissions: ['read_input','write_files'], priceNote: recipe.provider ? '本人のCodexの利用枠を使用します。実行時に送信確認が必要です。' : 'このMacの固定ローカルモデルを使用します。' };
  } else if (/^release-[a-f0-9]{64}$/.test(agentId)) {
    const expected = agentId.slice(8);
    const rows = await deps.db.prepare('SELECT package_key AS packageKey FROM sky_tool_packages WHERE manifest_sha256=? LIMIT 2').bind(expected).all<{packageKey:string}>();
    if (rows.results.length !== 1) throw new NoahAgentError('配布版が見つかりません。',404);
    const { pkg,manifest,artifact } = await authorizedNoahRelease(deps,owner,rows.results[0].packageKey,expected,true);
    pin = { agentId, family: `release:${await hash([pkg.userId,manifest.id])}`, kind:'release',name:manifest.name,version:manifest.version,
      manifestSha256:expected,sourceSha256:artifact.sha256,model:artifact.runtime!.model,permissions:manifest.capabilities.permissions,
      priceNote:`料金方式：${manifest.pricing.model}。この版の現在の利用権を確認済み。` };
  } else if (isNoahInviteAgentId(agentId)) {
    const a = await resolveNoahInviteExecution(deps.db, owner, agentId.slice(7));
    pin = { agentId, family: `invite:${await hash([a.author,a.manifest.id])}`, kind: 'invite', name: a.manifest.name, version: a.manifest.version,
      manifestSha256: a.manifestSha256, sourceSha256: a.source.sha256, model: a.invite.runtime.model, permissions: a.manifest.permissions,
      priceNote: '招待の有効期間中、作者が許可したこの版を実行できます。購入権は含みません。',
      invite: { id: a.invite.inviteId, revision: a.invite.revision, expiresAt: a.invite.expiresAt } };
  } else {
    const a = await noahAgentStore(deps.db,owner).get(noahUploadId(agentId));
    if (!a || a.uploadState !== 'ready' || !a.source || !a.manifest.runtime) throw new NoahAgentError('本人の実行可能な登録版が見つかりません。',404);
    pin = { agentId, family:`upload:${a.manifest.id}`,kind:'upload',name:a.manifest.name,version:a.manifest.version,
      manifestSha256:a.manifestSha256,sourceSha256:a.source.sha256,model:a.manifest.runtime.model,permissions:a.manifest.permissions,priceNote:a.manifest.priceNote };
  }
  return { ...pin, digest: await hash(pin) };
}

export function createNoahInstanceService(deps: NoahReleaseDependencies) {
  const row = (owner:string,id:string) => deps.db.prepare('SELECT * FROM noah_instances WHERE owner_id=? AND id=?').bind(owner,noahUploadId(id)).first<Row>();
  const byFamily = (owner:string,family:string) => deps.db.prepare('SELECT * FROM noah_instances WHERE owner_id=? AND family_key=?').bind(owner,family).first<Row>();
  async function requireRow(owner:string,id:string) { const r=await row(owner,id); if(!r) throw new NoahAgentError('ライブラリのAgentが見つかりません。',404); return r; }
  async function save(r:Row,p:Payload) {
    const changed=await deps.db.prepare('UPDATE noah_instances SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? RETURNING *')
      .bind(JSON.stringify(p),Date.now(),r.id,r.owner_id,r.revision).all<Row>();
    if(!changed.results[0]) throw new NoahAgentError('別の操作で版が変わりました。最新状態を確認してください。',409);
    return present(changed.results[0]);
  }
  return {
    async list(owner:string) { const rows=await deps.db.prepare('SELECT * FROM noah_instances WHERE owner_id=? ORDER BY updated_at DESC,id DESC LIMIT 100').bind(owner).all<Row>(); return rows.results.map(present); },
    async get(owner:string,id:string) { return present(await requireRow(owner,id)); },
    async candidates(owner:string,agentId:string) {
      const base=await resolveNoahPin(deps,owner,agentId); let ids=[agentId];
      if(base.kind==='upload') ids=(await noahAgentStore(deps.db,owner).list()).filter(a=>`upload:${a.manifest.id}`===base.family&&a.uploadState==='ready'&&a.manifest.runtime&&a.source).map(a=>a.id);
      if(base.kind==='invite') {
        const rows = await deps.db.prepare(`SELECT i.id FROM noah_agent_invites i JOIN noah_agent_uploads a ON a.id=i.upload_id
          WHERE ${NOAH_INVITE_VALID} AND i.execution_allowed=1 AND (i.owner_id=? OR ((i.recipient_id IS NULL OR i.recipient_id=?)
          AND EXISTS(SELECT 1 FROM noah_agent_invite_claims c WHERE c.invite_id=i.id AND c.recipient_id=?))) ORDER BY i.created_at DESC,i.id DESC LIMIT 100`)
          .bind(Date.now(),owner,owner,owner).all<{id:string}>();
        ids=rows.results.map(r=>`invite-${r.id}`);
      }
      if(base.kind==='release') {
        const versions=await deps.db.prepare(`SELECT manifest_sha256 AS digest FROM sky_tool_packages WHERE tool_id=(SELECT tool_id FROM sky_tool_packages WHERE manifest_sha256=?) ORDER BY created_at DESC LIMIT 100`).bind(base.manifestSha256).all<{digest:string}>();
        ids=versions.results.map(v=>`release-${v.digest}`);
      }
      const pins:NoahAgentPin[]=[];
      for(const id of ids) {
        try { const pin=await resolveNoahPin(deps,owner,id); if(pin.family===base.family) pins.push(pin); }
        catch(e) { if(!(e instanceof NoahAgentError)||![403,404,409,422].includes(e.status)) throw e; }
      }
      const instance=await byFamily(owner,base.family);
      return { pins, instance:instance ? present(instance) : null };
    },
    async prepare(owner:string,input: { id:string; revision:number; commandId:string; agentId:string; digest:string; claimSha256:string; replacePending:boolean }) {
      const id=noahUploadId(input.id), commandId=noahUploadId(input.commandId), expected=revision(input.revision), claimSha256=digest(input.claimSha256);
      if(typeof input.replacePending!=='boolean') throw new NoahAgentError('準備の再試行条件を確認してください。');
      const pin=await resolveNoahPin(deps,owner,input.agentId);
      if(pin.digest!==digest(input.digest)) throw new NoahAgentError('選択した版の条件が変わりました。再確認してください。',409);
      let r=await row(owner,id);
      if(!r) {
        if(expected!==0) throw new NoahAgentError('追加先が変わりました。',409);
        const p:Payload={active:null,history:[],pending:{id:commandId,claimSha256,pin,startedAt:Date.now()},removed:false,last:null};
        const inserted=await deps.db.prepare(`INSERT OR IGNORE INTO noah_instances(id,owner_id,family_key,payload,revision,created_at,updated_at)
          SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM noah_instances WHERE owner_id=?)<100 RETURNING *`)
          .bind(id,owner,pin.family,JSON.stringify(p),Date.now(),Date.now(),owner).all<Row>();
        if(inserted.results[0]) return present(inserted.results[0]);
        r=await row(owner,id);
        if(!r) throw new NoahAgentError('このAgentは追加済みか、ライブラリの上限（100件）です。',409);
      }
      const p=payload(r);
      if(p.pending?.id===commandId) {
        if(p.pending.pin.digest!==pin.digest || p.pending.claimSha256!==claimSha256) throw new NoahAgentError('同じ操作IDの内容は変えられません。',409);
        return present(r);
      }
      if(p.last?.id===commandId) { if(p.last.pin.digest!==pin.digest) throw new NoahAgentError('同じ操作IDの内容は変えられません。',409); return present(r); }
      if(r.revision!==expected || r.family_key!==pin.family || p.pending&&!input.replacePending) throw new NoahAgentError('別の版変更が進行中か、Agentの系列が異なります。最新状態を確認してください。',409);
      return save(r,{...p,pending:{id:commandId,claimSha256,pin,startedAt:Date.now()},last:null});
    },
    async finish(owner:string,input:{id:string;commandId:string;claim:string;state:'selected'|'failed';error?:string}) {
      const r=await requireRow(owner,input.id),p=payload(r); noahUploadId(input.commandId);
      if(p.last?.id===input.commandId && !p.pending) {
        if(p.last.state!==input.state) throw new NoahAgentError('準備操作は取消または別の結果で確定しています。',409);
        return present(r);
      }
      if(!p.pending || p.pending.id!==input.commandId || await hash(digest(input.claim))!==p.pending.claimSha256) throw new NoahAgentError('準備操作が変更・取消されています。',409);
      if(!['selected','failed'].includes(input.state)) throw new NoahAgentError('準備の結果を確認してください。');
      const pin=p.pending.pin;
      if(input.state==='selected') {
        const current=await resolveNoahPin(deps,owner,pin.agentId);
        if(current.digest!==pin.digest) throw new NoahAgentError('準備中に版または利用条件が変わりました。元の版を維持します。',409);
      }
      const history=input.state==='selected' ? [p.active,...p.history].filter((v):v is NoahAgentPin=>Boolean(v)&&v!.digest!==pin.digest).filter((v,i,a)=>a.findIndex(x=>x.digest===v.digest)===i).slice(0,20) : p.history;
      return save(r,{...p,active:input.state==='selected'?pin:p.active,history,pending:null,removed:input.state==='selected'?false:p.removed,
        last:{id:input.commandId,state:input.state,pin,...(input.state==='failed'?{error:'新版の準備に失敗しました。元の版と成果を維持しています。接続先や空き容量を確認して再試行してください。'}:{})}});
    },
    async cancel(owner:string,id:string,expected:number) {
      const r=await requireRow(owner,id),p=payload(r);
      if(r.revision!==revision(expected) || !p.pending) throw new NoahAgentError('準備状態が変わりました。',409);
      return save(r,{...p,pending:null,last:{id:p.pending.id,state:'cancelled',pin:p.pending.pin}});
    },
    async remove(owner:string,id:string,expected:number) {
      const r=await requireRow(owner,id),p=payload(r);
      if(r.revision!==revision(expected)||p.pending) throw new NoahAgentError('版の準備を取り消してから外してください。',409);
      const ids=[p.active,...p.history].filter((v):v is NoahAgentPin=>Boolean(v)).map(v=>v.agentId);
      const blocked=`SELECT 1 FROM work_jobs WHERE user_id=? AND json_valid(payload) AND (
        (json_extract(payload,'$.noahExecution.agentId') IN (SELECT value FROM json_each(?)) AND json_extract(payload,'$.noahExecution.state') IN ('queued','running','unknown')) OR
        (json_extract(payload,'$.noahOperation.config.agentId') IN (SELECT value FROM json_each(?)) AND (json_extract(payload,'$.noahOperation.state') IN ('enabled','stopping') OR json_type(payload,'$.noahOperation.active')='object')))`;
      // Atomic check with the selection removal. Source, Work and shared models remain.
      const changed=await deps.db.prepare(`UPDATE noah_instances SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND NOT EXISTS(${blocked}) RETURNING *`)
        .bind(JSON.stringify({...p,removed:true}),Date.now(),r.id,owner,r.revision,owner,JSON.stringify(ids),JSON.stringify(ids)).all<Row>();
      if(!changed.results[0]) throw new NoahAgentError('実行中・結果不明の仕事や運用があります。停止・照合してから外してください。',409);
      return present(changed.results[0]);
    },
  };
}

export function createNoahInstancesApi(deps:NoahReleaseDependencies&{authenticate:(r:Request)=>Promise<string>}) {
  const service=createNoahInstanceService(deps);
  return async(request:Request)=>{
    const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
    try {
      const owner=await deps.authenticate(request),scope=await ownerScopeFor(owner);
      if(request.method==='GET') {
        const q=new URL(request.url).searchParams;
        const data=q.has('agentId')?await service.candidates(owner,q.get('agentId')!):q.has('id')?{instance:await service.get(owner,q.get('id')!)}:{instances:await service.list(owner)};
        return Response.json({...data,ownerScope:scope},{headers});
      }
      if(request.method!=='POST') throw new NoahAgentError('対応していない操作です。',405);
      if(request.headers.get('origin')!==new URL(request.url).origin) throw new NoahAgentError('同じNoahから操作してください。',403);
      if(request.headers.get(OWNER_SCOPE_HEADER)!==scope) throw new NoahAgentError('アカウントが変わりました。',409);
      if(!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。',415);
      const v=JSON.parse(new TextDecoder().decode(await boundedNoahBody(request,4096)));
      const keys:Record<string,string[]>={prepare:['id','revision','commandId','agentId','digest','claimSha256','replacePending'],finish:['id','commandId','claim','state'],cancel:['id','revision'],remove:['id','revision']};
      if(!v||typeof v!=='object'||Array.isArray(v)||!Object.hasOwn(keys,v.action)||Object.keys(v).some(k=>k!=='action'&&!keys[v.action].includes(k))) throw new NoahAgentError('操作の形式を確認してください。');
      const instance=v.action==='prepare'?await service.prepare(owner,v):v.action==='finish'?await service.finish(owner,v):await service[v.action as 'cancel'|'remove'](owner,v.id,v.revision);
      return Response.json({instance,ownerScope:scope},{headers});
    } catch(e) {
      const status=e instanceof NoahAgentError?e.status:e instanceof SyntaxError?400:e instanceof Error&&e.message==='UNAUTHORIZED'?401:503;
      return Response.json({error:e instanceof NoahAgentError?e.message:status===401?'サインインしてください。':'ライブラリの版を確認できません。'},{status,headers});
    }
  };
}
