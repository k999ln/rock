import type { Metadata } from 'next';
import Link from 'next/link';
import { AvocadoTurntable } from '../../components/avocado-turntable';
import styles from './preview.module.css';

const studioUrl = '/sky/publish';

const experienceAreas = [
  {
    number: '01',
    name: 'Sky',
    title: '使う道具を見つける',
    description: 'Toolの役割、権限、実行先を見比べて選ぶ。ブラウザで使える機能とPC接続が必要な機能を案内します。',
    href: '/sky',
    action: 'Skyを見る',
  },
  {
    number: '02',
    name: 'Zema / Work',
    title: '仕事を前に進める',
    description: '依頼、進捗、確認、結果を一つの流れにまとめる。人が承認する場面を残した仕事の入口です。',
    href: '/chat',
    action: 'Zemaを見る',
  },
  {
    number: '03',
    name: 'Material Invention',
    title: '発明の候補を比べる',
    description: '物質と工程の候補を画面上で組み合わせるsandbox。avocadoMiniの四方向センサーはまだ構想段階です。',
    href: '/studio',
    action: 'Studioを見る',
  },
  {
    number: '04',
    name: 'Wallet / Records',
    title: '結果と費用を確かめる',
    description: '仕事に結び付く記録と試算を確認する。実資金の送金や払出しは、現在のWeb版では提供していません。',
    href: '/wallet',
    action: 'Walletを見る',
  },
  {
    number: '05',
    name: 'Market / Business',
    title: '事業の可能性を試す',
    description: '商品や市場の案を整理する。外部市場の実注文やGameの実資金交換はまだ利用できません。',
    href: '/market',
    action: 'Marketを見る',
  },
  {
    number: '06',
    name: 'CSV / Operations',
    title: '日々の作業を整える',
    description: 'CSVの整形など、手元のデータを扱う作業画面へ。必要な確認を経て成果を残します。',
    href: '/csv',
    action: 'CSVツールを見る',
  },
  {
    number: '07',
    name: 'Developers',
    title: '自分のToolをつなぐ',
    description: 'Sky向けToolの定義とPackageを作り、公開前の権限や接続条件を確かめます。',
    href: '/sky/publish',
    action: '開発者入口を見る',
  },
  {
    number: '08',
    name: 'RockstarOS',
    title: 'OSの現在地を知る',
    description: 'Developer Previewの対象環境と導入手順、配布の状態を確認する。スマートフォン向け完成OSの配布前です。',
    href: '/rockstaros/guide',
    action: 'OS導入案内を見る',
  },
] as const;

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

      <AvocadoTurntable />

      <nav className={styles.access} aria-label="製品、アプリ、OSへの入口">
        <h2>製品から、その先へ。</h2>
        <p>avocadoMiniの体験を起点に、WebアプリとRockstarOSの現在地を見られます。</p>
        <div className={styles.accessCards}>
          <a href="#avocado-mini-title"><strong>avocadoMiniを見る</strong><span>製品構想と希望参考価格を確認する。</span></a>
          <Link href="/"><strong>アプリを開く</strong><span>Sky、Zema、StudioなどのWeb版へ。</span></Link>
          <Link href="/rockstaros/guide"><strong>OS Developer Preview</strong><span>対象環境、導入手順、配布の状態を確認する。</span></Link>
        </div>
        <p className={styles.installNote}>現在は設計段階 · 実機試作・販売はまだ行っていません</p>
      </nav>

      <section className={styles.experience} id="experience-areas" aria-labelledby="experience-title">
        <div className={styles.experienceIntro}>
          <p className={styles.kicker}>WHAT YOU CAN EXPLORE</p>
          <h2 id="experience-title">あなたのやりたいことから、入る。</h2>
          <p>avocadoMiniを中心に、アプリとOSの中の機能を育てています。各領域の入口と、今できる範囲をここから確認できます。</p>
        </div>
        <div className={styles.experienceGrid}>
          {experienceAreas.map((area) => (
            <Link className={styles.experienceCard} href={area.href} key={area.number}>
              <span className={styles.experienceNumber}>{area.number} / {area.name}</span>
              <h3>{area.title}</h3>
              <p>{area.description}</p>
              <span className={styles.experienceAction}>{area.action} <span aria-hidden="true">↗</span></span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.developer} aria-labelledby="developer-title">
        <div className={styles.developerIntro}>
          <p className={styles.kicker}>03 / SKY DEVELOPERS</p>
          <h2 id="developer-title">Your code.<br />Now a Sky tool.</h2>
          <p>
            コードを貼るだけ。Sky用の定義とPackageを生成し、開発者Studioから登録できます。
          </p>
          <Link
            className={styles.studioLink}
            href={studioUrl}
          >
            Sky開発者画面を開く <span aria-hidden="true">↗</span>
          </Link>
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
