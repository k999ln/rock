# Agent Smith：次の正味10時間を使う開発プロンプト

作成: 2026-10-20。これは**次回の開発担当への実行指示**である。文書の作成・改訂を10時間の開発実績として数えない。既存台帳には2026-10-19の実装が正味77分記録されている。この指示で「10時間実行」を引き受ける場合は、開始時からの新たな正味600分を別に記録し、77分を再計上しない。

## 任務と今回の完成物

あなたは`k999ln/rock`のSky / MCP、SKY07・SKY21、ROCK担当である。Agent Smithを「本人が欲しい仕事を選ぶ → 利用可能な能力から自分用Agentを作る → 対応アプリへAddする → 一件の仕事として実行・確認・停止・持出しする」体験に育てる。**今回の完成物は、既存の手入力メモとPlannerで同じAgent/Add/仕事契約を使い、失敗しても本人が状態を理解して復旧できる私用の縦断**である。二つの接続先を増やす前に、この縦断の実画面と異常系を受け入れる。

任意の依頼文を実行コードや権限へ変換しない。本人の依頼は既存の版付き能力と照合し、対応可能な操作・入力・成果・保存先・費用を含む下書きを示す。対応不能なら理由と代替候補を示す。承認された有限の操作だけをBroker境界と既存Zema jobで実行する。Sky単体利用を妨げず、Jennifer、native OS、SIM/eSIM、Zoomを必須にしない。現在の製品方針は現行の`docs/product-baseline.md`と`data/product-baseline.json`を優先し、旧方針を復活させない。

## 開始時に確かめる事実

1. `AGENTS.md`と正本5ファイル（`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`）を読み、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/prompt-playbook.md`、`docs/design-implementation-alignment-20260909.md`、`docs/sky-tools-complete-design.md`のAgent Smith節とstatusの`phaseGates`を照合する。設計v1.1の承認は`docs/execution-approval-20260909.md`と`data/execution-approval.json`で確認済みとして扱い、再承認で止めない。
2. `git status --short --branch`と`npm run prompt:context`を実行し、GitHub main、実在するAgent Smith branch、PR、各head **同一SHA**のCIを取り直す。取得失敗は未確認と記録する。利用者のdirtyな別checkoutを触らず、既存の分離worktreeから再開する。mainにベース・入口・優先順位の更新があれば、対象pathの差だけを比較して先に同期する。文書保存、branch反映、main統合は別状態とする。
3. 現行の実装・試験・証拠を読む: `lib/sky-private-agent.ts`、`lib/sky-private-agent-store.ts`、`lib/sky-app-contract.ts`、`lib/sky-app-foundation.ts`、`lib/workflow.ts`、`lib/work-store.ts`、`app/api/sky/private-agents/route.ts`、`app/api/sky/app-work/route.ts`、`components/sky-app-server-panel.tsx`、`tests/sky-private-agent-store.test.mjs`、`docs/evidence/agent-smith-local-browser.json`。必要な追加pathは検索して読む。履歴snapshotを現行ソースの代わりにしない。

**2026-10-20 10:11 UTCの起点**: GitHub main `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`は同一SHAのchecks 23件が成功。`codex/agent-smith-development`は`f4723c5f57be00c29cb58d1bbce94cce6b770ae9`でGitHub保存済み、checkout clean、関連PRなし、同一SHAのchecksは0件。これはbranch CI成功を意味しない。別PR #130・#147もAgent Smith統合の証拠ではない。実行時にはこのsnapshotを更新する。`data/product-baseline.json.nextPrompt`は本書を指す。

baseline監査が照合する**履歴SHA**はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、nativeHead `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、designHead `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現在のhead/CIではない。

## 実装の順番と合格証拠

| 順 | 差と原因 | 行うこと / 合格証拠 |
| --- | --- | --- |
| 1. AS01 引継ぎ | 最初のowner別Agent/Add/jobはbranchに保存済みだがmain未統合、branch CIなし。 | mainとの差を対象pathで監査し、必要なベース変更だけ取り込む。既存実装を作り直さない。選んだbase・競合・branch SHA・CI状態を記録する。ROCK担当。 |
| 2. AS02 作成とAdd | 現画面はメモ/Plannerの直接作成とAddまで通るが、利用者の「欲しい機能」から使える能力・必要権限・保存先を理解する導線は未検収。 | 対応能力の選択と説明、版/digest、owner、対象app、入力、成果、Add解除を既存schemaへ結ぶ。非対応依頼を安全に拒否する。初回操作を実browserで測り、旧画面との操作数・所要時間を同条件で比較する。ROCK担当。 |
| 3. AS04 仕事と復旧 | local D1とbrowserでは成功、再読込、Add解除後の旧結果、実行前停止を確認済み。HTTPの結果不明、実行中停止と遅延結果、routeでの別owner/失効は未検収。 | 同じjob ID・revisionで保存と再表示を確認する。未知応答は再送せず状態照会へ進める。stopと遅延結果の競合、二重押下、古いrevision、別owner読取/実行、Add失効をrouteまたは実browserで注入し、二重作用・他人の内容露出がないことを示す。ROCK担当。 |
| 4. AS03 外部host | host adapterと実host操作は共通jobの外側。Zoom AXは下書きprobeで、Broker leaseと実Zoom受入がない。 | 今回は外部hostを必須成果にしない。本人が特定host・操作・対象を選んだ場合にだけ、host公式入口、OS/host許可、短命lease、結果の独立読戻しを別gateで検証する。外部送信・会議録音・購入は自動実行しない。host側はEXTERNAL、接続受入はJOINT、対象・権限・費用はOWNER。 |
| 5. AS05 展開 | 他host、Pixel、QEMU、本番への転用証拠はない。 | 共通契約とadapterの実装済み範囲を画面と文書で分ける。未接続を「対応済み」と表示しない。ROCKが準備し、実host/実機/本番はそれぞれ独立gateに残す。 |

## 10時間の使い方

開始・中断・再開・終了のUTC、正味分数、作業内容を台帳に追記する。tool待機・回答待ち・他作業を含めず、600分まで実装と検証を続ける。目安は、現状とbase差の確認60分、作成/Add導線150分、仕事の復旧と異常系210分、実browserの体験測定90分、検証・修正・引継ぎ90分。問題が見つかれば時間配分を変え、残時間を具体的な修正へ使う。600分に満たない場合は実績分だけを報告する。

先に対象試験を実行する。最終的に`node --experimental-strip-types --test tests/sky-private-agent*.test.mjs`、`npm run schema:check`、`npm run typecheck`、`npm run design:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を実行する。必要な環境依存を記録する。既存Webの仕事状態は`lib/workflow.ts`を通す。新しいOS componentやSky catalog Toolを変える場合は`data/design-document-index.json`と対応する全体/Tool詳細設計を同じ変更で更新する。利用方法が変わればREADME本文も更新する。

実browserでは、**メモ成功→再読込、Planner成功→再読込、実行前停止、実行中停止と遅延結果、結果不明→状態照会、別owner拒否、Add解除後の既存成果読戻し**を同一コード・同一DB schemaで記録する。fixture、host、実外部アプリ、Pixel、QEMU、本番の証拠を混ぜない。保存する証拠は小さなJSON要約、実行コマンド、結果、job/revision、失敗箇所、再現手順とし、私的本文・秘密・巨大ログ・画面全フレームをGitへ入れない。Git外の一時スクリーンショットを永続的な合格証拠と見なさない。

Cloudや有料Toolへ広げるなら既存の本人同意、単価/見積、上限承認、予約、itemized usageと結果不明時の保留を使い、許可済み予算を超えない。local fixtureの申告費用0を実Providerの料金受入に転用しない。公開、遠隔D1 migration、外部アプリ操作、実機、実課金はそれぞれのgateが通った場合だけ受入と記す。

## 終了時の引継ぎ

`project.md`と`data/project-status.json`を更新し、開始/終了UTC、今回の正味分数と累計、branch/head SHA、変更path、AS01〜05の解決/残件、各試験のコマンド・結果、改善前後の実測、未受入条件、次担当の最初の一手を残す。GitHub branchへ保存して同一SHAのCIを確かめる。checksが0件なら0件と書き、必要ならレビュー可能なdraft PRでCIを起動する。main統合と公開は別に記録する。現行RQ01〜RQ50と後続の明示要望との矛盾を自己点検するが、この作業の成功をOS完成、外部host対応、収益実証へ拡大しない。
