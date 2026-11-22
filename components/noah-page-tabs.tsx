'use client';
import Link from 'next/link';
import { useNoahLocale } from './noah-locale';
import { noahPageHref, type NoahPageParams } from '@/lib/noah-page-routes';
import styles from './noah-page-tabs.module.css';
export default function NoahPageTabs({page,active,items,params={}}:{page:'explore'|'saved';active:string;items:readonly (readonly [string,string])[];params?:NoahPageParams}) {
  const {t}=useNoahLocale();
  return <nav className={styles.tabs} aria-label={t(page==='explore'?'探すもの':'保存したもの')}>{items.map(([id,label])=><Link key={id} href={noahPageHref(page,params,id)} aria-current={active===id?'page':undefined}>{t(label)}</Link>)}</nav>;
}
