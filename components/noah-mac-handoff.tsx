'use client';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Download,
  Laptop,
} from 'lucide-react';
import styles from './noah-mac-handoff.module.css';

export default function NoahMacHandoff({
  initialAgent = '',
}: {
  initialAgent?: string;
}) {
  const agent = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(initialAgent)
    ? initialAgent
    : '';
  const query = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  const launchHref = `/noah/activity${query || '?compose=1'}#library`;
  return (
    <main className={styles.page}>
      <Link href={launchHref} className={styles.back}>
        <ArrowLeft size={16} />
        Agentに戻る
      </Link>
      <header>
        <span className={styles.icon}>
          <Laptop size={25} />
        </span>
        <h1>Macをつなぐ</h1>
        <span className={styles.chip}>Apple Silicon · macOS 15以降</span>
      </header>
      <section className={styles.connect}>
        <h2>アプリを開いて、接続するだけ。</h2>
        <a className={styles.primary} href={`noah://connect${query}`}>
          Noahを開いて接続
          <ArrowUpRight size={18} />
        </a>
        <p>Noahアプリの「接続する」から進めます。</p>
      </section>
      <section className={styles.firstTime}>
        <h2>初めて使う</h2>
        <a
          className={styles.download}
          href="/noah-downloads/Noah-Mac.zip"
          download
        >
          <Download size={17} />
          Mac用Noahをダウンロード
        </a>
        <ol className={styles.steps}>
          <li>
            <span className={styles.number}>1</span>
            <span>
              ダウンロードして <strong>Noah.app</strong> を開く
            </span>
          </li>
          <li>
            <span className={styles.number}>2</span>
            <span>「接続する」を押し、このMacを承認</span>
          </li>
        </ol>
        <p>準備ツールが必要な場合は、アプリが案内します。</p>
        <p className={styles.preview}>
          開発プレビュー版 · macOSの配布公証は準備中です。
        </p>
      </section>
      <Link className={styles.back} href={launchHref}>
        接続できたら、Agentを使う
        <ArrowUpRight size={16} />
      </Link>
      <details className={styles.extra}>
        <summary>
          接続について
          <ChevronDown size={16} />
        </summary>
        <dl>
          <div>
            <dt>スマホで使う</dt>
            <dd>Macを一度つなげば、同じアカウントで依頼・成果確認・停止。</dd>
          </div>
          <div>
            <dt>止める</dt>
            <dd>仕事は「実行中」から。Macとの接続はNoahアプリから停止。</dd>
          </div>
          <div>
            <dt>動く場所</dt>
            <dd>起動中のMacの専用環境。あなたの画面・入力は操作しません。</dd>
          </div>
          <div>
            <dt>初回の準備</dt>
            <dd>
              必要な実行ツールを自動取得します。Macの許可画面と本人確認はご自身で進めます。
            </dd>
          </div>
        </dl>
        <a href="/noah-downloads/Noah-Mac.zip.sha256" download>
          ダウンロードの確認情報
        </a>
      </details>
    </main>
  );
}
