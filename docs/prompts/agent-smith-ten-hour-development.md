# Agent Smith：同じAgentが複数の場所で働く、次の正味10時間の開発プロンプト

作成: 2026-10-20、参照像の訂正: 2026-10-22。本人が示した画像は映画『マトリックス』のエージェント・スミスが複数現れる場面である。前版は「Agent Smith」を単なる自分用Agent作成機能として扱い、**同じ存在が複数の場所に現れて連携する**という中心の比喩を落としていた。画像は発想の参照であり、映画の静止画・俳優の顔・衣装を製品素材として複製する指示ではない。これは**次回の開発担当への実行指示**で、文書改訂を10時間の開発実績に数えない。既存台帳の実装77分は履歴である。この指示で「10時間実行」を引き受ける場合は、開始時からの新たな正味600分を別に記録し、77分を再計上しない。

## 任務と今回の完成物

あなたは`k999ln/rock`のSky / MCP、SKY07・SKY21、ROCK担当である。**本人が一人のAgent Smithを作り、許可した場所に最大2体のインスタンスをAddし、両者を一つの仕事の下で連携させる**体験を作る。プレビューで使う場所は既存の手入力メモとPlannerである。本人の「このメモから次の作業を準備して」を例に、メモ側が許可済みの範囲で入力を整理し、Planner側がその型付き結果を受けて計画案を作り、本人が一つの画面で両インスタンスの状態・成果・費用を見て確認、個別停止または一括停止、再訪、持出しができることを**今回の完成物**とする。二つの独立したdemo jobを並べただけでは合格にしない。

本人がインスタンス数・接続先・能力・入力範囲・費用上限を先に選ぶ。各インスタンスは同じAgent定義とownerを共有するが、hostごとに独立したAdd・権限・期限・仕事attemptを持つ。共通の親jobが順序、型付き引継ぎ、結果の統合、停止と失効を管理し、元のインスタンスへ戻れなくても保存済み状態から復旧する。任意の依頼文から実行コードや権限を生成せず、勝手に増殖・他人の画面へ侵入・外部送信しない。対応不能なら理由を示す。Sky単体利用を妨げず、Jennifer、native OS、SIM/eSIM、Zoomを必須にしない。現行製品方針は`docs/product-baseline.md`と`data/product-baseline.json`を優先する。

## 開始時に確かめる事実

1. `AGENTS.md`と正本5ファイル（`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`）を読み、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/prompt-playbook.md`、`docs/design-implementation-alignment-20260909.md`、`docs/sky-tools-complete-design.md`のAgent Smith節とstatusの`phaseGates`を照合する。設計v1.1の承認は`docs/execution-approval-20260909.md`と`data/execution-approval.json`で確認済みとして扱い、再承認で止めない。
2. `git status --short --branch`と`npm run prompt:context`を実行し、GitHub main、実在するAgent Smith branch、PR、各head **同一SHA**のCIを取り直す。取得失敗は未確認と記録する。利用者のdirtyな別checkoutを触らず、既存の分離worktreeから再開する。mainにベース・入口・優先順位の更新があれば、対象pathの差だけを比較して先に同期する。文書保存、branch反映、main統合は別状態とする。
3. 現行の実装・試験・証拠を読む: `lib/sky-private-agent.ts`、`lib/sky-private-agent-store.ts`、`lib/sky-app-contract.ts`、`lib/sky-app-foundation.ts`、`lib/workflow.ts`、`lib/work-store.ts`、`app/api/sky/private-agents/route.ts`、`app/api/sky/app-work/route.ts`、`components/sky-app-server-panel.tsx`、`tests/sky-private-agent-store.test.mjs`、`docs/evidence/agent-smith-local-browser.json`。既存Zemaの親子job、revision、停止契約も調べて再利用する。必要な追加pathは検索して読む。履歴snapshotを現行ソースの代わりにしない。

**2026-10-20 10:11 UTCの起点**: GitHub main `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`は同一SHAのchecks 23件が成功。`codex/agent-smith-development`は`f4723c5f57be00c29cb58d1bbce94cce6b770ae9`でGitHub保存済み、checkout clean、関連PRなし、同一SHAのchecksは0件。これはbranch CI成功を意味しない。別PR #130・#147もAgent Smith統合の証拠ではない。実行時にはこのsnapshotを更新する。`data/product-baseline.json.nextPrompt`は本書を指す。

**2026-10-22の再確認**: GitHub connectorでmain `7304e449cd7938b098b0b1ce481a06501db8d795`、作業branch `9508afca7a168af16a5fad424fbf67fdbc2f70e2`を取得し、Agent Smith branchのPR検索は0件だった。CLIの`npm run prompt:context`相当はDNS接続に失敗したため、当該headのcheck runsは再確認未了。connectorのcombined statuses 0件はcheck runsの成功を意味しない。上の10月20日snapshotを現在のCI成績へ繰り上げず、実装開始時に再取得する。

baseline監査が照合する**履歴SHA**はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、nativeHead `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、designHead `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現在のhead/CIではない。

## 実装の順番と合格証拠

| 順 | 差と原因 | 行うこと / 合格証拠 |
| --- | --- | --- |
| 1. AS01 引継ぎ | 最初のowner別Agent/Add/jobはbranchに保存済みだがmain未統合、branch CIなし。 | mainとの差を対象pathで監査し、必要なベース変更だけ取り込む。既存実装を作り直さない。選んだbase・競合・branch SHA・CI状態を記録する。ROCK担当。 |
| 2. AS06 複数インスタンス | 現行のメモとPlannerは共通schemaを使うが、別々のAgent/Add/job操作であり、画像が示す「一人のAgentの複数の姿」ではない。 | 同じAgent ID・revisionからownerが2体を作り、host別Add・attemptと一つの親jobへ結ぶ。メモの型付き結果をPlannerへ渡し、親画面で各体の状態と統合成果を読戻す。中断・再開・個別/一括停止を同じ親jobで検証する。ROCK担当。 |
| 3. AS02 作成とAdd | 利用者の「欲しい機能」から利用可能な能力、必要権限、2体の配置と上限を理解する導線は未検収。 | 対応能力の選択と説明、版/digest、owner、host、入力、成果、費用、インスタンス数とAdd解除を既存schemaへ結ぶ。非対応依頼は拒否する。実browserで作成→2体Add→親job開始までの操作数・所要時間を同条件で測る。ROCK担当。 |
| 4. AS04 仕事と復旧 | 単独jobの成功・再読込・停止はlocal D1/browserで確認済み。HTTP結果不明、実行中停止と遅延結果、親子jobの整合、routeでの別owner/失効は未検収。 | 同じ親job/revisionと2体のattemptで保存・再表示を確認する。未知応答は再送せず状態照会へ進める。片方の停止・全体停止と遅延結果の競合、二重押下、古いrevision、別owner、片方のAdd失効を注入し、未許可の継続・二重作用・他人の内容露出を拒否する。ROCK担当。 |
| 5. AS03 外部host | host adapterと実host操作は共通jobの外側。Zoom AXは下書きprobeで、Broker leaseと実Zoom受入がない。 | 今回は外部hostを必須成果にしない。本人が特定host・操作・対象を選んだ場合にだけ、host公式入口、OS/host許可、短命lease、結果の独立読戻しを別gateで検証する。外部送信・会議録音・購入は自動実行しない。host側はEXTERNAL、接続受入はJOINT、対象・権限・費用はOWNER。 |
| 6. AS05 展開 | 他host、Pixel、QEMU、本番への転用証拠はない。 | 共通契約とadapterの実装済み範囲を画面と文書で分ける。未接続を「対応済み」と表示しない。ROCKが準備し、実host/実機/本番はそれぞれ独立gateに残す。 |

## 10時間の使い方

開始・中断・再開・終了のUTC、正味分数、作業内容を台帳に追記する。tool待機・回答待ち・他作業を含めず、600分まで実装と検証を続ける。目安は、現状とbase差の確認60分、親jobと2体の契約・保存190分、作成/Add/状態画面120分、停止と復旧の異常系130分、実browser・全体検証・引継ぎ100分。問題が見つかれば配分を変え、残時間を具体的な修正へ使う。600分に満たない場合は実績分だけを報告する。

先に対象試験を実行する。最終的に`node --experimental-strip-types --test tests/sky-private-agent*.test.mjs`、`npm run schema:check`、`npm run typecheck`、`npm run design:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を実行する。必要な環境依存を記録する。既存Webの仕事状態は`lib/workflow.ts`を通す。新しいOS componentやSky catalog Toolを変える場合は`data/design-document-index.json`と対応する全体/Tool詳細設計を同じ変更で更新する。利用方法が変わればREADME本文も更新する。

実browserでは、**一人のAgent→2体のAdd→同じ親job→メモの型付き結果→Plannerの計画→統合成果→再読込**を通す。さらに実行前停止、片方/全体の実行中停止と遅延結果、結果不明→状態照会、別owner拒否、片方のAdd解除後の既存成果読戻しを同じコード・DB schemaで記録する。UIに両体の接続先、権限、進捗、停止状態を表示し、映画の静止画を使わず独自の視覚表現にする。fixture、host、実外部アプリ、Pixel、QEMU、本番の証拠を混ぜない。保存する証拠は小さなJSON要約、実行コマンド、結果、親/子ID・revision、失敗箇所、再現手順とし、私的本文・秘密・巨大ログ・画面全フレームをGitへ入れない。

Cloudや有料Toolへ広げるなら既存の本人同意、単価/見積、上限承認、予約、itemized usageと結果不明時の保留を使い、許可済み予算を超えない。local fixtureの申告費用0を実Providerの料金受入に転用しない。公開、遠隔D1 migration、外部アプリ操作、実機、実課金はそれぞれのgateが通った場合だけ受入と記す。

## 終了時の引継ぎ

`project.md`と`data/project-status.json`を更新し、開始/終了UTC、今回の正味分数と累計、branch/head SHA、変更path、AS01〜AS06の解決/残件、各試験のコマンド・結果、改善前後の実測、未受入条件、次担当の最初の一手を残す。**同じAgentが2体として協調した証拠**を単独jobの合格から分ける。GitHub branchへ保存して同一SHAのCIを確かめる。checksが0件なら0件と書き、必要ならレビュー可能なdraft PRでCIを起動する。main統合と公開は別に記録する。現行RQ01〜RQ50と後続の明示要望との矛盾を自己点検するが、この作業の成功をOS完成、外部host対応、収益実証へ拡大しない。
