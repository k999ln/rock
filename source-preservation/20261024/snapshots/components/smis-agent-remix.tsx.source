'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {remixAgentSettings} from '@/lib/eve-remix';
import {parseSkyAgentSettings,skyAgentEvePath,type SkyLibraryAgent} from '@/lib/sky-agent-library';
import styles from './eve-remix.module.css';
export default function SmisAgentRemix({owner,agents,onSaved}:{owner:string;agents:SkyLibraryAgent[];onSaved?:(agent:SkyLibraryAgent)=>void}){
 const [ids,setIds]=useState(['','']),[name,setName]=useState(''),[instructions,setInstructions]=useState(''),[modelSide,setModelSide]=useState('0'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState<SkyLibraryAgent|null>(null),[moving,setMoving]=useState<{id:string;x:number;y:number}|null>(null);
 const pending=useRef<{key:string;id:string}|null>(null),drag=useRef<{id:string;x:number;y:number}|null>(null);
 const active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[owner]);
 const available=agents.filter(a=>a.enabled),selected=ids.map(id=>available.find(a=>a.id===id));
 function place(id:string,slot:number){const next=[...ids];next[slot]=id;if(next[1-slot]===id)next[1-slot]='';setIds(next);setSaved(null);setNotice('');const [a,b]=next.map(v=>available.find(x=>x.id===v));if(a&&b){setName(`${a.name} × ${b.name}`.slice(0,80));try{setInstructions(remixAgentSettings(a,b).instructions);}catch(e){setInstructions('');setNotice(e instanceof Error?e.message:'役割を入力してください。');}}else{setName('');setInstructions('');}}
 async function save(){if(busy||!selected[0]||!selected[1])return;setBusy(true);setNotice('');try{
  const executor=selected[Number(modelSide)]!;
  const settings=parseSkyAgentSettings({name,instructions,provider:executor.provider,model:executor.model,enabled:true});
  const key=JSON.stringify({owner,settings});
  let stored:SkyLibraryAgent|undefined;
  if(pending.current?.key===key){
   const check=await fetch('/api/sky/agents?id='+encodeURIComponent(pending.current.id),{cache:'no-store'});
   const body=await check.json() as {ownerUserId?:string;agent?:SkyLibraryAgent;error?:string};
   if(!active.current)return;
   if(check.ok){if(body.ownerUserId!==owner||!body.agent||JSON.stringify(parseSkyAgentSettings({name:body.agent.name,instructions:body.agent.instructions,provider:body.agent.provider,model:body.agent.model,enabled:body.agent.enabled}))!==JSON.stringify(settings))throw Error('保存済みの設定が変わりました。Smithで確認してください。');stored=body.agent;}
   else if(check.status!==404)throw Error(body.error??'保存済みの担当を確認できません。');
  }else pending.current={key,id:crypto.randomUUID()};
  if(!stored){
   const r=await fetch('/api/sky/agents',{method:'PUT',headers:{'Content-Type':'application/json','X-smis-Owner':owner},body:JSON.stringify({id:pending.current!.id,revision:0,settings,create:true})});
   const data=await r.json() as {agent?:SkyLibraryAgent;error?:string};if(!r.ok||!data.agent)throw Error(data.error??'保存を確認できません。同じ設定で再確認できます。');stored=data.agent;
  }
  if(!active.current)return;setSaved(stored);onSaved?.(stored);window.dispatchEvent(new Event('smis-agents-changed'));setNotice('組み合わせた担当をSmithへ保存しました。');
 }catch(e){if(active.current)setNotice(e instanceof Error?e.message:'保存できませんでした。');}finally{if(active.current)setBusy(false);}}
 return <section className={styles.panel} aria-label="Smithのエージェントを掛け合わせる"><h3>担当 × 担当</h3><p>カードを左右へスライドするか、A・Bへ重ねて組み合わせます。役割を整理して、ひとつの新しい担当として保存できます。</p>
 {available.length<2&&<p>組み合わせるには、利用中の担当が2つ必要です。<Link href="/os/eve?view=build">Eveで担当を作る</Link></p>}
 <div className={styles.cards}>{available.map(a=><article key={a.id} className={styles.card} data-remix-object={`agent-${a.id}`} onPointerDown={e=>{if(busy||(e.target as HTMLElement).closest('button'))return;drag.current={id:a.id,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current&&Math.hypot(e.clientX-drag.current.x,e.clientY-drag.current.y)>8)setMoving({id:a.id,x:e.clientX,y:e.clientY});}} onPointerCancel={()=>{drag.current=null;setMoving(null);}} onPointerUp={e=>{const d=drag.current;drag.current=null;setMoving(null);if(!d||busy)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-remix-slot]');if(el)place(d.id,Number(el.dataset.remixSlot));else if(Math.abs(e.clientX-d.x)>45&&Math.abs(e.clientY-d.y)<70)place(d.id,e.clientX>d.x?1:0);}}><strong>{a.name}</strong><small>{a.model} · 版 {a.revision}</small><div className={styles.row}><button type="button" disabled={busy} onClick={()=>place(a.id,0)} aria-label={`${a.name}をAへ`}>Aへ</button><button type="button" disabled={busy} onClick={()=>place(a.id,1)} aria-label={`${a.name}をBへ`}>Bへ</button></div></article>)}</div>
 {moving&&<div style={{position:'fixed',left:moving.x-65,top:moving.y-24,zIndex:9999,pointerEvents:'none',padding:14,borderRadius:12,background:'#315b4d',color:'white',boxShadow:'0 8px 28px #0003'}}>{available.find(a=>a.id===moving.id)?.name} ×</div>}
 <div className={styles.slots}><div data-remix-slot="0" className={styles.slot}>A：{selected[0]?.name??'担当を置く'}</div><span aria-hidden="true">×</span><div data-remix-slot="1" className={styles.slot}>B：{selected[1]?.name??'担当を置く'}</div></div>
 {selected[0]&&selected[1]&&<><div className={styles.combinedRole}><span className={styles.eyebrow}>NEW AGENT</span><h4>{name||'新しい担当'}</h4><p>{selected[0].name}と{selected[1].name}の役割をまとめた、新しい作業コピーです。</p><p>実行モデル：{selected[Number(modelSide)]?.model}</p></div><details><summary>新しい担当の名前・役割・実行先を確認</summary><label>新しい担当の名前<input value={name} maxLength={80} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(null);}}/></label><label>組み合わせた役割<textarea rows={6} value={instructions} maxLength={1200} disabled={busy} onChange={e=>{setInstructions(e.target.value);setSaved(null);}}/></label><label>実行に使うモデル<select value={modelSide} disabled={busy} onChange={e=>{setModelSide(e.target.value);setSaved(null);}}>{selected.map((a,i)=><option key={i} value={i}>{a!.name}のモデル：{a!.model}</option>)}</select></label><p>役割を組み合わせます。2モデルの同時実行や、元のTool権限の引継ぎは行いません。実行時に接続と使用量を確認できます。</p></details><button type="button" data-eve-action="save-combined-agent" disabled={busy||!name.trim()||!instructions.trim()||!!saved} onClick={()=>void save()}>{busy?'保存しています…':'組み合わせてSmithに追加'}</button></>}
 {notice&&<output className={styles.notice}>{notice}</output>}{saved&&<Link href={skyAgentEvePath(saved)}>この担当をEveで使う →</Link>}
 </section>;
}
