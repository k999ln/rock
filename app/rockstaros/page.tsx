import type { Metadata } from 'next';
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
  title: 'RockstarOS — Install the future of work',
  description: 'RockstarOSをインストールし、Skyで自動化ツールを開発する。',
};

export default function RockstarPreview() {
  return (
    <main className={styles.landing}>
      <header className={styles.landingHeader}>
        <Link href="/" className={styles.brand} aria-label="ホームへ戻る">
          Rockstar<span>OS</span>
        </Link>
        <span className={styles.version}>1.0 / DEVELOPER PREVIEW</span>
      </header>

      <section className={styles.installHero} aria-labelledby="preview-title">
        <div className={styles.heroGlow} aria-hidden="true" />
        <p className={styles.kicker}>AI AUTOMATION OPERATING SYSTEM</p>
        <h1 id="preview-title">
          Make time.
          <br />
          Make anything.
        </h1>
        <p className={styles.heroJa}>仕事をSkyに任せて、次をつくる。</p>
        <a className={styles.installButton} href={installUrl}>
          <span>OSをインストール</span>
          <span aria-hidden="true">↗</span>
        </a>
        <p className={styles.installNote}>
          Apple Silicon Mac向け仮想OS · 現在は公開前のDeveloper Preview
        </p>
      </section>

      <section className={styles.developer} aria-labelledby="developer-title">
        <div className={styles.developerIntro}>
          <p className={styles.kicker}>SKY / DEVELOPERS</p>
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
        <span>RockstarOS / DEVELOPER PREVIEW</span>
      </footer>
    </main>
  );
}
