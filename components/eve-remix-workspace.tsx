'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {remixPrompt,placeRemixFile,selectedRemixFiles,type RemixFile,type RemixSlots} from '@/lib/eve-remix';
import type {SkyLibraryAgent} from '@/lib/sky-agent-library';
import type {SkyUsageObservation} from '@/lib/sky-usage-observation';
import EveRemixStage from './eve-remix-stage';
import EveMediaStudio from './eve-media-studio';
import SmisAgentRemix from './smis-agent-remix';
import SkyFreeCloudPanel from './sky-free-cloud-panel';
import SkyUsageDetails from './sky-usage-details';
import styles from './eve-remix.module.css';
export default function EveRemixWorkspace({owner}:{owner:string}){
 const [files,setFiles]=useState<RemixFile[]>([]),[goal,setGoal]=useState('それぞれの良い点を活かして、より分かりやすい提案書を作る'),[agents,setAgents]=useState<SkyLibraryAgent[]>([]),[models,setModels]=useState<string[]>([]),[model,setModel]=useState(''),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<{text:string;model:string;metering?:SkyUsageObservation;incomplete?:boolean;materials:string[];purpose:string} | null>(null),[cloud,setCloud]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [surface,setSurface]=useState<'mini'|'screen'>('mini'),[slots,setSlots]=useState<RemixSlots>([null,null]);
 const selectedFiles=selectedRemixFiles(files,slots);
 function place(index:number,side:0|1){setSlots(previous=>placeRemixFile(previous,index,side,files.length));setConfirmed(false);}
 function remove(index:number){setFiles(items=>items.filter((_,i)=>i!==index));setSlots(previous=>previous.map(i=>i===index?null:i!==null&&i>index?i-1:i) as RemixSlots);setConfirmed(false);}
 const lifecycle=useRef({active:true,request:null as AbortController|null,sequence:0});
 useEffect(()=>{const scope=lifecycle.current;scope.active=true;if(!owner)return;const c=new AbortController();void fetch('/api/sky/agents',{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json() as {ownerUserId?:string;agents?:SkyLibraryAgent[]};if(!r.ok||d.ownerUserId!==owner||!Array.isArray(d.agents))throw Error('担当を確認できません。');if(scope.active)setAgents(d.agents);}).catch(()=>{});return()=>{scope.active=false;scope.sequence++;c.abort();scope.request?.abort();};},[owner]);
 let prompt='',validation='';try{prompt=remixPrompt(selectedFiles,goal);}catch(e){validation=selectedFiles.length<2?'素材AとBに1つずつ置いてください。':e instanceof Error?e.message:'素材を確認してください。';}
 async function addFiles(list:FileList|null){if(!list||busy||reading)return;const version=++lifecycle.current.sequence;setReading(true);setNotice('');try{
  if(files.length+list.length>4)throw Error('ファイルは最大4個です。');const next:RemixFile[]=[];
  for(const f of Array.from(list)){if(!/\.(txt|md|csv|json|log)$/i.test(f.name)||f.size>48000)throw Error('48 KB以内のtxt・md・csv・json・logを選んでください。PDFや画像にはまだ対応していません。');const text=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());if(!text.trim()||text.includes('\0'))throw Error('空のファイルやバイナリは使えません。');next.push({name:f.name,text});}
  const combined=[...files,...next];if(combined.reduce((n,f)=>n+f.text.length,0)>8000)throw Error('本文は合計8,000文字以内にしてください。');if(lifecycle.current.active&&lifecycle.current.sequence===version){setFiles(combined);if(files.length===0&&combined.length>=2)setSlots([0,1]);setConfirmed(false);}
 }catch(e){if(lifecycle.current.active)setNotice(e instanceof Error?e.message:'UTF-8のテキストファイルを選んでください。');}finally{if(lifecycle.current.active)setReading(false);}}
 async function discover(){setBusy(true);setNotice('');try{const r=await fetch('/api/llm/local-models',{cache:'no-store',signal:AbortSignal.timeout(10000)}),d=await r.json() as {models?:Array<{name:string}>;error?:string};if(!r.ok||!Array.isArray(d.models))throw Error(d.error??'接続したローカルモデルを確認できません。');if(!lifecycle.current.active)return;const names=d.models.map((m:{name:string})=>m.name);setModels(names);setModel(names[0]??'');setNotice(names.length?'モデルを選び、素材を確認して作成してください。':'導入済みモデルがありません。');}catch(e){if(lifecycle.current.active)setNotice(e instanceof Error?e.message:'接続を確認してください。');}finally{if(lifecycle.current.active)setBusy(false);}}
 async function generate(){if(busy||!prompt||!model||!confirmed)return;setBusy(true);setNotice('');const c=new AbortController();lifecycle.current.request=c;try{
  const r=await fetch('/api/llm/text',{method:'POST',headers:{'Content-Type':'application/json','x-sky-owner':owner},body:JSON.stringify({provider:'ollama',model,prompt,maxOutputTokens:600}),signal:c.signal});const d=await r.json() as {text?:string;model?:string;metering?:SkyUsageObservation;responseStatus?:string;error?:string};if(!r.ok||typeof d.text!=='string'||!d.text.trim())throw Error(d.error??'成果を取得できません。自動では再送しません。');if(lifecycle.current.active){setResult({text:d.text,model:d.model??model,metering:d.metering,incomplete:d.responseStatus==='incomplete',materials:selectedFiles.map(f=>f.name),purpose:goal});setNotice(d.responseStatus==='incomplete'?'出力上限に達したため途中までの下書きです。依頼を短く整理して再作成できます。':'成果ができました。内容を確認してダウンロードしてください。');}
 }catch(e){if(lifecycle.current.active)setNotice(c.signal.aborted?'表示待ちを中止しました。モデルの停止は未確認です。':e instanceof Error?e.message:'結果が不明です。自動では再送しません。');}finally{if(lifecycle.current.active)setBusy(false);}}
 function download(){if(!result)return;const u=URL.createObjectURL(new Blob([(result.incomplete?'<!-- 出力上限に達した下書き。内容の確認が必要です。 -->\n\n':'')+result.text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='eve-remix.md';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
 return <div className={surface==='mini'?styles.miniSurface:styles.screenSurface}>
 <EveMediaStudio key={`media-${owner}`} owner={owner||'local'}/>
 <details className={styles.otherWorkspace}><summary>文章・資料と、担当の掛け合わせ</summary>
 <div className={styles.surfaceBar} aria-label="作業台の表示"><div><span className={styles.eyebrow}>EVE / REMIX</span><h2>重ねる。頼む。見比べる。</h2></div><div className={styles.row}><button type="button" aria-pressed={surface==='mini'} onClick={()=>setSurface('mini')}>Miniの作業台</button><button type="button" aria-pressed={surface==='screen'} onClick={()=>setSurface('screen')}>画面の作業台</button></div></div>
 <section className={styles.panel} aria-label="ファイルを掛け合わせて作る" data-remix-surface="file-workbench">
 <div className={styles.workbench}>
 <div><EveRemixStage files={files} slots={slots} busy={busy||reading} onPlace={place} onRemove={remove}/>
 <details className={styles.importer} open={files.length===0}><summary>素材を取り込む</summary><label>素材を置く（2〜4個、本文合計8,000文字）<input type="file" multiple accept=".txt,.md,.csv,.json,.log" disabled={busy||reading} onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/></label><p>この作業台はテキスト資料が対象です。写真・音・映像は上のスタジオで編集できます。CADは未対応です。</p></details></div>
 <section className={styles.command} aria-label="Eveに掛け合わせを依頼"><span className={styles.eyebrow}>ASK EVE</span><h3>この2つから、何を作る？</h3><p>「この原稿とメモから、短い提案書を作って」</p>
 <label>Eveへの依頼<textarea rows={4} maxLength={500} value={goal} disabled={busy} onChange={e=>{setGoal(e.target.value);setConfirmed(false);}}/></label>
 <label><span><input type="checkbox" style={{width:'auto'}} checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> 素材A・Bと依頼を確認しました</span></label>
 <div className={styles.row}><button className={styles.primaryAction} type="button" data-eve-action="create-working-copy" disabled={busy||reading||!prompt||!model||!confirmed||!owner} onClick={()=>void generate()}>{busy?'処理中…':result?'別の作業コピーを作る':'掛け合わせて作る'}</button>{busy&&<button type="button" onClick={()=>lifecycle.current.request?.abort()}>待機を中止</button>}</div>
 {!model&&<p>実行設定でモデルを一度選ぶと、この作業台から依頼できます。</p>}{validation&&<p>{validation}</p>}
 <details className={styles.executionSettings} open={!model}><summary>実行先・モデルと使用量{model?` · ${model}`:''}</summary><button type="button" disabled={busy||reading} onClick={()=>void discover()}>ローカルモデルを確認</button><label>使うローカルモデル<select aria-label="掛け合わせに使うローカルモデル" value={model} disabled={busy} onChange={e=>setModel(e.target.value)}><option value="">モデルを選ぶ</option>{models.map(m=><option key={m}>{m}</option>)}</select></label><button type="button" disabled={busy||reading||!prompt||!confirmed||!owner} onClick={()=>setCloud(prompt)}>Cloudの送信先と保存を確認する</button><p>自動Cloud切替はありません。実行先・素材・費用の確認を保ちます。</p></details>
 {prompt&&<details><summary>渡す素材と依頼の全文</summary><pre className={styles.result}>{prompt}</pre></details>}
 {notice&&<output className={styles.notice}>{notice}</output>}</section>
 <section className={styles.output} aria-label="原本と比較する新しい作業コピー" data-remix-surface="working-copy"><span className={styles.eyebrow}>WORKING COPY</span><h3>変わった結果を、見比べる。</h3>
 {result?<article><p>モデル：{result.model} · {result.incomplete?'上限に達した途中の下書きです':'内容は確認前の下書きです'}</p><p>素材：{(result.materials??selectedFiles.map(f=>f.name)).join(' × ')}<br/>依頼：{result.purpose??goal}</p><label>成果を確認・編集<textarea rows={12} value={result.text} disabled={busy} onChange={e=>setResult({...result,text:e.target.value})}/></label>{result.metering&&<SkyUsageDetails observation={result.metering}/>}<div className={styles.row}><button type="button" data-eve-action="save-working-copy" disabled={busy} onClick={download}>作業コピーをMarkdownで保存</button><button type="button" disabled={busy} onClick={()=>{setResult(null);setNotice('作業コピーを閉じました。元の素材A・Bは残っています。');}}>コピーを閉じて元へ戻る</button></div></article>:<div className={styles.empty}><p>素材A・Bを使った新しい成果がここに出ます。</p><p>まず原本を読む → 作業コピーを確認 → 編集して保存。</p></div>}
 <p>原本は変更しません。ローカルの作業コピーは画面を閉じる前に保存してください。</p></section>
 </div>{cloud&&<SkyFreeCloudPanel key={cloud} initialPrompt={cloud}/>}</section>
 {owner?<SmisAgentRemix owner={owner} agents={agents} onSaved={a=>setAgents(items=>[a,...items.filter(v=>v.id!==a.id)])}/>:<p>担当の掛け合わせと実行にはログインが必要です。<Link href="/account?returnTo=%2Fos%2Feve%2Fremix">ログインする</Link></p>}
 </details>
 <p className={styles.surfaceNote}>Mini向けの操作配置をWebで確認する作業台です。手の追跡・空間表示・声入力の実機接続は別途受入が必要です。コンピューターユーズは画面上の同じ名前付き操作を利用できます。</p></div>;
}
