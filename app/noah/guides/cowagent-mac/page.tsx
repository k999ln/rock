import type { Metadata } from 'next';
import Link from 'next/link';
import { COWAGENT_GUIDE_PATH, COWAGENT_PUBLIC_ID } from '@/lib/noah-public-guide';
import { NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-origin';
import styles from './guide.module.css';

const title = 'CowAgentをMacで試す準備';
const description = 'NoahでCowAgentの配布元と利用条件を確認する18秒の操作例。Apple Silicon Macをつなぎ、実行対応Agentで最初の成果を確認する現行手順を案内します。';
const canonicalUrl = NOAH_PUBLIC_ORIGIN + COWAGENT_GUIDE_PATH;
const mediaRoot = 'https://raw.githubusercontent.com/iceiceice999/rock/84ae86079b6c3427d9363b1ed4e0d4371adf2920/docs/assets/readme';
const videoUrl = `${mediaRoot}/noah-first-agent.mp4`;
const posterUrl = `${mediaRoot}/noah-first-agent-poster.jpg`;
const videoTitle = 'NoahでCowAgentを探す';
const agentHref = `/noah/agents/${COWAGENT_PUBLIC_ID}`;

export const metadata: Metadata = {
  title: `${title} — Noah`,
  description,
  alternates: { canonical: canonicalUrl },
  openGraph: {
    type: 'website',
    title: `${title} — Noah`,
    description,
    url: canonicalUrl,
    images: [{ url: posterUrl, alt: videoTitle }],
  },
};

export default function CowAgentMacGuide() {
  const video = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: videoTitle,
    description: 'Noahの公開カタログでCowAgentを検索し、配布元と利用条件を確認する操作例。',
    thumbnailUrl: posterUrl,
    uploadDate: '2026-11-21T00:03:05+09:00',
    duration: 'PT18S',
    contentUrl: videoUrl,
  };

  return (
    <main className={styles.guide}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify(video).replace(/</g, '\\u003c'),
      }} />
      <header>
        <p className={styles.eyebrow}>NOAH / COWAGENT</p>
        <h1>{title}</h1>
        <p>まず配布元と利用条件を確かめます。Macを実行先にする場合は、現在のNoah Runnerの手順で接続します。</p>
      </header>
      <figure>
        <video
          aria-label={videoTitle}
          controls
          playsInline
          preload="metadata"
          poster={posterUrl}
          width={1080}
          height={1350}
        >
          <source src={videoUrl} type="video/mp4" />
          <track
            kind="captions"
            src={`${COWAGENT_GUIDE_PATH}/captions.vtt`}
            srcLang="ja"
            label="日本語"
            default
          />
          <a href={videoUrl}>18秒の操作動画を開く</a>
        </video>
        <figcaption>2026年11月21日の操作例（18秒・音声なし）。現在の画面では、紹介情報と実行対応Agentを区別して表示します。</figcaption>
      </figure>
      <aside className={styles.notice} aria-labelledby="cowagent-status">
        <h2 id="cowagent-status">CowAgentの現在の扱い</h2>
        <p>CowAgentは配布元を確認済みの紹介情報です。Noahでの接続・実行・成果受取までは確認済みではありません。詳細で配布元、ライセンス、利用条件を確認できます。</p>
        <Link href={agentHref}>CowAgentの詳細を見る</Link>
      </aside>
      <section aria-labelledby="first-result">
        <h2 id="first-result">Macをつないで最初の成果を見る</h2>
        <ol>
          <li><Link href="/noah/devices#mac">Mac用Noahの導入手順</Link>を開き、Apple Silicon MacへRunnerを入れます。</li>
          <li><code>noah pair</code> が表示するURLを同じブラウザで開き、<Link href="/noah/mac/connect">8文字のコードと端末名を確認して承認</Link>します。</li>
          <li><Link href="/noah">実行対応と表示されるAgent</Link>を選び、入力と送信先を確認して依頼します。</li>
          <li><Link href="/noah/activity">実行中</Link>で状態を確認し、完了後は<Link href="/noah/saved?tab=results">保存した成果</Link>からも開けます。結果が不明な場合は自動で同じ依頼を送り直しません。</li>
        </ol>
      </section>
      <nav className={styles.actions} aria-label="次に進む">
        <Link href="/noah/devices#mac">Macの導入手順へ</Link>
        <Link href="/noah">実行対応Agentを探す</Link>
        <Link href="/noah/saved?tab=results">成果を確認する</Link>
      </nav>
    </main>
  );
}
