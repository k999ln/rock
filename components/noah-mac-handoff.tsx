'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Laptop,
} from 'lucide-react';
import styles from './noah-mac-handoff.module.css';

function Command({ value }: { value: string }) {
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <div className={styles.command}>
      <code>{value}</code>
      <button
        aria-label={`${value}をコピー`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {copied ? <Check size={17} /> : <Copy size={17} />}
        <span>{copied ? 'コピー済み' : 'コピー'}</span>
      </button>
      {failed && <small role="alert">文字を選択してコピーしてください。</small>}
    </div>
  );
}
export default function NoahMacHandoff({
  initialAgent = '',
}: {
  initialAgent?: string;
}) {
  const agent = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(initialAgent)
    ? initialAgent
    : '';
  const launchHref = `/noah/activity${agent ? `?agent=${encodeURIComponent(agent)}` : '?compose=1'}#library`;
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
        <span className={styles.chip}>Apple Silicon Mac</span>
      </header>
      <ol className={styles.steps}>
        <li>
          <span className={styles.number}>1</span>
          <div>
            <h2>Noahを入れる</h2>
            <a
              className={styles.download}
              href="/noah-downloads/Noah-Mac.zip"
              download
            >
              <Download size={17} />
              Mac用Noahをダウンロード
            </a>
            <p>
              展開して <code>Install.command</code> を開く
            </p>
            <details>
              <summary>
                必要なもの
                <ChevronDown size={16} />
              </summary>
              <dl>
                <div>
                  <dt>ツール</dt>
                  <dd>Node.js 24以上・Colima・Docker・Ollama・Git</dd>
                </div>
                <div>
                  <dt>Homebrewでまとめて準備</dt>
                  <dd>
                    <Command value="brew install node colima docker ollama git" />
                  </dd>
                </div>
                <div>
                  <dt>準備を確認</dt>
                  <dd>
                    <Command value="noah doctor" />
                  </dd>
                </div>
              </dl>
              <a
                href="https://colima.run/docs/installation/"
                target="_blank"
                rel="noopener noreferrer"
              >
                導入手順
                <ArrowUpRight size={14} />
              </a>
              <a
                href="https://nodejs.org/en/download"
                target="_blank"
                rel="noopener noreferrer"
              >
                Node.js
                <ArrowUpRight size={14} />
              </a>
              <a href="/noah-downloads/Noah-Mac.zip.sha256" download>
                SHA-256
              </a>
            </details>
          </div>
        </li>
        <li>
          <span className={styles.number}>2</span>
          <div>
            <h2>このMacを登録</h2>
            <p>ターミナルで実行 → 表示されたURLで承認</p>
            <Command value="noah pair" />
          </div>
        </li>
        <li>
          <span className={styles.number}>3</span>
          <div>
            <h2>Noahを起動</h2>
            <Command value="noah start" />
            <Link className={styles.continue} href={launchHref}>
              Agentを使う
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </li>
      </ol>
      <details className={styles.extra}>
        <summary>
          停止・利用条件
          <ChevronDown size={16} />
        </summary>
        <dl>
          <div>
            <dt>実行器を止める</dt>
            <dd>
              <Command value="noah stop" />
            </dd>
          </div>
          <div>
            <dt>接続状態</dt>
            <dd>
              <Command value="noah status" />
            </dd>
          </div>
          <div>
            <dt>実行できる時</dt>
            <dd>
              Macが起動・接続中。初回はモデル取得の時間と空き容量が必要です。
            </dd>
          </div>
          <div>
            <dt>スマホから使う</dt>
            <dd>同じアカウントで依頼・成果確認・停止。</dd>
          </div>
          <div>
            <dt>画面へのアクセス</dt>
            <dd>
              Macの専用環境で処理。本人の画面・入力・ブラウザは操作しません。
            </dd>
          </div>
        </dl>
      </details>
    </main>
  );
}
