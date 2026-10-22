"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './sky-discovery-dialog.module.css';
export default function SkyDiscoveryDialog({open,onClose,children}:{open:boolean;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();},[open]);
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="sky-discovery-title" onCancel={event=>{event.preventDefault();onClose();}}>
 <header><div><p>SKY / DISCOVER</p><h2 id="sky-discovery-title">見つけて、自分のSkyへ。</h2></div><button type="button" onClick={onClose} aria-label="検索を閉じてホームへ戻る">閉じる</button></header>
 <p>LLM・Agent・Toolを探して追加。設定は自分のSky、依頼と成果はEveへ。</p>{open&&children}</dialog>;
}
