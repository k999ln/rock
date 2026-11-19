'use client';
import {useEffect,useRef,useState} from 'react';
import type {EveRuntimeExecution,EveRuntimePending} from '@/lib/eve-runtime-sync';
import {createRuntimeEveHistoryControl} from '@/lib/eve-runtime-history-control';
import {createRuntimeEveArchiveReader} from '@/lib/eve-runtime-archive';
type Options=Parameters<typeof createRuntimeEveArchiveReader>[0];
function boundArchive(props:Options){let active=false;return {reader:createRuntimeEveArchiveReader({...props,current:()=>active&&props.current()}),control:createRuntimeEveHistoryControl({...props,current:()=>active&&props.current()}),activate:()=>{active=true;},retire:()=>{active=false;}};}
export default function EveRuntimeArchive(props:Options){
 const active=useRef(false),sequence=useRef(0),busyRef=useRef(false);
 const [jobs,setJobs]=useState<EveRuntimePending[]>([]);
 const [items,setItems]=useState<EveRuntimeExecution[]>([]),[cursor,setCursor]=useState<string|null|undefined>(undefined),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[preview,setPreview]=useState('');
 const [context]=useState(()=>boundArchive(props)),reader=context.reader;
 useEffect(()=>{active.current=true;context.activate();return()=>{active.current=false;context.retire();};},[context]);
 async function load(restart=false){
  if(busyRef.current||(!restart&&cursor===null))return;
  busyRef.current=true;setBusy(true);setNotice('');setPreview('');setItems([]);setJobs([]);const mine=++sequence.current;
  try{const page=await reader.page(restart?'':cursor??'');if(active.current&&mine===sequence.current){setItems(page.items);setJobs(page.jobs);setCursor(page.cursor);setNotice(page.jobs.length?'読込時点の仕事を表示しています。成果や停止は、仕事を選んで読み直してください。':'このページに仕事はありません。続きがあれば次を読めます。');}}
  catch(error){if(active.current&&mine===sequence.current)setNotice(error instanceof Error?error.message:'保存成果を確認できません。');}
  finally{busyRef.current=false;if(active.current)setBusy(false);}
 }
 async function draft(row:EveRuntimeExecution,download=false){
  if(busyRef.current)return;busyRef.current=true;setBusy(true);setPreview('');setNotice('');const mine=++sequence.current;
  try{const file=await reader.draft(row);if(!active.current||mine!==sequence.current||!props.current())return;
   setPreview(file.text);
   if(download){const url=URL.createObjectURL(new Blob([file.text],{type:'text/plain;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(error){if(active.current&&mine===sequence.current)setNotice(error instanceof Error?error.message:'保存成果を確認できません。');}
  finally{busyRef.current=false;if(active.current)setBusy(false);}
 }
 async function controlJob(row:EveRuntimePending,stop=false){
  if(busyRef.current)return;busyRef.current=true;setBusy(true);setPreview('');setNotice('');const mine=++sequence.current;
  try{const result=await (stop?context.control.requestStop(row):context.control.inspect(row));if(!active.current||mine!==sequence.current||!props.current())return;
   const message=!result||result.status==='unknown'?'停止できたか未確認です。同じ仕事を読み直してください。':result.status==='stopped'?'この仕事の停止を確認しました。':result.status==='running'?'端末の受領待ち、または実行中です。停止は未確認です。':'保存済みの成果を確認しました。';
   setNotice('仕事ID '+row.id+'：'+message);
  }catch(error){if(active.current&&mine===sequence.current)setNotice('仕事ID '+row.id+'：停止は未確認です。'+(error instanceof Error?error.message:'接続を確認してください。'));}
  finally{busyRef.current=false;if(active.current)setBusy(false);}
 }
 return <section aria-label="過去の担当とモデルの成果"><h3>過去の担当・モデルの成果</h3><p>今の担当やモデルを変更していても、この会話の保存成果を読めます。過去の仕事は実行しません。結果不明の仕事は、元の仕事番号と実行先で停止を確認できます。表示は読込時点の記録で、本文と文章保存は最新の保存版を照合します。</p>
  <button type="button" disabled={busy||cursor===null} onClick={()=>void load()}>保存成果を50件ずつ読む</button>{cursor!==undefined&&<button type="button" disabled={busy} onClick={()=>void load(true)}>成果履歴の最初から読む</button>}
  {notice&&<output>{notice}</output>}{cursor===null&&<p>端末実行履歴の最後です。</p>}
  {jobs.filter(job=>!items.some(row=>row.id===job.id&&row.report.state==='review')).map(job=><article key={job.id}><strong>{job.agentName}</strong><p>{job.input}</p><small>基盤モデル：{job.model.id} · {job.model.sha256} · 仕事ID：{job.id} · 読込時の状態：{job.state}</small><div><button type="button" disabled={busy} onClick={()=>void controlJob(job)}>この仕事の状態を読み直す</button><button type="button" disabled={busy} onClick={()=>void controlJob(job,true)}>同じ仕事の停止を確認する</button></div></article>)}
  {items.filter(row=>row.report.state==='review').map(row=><article key={row.id}><strong>{row.request.agent.name}</strong><p>{row.input}</p><small>基盤モデル：{row.request.model.id} · {row.request.model.sha256} · 仕事ID：{row.id}</small><div><button type="button" disabled={busy||row.report.state!=='review'} onClick={()=>void draft(row)}>保存した本文を確認</button><button type="button" disabled={busy||row.report.state!=='review'} onClick={()=>void draft(row,true)}>成果を文章で保存</button></div></article>)}
  {preview&&<pre style={{whiteSpace:'pre-wrap'}}>{preview}</pre>}
 </section>;
}
