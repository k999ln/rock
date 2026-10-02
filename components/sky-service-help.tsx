'use client';

import Link from 'next/link';
import WorkspaceShell from './workspace-shell';
import { useSkyServiceStatus } from '@/lib/use-sky-service-status';
import styles from './sky-service-help.module.css';

export default function SkyServiceHelp() {
  const service = useSkyServiceStatus();
  return <WorkspaceShell title="Skyの利用方法" tone="sky" hideTopActions contentClassName={styles.shell}>
    <article className={styles.page}>
      <Link href="/sky/marketplace">マーケットへ戻る</Link>
      <header><p>SKY SERVICE</p><h1>使い方とデータの扱い</h1><p>SkyはOSを導入せずブラウザから利用できます。PC専用ツールには、本人のPCと接続アプリが必要です。</p></header>
      <section aria-labelledby="sky-help-start"><h2 id="sky-help-start">まず一つのツールを使う</h2>
        <ol><li>マーケットでツールを選び、機能・利用条件・実行場所・費用を確認します。</li><li>利用画面でサインインします。ChatGPTのサインインと、外部AIのAPI利用料は別です。</li><li>サンプルまたは自分の入力で実行し、結果を確認します。</li><li>必要な成果をファイルで保存します。文章ツールは「この端末に保存」も選べます。</li></ol>
        <p><Link href="/sky/tools/mr-citations">出典整理を開く</Link> · <Link href="/sky/tools/mr-free-article">記事の無料版メーカーを開く</Link></p>
      </section>
      <section aria-labelledby="sky-help-service"><h2 id="sky-help-service">サービスの接続状態</h2>
        <div aria-live="polite">{service ? <dl>
          <div><dt>実行記録</dt><dd>{service.database === 'available' ? 'データ保存サービスに接続可能' : '接続を確認しています。実行を待ってください。'}</dd></div>
          <div><dt>CSVファイル</dt><dd>{service.database === 'available' && service.csvStorageConfigured ? '保存設定あり。ファイル操作の成功は実行時に確認します。' : '保存サービスの接続待ち'}</dd></div>
          <div><dt>法務・特許の外部AI</dt><dd>単価見積・支出上限・利用明細の接続待ちです。接続まで標準ガイドと整理機能を利用できます。</dd></div>
          <div><dt>Jev評価</dt><dd>Provider設定の有無にかかわらず、料金確認機能が受け入れられるまで外部評価を停止しています。</dd></div>
          <div><dt>購入・販売</dt><dd>{service.payments === 'live' ? '実決済の設定あり。商品ごとの条件を確認してください。' : service.payments === 'test' ? 'テスト決済のみ。実際の購入はできません。' : '決済サービスの接続待ち'}</dd></div>
          <div><dt>CSVの50円試験</dt><dd>{service.csvPayments === 'live' ? '本番決済の設定あり。実際に50円が請求されます。' : service.csvPayments === 'test' ? 'テスト決済の設定あり。実際の請求はありません。' : 'CSV専用決済の接続待ち'}</dd></div>
        </dl> : <p>接続状態を確認しています。確認できない場合は時間をおいて開き直してください。</p>}</div>
        <p>接続設定は、本番動作・外部投稿・銀行着金の完了を示すものではありません。</p>
      </section>
      <section id="data" aria-labelledby="sky-help-data"><h2 id="sky-help-data">保存する場所と消し方</h2>
        <ul><li>記事の無料版・出典整理の原文はブラウザ内で処理します。実行履歴にはツール・時刻・処理量などを記録し、原文や成果本文は含めません。</li><li>ココナラの案件管理では、入力した案件名・発注条件・報酬・担当者・制作と支払いの記録を、本人のアカウントにサーバー保存します。外部サイトへの応募や銀行振込は行いません。</li><li>「この端末に保存」した成果は、このブラウザに最大20件残ります。同じブラウザを使う人も閲覧できます。共有端末ではファイル保存を使い、保存済みの成果は一覧の「削除」から消してください。</li><li>CSVは変換と納品のためサーバーに入力・成果物を保存します。取得期限は7日です。受付画面から削除できます。期限切れは取得を拒否し、次の照合でファイルを削除します。期限と物理削除の時刻は同じではありません。</li><li>外部AI・外部MCPを選ぶ場合は、送信する内容と提供者のデータ利用条件を確認します。APIキーやパスワードは原稿・掲載申請・問い合わせに入れないでください。</li></ul>
        <p>現在、文章の保存成果は端末間で自動同期されません。別の端末へ持ち出す場合はMarkdownファイルを保存してください。</p>
      </section>
      <section id="limits" aria-labelledby="sky-help-limits"><h2 id="sky-help-limits">対応環境と既知の制限</h2>
        <ul><li>オンラインで利用します。オフライン実行や接続切れ中の停止完了は保証しません。</li><li>導入候補は、本体を実行できるツール数に含みません。LLMの一覧も接続先の候補です。</li><li>Instagram等の外部投稿・広告・請求には実サービスの接続と個別確認が必要です。ブラウザ簡易版の保存を外部操作の完了にしません。</li><li>実行結果の保存に失敗した場合は、結果を手元へ保存してから履歴を確認してください。結果不明の外部操作は重ねて実行しないでください。</li><li>CSVは1ファイル10MBまで。文章保存は20件まで。外部AIには利用上限があります。</li></ul>
      </section>
      <section aria-labelledby="sky-help-providers"><h2 id="sky-help-providers">ツールを提供する</h2><p>掲載には作者・版・配布元・ライセンス・権限・料金・扱うデータを申告します。申請しただけで一般公開されることはありません。</p><p><Link href="/sky/register">掲載申請</Link> · <Link href="/studio">SDK・Studio</Link> · <Link href="/sky/sell">販売設定</Link></p><p>基本登録・接続は0円。Tool売上のSky手数料は10%。外部決済・API・モデル・cloudの費用は別です。決済の接続待ちでは購入・販売できません。</p></section>
      <section aria-labelledby="sky-help-trouble"><h2 id="sky-help-trouble">問題が起きたとき</h2><p>サインイン状態、ツールの利用条件、サービス接続状態を確認してください。PC専用ツールは接続アプリの状態も確認します。</p><p>開発中の不具合は<a href="https://github.com/k999ln/rock/issues" target="_blank" rel="noopener noreferrer">GitHubのIssue</a>で報告できます。公開されるため、原稿・CSV・個人情報・認証情報を添付せず、画面名・操作・時刻・エラー表示だけを記載してください。</p><p>このページは現在の実装を説明する利用案内です。商品の契約・返金条件は購入前に各商品で確認してください。</p></section>
    </article>
  </WorkspaceShell>;
}
