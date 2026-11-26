# task136 — Agentの利用中に自然に進む情報登録

本人指示（2026-11-24）: 情報登録で他のAgentを使いやすくなること、データの保存・送信、料金をフロントで分かるようにし、気付いたら準備が済んでいるような自然な登録UXにする。

正本: docs/structure/04-eve-noa-amc-sky.md、docs/services/noah-registration-agent.md。

## 範囲

- 登録シートと登録ページ: 保存済み情報の確認・編集、必須の不足だけ入力、任意項目の展開、保存する／今回だけの選択、送信先・料金の説明、元Agentへの復帰。
- 登録情報ページ: 再利用の価値、保存と送信の違い、料金、途中で必要な情報を追加できる案内。
- フォーム型のAgent実行: 入力の一部と成果の保存、Noah中継料と提供元の未確認料金の説明。
- 6言語、既存の同意・所有者分離・不明な登録の再送抑止を維持。

## 合格条件

- 未同意の登録0件、保存しない場合のプロフィール書込0件、保存済み情報だけの登録で不要な書込0件。
- 保存情報の編集で値が保持される。任意項目が空でも必須が揃えば登録できる。
- 保存・送信先・料金は主操作より前に見える。未確認の外部料金を無料と表示しない。
- 390px/1280pxで登録・プロフィール・詳細内シートを確認し、横はみ出し0、元Agentへ復帰。
- 型・lint・関連回帰・全体verifyを実施。合成データの検証と本番受入を区別する。

## 対象外

新しい課金、外部登録の本番実行、本人確認の省略、本番migration・公開切替。

## 検証

- `node --experimental-strip-types --test tests/noah-registration-ui.test.mjs tests/noah-registration.test.mjs tests/noah-profile.test.mjs tests/noah-profile-signed-in-only.test.mjs tests/noah-ask-ui.test.mjs`
- `NOAH_PLAYWRIGHT_PACKAGE=<playwright-coreの絶対パス> NOAH_TEST_URL=http://localhost:5197 NOAH_TEST_OUTPUT=<一時保存先> node scripts/test-noah-registration-ux-browser.mjs`
- `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`

- 関連回帰: 56件成功。タップ領域・画面翻訳の回帰: 10件成功。
- Chromeの実画面（APIは合成データ）: 390px / 1280px とも、保存情報の編集、任意メールの検証、今回だけの送信、保存後の再利用、Agent詳細シートからの復帰を確認。各幅で登録送信4回、プロフィール保存1回、JavaScriptエラー0件。送信前の同意と保存対象を照合。
- 全体verifyの全段階を確認: 型・lint、主要テスト5441件成功 / 5件skip / 0失敗、課金と運営Workerのdry-run、各パッケージ試験、本番ビルド、asset照合、ローカルAPI 1918 assertions、CSV保存385 assertions、mission/work/bot整合性が成功。
- 実行環境: OpenSSL 3をPATHへ指定。独立作業ツリーのためrootに加えて `sites/avocado-mini` と `toolkits/noah-coconala` にlockfileどおり `npm ci --ignore-scripts`。最初のverifyは不足依存で停止し、補完後に `test:noah-coconala` からverify末尾まで同じ順で再実行して終了コード0。テストの削除・緩和はなし。
- 外部への実登録・決済・公開切替は未実施。実画面確認は合成APIであり、本番受入の証拠にはしない。
- 実装と検証: [PR #63](https://github.com/iceiceice999/rock/pull/63)（draft、未公開）。

### 最新mainとの整合

2026-11-24: main `b17aa5b684` を取り込み、CHANGELOG・タスク一覧・決定事項の両側の追記を保全して競合を解消。登録関連コードの競合なし。取り込み後のtypecheck・lint:product・登録/プロフィール/Agent詳細/翻訳等の関連テスト84件は成功。上記の全体verifyは取り込み前の実施記録であり、取り込み後は関連範囲を再検証した。公開範囲の回答待ちで、mainへのマージ・公開は未実施。

### 2026-11-26 保存後の再入力抑止とApple/Google側の保存情報

本人指示: 一度入れた情報を保存し、同じ項目を再び求めない。Apple/Googleで管理している情報も使えるようにする。

実装範囲はSafari/Chromeの標準自動入力と、プロフィール読込待ち/失敗時の入力抑止。OAuthによるアカウント連携とは区別する。自動入力だけでは保存/外部送信せず、既存の明示操作と本人別の暗号化領域を使う。独立したチェックアウトで別チャットの公開ページ変更を混ぜずに検証する。

- 回帰: `node --experimental-strip-types --test tests/noah-registration-ui.test.mjs tests/noah-profile.test.mjs tests/noah-profile-signed-in-only.test.mjs tests/noah-unified-ui.test.mjs`
- 実ブラウザ: `NOAH_TEST_URL=http://127.0.0.1:5198 NOAH_TEST_OUTPUT=<保存先> node scripts/test-noah-profile-autofill-browser.mjs`
- Chrome DevTools Protocolのnative Autofillを合成の名前・メール・電話・住所で動かす。Safari実機の自動入力は別途の確認であり、この試験で合格としない。
- 全体: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`

本人の回答で、今回の対象は「iPhoneやChromeに保存した名前・住所・電話などの自動入力」と確認した。

- 関連回帰43件成功。
- Chrome native Autofill: 390px/1280pxの各幅で自動入力2回、プロフィール保存2回、登録送信2回、JSエラー0。自動入力された4項目の保存と、別名の登録項目への再利用（入力0件・不要書込0件）を確認。
- 既存登録ブラウザ試験: 両幅で各送信4 / 保存1 / errors 0。
- 全体verify: 終了コード0。主要テスト5562成功、5 skip、0失敗。型・lint・課金dry-run・各パッケージ・本番ビルド・API・asset/記録整合性を含む。
- Safari実機の自動入力、本番公開、外部への実登録・決済は未実施。
- [PR #82](https://github.com/iceiceice999/rock/pull/82) に提出。未マージ・未公開。
