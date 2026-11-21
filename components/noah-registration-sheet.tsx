'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import NoahRegistration from './noah-registration';
import styles from './noah-registration.module.css';
export default function NoahRegistrationSheet({agentId}:{agentId:string}){
  const dialog=useRef<HTMLDialogElement>(null),[open,setOpen]=useState(false);
  const [ready,setReady]=useState('');
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/noah/registration?${new URLSearchParams({agent:agentId})}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json() as {providers?:unknown[]};if(!controller.signal.aborted&&response.ok&&data.providers?.length)setReady(agentId);}).catch(()=>{});return()=>controller.abort();},[agentId]);
  if(ready!==agentId)return null;
  return <><button type="button" className={styles.sheetTrigger} onClick={()=>{setOpen(true);dialog.current?.showModal();}}>登録が必要なとき <ArrowUpRight size={15}/></button>
    <dialog ref={dialog} className={styles.sheet} aria-label="このAgentの登録" onClose={()=>setOpen(false)}><button type="button" className={styles.sheetClose} aria-label="Agentに戻る" onClick={()=>dialog.current?.close()}><X size={20}/></button>{open&&<NoahRegistration agentId={agentId}/>}</dialog></>;
}
