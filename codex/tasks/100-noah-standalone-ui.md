# task100 — Noah専用フロント・紫のデザイン

本人指示: 「noah単体のサービス作る」。共通基盤を再利用し「Noah専用の画面・導線にする」を選択。「デザインは紫を基調」。

正本: docs/structure/04-eve-noa-amc-sky.md、docs/services/noah-standalone-launch.md の専用フロント節。

## 範囲

既存の統合タイムラインをメインに維持し、Noah専用の探索画面・ナビゲーション・紫の配色を追加。既存の認証、Agent接続/実行/停止、成果の保存/提供を再利用。上部は既定で全件表示、Agentボタンで絞り込み、絞り込み中だけ戻るボタン。Agentと通常投稿を同じタイムラインに保持。フォロー投稿を優先し、ニュース・コミュニティーは表示と主要導線から外す。主要画面へ実リンクをつなぐ。

追加指示: Xのような3カラム、白地と紫のアクセント、Agent絞り込み/解除ボタン、投稿導線、モバイル下部メニュー。2026-11-21の追加指示でマークは会社の正式花形ロゴに揃え、白・チャコール・紫のブランド配色に整える。

## 合格条件

- 実行対応Agentは公開APIの実データ。ローディング・失敗・0件・検索結果を区別。
- 選択したAgent IDが既存の接続画面へ渡る。未実装のリモート実行や架空の利用実績を表示しない。
- Noah専用ヘッダーとメニュー。カード型ホームへの変更・タイムラインの移動はしない。共通accountのreturnToはNoah。
- 390pxとデスクトップで表示・主導線を確認。旧タイムラインリンクを保持。
- 適切なUI回帰、typecheck、lint、全体verifyを実行し、PRへ結果を記録。

## 追加指示: 登録情報を使う登録Agent

正本は docs/services/noah-registration-agent.md。必要項目フォーム、明示同意、登録Agentへの実行、本人確認待ち、状態照会、元Agentへの復帰を実装する。ブラウザ専用権限でNoah会員登録なし。秘密の原文は保存しない。

## やらないこと

認証の弱体化、データの分離・移動、課金変更、新リポジトリ、L4以降の完成扱い、本番migration・配備・切り替え。

## 進捗

実装を [PR #337](https://github.com/k999ln/rock/pull/337) に記録。2026-11-21の最終全体verify成功。ルート4,531成功・4 skip（計4,535）、仕事API1,918 assertions、CSV385 assertions、ビルド・設計・残りの検査も成功。ローカルHTTP8ルート/8共通ヘッダーを実測し、data/web-security-response-current.jsonを更新。

再開: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。登録API/UIは `node --experimental-strip-types --test tests/noah-registration*.test.mjs`。実際の登録先アダプターと秘密設定は未接続。本人Mac・成果の認証と本番環境は変更しない。

CI残件: SPIDER / secretsは既存main履歴の3件（docs/design-validation/noah/noah-connect.test.mjs:85、51df5ce・80b3810・5b7cde3）を検出。run44755532375/job136354220728で確認。例外化・履歴書換えは未実施。

2026-11-21の追補: 5項目を現在地付きの1ボタンに統合。用途説明・アイコン・現在地の印を付け、開閉・Escape・外側クリック・選択後の遷移と390px表示を確認。通常は全件表示、Agentボタンと「すべてに戻る」で切替。ニュース・コミュニティー・機能一覧の入口を廃止し、旧機能一覧URLはタイムラインへ転送。会社の正式花形ロゴと白・チャコール・紫の配色を適用。型・lint・関連22試験・ビルド成功、390px/1360pxで横はみ出しなし。

2026-11-21の追補: 個人の感想を主役にしたフィード、Noahで実行完了したユニークaccount数、王冠1account1票、公開コメント/返信/本人削除を追加。Agentコメントを通常タイムラインへ接続。開発者向け継続改善パッケージと個別見積もり受付、本人/設定済み運営に限った受付一覧を実装。正本は docs/services/noah-agent-feedback.md と docs/services/noah-developer-maintenance.md。0046は作成・ローカル検証のみ。料金・SLA・課金・作業自動実行は未設定。

追加分の最終検証: 関連40試験、D1互換移行14試験・所有者復旧6試験、型/lint、全体verifyが成功。390px/1360pxで横はみ出しなし、王冠の保存・遷移後保持・取消、コメント/開発者ページ、対象Agent検索を確認。再開時は `node --experimental-strip-types --test tests/noah-feedback.test.mjs tests/noah-maintenance-ui.test.mjs`。本番の0046適用と運営ID設定、料金/SLA/実作業接続は未実施。

2026-11-21の受付変更: 本人指定の smash@avoado.si にメールで相談する方式へ変更。Web申込フォーム・受付履歴・運営一覧と保存処理を撤去し、旧APIは410で閉じる。コミット済み0046と既存記録は保持し、削除・本番変更なし。

2026-11-21の一周検証・操作簡略化: 接続一覧の取得失敗を未登録/仕事なしと表示していた不具合を修正。ローカルpreviewの不足テーブル0033/0034/0038をローカルだけ補完し、API200を確認。接続順序をAgent選択→Mac接続→依頼へ変更し、接続案内/サインインからAgentを維持。「実行中」タブと /noah/activity は既存NoahLaunch/APIを共用し、実際の状態・成果本文/ファイル・停止を集約。通常利用では作成/公開管理を折りたたむ。

検証を `scripts/check-noah-launch-isolation.mjs --root /absolute/existing/noah/root` に集約。既存ローカルDockerで非root・権限昇格不可・画面/入力/ホストパス/ソケット不在・読み取り専用・外向き通信遮断、接続→実行→Work成果受領→動作中のコンテナ停止→切断を確認。API/account/審査はメモリ内試験データで、本番や外部providerの実利用ではない。previewにはオンラインMacが0台のため、ブラウザでの外部Agent実行は未確認。回帰UIは `node --experimental-strip-types --test tests/noah-launch-ui.test.mjs`。

2026-11-21の画面統合: 本人の「ここいるの？」を受け、独立した /noah/launch をAgent指定保持の転送に変更。/noah/activity に接続・依頼入力も集約し、「仕事を頼む」で開閉する。メニューはタイムライン・Agentを探す・実行中・成果データの4つ。探す/Agent詳細から統合画面へ直接進む。

2026-11-21の説明削減: 実行中/依頼の長い説明を削除し、Agentの詳細をできること・実行先・版に分割。Mac接続を3ステップ、コピー可能なコマンド、項目別の展開パネルへ整理。実行同意・導入条件は保持。

最終検証（2026-11-21）: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` が全工程成功。ルート4,531成功・4 skip（計4,535）、ビルド・仕事API・CSV・設計・残りの検査を含む。途中で既存Eveブラウザ試験に待機タイムアウト1件を観測したが、単独2試験と最終全体試験の両方で成功。関連29試験、390px/1360px、実コンテナ一周、ローカル8ルート/8共通ヘッダーを確認。本番変更なし。

2026-11-21のボタン接続: Mac手順のコマンド表示を撤去。SwiftUI Noah.appとGUI用準備処理を追加し、固定Node取得・不足ツールの導入・既存の本人承認・接続・停止をボタンへ集約。URLを開くだけでは起動しない。公式origin専用、開発プレビューのad-hoc署名。Developer ID公証、初期状態の別Mac、本番APIを含む通し受入は未完了。PR #337。

検証（GUI接続追補）: 全体 `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` は終了0（4,542成功・4 skip、Work API 1,918、CSV 385）。最終差分は `node --experimental-strip-types --test tests/noah-mac-links.test.mjs tests/noah-mac-onboarding.test.mjs tests/noah-launch-ui.test.mjs tests/noah-mac-runner.test.mjs` の24件成功、lint成功。Swiftのビルド/ネイティブURL境界、同梱manifestの別保存先導入、公式固定Nodeのhash/起動、配布ZIPとHTTP取得のhash一致、ad-hoc署名を確認。Webの390px/1360pxとAgent保持の往復を確認。Macがロック中のためネイティブGUIのクリック試験は未実施。公証と本番/別Macの通し受入は残件。

2026-11-21の実機確認・先行配布調査: Macロック解除後、Noah.appの起動/準備/承認画面/キャンセル/再接続を確認。ユーザー録画の両タブは未ログイン状態で、暗い背景のサインインリンクを見落とし再確認を繰り返す状態。公開GETはdevice-sessions401、launch200/13件。専用CSSと同一タブのサインイン復帰へ修正。認証済みの実接続は未確認。Holland Villageのメンバー100人への先行体験の公開調査と設計候補を正本へ追記。コード実行や公式提携の受入ではない。

2026-11-21の登録UX追補: 必須項目入力と送信確認を別ステップにし、任意項目を折りたたみ。確認から編集へ戻る入力は画面内で保持し、同意を解除して再確認。単一候補の選択欄と重複する入力表示を省略。完了から対象Agent付きの /noah/activity へ直接復帰する。端末サインインの390px実画面と同一タブ/コード保持のログイン遷移を確認。登録・端末UI関連29件成功。100人向けの全経路での依頼下書き保存と、スマホ実行、実登録先の接続は未完了。

2026-11-21の追加調査: HVMCの公式活動に加えNN/gの利用者調査とGOV.UKの調査手順を参照し、比較・連絡・段取りの手間→訴求→成果→操作→受入を正本に記録。一般化はサロン外の初見利用者でも別に確かめる。配布文は原稿のみ。Web実行・実provider・依頼の全経路保持は残件。

検証（登録UX・調査追補）: 全体 `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 終了0。4,546成功・4 skip（計4,550）、Work API1,918、CSV385。最後の投稿ボタン重なり修正後、typecheck/lint、登録API/UI・端末UI・timelineの34件、build、bundle/asset closureを再確認して成功。390px/1360pxの架空provider画面で入力→確認→編集と横はみ出しなし、未同意時の送信無効、投稿ボタン非表示を確認。実登録のPOSTは行っていない。ローカル証跡: work/noah-standalone/registration-ux-mobile.jpg、device-signin-mobile.jpg、registration-ux-verify.log。本番変更なし。PR #337。
