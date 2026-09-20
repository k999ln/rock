import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import previewData from '../../data/rockstaros-preview.json';
import styles from './preview.module.css';

const studioUrl = 'https://rockstaros-kaiya.noellesugar1.chatgpt.site/studio';
const installUrl = previewData.publicDownloadUrl ?? '/rockstaros/guide#install';

const developerCode = `import { createSkyToolApp } from '@rockstaros/sky-tool-sdk';

const sky = createSkyToolApp({
  skyUrl: process.env.SKY_URL,
  developerToken: process.env.SKY_DEVELOPER_TOKEN,
});

sky.tool({
  name: 'my_tool',
  description: 'What your tool does',
  handler: async (input) => runMyTool(input),
});

await sky.start({ port: 8787 });`;

export const metadata: Metadata = {
  title: 'avocadoMini / RockstarOS — 考える時間を、つくる時間に',
  description:
    'avocadoMiniは希望参考価格41万円のハードウェア構想。高性能LLMを搭載するRockstarOSを目指し、仕事と発明の作業をスムーズにします。現在は設計段階です。',
};

export default function RockstarPreview() {
  return (
    <main className={styles.landing}>
      <header className={styles.landingHeader}>
        <Link href="/" className={styles.brand} aria-label="ホームへ戻る">
          Rockstar<span>OS</span>
        </Link>
        <span className={styles.version}>HARDWARE / SOFTWARE / AI</span>
      </header>

      <section className={styles.installHero} aria-labelledby="preview-title">
        <div className={styles.heroGlow} aria-hidden="true" />
        <p className={styles.kicker}>ROCKSTAROS / YOUR IDEAS, IN MOTION</p>
        <h1 id="preview-title">
          Your ideas.
          <br />
          In your hands.
        </h1>
        <p className={styles.heroJa}>考える時間を、つくる時間に。avocadoMiniと高性能LLM搭載を目指すRockstarOSで、仕事と発明の作業をスムーズに。</p>
        <a className={styles.installButton} href="#avocado-mini">
          <span>avocadoMiniを見る</span>
          <span aria-hidden="true">↗</span>
        </a>
        <p className={styles.installNote}>
          現在は設計段階 · 実機試作・販売はまだ行っていません
        </p>
      </section>

      <nav className={styles.access} aria-label="製品ホーム、アプリ、OS本体への入口">
        <h2>入口は、ホームページ・アプリ・OS本体。</h2>
        <p>このページで製品を知り、OSの導入方法を確認できます。アプリやOSの中で、Skyなどのサービスを使います。</p>
        <div className={styles.accessCards}>
          <a href="#avocado-mini"><strong>ホームページ</strong><span>製品紹介とOS導入の入口。avocadoMiniとRockstarOSの現在地を見る。</span></a>
          <Link href="/"><strong>アプリを開く</strong><span>Web版の作業画面。Sky、Zema、Studioなどをここから使う。</span></Link>
          <Link href="/rockstaros/guide"><strong>OS本体・導入案内</strong><span>Developer Previewの対応環境、導入手順、配布状況を確認する。</span></Link>
        </div>
        <p>アプリ内のサービス</p>
        <div className={styles.accessLinks}>
          <Link href="/rockstaros/crowdfunding">avocadoMiniクラファン企画</Link>
          <Link href="/sky">Sky</Link>
          <Link href="/chat">Zema</Link>
          <Link href="/wallet">Wallet</Link>
          <Link href="/market">Market</Link>
          <Link href="/studio">Material Invention Studio</Link>
        </div>
      </nav>

      <section className={styles.product} id="avocado-mini" aria-labelledby="product-title">
        <div className={styles.productCopy}>
          <p className={styles.kicker}>01 / HARDWARE CONCEPT</p>
          <h2 id="product-title">avocadoMini</h2>
          <p className={styles.productLead}>考える時間を、つくる時間に。</p>
          <p>
            四方向のセンサーで手の動きを捉え、物質のデジタル模型を組み合わせて候補を比べる構想です。
            高性能LLMを搭載するRockstarOSを目指し、Material Invention Studioでの操作、候補の整理、記録をスムーズにつなぎます。
          </p>
          <p className={styles.productPrice}><strong>41万円</strong><span>希望参考価格 · 販売価格未確定</span></p>
          <Link href="/rockstaros/crowdfunding" className={styles.campaignReturn}>クラファン企画を見る ↗</Link>
          <p className={styles.productStatus}>
            設計中。実機と高性能LLMの製品搭載は未完成です。画像はコンセプトで、追跡精度・表示方式・安全性を実証した実機写真ではありません。
          </p>
        </div>
        <figure className={styles.productVisual}>
          <Image
            src="/rockstaros/avocado-mini-concept.png"
            alt="四方向センサーと作業面を備えたavocadoMiniの設計コンセプト図"
            width="1680"
            height="940"
            loading="lazy"
          />
          <figcaption>avocadoMini / design concept · prototype pending</figcaption>
        </figure>
      </section>

      <section className={styles.platform} aria-labelledby="platform-title">
        <div>
          <p className={styles.kicker}>02 / TECHNOLOGY FOUNDATION</p>
          <h2 id="platform-title">あなたが選んだAIと、進めるための土台。</h2>
          <p>
            RockstarOSは、選んだToolへの依頼、確認、成果の記録をつなぐために開発しています。
            高性能な交換可能LLMの搭載は製品目標で、現在の実機検証は固定モデルのDeveloper Preview段階です。SkyとZemaはアプリとOS内で使うサービスです。
            Pixel 10は開発用の検証端末で、自社製ハードウェア製品ではありません。
          </p>
        </div>
        <div className={styles.platformAction}>
          <a className={styles.installButton} href={installUrl}>
            <span>OS Developer Preview</span>
            <span aria-hidden="true">↗</span>
          </a>
          <p className={styles.installNote}>Apple Silicon Mac向け仮想OS · 公開前の導入案内</p>
        </div>
      </section>

      <section className={styles.developer} aria-labelledby="developer-title">
        <div className={styles.developerIntro}>
          <p className={styles.kicker}>03 / SKY DEVELOPERS</p>
          <h2 id="developer-title">Your code.<br />Now a Sky tool.</h2>
          <p>
            コードを貼るだけ。Sky用の定義とPackageを生成し、開発者Studioから登録できます。
          </p>
          <a
            className={styles.studioLink}
            href={studioUrl}
            target="_blank"
            rel="noreferrer"
          >
            Sky Studioを開く <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={styles.codeWindow} aria-label="Sky Tool SDKの最小コード例">
          <div className={styles.codeTopbar}>
            <span>sky-tool.mjs</span>
            <span>SDK / NODE.JS</span>
          </div>
          <pre><code>{developerCode}</code></pre>
        </div>
      </section>

      <footer className={styles.landingFooter}>
        <span>© 2026 KAIYA</span>
        <span>avocadoMini / RockstarOS / Developer Preview</span>
      </footer>
    </main>
  );
}
