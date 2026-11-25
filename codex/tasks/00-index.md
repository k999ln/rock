# Codex タスク一覧（進捗照合: 2026-11-23）

1 タスク = 1 ファイル = 1 PR。番号順が推奨順。各ファイルの「やらないこと」は守る。
終わったら CHANGELOG.md 先頭に 1 行、ここに ✅ と PR 番号。


進捗の正本は `iceiceice999/rock`。2026-11-23 に main `16a9eae6dac5a40ab0f1bfacc4ecad2de9e34617` と GitHub PR/CI を照合した。現在の開発項目と残件は [project.md](../../project.md)。✅ は記載した範囲の確認済みを表し、タスク全体・全Agent・一般公開の合格を意味しない。空欄は未照合であり、未着手と断定しない。

旧PR #342・#344〜#347 は未マージで閉じられているが、そのHEADは現在のmainの祖先に含まれる。旧PRの状態と、コードのmain統合を区別する。過去のCI履歴検出を現在の失敗として扱わず、対象SHAの検証結果を参照する。

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
| 11 | [11-esim-first-live.md](11-esim-first-live.md) | eSIM発行・導入証明 → 端末利用権 → Eve／Noahへ。回線月額の照合 | 導入設計整理済み。実回線・実機受入は未完了。✅ Noahの0円模擬回線・成果受取（PR #378）。運営Dockの指定配給・本人受取（模擬環境）と朝9時の開発指示 ✅ [#382](https://github.com/k999ln/rock/pull/382)。✅ 住所登録・ロット在庫・通知Agent・定期配給を模擬回線で検証（[PR #387](https://github.com/k999ln/rock/pull/387)）。✅ 購入履歴から設定を再開し、利用権を照合して案内（[PR #389](https://github.com/k999ln/rock/pull/389)） |
| 12 | [12-android-carrier-client.md](12-android-carrier-client.md) | carrier privileges を使う Android client と Play 自動導入 | |
| 13 | [13-ios-universal-link.md](13-ios-universal-link.md) | iOS universal link 導入と PWA 起動 | コード [#372](https://github.com/k999ln/rock/pull/372)（main への統合は [PR #412](https://github.com/k999ln/rock/pull/412)。iPhone実機確認は未実施） |

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

| 71 | [71-noah-standalone-launch.md](71-noah-standalone-launch.md) | 登録・独立審査・別ユーザーの実行・Mac配布 | 進行中・[PR #322](https://github.com/k999ln/rock/pull/322)公開済み・登録認証導線修正✅ [PR #324](https://github.com/k999ln/rock/pull/324)・OS独立UI/専用認証・公開版156・172件取込・本番読み取り専用1件の成果受領✅ [PR #358](https://github.com/k999ln/rock/pull/358)・本人Macの仕事詳細・配布Runner受入✅ [PR #366](https://github.com/k999ln/rock/pull/366)・CowAgent検索流入ガイドの実装とローカル確認 ✅ [PR #369](https://github.com/k999ln/rock/pull/369)。Pixelの限定登録・成果再表示は [PR #10](https://github.com/iceiceice999/rock/pull/10) で確認済み。別利用者・別Macと任意サービスの登録は未確認 |

| 72 | [72-current-code-and-readme.md](72-current-code-and-readme.md) | 最新コードとREADMEの整理・検証・GitHub統合 | ✅ [PR #321](https://github.com/k999ln/rock/pull/321)・[PR #325](https://github.com/k999ln/rock/pull/325) / ✅ 11-23進捗台帳の更新 [PR #20](https://github.com/iceiceice999/rock/pull/20)（最終CIと統合状態はPR参照） |
| 73 | [73-current-product-consolidation.md](73-current-product-consolidation.md) | 機能を保った重複・類似処理と現行説明の統合 | ✅ [PR #326](https://github.com/k999ln/rock/pull/326)・[PR #362](https://github.com/k999ln/rock/pull/362) |
| 98 | [98-product-cleanup.md](98-product-cleanup.md) | miiの商品案内・画像と旧画面の整理 | ✅ [PR #327](https://github.com/k999ln/rock/pull/327) |
| 99 | [99-readme-entrypoints.md](99-readme-entrypoints.md) | READMEからNoah公開版・Mac・miiの作業先を選ぶ | ✅ [PR #331](https://github.com/k999ln/rock/pull/331)・[PR #333](https://github.com/k999ln/rock/pull/333)・[PR #336](https://github.com/k999ln/rock/pull/336)・[PR #338](https://github.com/k999ln/rock/pull/338)・[PR #340](https://github.com/k999ln/rock/pull/340)・[PR #341](https://github.com/k999ln/rock/pull/341)・[PR #348](https://github.com/k999ln/rock/pull/348) |

## 70〜90番台: Noah — mii へ進む最小構成（2026-11-20）

設計は [docs/noah-design.md](../../docs/noah-design.md)（全体）。**実装は、task 1 枚 → その [実装仕様書](../../docs/noah/README.md) 1 本（84・85・96・86・87・74・88・89・90・97 にある）を見て進める。** 仕様書に、今あるコードのどのファイル・関数をどう変えるか、規則の全表、画面と文言、処理の順、試験がある。通信しない処理は [docs/contracts/](../../docs/contracts/) に動く参照実装があり、書き直さずに `lib/` へ移す。試験は [docs/design-validation/noah/](../../docs/design-validation/noah/README.md) から移す。仕様書がまだ無い task は [docs/noah-detailed-design.md](../../docs/noah-detailed-design.md)（詳細設計書）の章を見る。その 0 章が実装する Agent への指示、17 章が task と章の対応、18 章が本人の決定待ちの既定値。背景と費用の計算は [docs/noah-agent-market-design.md](../../docs/noah-agent-market-design.md)。**番号順ではなく、下の「順」の順に進める。** 段階 0 は main の方針（最初の完成条件は本人の Mac 上の Noah）。段階 1 は Mac の受入と並べて進められる。75・91 は個別の残件で、本人の許可（契約・月の上限）が先。83 は署名と配布、87 はモデルの出どころ、78 は Stripe の sandbox、80 の 0 クリックと 81 の並び順は本人の確認が先。

**ローンチまでにやるのは、「ローンチ」の列に L1〜L9 がある行の、各 task の「ローンチまで」の範囲だけ。** 線の引き方・作る順・出す前に確かめる事は [docs/noah/mvp-launch.md](../../docs/noah/mvp-launch.md)（本人指示 11-20: ローンチするのに最小限）。L の順に 1 PR ずつ進める（L1 と L2 は並べてよい。L8 は L3 の後ならいつでも）。「—」の行と、各 task の「やらない（出した後）」は、出した後。

| 順 | ローンチ | # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 0 | （今の Mac の道。受入の残り） | 71 | [71-noah-standalone-launch.md](71-noah-standalone-launch.md) | 最小構成: 本人の Mac で、選ぶ・接続・実行・成果の受け取り・停止 | 進行中（上の表） |
| 0 | L1 | 84 | [84-noah-screenless-rule.md](84-noah-screenless-rule.md) | 画面を取らない決まりと検査、面の見分け | ✅ L1コードを現mainへ統合（旧 [PR #329](https://github.com/k999ln/rock/pull/329)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。面の分類・実機観測は残り |
| 1 | L3 | 85 | [85-noah-intake-ledger.md](85-noah-intake-ledger.md) | 外の台帳の取り込みと名寄せ、接続要件の下書き | ✅ L3と点検修正を現mainへ統合（旧 [PR #332](https://github.com/k999ln/rock/pull/332)・[PR #339](https://github.com/k999ln/rock/pull/339)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。現行収集の運用残件はtask125-scout |
| 1 | L2・L5 | 96 | [96-noah-connect-plan.md](96-noah-connect-plan.md) | 接続要件 `noah-connect/1` と接続計画（純関数）、カードの手数表示 | ✅ L2・L5コードを現mainへ統合（旧 [PR #330](https://github.com/k999ln/rock/pull/330)・[PR #342](https://github.com/k999ln/rock/pull/342)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開MCPの接続・保存は [PR #7](https://github.com/iceiceice999/rock/pull/7) で限定本番受入。全接続先の受入ではない |
| 1 | L4 | 86 | [86-noah-remote-mouth.md](86-noah-remote-mouth.md) | リモートの口（MCP・Space・相手の許可）と L1 の接続試験 | ✅ L4コードを現mainへ統合（旧 [PR #335](https://github.com/k999ln/rock/pull/335)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開MCP/Gradioの対応拡張は [PR #7](https://github.com/iceiceice999/rock/pull/7)。OAuth・全掲載対応は継続 |
| 1 | L6 | 87 | [87-noah-tool-agent.md](87-noah-tool-agent.md) | 道具を持つ担当（入力欄で頼む・1 文で頼む） | ✅ L6と成果表示を現mainへ統合（旧 [PR #344](https://github.com/k999ln/rock/pull/344)・[PR #352](https://github.com/k999ln/rock/pull/352)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開MCPで入力・実処理・保存・再表示を本番確認 [PR #7](https://github.com/iceiceice999/rock/pull/7)。全Agent受入・1文で頼む経路は別 |
| 1 | L5 | 74 | [74-noah-one-click-connect.md](74-noah-one-click-connect.md) | 接続の API、その場のサインイン、Passport、切る | ✅ L5コードを現mainへ統合（旧 [PR #342](https://github.com/k999ln/rock/pull/342)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開MCPの接続一周 [PR #7](https://github.com/iceiceice999/rock/pull/7)、PixelのAgentboard登録・認証付き実行 [PR #10](https://github.com/iceiceice999/rock/pull/10) を確認。任意サービスの登録・OAuthは残り |
| 1 | L7 | 88 | [88-noah-mass-probe.md](88-noah-mass-probe.md) | 大量の接続試験と見回り、つながると確かめた数 | ✅ L7コードを現mainへ統合（旧 [PR #345](https://github.com/k999ln/rock/pull/345)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。中断回収・巡回制限の実装と、全件/継続本番受入は別。収集の復旧記録は [PR #16](https://github.com/iceiceice999/rock/pull/16)（72時間巡回の合格に転用しない） |
| 1 | — | 89 | [89-noah-terminal-mouth.md](89-noah-terminal-mouth.md) | ターミナルの口（ACP・MCP の package）。今ある Mac の隔離環境で | |
| 2 | L9 | 90 | [90-noah-phone-only-loop.md](90-noah-phone-only-loop.md) | 手元だけの一周（PC の前に座らない受入）。出してよいかの判定 | ✅ 自動試験を現mainへ統合（旧 [PR #347](https://github.com/k999ln/rock/pull/347)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開MCPの390px本番一周 [PR #7](https://github.com/iceiceice999/rock/pull/7)・Pixel登録から成果再表示 [PR #10](https://github.com/iceiceice999/rock/pull/10) は確認済み。仕様表1〜13の同一候補での全体受入は未確認 |
| 2 | L8 | 97 | [97-noah-launch-ops.md](97-noah-launch-ops.md) | 出すための運用: 巡回を起こす Worker、切り替え、取り下げの窓口、見張る数、戻し方 | ✅ L8コードは現mainに統合（旧 [PR #346](https://github.com/k999ln/rock/pull/346)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。旧 [PR #358](https://github.com/k999ln/rock/pull/358) に公開/DB適用記録あり。「本番適用なし」は過去時点の記述。G4〜G6全体受入は未確認。収集復旧と24時間観測は [PR #16](https://github.com/iceiceice999/rock/pull/16)・task125-scout |
| 2 | — | 83 | [83-noah-mac-installer.md](83-noah-mac-installer.md) | 専用の端末（家）: 今ある Mac を、座らずに使える端末にする | |
| 2 | — | 92 | [92-noah-standing-work.md](92-noah-standing-work.md) | 継続して任せる（予定を account に置く） | |
| 2 | — | 94 | [94-noah-usage-three-views.md](94-noah-usage-three-views.md) | 利用の記録を 1 か所に（利用者・提供者・運営） | ✅ 利用者の専用クラウド契約で確定額と予約額を分けて表示（[PR #389](https://github.com/k999ln/rock/pull/389)）。✅ マイAgentの仕事別利用明細（[PR #46](https://github.com/iceiceice999/rock/pull/46)） |
| 3 | — | 81 | [81-noah-connect-patrol.md](81-noah-connect-patrol.md) | 作者の引き取り、取り下げ、並び順 | |
| 3 | — | 76 | [76-eve-build-autofill.md](76-eve-build-autofill.md) | 載せる 1 画面と自動入力（見分ける） | |
| 3 | — | 77 | [77-eve-build-normalize.md](77-eve-build-normalize.md) | 整える・接続試験と接続証明・機械審査 | |
| 3 | — | 78 | [78-noah-agent-purchase.md](78-noah-agent-purchase.md) | 試用、仮売上 → 接続の確認 → 確定、直した版の権利 | |
| 3 | — | 93 | [93-noah-library-lifecycle.md](93-noah-library-lifecycle.md) | 入れ替える（更新・戻す・切る・移す） | |
| 4 | — | 95 | [95-noah-on-mii-contract.md](95-noah-on-mii-contract.md) | mii で使うための契約（Linux の host で同じ受入、声と表示の模擬） | |
| 並行 | — | 75 | [75-noah-own-device-cloud.md](75-noah-own-device-cloud.md) | Noahのクラウド実行。Macを閉じた後の仕事・停止・従量の照合 | 設計整理済み。一般Agentの実行・有料受入は未完了 |
| 並行 | — | 91 | [91-noah-device-browser.md](91-noah-device-browser.md) | 専用の端末の中のブラウザと画面、のぞく | ✅ [PR #393](https://github.com/k999ln/rock/pull/393) ココナラの本人Mac経路・合成取引で実機確認。クラウド汎用ブラウザは継続。✅ [PR #11](https://github.com/iceiceice999/rock/pull/11) Daisukeの公開案件探索・提案下書き・停止  / ✅ 全体検査・差分統合 [PR #12](https://github.com/iceiceice999/rock/pull/12) |
| 並行 | — | 79 | [79-noah-mobile-variant.md](79-noah-mobile-variant.md) | スマホ内版（宣言型への圧縮と実機の確認） | |
| 並行 | — | 80 | [80-eve-to-noah.md](80-eve-to-noah.md) | 担当を載せる、Eve で改良、0 クリック | |
| 並行 | — | 82 | [82-noah-provider-place.md](82-noah-provider-place.md) | 提供者サーバー型（利用権の受け渡し、A2A、許可の再利用） | |

調査した残り 72 件を 1 件ずつ実行器で対応する作業は行わない（分類は [docs/noah-agent-census-20261120.md](../../docs/noah-agent-census-20261120.md)）。13 / 85 などの限定試験を、全体の合格と数えない。

## 本人の追加指示

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 99 | [99-noah-result-data.md](99-noah-result-data.md) | 成果の本人用検索・出力と同意付き運営提供・撤回 | ✅ PR #334 |
| 100 | [100-noah-standalone-ui.md](100-noah-standalone-ui.md) | Noahの専用UI・登録Agent・利用人数/王冠/コメント・実行中タブ・接続案内・開発者向けメール相談 | ✅ 現mainにUI・登録・保存・タップ反応を統合（[PR #3](https://github.com/iceiceice999/rock/pull/3)、[PR #6](https://github.com/iceiceice999/rock/pull/6)）。公開203のPixelでAgentboard新規登録→認証付き実行→成果再読込、音・振動を確認（[PR #10](https://github.com/iceiceice999/rock/pull/10)）。過去の公開版別記録はtask100/CHANGELOG。任意サービスのブラウザ登録・100人同時外部実行・実eSIM連携は未受入。[PR #24](https://github.com/iceiceice999/rock/pull/24)で目的別の初回導線を追加。初見利用者の評価は[受入手順](../../docs/noah/first-use-architecture.md)で確認する。✅ オレンジのストアとマイAgent、専用Linuxと利用明細（[PR #37](https://github.com/iceiceice999/rock/pull/37)）。 ✅ Today特集、Agent一覧の共通ピン・商品詳細・登録時の表紙動画生成（[PR #41](https://github.com/iceiceice999/rock/pull/41)）。 |
| 101 | [101-compute-placement.md](101-compute-placement.md) | 黒殿の 1 ノードを Linux 版 runner の host にし、従量の引き金を測る | 項目 1・4 [#370](https://github.com/k999ln/rock/pull/370)（main への統合は [PR #414](https://github.com/k999ln/rock/pull/414)） |
| 102 | [102-sim-proof-endorse.md](102-sim-proof-endorse.md) | SIM の証明（N1）: Endorse のトークンを確かめ、SIM を account に束ねる | ✅ [PR #365](https://github.com/k999ln/rock/pull/365)（main への統合は [PR #411](https://github.com/k999ln/rock/pull/411)） |
| 103 | [103-esim-churn-measure.md](103-esim-churn-measure.md) | 続けて使う割合を測る: eSIM を入れた人と入れていない人を、同じ機能で比べる（集計の関数は実装済み） | ✅ [PR #415](https://github.com/k999ln/rock/pull/415)（使い続けた割合。月額の版 #364 は入れない） |
| 104 | [104-owner-key-encryption.md](104-owner-key-encryption.md) | 本人の鍵で暗号化（案 K）: Memory と成果のファイルを運営も読めない形に | |
| 105 | [105-cloud-operations.md](105-cloud-operations.md) | 自社クラウドの回し方: 約束・見張り・知らせ・費用の上限・バックアップ | ✅ [#368](https://github.com/k999ln/rock/pull/368)（main への統合は [PR #413](https://github.com/k999ln/rock/pull/413)。本番の migration・通知・cron は本人の許可の後） |
| 101（紹介） | [101-noah-affiliate-agents.md](101-noah-affiliate-agents.md) | Noah向け相談・紹介案件運営のZIPとMCP | ✅ 法人相談と保存範囲を本番受入（[PR #8](https://github.com/iceiceice999/rock/pull/8)・[PR #9](https://github.com/iceiceice999/rock/pull/9)）。WordPress/EC診断2種はSites208で本文・保存・再読込を受入（[PR #14](https://github.com/iceiceice999/rock/pull/14)）。✅ 集客導線・計測 [PR #17](https://github.com/iceiceice999/rock/pull/17) は全7チェック成功・main統合済み。記事/X公開はPR記録。最後の観測で対象2件の注文/承認0、最新取得はログイン切れ。入金・次回6時間運用は未受入 |

## 110 番台: Noah — 棚とパッケージ、300 人の試行（2026-11-21）

本人の決定（11-19〜21。[07](../../docs/structure/07-decisions-from-minutes.md)）: 領域ごとのパッケージ、1 つの仕事を最後までやる組合せ、今動かせる物だけ、入口の棚は「稼ぐ・仕事を省く」「教育」「暮らし」、無料は 6 枚までつなげる、まず 300 人に試してもらう。設計は [docs/noah/spec-110-shelf.md](../../docs/noah/spec-110-shelf.md)（110〜113 が、同じ仕様書の章を分けて使う）と [docs/noah/trial-300.md](../../docs/noah/trial-300.md)（114）。型契約と参照実装は docs/contracts/noah-shelf-v1.ts、試験は docs/design-validation/noah/noah-shelf.test.mjs と validate-noah-shelf-v1.py。

| 順 | ローンチ | # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- | --- | --- |
| 1 | L5・L8 に足す | 110 | [110-noah-shelf.md](110-noah-shelf.md) | 棚とカード: カードの形、載せる条件（今動かせる物だけ）、運営が動かして確かめる、`/noah/ready` の棚、運営の画面 |✅ [#353](https://github.com/k999ln/rock/pull/353) |
| 2 | —（出した後） | 111 | [111-noah-shelf-rank.md](111-noah-shelf-rank.md) | 実績の並び（学習なし）、見せた記録、カードをタイムラインへ流す |✅ [#355](https://github.com/k999ln/rock/pull/355) |
| 2 | —（出した後） | 112 | [112-noah-package-chains.md](112-noah-package-chains.md) | 家の端末のカード、工程をつなぐカード、札の候補、工程の計画へのつなぎ | |
| 2 | —（出した後） | 113 | [113-noah-plan-limits.md](113-noah-plan-limits.md) | つなげる数を料金ごとに（無料 6 枚・有料 50 枚。数えるのはカード） |✅ [#357](https://github.com/k999ln/rock/pull/357) |
| 2 | 出した直後 | 114 | [114-noah-trial-300.md](114-noah-trial-300.md) | 300 人の試行: 経路の札、段を終えたかの判定、本人の報告（売れた件数・手取り・掛けた分） | ✅ 試行を記録する仕組み（[旧PR #354](https://github.com/k999ln/rock/pull/354)）。300人の実ユーザー試行は未確認。100ブラウザの限定読み取り・同時5フロー試験を300人の受入としない |
| 3 | 一般公開の時に出る | 115 | [../../docs/noah/spec-115-pin-grid.md](../../docs/noah/spec-115-pin-grid.md) | ピンタレスト風のホーム: 今動かせる Agent のグリッド、ボードへ保存・公開・フォロー、学習なしの並び（X の作りの形・Reddit hot・Pixie） |✅ [#375](https://github.com/k999ln/rock/pull/375) |

カードを動かして確かめる事（[カード案](../../docs/services/noah-shelf.md) の 12 枚）、投稿・動画・人への連絡、切り替えを開ける事、本番の migration は、task ではなく本人と運営の作業。

## Agent収集

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 120 | [120-noah-agent-collection.md](120-noah-agent-collection.md) | 4出所のAgent継続収集・再開・Noahへの自動掲載 | ✅ 継続収集と公開MCP接続を現mainへ統合。[PR #7](https://github.com/iceiceice999/rock/pull/7) でSites205の接続→実処理→保存→再表示を本番受入。全掲載Agentの実行受入は残り。収集の運用残件はtask125-scout |
| 121 | [121-noah-collect-more.md](121-noah-collect-more.md) | 集める場所を増やす（HN・GitHub MCP・HF MCP Space・npm・Docker・awesome一覧・Smithery、Codexが読むX/Reddit/Bluesky）・新しく使いやすい順・握手済みの系列を一覧へ自動で入れる | ✅ #385（本番の配備は Codex） |
| 122 | [122-noah-business-blueprints.md](122-noah-business-blueprints.md) | 稼ぎ方の設計図（分類表から433件・工程の種類と理由・確かめたエージェントだけ当てる・アカウントを作る順・Eveが作る物・稼いだ分だけの予算・続けるか止めるか） | 1段目 #391 ／ ✅ 何を待つか・工程の段・審査者の説明画面 [PR #25](https://github.com/iceiceice999/rock/pull/25)・[旧 PR #424](https://github.com/k999ln/rock/pull/424) |
| 123 | [123-noah-all-agents-usable.md](123-noah-all-agents-usable.md) | 約7万件のうち使える物を全部使えるようにする（握手済み17,046系列の本番投入・量産の系列・OAuth/鍵・手元の配布のクラウド実行・説明の日本語化・全画面の言語切替・日本語の規約） | 進行中。公開MCPの自動接続・限定本番受入 [PR #7](https://github.com/iceiceice999/rock/pull/7)、CLI6種の実装統合 [PR #12](https://github.com/iceiceice999/rock/pull/12)。全掲載Agentの実行対応、OAuth/鍵、本番CLI全体は未受入。6種の実モデル個別成功はPR #19に記録 |
| 124 | [124-noah-teikibin-ledger.md](124-noah-teikibin-ledger.md) | 定期便の台帳（入金・費用・寄与の記録、月の締め、作業料と等分、有料の差し引き、振込の一覧、物の割当） | 🔶 台帳と画面 [PR #410](https://github.com/k999ln/rock/pull/410)（切り替えは閉。開ける前に要る事は仕様の 12 章） |
| 125 | [125-noah-cloud-agents.md](125-noah-cloud-agents.md) | CLIの管理クラウド・提供元への直接接続・Noah内で実行 | ✅ 固定6種 [PR #12](https://github.com/iceiceice999/rock/pull/12)、無料Worker/共通成果 [PR #18](https://github.com/iceiceice999/rock/pull/18)。Sites210でMemory/Filesystem/Thinkingの画面全閉鎖後の保存・再表示・download、停止/再送/別owner拒否を受入。[PR #19](https://github.com/iceiceice999/rock/pull/19) のLinux実モデル6種の成功例/失敗例・公開209 Pixel記録も保持。✅ 公式PythonのTime・boss面接準備・Hermes計画は [PR #30](https://github.com/iceiceice999/rock/pull/30) と分離/モデル補正 [PR #32](https://github.com/iceiceice999/rock/pull/32) でSites216の実行・全閉鎖中の保存・downloadを受入。Containersは未契約。受入記録・添付注記補正 [PR #21](https://github.com/iceiceice999/rock/pull/21)  ✅ 接続可能な公式CLIの検索 [PR #23](https://github.com/iceiceice999/rock/pull/23) |
| 125 | [125-noah-scout.md](125-noah-scout.md) | Noah が自分で探す（GitHub の急に伸びた repo・Agent の道具の話題・Product Hunt、Codex の Luna Max が毎日 X を読んで配布元まで理解した「Noahが読んだ」）・Switch を載せる・iceiceice999/rock への移行 | ✅ 自律収集の移植 [PR #13](https://github.com/iceiceice999/rock/pull/13)・停止調査 [PR #15](https://github.com/iceiceice999/rock/pull/15)・本番収集の復旧 [PR #16](https://github.com/iceiceice999/rock/pull/16)・チェックポイントのタイムアウト修正 [PR #26](https://github.com/iceiceice999/rock/pull/26)。✅ 「Noahが読んだ」のファイル掲載と Switch を移植（[正本 PR #34](https://github.com/iceiceice999/rock/pull/34)・[旧PR #426](https://github.com/k999ln/rock/pull/426)）。毎時予備実行を設定済み。24時間の鮮度維持・新リポジトリへの実行先移行・Xの7日継続掲載は未確認 |
| 126 | [126-noah-packages-first.md](126-noah-packages-first.md) | トップの最初の列をパッケージ（1 つの仕事を最後までやる組合せ）にし、単発は下。Eve が Switch の部屋の形を手本に組む | 指示書を現mainへ統合 [PR #13](https://github.com/iceiceice999/rock/pull/13)。パッケージを先頭へ出す実装は未着手（task125の後） |
| 127 | [127-noah-live-agent-families.md](127-noah-live-agent-families.md) | 786系列の接続・本番稼働記録・利用可能一覧の更新 | ✅ 初回本番受入5系列・残り接続継続（PR #28 / #33） |
| 128 | [128-noah-agent-explain.md](128-noah-agent-explain.md) | 全部の Agent の説明画面（押した先に「何を渡すと、何が、どの順で返るか」を段の図で出す・道具に札を付ける・17,046 系列の札付けと確かめ・PR #424 を iceiceice999/rock へ移す） | ✅ 詳細画面と手元の札付け・目視集計を実装 [PR #27](https://github.com/iceiceice999/rock/pull/27)。記事に沿った画面と札用の表は [PR #45](https://github.com/iceiceice999/rock/pull/45)。0060 がない状態で札なしの段を出す対応は [PR #48](https://github.com/iceiceice999/rock/pull/48)。再採取・実データの札数と割合・本番 D1・一般公開・200 系列の目視は [9 章](128-noah-agent-explain.md#9-graph-engineering-with-claude-の使い方)。CallMCP の用途・依頼例・提供元の料金は [PR #41](https://github.com/iceiceice999/rock/pull/41)。 Claude v2 の道具一覧と公開受入は [PR #52](https://github.com/iceiceice999/rock/pull/52)。道具定義の再取得は [PR #65](https://github.com/iceiceice999/rock/pull/65)。 |
| 129 | [129-noah-ux-debug.md](129-noah-ux-debug.md) | Noah の全機能を知らない人の目で確かめて直す（全体の上限・公平な枠・設定を返さない・本番の一周・未確認の165件・44px・サインインの行き先・Mac だけの画面・検索の続き・repository-map の正本） | 🔶 調べと 1 回目の直し（Claude、2026-11-22。[ux-audit](../../docs/noah/ux-audit-2026-11-22.md)）。D1・D3・D4・D7・D9・D10・D11 は済み（[PR #43](https://github.com/iceiceice999/rock/pull/43)、2026-11-24 に本番で確かめた）。残りは D2（Turnstile）・D5 の実機の行・D6・D8・D12・D13。✅ 研修Agent詳細での動画再生、シアタータブ撤去と保存導線（[PR #53](https://github.com/iceiceice999/rock/pull/53)）。✅ EveとAgentエンジニアリング、無料クラウドの相談と回答表示（[PR #56](https://github.com/iceiceice999/rock/pull/56)） |
| 130 | [130-eve-si-agent-engineering.md](130-eve-si-agent-engineering.md) | Eve（eve.si）のエージェントエンジニアリング（組み合わせファイルと検査、つなぎ目の変換、試運転、需要の台帳、探索と発見、採点と作り直し、作者の受け取り） | 🔶 段 1〜6 の部品・画面・API は済み（Claude、2026-11-24。PR #49）。本番の 1 回（本人が押す・ASP の記録を読む）と、能力を確かめる送信は本人待ち  ✅ Eveの相談と組み合わせ提案 [PR #49](https://github.com/iceiceice999/rock/pull/49)、相談結果の保存 [PR #57](https://github.com/iceiceice999/rock/pull/57)、Eveの設計相談 [PR #58](https://github.com/iceiceice999/rock/pull/58)、✅ 成果地点と入金後の作者分 [PR #61](https://github.com/iceiceice999/rock/pull/61)、✅ 仕事別の収益明細 [PR #67](https://github.com/iceiceice999/rock/pull/67)、✅ ブラウザー保存先 [PR #68](https://github.com/iceiceice999/rock/pull/68) |
| 131 | [131-noah-pin-scenes.md](131-noah-pin-scenes.md) | 約1.7万件のピンに日本語の題と資料の図解（バージョン TAKE。図解はしょうへいさんの Motion Prompt の図解パック（MIT）の書き写し。Luna Max が説明から 24 種類の図を選んで札を書く・確かめ・200件の目視で95%・本番 migration は本人の許可後。バージョン 1 の場面の絵は枝 `claude/noah-pins-version-1`） | 指示書 |
| 132 | [132-noah-pin-videos.md](132-noah-pin-videos.md) | ピンの動画: 格好いい AI 動画（Higgsfield。本人は許可を取ってあると言った）を集め、5〜8 秒・縦 3:4・音なしのループ（GIF と同じ見た目の mp4）にして、Agent ごとに中身で割り当てる。カードは題名だけ。無作為の 200 件で 95% 以上が合うまで一般には出さない |
