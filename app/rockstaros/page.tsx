import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import previewData from '../../data/rockstaros-preview.json';
import styles from './preview.module.css';

type PreviewMedia = {
  demo: null | { src: string; poster: string; captions: string; durationSeconds: number; sourceCommit: string };
  acceptanceRecordUrl: string | null;
};
const preview: PreviewMedia = previewData;

export const metadata: Metadata = {
  title: 'RockstarOS 1.0 Developer Preview',
  description: '自動化の仕事を、実行から結果・費用・復旧まで見失わない。RockstarOSの仮想端末向け開発版と導入案内。',
};

export default function RockstarPreview() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>RockstarOS<span>1.0</span></Link>
        <nav className={styles.nav} aria-label="開発版の案内"><a href="#actual">実際の画面</a><Link href="/rockstaros/guide">導入・復旧</Link></nav>
      </header>
      <section className={styles.hero} aria-labelledby="preview-title">
        <p className={styles.eyebrow}>DEVELOPER PREVIEW · QEMU</p>
        <h1 id="preview-title">動かした仕事の、<br />その先まで。</h1>
        <p className={styles.intro}>何が終わり、どこに結果があり、いくら確定したか。<br className={styles.desktopBreak} />HubとWalletから、仕事の状態と保存した成果をたどれます。</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="#start">試用できる範囲を確認 <span aria-hidden="true">↓</span></a>
          <span className={styles.status}>配布候補を検証中</span>
        </div>
        <div className={styles.flow} aria-label="RockstarOSで行うこと">
          <div><span>01 / HUB</span><strong>選ぶ・動かす</strong><p>商品の用途、実行先、必要な許可を確認。</p></div>
          <div><span>02 / RESULT</span><strong>結果を開く</strong><p>保存された結果を、実行した版と一緒に確認。</p></div>
          <div><span>03 / WALLET</span><strong>費用を確かめる</strong><p>合成残高と、未接続の実費・実収益を区別。</p></div>
          <div><span>04 / RECOVERY</span><strong>また続ける</strong><p>正常終了後も履歴へ戻り、必要なら復元。</p></div>
        </div>
      </section>
      <section id="actual" className={styles.actual} aria-labelledby="actual-title">
        <div className={styles.actualCopy}>
          <p className={styles.eyebrow}>保存した仕事へ、戻れる。</p>
          <h2 id="actual-title">結果を探し直すときも、<br />何が終わったかが分かる。</h2>
          <p>まずは、引用のある文章を整理する仕事から。商品を選び、許可を確認し、サンプルを実行すると、本文と出典を整理した結果が履歴に残ります。</p>
          <p>実行した版、処理場所、費用の接続状態を同じ結果画面で確認。正常終了してまた起動した後も、保存した結果へ戻れます。</p>
          <p className={styles.scope}>中間OSでの内部試験では、再起動後に同じ結果を再表示できました。人の操作時間、継続利用、実収益はこれから検証します。文章専用OSへの限定ではありません。</p>
          <Link className={styles.textLink} href="/rockstaros/guide#first-result">最初の成果までの操作を見る <span aria-hidden="true">↗</span></Link>
        </div>
        <figure className={styles.screen}>
          <Image src="/rockstaros/hub-result.png" alt="実OSの引用整理の結果。実行版と端末内処理、保存した出典、実費・実収益は未接続と表示。" width={720} height={960} />
          <figcaption>開発中の実OS画面 · QEMU / 公開サンプル</figcaption>
        </figure>
      </section>
      {preview.demo && <section className={styles.demoSection} aria-labelledby="demo-title">
        <div><p className={styles.eyebrow}>実OSの操作を、そのまま。</p><h2 id="demo-title">仕事を動かし、<br />保存した結果へ戻る。</h2><p>Hubの引用整理、成果の再表示、合成Wallet、Gameの接続と購入履歴。実際のQEMU画面を、操作した時間のまま収録しています。</p><p className={styles.scope}>導入済みの端末で収録した操作例です。初回導入の所要時間ではありません。合成残高を使い、実際の資金や実ゲームには接続していません。</p>{preview.acceptanceRecordUrl && <a className={styles.textLink} href={preview.acceptanceRecordUrl}>同じ候補の検証記録を読む ↗</a>}</div>
        <figure className={styles.demoScreen}><video controls playsInline preload="metadata" poster={preview.demo.poster} width={720} height={960} aria-label="QEMUで動作するRockstarOS。合成WalletとGameを含む実画面の録画。"><source src={preview.demo.src} type="video/mp4" /><track kind="captions" src={preview.demo.captions} srcLang="ja" label="操作の説明" /><a href={preview.demo.src}>実画面の動画を開く</a></video><figcaption>QEMUの実OS画面 · 合成Wallet / Game · {preview.demo.durationSeconds}秒 · 音声なし</figcaption></figure>
      </section>}
      <section id="start" className={styles.start} aria-labelledby="start-title">
        <p className={styles.eyebrow}>最初に読むこと</p>
        <h2 id="start-title">Mac上の仮想端末で試す開発版です。</h2>
        <p>対応候補はApple SiliconのMac、macOS 15.7.4、Lima 2.2.0。Linuxの仮想端末を使い、公開または合成した入力で検証しています。スマートフォンへのOS書き込みや実資金の取引には対応していません。</p>
        <div className={styles.notice}>
          <strong>ダウンロードは受入検証の完了後に案内します。</strong>
          <p>Hub・Wallet・Game、保存と復旧を一つの配布候補へ統合しています。現在のページは開発状況の案内であり、1.0の配布開始のお知らせではありません。</p>
          <Link className={styles.textLink} href="/rockstaros/guide">導入・初回実行・復旧の手順 <span aria-hidden="true">↗</span></Link>
        </div>
        <p className={styles.scope}>Game連携は合成通貨のsandboxが対象です。実ゲームとの交換条件、ゲーム料金、本番金融は未確定です。OSの既存月額契約と、Rockが徴収するATM手数料0の方針は別々に扱います。</p>
      </section>
      <section className={styles.gameSection} aria-labelledby="game-title">
        <div><p className={styles.eyebrow}>GAME / DEVELOPER SANDBOX</p><h2 id="game-title">仕事の余地を、<br />次の楽しみへ。</h2></div>
        <div><p>Gameは本人が選んで開く入口です。接続の同意と、一回の購入承認を分けて確認し、照合中の保留と確定した交換を履歴で区別します。</p><p>合成Game A/Bと作者向けSDKを同じ候補で検証しています。WalletからGameへの購入方向に限る試験で、実ゲームや実際のお金には接続しません。</p><p className={styles.scope}>試験接続は1時間有効です。期限後の新規接続は未対応で、元の要求の照合と購入履歴は保持します。</p><a className={styles.textLink} href="https://github.com/k999ln/rock/blob/9abf78a80d27aa9f847c4051d20e4c552e407276/systems/rock-star-os/examples/game/README.md">作者向けの動くサンプルと診断手順 ↗</a></div>
      </section>
      <footer className={styles.footer}><span>RockstarOS 1.0 Developer Preview</span><Link href="/">既存のWeb・PCツールへ <span aria-hidden="true">↗</span></Link></footer>
    </main>
  );
}
