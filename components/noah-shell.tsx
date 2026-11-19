'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash links also work across the OS home aliases. */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Bot, Newspaper, Users, MessageCircle, Plus, ListChecks, Laptop, LayoutGrid } from 'lucide-react';
import { noahActionHref, noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';
import { NoahSurfaceContext } from './noah-surface-context';
import ProductAppHeader from './product-app-header';

export default function NoahShell({ children, mode = 'local' }: { children: ReactNode; mode?: NoahSurfaceMode }) {
  const pathname = usePathname();
  const preview = pathname.startsWith('/noah/public');
  const effectiveMode = preview ? 'public' : mode, base = preview ? '/noah/public' : '/noah';
  const [hash, setHash] = useState('');
  useEffect(() => {
    const update = () => {
      const legacy = noahLegacyHref(window.location.hash, effectiveMode, base);
      const post = new URLSearchParams(window.location.search).get('post');
      if (!pathname.endsWith('/social') && (window.location.hash.startsWith('#community=') || (post && /^[a-f0-9-]{36}$/i.test(post)))) {
        window.location.replace(`${base}/social${post ? `?post=${encodeURIComponent(post)}` : ''}${window.location.hash}`);
      } else if (legacy) { const target = new URL(legacy, window.location.origin); target.search = window.location.search; window.location.replace(target.href); }
      else setHash(window.location.hash);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [pathname, effectiveMode, base]);
  const home = pathname === base || pathname === '/' || pathname === '/os';
  const action = (target: string) => noahActionHref(effectiveMode, base, target);
  const items = [
    { href: `${base}/features`, label: '機能一覧', Icon: LayoutGrid, selected: pathname.endsWith('/features') },
    { href: `${base}#timeline`, label: 'タイムライン', Icon: Newspaper, selected: home },
    { href: `${base}/social#compose`, label: '投稿・共有', Icon: MessageCircle, selected: pathname.endsWith('/social') && hash !== '#communities' },
    { href: `${base}/social#communities`, label: 'コミュニティーに参加', Icon: Users, selected: pathname.endsWith('/social') && hash === '#communities' },
  ];
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}><div className={styles.shell} data-noah-surface={effectiveMode}>
    <a href="#noah-content" className={styles.skip}>メインコンテンツへ</a>
    <ProductAppHeader active="noah" noahHref={`${base}#timeline`} environment={effectiveMode === 'local' ? 'Mac' : 'Web'} />
    <div className={`${styles.body} ${!home && !pathname.endsWith("/social") && !pathname.includes("/agents") && !pathname.endsWith("/mac") ? styles.workspaceBody : ""}`}>
      <aside className={styles.rail}>
        <div className={styles.railInner}>
          <h1>Noah</h1><p>ニュース、つながり、Agent。</p>
          <nav aria-label="Noahの機能">{items.map(({ href, label, Icon, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined}><Icon size={22} /><span>{label}</span></a>)}</nav>
          <nav className={styles.personal} aria-label="Agentの管理と運用">
            <Link href={`${base}/features`} className={styles.mobileFeatures}><LayoutGrid size={22} />機能一覧</Link>
            <Link href={action('library')}><Bot size={22} />自分のAgent</Link>
            <Link href={action('work')}><ListChecks size={22} />仕事・運用</Link>
          </nav>
          <Link className={styles.add} href={action('register')}><Plus size={19} />Agentを登録</Link>
          <p className={styles.railNote}>{effectiveMode === 'local' ? '対応AgentはこのMacの裏側で動きます。進捗と停止はNoahから。' : '登録・管理はこのNoahで。対応Agentの処理は接続したMacで動きます。'}</p>
        </div>
      </aside>
      <div className={styles.content} id="noah-content" tabIndex={-1}>{children}</div>
      <aside className={styles.support}>
        <section><span className={styles.eyebrow}>DISCOVER</span><h2>任せたい仕事から探す</h2><p>できること、配布元、接続条件を確認して選べます。</p><Link href={`${base}/agents`}>Agentを探す <ArrowUpRight size={16} /></Link></section>
        <section><Laptop size={23} /><h2>{effectiveMode === 'local' ? 'このMacで使う' : '自分のMacで動かす'}</h2><p>{effectiveMode === 'local' ? '自分のAgentを登録・管理。対応Agentの詳細から接続し、仕事の実行・停止まで。' : 'Macに実行器を接続すると、同じアカウントのNoahから依頼・成果の確認・停止ができます。'}</p><Link href={action('library')}>自分のAgentへ <ArrowUpRight size={16} /></Link><Link href={action('work')}>仕事・成果を確認 <ArrowUpRight size={16} /></Link></section>
        <footer>Noah · avokado</footer>
      </aside>
    </div>
  </div></NoahSurfaceContext.Provider>;
}
