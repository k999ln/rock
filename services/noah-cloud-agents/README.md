# NoahのCLIクラウド実行器

契約・上限は [サービス設計](../../docs/services/noah-cloud-agents.md)。公開ディレクトリの検証済みprofileだけを実行し、Noah APIが本人・委任・Workを管理する。

## 配備

このディレクトリで `npm ci`。Dockerが利用できる環境で `npm run check` がWorkerとamd64イメージを検証する。rootのWranglerや他サービスの設定を拾わないよう、各scriptは明示した `./wrangler.jsonc` を使用する。

既存Cloudflareアカウントへ `npm run deploy`。新規D1 migrationは不要。配備にはWorkersとContainersの権限が必要。Workers AIも同じアカウントのbindingを使う。

1. 32文字以上のランダムな `NOAH_CLOUD_KEY` を生成し、`npx wrangler secret put NOAH_CLOUD_KEY --config ./wrangler.jsonc` の非表示入力で設定する。値はファイル・コマンド引数・ログへ書かない。
2. Sitesの実行時環境へ同じsecretと、配備結果の `NOAH_CLOUD_URL=https://noah-cloud-agents.<account>.workers.dev` を設定する。
3. Sitesに同じWebソースを配備する。完了通知先は固定の `https://avoado.si/api/noah/cloud-agents/result`。
4. 公式Agentの実モデル結果・ブラウザ閉鎖後のWork保存・停止・別owner拒否を確認してから、task123へ配備版と受入結果を記録する。

`/health` 以外はサーバー間Bearerを必須にする。ブラウザやguestには運営鍵を渡さない。URLと鍵の両方がないSitesでは、クラウド接続を掲載しない。

## 検証

rootで `node --experimental-strip-types --test tests/noah-cloud-*.test.mjs`、`npm run verify`。実ブラウザのfixture試験は `scripts/test-noah-cloud-browser.mjs` に `NOAH_TEST_URL`、`NOAH_TEST_OUTPUT`、`NOAH_PLAYWRIGHT_PACKAGE` を指定する。fixtureの合格と実クラウドでの合格を区別する。
