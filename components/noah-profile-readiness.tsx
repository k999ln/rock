'use client';
import { useNoahLocale } from './noah-locale';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { profileField, type NoahProfileView } from '@/lib/noah-profile-contract';
import type { RegistrationProvider } from '@/lib/noah-registration-contract';
import type { NoahReadyItem } from '@/lib/noah-ready-view';
import styles from './noah-profile.module.css';
export default function NoahProfileReadiness({profile}:{profile:NoahProfileView}){
  const {t}=useNoahLocale();

  const [remote,setRemote]=useState<NoahReadyItem[]>([]),[providers,setProviders]=useState<RegistrationProvider[]>([]),[error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();
    void Promise.all([fetch('/api/noah/intake?',{cache:'no-store',signal:controller.signal}),fetch('/api/noah/registration?',{cache:'no-store',signal:controller.signal})]).then(async responses=>{
      if(responses.some(r=>!r.ok))throw Error('unavailable');
      const [intake,registration]=await Promise.all([responses[0].json() as Promise<{items?:NoahReadyItem[]}>,responses[1].json() as Promise<{providers?:RegistrationProvider[]}>]);
      if(!controller.signal.aborted){setRemote(intake.items??[]);setProviders(registration.providers??[]);}
    }).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();
  },[]);
  const extra=providers.map(provider=>({provider,missing:provider.fields.filter(f=>f.required&&(!profile.reuseEnabled||(f.profileField==='identityDocument'?(!profile.documents.length||Boolean(profile.fields.identityExpiry&&profile.fields.identityExpiry<new Date().toISOString().slice(0,10))):!profileField(f.profileField)||!profile.fields[f.profileField]))).map(f=>f.label)}));
  return <section className={styles.readiness} aria-label={t("使えるAgent")}><h2>{t("今使える")}</h2><ul>{remote.slice(0,3).map(item=><li key={item.id}><Link href={`/noah/ready/agent?id=${encodeURIComponent(item.id)}`}>{item.name}<small>{t("追加の登録情報なし・接続時に利用可否を確認")}</small></Link><span>{t("使う →")}</span></li>)}{extra.filter(e=>!e.missing.length).map(({provider})=><li key={provider.id}><Link href={`/noah/register?agent=${encodeURIComponent(provider.agentIds[0])}`}>{provider.name}<small>{t("保存情報で登録できます")}</small></Link><span>{t("確認 →")}</span></li>)}</ul>
    <Link href="/noah/ready">{t("今の情報でAgentを探す →")}</Link>
    {extra.some(e=>e.missing.length>0)&&<><h2>{t("追加で使える")}</h2><ul>{extra.filter(e=>e.missing.length>0).map(({provider,missing})=><li key={provider.id}><Link href={`/noah/register?agent=${encodeURIComponent(provider.agentIds[0])}`}>{provider.name}<small>{t("必要な情報：")}{missing.join('・')}</small></Link><span>{t("追加 →")}</span></li>)}</ul></>}
    {error&&<p>{t("接続候補を取得できません。「Agentを探す」から確認できます。")}</p>}
  </section>;
}
