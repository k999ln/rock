"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './sky-discovery-dialog.module.css';
export default function SkyDiscoveryDialog({open,mode,onModeChange,onClose,children}:{open:boolean;mode:'discover'|'manage';onModeChange:(mode:'discover'|'manage')=>void;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();},[open]);
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="sky-discovery-title" onCancel={event=>{event.preventDefault();onClose();}}>
 <header><div><p>YOUR SMIS</p><h2 id="sky-discovery-title">追加・管理</h2></div><button type="button" onClick={onClose} aria-label="追加と管理を閉じてホームへ戻る">閉じる</button></header>
 <p>必要な能力を見つけて追加。使う担当とLLMを設定し、依頼と成果はEveで。</p>
 <div className={styles.tabs} role="tablist" tabIndex={-1} aria-label="追加と管理の切替" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'discover':event.key==='End'?'manage':mode==='discover'?'manage':'discover';onModeChange(next);document.getElementById(next==='manage'?'sky-manage-tab':'sky-add-tab')?.focus();}}>
  <button id="sky-add-tab" type="button" role="tab" tabIndex={mode==='discover'?0:-1} aria-selected={mode==='discover'} aria-controls="sky-add-panel" onClick={()=>onModeChange('discover')}>探して追加</button>
  <button id="sky-manage-tab" type="button" role="tab" tabIndex={mode==='manage'?0:-1} aria-selected={mode==='manage'} aria-controls="sky-manage-panel" onClick={()=>onModeChange('manage')}>追加済み・設定</button>
 </div>
 {children}</dialog>;
}
