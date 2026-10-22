# Agent Smith：仮想空間での存在の移動を検証する、次の正味10時間の開発プロンプト

作成: 2026-10-20、参照像と問いの訂正: 2026-10-22。本人の参照は映画『マトリックス』のエージェント・スミス。問いの中心は、**仮想世界でAgentの存在を別の姿・場所へ移せるか**である。続編の自己複製は別能力として扱う。現実の音・まちづくり・ヘイトや賞賛の集中による心理的影響は独立した研究論点であり、実在の人の意思や人格の完全な乗っ取りを技術的事実・製品目標にしない。本人の望まない標的化や心理的支配を設計・実験しない。画像は発想の参照であり、映画素材を製品assetへ複製しない。これは**次回の開発担当への実行指示**で、文書改訂を10時間の開発実績に数えない。既存台帳の実装77分は履歴である。「10時間実行」を引き受ける場合は、新たな正味600分を別に記録し、77分を再計上しない。

## 任務と今回の完成物

あなたは`k999ln/rock`のSky / MCP、SKY07・SKY21、ROCK担当である。**同じownerのAgentを、本人とhostが許可した仮想空間内の姿Aから姿Bへ移す**小さな体験を作る。まず既存の手入力メモとPlannerを状態・権限契約のfixtureとして再利用し、別途ブラウザー上に二つの仮想room/hostとavatarを持つ検証画面を用意する。本人が「このAgentをroom Bのavatarへ移す」と明示し、host Bが受け入れ、Agent ID・仕事の文脈・許可範囲を引き継いで、room Aの旧avatarを停止または閲覧専用にする。本人は現在地、引継ぎ範囲、費用、停止・取消、履歴と成果を確認できる。単なる二つのjobや画面上のコピーでは合格にしない。

本人が接続先・能力・入力範囲・費用上限を先に選ぶ。hostごとに独立したAdd・権限・期限・仕事attemptを持ち、移動は現在のavatarのlease終了と新avatarのlease開始を一つの親job/revisionで整合させる。途中失敗時は元の権限を勝手に復活させず、保存済み状態と監査履歴から本人が再開する。任意の依頼文から実行コードや権限を生成せず、勝手に増殖・他人のavatarや画面へ侵入・外部送信しない。対応不能なら理由を示す。Sky単体利用を妨げず、Jennifer、native OS、SIM/eSIM、Zoomを必須にしない。現行製品方針は`docs/product-baseline.md`と`data/product-baseline.json`を優先する。

## 開始時に確かめる事実

1. `AGENTS.md`と正本5ファイル（`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`）を読み、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/prompt-playbook.md`、`docs/design-implementation-alignment-20260909.md`、`docs/sky-tools-complete-design.md`のAgent Smith節とstatusの`phaseGates`を照合する。設計v1.1の承認は`docs/execution-approval-20260909.md`と`data/execution-approval.json`で確認済みとして扱い、再承認で止めない。
2. `git status --short --branch`と`npm run prompt:context`を実行し、GitHub main、実在するAgent Smith branch、PR、各head **同一SHA**のCIを取り直す。取得失敗は未確認と記録する。利用者のdirtyな別checkoutを触らず、既存の分離worktreeから再開する。mainにベース・入口・優先順位の更新があれば、対象pathの差だけを比較して先に同期する。文書保存、branch反映、main統合は別状態とする。
3. 現行の実装・試験・証拠を読む: `lib/sky-private-agent.ts`、`lib/sky-private-agent-store.ts`、`lib/sky-app-contract.ts`、`lib/sky-app-foundation.ts`、`lib/workflow.ts`、`lib/work-store.ts`、`app/api/sky/private-agents/route.ts`、`app/api/sky/app-work/route.ts`、`components/sky-app-server-panel.tsx`、`tests/sky-private-agent-store.test.mjs`、`docs/evidence/agent-smith-local-browser.json`。既存Zemaの親子job、revision、停止契約も調べて再利用する。必要な追加pathは検索して読む。履歴snapshotを現行ソースの代わりにしない。

**2026-10-20 10:11 UTCの起点**: GitHub main `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`は同一SHAのchecks 23件が成功。`codex/agent-smith-development`は`f4723c5f57be00c29cb58d1bbce94cce6b770ae9`でGitHub保存済み、checkout clean、関連PRなし、同一SHAのchecksは0件。これはbranch CI成功を意味しない。別PR #130・#147もAgent Smith統合の証拠ではない。実行時にはこのsnapshotを更新する。`data/product-baseline.json.nextPrompt`は本書を指す。

**2026-10-22の再確認**: GitHub connectorでmain `7304e449cd7938b098b0b1ce481a06501db8d795`、作業branch `cb48a297ced8b5000f6552c2920c79f53cdf5ce6`を取得した。`npm run prompt:context`は最新コンテキスト確定に失敗したため、当該headのPR・check runsは再確認未了。connectorのcombined statuses 0件はcheck runsの成功を意味しない。上の10月20日snapshotを現在のCI成績へ繰り上げず、実装開始時に再取得する。

baseline監査が照合する**履歴SHA**はmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、nativeHead `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、designHead `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現在のhead/CIではない。

## 実装の順番と合格証拠

| 順 | 差と原因 | 行うこと / 合格証拠 |
| --- | --- | --- |
| 1. AS01 引継ぎ | 最初のowner別Agent/Add/jobはbranchに保存済みだがmain未統合、branch CIなし。 | mainとの差を対象pathで監査し、必要なベース変更だけ取り込む。既存実装を作り直さない。選んだbase・競合・branch SHA・CI状態を記録する。ROCK担当。 |
| 2. AS07 仮想avatar移動 | 現行のメモとPlannerは共通schemaを使う別仕事であり、仮想世界で同一Agentの姿を移す証拠がない。 | 本人所有の二つの仮想room/hostとavatarをブラウザーに実装し、明示移動→新host受入→同一Agent IDと限定文脈の引継ぎ→旧avatar停止を一つの親job/revisionで示す。拒否・途中失敗・再読込で二重の実行権限を残さず、別ownerのavatarへの移動を拒否する。これは映画的な表現の安全なsimulationであり、実在の人の支配ではない。ROCK担当。 |
| 3. AS02 作成とAdd | 利用者の「欲しい機能」から利用可能な能力、必要権限、配置と上限を理解する導線は未検収。 | 対応能力の選択と説明、版/digest、owner、host、入力、成果、費用、Add解除を既存schemaへ結ぶ。非対応依頼は拒否する。実browserで作成→二つの仮想hostへAdd→移動開始までの操作数・所要時間を測る。ROCK担当。 |
| 4. AS04 仕事と復旧 | 単独jobの成功・再読込・停止はlocal D1/browserで確認済み。HTTP結果不明、実行中停止と遅延結果、avatar移動時の整合、routeでの別owner/失効は未検収。 | 同じ親job/revisionと移動前後のattemptで保存・再表示を確認する。未知応答は再送せず状態照会へ進める。移動中停止と遅延結果、二重押下、古いrevision、別owner、Add失効を注入し、未許可の継続・二重作用・他人の内容露出を拒否する。ROCK担当。 |
| 5. AS03 外部host | host adapterと実host操作は共通jobの外側。Zoom AXは下書きprobeで、Broker leaseと実Zoom受入がない。 | 今回は外部hostを必須成果にしない。本人が特定host・操作・対象を選んだ場合にだけ、host公式入口、OS/host許可、短命lease、結果の独立読戻しを別gateで検証する。外部送信・会議録音・購入は自動実行しない。host側はEXTERNAL、接続受入はJOINT、対象・権限・費用はOWNER。 |
| 6. AS05 展開 | 他host、Pixel、QEMU、本番への転用証拠はない。 | 共通契約とadapterの実装済み範囲を画面と文書で分ける。未接続を「対応済み」と表示しない。ROCKが準備し、実host/実機/本番はそれぞれ独立gateに残す。 |
| 7. AS06 自己複製 | 二つの場所で同時に動く姿は、移動とは別の契約であり未実装。 | 今回は移動で得た停止・権限・文脈の証拠から、複数体を許す場合の上限、統合、費用、取消を設計メモに残す。実装や受入を自動的に主張しない。 |
| 8. AS08 現実の環境と社会的影響 | 音・空間・ヘイトや賞賛の集中が感じ方や行動に影響し得るという仮説と、人の人格を完全に乗っ取れるという主張が混ざりやすい。 | 環境騒音、健康的な公共空間、音環境の一次資料を短く整理し、本人参加・退出可能な支援的な空間体験の研究案と測定項目を作る。特定個人へのヘイト/賞賛の誘導、世論操作、無断の心理実験、脳刺激の実施は扱わない。現実の人の意思の上書きを受入条件にしない。 |

AS08の一次資料の入口は[WHOの環境騒音資料](https://www.who.int/tools/compendium-on-health-and-environment/environmental-noise)、[WHO欧州の緑地・水辺と健康の資料](https://www.who.int/europe/publications/i/item/9789289055666)、[低強度集束超音波による神経調節の総説](https://www.nature.com/articles/s43586-024-00368-6)とする。最後の研究分野を街中の音による人格操作へ外挿しない。

## 10時間の使い方

開始・中断・再開・終了のUTC、正味分数、作業内容を台帳に追記する。tool待機・回答待ち・他作業を含めず、600分まで実装と検証を続ける。目安は、現状とbase差の確認60分、仮想avatar移動の契約・保存とroom画面200分、作成/Add/状態画面100分、停止と復旧の異常系120分、現実側の一次資料調査と研究案40分、実browser・全体検証・引継ぎ80分。問題が見つかれば配分を変え、残時間を具体的な修正へ使う。600分に満たない場合は実績分だけを報告する。

先に対象試験を実行する。最終的に`node --experimental-strip-types --test tests/sky-private-agent*.test.mjs`、`npm run schema:check`、`npm run typecheck`、`npm run design:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を実行する。必要な環境依存を記録する。既存Webの仕事状態は`lib/workflow.ts`を通す。新しいOS componentやSky catalog Toolを変える場合は`data/design-document-index.json`と対応する全体/Tool詳細設計を同じ変更で更新する。利用方法が変わればREADME本文も更新する。

実browserでは、**一人のAgent→本人許可のroom Aに出現→room Bへ移動を承認→新host受入→旧avatar停止→同じAgent IDと限定文脈で仕事を続行→再読込**を通す。さらに移動中停止と遅延結果、結果不明→状態照会、別owner拒否、Add解除後の既存成果読戻しを同じコード・DB schemaで記録する。UIに現在のavatar、接続先、権限、引継ぎ範囲、進捗、停止状態を表示し、映画の静止画を使わず独自の視覚表現にする。fixture、仮想host、実外部アプリ、Pixel、QEMU、本番の証拠を混ぜない。保存する証拠は小さなJSON要約、実行コマンド、結果、親/attempt ID・revision、失敗箇所、再現手順とし、私的本文・秘密・巨大ログ・画面全フレームをGitへ入れない。

Cloudや有料Toolへ広げるなら既存の本人同意、単価/見積、上限承認、予約、itemized usageと結果不明時の保留を使い、許可済み予算を超えない。local fixtureの申告費用0を実Providerの料金受入に転用しない。公開、遠隔D1 migration、外部アプリ操作、実機、実課金はそれぞれのgateが通った場合だけ受入と記す。

## 終了時の引継ぎ

`project.md`と`data/project-status.json`を更新し、開始/終了UTC、今回の正味分数と累計、branch/head SHA、変更path、AS01〜AS08の解決/残件、各試験のコマンド・結果、改善前後の実測、未受入条件、次担当の最初の一手を残す。**同じAgentの仮想avatar移動の証拠**を単独jobや2体の並行表示から分ける。現実側の研究は出典・仮説・本人参加条件・測定方法・未実証点を分ける。GitHub branchへ保存して同一SHAのCIを確かめる。checksが0件なら0件と書き、必要ならレビュー可能なdraft PRでCIを起動する。main統合と公開は別に記録する。現行RQ01〜RQ50と後続の明示要望との矛盾を自己点検するが、この作業の成功をOS完成、実在の人の乗っ取り、外部host対応、収益実証へ拡大しない。
