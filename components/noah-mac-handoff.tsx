import Link from 'next/link';
import { Laptop } from 'lucide-react';
import styles from './noah-shell.module.css';

export default function NoahMacHandoff() {
  return (
    <main className={styles.handoff}>
      <Laptop size={36} />
      <h1>自分のMacをNoahにつなぐ</h1>
      <p>
        NoahでAgentを選び、仕事の依頼・成果の確認・停止まで操作できます。処理はMacの専用環境で動き、作業中の画面を操作しません。
      </p>
      <p>
        初期対応はApple Silicon
        Macです。初回は実行器の導入と、本人によるMacの承認が必要です。
      </p>
      <p><Link href="/noah/agents/new?launch=1">Agentを登録する</Link> · <Link href="/noah/launch">Noahの管理画面へ</Link></p>
      <ol>
        <li>
          <a href="/noah-downloads/Noah-Mac.zip" download>
            Mac用Noah Runnerをダウンロード
          </a>
          して展開し、<code>Install.command</code>を開きます。
          <a href="/noah-downloads/Noah-Mac.zip.sha256" download>
            SHA-256
          </a>
        </li>
        <li>
          <a
            href="https://nodejs.org/en/download"
            target="_blank"
            rel="noreferrer"
          >
            Node.js 24以上
          </a>
          と、Colima・Docker CLI・Ollama・Gitを用意します。
          <a
            href="https://colima.run/docs/installation/"
            target="_blank"
            rel="noreferrer"
          >
            公式の導入手順
          </a>
          。Homebrewを使う場合は{' '}
          <code>brew install node colima docker ollama git</code> です。
        </li>
        <li>
          インストール結果に表示される <code>noah doctor</code>{' '}
          で必要なものを確認し、<code>noah pair</code>{' '}
          で表示されたNoahのURLを開いて、このMacを自分のアカウントに登録します。
        </li>
        <li>
          <code>noah start</code> で背景の実行器を起動し、
          <Link href="/noah/launch">Agentを使う</Link>
          からMacとAgentを選んで接続します。
        </li>
      </ol>
      <p>
        接続後はスマホの同じアカウントからも依頼・確認・停止できます。初回のモデル取得には時間と空き容量が必要です。Macがスリープ中・電源オフ・オフラインの場合は処理できません。
      </p>
      <details>
        <summary>停止・再接続</summary>
        <p>
          仕事とAgentの停止はNoahで行います。実行器全体は <code>noah stop</code>{' '}
          で停止し、<code>noah status</code>{' '}
          で確認できます。通信が切れた仕事は自動再実行しません。状態を確認してから再接続してください。
        </p>
      </details>
      <details>
        <summary>以前のMac版を使う</summary>
        <a href="http://127.0.0.1:3107/noah">このMacの旧ローカル画面を開く</a>
        <p>このリンクは開いた端末自身を指します。</p>
      </details>
    </main>
  );
}
