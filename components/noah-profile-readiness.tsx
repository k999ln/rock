'use client';
import { useNoahLocale } from './noah-locale';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { profileField, type NoahProfileView } from '@/lib/noah-profile-contract';
import type { RegistrationProvider } from '@/lib/noah-registration-contract';
import type { NoahReadyItem } from '@/lib/noah-ready-view';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
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
  },[profile.ownerScope]);
  const extra=providers.filter(provider=>!provider.accountState).map(provider=>({provider,missing:provider.fields.filter(f=>f.required&&(!profile.reuseEnabled||(f.profileField==='identityDocument'?(!profile.documents.length||Boolean(profile.fields.identityExpiry&&profile.fields.identityExpiry<new Date().toISOString().slice(0,10))):!profileField(f.profileField)||!profile.fields[f.profileField]))).map(f=>f.label)}));
  const pending = providers.filter(p => p.accountState === 'pending' || p.accountState === 'unavailable');
  return <section className={styles.readiness} aria-label={t('使えるAgent')}>
    <h2>{t('今使える')}</h2>
    <NoahAgentPinGrid>
      {providers.filter(p => p.accountState === 'ready').map(p => <NoahAgentPin key={p.id} id={p.agentIds[0] || p.id}
        name={p.name} href={`/noah/ready/agent?id=${encodeURIComponent(p.agentIds[0])}`} meta={<>{t('登録済み')} · {t('使う →')}</>} />)}
      {remote.filter(item => !providers.some(p => p.agentIds.includes(item.id))).slice(0, 3).map(item => <NoahAgentPin key={item.id}
        id={item.id} name={item.name} href={`/noah/ready/agent?id=${encodeURIComponent(item.id)}`}
        meta={<>{t('追加の登録情報なし・接続時に利用可否を確認')} · {t('使う →')}</>} />)}
      {extra.filter(e => !e.missing.length).map(({ provider }) => <NoahAgentPin key={provider.id} id={provider.agentIds[0] || provider.id}
        name={provider.name} href={`/noah/registration?agent=${encodeURIComponent(provider.agentIds[0])}`}
        meta={<>{t('保存情報で登録できます')} · {t('確認 →')}</>} />)}
    </NoahAgentPinGrid>
    <Link href="/noah/ready">{t('今の情報でAgentを探す →')}</Link>
    {extra.some(e => e.missing.length > 0) && <><h2>{t('追加で使える')}</h2>
      <NoahAgentPinGrid>{extra.filter(e => e.missing.length > 0).map(({ provider, missing }) => <NoahAgentPin
        key={provider.id} id={provider.agentIds[0] || provider.id} name={provider.name}
        href={`/noah/registration?agent=${encodeURIComponent(provider.agentIds[0])}`}
        meta={<>{t('必要な情報：')}{missing.join('・')} · {t('追加 →')}</>} />)}</NoahAgentPinGrid>
    </>}
    {!!pending.length && <NoahAgentPinGrid>{pending.map(p => <NoahAgentPin key={p.id} id={p.agentIds[0] || p.id}
      name={p.name} href={`/noah/registration?agent=${encodeURIComponent(p.agentIds[0])}`} meta={t('登録状況を確認')} />)}</NoahAgentPinGrid>}
    {error && <p>{t('接続候補を取得できません。「Agentを探す」から確認できます。')}</p>}
  </section>;
}
