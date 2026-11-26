# 139 — avoado.siを現mainに必要なページへ整理

本人指示: 2026-11-26「今のmainに必要なページだけ残して整理して」。

## 範囲

- 正本は `iceiceice999/rock` の `origin/main`。開始時は `fe7ffba6f9e5afb3dce6877610a4f14a30aa178c`。Sites保存ソース `84d7392f0db8cb3bc6cf6c6eb0c1b7b2b92ec7fa` と追跡treeの差分なし。
- `services/sky-web/main-page-policy.mjs` を公開画面の一覧とし、検索・詳細・実行・保存・Agent制作・本人設定・接続・費用の確認を残す。
- Fitness、Campus（apex内のみ）、Fund、CSV事業、旧Market/Wallet、rocketstar、旧予約案内、独立した記録/計算資源/Zoom画面、月次課金テストを公開入口から外す。ソースとAPI・保存データは削除しない。
- 対応する現行画面のある旧URLは検索条件・選択・fragmentを保持して転送。廃止画面とその旧aliasは410、未知の画面は404。別企画のサイトへ無条件にproxyしない。
- Noahの審査画面は共通layoutで既存の審査担当だけに表示する。publicリンク・sitemapに出さない。
- 専用キャンパスホスト、Pro、MATOU、他製品の公開とAPIは今回の変更対象外。

## 合格条件

1. 現行のホーム・検索・Agent詳細・保存・仕事詳細・Eve・端末接続・クラウド明細・設定は開ける。
2. 廃止画面のGET/HEAD/POSTと旧aliasは本体・Miniへ到達せず410。未知の文書URLは404。
3. API、静的アセット、本人確認、専用ホストの既存のセキュリティ境界は維持される。
4. 審査者以外・未認証・認証障害では審査画面を返さない。審査者は表示できる。
5. sitemapは現行の公開入口だけを返し、主要画面のリンクに廃止先がない。
6. `npm run verify`、対象試験、390px/1280pxの確認結果をPRへ記録する。
7. 公開前に最新mainとSites保存ソースの `HEAD^{tree}` を一致させ、main SHA・Sites版を記録する。

## 状態

実装済み。[PR #81](https://github.com/iceiceice999/rock/pull/81)。対象40試験、typecheck、production build、9経路のHTTPセキュリティ実測が成功。390px/1280pxのホーム・メニュー、未認証の審査画面404を確認。ローカルDBは初期migrationの既存問題でカタログ未投入のため、表示確認は取得失敗状態を含む。初回の全体試験で新しいmoduleを含まない試験fixtureが4件失敗したため、fixtureを更新し実Workerで410/404/200・sitemapを検証。最新の全体verify結果・main SHA・Sites保存SHA・公開版・本番応答はPRの検証／公開記録へ残す。

## Mac Runner接続の復旧（2026-11-26）

本人の本番反映依頼で `/noah/mac/connect` の404を実測。11月24日に追加したRunnerの本人承認画面は現行CLIが案内するURLであり、許可一覧にこの1画面を追加する。旧Mac活動画面は復活させない。GET/HEADで一回限りのコードを変更せず既存画面へ渡し、未知の配下URLは404。認証・接続承認APIは変更しない。追補は [PR #87](https://github.com/iceiceice999/rock/pull/87)。全体検証と公開結果はPRへ記録する。
