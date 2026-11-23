# NoahのCLIクラウド実行器

契約・上限は [サービス設計](../../docs/services/noah-cloud-agents.md)。公開ディレクトリの検証済みprofileだけを実行し、Noah APIが本人・委任・Workを管理する。

## 追加料金なしの実行器

rootで `npm ci --ignore-scripts`、このディレクトリで固定Wranglerの `deploy --config ./wrangler.free.jsonc` を使う。DockerとContainersは不要。`build-free.mjs` は固定npmの公式MCP factoryを梱包し、版情報の動的requireとimport.meta.urlの梱包先のみ補正する。Toolの実装・パス検査は変更しない。公式Thinkingの入力ログは公開オプションで無効化する。

Workers Freeの旧accountへ `noah-free-cloud-agents` を配置する。Noahのsecretと同じ `NOAH_CLOUD_KEY`、Sitesへ `NOAH_CLOUD_URL=https://noah-free-cloud-agents.mr-kirin999.workers.dev` と `NOAH_CLOUD_MODE=free` を設定し、検証を通した6種の対応範囲だけを公開する。URL/keyだけで有効化せず、必ずmodeも同時設定する。Noahに入力した本文は実モデルへ送信し、元のWorkに保存される。追加の課金・Gateway・有料モデルは使わない。

使ったモデルの量で数える（全体 8,000 neuron/UTC日・本人 2,400・1 件 1,200。`NOAH_CLOUD_DAILY_NEURONS` で全体を下げられる）・件数の上限は全体60件/本人12件・同時2件・モデル4回/応答1024tokens・入力32768bytes、既存240秒/成果上限を保持。Cloudflareの共有無料枠が先に尽きた場合もエラーで停止する。alarmが仕事を開始し、結果だけを既存callbackへ送る。停止は以後のモデル/Tool開始とlate結果の採用を閉じる。すでに提供元が開始したモデル計算の物理中断は保証しない。

検証はrootで `node --experimental-strip-types --test tests/noah-free-cloud.test.mjs tests/noah-cloud-runtime.test.mjs tests/noah-cloud-api.test.mjs`。公式本体・SQLite alarm・呼出と停止競合・期限・隔離・配布版・実成果hashを検査する。旧コンテナ版は以下に残し、追加料金なしの依頼では配備しない。

## 公式Pythonの無料実行

`python/` はTime 2026.11.18、boss 3.4.151、Hermes 0.19.0の固定wheelを使用する。`python3 prepare.py` で配布物SHA-256を照合し、公式ソースを改変せず梱包する。Hermesの対話画面・メッセージ連携の任意モジュールだけを除外する。対応はTimeの公式3ツール、bossの `ai interview-prep`（質問5件）、Hermesの公式AIAgent＋todo/memory。モデル輸送を同じ無料Workers AIへのRPCに置き換え、モデル回数・入力・期限・停止は従来の依頼で一元管理する。`run_sync` でモデル応答を待つ間も親DOの停止gateを占有しない。

固定Wranglerはこのサービスの `npm ci` で用意する。Python 3.13以上とuv 0.13.4以上で `python/` 内から `uv sync --locked`、`uv run pywrangler sync`、`python3 prepare.py`。依存はuv.lock/pylock.tomlを保持し、更新する場合は再検証する。`wrangler.jsonc`（Time）、`wrangler.boss.jsonc`、`wrangler.hermes.jsonc` の順に `uv run pywrangler deploy --config <config>` で非公開Python Workerを配置し、続けてこのサービスの `wrangler deploy --config ./wrangler.free.jsonc` でbindingを結線する。3つのWorkerは別isolateを使い、Time/boss/Hermesの依存を同居させない。各Workerは固定profile以外を拒否する。Python Workerに公開URL・モデル鍵・一般外部通信を渡さない。既存無料アカウントを固定し、D1 migrationやプラン変更は不要。

rootの `node scripts/test-noah-python-cloud.mjs` はローカルworkerdで公式3種、ファイルhash、同一isolateの次の依頼の空のtodo/メモ、再送、停止、不正Tool、bossの先頭@入力を検証する。固定モデルの試験であり本番受入とは区別する。`NOAH_PYTHON_WRANGLER` で固定Wranglerの絶対パスを指定できる。通常回帰には `tests/noah-free-python.test.mjs` を含め、RPC経由の4回上限・遅延結果・時間切れ・Time停止を検証する。

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
