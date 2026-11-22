'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import NoahAgentFeedback, { NoahAgentSignals } from './noah-agent-feedback';
import type { AgentFeedbackSummary } from '@/lib/noah-feedback';
import styles from './noah-pins.module.css';
import {readNoahCardFeedback} from './noah-card-feedback-read';
export default function NoahCardFeedback({id}:{id:string}) {
  const [summary,setSummary]=useState<AgentFeedbackSummary>(), [error,setError]=useState(''),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    void readNoahCardFeedback(id).then(value=>{
      if(!controller.signal.aborted){setSummary(value);setError('');}
    }).catch(()=>{if(!controller.signal.aborted){setSummary(undefined);setError('評価を読めませんでした。');}});
    return ()=>controller.abort();
  },[id,attempt]);
  useEffect(()=>{
    const refresh=()=>setAttempt(n=>n+1);
    window.addEventListener('focus',refresh);window.addEventListener('noah-feedback-changed',refresh);
    return ()=>{window.removeEventListener('focus',refresh);window.removeEventListener('noah-feedback-changed',refresh);};
  },[]);
  useEffect(()=>{if(open)dialog.current?.showModal();},[open]);
  return <><NoahAgentSignals id={id} summary={summary} error={error} compact onChange={setSummary} onRetry={()=>setAttempt(n=>n+1)} detailHref={`/noah/feedback/${id}`} onComments={()=>setOpen(true)}/>
    {open && <dialog ref={dialog} className={styles.feedbackSheet} onClose={()=>{setOpen(false);setAttempt(n=>n+1);}}><button className={styles.closeFeedback} aria-label="評価を閉じる" onClick={()=>dialog.current?.close()}><X size={20}/></button><NoahAgentFeedback id={id}/></dialog>}</>;
}
