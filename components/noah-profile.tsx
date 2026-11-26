'use client';
import { noahSignInHref } from '@/lib/noah-navigation';
import {noahOperationLabel} from '@/lib/noah-operation-labels';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Fingerprint, Pause, Play, Plus, Trash2 } from 'lucide-react';
import { NOAH_PROFILE_FIELDS, NOAH_PROFILE_SIGNED_IN_GROUPS, NOAH_PROFILE_SIGNED_IN_ONLY, PROFILE_CONSENT_VERSION, PROFILE_CONSENT_TEXT, PROFILE_CONSENT_DETAILS, type NoahProfileView, type ProfileField, type DelegationMode } from '@/lib/noah-profile-contract';
import { useNoahProfile } from './use-noah-profile';
import styles from './noah-profile.module.css';
import NoahProfileReadiness from './noah-profile-readiness';
import { NoahHapticsSetting } from './noah-interaction';
import { NoahLanguageSetting, useNoahLocale } from './noah-locale';
import NoahLoading from './noah-loading';
import NoahContractLinks from './noah-contract-links';
export const delegationLabels:Record<DelegationMode,string>={allow:'任せる',confirm:'確認して実行',deny:'任せない'};
export default function NoahProfile(){
  const {t}=useNoahLocale();

  const state=useNoahProfile();
  return <main className={styles.page}>
    <Link href="/noah" className={styles.back}><ArrowLeft size={17}/> {t("タイムライン")}</Link>
    <header className={styles.heading}><h1>{t("登録情報")}</h1><p>{t('次のAgentでも、入力は少なく。')}</p></header>
    <section className={styles.information} aria-label={t('保存・送信・料金')}>
      <p>{t('全部を埋める必要はありません。Agentを使う途中で、必要な情報だけ追加できます。')}</p>
      <dl>
        <div><dt>{t('保存')}</dt><dd>{t('Noahのサーバーに暗号化して保存。再利用はいつでも停止できます。')}</dd></div>
        <div><dt>{t('送信')}</dt><dd>{t('外部への登録時に、送信先と必要な項目を確認します。')}</dd></div>
        <div><dt>{t('料金')}</dt><dd>{t('情報の保存で有料実行は始まりません。Agentの利用料は提供元の条件によります。')}</dd></div>
      </dl>
      <Link href="/noah/explore">{t('Agentを探す')}<ArrowUpRight size={16}/></Link>
    </section>
    {state.guest?<div className={styles.empty}><Fingerprint size={32}/><h2>{t("次のAgentでも、入力は少なく。")}</h2><p>{t("保存すると、必要な項目だけ使い回せます。")}</p><a className={styles.primary} href={noahSignInHref('/noah/profile')}>{t("接続を確認して続ける")}<ArrowUpRight size={17}/></a></div>:state.profile?<ProfileEditor key={state.profile.ownerScope} profile={state.profile} busy={state.busy} save={state.save} beginFileSelection={state.beginFileSelection} endFileSelection={state.endFileSelection} cancelFileSelection={state.cancelFileSelection}/>:!state.error?<NoahLoading label={t("保存情報を読み込んでいます…")}/>:null}
    {state.error&&<div role="alert" className={styles.error}>{state.error}<button type="button" onClick={()=>void state.reload()}>{t("読み直す")}</button></div>}
    <NoahContractLinks/>
    <NoahLanguageSetting/><NoahHapticsSetting/>
    <p><Link href="/noah/devices">{t('端末・実行先')}</Link></p>
    {state.profile?.browserOwned&&<details className={styles.receipts}><summary>{t('このブラウザへの保存について')}</summary><p>{t('登録情報と成果は、このブラウザで再び開けます。共有端末では同じ保存先を開けるため、個人の端末を使ってください。')}</p><p>{t('ブラウザのデータを消した場合、別の端末を使う場合、180日以上利用しない場合は、保存先を引き継げません。')}</p></details>}
  </main>;
}
function ProfileEditor({profile,busy,save,beginFileSelection,endFileSelection,cancelFileSelection}:{beginFileSelection:()=>void;endFileSelection:()=>void;cancelFileSelection:()=>void;profile:NoahProfileView;busy:boolean;save:(body:Record<string,unknown>|File)=>Promise<NoahProfileView|null>}){
  const {t,locale}=useNoahLocale();

  const [fields,setFields]=useState(profile.fields),[notice,setNotice]=useState('');
  const fileInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{const input=fileInput.current;input?.addEventListener('cancel',cancelFileSelection);return()=>input?.removeEventListener('cancel',cancelFileSelection);},[cancelFileSelection]);
  const groups=[...new Set(Object.values(NOAH_PROFILE_FIELDS).map(f=>f.group))];
  return <>

    {!profile.available&&<output>{t("保存機能は準備中です。")}</output>}
    <NoahProfileReadiness profile={profile}/>
    <details className={styles.reuseExplanation}>
      <summary>{t('eSIM・Agent登録での情報の再利用について')}</summary>
      {PROFILE_CONSENT_DETAILS.map(section=><p key={section.title}><strong>{t(section.title)}</strong><br/>{t(section.text)}</p>)}
    </details>
    <p className={styles.muted}>{t('Safari・Chromeに保存した情報を、入力欄の自動入力候補から使えます。')}</p>
    <form onChange={()=>setNotice('')} onSubmit={async e=>{e.preventDefault();setNotice('');const result=await save({action:'fields',fields,consentVersion:PROFILE_CONSENT_VERSION,reuse:profile.consents.length===0||profile.reuseEnabled});if(result)setNotice('保存済み');}}>
      <div className={styles.groups}>{groups.map(group=>{
        const entries=Object.entries(NOAH_PROFILE_FIELDS).filter(([,field])=>field.group===group) as [ProfileField,(typeof NOAH_PROFILE_FIELDS)[ProfileField]][];
        const count=entries.filter(([key])=>profile.fields[key]).length+(group==='本人確認'?profile.documents.length:0);
        // ブラウザだけの本人は、お金の受取口座と本人確認を新しく置けない（サーバーも断る）。置いた物は読んで消せる。
        const locked=Boolean(profile.browserOwned)&&NOAH_PROFILE_SIGNED_IN_GROUPS.includes(group);
        if(locked&&!count)return <details key={group} className={styles.group}><summary><span>{t(group)}</span><small>{t('サインインした本人だけ')}</small><Plus size={18}/></summary><p className={styles.muted}>{t(NOAH_PROFILE_SIGNED_IN_ONLY)}</p></details>;
        return <details key={group} className={styles.group}><summary><span>{t(group)}</span><small>{count?t('{count}項目を保存済み',{count}):t("必要なときに追加")}</small><Plus size={18}/></summary>
          {locked&&<p className={styles.muted}>{t(NOAH_PROFILE_SIGNED_IN_ONLY)}</p>}
          <div className={styles.inputs}>{entries.map(([key,field])=><label key={key}>{t(field.label)}{key==='bio'||key==='skills'?<textarea name={key} id={`noah-profile-${key}`} value={fields[key]??''} maxLength={field.max} rows={3} onInput={e=>{const value=e.currentTarget.value;setFields(previous=>({...previous,[key]:value}));}} onChange={e=>setFields(previous=>({...previous,[key]:e.target.value}))}/>:<input name={key} id={`noah-profile-${key}`} value={fields[key]??''} readOnly={locked} type={key==='email'?'email':key==='phone'?'tel':key==='birthDate'||key==='identityExpiry'?'date':'text'} autoComplete={field.autocomplete} maxLength={field.max} onInput={e=>{const value=e.currentTarget.value;setFields(previous=>({...previous,[key]:value}));}} onChange={e=>setFields(previous=>({...previous,[key]:e.target.value}))}/>}</label>)}</div>
          {locked&&entries.some(([key])=>profile.fields[key])&&<button type="button" disabled={busy} onClick={()=>{const rest=Object.fromEntries(Object.entries(fields).filter(([key])=>!entries.some(([name])=>name===key)));setFields(rest);void save({action:'fields',fields:rest,consentVersion:PROFILE_CONSENT_VERSION,reuse:profile.consents.length===0||profile.reuseEnabled});}}><Trash2 size={17}/> {t('{group}を消す',{group:t(group)})}</button>}
          {group==='本人確認'&&<div className={styles.documents}>
            {profile.documents.map(doc=><div key={doc.id}><a href={`/api/noah/profile/documents/${doc.id}`}>{doc.name}</a><button type="button" aria-label={`${doc.name}を削除`} disabled={busy} onClick={()=>void save({action:'deleteDocument',id:doc.id})}><Trash2 size={17}/></button></div>)}
            {!locked&&profile.documents.length<2&&<label className={styles.upload}><Plus size={17}/> {t("書類を追加")}<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy||!profile.available} ref={fileInput} onClick={beginFileSelection} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';try{if(file)await save(file);}finally{endFileSelection();}}}/></label>}<small>{t("PDF・JPEG・PNG／1件5MBまで・2件まで")}</small><small>{t("「書類を追加」で、暗号化保存と次の登録での再利用に同意します。提出先は毎回確認します。")}</small>
          </div>}
        </details>;
      })}</div>
      <p className={styles.consent}>{profile.consents.length===0||profile.reuseEnabled?t(PROFILE_CONSENT_TEXT):t("入力した情報を暗号化して保存します。再利用は停止したままです。")}</p><div className={styles.actions}><button className={styles.primary} disabled={busy||!profile.available}>{busy?<NoahLoading compact label={t("保存中…")}/>:<><Check size={17}/> {t("同意して保存")}</>}</button>{notice&&<output>{t(notice)}</output>}</div>
    </form>
    {profile.consents.length>0&&<div className={styles.reuseControl}><span>{profile.reuseEnabled?t("登録情報を再利用できます"):t("登録情報の再利用は停止中")}</span><button type="button" disabled={busy||!profile.available} onClick={()=>void save({action:'reuse',enabled:!profile.reuseEnabled,consentVersion:PROFILE_CONSENT_VERSION})}>{profile.reuseEnabled?t("再利用を停止"):t("同意して再利用を再開")}</button></div>}
    {profile.consents.length>0&&!profile.reuseEnabled&&<p className={styles.consent}>{t(PROFILE_CONSENT_TEXT)}</p>}
    {profile.consents.length>0&&<details className={styles.receipts}><summary>{t("保存・再利用の記録")}</summary>{[...profile.consents].reverse().map((c,i)=><p key={`${c.at}:${i}`}>{new Date(c.at).toLocaleString(locale)} · {c.action==='save'?t("保存への同意"):c.action==='reuse-stop'?t("再利用を停止"):t("再利用を再開")}<small>{c.fields.map(k=>NOAH_PROFILE_FIELDS[k].label).join('・')}{c.documents.length?`・書類${c.documents.length}件`:''} {t("· 説明")}{c.version}</small></p>)}</details>}
    <section id="permissions" className={styles.delegations}><div className={styles.sectionTitle}><div><h2>{t("任せる範囲")}</h2></div><button type="button" className={styles.pause} disabled={busy||!profile.available} onClick={()=>void save({action:'pause',paused:!profile.paused})}>{profile.paused?<Play size={16}/>:<Pause size={16}/>} {profile.paused?t("再開する"):t("すべて停止")}</button></div>
      {profile.paused&&<output className={styles.error}>{t("新しい実行と、まだ送っていない依頼を停止中です。送信済みの操作は取り消されません。")}</output>}
      {profile.grants.length===0?<p className={styles.muted}>{t("Agentを使う画面で、操作ごとに設定できます。")}</p>:profile.grants.map(grant=><div className={styles.grant} key={`${grant.target}:${grant.action}`}><div><strong>{grant.name}</strong><small>{t(noahOperationLabel(grant.action))}</small></div><select aria-label={t('{name}を任せる範囲',{name:t(noahOperationLabel(grant.action))})} value={grant.mode} disabled={busy} onChange={e=>void save({action:'grant',grant:{...grant,mode:e.target.value}})}>{Object.entries(delegationLabels).map(([key,label])=><option key={key} value={key}>{t(label)}</option>)}</select></div>)}
      <Link className={styles.history} href="/noah/activity">{t("実行の履歴と成果を見る")}<ArrowUpRight size={16}/></Link>
    </section>
  </>;
}
export function NoahDelegationPicker({target,name,action,digest,ownerScope,onMode}:{target:string;name:string;action:string;digest:string;ownerScope:string|null;onMode:(mode:DelegationMode|'loading'|'paused')=>void}){
  const state=useNoahProfile(ownerScope),grant=state.profile?.grants.find(g=>g.target===target&&g.action===action);
  const selected=grant?.mode==='deny'?'deny':grant?.digest===digest?grant.mode:grant?'confirm':'allow';
  // The containing form derives its gate from this live policy; the server checks again before dispatch.
  const effective=!state.busy&&state.profile?.available?(state.profile.paused?'paused':selected):'loading';
  // Notify after rendering, never during another component's render.
  return <PolicyControl {...{state,target,name,action,digest,onMode,effective,selected}}/>;
}
function PolicyControl({state,target,name,action,digest,onMode,effective,selected}:{state:ReturnType<typeof useNoahProfile>;target:string;name:string;action:string;digest:string;onMode:(mode:DelegationMode|'loading'|'paused')=>void;effective:DelegationMode|'loading'|'paused';selected:DelegationMode}){
  const {t}=useNoahLocale();

  useEffect(()=>onMode(effective),[effective,onMode]);
  return <div className={styles.policy}><div><strong>{t("この操作を任せる範囲")}</strong><Link href="/noah/profile">{t("すべての設定")}<ArrowUpRight size={14}/></Link></div><div className={styles.segment}>{Object.entries(delegationLabels).map(([mode,label])=><button type="button" key={mode} aria-pressed={selected===mode} disabled={state.busy||!state.profile?.available} onClick={()=>void state.save({action:'grant',grant:{target,name,action,label:action,digest,mode}})}>{t(label)}</button>)}</div>{effective==='paused'&&<p>{t("すべての委任を停止中です。")}</p>}{state.error&&<p role="alert">{state.error}<button type="button" onClick={()=>void state.reload()}>{t("再確認")}</button></p>}<small>{t("支払い・初回の書き込みに必要な確認は省略しません。")}</small></div>;
}
