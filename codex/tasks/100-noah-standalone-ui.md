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

実装を [PR #337](https://github.com/k999ln/rock/pull/337) に記録。2026-11-21の最終全体verify成功。ルート4,506成功・4 skip（計4,510）、仕事API1,918 assertions、CSV385 assertions、ビルド・設計・残りの検査も成功。ローカルHTTP8ルート/8共通ヘッダーを実測し、data/web-security-response-current.jsonを更新。

再開: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。登録API/UIは `node --experimental-strip-types --test tests/noah-registration*.test.mjs`。実際の登録先アダプターと秘密設定は未接続。本人Mac・成果の認証と本番環境は変更しない。

CI残件: SPIDER / secretsは既存main履歴の3件（docs/design-validation/noah/noah-connect.test.mjs:85、51df5ce・80b3810・5b7cde3）を検出。run44755532375/job136354220728で確認。例外化・履歴書換えは未実施。

2026-11-21の追補: 5項目を現在地付きの1ボタンに統合。用途説明・アイコン・現在地の印を付け、開閉・Escape・外側クリック・選択後の遷移と390px表示を確認。通常は全件表示、Agentボタンと「すべてに戻る」で切替。ニュース・コミュニティー・機能一覧の入口を廃止し、旧機能一覧URLはタイムラインへ転送。会社の正式花形ロゴと白・チャコール・紫の配色を適用。型・lint・関連22試験・ビルド成功、390px/1360pxで横はみ出しなし。
