import type { Metadata } from 'next';
import Link from 'next/link';
import { PreviewDownload } from '../../../components/preview-download';
import previewData from '../../../data/rockstaros-preview.json';
import {
  PRODUCT_NAME,
  PRODUCT_PREVIEW_NAME,
  PRODUCT_RELEASE_NAME,
  PRODUCT_VERSION,
} from '../../../lib/product-identity';
import styles from '../preview.module.css';

export const metadata: Metadata = {
  title: `導入・最初の成果・復旧 | ${PRODUCT_RELEASE_NAME}`,
  description: 'Macの仮想端末でRockstarOSを導入し、Skyのサンプル実行、正常終了、再開、バックアップと復元を行う手順。',
};

const sourceRoot = `https://github.com/k999ln/rock/blob/${previewData.guideSourceCommit}/docs`;
const sourceGuide = `${sourceRoot}/preview-installation-ja.md`;
const legalNotice = `${sourceRoot}/preview-legal-notice.md`;
const releaseNotes = `${sourceRoot}/preview-release-notes.md`;

export default function PreviewGuide() {
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/rockstaros" className={styles.brand} aria-label="製品ホームへ戻る">{PRODUCT_NAME}<span>{PRODUCT_VERSION}</span></Link><Link href="/rockstaros">avocadoMini製品ホームへ</Link></header>
    <article className={styles.guide}>
      <p className={styles.eyebrow}>DEVELOPER PREVIEW · はじめに</p>
      <h1>導入から、最初の成果。<br />そして、また続けるまで。</h1>
      <PreviewDownload />
      <nav className={styles.contents} aria-label="ガイドの目次"><a href="#prepare">01 準備</a><a href="#install">02 導入</a><a href="#first-result">03 最初の成果</a><a href="#wallet">04 WalletとGame</a><a href="#resume">05 再開</a><a href="#recovery">06 復旧</a><a href="#help">07 診断・削除</a></nav>
      <section id="prepare"><h2>01 / Macを準備する</h2><p>受入対象はmacOS 15.7.4、Apple Silicon arm64、Lima 2.2.0。Python 3.11以降とOpenSSL 3、空き容量10 GiB以上が必要です。初回にLinux VMと依存ファイルを取得するため、インターネット接続を使います。</p><p>この導入専用にDebian 13のVMを作り、その中でARM64 Linuxの仮想端末を起動します。既存のVMやMacの保存データを流用しません。画面の表示には、この配布用のローカルポート8900と5910を使います。</p></section>
      <section id="install"><h2>02 / 配布物を確かめ、新規導入する</h2><p>以下は正式署名後に使う導入手順です。確認中のrc2候補には、署名済みmanifestと配布用の検証鍵がまだ揃っていないため、この手順では導入できません。</p><p>配布先からMac arm64用archive、release-manifest.json、SHA256SUMS、検証鍵、preview.py、導入ガイド、リリースノート、法的条件、packaging-result.jsonの9ファイルを揃えます。受入記録の版・SHA-256と自分のファイルを照合し、署名を検証してから起動します。</p><p>検証プログラムとハッシュは、正本の受入済みソースから独立して確認します。公開試験鍵を使う候補では、その鍵だけで本番配布元の真正性を証明できません。</p><p><a className={styles.textLink} href={sourceGuide}>検証・installのコマンドを確認する ↗</a></p><p>専用の短い新規保存先を指定し、install、startの順に実行します。初回起動はQEMUの画面が準備できるまで待ちます。画面は実OSの表示です。</p></section>
      <section id="first-result"><h2>03 / Skyで引用整理を実行する</h2><ol><li>Skyで「引用整理」を開き、用途、作者、版、権利、実行先、費用、必要な許可を確認します。</li><li>「v1.0.0 をインストール」から導入し、表示された権限を確認して利用を許可します。</li><li>「ツールを開く」→「サンプルを入力」。公開例には本文中の出典と、変更しないコード内の例が入っています。</li><li>入力を確認し「実行する」。本文の出典を末尾へ整理した結果を読みます。リンク先へのアクセスや出典の真偽確認は行いません。</li><li>「実行履歴」に戻り、同じ仕事を開きます。保存結果、実行版、処理場所、費用の接続状態を確認します。</li></ol><p>仕事が完了しても、実売上やWallet残高が自動で増えることはありません。自動納品や記事生成を行った結果でもありません。この開発版のキーボード入力はUS配列の英数字・記号が対象で、日本語IMEや本文の貼付けは未接続です。日本語の公開例は「サンプルを入力」から試せます。</p></section>
      <section id="wallet"><h2>04 / Walletの状態とGameを確認する</h2><p>Walletでは合成残高、保留、請求、入金の状態を区別します。実費・実収益に接続していないものは、未接続と表示します。旧888 USD cents月額は合成残高を使う試験契約の履歴で、現在の料金設定ではありません。収益料金は動線が確定するまで保留中で、実課金には接続していません。</p><p>9abf78a版の配布候補で、合成Game A/Bの接続・交換・保存履歴を内部検証しました。公開試験の登録、試験認証、Wallet利用条件を確認した後、明示操作で試験残高を一度追加する構成です。Gameへの接続と、今回の交換条件への承認は別々です。購入額、ゲーム手数料、外部実費、保留合計、受取り単位を確認します。</p><p>照合中に新しい交換を作り直さず、元の履歴から同じ要求を確認します。Gameが使えない間もSkyの保存結果と正常終了へ戻れるようにしています。</p><p>試験設定のGame接続は1時間有効です。期限切れ・失効後の新しい接続はこの版では未対応です。画面とSDKに理由を表示し、元の要求の照合と完了済み購入の履歴は保持します。</p></section>
      <section id="resume"><h2>05 / 正常終了して、同じ結果へ戻る</h2><p>画面を閉じるだけではOSは終了しません。OS右上の「端末」→「電源を切る」→「確認して実行」を選びます。続いてstopコマンドで独立したGame台帳も停止し、停止状態を確認してから同じ導入先でstartを実行します。</p><pre><code>{'python3 preview.py stop --directory "$ROCK_PREVIEW_ROOT"\npython3 preview.py status --directory "$ROCK_PREVIEW_ROOT"\npython3 preview.py start --directory "$ROCK_PREVIEW_ROOT"'}</code></pre><p>再開したら履歴から先ほどの成果を開き、Walletも確認します。別の端末として黙って作り直さず、同じ保存先と版を使います。</p></section>
      <section id="recovery"><h2>06 / 停止済みの状態を保存・復元する</h2><p>OSを正常終了してからbackupを実行し、新しい保存先へ出力します。稼働中のディスクやハッシュが違うファイルは受け付けません。</p><pre><code>{'python3 preview.py backup --directory "$ROCK_PREVIEW_ROOT" \\\n  --output "$HOME/Library/RockstarOS/backup-1"\npython3 preview.py restore --directory "$ROCK_PREVIEW_ROOT" --name recovered-1'}</code></pre><p>Game構成では、停止したOSの3つのディスクと独立したWallet・Game・接続台帳を一組で保存します。復元は同じ所有VMの新しい端末名へ行い、元の端末は再起動を拒否されます。保存後に状態が進んでいれば、古い状態へ巻き戻せません。</p><p>復元が中断したときは、diagnoseでRESTORE_PENDINGと復元名を確かめ、同じbackup・復元名でrestoreを再実行します。両方の完了を確認するまで起動できません。9abf78a版の配布候補の内部試験で、OSのコピー中の実中断、同じ要求での再開、元端末の起動拒否、復元先の保存成果と台帳を確認しました。</p><p>hostへ書き出したbackupは全構成要素の保全用コピーです。別VMへの再投入は未対応で、VM削除後に新規環境へ復元する入口はありません。backupは暗号化されていません。配布版に同梱された完全版ガイドを確認してください。</p></section>
      <section id="help"><h2>07 / つまずいたときと削除</h2><pre><code>{'python3 preview.py diagnose --directory "$ROCK_PREVIEW_ROOT"'}</code></pre><p>署名・ハッシュ不一致なら入手経路を照合します。ポートが使用中なら既存の表示を確認し、他のアプリを勝手に停止しません。保存状態が不完全なら初期化せず、正常終了とbackupの記録を確認します。</p><p>削除前には必要なbackupを別のhost保存先へ出し、すべての端末を正常終了します。remove --delete-dataは、この導入が所有するVM内のOS・保存データ・内部backupを削除します。削除範囲と残るhostファイルは完全版ガイドで確認してください。</p><div className={styles.guideLinks}><a href={sourceGuide}>完全版の導入・復旧ガイド ↗</a><a href={releaseNotes}>リリースノート・既知制限 ↗</a><a href={legalNotice}>利用・配布条件の確認事項 ↗</a></div></section>
    </article>
    <footer className={styles.footer}><span>{PRODUCT_PREVIEW_NAME}</span><Link href="/rockstaros">avocadoMini製品ホームへ戻る ↗</Link></footer>
  </main>;
}
