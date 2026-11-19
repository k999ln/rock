'use client';
import {useEffect,useRef,useState} from 'react';
import type {WorkJob} from '@/lib/workflow';
import type {NewsLearningSplit} from '@/lib/eve-news-learning';
import styles from './sky-commerce.module.css';
type Collection={dataset:{records:unknown[];selectedJobs:unknown[];duplicateRecordsRemoved:number;trainingAllowed:false};datasetSha256:string;hashBasis:string};
export default function EveNewsLearningCollection(){
 const [jobs,setJobs]=useState<WorkJob[]>([]),[selected,setSelected]=useState<string[]>([]),[split,setSplit]=useState<NewsLearningSplit>('evaluation'),[result,setResult]=useState<Collection|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const alive=useRef(true),sequence=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function invalidate(){sequence.current++;setResult(null);setNotice('');}
 async function load(){const id=++sequence.current;setBusy(true);setResult(null);setNotice('');try{const r=await fetch('/api/eve/news-work',{cache:'no-store'}),v=await r.json() as {jobs:WorkJob[];error?:string};if(!r.ok)throw Error(v.error??'仕事を読み直してください。');if(alive.current&&id===sequence.current){setJobs(v.jobs);setSelected([]);}}catch(e){if(alive.current&&id===sequence.current)setNotice((e as Error).message);}finally{if(alive.current&&id===sequence.current)setBusy(false);}}
 async function prepare(download=false){const id=++sequence.current;setBusy(true);setResult(null);setNotice('');try{const query=new URLSearchParams({learning:'collection',split,jobs:JSON.stringify(jobs.filter(j=>selected.includes(j.id)).map(j=>({jobId:j.id,revision:j.revision})))});const r=await fetch('/api/eve/news-work?'+query,{cache:'no-store'}),v=await r.json() as Collection&{error?:string};if(!r.ok)throw Error(v.error??'同意と仕事の版を確認してください。');if(!alive.current||id!==sequence.current)return;setResult(v);if(download){const url=URL.createObjectURL(new Blob([JSON.stringify(v,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='eve-news-'+split+'-collection-'+v.datasetSha256.slice(0,12)+'.json';a.click();URL.revokeObjectURL(url);}}catch(e){if(alive.current&&id===sequence.current)setNotice((e as Error).message);}finally{if(alive.current&&id===sequence.current)setBusy(false);}}
 return <details className={styles.purchaseConditions}><summary>同意済みの仕事を準備データにまとめる</summary><div className={styles.offerForm}>
  <p>各仕事で同じ用途へ個別に同意した現行資料・草稿を選びます。ここでは同意を一括作成しません。20仕事・128 KiBまで、記録全体のhashが同じ記録を1件にまとめ、選択した全仕事の参照を残します。</p>
  <button disabled={busy} onClick={()=>void load()}>本人のNews仕事を読み直す</button>
  <label>まとめる用途<select value={split} disabled={busy} onChange={e=>{invalidate();setSplit(e.target.value as NewsLearningSplit);}}><option value="evaluation">評価用</option><option value="training_candidate">学習候補（訓練許可ではありません）</option></select></label>
  {jobs.map(job=><label className={styles.checkbox} key={job.id}><input type="checkbox" checked={selected.includes(job.id)} disabled={busy||(!selected.includes(job.id)&&selected.length>=20)} onChange={e=>{invalidate();setSelected(all=>e.target.checked?[...all,job.id]:all.filter(id=>id!==job.id));}}/>{job.title} · 版{job.revision} · {job.eveNews?.learningConsents?.at(-1)?.status==='granted'?job.eveNews.learningConsents.at(-1)?.split==='evaluation'?'評価用の同意記録あり':'学習候補の同意記録あり':'個別同意の確認が必要'}</label>)}
  {jobs.length===100&&<p>直近100件を表示しています。</p>}
  <p>選択{selected.length}件。表示・保存のたびに同意・本人・版・会話・評価用素材をサーバーで再確認します。近似重複・外部dataset・モデル利用条件・訓練設定は未受入です。コピー済みファイルは回収できず、実訓練前の再確認が必要です。</p>
  <button disabled={busy||!selected.length} onClick={()=>void prepare()}>選択した仕事を再確認してまとめる</button>
  <button disabled={busy||!selected.length} onClick={()=>void prepare(true)}>選択を再確認してまとめたJSONを保存</button>
  {notice&&<p role="alert">{notice}</p>}
  {result&&<section aria-label="まとめた本人用準備データ"><h4>準備データ{result.dataset.records.length}件 · 重複{result.dataset.duplicateRecordsRemoved}件を統合</h4><p>実訓練の許可なし。選択{result.dataset.selectedJobs.length}仕事の全同意を確認した時点の出力です。</p><p style={{overflowWrap:'anywhere'}}>準備データSHA: {result.datasetSha256}</p><details><summary>まとめたJSONを確認</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(result,null,2)}</pre></details></section>}
 </div></details>;
}
