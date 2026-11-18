'use client';
/* oxlint-disable next/no-html-link-for-pages -- Hash links also work across the OS home aliases. */
import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Bot, Newspaper, Users, MessageCircle, Plus, ListChecks, Laptop } from 'lucide-react';
import { webBrandIcon } from '@/lib/web-brand';
import { noahActionHref, noahLegacyHref, type NoahSurfaceMode } from '@/lib/noah-surface';
import styles from './noah-shell.module.css';
import { NoahSurfaceContext } from './noah-surface-context';

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
      } else if (legacy) window.location.replace(legacy);
      else setHash(window.location.hash);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, [pathname, effectiveMode, base]);
  const home = pathname === base || pathname === '/' || pathname === '/os';
  const action = (target: string) => noahActionHref(effectiveMode, base, target);
  const items = [
    { href: `${base}#timeline`, label: 'タイムライン', Icon: Newspaper, selected: home },
    { href: `${base}/social#compose`, label: '投稿・共有', Icon: MessageCircle, selected: pathname.endsWith('/social') && hash !== '#communities' },
    { href: `${base}/social#communities`, label: 'コミュニティーに参加', Icon: Users, selected: pathname.endsWith('/social') && hash === '#communities' },
  ];
  return <NoahSurfaceContext.Provider value={{ mode: effectiveMode, base, hash }}><div className={styles.shell} data-noah-surface={effectiveMode}>
    <a href="#noah-content" className={styles.skip}>メインコンテンツへ</a>
    <header className={styles.topbar}>
      <a href={`${base}#timeline`} className={styles.brand}><Image src={webBrandIcon} alt="" width={32} height={32} unoptimized /><strong>RockstarOS</strong></a>
      <nav aria-label="OSのアプリ"><a href={`${base}#timeline`} aria-current="page">Noah</a><Link href="/chat">Eve <ArrowUpRight size={13} /></Link></nav>
      <span className={styles.environment}>{effectiveMode === 'local' ? 'Mac' : 'Web'}</span>
    </header>
    <div className={styles.body}>
      <aside className={styles.rail}>
        <div className={styles.railInner}>
          <h1>Noah</h1><p>ニュース、つながり、Agent。</p>
          <nav aria-label="Noahの機能">{items.map(({ href, label, Icon, selected }) => <a key={label} href={href} aria-current={selected ? 'page' : undefined}><Icon size={22} /><span>{label}</span></a>)}</nav>
          <nav className={styles.personal} aria-label="Agentの管理と運用">
            <Link href={action('library')}><Bot size={22} />自分のAgent</Link>
            <Link href={action('work')}><ListChecks size={22} />仕事・運用</Link>
          </nav>
          <Link className={styles.add} href={action('register')}><Plus size={19} />Agentを登録</Link>
          <p className={styles.railNote}>{effectiveMode === 'local' ? '対応AgentはこのMacの裏側で動きます。進捗と停止はNoahから。' : '登録・管理・接続・実行・停止はMac版で利用できます。'}</p>
        </div>
      </aside>
      <div className={styles.content} id="noah-content" tabIndex={-1}>{children}</div>
      <aside className={styles.support}>
        <section><span className={styles.eyebrow}>DISCOVER</span><h2>任せたい仕事から探す</h2><p>できること、配布元、接続条件を確認して選べます。</p><Link href={`${base}/agents`}>Agentを探す <ArrowUpRight size={16} /></Link></section>
        <section><Laptop size={23} /><h2>{effectiveMode === 'local' ? 'このMacで使う' : 'Mac版につなぐ'}</h2><p>{effectiveMode === 'local' ? '自分のAgentを登録・管理。対応Agentの詳細から接続し、仕事の実行・停止まで。' : 'Noahが起動しているMacで管理画面を開きます。スマホからMacを遠隔操作する機能は準備中です。'}</p><Link href={action('library')}>自分のAgentへ <ArrowUpRight size={16} /></Link><Link href={action('work')}>仕事・成果を確認 <ArrowUpRight size={16} /></Link></section>
        <footer>Noah · avokado</footer>
      </aside>
    </div>
  </div></NoahSurfaceContext.Provider>;
}
