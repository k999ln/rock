import type { Metadata } from 'next';
import Link from 'next/link';
import { COWAGENT_GUIDE_PATH, COWAGENT_PUBLIC_ID, NOAH_PUBLIC_ORIGIN } from '@/lib/noah-public-guide';
import styles from './guide.module.css';

const title = 'CowAgentをMacで試す準備';
const description = 'NoahでCowAgentを探して配布元と利用条件を確認する18秒の操作例。Apple Silicon Macの接続手順と最初の依頼例も紹介します。';
const canonicalUrl = NOAH_PUBLIC_ORIGIN + COWAGENT_GUIDE_PATH;
const mediaRoot = 'https://raw.githubusercontent.com/k999ln/rock/153f3ba9c236759defb2811ca0f76745f925347f/docs/assets/readme';
const videoUrl = `${mediaRoot}/noah-first-agent.mp4`;
const posterUrl = `${mediaRoot}/noah-first-agent-poster.jpg`;
const videoTitle = 'NoahでCowAgentを探す';
const agentHref = `/noah/agents/${COWAGENT_PUBLIC_ID}`;
const macHref = `/noah/mac?agent=${COWAGENT_PUBLIC_ID}`;

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
    description: 'NoahのカタログでCowAgentを検索し、詳細から接続画面へ進む操作例。',
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
        <h1>{title}</h1>
        <p>配布元と利用条件を確認し、Apple Silicon Macから会議メモを整理する準備をします。</p>
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
          />
          <a href={videoUrl}>18秒の操作動画を開く</a>
        </video>
        <figcaption>CowAgentの検索から接続画面まで（18秒・音声なし）</figcaption>
      </figure>
      <nav className={styles.actions} aria-label="CowAgentを試す">
        <Link href={agentHref}>CowAgentの詳細を見る</Link>
        <Link href={macHref}>Macをつなぐ手順を見る</Link>
      </nav>
      <section aria-labelledby="cowagent-steps">
        <h2 id="cowagent-steps">最初の依頼まで</h2>
        <ol>
          <li>詳細で配布元・ライセンス・利用条件を読み、「Noahで接続して使う」へ進みます。</li>
          <li>サインインし、Apple Silicon MacにNoah Runnerを設定して、同じアカウントでMacを承認します。</li>
          <li>実行するMacとCowAgentを選び、決まったこと・担当・期限を整理する短い依頼を送ります。</li>
        </ol>
        <p>たとえば「読書会は土曜。案内文は金曜までに共有。担当は未定。」を渡すときは、未定の担当を補わずに返すよう添えます。</p>
      </section>
    </main>
  );
}
