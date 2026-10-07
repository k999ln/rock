'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ADDONS_CHANGED_EVENT, optionalAddons, readAddons, setAddon, type AddonId } from '@/lib/rockstar-addons';
import styles from './rockstar-addons.module.css';
export default function RockstarAddons() {
  const [enabled, setEnabled] = useState<AddonId[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const read = () => { try { setEnabled(readAddons(localStorage)); setError(''); } catch { setEnabled(null); setError('追加状態を読み取れません。このブラウザーの保存設定を確認してください。'); } };
    const timer = setTimeout(read, 0);
    window.addEventListener('storage', read);
    return () => { clearTimeout(timer); window.removeEventListener('storage', read); };
  }, []);
  function toggle(id: AddonId) {
    if (enabled === null) return;
    try { setEnabled(setAddon(localStorage, id, !enabled.includes(id))); setError(''); window.dispatchEvent(new Event(ADDONS_CHANGED_EVENT)); }
    catch { setError('保存できませんでした。追加状態は変更していません。'); }
  }
  return <main className={styles.page}>
    <Link href="/">← RockstarOS Home</Link>
    <header><p className={styles.eyebrow}>ROCKSTAROS ADD</p><h1>必要な機能を、いまの端末に。</h1><p>Sky・データ回収・LLMを、同じホームから開けます。追加状態はこのブラウザーに保存します。</p></header>
    <div className={styles.grid}>
      <section className={styles.card}><span className={styles.badge}>標準機能</span><h2>Sky</h2><p>Agentやツールを探して、自分の環境につなぐ。</p><Link className={styles.primary} href="/sky">Skyを開く →</Link></section>
      {optionalAddons.map(addon => <section key={addon.id} className={styles.card}><span className={styles.badge}>{enabled === null ? (error ? '保存を確認できません' : '確認中') : enabled.includes(addon.id) ? 'ホームに追加済み' : '追加できる機能'}</span><h2>{addon.name}</h2><p>{addon.description}</p><button className={styles.primary} disabled={enabled === null} onClick={() => toggle(addon.id)}>{enabled?.includes(addon.id) ? 'ホームから外す' : 'ホームに追加'}</button>{enabled?.includes(addon.id) && <Link href={addon.href}>{addon.name}を開く →</Link>}</section>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <section className={styles.panel}><h2>端末を変えても、同じ入口から</h2><p>対応ブラウザーで開いて使えます。アプリのように開きたい場合は、端末のホーム画面に追加してください。</p><div className={styles.links}><Link href="/settings/system">ホーム画面への追加方法</Link><Link href="/connect">SIM/eSIM・サービス利用権</Link><Link href="/settings">設定と復旧</Link></div></section>
    <p className={styles.hint}>LLMは接続先と利用条件の確認が必要です。クラウド実行は見積り・上限の承認後に進みます。端末内モデルの導入は、対応アプリ／端末で行います。</p>
  </main>;
}
