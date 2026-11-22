'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SkyToolPackage } from '@/lib/sky-tool-package';
import styles from './noah-agent-catalog.module.css';
type Release = { id: string; packageKey: string; manifestSha256: string; manifest: SkyToolPackage };
export default function NoahReleaseDetail({ digest }: { digest: string }) {
  const [release,setRelease] = useState<Release|null>(null),[error,setError] = useState(''),[attempt,setAttempt] = useState(0);
  useEffect(()=>{
    const c=new AbortController();
    void fetch(`/api/noah/releases?manifest=${encodeURIComponent(digest)}`,{cache:'no-store',signal:c.signal}).then(async r=>{
      const d=await r.json() as { release?:Release; error?:string };
      if(!r.ok||!d.release)throw new Error(d.error||'配布版を読み込めません。');
      if(!c.signal.aborted){setRelease(d.release);setError('');}
    }).catch(e=>{if(!c.signal.aborted){setRelease(null);setError(e instanceof Error?e.message:'配布版を読み込めません。');}});
    return()=>c.abort();
  },[digest,attempt]);
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/noah/saved?tab=agents">自分のAgent</Link><Link href="/noah/marketplace">マーケット</Link><Link href="/noah/purchases">購入履歴</Link></nav>
    {error?<section className={styles.notice}><h1>配布版の利用条件を確認してください</h1><p role="alert">{error}</p><button onClick={()=>setAttempt(n=>n+1)}>再確認</button><p>購入・審査・配布の有効性を確認してから接続します。購入履歴から支払い状況を確認できます。</p></section>:!release?<output>配布版と利用権を確認中…</output>:<>
      <header className={styles.hero}><div><span className={styles.eyebrow}>RELEASE / v{release.manifest.version}</span><h1>{release.manifest.name}</h1><p>{release.manifest.summary}</p></div></header>
      <section className={styles.notice}><p>提供者：{release.manifest.developer.displayName} · {release.manifest.source.license}</p><p>{release.manifest.pricing.note}</p><p>このMacの隔離環境で実行します。購入した配布版を固定し、起動時に利用権と配布状態を再確認します。</p></section>
      <Link href={`/noah/launch?agent=${release.id}`}>自分のMacで接続・実行</Link>
      <details className={styles.notice}><summary>配布版の照合情報</summary><p>{release.packageKey}</p><p className={styles.digest}>{release.manifestSha256}</p><p className={styles.digest}>{release.manifest.source.artifact?.sha256}</p></details>
    </>}
  </main>;
}
