'use client';
import {SkyAgentOutcomeCounts} from './sky-agent-outcome-counts';
import type {AgentOutcomeSummary} from '@/lib/sky-agent-outcomes';
import { useState } from 'react';
import Link from 'next/link';
import { SkyNotice } from './sky-feedback';
import { communityRequestHeaders, communityFetch, setCommunityKeyProfile } from '@/lib/community-key-client';
import { parseAgentShare, parseAgentShareResource, type AgentShareManifest } from '@/lib/sky-agent-share';
import { skyAgentEvePath, type SkyLibraryAgent } from '@/lib/sky-agent-library';
import { textModelProviders, textModelProviderDefinition, type TextModelProviderId } from '@/lib/llm-providers';
import type { SkyCommunity, SkySocialProfile } from '@/lib/sky-social';
import styles from './sky-agent-share.module.css';

type Draft = {manifest:AgentShareManifest;digest:string;expectedVersion:number;agentRevision:number};
type ShareHistory = {id:string;versions:Array<{version:number;digest:string;withdrawnAt:number}>};
type View = {outcomes?:AgentOutcomeSummary;ownerUserId:string;manifest:AgentShareManifest;digest:string;author:SkySocialProfile|null;mine:boolean;withdrawn:boolean};
async function request<T>(owner:string|null,input?:unknown,ref?:string):Promise<T> {
 const q=ref ? parseAgentShareResource(ref) : null;
 const response=await fetch(`/api/sky/agent-shares${q?`?id=${encodeURIComponent(q.id)}&version=${q.version}`:''}`,{
  cache:'no-store',headers:{...communityRequestHeaders(),...(input?{'Content-Type':'application/json','x-sky-owner':owner??''}:{})},
  ...(input?{method:'POST',body:JSON.stringify(input)}:{})
 });
 const value=await response.json() as T&{error?:string};if(!response.ok)throw new Error(value.error??'共有内容を確認できません。');return value;
}
function License({manifest}:{manifest:AgentShareManifest}) {
 return <p className={styles.boundary}>{manifest.license==='CC-BY-4.0'?<>担当の文章は <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>。出典表示と変更の明示が必要で、商用利用も可能です。公開停止で取得済みの許諾は取り消されません。</>:<>この場所のメンバーが担当設定を複製・改変し、同じ場所へ改善版を共有する許可です。会話・鍵・参加権は含みません。</>}{manifest.parent&&<> 元の版の利用条件（{manifest.parent.license}）も保持します。</>}</p>;
}
function Details({manifest}:{manifest:AgentShareManifest}) {
 return <><h3>{manifest.agent.name} <small>v{manifest.version}</small></h3><p>{manifest.description}</p><details><summary>共有する役割を読む</summary><p className={styles.instructions}>{manifest.agent.instructions}</p></details><p className={styles.boundary}>推奨モデル：{manifest.agent.provider} / {manifest.agent.model}。実際の接続・稼働・費用は受け手が確認します。</p>{manifest.parent&&<p>改善元：<Link href={`/os/sky/shared?ref=${manifest.parent.id}:${manifest.parent.version}`}>元の担当 v{manifest.parent.version}</Link> · 作者 @sky_{manifest.parent.author.slice(0,8)}</p>}<License manifest={manifest}/></>;
}
export function SkyAgentSharePublisher({agent,ownerUserId}:{agent:SkyLibraryAgent;ownerUserId:string}) {
 const [description,setDescription]=useState(''),[community,setCommunity]=useState('');
 const [communities,setCommunities]=useState<SkyCommunity[]|null>(null),[draft,setDraft]=useState<Draft|null>(null);
 const [approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [history,setHistory]=useState<ShareHistory|null>(null);
 const [published,setPublished]=useState(false),[posted,setPosted]=useState(false),[withdrawn,setWithdrawn]=useState(false),[postId,setPostId]=useState('');
 async function loadPlaces(){setBusy(true);setError('');try{const s=await communityFetch<{profile:SkySocialProfile|null;communities:SkyCommunity[]}>('/api/sky/social');if(s.profile)setCommunityKeyProfile(s.profile.id);setCommunities(s.communities.filter(c=>c.member&&c.unlocked));}catch(e){setError(e instanceof Error?e.message:'共有先を確認できません。')}finally{setBusy(false)}}
 async function loadHistory(){setBusy(true);setError('');try{setHistory(await request<ShareHistory>(ownerUserId,{action:'versions',agentId:agent.id,communityId:community||null}));}catch(e){setError(e instanceof Error?e.message:'共有版を確認できません。')}finally{setBusy(false)}}
 async function preview(){setBusy(true);setError('');setNotice('');setApproved(false);try{const d=await request<Draft>(ownerUserId,{action:'preview',agentId:agent.id,description,communityId:community||null});parseAgentShare(d.manifest);setDraft(d);setPublished(false);setPosted(false);setWithdrawn(false);setPostId(crypto.randomUUID());}catch(e){setError(e instanceof Error?e.message:'準備できません。')}finally{setBusy(false)}}
 async function act(action:'publish'|'post'|'withdraw'){
  if(!draft)return;setBusy(true);setError('');
  try{
   const base={id:draft.manifest.id,version:draft.manifest.version,digest:draft.digest,approve:true};
   if(action==='publish'){
    if(!approved)return;
    await request(ownerUserId,{action,agentId:agent.id,agentRevision:draft.agentRevision,description:draft.manifest.description,communityId:draft.manifest.communityId,expectedVersion:draft.expectedVersion,digest:draft.digest,license:draft.manifest.license,approve:true});setPublished(true);setNotice('この版を共有しました。投稿と仕事の実行はまだ始まっていません。');
   }else if(action==='post'){
    await request(ownerUserId,{...base,action,postId,content:`「${draft.manifest.agent.name}」v${draft.manifest.version}を共有しました。${draft.manifest.description}`});setPosted(true);setNotice('投稿しました。ホームで他の人が内容を確認して追加できます。');
   }else{await request(ownerUserId,{...base,action});setWithdrawn(true);setNotice('新しい取得・追加を停止しました。追加済みの担当やコピーは消していません。')}
  }catch(e){
   if(action==='publish'){
    try{const saved=await request<View>(null,undefined,`${draft.manifest.id}:${draft.manifest.version}`);if(saved.mine&&saved.digest===draft.digest){setPublished(true);setWithdrawn(saved.withdrawn);setNotice(saved.withdrawn?'この版は公開を停止しています。':'公開済みの同じ版を確認しました。新しい版の作成や再公開はしていません。');return;}}catch{/* Preserve the draft; no retry of publication. */}
   }
   setError(e instanceof Error?e.message:'操作を完了できません。');
  }finally{setBusy(false)}
 }
 return <section className={styles.panel} aria-label="担当を共有"><h3>この担当を、ほかの人にも。</h3><p>共有する文章とモデルの推奨設定を確認します。個人の会話・成果・機器設定・鍵・Tool権限は付けません。</p>
 <fieldset disabled={busy||published}><label>どんな困りごとに役立つ？<textarea maxLength={300} value={description} onChange={e=>{setDescription(e.target.value);setDraft(null);setApproved(false)}}/></label>
 <label>共有先<select value={community} onChange={e=>{setCommunity(e.target.value);setDraft(null);setHistory(null);setApproved(false)}}><option value="">公開プロフィールで共有</option>{communities?.map(c=><option key={c.id} value={c.id}>{c.name}（専用鍵が必要）</option>)}</select></label>{communities===null&&<button type="button" onClick={()=>void loadPlaces()}>コミュニティーの共有先を読み込む</button>}
 <button type="button" disabled={!description.trim()} onClick={()=>void preview()}>共有内容を確認する</button></fieldset>
 <button type="button" disabled={busy} onClick={()=>void loadHistory()}>共有した版を見る</button>
 {history&&<nav aria-label="この担当の共有版">{history.versions.length?history.versions.map(v=><p key={v.version}><Link href={`/os/sky/shared?ref=${history.id}:${v.version}`}>v{v.version} · {v.withdrawnAt?'公開停止':'共有中'} · 内容と公開状態を管理</Link></p>):<p>この共有先には、まだ共有した版がありません。</p>}</nav>}
 {draft&&<div className={styles.preview}><Details manifest={draft.manifest}/>{!published&&<><label className={styles.check}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} disabled={busy}/>この文章を共有する権利があり、秘密・個人情報と上の利用条件を確認しました。</label><button type="button" className={styles.primary} disabled={busy||!approved} onClick={()=>void act('publish')}>この内容で共有する</button></>}
 {published&&!withdrawn&&<div className={styles.actions}><button type="button" disabled={busy||posted} onClick={()=>void act('post')}>{posted?'投稿済み':community?'このコミュニティーへ投稿':'ホームへ投稿'}</button><Link href={`/os/sky/shared?ref=${draft.manifest.id}:${draft.manifest.version}`}>共有内容を開く</Link><button type="button" disabled={busy} onClick={()=>void act('withdraw')}>この版の公開を停止</button></div>}</div>}
 {error&&<SkyNotice message={error}/>}{notice&&<output>{notice}</output>}{busy&&<output>確認しています…</output>}</section>;
}
export function SkyAgentShareCard({resource}:{resource:string}){
 const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [provider,setProvider]=useState<TextModelProviderId>('local-model'),[model,setModel]=useState(''),[approved,setApproved]=useState(false),[added,setAdded]=useState<SkyLibraryAgent|null>(null);
 async function load(){setBusy(true);setError('');try{const v=await request<View>(null,undefined,resource);parseAgentShare(v.manifest);setView(v);setProvider(v.manifest.agent.provider);setModel(v.manifest.agent.model);setApproved(false);}catch(e){setError(e instanceof Error?e.message:'共有担当を確認できません。')}finally{setBusy(false)}}
 async function withdraw(){if(!view)return;setBusy(true);setError('');try{await request(view.ownerUserId,{action:'withdraw',id:view.manifest.id,version:view.manifest.version,digest:view.digest,approve:true});setView({...view,withdrawn:true});}catch(e){setError(e instanceof Error?e.message:'公開状態を変更できません。')}finally{setBusy(false)}}
 async function add(){if(!view||!approved)return;setBusy(true);setError('');try{const r=await request<{agent:SkyLibraryAgent}>(view.ownerUserId,{action:'add',id:view.manifest.id,version:view.manifest.version,digest:view.digest,provider,model,approve:true});setAdded(r.agent);}catch(e){setError(e instanceof Error?e.message:'追加できません。')}finally{setBusy(false)}}
 return <section className={styles.card} aria-label="共有された担当">{!view?<button type="button" disabled={busy} onClick={()=>void load()}>内容を確認して、自分に追加</button>:<><Details manifest={view.manifest}/><p>作者：{view.author?.name??'公開プロフィール'} · @sky_{view.manifest.author.slice(0,8)}</p>{view.outcomes&&<SkyAgentOutcomeCounts summary={view.outcomes}/>}{!added&&!view.withdrawn&&<><fieldset disabled={busy}><label>自分が使う接続先<select value={provider} onChange={e=>{const p=e.target.value as TextModelProviderId;setProvider(p);setModel(textModelProviderDefinition(p).defaultModel);setApproved(false)}}>{textModelProviders.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>基盤モデル<input maxLength={120} value={model} onChange={e=>{setModel(e.target.value);setApproved(false)}}/></label><label className={styles.check}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>内容と利用条件を確認しました。自分の一覧へ追加します。</label></fieldset><button type="button" className={styles.primary} disabled={busy||!approved||!model.trim()} onClick={()=>void add()}>自分に追加する</button><p className={styles.boundary}>停止状態で保存します。接続先の設定や仕事・課金は始まりません。</p></>}{view.mine&&!view.withdrawn&&<button type="button" disabled={busy} onClick={()=>void withdraw()}>この版の新しい取得・追加を停止</button>}{view.withdrawn&&<p>この版は公開停止中です。追加済みの設定や仕事は消していません。</p>}{added&&<output>自分の担当へ追加しました。<Link href={added.enabled?skyAgentEvePath(added):'/os/sky/agents'}>{added.enabled?'Eveへ進む':'追加済み・設定で確認して有効にする'}</Link></output>}</>}{error&&<SkyNotice message={error}/>}{busy&&<output>確認しています…</output>}</section>;
}
