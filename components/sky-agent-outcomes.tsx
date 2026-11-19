'use client';
import {useState} from 'react';
import {communityRequestHeaders} from '@/lib/community-key-client';
import {parseOutcomeResource,type AgentOutcomeDraft} from '@/lib/sky-agent-outcomes';
import {SkyNotice} from './sky-feedback';
import {SkyAgentShareCard} from './sky-agent-share';
type Saved={postId:string;withdrawn:boolean;content:string;attachment:{kind:string;resource:string}|null;digest:string};
async function request<T>(owner:string,input:unknown):Promise<T>{
 const r=await fetch('/api/sky/agent-outcomes',{method:'POST',cache:'no-store',headers:{...communityRequestHeaders(),'Content-Type':'application/json','x-sky-owner':owner},body:JSON.stringify(input)});
 const d=await r.json() as T&{error?:string};if(!r.ok)throw new Error(d.error??'利用結果を確認できません。');return d;
}
export function SkyAgentOutcomeComposer({ownerUserId,jobId,jobRevision}:{ownerUserId:string;jobId:string;jobRevision:number}){
 const [answer,setAnswer]=useState(''),[draft,setDraft]=useState<AgentOutcomeDraft|null>(null),[saved,setSaved]=useState<Saved|null>(null),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const base={jobId,jobRevision,helpful:answer==='yes'};
 async function preview(){setBusy(true);setError('');setNotice('');setApproved(false);try{const d=await request<AgentOutcomeDraft>(ownerUserId,{action:'preview',...base});setDraft(d);setSaved(null);if(d.expected)setSaved(await request<Saved>(ownerUserId,{action:'status',postId:d.postId}));}catch(e){setDraft(null);setError(e instanceof Error?e.message:'確認できません。');}finally{setBusy(false)}}
 async function publish(){if(!draft||!approved)return;setBusy(true);setError('');try{
  await request(ownerUserId,{action:'publish',...base,digest:draft.digest,expected:draft.expected,approve:true});
  setSaved(await request<Saved>(ownerUserId,{action:'status',postId:draft.postId}));setDraft(null);setApproved(false);setNotice('利用結果を共有しました。原稿・会話・成果本文は付けていません。');
 }catch(e){
  try{const current=await request<Saved>(ownerUserId,{action:'status',postId:draft.postId});setSaved(current);if(!current.withdrawn&&current.content===draft.content&&JSON.stringify(current.attachment)===JSON.stringify(draft.attachment)){setDraft(null);setApproved(false);setNotice('同じ公開内容を保存先で確認しました。再投稿していません。');return;}}catch{/* No replay or new publication on an unknown result. */}
  setError(e instanceof Error?e.message:'保存状態を確認してください。');
 }finally{setBusy(false)}}
 async function withdraw(){if(!saved)return;setBusy(true);setError('');try{await request(ownerUserId,{action:'withdraw',postId:saved.postId,digest:saved.digest,approve:true});setSaved({...saved,withdrawn:true});setDraft(null);setApproved(false);setNotice('利用結果の公開を停止しました。仕事と成果は保持しています。');}catch(e){setError(e instanceof Error?e.message:'保存状態を確認してください。');}finally{setBusy(false)}}
 return <section aria-label="担当の利用結果を共有"><h3>この担当は、役立ちましたか？</h3><p>回答を公開すると、同じ版を選ぶ人の参考になります。同じプロフィール・版では最新の回答一つだけを数えます。作者本人の回答は集計から除きます。</p>
 <fieldset disabled={busy}><label>本人の回答<select value={answer} onChange={e=>{setAnswer(e.target.value);setDraft(null);setApproved(false)}}><option value="">選んでください</option><option value="yes">役立った</option><option value="no">まだ役立たなかった</option></select></label><button type="button" disabled={!answer} onClick={()=>void preview()}>公開する内容を確認</button></fieldset>
 {draft&&<><p style={{whiteSpace:'pre-wrap'}}>{draft.content}</p><p>{draft.communityId?'同じ専用鍵のコミュニティー内':'公開プロフィールでホーム'}に表示します。原稿・会話・成果本文・仕事ID・接続先の秘密は含めません。{draft.expected&&'保存済みの回答がある場合は置き換えます。'}</p><label><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)}/>上の内容と公開先を確認し、この利用結果を共有します。</label><button type="button" disabled={busy||!approved} onClick={()=>void publish()}>この利用結果を共有</button></>}
 {saved&&!saved.withdrawn&&<button type="button" disabled={busy} onClick={()=>void withdraw()}>自分の利用結果の公開を停止</button>}{error&&<SkyNotice message={error}/>}{notice&&<output>{notice}</output>}{busy&&<output>保存状態を確認しています…</output>}</section>;
}
export function SkyAgentOutcomeCard({resource}:{resource:string}){
 let v:ReturnType<typeof parseOutcomeResource>|null;
 try{v=parseOutcomeResource(resource);}catch{v=null;}
 return v?<section aria-label="共有担当の利用結果"><p>利用者の回答：{v.helpful?'役立った':'まだ役立たなかった'} · {v.modified?'設定を変更':'共有時の設定'}で利用</p><SkyAgentShareCard resource={`${v.id}:${v.version}`}/></section>:<SkyNotice message="利用結果の共有版を確認できません。"/>;
}
