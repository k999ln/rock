# RockstarOS 1.0 ローンチ準備

状態: **BLOCKED_FOR_LAUNCH**（作業開始時。PASSは証拠取得後だけ更新）

## 正本と実行範囲

- 2026-09-10T20:26:01Z GitHub取得: main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、再開branch `codex/rockstaros-release-20260910`、HEAD `29e4f7203f72d9949e2dfc90b64c4215d4bbb765`。同HEADのWeb1/native6チェックSUCCESS。後続commitの合格とはしない。
- native/同梱host toolsの配布候補は `9abf78a80d27aa9f847c4051d20e4c552e407276`。元image・約1GB archive・試験原本は不変。
- macOS 15.7.4 / Apple Silicon / Lima 2.2.0 / Debian 13 / QEMU virt-10.0 のDeveloper Preview限定。実機、実資金、実ATM、実請求、一般公開は対象外。
- UIの変更理由: 旧ファンドトップはRQ01のHub+Wallet中心と一致せず、使える商品の実行まで遠い。直接選択・実行できるHubを標準入口へ戻す。旧プランは `/fund` に保持する。製品要求・料金は変更しない。

## LCH01 — TLS/timeout

原因: 原TLSエラーは調査中。過去の600秒累積終了と個別TLS期限を区別。実測による仮説と歴史的原因確定を混ぜない。変更path・commit・検証・合格証拠: 未確定。残る条件: 原エラーに結び付く再現と修正前後比較、最終SHAの全CI。

## LCH02 — 権利と再配布

原因: 製品LICENSE未選択。実archiveのlegal-info/対応sourceは既存の実物を照合中。変更path・commit・検証・合格証拠: 未確定。残る条件: 全同梱物との一致、明示ライセンス決定、最終artifactの再評価。

## LCH03 — 配布元認証

原因: public RFC8032試験鍵はproduction identityではない。保護Environment、管理鍵、fingerprint、rotationの運用未実証。変更path・commit・検証・合格証拠: 未確定。残る条件: 管理済み鍵で最終候補を署名しクリーン環境検証。

## LCH04 — Sitesと利用導線

原因: `.openai/hosting.json` の `appgprj_6a9b70d966fc8191a1ec30efce14582d` は接続中SitesからNOT_FOUND。所有/編集可能一覧にもなし。勝手な代替projectは作らない。変更path: `app/page.tsx`, `app/layout.tsx`, `app/workspace.css`, `components/hub-workspace.tsx`, `components/workspace-shell.tsx`, `app/fund/page.tsx`。commit/検証: 未完了。残る条件: 既存Sites履歴/API/DB統合、本人限定プレビュー、モバイル/認証境界/動画/導入リンクの実ブラウザ検証。

## LCH05 — 完成CM

原因: Gitに確定CM情報なし。既存local候補のhash・長さ・字幕を照合中。技術デモをCMとして代用せず、CMを再制作しない。変更path・commit・検証・合格証拠: 未確定。残る条件: 確定CMの選択・表現審査・掲載先とhashの固定。

## LCH06 — PR系列

原因: PR1→PR2→PR3のstack。mainへ最終mergeする前に正確なtreeを照合する。既存PR系列・force push禁止を保持。変更path・commit・検証・合格証拠: 未確定。残る条件: 最新mainを含む候補・全必須checks・merge順・metadataの一致。

## LCH07 — 最終配布

原因: 元候補はCANDIDATE / NOT_CLEARED / PACKAGED_NOT_ACCEPTED。ライセンス・署名・CM・Siteが揃う前の再受入宣言は禁止。変更path・commit・検証・合格証拠: 未確定。残る条件: 新しい版名で二回同一bytes生成、最終manifest、fresh導入/復旧/削除、同一SHA受入。
