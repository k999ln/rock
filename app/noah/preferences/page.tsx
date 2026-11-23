'use client';
import Link from 'next/link';
import { NoahHapticsSetting } from '@/components/noah-interaction';
import { NoahLanguageSetting, useNoahLocale } from '@/components/noah-locale';
import styles from '@/components/noah-unified.module.css';
export default function NoahPreferences(){const {t}=useNoahLocale();return <main className={styles.page}><header className={styles.heading}><h1>{t('操作の設定')}</h1></header><NoahLanguageSetting/><NoahHapticsSetting/><p><Link href="/noah/devices">{t('端末・実行先')}</Link></p></main>;}
