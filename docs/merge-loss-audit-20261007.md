# 統合で失われた情報の監査（2026-10-07）

種類: 監査 ／ 対象: `origin/main` `0fbf688b`（2026-10-06）までの全履歴 ／ 作成: 2026-10-07

リポジトリを整理する途中で、**過去の統合（merge）のときに文書の中身が消えていた**ことが分かりました。この文書は、何が消えていたか、何を戻したか、何を戻していないかを記録します。戻していないものには、ownerの判断が必要なものがあります（[5節](#5-ownerに決めてほしいこと)）。

## 1. 30秒でわかること

- **いちばん大きい原因は2026-10-05 05:09 ET（米東部時間、以下同じ）の統合 `ecb4b2af` です。** 2026-09-29で止まっていたローカルのブランチへ `main` を取り込んだとき、`main` 側で更新されていた47ファイルのうち39ファイルが、丸ごと古いローカル側の内容になりました。`main` はその間に349コミット進んでいました。
- その結果、`README.md` はSIM/eSIM起点になる前の版へ戻り、`project.md` は2026-09-25〜10-05の作業記録を、`docs/sky-tools-complete-design.md` や `docs/workstreams/01-product-ux.md` は同じ期間の追記を失っていました。
- ほかに、2026-10-05 01:42〜01:49の古いPRの取り込みと、2026-09-09〜09-24の並行ブランチの統合でも、片側の記述が落ちています。
- 行で数えると、統合で落ちて `main` に無かった行は **2,043行**（25文字以上、ファイルごとに重複を除く）。今回 **1,205行を文書へ戻し**、353行は同じ文が書き直されて残っていることを確認し、残る **485行は原文のまま[保管庫](merge-loss-audit-20261007/dropped-text.md)へ保存**しました。
- **戻していないもの**は、機械可読の台帳（task台帳、設計台帳）とコードです。台帳は検査と結び付いていて、戻すかどうかは製品の判断になるため、控えを[添付](merge-loss-audit-20261007/ledger-records.json)に置いて手を付けていません。
- とくに、**現在のtask台帳にはSIM/eSIMを題名に持つtaskが1件もありません。** `main` にあった `SIM01`（SIM/eSIM購入から利用開始まで）が統合で消えたままです。

## 2. 何が起きたか

### 2.1 原因は3種類

| 種類 | いつ | 何が起きたか | `main` に無かった行 | うち戻した行 |
| --- | --- | --- | ---: | ---: |
| **A. 古いローカルブランチへの取り込み** | 2026-10-05 05:09 | 統合 `ecb4b2af`。ローカル側 `81a370c3`（2026-09-29）と `main` 側 `624124cf`（2026-10-05 04:20）の共通の祖先は `4e74e2f5`（2026-09-25）。競合したファイルをローカル側で解決した | 921 | 870 |
| **B. 古いPRの取り込み** | 2026-10-05 01:42〜01:49 | PR #25・#40〜#47・#49・#58を `main` へ入れた11件の統合。文書と台帳は「現行側を保つ」方針で解決された。コードは入ったが、PR側に書かれていた作業記録・決定の記録が落ちた | 305 | 196 |
| **C. 並行ブランチの統合** | 2026-09-09〜09-24 | 27件の統合。複数のブランチが同じ文書へ同時に追記していた。同じ番号の要望（RQ）を別の内容で使っていた例もあり、片側の節が落ちた | 707 | 138 |
| D. そのほかの統合 | 2026-10-02〜10-05 | 23件の統合。ほとんどが進捗の件数など、書き直されて残っている行 | 110 | 1 |

Aは意図しない巻き戻しと考えられます。統合の直後の文書（[Git / CI workstream](workstreams/10-git-ci-operations.md)）にも「依存宣言と契約が落ちたのでコードを復旧した」という記録がありますが、文章の記録は戻されていませんでした。Bは統合のコミットメッセージに「preserving current … ledgers」「superseded by current …」とあり、意図した選択です。ただし作業記録まで落ちています。Cの多くは、その後に文書そのものが書き直されています。

### 2.2 統合 `ecb4b2af` で `main` 側の内容が置き換わったファイル

`main` 側で変更されていて、統合の結果が `main` 側と一致しなかったファイルは47件です。

| 統合での扱い | その後 | 件数 | ファイル |
| --- | --- | ---: | --- |
| 丸ごとローカル側 | その後も変更なし | 12 | `app/amc/page.tsx`、`components/amc-tool-runner.tsx`、`components/amc-tool-runner.module.css`、`lib/sky-routing.ts`、`lib/zema-chat-session.ts`、`scripts/check-llm-architecture.mjs`、`tests/avocado-r5-docs.test.mjs`、`tests/mini200-e1-docs.test.mjs`、`tests/sky-routing.test.mjs`、`docs/rockstaros-product-system-map.md`、`docs/sky-assistant-and-memory.md`、`docs/workstreams/01-product-ux.md` |
| 丸ごとローカル側 | その後に変更あり | 22 | `README.md`、`PROJECTS.md`、`project.md`、`package.json`、`app/api/amc/route.ts`、`app/api/work-jobs/route.ts`、`components/sky-chat-workspace.tsx`、`components/sky-workspace.tsx`、`lib/operations.ts`、`lib/sky-zema-handoff.ts`、`scripts/check-sky.mjs`、`scripts/check-work-api.mjs`、`tests/amc-sky-integration.test.mjs`、`data/project-status.json`、`data/design-document-index.json`、`data/product-baseline.json`、`data/database-status.json`、`docs/database-status.md`、`docs/product-baseline.md`、`docs/sky-tools-complete-design.md`、`docs/workstreams/10-git-ci-operations.md`、`docs/workstreams/README.md` |
| 丸ごとローカル側 | その後 `main` 側と同じ内容へ戻った | 5 | `lib/amc-tool.ts`、`lib/workflow.ts`、`scripts/amc-codex.mjs`、`scripts/amc-goal-engine.mjs`、`tests/amc-codex.test.mjs` |
| 一部だけ反映 | — | 8 | `AGENTS.md`、`docs/llm-evaluation-architecture.md`、`scripts/check-product-baseline.mjs`、`docs/sky-mcp-architecture.md`、`docs/sky.md`、`components/workbench.tsx`、`lib/catalog.ts`、`lib/work-store.ts`（後ろの3件はその後 `main` 側と同じ内容へ戻った） |

文書は今回戻しました（3節）。**コードと試験は調べていません**（4.2節）。

## 3. 戻したもの

戻した箇所には、それぞれの文書の中に「復元」の注記と元のcommitを書いてあります。原文は変えていません。変えたのは、置き場所、見出しの階層、置き場所が変わったことで必要になったリンクの相対パスだけです。

| 文書 | 戻した内容 | 元 |
| --- | --- | --- |
| [`project.md`](../project.md) | 日付付きの作業記録 **199節**（2026-10-01の70節、10-02の38節、10-03の19節、09-30の15節、10-05の14節、09-27の10節、09-25の9節ほか）。あわせて363節を新しい順に並べ直した | `624124cf` ほか9つのPR側commit |
| [`README.md`](../README.md) | SIM/eSIM起点の主サービスの説明、サービスの流れ、eSIM開発preview、Sky Market・Sky home・登録、Sky Market決済、単独アプリとローンチ受入、Zemaの候補・管理runtime・Web Previewの外観、CSV・ココナラの補足、Skyライブラリ、SPIDERとSpider Guard、native OS検証の注意、特許調査・GTA調査、開発手順の検査コマンド、公開ホームページ、決済とWalletの設計への入口 | `624124cf` |
| [`docs/sky.md`](sky.md) | 「接続情報の登録と再利用」（IP Studio、Providerルーティング、既定の実行器、接続状態）、「Telegramからの有効化」、導入候補22件のID付きの表。READMEにあった日本語の利用案内（接続確認、公開判定、回答取得、文章ツール、AMCのローカル実行、Tool別の注意）もここへ移した | `963027cf`、`5ee96a47`、`624124cf` のREADME |
| [`docs/sky-tools-complete-design.md`](sky-tools-complete-design.md) | 1.1〜1.4節、9節「ココナラ」、IPキャラクターの音声会話・電話連携ほか2026-09-25〜10-05の追記（3者統合）。2026-09-20時点のJev品質評価と追加候補の表 | `624124cf`、`5ee96a47` |
| [`docs/workstreams/01-product-ux.md`](workstreams/01-product-ux.md) | SIM/eSIM起点の目的・現在地と、日付付きの記録17節 | `624124cf` |
| [`docs/workstreams/07-android-device-local-ai.md`](workstreams/07-android-device-local-ai.md) | Jevの5節、AI02〜AI05のhost／fixture実装記録 | `8978ca44`、`b37c52a6`、`504e43c6`、`829bf229`、`af38db8f` |
| [`docs/workstreams/10-git-ci-operations.md`](workstreams/10-git-ci-operations.md) | 日付付きの記録3節と関連資料 | `624124cf` |
| [`docs/workstreams/05-web-pwa-sites.md`](workstreams/05-web-pwa-sites.md) | 2026-09-25の台帳同期（WEB20・DOC05）の記録、検証コマンド1行 | `846f3950` |
| [`docs/product-baseline.md`](product-baseline.md) | 「2026-09-25 公開製品ラインと参考価格の正式化（v1.95）」の節、変更記録2件、表題の注記 | `846f3950`、`624124cf` |
| [`docs/rockstaros-product-system-map.md`](rockstaros-product-system-map.md) | v1.1（2026-10-02、SIM/eSIM起点）の内容 | `624124cf` |
| [`docs/jev-local-qwen-decision-fabric-design.md`](jev-local-qwen-decision-fabric-design.md)・[`docs/rockstaros-complete-design.md`](rockstaros-complete-design.md) | Decision Fabricのhost側実装の状態、Androidの任意Jev providerの節と対応表の行 | `8978ca44` |
| [`docs/backend-launch-20260912.md`](backend-launch-20260912.md) | 同じ日に別ブランチで書かれた「ローンチ手順」（データフロー、起動・終了、必要設定、監視、復旧）を付録として | `9b0f5cc4` |
| [`PROJECTS.md`](../PROJECTS.md) | Campus、Webアプリ、ココナラ、Meme Intelligence Sandboxの行を `main` にあった詳しい記述へ | `624124cf` |

<details>
<summary><code>project.md</code> へ戻した199節の見出し</summary>

`git diff 0fbf688b -- project.md` で確認できます。見出しだけを一覧するには次を実行します。

```sh
diff <(git show 0fbf688b:project.md | grep -E '^#{1,4} ') <(grep -E '^#{1,4} ' project.md) | grep '^>'
```

</details>

## 4. 戻していないもの

### 4.1 機械可読の台帳

台帳（`data/*.json`）は `npm run …:check` と結び付いていて、部隊の割り当て（`data/mission-control.json`）や進捗の件数にも影響します。何を現行とするかはownerの判断なので、**台帳は変更していません。** 消えた記録の控えは[`ledger-records.json`](merge-loss-audit-20261007/ledger-records.json)にあります。

**task台帳 `data/project-status.json`**（`main` の `624124cf` と現在の比較）

| 項目 | `main`（2026-10-05 04:20） | 現在 |
| --- | --- | --- |
| マイルストーン | SIM/eSIM起点のRockstarOSサービス利用開始と料金透明化を実装・受入 | AMC: Sky／ZemaのGoal台帳と明示起動のローカルCodex一件実行入口 |
| `SIM01` 物理SIM/eSIM購入からRockstarOS・Sky/Zema・Agentへの一度きり認証と端末別利用開始を通す | 進行中（証拠284件） | **台帳に無い** |
| `SKY21` Sky独立サービスの基本利用・作者市場・有料販売・OS/他アプリ接続を証拠別に受け入れる | 進行中 | **台帳に無い** |
| `B06` ココナラ代表受注・制作担当者への個別発注と入出金を安全に管理 | 進行中 | **台帳に無い**（`WEB06`・`FB06` の記述からは参照されている） |
| `G04` 重複するAI・MCP・保存・決済・Sky/Zema契約を共通化し、19 PRをmainへ統合 | 進行中 | **台帳に無い** |
| `AI02`〜`AI06` | 進行中 | 予定（コードは入っている） |
| `MAT15` R5単体の裸眼空間表示・安全・精密3D入力 | 予定 | 進行中 |
| 準備記録（`esimDevelopment`、`cloudContinuationPreparation`、`satelliteConnectivityPreparation`、`agentInterconnectionPreparation`、`skyStandalonePublication`、`avocadoMiniCustomDomain`、`patentResearch` など） | 23件 | **台帳に無い** |

現在の台帳には、題名にSIMまたはeSIMを含むtaskがありません。[仕様変遷](spec-history.md)のとおり、2026-10-02以降の主商品はSIM/eSIM起点のサービスなので、台帳と製品方針が食い違っています。

**PR側だけにあったtask**（2026-10-05 01:42〜01:49の取り込みで、台帳は現行側が残った）

| task | 内容 | 状態（PR側） | 元 |
| --- | --- | --- | --- |
| `WEB20` | 本人決定（2026-09-25 00:49）により、公開avocadoMini／avokadoProの構成と参考価格（¥160,000・¥410,000・From ¥880,000／US$5,800、税・送料別）を正式として台帳へ反映 | 完了 | `846f3950` |
| `DOC05` | PR・task・配備記録なしで `main` へ直接入った5コミットを証拠へ記録 | 完了 | `846f3950` |
| `AI09` | 本人決定（2026-09-25 01:26）: Core offline仕事loopとGame最小loopを、OS10完了前にhost／fixture段階で先行してよい | 完了（`846f3950` では判断待ち） | `b37c52a6` |
| `WEB21` | 外部製品名（PR #40の「avokado mini」改名案）を決める | 停止中: OWNER判断待ち | `846f3950` |
| `BIL04` | 保留中の8.88 USD収益料金の後継条件を決める | 停止中: OWNER判断待ち | `846f3950` |
| `CAMPUS01` | 大学別Campusレイヤーの実装 | 完了 | `29202ae6` |
| `GM01` | 決定的2D粒子sandbox（AI06から切り出し） | 進行中 | `78638565` |

`WEB20` に対応する `data/product-baseline.json` の `marketPositioning.publicProductLine`（owner確認済みの製品ラインと参考価格）も現在の台帳にありません。文章の側は[製品ベースの2026-09-25の節](product-baseline.md)へ戻してあります。

**設計台帳 `data/design-document-index.json`**

`main` の `624124cf` には末端の項目が871個ありましたが、現在は312個です。`main` にしかない項目は624個で、内訳は `security_operator_release` 86、`sky_zema_and_tools` 77、`mcp_and_providers` 45、`linux_qemu` 41、Toolごとの実装・試験の対応（法務受付29、特許29、CSV 22、AMC 21、ココナラ19、IP Studio 12、Markets 11）、接続復旧・料金見積・ライブラリ統合などの準備記録13件です。`npm run design:check` は現在の（古い側の）台帳と検査スクリプトの組で通っています。

```sh
git show 624124cf:data/design-document-index.json
git show 624124cf:data/project-status.json
git diff 624124cf 0fbf688b -- data/design-document-index.json data/project-status.json
```

### 4.2 コードと試験

今回調べたのは文書（`*.md`）と上の台帳だけです。**コードの中身は比べていません。** 2.2節の表のうち、統合のあと一度も変更されていないコードと試験は次の9件で、`main` 側の変更が入っていない可能性があります。

| ファイル | `main` 側が祖先から変えた量 | `main` と現在の差 |
| --- | --- | --- |
| `components/amc-tool-runner.tsx` | +1,773 | +24 / −90 |
| `components/amc-tool-runner.module.css` | +585 | −24 |
| `lib/zema-chat-session.ts` | +11 / −11 | +43 / −19 |
| `scripts/check-llm-architecture.mjs` | +7 / −3 | +21 / −12 |
| `app/amc/page.tsx` | +2 | +21 / −2 |
| `lib/sky-routing.ts` | +5 / −2 | +9 / −3 |
| `tests/sky-routing.test.mjs` | +7 / −3 | +9 / −8 |
| `tests/mini200-e1-docs.test.mjs` | +2 / −1 | +4 / −2 |
| `tests/avocado-r5-docs.test.mjs` | +3 / −3 | +3 / −3 |

`tests/mini200-e1-docs.test.mjs` は、`main` では README に `SIM/eSIM-led access to RockstarOS services` があることを検査していましたが、現在は古い側の `begins with games and connects creation, learning, and everyday action …` を検査しています（5節の4）。

その後に変更があった22件（`components/sky-workspace.tsx` は `main` との差が +554 / −179）も、`main` 側の変更がすべて戻っているとは限りません。確認するには次を使います。

```sh
git diff 624124cf 0fbf688b -- <ファイル>
```

### 4.3 並行ブランチで番号が重なった要望

2026-09-12〜09-15に、別々のブランチが `docs/product-baseline.md` へ同じ番号で別の要望を追加していました（RQ18、RQ26が2種類、RQ27、RQ32〜RQ34）。統合で残らなかった7節は、現在のRQと番号が対応しないため製品ベースへは戻していません。全文は[保管庫の末尾](merge-loss-audit-20261007/dropped-text.md#並行ブランチで書かれ番号が重なって落ちた要望全文)にあり、内容が近い現行の要望を添えています。経緯は[仕様変遷](spec-history.md)にも書きました。

### 4.4 生成される文書

`docs/database-status.md`、`docs/workstreams/README.md` と `README.md` の進捗の1行、`project.md` のtask表は、台帳からスクリプトで作られます。台帳を戻せば作り直されるので、文書としては戻していません。

### 4.5 書き直されて残っている文

353行は、同じ文が数字や言い回しを変えて現在の文書に残っています（例: 「5役」→「6役」→「13役」、同梱物のcommit、進捗の件数）。古い言い回しは戻していません。件数の多いファイルは `project.md` 125、`docs/database-status.md` 53、`docs/product-baseline.md` 32、`README.md` 28、`docs/workstreams/README.md` 26です。

### 4.6 現在の文書にも保管庫にも置いていないもの

- 25文字未満の行（見出しだけの差、表の区切りなど）。
- 統合を経ずに、通常のコミットで書き換え・削除された内容。これは意図した編集として扱い、調べていません。

## 5. ownerに決めてほしいこと

1. **task台帳を `main` の内容へ戻すか。** 少なくとも `SIM01`・`SKY21`・`B06`・`G04` の4件、`AI02`〜`AI06` の状態、マイルストーン。戻す場合は部隊への割り当て（`data/mission-control.json`）も必要です。
2. **設計台帳 `data/design-document-index.json` を `main` の内容へ戻すか。** 検査スクリプトと組で戻す必要があります。
3. **PR側だけにあった決定の記録を台帳へ入れるか。** `WEB20`（2026-09-25 00:49の製品ラインと参考価格）、`AI09`（2026-09-25 01:26の先行許可）、判断待ちの `WEB21`（製品名）と `BIL04`（8.88 USDの後継）。
4. **READMEの最初の見出しをどちらにするか。** `main` は2026-10-05まで「One SIM/eSIM. One Rockstar account. …」でした。現在は統合で戻った「From playing to making. …」のままにし、SIM/eSIM起点の説明は本文の最初の事業の節へ戻してあります。見出しを変える場合は `tests/mini200-e1-docs.test.mjs` の期待値も合わせて変えます。
5. **コードの差を確認するか。** 4.2節の9件と、その後に変更があった22件。
6. **avokadoProの価格。** 2026-09-25の決定と公開Siteは「From ¥880,000」、2026-10-05のPro PC設計とREADMEは「JPY800,000 sales target」です。どちらが現行かを決めると、[仕様変遷](spec-history.md)の表も確定できます。

## 6. 調べ方と限界

- 履歴上のすべての統合154件について、それぞれの親が共通の祖先から足した行のうち、統合後のファイルに無い行を集めました（`*.md` のみ、25文字以上）。
- その行が現在のファイルにあるか、ほかのファイルにあるか、似た行が同じファイルにあるか（一致率55%以上）、どこにも無いかで分けました。
- 行の一致で調べているので、段落の並べ替えや表の列の変更は「落ちた」と数えることがあります。逆に、短い行の欠落は拾えません。
- 件数は `0fbf688b` と、この整理のあとの作業ツリーを比べたものです。

原文を確かめるには、落ちた側のcommitを指定します。

```sh
git show 624124cf:README.md          # 2026-10-05の統合の直前のmain
git show 624124cf:project.md
git log --merges --format='%h %ad %s' --date=short   # 統合の一覧
```

## 7. 添付

| ファイル | 内容 |
| --- | --- |
| [`merge-loss-audit-20261007/dropped-text.md`](merge-loss-audit-20261007/dropped-text.md) | どの文書にも残っていない行の原文（統合ごと、486行）、番号が重なって落ちた要望7節の全文、READMEで英語にした日本語の原文、今回の整理で新しい版へ置き換えた行の原文（45行） |
| [`merge-loss-audit-20261007/ledger-records.json`](merge-loss-audit-20261007/ledger-records.json) | 台帳から消えたtask 4件、状態が変わった6件、準備記録23件、PR側だけのtask 7件（`AI09` は2つの版）、`publicProductLine` の控え |
