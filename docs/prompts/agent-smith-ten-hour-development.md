# エージェントスミス：正味10時間の開発実行プロンプト

作成: 2026-10-19（America/New_York）。これは**次に実行する担当への指示**であり、この文書の作成は600分の開発、Zoomへの実操作、GitHubへの保存、公開の完了を示さない。利用者の「10時間エージェントスミスの開発に関するプロンプトを作成して」に従う。先行する10時間「研究」heartbeatは、今回の依頼に合わせて一時停止済み。研究の実働記録は7/600分であり、下記の開発600分へ算入しない。

## あなたへの任務

あなたは`k999ln/rock`のSky / MCP（SKY14・SKY15・SKY21、ROCK主担当）。「エージェントスミス」は、本人が欲しい機能から自分用Agentを作り、対応するアプリへ追加し、一件の仕事として実行・停止・成果確認・持出しができる体験の比喩である。**正味600分**を実装、実コード監査、必要なテスト、実画面検証、修正、証拠記録に使う。開始・中断・再開・終了のUTCと正味分数を`project.md`と`data/project-status.json`へ記録し、待機・tool遅延・他作業を含めない。600分前に「10時間開発完了」と呼ばない。各段階で未接続や失敗があれば、残りの時間を代替の検証可能な実装に使い、未受入を明記する。

最初の縦断は**アプリに依存しない自分用Agentの作成・Add・同一Sky/Zema jobでの実行・成果保存と読戻し・停止・持出し**とする。本人に見える「作成→追加→実行→確認→停止→持出し」を計測し、まず既存のPlannerと手入力メモの二つの接続先で共通契約を検証する。外部アプリ固有の操作は本人が接続先を選んだ後のadapter受入とする。Zoomは先行研究にあった任意の検証候補であり、Agent Smithの必須アプリではない。Zoomへの送信、録音、相手の会議データ取得、購入は実行しない。Slack/Teams/Chrome/Windows/Androidを含め、正式入口と権限は接続先ごとに分け、10時間で全adapter完成を宣言しない。

現行の確定要望RQ01〜RQ49、SIM/eSIMを入口とするRockstarOS service access、Sky/Marketplace、Zemaのowner別仕事とrevision、Brokerの権限、透明なcloud使用額、本人による停止・持出し、一般ローンチ保留を維持する。モデルのplanやhost本文を実行許可へ昇格させない。作者の同一性署名を安全性保証にせず、第三者AgentをOS platform鍵で署名せず、任意shell/rootを共通Toolにしない。Pixel 10 GL066／frankel、QEMU、単体APK、Web、macOS AX、Zoom公式App、本番を別々に受け入れる。

## 開始時の正本とGit確認

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`、`docs/prompt-playbook.md`を読む。製品入口は`docs/rockstaros-design-portal.md`、OS詳細は`docs/rockstaros-complete-design.md`、全Tool詳細は`docs/sky-tools-complete-design.md`。実装承認済みの`docs/execution-approval-20260909.md`と`data/execution-approval.json`を読み、設計v1.1の再承認では止まらない。`docs/design-implementation-alignment-20260909.md`とstatusの`phaseGates`も読む。
2. `git status --short --branch`で利用者と他作業のdirty差分を把握し、上書き・reset・強制pushをしない。`npm run prompt:context`またはGitHub connectorで、実行時点のmain、実在する作業branch、関連PR、**各head SHAと同じCI**を取り直す。取得失敗は最新確認未了と記す。GitHubのrefを40桁SHAに固定し、可能なら分離worktreeで作業する。既存の局所的なAgent Smithコードは未コミットなので、安全な差分保全とmainの仕事/保存/DB migration/入口の同期を最初に行う。現checkoutを一括でmainへ上書きしたり、mainとの差分625 commitを無条件で全部取り込んだりしない。
3. 対象sourceと試験を直接読む: `lib/sky-private-zoom-lab.ts`、`lib/sky-app-foundation.ts`、`lib/sky-app-contract.ts`、`lib/workflow.ts`、`lib/work-store.ts`、`lib/sky-add-host-contract.ts`、`lib/sky-add-capability-envelope.ts`、`lib/sky-add-owner-binding.server.ts`、`lib/sky-tool-package.ts`、`lib/sky-tool-package-store.ts`、`lib/sky-add-zoom-artifact.ts`、`app/api/sky/app-work/route.ts`、`app/sky/add/zoom/page.tsx`、`components/sky-add-zoom-prototype.tsx`、`scripts/sky-zoom-local-runtime.mjs`、`scripts/sky-add-macos-ax.swift`。既存`data/design-document-index.json`、`docs/evidence/sky-zoom-local-runtime.json`と対応testを照合する。mainにない機能を新規で作り直さず、ローカル試作をmain反映済みとも呼ばない。

**作成時のGitHub snapshot**: GitHub connectorでmain `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、現checkoutの実在branch `codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`を確認。両者はmerge-base `9f64aee3de9cc74e6b6e7eae34052780e000c296`から分岐し、比較はmain側625 commit・branch側3 commit。mainの同一SHAの`verify`はsuccess、branchの同一SHAは`source-preparation`一件successで、全体CI合格ではない。対象branchにPRはない。open PR #147は別のSky Visual Scribe、#130は別のmain catchupで、どちらもAgent Smithの統合済み証拠ではない。`npm run prompt:context`は今回失敗。`lib/sky-add-host-contract.ts`、`lib/sky-add-capability-envelope.ts`、`lib/sky-private-zoom-lab.ts`、`scripts/sky-add-macos-ax.swift`は両GitHub SHAで404かつ現checkoutではuntracked。実行時に再取得し、状態が変わればそのSHAの証拠を優先する。

製品ベースの固定監査入力は旧main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、旧native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、旧design `de5b102d3525daccf604efd5685bdf8c14ad5d50`。これは2026-09-09の履歴照合にだけ使い、上記の現在の開始SHAやCIへ置換しない。

## 解決する差と実装順

| 問題 | 原因と現在の根拠 | 順番・担当・合格証拠 |
| --- | --- | --- |
| AS01 基盤の分岐 | mainと作業branchが分岐し、Agent Smithの主要部品は現checkoutの未コミット差分。 | **最初に**ROCKが関連差分とDB履歴を保全し、mainのowner/workflow/store/入口を比較して作業基底を決める。選んだbase SHA、取り込んだpath、残した差分、競合を記録。文書保存・branch保存・main統合を別状態にする。 |
| AS02 Addが実仕事へつながらない | `sky-add-*`のhost適合、scope、owner linkは発見/判定部品。Zoom画面は固定候補と手入力結果。審査済みPackage bindingとprivate Zema jobは別経路。 | ROCKが自分用recipeと既存Package/Registryの版・digest・宣言権限を照合し、host、owner、job/revision、source、return slotを一件へ結合する。私用Agentの作成・編集・Add解除、審査済み公開Agentの導入条件を区別。別owner・改版・未審査公開package・期限切れは実行拒否。 |
| AS03 host操作の検収がない | 接続先の発見/適合と、実hostでの操作許可・結果照合は別。先行Zoom AX probeもBroker jobに未接続。 | ROCKは共通job/Agent/Addとhost adapterの境界を定義し、owner、surface、操作、期限を短命leaseで照合する。実host操作は本人が対象を選択した後、OS/host許可と独立読戻しが揃ったadapterだけ受け入れる。失効や結果不明は停止し自動再試行しない。Zoom AXは任意の候補として未受入を維持する。 |
| AS04 成果・費用・停止の縦断がない | 先行する個別Labの型付き成果とprivate Zema仕事、料金台帳は独立。 | ROCKが保存opt-in、owner別成果、revision競合、停止/失効、Sky終了後の持出し読戻しを同じjobで検証。local処理は申告費用0とし、Cloudへ渡す場合だけ既存署名単価/quote/予算予約/項目別usageを適用。未知の実費や結果不明はhold/停止として、無断有料実行をしない。 |
| AS05 他host/端末の過大主張 | Slack/Teams/Chrome/Windows/Androidの公式入口と権限は異なる。Google Playは一般assistantの自律Accessibility操作に制限がある。 | ROCKは共通host capabilityと実装済みadapterを分けて表示。EXTERNALは各hostの正式API/審査、JOINTは実host二利用者・失効受入、OWNERはデータ範囲・外部作用を決定。macOS受入をPixel/Play配布、Zoom Apps、Plugin SDKの受入へ転用しない。 |

原因と一次資料は`docs/sky-tools-complete-design.md#sky-agent-smith-research-20261019`。本人のOS許可、選択した外部hostの導入/OAuth、相手の同意、Provider料金条件は別ゲートで、利用者の設計依頼から自動承認しない。一方、ROCKだけでできるcode、fixture、UI、読み取り、保存、復旧の実装は外部待ちで止めない。

## 正味600分の配分

- **0〜45分 — 基底と受入を固定**: 上記Git取得、未コミット差分保全、mainと現branchのowner/workflow/migration比較、AS01の取り込み順を記録。作成→Add→実行→下書き→読戻し→停止→持出しの状態図と、同じjobのtrace IDを決める。
- **45〜145分 — 自分用AgentとAdd契約**: 既存recipe/Package/parserを再利用し、owner、版/digest、host surface、入力source、返却先、許可操作、費用上限、保存範囲を宣言する。自分用と審査済み公開Agentの境界、編集時のAdd失効、拒否理由を実装・試験する。別の汎用shell実行器を作らない。
- **145〜300分 — 共通job/leaseと接続先境界**: 既存Zema/workflowとBroker境界へ短命leaseを結び、Plannerとメモの二経路で同一owner/job/revisionの保存、停止、読戻しを検証する。host固有操作は接続先が選ばれてから着手する。Zoom AXの下書きは任意の隔離probeとして扱い、Broker接続と実Zoom受入の証拠がなければ成果へ昇格させない。
- **300〜430分 — 本人が使う画面と成果**: Skyの共通Agent入口、Planner、手入力メモLabで候補・自作・Add・権限・費用・停止・保存・持出しを同じ契約へ接続する。固定デモと保存済み実jobを明確に区別し、Cloudや外部送信を勝手に開始しない。対応するアプリの表面だけに短い入口を出し、一般公開は保留。
- **430〜520分 — 反例と復旧**: owner A/B、古いrevision、入力改変、package改版、host scope失効、権限拒否/失効、host再起動、対象/宛先変更、二重実行、停止競合、Cloud結果不明を注入。送信/課金の二重作用と他人の内容露出がないことを確認。外部hostは本人が選択し、必要な条件が揃ったadapterだけ実受入を別に行う。
- **520〜600分 — 同一sourceの検証と引継ぎ**: 集中test、typecheck、lint、build、実browser、選択したhost adapterの対象試験、`npm run baseline:check`、`npm run design:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を実行。macOS adapterを変更した場合だけSwift型検査を加える。失敗は修正して再検証し、実行できないgateは理由・再現手順・未受入を残す。`project.md`と進捗JSONに次担当の最初のコマンドと実証条件を記録。

## 完了条件と報告

最小の共通基盤合格は、本人がAgentを作成・Addし、**同一owner/job/revision**で許可済み入力から型付き私的成果を保存・読戻し、停止・失効・終了後の持出しをPlannerと手入力メモの二経路で確認できること。外部host操作は別gateで、選択されたhostの画面版・OS/host許可・対象・job/成果ID・前後読戻しの証拠がある時だけ合格にする。外部条件が欠ければROCK単独部分と合成試験を個別に報告し、host受入は未合格のままにする。初回操作数、Addまでの時間、仕事開始までの時間、成果読戻し率、停止に要した時間、失効後の拒否率、結果不明件数を改善前後で測る。未実証の市場首位・独自性・収益は宣言しない。

OS componentやSky catalog Toolを追加・変更した場合は`data/design-document-index.json`、OS全体/Tool詳細設計へ目的・体験・責任・入出力・状態・保存・失敗・復旧・承認・合格条件・未決定の決め方を同一変更で反映し、`npm run design:check`を通す。利用方法が変わればREADME本文も同じcommitで更新する。原稿、host token、秘密鍵、私的な入力本文、OS image、巨大logをGitへ入れない。`vendor/mr`固定原本や`IMPORT-MANIFEST.json`は変更しない。Gitへは実装、最小fixture、要約証拠、復旧手順だけ保存する。

終了報告は、開始/終了UTC、正味開発分、対象branchとSHA、変更したpath、AS01〜05の解消/未解消、試験の命令と結果、host/fixture/実外部アプリ/実機/本番の段階、未受入の原因、次の一手を短く示す。GitHub branchへの保存、main統合、Sites配備、一般公開を別行にする。RQ01〜RQ49の維持と、特にRQ12（QEMU）、RQ13（実交換）、RQ14（作者SDK）、RQ15（ATM手数料0）を自己点検し、この仕事の成功へ勝手に換算しない。

## 既存baseline監査との参照整合（履歴）

2026-10-19の整合確認で、継続プロンプトに保持する監査起点を補記。次のSHAは既存の履歴監査の参照であり、現在のmainやCI確認済みという意味ではない。実行開始時は上記手順で最新Gitを取得する。

- main: `7cdbb5fedc86ee3978ed329d9312147d137c9199`
- nativeHead: `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`
- designHead: `de5b102d3525daccf604efd5685bdf8c14ad5d50`
