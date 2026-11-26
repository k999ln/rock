'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import NoahPinHome from './noah-pin-home';
import styles from './noah-pins.module.css';
import { useNoahLocale } from './noah-locale';
export default function NoahPublicCatalog({basePath='/noah',embedded=false,initialQuery='',initialSource='',onQueryChange,via=''}:{basePath?:string;embedded?:boolean;initialQuery?:string;initialSource?:string;onQueryChange?:(query:string)=>void;via?:string}) {
  const params=useSearchParams(),{t}=useNoahLocale();
  const [query,setQuery]=useState(initialQuery||params.get('collectionQuery')||'');
  function search(value:string){
    setQuery(value);onQueryChange?.(value);
    const url=new URL(window.location.href);if(value)url.searchParams.set('q',value);else url.searchParams.delete('q');url.searchParams.delete('collectionQuery');
    window.history.replaceState(window.history.state,'',url);
  }
  return <main className={styles.explore} data-noah-catalog={embedded?'embedded':undefined} data-via={via||undefined}>
    <h1>{t('Agentを探す')}</h1>
    <search className={styles.searchBox}><Search size={20} aria-hidden="true"/><input type="search" aria-label={t('Agentを検索')} placeholder={t('Agent名・できること')} maxLength={200} value={query} onChange={e=>search(e.target.value)}/>{query&&<button type="button" aria-label={t('検索をクリア')} onClick={()=>search('')}><X size={20}/></button>}</search>
    {query.trim() && ['daisuke','anicca','ココナラ','coconala'].some(word=>query.toLowerCase().includes(word)) && <p><Link href="/noah/coconala/agent">DaisukeのココナラAgent · Macで案件を探して提案を下書き</Link></p>}
    <NoahPinHome searchQuery={query} initialSource={params.get('collectionSource')??initialSource} onClearQuery={()=>search('')}/>
    {embedded && <Link className={styles.statusLink} href="/noah/agents/verified">{t('Agentの稼働状況を見る')}</Link>}
    <details className={styles.sourceFilter}><summary>{t('Toolを探す')}</summary><Link href={`${basePath}?tab=tools&q=${encodeURIComponent(query)}`}>{t('Toolを探す')}</Link></details>
  </main>;
}
