# NoahのCLIクラウド実行器

契約・上限は [サービス設計](../../docs/services/noah-cloud-agents.md)。公開ディレクトリの検証済みprofileだけを実行し、Noah APIが本人・委任・Workを管理する。

## 配備

このディレクトリで `npm ci`。Dockerが利用できる環境で `npm run check` がWorkerとamd64イメージを検証する。rootのWranglerや他サービスの設定を拾わないよう、各scriptは明示した `./wrangler.jsonc` を使用する。

既存Cloudflareアカウント `ae3e6c52c0a9e50aab66a6e4184aa09e` へ `npm run deploy`。設定のaccount_idに固定しており、新ログインが別アカウントも持つ場合でも配備先を切り替えない。新規D1 migrationは不要。配備にはWorkersとContainersの権限が必要。Workers AIも同じアカウントのbindingを使う。

1. 32文字以上のランダムな `NOAH_CLOUD_KEY` を生成し、`npx wrangler secret put NOAH_CLOUD_KEY --config ./wrangler.jsonc` の非表示入力で設定する。値はファイル・コマンド引数・ログへ書かない。
2. Sitesの実行時環境へ同じsecretと、配備結果の `NOAH_CLOUD_URL=https://noah-cloud-agents.<account>.workers.dev` を設定する。
3. Sitesに同じWebソースを配備する。完了通知先は固定の `https://avoado.si/api/noah/cloud-agents/result`。
4. 公式Agentの実モデル結果・ブラウザ閉鎖後のWork保存・停止・別owner拒否を確認してから、task125へ配備版と受入結果を記録する。

`/health` 以外はサーバー間Bearerを必須にする。ブラウザやguestには運営鍵を渡さない。URLと鍵の両方がないSitesでは、クラウド接続を掲載しない。

## 検証

追加した標準入出力MCPの実配布物試験はrootから `NOAH_TEST_IMAGE=<built-image> node scripts/test-noah-cloud-stdio.mjs`。Time・Sequential Thinking・Memory・Filesystemを非root・network none・共有mountなしのLinux containerで起動し、公式ツールを実行する。モデルは固定応答のため、これを本番モデルの合格とは扱わない。npmは固定package-lockとignore-scripts、PyPIは公式wheelのSHA-256を使用する。

提供元接続は `tests/noah-provider-mcp.test.mjs` / `tests/noah-provider-resolve.test.mjs`、ブラウザは `NOAH_TEST_PROVIDER_KIND=mcp` を指定した `scripts/test-noah-provider-browser.mjs` で検証する。全掲載の読取点検は `node --experimental-strip-types scripts/noah-agent-coverage.mjs --input <catalog-snapshot.json> --output <report.json> --live`。公開メタデータと握手だけを行い、道具・申込・支払は実行しない。件ごとに対応状況を保存し、definition_confirmedを実行成功へ昇格しない。

rootで `node --experimental-strip-types --test tests/noah-cloud-*.test.mjs`、`npm run verify`。実ブラウザのfixture試験は `scripts/test-noah-cloud-browser.mjs` に `NOAH_TEST_URL`、`NOAH_TEST_OUTPUT`、`NOAH_PLAYWRIGHT_PACKAGE` を指定する。fixtureの合格と実クラウドでの合格を区別する。

Memoryは `/workspace/memory.jsonl` へ依頼内の情報を保存し、成果ファイルとして返す。次回への自動読込はない。Filesystemの許可先は `/workspace` だけで、端末/ホストの共有mountはない。実配布物試験は領域外パス・symlinkの拒否、ファイルhash、別依頼の空の記憶まで検査する。Node 24の公式イメージをdigestで固定し、公式npm配布物のNode要件を満たす。
