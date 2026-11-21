# Codex タスク一覧（2026-11-02）

1 タスク = 1 ファイル = 1 PR。番号順が推奨順。各ファイルの「やらないこと」は守る。
終わったら CHANGELOG.md 先頭に 1 行、ここに ✅ と PR 番号。

## 00 番台: リポの整理（先にやる）

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 01 | [01-archive-evidence-workspaces.md](01-archive-evidence-workspaces.md) | docs/evidence・workspaces を archive へ、check script のパス修正 | |
| 02 | [02-verify-slim.md](02-verify-slim.md) | `verify` を typecheck+lint+product tests に、旧チェーンは `verify:full` | |
| 03 | [03-naming-display-strings.md](03-naming-display-strings.md) | Smith→Noa 等、表示文字列と md | |
| 04 | [04-naming-code-identifiers.md](04-naming-code-identifiers.md) | 識別子・ファイル名の改名 | |
| 05 | [05-readme-agents-maintenance.md](05-readme-agents-maintenance.md) | README/AGENTS/CHANGELOG の維持規則、商標確認 | |
| 06 | [06-drizzle-unify.md](06-drizzle-unify.md) | drizzle 3 ディレクトリを 1 本に | |
| 07 | [07-codex-bots-slim.md](07-codex-bots-slim.md) | .codex/agents の bot を役割に合わせ整理 | |
| 08 | [08-sky-lib-foldering.md](08-sky-lib-foldering.md) | lib/sky-*.ts 104 本を lib/sky/ 配下へ | |

## 10 番台: eSIM（配布できるもの）

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 10 | [10-esim-provider-research.md](10-esim-provider-research.md) | ARF 対応 MVNE 候補比較と RFQ 質問票 | |
| 11 | [11-esim-first-live.md](11-esim-first-live.md) | esim-go sandbox → Eve 起動 → account 束縛 → Stripe 月額 | ✅ Noahの0円模擬回線・成果受取（PR #378）。実回線は未受入 |
| 12 | [12-android-carrier-client.md](12-android-carrier-client.md) | carrier privileges を使う Android client と Play 自動導入 | |
| 13 | [13-ios-universal-link.md](13-ios-universal-link.md) | iOS universal link 導入と PWA 起動 | |

## 20 番台: mii

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 20 | [20-mii-architecture-research.md](20-mii-architecture-research.md) | Tower/Hub/表示層の部品候補・工場・BOM の調査（価格は決めない） | |
| 21 | [21-mii-motion-parallax-prototype.md](21-mii-motion-parallax-prototype.md) | Gen1 試作: 1 プロジェクター＋1 壁＋頭追跡 | |
| 22 | [22-mii-hardware-profile.md](22-mii-hardware-profile.md) | targets/avocado-mini → targets/mii、4 筐体（column/puck/slot/**ceiling**）の profile 記述 | |
| 23 | [23-mii-v2-into-design.md](23-mii-v2-into-design.md) | V2 研究と第 1 形態（v2-study 20・37〜45）を設計書 V1 に反映。**本人承認後** | |

## 30 番台: RockstarOS 共通層

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 30 | [30-account-continuity.md](30-account-continuity.md) | 別端末で同じ Job / 会話を続ける契約とテスト | |
| 31 | [31-hardware-profiles.md](31-hardware-profiles.md) | phone / pro / pixel-native profile と Buildroot・Android 系の対応表 | |
| 32 | [32-service-template-first-three.md](32-service-template-first-three.md) | サービス書式で最初の 3 枚（ヨガ・工場保守・請求書） | |
| 33 | [33-sky-recipe-planner-wiring.md](33-sky-recipe-planner-wiring.md) | Sky recipe planner を Eve の依頼へつなぐ（正規表現の振り分けは受け皿に） | |
| 34 | [34-company-order-first-loop.md](34-company-order-first-loop.md) | 会社受注を 1 件、保存・画面・分配の計算まで通す | |
| 35 | [35-gig-desk-screen.md](35-gig-desk-screen.md) | 参加者の画面: 受取額、確認の問い、答えの集計と保存 | |
| 36 | [36-mr-gig-upstream-sync.md](36-mr-gig-upstream-sync.md) | Mr. の gig を上流の最新へ同期（対象 repo は k999ln/Mr.） | |
| 37 | [37-lane-runner-bridge.md](37-lane-runner-bridge.md) | apply lane の判断を Sky の gig-desk につなぐ | |

## 40 番台: 統合

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 40 | [40-jennifer-into-amc.md](40-jennifer-into-amc.md) | Jennifer のコード・docs・data を AMC へ統合 | |

## 60番台: Noah公開

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 69 | [69-noah-public-timeline.md](69-noah-public-timeline.md) | 統合タイムラインの公開とGit保存 | ✅ 公開v144・ヘッダー検証済み・[PR #319](https://github.com/k999ln/rock/pull/319) |

| 70 | [70-noah-route-unification.md](70-noah-route-unification.md) | 旧画面とNoahの統合・404修正 | ✅ 公開版149・Eveヘッダー確認済み・[PR #320](https://github.com/k999ln/rock/pull/320) |

| 71 | [71-noah-standalone-launch.md](71-noah-standalone-launch.md) | 登録・独立審査・別ユーザーの実行・Mac配布 | 進行中・[PR #322](https://github.com/k999ln/rock/pull/322)公開済み・登録認証導線修正✅ [PR #324](https://github.com/k999ln/rock/pull/324)・本人Macの仕事詳細・配布Runnerの受入 ✅ [PR #366](https://github.com/k999ln/rock/pull/366)・CowAgent検索流入ガイドの実装とローカル確認 ✅ [PR #369](https://github.com/k999ln/rock/pull/369)・本番通し/別Mac未確認 |

| 72 | [72-current-code-and-readme.md](72-current-code-and-readme.md) | 最新コードとREADMEの整理・検証・GitHub統合 | ✅ [PR #321](https://github.com/k999ln/rock/pull/321)・[PR #325](https://github.com/k999ln/rock/pull/325) |
| 73 | [73-current-product-consolidation.md](73-current-product-consolidation.md) | 機能を保った重複・類似処理と現行説明の統合 | ✅ [PR #326](https://github.com/k999ln/rock/pull/326)・[PR #362](https://github.com/k999ln/rock/pull/362) |
| 98 | [98-product-cleanup.md](98-product-cleanup.md) | miiの商品案内・画像と旧画面の整理 | ✅ [PR #327](https://github.com/k999ln/rock/pull/327) |
| 99 | [99-readme-entrypoints.md](99-readme-entrypoints.md) | READMEからNoah公開版・Mac・miiの作業先を選ぶ | ✅ [PR #331](https://github.com/k999ln/rock/pull/331)・[PR #333](https://github.com/k999ln/rock/pull/333)・[PR #336](https://github.com/k999ln/rock/pull/336)・[PR #338](https://github.com/k999ln/rock/pull/338)・[PR #340](https://github.com/k999ln/rock/pull/340)・[PR #341](https://github.com/k999ln/rock/pull/341)・[PR #348](https://github.com/k999ln/rock/pull/348) |

## 70〜90番台: Noah — mii へ進む最小構成（2026-11-20）

設計は [docs/noah-design.md](../../docs/noah-design.md)（全体）。**実装は、task 1 枚 → その [実装仕様書](../../docs/noah/README.md) 1 本（84・85・96・86・87・74・88・89・90・97 にある）を見て進める。** 仕様書に、今あるコードのどのファイル・関数をどう変えるか、規則の全表、画面と文言、処理の順、試験がある。通信しない処理は [docs/contracts/](../../docs/contracts/) に動く参照実装があり、書き直さずに `lib/` へ移す。試験は [docs/design-validation/noah/](../../docs/design-validation/noah/README.md) から移す。仕様書がまだ無い task は [docs/noah-detailed-design.md](../../docs/noah-detailed-design.md)（詳細設計書）の章を見る。その 0 章が実装する Agent への指示、17 章が task と章の対応、18 章が本人の決定待ちの既定値。背景と費用の計算は [docs/noah-agent-market-design.md](../../docs/noah-agent-market-design.md)。**番号順ではなく、下の「順」の順に進める。** 段階 0 は main の方針（最初の完成条件は本人の Mac 上の Noah）。段階 1 は Mac の受入と並べて進められる。75・91 は個別の残件で、本人の許可（契約・月の上限）が先。83 は署名と配布、87 はモデルの出どころ、78 は Stripe の sandbox、80 の 0 クリックと 81 の並び順は本人の確認が先。

**ローンチまでにやるのは、「ローンチ」の列に L1〜L9 がある行の、各 task の「ローンチまで」の範囲だけ。** 線の引き方・作る順・出す前に確かめる事は [docs/noah/mvp-launch.md](../../docs/noah/mvp-launch.md)（本人指示 11-20: ローンチするのに最小限）。L の順に 1 PR ずつ進める（L1 と L2 は並べてよい。L8 は L3 の後ならいつでも）。「—」の行と、各 task の「やらない（出した後）」は、出した後。

| 順 | ローンチ | # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 0 | （今の Mac の道。受入の残り） | 71 | [71-noah-standalone-launch.md](71-noah-standalone-launch.md) | 最小構成: 本人の Mac で、選ぶ・接続・実行・成果の受け取り・停止 | 進行中（上の表） |
| 0 | L1 | 84 | [84-noah-screenless-rule.md](84-noah-screenless-rule.md) | 画面を取らない決まりと検査、面の見分け |✅ L1 実装・ローカル検証 [PR #329](https://github.com/k999ln/rock/pull/329)（未マージ・CI履歴検出あり）。面の分類・実機観測は後続 |
| 1 | L3 | 85 | [85-noah-intake-ledger.md](85-noah-intake-ledger.md) | 外の台帳の取り込みと名寄せ、接続要件の下書き | ✅ L3 実装・ローカル受入 [PR #332](https://github.com/k999ln/rock/pull/332)（L2 #330 を base、未マージ・CI履歴検出あり）。点検の修正 [PR #339](https://github.com/k999ln/rock/pull/339)（#332 を base、未マージ） |
| 1 | L2・L5 | 96 | [96-noah-connect-plan.md](96-noah-connect-plan.md) | 接続要件 `noah-connect/1` と接続計画（純関数）、カードの手数表示 |✅ L2 実装・ローカル検証 [PR #330](https://github.com/k999ln/rock/pull/330)（未マージ・CI履歴検出あり）。✅ L5: 計画の API とカード（`noah-card.tsx`）を実装・ローカル検証済み [PR #342](https://github.com/k999ln/rock/pull/342)（未マージ）。今ある 13 件（Mac の道）への組み込みは、出した後 |
| 1 | L4 | 86 | [86-noah-remote-mouth.md](86-noah-remote-mouth.md) | リモートの口（MCP・Space・相手の許可）と L1 の接続試験 | ✅ L4 実装・手元の受入 [PR #335](https://github.com/k999ln/rock/pull/335)（L3 の点検の修正 #339 を base、未マージ）。相手の許可（OAuth）・Space は、出した後 |
| 1 | L6 | 87 | [87-noah-tool-agent.md](87-noah-tool-agent.md) | 道具を持つ担当（入力欄で頼む・1 文で頼む） | ✅ L6（入力欄で頼む）実装・手元の受入 [PR #344](https://github.com/k999ln/rock/pull/344)（L5 の #342 を base、未マージ。本番への適用なし）: migration 0048・依頼の API・実行・画面。読み取りだけと宣言されていない実在の道具は、呼んでいない（確かめの画面まで）。成果を「成果データ」「実行中」に出す所は、2026-11-21 に [PR #352](https://github.com/k999ln/rock/pull/352) で足した（書き出し・運営への提供は、まだ）。1 文で頼むは、出した後 |
| 1 | L5 | 74 | [74-noah-one-click-connect.md](74-noah-one-click-connect.md) | 接続の API、その場のサインイン、Passport、切る | ✅ L5 実装・手元の受入 [PR #342](https://github.com/k999ln/rock/pull/342)（未マージ。本番への適用なし）: migration 0047・接続の API・道具の一覧の API・画面（`/noah/ready`・`/noah/ready/agent`）・その場のサインイン・探す画面の入口。手元の実物（幅 390）で「接続」1 回 →「頼む」を確かめた。出す場所とサインインの扱いは、既定で作った（本人確認待ち）。Passport・家の端末・相手の許可は、出した後。2026-11-21: カードと詳細に利用人数 [PR #356](https://github.com/k999ln/rock/pull/356) |
| 1 | L7 | 88 | [88-noah-mass-probe.md](88-noah-mass-probe.md) | 大量の接続試験と見回り、つながると確かめた数 | ✅ L7（見回りを保つ）実装・手元の受入 [PR #345](https://github.com/k999ln/rock/pull/345)（L6 の #344 を base、未マージ。本番への適用なし）: 止まった依頼と接続の後始末・道具を呼ぶ直前の「相手へ送る」の印・つながると確かめた数・索引を足す migration 0049。自動の見本（`probeL2`・`noahSampleCalls`）は作っていない（出した後） |
| 1 | — | 89 | [89-noah-terminal-mouth.md](89-noah-terminal-mouth.md) | ターミナルの口（ACP・MCP の package）。今ある Mac の隔離環境で | |
| 2 | L9 | 90 | [90-noah-phone-only-loop.md](90-noah-phone-only-loop.md) | 手元だけの一周（PC の前に座らない受入）。出してよいかの判定 | ✅ L9（受入）の自動の試験と、手元での表の通し [PR #347](https://github.com/k999ln/rock/pull/347)（L8 の #346 を base、未マージ。**本番での確かめは、まだ**）: 一周の自動試験 `tests/noah-phone-loop.test.mjs`、画面の決まりを一周の全部の段で見る試験、実機の表の手元の結果（`spec-90` の 9.4）。表の通しで見つけた所を 1 つ直した（切った後も、Agent の詳細の「仕事」に成果を出す。`GET /api/noah/ask?agent=`）。残り: 本番で、スマホだけで、表の 1〜13（本人の許可の後） |
| 2 | L8 | 97 | [97-noah-launch-ops.md](97-noah-launch-ops.md) | 出すための運用: 巡回を起こす Worker、切り替え、取り下げの窓口、見張る数、戻し方 | ✅ L8（出すための運用）実装 [PR #346](https://github.com/k999ln/rock/pull/346)（L7 の #345 を base、未マージ。**本番への配備・適用・切り替えなし**）: 運営の画面の「見張る数」（`lib/noah-launch-status.ts`）、`/noah/help` の `#bot` の節（`lib/noah-bot-notice.ts`。宛先 D8 は 2026-11-21 に本人が smash@avoado.si と決め、[PR #350](https://github.com/k999ln/rock/pull/350) で入れた）、専用の Worker の手順書（`services/noah-patrol-wake/README.md`）、試験 `tests/noah-launch-ops.test.mjs`（切り替え・合図・窓口の文・上限の上書き・見張る数・戻し方・記録・適用する物の形）。残り: 本番での G4〜G6 の確かめ（L9・本人の許可の後） |
| 2 | — | 83 | [83-noah-mac-installer.md](83-noah-mac-installer.md) | 専用の端末（家）: 今ある Mac を、座らずに使える端末にする | |
| 2 | — | 92 | [92-noah-standing-work.md](92-noah-standing-work.md) | 継続して任せる（予定を account に置く） | |
| 2 | — | 94 | [94-noah-usage-three-views.md](94-noah-usage-three-views.md) | 利用の記録を 1 か所に（利用者・提供者・運営） | |
| 3 | — | 81 | [81-noah-connect-patrol.md](81-noah-connect-patrol.md) | 作者の引き取り、取り下げ、並び順 | |
| 3 | — | 76 | [76-eve-build-autofill.md](76-eve-build-autofill.md) | 載せる 1 画面と自動入力（見分ける） | |
| 3 | — | 77 | [77-eve-build-normalize.md](77-eve-build-normalize.md) | 整える・接続試験と接続証明・機械審査 | |
| 3 | — | 78 | [78-noah-agent-purchase.md](78-noah-agent-purchase.md) | 試用、仮売上 → 接続の確認 → 確定、直した版の権利 | |
| 3 | — | 93 | [93-noah-library-lifecycle.md](93-noah-library-lifecycle.md) | 入れ替える（更新・戻す・切る・移す） | |
| 4 | — | 95 | [95-noah-on-mii-contract.md](95-noah-on-mii-contract.md) | mii で使うための契約（Linux の host で同じ受入、声と表示の模擬） | |
| 並行 | — | 75 | [75-noah-own-device-cloud.md](75-noah-own-device-cloud.md) | 専用の端末（雲）: 端末を持たない人の置き場所 | |
| 並行 | — | 91 | [91-noah-device-browser.md](91-noah-device-browser.md) | 専用の端末の中のブラウザと画面、のぞく | |
| 並行 | — | 79 | [79-noah-mobile-variant.md](79-noah-mobile-variant.md) | スマホ内版（宣言型への圧縮と実機の確認） | |
| 並行 | — | 80 | [80-eve-to-noah.md](80-eve-to-noah.md) | 担当を載せる、Eve で改良、0 クリック | |
| 並行 | — | 82 | [82-noah-provider-place.md](82-noah-provider-place.md) | 提供者サーバー型（利用権の受け渡し、A2A、許可の再利用） | |

調査した残り 72 件を 1 件ずつ実行器で対応する作業は行わない（分類は [docs/noah-agent-census-20261120.md](../../docs/noah-agent-census-20261120.md)）。13 / 85 などの限定試験を、全体の合格と数えない。

## 本人の追加指示

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 99 | [99-noah-result-data.md](99-noah-result-data.md) | 成果の本人用検索・出力と同意付き運営提供・撤回 | ✅ PR #334 |
| 100 | [100-noah-standalone-ui.md](100-noah-standalone-ui.md) | Noahの専用UI・登録Agent・利用人数/王冠/コメント・実行中タブ・接続案内・開発者向けメール相談 | ✅ PR #337 |

## 110 番台: Noah — 棚とパッケージ、300 人の試行（2026-11-21）

本人の決定（11-19〜21。[07](../../docs/structure/07-decisions-from-minutes.md)）: 領域ごとのパッケージ、1 つの仕事を最後までやる組合せ、今動かせる物だけ、入口の棚は「稼ぐ・仕事を省く」「教育」「暮らし」、無料は 6 枚までつなげる、まず 300 人に試してもらう。設計は [docs/noah/spec-110-shelf.md](../../docs/noah/spec-110-shelf.md)（110〜113 が、同じ仕様書の章を分けて使う）と [docs/noah/trial-300.md](../../docs/noah/trial-300.md)（114）。型契約と参照実装は docs/contracts/noah-shelf-v1.ts、試験は docs/design-validation/noah/noah-shelf.test.mjs と validate-noah-shelf-v1.py。

| 順 | ローンチ | # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 1 | L5・L8 に足す | 110 | [110-noah-shelf.md](110-noah-shelf.md) | 棚とカード: カードの形、載せる条件（今動かせる物だけ）、運営が動かして確かめる、`/noah/ready` の棚、運営の画面 |✅ [#353](https://github.com/k999ln/rock/pull/353) |
| 2 | —（出した後） | 111 | [111-noah-shelf-rank.md](111-noah-shelf-rank.md) | 実績の並び（学習なし）、見せた記録、カードをタイムラインへ流す |✅ [#355](https://github.com/k999ln/rock/pull/355) |
| 2 | —（出した後） | 112 | [112-noah-package-chains.md](112-noah-package-chains.md) | 家の端末のカード、工程をつなぐカード、札の候補、工程の計画へのつなぎ | |
| 2 | —（出した後） | 113 | [113-noah-plan-limits.md](113-noah-plan-limits.md) | つなげる数を料金ごとに（無料 6 枚・有料 50 枚。数えるのはカード） |✅ [#357](https://github.com/k999ln/rock/pull/357) |
| 2 | 出した直後 | 114 | [114-noah-trial-300.md](114-noah-trial-300.md) | 300 人の試行: 経路の札、段を終えたかの判定、本人の報告（売れた件数・手取り・掛けた分） |✅ [#354](https://github.com/k999ln/rock/pull/354) |
| 3 | 一般公開の時に出る | 115 | [../../docs/noah/spec-115-pin-grid.md](../../docs/noah/spec-115-pin-grid.md) | ピンタレスト風のホーム: 今動かせる Agent のグリッド、ボードへ保存・公開・フォロー、学習なしの並び（X の作りの形・Reddit hot・Pixie） | |

カードを動かして確かめる事（[カード案](../../docs/services/noah-shelf.md) の 12 枚）、投稿・動画・人への連絡、切り替えを開ける事、本番の migration は、task ではなく本人と運営の作業。
