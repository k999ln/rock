## 2026-11-20

- Noah の設計の中身を詰めた（Fable / Noelle）。① 作業単位ごとの実装仕様書 8 本（docs/noah/。84・85・73・86・87・74・88・89。今あるコードのどのファイル・関数をどう変えるか、規則の全表、画面と文言、処理の順、試験）。② 動く型契約と参照実装 5 本と DDL 案（docs/contracts/noah-*。接続要件と接続計画、取り込み、口と相手の許可と起動の型紙、道具を持つ担当、画面を取らない検査、新しい表 13 個、名寄せの SQL）。③ 検証キット（docs/design-validation/noah/。公式台帳の実記録と実際の握手の写しを使った試験 41 群、DDL を一時 DB へ流す検証 9 群。`npm run typecheck` エラー 0）。公式台帳の有効な 66,608 件を参照実装に全部通し、今の main の隔離環境の起動引数が検査を通ることを確かめた。実データに通して直した所（取り込みを別の表にする、面を 2 段で決める、配布の中身を Noah が固定する、ほか）を 07 に記録した。task 8 枚を、仕様書を指す形に書き直した。コード（app・lib）は変えていない。

- Noah 全体の設計書を置いた（Fable / Noelle）。主商品 mii・最小構成 Noah・最初は本人の Mac（PR #325 の本人確定方針）に順番を合わせ、行き先（みんなが Agent を自分の専用の端末につないで使う。PC の前に座らない）、具体的なスキーム（お金・つなぐ・動かす・集める・載せる／売る・端末・データ）、進捗報告の 11 項目ごとの設計、要る技術と作り方の表、作る順番、7 つの問い（技術・タイミング・独占・人材・販売・持続性・隠れた真実）への答えを 1 冊にした。実装する Agent がそのまま進められる詳細設計書（機能ごとに UX → フロント → バックエンド → 試験、データ定義、状態遷移、開発の進め方、決定待ちの既定値）を別に置いた。接続・実行・取り込み・市場の背景は別の文書へ分けた。外の台帳を読み取りだけで実測（MCP の公式台帳 66,608 件、鍵なしで応答する host は標本の 54.6%、Hugging Face の「agent」は 0.7% しか動いていない）し、残り 72 件を分類。`docs/noah-design.md`、`docs/noah-detailed-design.md`、`docs/noah-agent-market-design.md`、`docs/noah-agent-census-20261120.md`、`docs/services/`（noah-one-click-connect・noah-own-device・noah-screenless・noah-agent-intake・eve-agent-build・noah-mobile-variant・noah-agent-purchase）、`codex/tasks/73`〜`95`、07 に本人指示と提案、02・04 に 1 か所ずつ。設計まで。コード・migration・契約・公開は変えていない。

- 本人回答に基づき、主商品mii・最小構成Noah・本人Macの先行受入・SIM/eSIMのOS導入役割を正本へ同期。Codex実行の再送試験を、回数固定の待機から実処理の完了待機へ修正（task72）。

- READMEのNoah案内を現在の動作へ同期（task72）。

- Noah公開登録の未ログイン時停止・無効な再確認、ChatGPTログインへの循環、下書きの公開モード消失を修正。登録/運用/Mac承認を既存accountへ接続し、outbox競合試験の誤った勝者固定も解消。全体verify成功、本番の登録→実行→停止は有効セッション確認待ち（[PR #324](https://github.com/k999ln/rock/pull/324)）。

## 2026-11-19

- 最新のNoah/Eve、仕事計画、mii設計研究、AMC・リセール・全社担当を統合候補へ集約。READMEを現在の利用方法と受入範囲へ整理し、進捗生成を現行project.mdへ移動。探索打切りと競合quorumを修正（[PR #321](https://github.com/k999ln/rock/pull/321)）。

- Noah単体ローンチの登録・独立審査・別利用者実行を開発ブランチへ統合し、認証付きMac Runner・配布ZIP・停止確認を追加。12件の失敗・移行整合性・ファイル読取競合を修正し、全体verifyとローカルAPI/実コンテナの接続→実行→停止を確認。公開はリリース工程、別Mac実機は未確認（[PR #322](https://github.com/k999ln/rock/pull/322)）。

## 2026-11-18

- NoahとEveのヘッダーを共通化し、Eveだけに出るコミュニティータブ・タブ位置のずれを修正。avoado.si版149へ公開し、切替と既存認証の保持を確認（[PR #320](https://github.com/k999ln/rock/pull/320)）。

- 旧Noah/Skyの画面をNoah共通シェルと機能一覧に統合。旧URLの条件保持・誤配信404・AMC循環を修正し、ローカル実験の制限を保持。表示名・配色競合も修正し、avoado.si公開版148を107項目で確認（[PR #320](https://github.com/k999ln/rock/pull/320)）。

- 公開assetの正規URLをWorker経由へ修正し、CIの一時ブラウザーでローカル接続権限と実Tool再確認を明示。v144の公開ヘッダー8ルートと検索→Mac版への移動を実測（[PR #319](https://github.com/k999ln/rock/pull/319)）。
- 統合Noahタイムラインをavoado.siの公開入口に接続。ドメイン直下からNoahを開き、既存の共有URLとMac版への導線を保持（公開v143を実URLで確認、[PR #319](https://github.com/k999ln/rock/pull/319)）。

## 2026-11-18

- Noahをニュース・投稿・コミュニティー・Agentの混合タイムラインへ統一。種別ラベルとMac版への案内を追加（本人指示で未公開、PR未作成）。

## 2026-11-18

- avoado.si/noahに公開カタログ・検索・詳細とMac版への導線を追加。私有データ/本番DBは変更しない（Sites用ソース、本人指示で公開せず準備まで、PR未作成）。

# CHANGELOG — 内側の人向け更新ログ

このファイルは「何日に何を変えたか」を残す場所です。製品の説明はREADME.md、仕組みの説明はdocs/structure/ にあります。Codexは日常作業でこのファイルを読む必要はありません（読むのは「以前どう変えたか」を調べる時だけ）。

書き方: 新しい日付を上に足す。1件1〜3行。PR番号・main SHA・証拠へのリンクはここに残す。

## 2026-11-18 — Sky の収益ループを一つにまとめる（完全自動化の方針）（Fable / Noelle）

- 本人指示で、送信まで自動を初期値に変更（`policy.submission`）。apply lane の snapshot を受けて decisions を返す `decideLanePass` と `scripts/sky-gig-desk.mjs --lane` を追加。上流（Daisuke134/life-manager）の schema と同じ形。
- lib/sky-gig-offers.ts: 受注型 16 と、好きなこと型 4（お絵描き・エッセイ・業界の情報収集・解析）。lib/sky-device-tiers.ts: 携帯・家の計算機・会社・クラウドの置き場所と、一致した結果だけを作業料にする計算。
- 差分の一覧と統合図は [docs/sky-earn-parity.md](docs/sky-earn-parity.md)。Mr. の同期は codex/tasks/36、lane との接続は 37。検証: tests/sky-earn-loop.test.mjs（7件）ほか関連 33 件。[PR #318](https://github.com/k999ln/rock/pull/318)

## 2026-11-18 — Sky の会社の窓口（ココナラ）（Fable / Noelle）

- lib/sky-gig-desk.ts: 本人が渡した募集の文面を読み、応募する・見送るを決め、額と納品日を出し、提案の下書きを作る。受注後の確認を30秒の問いにして参加者へ配り、多数側の答えを作業料の寄与にする。サイトへの接続・送信はしない。
- 実行例 `node --experimental-strip-types scripts/sky-gig-desk.mjs examples/sky/gig-desk/desk.json`。設計 [docs/sky-work-loop.md §7](docs/sky-work-loop.md)、書式 [docs/services/gig-desk.md](docs/services/gig-desk.md)、決定 07（11-18 の 3 行。うち 2 行は本人確認待ちの提案）。画面と保存は codex/tasks/35。検証: tests/sky-gig-desk.test.mjs（10件）。[PR #318](https://github.com/k999ln/rock/pull/318)

## 2026-11-15 — Sky の工程選択と会社受注の計算（Fable / Noelle）

- lib/sky-recipe-planner.ts: 依頼を Tool 1つではなく工程全体として計画し、検収に通る成果1つあたりの期待総額で順位付け。自動化を作るか・本人に何を残すかも同じ式で決める。未接続（接続は codex/tasks/33）。
- lib/sky-company-order.ts: 会社受注の実行先の判定、見積り確認、作業料＋配当の分配計算、配れる月額の逆算。記帳・送金はしない（保存と画面は codex/tasks/34）。
- 設計 [docs/sky-work-loop.md](docs/sky-work-loop.md)、書式 [docs/services/company-order.md](docs/services/company-order.md)、決定 07（11-15 の 5 行。うち 2 行は本人確認待ちの提案）、04 §5。検証: `node --experimental-strip-types --test tests/sky-recipe-planner.test.mjs tests/sky-company-order.test.mjs`（16件）。[PR #318](https://github.com/k999ln/rock/pull/318)
## 2026-11-04 — Goalから役割・実行・検収・再計画へ

- 既存AMC Goalに営業18役・開発21役の逆算計画と有限ローカル実行を追加。成果物の実在・版、別processの検収、差し戻し・上限・停止・不明時の再送禁止、CEOの証拠付き最終受入を保持。
- 入口は `npm run amc:cycle -- demo`。[運用・復旧](docs/amc-goal-orchestrator.md#goalから逆算するローカル実行と再計画)。新しい常駐serviceや外部送信・課金・公開権限は付与しない。main未統合のローカル候補。
## 2026-11-05 — mii V2 設計研究と第 1 形態（Fable / Noelle、PR #313）

- docs/mii/design/v2-study/: 第 2 形態 6 案（00〜20、research 4 本）と第 1 形態（天井 1 枚・火災警報器兼用）5 設計書（30〜37、research 5 本）、および「まだ考えていなかった所」38〜45（ソフト・設置校正・安全寿命・音・法規・製造・検証・事業）。原価 1,000 台: C ¥13,600 / D ¥48,000 / A ¥131,000 / B $662 / E ¥319,000。認証費: 検定 ¥148,100、PSE ¥950,000、技適 ¥240k×2＋60 GHz ¥450k、UL 217 $31k〜45k。
- codex/tasks/23 を追加（V2 反映、本人承認後）。task 22 に ceiling 筐体を追記。

## 2026-11-02 — avoado.si と GitHub main のソース統合（G04 / WEB04）

- 公開v141のEve / Noah導線・会話・本人性runtimeをmainの権限/承認/成果契約と統合。両方のGit履歴を保持し、通常PRで同一sourceの公開へ進める。
- 公開SQLは [固定ハッシュ](data/avoado-published-migration-lineage.json) のまま。旧main SQLは [保全先](drizzle-legacy/github-main-before-avoado-alignment/README.md) へ分離。検証と未完事項は [進捗](project.md)。

## 2026-11-01 — miiの声・指先入力（PR #311）

- MINI01/M1: 同じ仕事の依頼内容を声/2D指先で選択・確認・CAS保存・再読込。料金fixtureの過去日付を修正。検証・未受入範囲は [記録](data/mii-spatial-input-validation.json)。[PR #311](https://github.com/k999ln/rock/pull/311)へ保存。固定sourceは独立検収済み。HEAD CI・main統合後の同一SHA CIは確認中。

## 2026-11-02 — 構造整理（Fable / Noelle）

- docs/mii/design/00〜13: mii 設計書 V1（Tower 4本＋Hub 別体、本数可変 1→4→8、基準部屋 4.5×4.5m、Node 寸法、Gen1 運動視差投影、同期・電源、ソフト構成、校正、受入条件、BOM 構造、試作計画）。

- mainの旧状態をブランチ `archive/pre-restructure-20261102-main-1daf5c3` に保存（復元用）。
- README.md の前半を内側向けの構造地図に書き直し。後半に旧READMEの製品説明（Mini/OS/Eve/Sky/Pro、写真・設計・コードの場所・開発状況）を全文残した。旧README原本は archive/root-snapshot-20261029/README.md。
- AGENTS.md を100行以内に書き直し。旧AGENTSは archive/root-snapshot-20261029/AGENTS.md。
- project.md / PROJECTS.md を archive/root-snapshot-20261029/ へ移動。
- docs/structure/ に正本の設計入口を新設。codex/tasks/ にCodex向け指示書を新設。
- 旧READMEの先頭にあった日付付き更新メモ（下記）をこのファイルへ移動。
- docs/structure/00〜09: 全体像、mii構造（Spatial Core＋表示層、3筐体）、RockstarOS（一つのOS＋hardware profile、account継続）、eSIM再定義（鍵付き回線・GBを売らない）、Eve→Noa→AMC→Jev とサービス書式、収益と1ヶ月/1年計画、名前の正本、議事録決定表、PDF指摘、リポ地図。
- codex/tasks/00〜40: 20件の指示書（archive・verify短縮・名前統一・drizzle統合・bot整理・Sky lib整理・eSIM 4件・mii 3件・account継続・profile・サービス3枚・Jennifer→AMC）。
- ルート `.ignore` を追加（archive/, docs/evidence/, workspaces/ 等を rg/fd の既定検索から外す。gitには残る）。docs/evidence/README.md を追加。
- scripts/check-product-baseline.mjs, check-sky.mjs, project-status.mjs, workspaces.mjs の project.md / PROJECTS.md 参照を archive パスへ。data/archived-paths.json に移動先を記録。
- 名前: Smith→Noa、Jennifer→AMCへ統合、avocadoMini→mii、Zema→Eve/Work（本文はtask 03/04で順次）。

## 2026-10-29 以前 — 旧README先頭の更新メモ（原文のまま、新しい順）

- Local Agent APIの保存済みAgent設定不一致は、既存の拒否を保ち、estimate/textと同じ `AGENT_SETTINGS_CHANGED` と元のstatusで返します。[応答・復旧契約](docs/rockstaros-complete-design.md#smith-local-agent-settings-rejection)。自動再実行や新しい権限は追加しません。
- 開発の全体窓口はRoot、保存・統合はGitへ集約します。次の新規作業はOS（料金・請求、Wallet、Game、eSIMの既存要件を含む）・Eve・Smith・miiを優先し、既存95unitの残件を保持します。着手済みProは検収・保存・統合まで閉じ、OSに含まれる上記要件を一律後回しにせず、専門ownerと共通契約を再利用します。非金融GameはWallet完成待ちにしません。その他の範囲外の独立拡張は後回しです。[現行運用](docs/workstreams/10-git-ci-operations.md#four-lane-priority-20261028)。
- Skyで追加したモデル・データ・アプリは「Eveで使う準備」から出典を確認し、「依頼を入力欄へ読み込む」で編集して送信できます。Eveの回答は「自分の担当を作る」から選び、役割を編集して確認保存します。取込だけでは送信・保存・実行されません。Tool・権限・費用はSmithと既存の実行確認で別に確かめます。
- Proの保存済み仕事は、WorkJob IDを確認して共通の本人画面へ開く[限定再開入口](docs/rockstaros-complete-design.md#pro-existing-job-resume)を用意しています。形式確認は存在・所有・実行同意の確認ではなく、現在の本人一覧外の古い仕事をexact GETで取得する機能は未実装です。
- 共有service accessの開発・検証は[全11lane portfolio](data/development-portfolio.json)と[Git運用](docs/workstreams/10-git-ci-operations.md#portfolio-delivery-20261028)を入口にします。eSIM/Pixelの回線・本人利用権・OS/client状態は独立し、現在のhost検査を実機/本番の合格へ換算しません。
- PR247でmain統合・同SHA CI確認済みの共通テキスト仕事とEve準備仕事では、応答不明時に同じbrowserで開き直して保存済みの同じ仕事・操作IDを確認できます。未保存原稿や同意は復元しません。未確認中は自動再送せず、Web Locksまたは保存機能が使えない環境では新規操作を止めます。[復旧条件](docs/rockstaros-complete-design.md#eve13-pending-recovery)。実認証browser・実機・公開側の受入は別です。
- Pro商品ページから、avoado.siの[既存私有テキスト仕事](https://avoado.si/zema/compose?tool=mr-citations)へ進む限定入口はPR246でmainへ反映済みです。linkはToolだけを選び、notesや私有archiveは送信しません。利用accountを確認して新しいtextを入力し、計画保存と別の素材保存同意を確認します。応答不明は同じ仕事/操作で照合し、手順間で停止しても保存原稿/成果を保持します。この接続済みsource-link処理のbudget0と、service・回線・他AI使用料は別です。[契約・復旧](docs/rockstaros-complete-design.md#pro-private-work-entry)。公開側の修正配備は未実施です。
- [PR245](https://github.com/k999ln/rock/pull/245)のSmith保存参照修正はmain `9cb9d148`へ統合済みで、同SHA全6CI・4workflowが成功しました。[現在の受入証拠](docs/evidence/development-execution/smith-session-main-current.json)を元capture receiptと分けて保存しています。
- Smithの保存会話では、既存UUIDまたはcatalog ToolのAgent参照を同じid/revisionで再保存し、別の会話やhandoffへ持ち越さない限定修正はPR245でmainへ反映済みです。復元だけで実行は再開せず、期限・本人・現在Agent・実行同意は既存の確認を通します。[保存と復旧の契約](docs/rockstaros-complete-design.md#smith-saved-agent-reference)。
- [PR244](https://github.com/k999ln/rock/pull/244)はmain `9f2bf146`へ統合済みで、同SHA全6CI・4workflowが成功しました。検収済み26ファイルとmainの内容一致、Linux全verifyの結果は[別current記録](docs/evidence/development-execution/esim-webops-main-current.json)に保存しています。公開側への配備は未実施です。
- 旧`https://avoado.si/install/`の互換入口は、固定`/connect`の利用開始案内へつなぎます。最終先へquery/fragmentを渡さず、本人確認・利用権・機種適合・費用の既存手順へ進みます。eSIMの初回開始は現在のsetup/利用権を保存時にも照合し、失効/競合時は起算せず同じworkspaceから再開します。[設計・復旧](docs/rockstaros-complete-design.md#esim-runtime-commit-authority)と[今回の限定候補・Git段階](docs/evidence/development-execution/esim-webops-main-adoption.json)を参照してください。公開側の修正配備は未実施です。
- PR242/243はmain `927ac79a`へ統合済みで、同SHA全6CI・4workflowが成功しています。PR242初回main `e7d458f2`の失敗は保持し、[別のcurrent記録](docs/evidence/development-execution/pr242-243-main-current.json)でforward-fix後の状態を確認できます。
- Proの私有原本archiveでは、保存結果が不明な間は新しいfileへ置き換えず「Read back same archive」で同じ保存IDを確認してください。本人確認中にcancelしても照合先だけを保持し、内容は隠します。再開には同じaccountの確認と別の保存同意が必要です。[復旧契約](docs/rockstaros-complete-design.md#pro-archive-unknown-recovery)。[PR242のmain初回verify失敗](docs/evidence/development-execution/billing-eve-os-game-main-current.json)を保持し、[PR243で修正・main統合・同SHA CI成功した現在の記録](docs/evidence/development-execution/pr242-243-main-current.json)を別に保存しています。
- Eveの見積条件を予算0の準備仕事へ渡す限定機能はPR242/243でmain統合・同SHA CI確認済みです。保存済の資料で見積もり、通貨と比較上限、別の準備同意を確認して「この条件で準備仕事を作成」へ進みます。原文は元の仕事へ保持し、新仕事の資料保存は別の保存同意後に行います。期限切れ時は元の仕事で見積もり直します。これは有料生成の承認や予約ではありません。[契約と復旧](docs/rockstaros-complete-design.md#eve-text-handoff)、[4候補の検収・Git段階](docs/evidence/development-execution/billing-eve-os-game-main-adoption.json)を参照してください。
- [PR225](https://github.com/k999ln/rock/pull/225)のzod修正はmain `f4ed492c`へ統合済みです。HEAD `dcf86f99`の全8CI、main統合SHAの全9CI（CodeQLを含む）が成功し、zod警告2件は解消しました。[最終検収・履歴](docs/evidence/development-execution/zod-security-constraint-review.json)をGit保存しています。root・MiniはZod4.6.7、shadcnは上流Zod4対応版4.22.1です。依存・schema互換性試験は `node --test tests/zod-dependency-security.test.mjs`。実機・追加推論・公開の実施は含みません。
- [PR207](https://github.com/k999ln/rock/pull/207)はmain `0d726717`へ通常統合済みで、同一SHAのCI6件成功を確認しました。公開・配備・616件一括公開は保留です。採用済みの[Wallet process復旧fixture](docs/sky-billing.md#wallet-process-recovery-fixture)は `node --experimental-strip-types --test tests/billing-process-recovery.test.mjs` で実行できます。合成local SQLiteの子processを13点で強制終了し、再接続・再送の一意性を検査します。POSIX限定でWindowsはskip。本番金融の受入ではありません。 [PR208](https://github.com/k999ln/rock/pull/208)はmain `2854d069`へ通常統合済みで、同mergeSHAの全6CIとLinux実verify（2911試験・2909pass・0fail・2skip）が成功しました。原本の記録時pendingと現在のGit受入を分けた[統合証拠](docs/evidence/development-execution/wallet-process-recovery-main-merge.json)を保存しています。
- Proの[私有原本archiveへの入口](docs/rockstaros-complete-design.md#pro-original-archive-entry)を限定候補へ追加。Proの「Move private notes safely」でpreview・別のfile export同意・downloadを行い、「Open private archive on avoado.si」から既存`/account/import/pro`へ進みます。sign in後に同fileを手動で選び直し、保存先accountと別の保存同意を確認します。原文は元browserとfileへ保持し、自動転送・仕事化・native移行は行いません。Chromeのlocal1512/390表示とpreview/cancelを限定確認。認証済server保存・公開先実click・配備は別gateです。Wallet DB復旧test-onlyはPR206/mainb1b0で限定統合済み。[11lane/95unit/履歴42成果の引継ぎ要約](docs/evidence/development-execution/all-lanes-main-handoff-summary.json)を参照してください。
- Walletの[DB復旧fixture](docs/sky-billing.md#wallet-legacy-db-recovery-fixture)をtest-only候補へ追加。`node --experimental-strip-types --test tests/billing-worker.test.mjs tests/earning-bridge.test.mjs tests/wallet-deposit-provenance.test.mjs`で、合成receiptのSQL中断/ack喪失後の同file再open・同key再送・上限照合を確認します。実Worker・料金・鍵・888ルール・default ToC holdは変更していません。実収益/認証端末/Cloudflare並行/本番金融は別受入です。Game host fixtureはPR205でmainへ限定統合済みです。
- Game作者向け[host fixture CLI](docs/game-api-contract-draft.md#game-creator-host-fixture)を限定候補へ追加。`node --experimental-strip-types scripts/game-creator-fixture.mjs --help`から、所有するprivate temp directoryで固定粒子sessionのstart/read/resumeを試せます。既存save形式で再開・同一retryを照合し、不明な保存やlockは自動削除しません。合成ownerのhostサンプルで、任意engine・認証owner保存・fullSDK・金融・実機・公開の受入ではありません。Eve見積onlyはPR204でmainへ限定統合済みです。
- 小型画面の[下部ナビ](docs/rockstaros-complete-design.md#smith-mobile-bottom-navigation)を限定候補へ更新。`npm run dev`のHomeや既存WorkspaceShellで、幅700px以下にSmith・Eve・コミュニティーの3入口を表示します。見つける／自分のSkyはHomeの「その他」メニューから開けます。入力中はナビを隠して入力を保ちます。限定local実UIを確認済みですが、実機keyboard・認証後composer・本番公開等は別受入です。Billing service最終claimはPR202でmainへ限定統合済みです。
- Cloud textの[最終service確認](docs/sky-billing.md#billing-required-service-authority)を限定候補へ追加。既存server設定がrequiredの場合は送信直前にも本人の有効な利用権と期限を確認します。previewは既存試験/legacy経路として区別し、結果不明時は予約を保持して自動再送しません。価格・設定値・schemaは変更していません。最終CI/独立採用検収・実Provider/課金/公開は別gateです。eSIM本文開示はPR201でmainへ限定統合済みです。
- Sky Linuxの[保存本文の読取確認](docs/rockstaros-complete-design.md#esim-owner-response-disclosure)を限定候補へ更新。既存の`/sky/linux`で、本人の保存データ読取と新しい実行許可を区別します。保存後に本文を確認できない場合は再実行せず最新状態を読み戻し、APIは既知commitのackと本文なしを区別して返します。独立保存ACL/期限・本番DB/auth・公開の受入は別です。Mini有限cone探索はPR200でmainへ限定統合済みです。
- Miniの[有限cone-aware探索](docs/rockstaros-avocado-mini-complete-design.md#mini02-cone-aware-search)をhost研究候補へ追加。既存の有限joint solverへinside edgeだけを渡し、found・finite impossible・unknown・unavailableを区別します。[研究APIと実行例](docs/avocado-mini-r5/factory-development/mini-02-cone-aware-search.md)からJSON入力で検査できます。物理出力・低眩しさ・眼安全・全域・停止・製造や公開の受入ではありません。Pro原本archiveはPR199でmainへ限定統合済みです。
- Pro原本archive候補はPR199で継続検証中です。既存の本人確認・保存同意・全bytes/SHA読戻し契約を保ち、test登録のlint互換修正を追加しました。新head CIと独立再検収が完了するまでmain採用は保留です。
- Proの[原本私有archive](docs/rockstaros-complete-design.md#pro-account-original-archive)を限定候補へ追加。`npm run dev`のローカルアプリで`/account/import/pro`を開き、Pro exportを選択してpreview・保存先account確認・別の保存同意を行います。保存後は読戻した全bytes/SHAを確認してdownloadします。既存Eve履歴の認証/暗号化keyring準備が必要です。仕事やモデルは実行しません。実account/browser/native・公開の受入は別です。Eve資料準備はPR198でmainへ限定統合済みです。
- Eveの[資料付き依頼保存](docs/rockstaros-complete-design.md#eve-text-preparation)を限定候補へ追加。`npm run dev`で起動したローカルアプリの`/os/eve/remix`から2つの文章を選ぶか入力し、goalを確認して準備・仕事保存・素材保存への同意・保存処理を進めます。同じ仕事から原文と成果を読み戻して確認します。無料の準備jobで、生成した草稿ではありません。未保存入力はtabを閉じると失われます。公開サイト/実browser/モデル生成の受入は別gateです。
- Billingの[最終send claim](docs/sky-billing.md#billing-final-send-claim)はPR196でmainへ限定統合済み。送信直前にcurrent parent/price/owner/held budgetを同じSQLで確認し、不明時は送信せずholdを保持します。既存料金・888c・台帳を変更しません。共通authority/issuer epoch・本番D1/実課金は未受入です。95台帳のGIT08 metadataはPR195でmain反映済み、本番配備/95whole受入とは区別します。
- [95unit再開台帳](data/development-unit-progress.json)と[handoff](data/development-source-handoff.json)をmain向けに同期。fixed9aの分類を保持し、PR194のeSIM限定採用は別overlayです。95全体の完了は0、Root旧80not_startedは現在の未実装数ではありません。次は実装中のBilling finalclaim、eSIM残gate、Eve02 bounded text。runtime/source/testは変更せず、metadata保存と本番公開は区別します。
- eSIM/Linuxの[保存時authority契約](docs/rockstaros-complete-design.md#esim-runtime-commit-authority)を限定採用候補へ更新。依頼の読取後に利用権/setup/reviewが変われば保存を拒否し、同一依頼の重複予約を防ぎます。本人の既存sessionによる保存データ読取と、新しい実行許可を区別します。汎用attachment・独立保存ACL期限・本番D1/実課金は未受入です。PR193はmain9a617fabへ統合済み、最終検証は同83aのLinux CI成功で、追加host全verify待ちではありません。
- Pixel Linuxの[worker診断・親寿命の候補](docs/rockstaros-complete-design.md#pixel-main-worker-diagnostics)と独立r2済み[Mini有限cone検査](docs/rockstaros-avocado-mini-complete-design.md#mini02-finite-cone-inspection)を別scopeで保存。旧jobの512tokens/180秒wall/170秒CPUを維持し、追加期限/token契約を厳密検証。任意私有診断は成功/停止・権限を変えません。新候補のLinux/実機・背景/P02全体/全OS・Mini実光学は別受入です。
- Pixel Linuxの[限定実機証拠要約](docs/evidence/development-execution/pixel-worker-diagnostics-physical-summary.json)を保存。1jobとPC/Pixel exportの一致を確認した範囲で、PC UI reload・背景実行・P02全体・全OSは未受入です。原文/私的state/鍵/モデル/APKは含めません。
- MINI-02の[有限同時光線割当](docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.md)を採用。排他的poseと共有sourceの仮定内で証人/反例を返し、対象33試験と全verifyに合格したhost研究で、実光学・低眩しさ・全域・実viewer・停止・製造の受入ではありません。
- MINI-02の[固定domain光学study](docs/avocado-mini-r5/factory-development/mini-02-candidate-assessment.md)を採用。板膜なし・少ない表示部・上下全範囲・低眩しさを保持した対象20試験と固定候補全verify成功の有限幾何比較で、実光学・人体・同時viewer・PCB/製造は未受入です。
- Miniの場所条件検証、Pro私有ノートpreview/export、保全dialogのkeyboard/focus、保存済みAgent参照、Game静的導入診断の限定subsetを採用しています。対象69+Pro7と固定候補全verifyに合格。実機・実engine・認証server import・一般公開は別gateです。[設計](docs/rockstaros-complete-design.md#reviewed-client-game-subsets)／[main対応の開発引継ぎ](data/development-source-handoff.json)。
- Billing契約snapshot/月次draft binding、service access eligibility、Wallet署名fixture proposalのpure helperを採用しています。対象113試験と固定候補の全verifyに合格。既存画面/APIへは未接続です。新料金・実課金・残高変更・一般公開は有効にしていません。[設計と未受入gate](docs/rockstaros-complete-design.md#reviewed-service-contracts)／[採用証拠](docs/evidence/development-execution/service-contract-adoption.json)。

## 2026-10-29 以前 — 旧READMEの製品節にあった作業メモ（原文のまま。2026-11-02 に README から移動）

### Mini 節の冒頭メモ

Miniの[カメラ手指入力preview](systems/rock-star-os/targets/avocado-mini/gesture/README.md)は端末内追跡から表示の選択・移動・回転・取消だけを提案します。開始は本人操作とbrowserのcamera許可、停止/非表示/期限でtrackとworkerを閉じます。VIEW_ONLYの開発fixtureで、実空間の校正・実行承認・好み推定や実機精度の受入は別です。 model準備は対応するmacOS/LinuxのUID/O_NOFOLLOW/hardlinkを使い、既存対象を上書きしません。Windows等の未対応環境と旧残骸の手動確認条件は技術READMEを参照してください。

Miniの[開発用message service](systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)をPR238でmainへ限定採用。Broker/APの有限local入口・scheduler/停止・保存済み受信の確認を共通adapterへつなぎます。実製品identity、実modem/回線、Job取込み・実機の受入は別gateです。

日米のsi・メッセージ・小ファイル向け[共通message adapter](systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)を追加。有限分割・認証付き再組立・再送・TTL・共通通信量/料金予約をhostで検証する。実transport/常駐scheduler/Job引渡し・実機は未受入。Mini単体、表示4条件と既存料金gateを維持。 最新main同期の製品4/Pixel fixture2は固定検収hash一致、新host全verify3025件失敗0。[採用段階](docs/evidence/development-execution/mini-08-message-main-adoption.json)でheadCI/mainCIを原機能検収と別追跡。 Miniの共通message adapterはPR229/main a58c6ffaへ限定採用し、head全14CI・main全13CI成功。[現行受入](docs/evidence/development-execution/mini-08-message-main-current.json)。

[内蔵衛星modem・電池・回線候補と実機試験準備](docs/avocado-mini-r5/satellite-hardware-trial-plan.md)で比較条件とP0〜P5の記録項目を確認できます。 初期対象は日本・米国のsi／メッセージ／小ファイル通信に確定し、国別に検証します。実機通信・契約・閉箱携帯は未受入です。

衛星回線をWi-Fi共有する[制御prototype](systems/rock-star-os/targets/avocado-mini/tethering/README.md)を追加しました。`python3 -B systems/rock-star-os/targets/avocado-mini/tethering/demo.py` で、架空回線の接続許可・持ち出し・送受信量・料金上限・再起動復旧を試せます。実衛星/APはまだ接続していません。 host制御は[PR211](https://github.com/k999ln/rock/pull/211)でmain統合・同SHA全12CI成功。Linux制御も[PR212](https://github.com/k999ln/rock/pull/212)でmain `41ee45d7`へ統合し、同SHA全13CIの成功を確認しました。

[AP認証・網側上限adapter](systems/rock-star-os/targets/avocado-mini/tethering/ACCESS.md)を追加。 [PR215](https://github.com/k999ln/rock/pull/215)でmain `52b3d1d9`へ統合し、同SHA製品CI全13件成功。端末固有鍵と網側予約の確認後だけ転送を許可し、応答喪失や停止失敗を未確認として残します。事業者・modem未定の共通protocolで、実無線・実衛星・請求には未接続です。

Linux側の[転送制御と試験手順](systems/rock-star-os/targets/avocado-mini/tethering/LINUX.md)を追加。通常hostのcompiler試験と、使い捨てLinux VM上のroot namespace packet試験を分けて実行できます。Linux packet gate候補では、同一grantのIPv4/IPv6・送受信を共有quotaで強制し、停止・離脱・再起動時に旧許可を閉じる。隔離Linuxの実packet20件とcompiler4件に合格し、独立静的/host検収mustFix0。counterは最終確定とせず予約を保持する。実衛星/AP/Broker認証・Provider請求・電池の受入は別途必要。

### OS 節の冒頭メモ

Shellの[local capability観測](docs/rockstaros-complete-design.md#os02-capability-observation-freshness)は未来時刻・期限切れ・30秒超を未評価へ戻す修復をPR237でmainへ限定採用しました。host試験は `OS02_JAVA_HOME=<既存JDK17> python3 -m unittest tests.test_device_capability_freshness -v`。実機・全OSの受入は別gateです。

既存eSIM service setupの[provision再開fixture](docs/evidence/development-execution/esim-provision-recovery-main-adoption.json)は `node --experimental-strip-types --test tests/rockstar-service-setup.test.mjs` で検証します。file SQLiteの制御中断・明示再接続試験であり、実issuer・本番D1・電断・実課金の受入は別gateです。

### Eve 節の冒頭メモ

開発プレビューでは、Eveの「自分の担当を作る」で名前・目的・入力・期待成果を確認して保存し、続いて必要能力・Tool・PC実行先を選びます。Toolの入出力schemaと必須項目を希望と照らして確認します。Toolが追加の必須入力を求める場合は、担当の必要入力に追加してください。同じ担当でTool・実行先・入力・提供者申告の料金を確認してから仕事を作り、その後、別の実行内容の確認と承認を行うと、対応するToolの結果を同じ仕事に保存できます。料金申告は独立検証済みの見積ではなく、作成時の確認は実行許可ではありません。仕事の確認履歴では、作成時と実行直前の条件の違いを確認できます。旧仕事で記録がない場合は未記録と表示します。仕事の「mii連携のソフト試用」で同じ仕事を確認し、合成テキストを入力して「同じ仕事のTool確認へ渡す」を押すと、上のTool確認画面で引数を確認・承認できます。観測期限は30秒で、失効や停止要求時には古い表示を隠します。保存した仕事は残り、再表示には明示的な読直しが必要です。同じ仕事のソフト試用で「委任予算を読み直す」を押すと、既存A2Aの上限・予約・利用量記録を取得時点として確認できます。MCP料金や請求確定額ではなく、観測失効時は非表示になります。保存された応答はEveの仕事とmiiの両方で読み直せます。仕事からのTool実行は、既存`local-preview:` IDを設定した隔離loopback環境に限定され、通常account/eSIM・実mii・有料実行は未受入です。Tool結果は独立未検証として扱います。[契約と試験範囲](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

miiソフト試用の「追加の必要能力」には、例 `{"executor":["model.inference"],"output":["audio.render"]}` のように能力IDを指定できます。空欄なら追加条件なし。観測宣言が不足または未確認なら入力を渡さず、保存済みの仕事は引き続き読めます。宣言は実行承認や実機の証明ではありません。

作者向けSDK 0.1.5の非推論作例は、配布archiveを展開して能力宣言とToolの接続を試せます。通常のpackはdistをbuildし、旧0.1.3・0.1.4 archiveも維持します。[作例と設定手順](toolkits/sky-tool-sdk/README.md#非推論の追加例)。宣言は実行権限ではなく、公開や課金を開始しません。 合成hostではEve・Smithで作成した仕事をmiiで読み戻し、承認済みの別remote委任の停止・使用量を同じ仕事で検証しています。実機・本番の受入は別です。

既存担当に保存された対象物・希望入出力の設定は、Skyの設定画面で名前や役割を編集しても保持されます。これは実機接続や実行許可ではありません。[互換契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

Toolの能力確認では、接続先・Tool・申告版と観測日時・期限を確認できます。接続中の観測が期限切れの場合は「選択した実Toolを再確認」してください。接続先の宣言変更が検出された場合は接続画面で明示的に再接続し、内容を再照合・再承認してください。既存の仕事や結果は残ります。Tool申告は安全性や実行権限を保証しません。[照合契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

担当の能力確認では、項目名に加えて「期待する入力型」「期待する成果型」をJSON object（例 `{"text":"string"}`）で入力し、「必要な処理能力ID」をJSON配列、「許容permissionとscope」を `[{"permission":"network","scopes":["origin:example"]}]` のように明示します。「使用する接続と操作」で実Toolを選び、Toolと実行先を選択して宣言を照合・保存します。空欄は未指定、`{}` と `[]` は明示した空条件です。対象が必要なpermissionのscopeが空なら未確認になります。旧担当は新条件を本人が設定するまで未確認です。これは提供者の宣言の照合であり、権限・安全性・料金の保証ではありません。実行には別の確認と承認が必要です。[照合契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

Eveの資料付き依頼はPR232でmainへ限定採用した2〜4資料対応です。「資料を追加」「資料Nを外す」で準備し、合計8,000文字以内で保存・復元・見積比較します。2資料の既存保存は互換維持。3・4資料は新版形式で、生成・課金は開始しません。[契約と残gate](docs/rockstaros-complete-design.md#eve-multi-material)。

Eveの[保存資料の料金見積](docs/rockstaros-complete-design.md#eve-saved-source-estimate)を限定候補へ追加。`npm run dev`の`/os/eve/remix`で2〜4資料と依頼を無料準備・保存・読戻し後、「保存した資料で料金を見積もる」から必要なmodel/通貨/比較上限を選び、別の資料利用同意後に「見積のみ確認」を押します。比較上限は未承認で、生成・費用承認・課金は行いません。信頼できる単価がなければ利用不可を表示します。実local UIの保存/復元・503確認は既存2資料の履歴です。採用前の3・4資料検証はhost/API/VMのみでした。その後、実Reactと合成API/RAMによる3・4資料の保存・復元、見積表示/自然失効、owner切替を追加観測し、独立documentary検収しました。[現行証拠](docs/evidence/development-execution/eve-multi-material-main-current.json)。実認証・本番保存・Provider利用の受入は別gateです。数値正常/期限はfixtureと区別し、最新mainのSmith navとの復元・表示切替・入力保持も限定確認しました。実Provider単価・本番認証/保存・本番見積/課金・公開は別gateです。初回CIが指摘したテスト表現1箇所を修正し、製品動作は維持しています。Smith navはPR203でmainへ限定統合済みです。

### Mini 節の開発状況

### 現在の開発状況

処理中も、同じ画面内の「メインコンテンツへ」から操作欄へ戻れるよう修復中です。別画面への移動抑止は維持し、仕事や料金状態を変更しません。局所試験と合成ブラウザーfixtureで確認し、source/metadata独立検収とhost全体verifyが成功し、Git保存・最終同SHA CIへ引き継いでいます。[検証範囲と残条件](docs/evidence/development-execution/smith-running-skip-link.json)。

[Mini公開サイト](https://avocadomini.si/)にR5と製品目的を掲載。ブラウザゲームとアイデア・ゲーム投稿の受付があります。製造承認は**保留中**で、R5実機試験の完了実績は0件です。

実機の表示・入力・通話・電源・熱・保存/復旧、地域での実証、建築施工は未受入。R5の価格・発売日は未確定で、予約・決済は停止中です。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

Material Inventionは2D候補比較とSky/Zema接続がある段階で、シミュレーション・実験室接続は未実装です。

### OS 節の開発状況（Game 下書き節を含む）

### 現在の開発状況

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。 eSIMサービス管理では、保存ackの後に現在の権限・同じ契約/実行を再読込できるまで操作を保留します。null・読込失敗・権限変更時は以前の私有情報や操作を隠し、「状態を再確認」でGETだけを行います。画面復帰時も再確認し、自動で申込・課金・再送しません。[契約と検収範囲](docs/rockstaros-complete-design.md#esim-ack-reconciliation)。

[PR209](https://github.com/k999ln/rock/pull/209)はmain `8f646ff3`へ通常統合済み。同一mergeSHAの製品CI7件成功、Linux実verify2938試験/2936成功/0失敗/2skipと専用Python cache6/update23を確認しました。8f時点のDependabot自動更新1件失敗は履歴として保持し、同8fの全check成功とは扱いません。後続PR216/main d2222dc5でundici制約修正を採用済みで、当時の別の自動更新失敗はzodで、後続PR225/main f4ed492cで制約修正を採用し、同SHAの製品7・自動更新2成功を確認しました。[現在の統合証拠](docs/evidence/development-execution/pixel-cache-main-merge.json)。PR213 UIはmain `2a9828b2`へ通常統合済みです。新c43 guardの限定実機試験と元codeへの復元は独立検収済みで、[PR223](https://github.com/k999ln/rock/pull/223)へ証拠保存済み（head2c0f3dfeの7CI成功）。追加証拠はPR223/main1ec70d62へ通常統合済み（採用head7e21の7CI、merge同SHA6CI成功）。端末は元code7fへ復元済みで、新c43の常設配備とは区別します。P02全体・全OS・実金融・一般公開は未受入、公開・配備・616一括公開は保留です。

PR218は検収済みhead2f737579（8CI成功）をmain7edbb9beへ通常統合し、同mergeSHAの8check成功（製品7/補助collect1）、Linux2993/2991pass/0fail/2skipを確認。PR225/mainf4の製品7・Dependabot2成功とZod修正を別証拠で確認した。root10/Mini2は旧監査snapshotで、後続PR225 receiptではroot7/Mini1（新規監査ではない）。原receiptの失敗・pendingは保持、公開/配備/616保留。 [現在の統合証拠](docs/evidence/development-execution/pixel-esim-prepared-work-main-merge.json)。

cache-only準備は取得済みbytesのversion/capabilitiesだけを確認し、原request/scope/model/hashに束縛した保存・再確認・取消を行います。不一致/不明時に取得・修復・推論へ切り替えず、同FDの限定metadata読込と固定payload更新fenceを使います。旧f3の限定物理測定/元code復旧は新c43の受入へ転用しません。[契約](docs/rockstaros-complete-design.md#pixel-cache-only-main-port)。

Web runtime、Linux/serviceとPixel/Lab adapterのコードをmainへ統合済み。Pixel 10 GL066 / frankelでは純正OS上の試験署名APKで非破壊の実再起動受入23/23が根拠です。

全OS build・正式署名・flash/boot・data/Keystore全損復元は未完了。[Pixelの境界](docs/phone-preview-20260911.md)。QEMU Developer Previewは独立した系列として保持し、最新候補の配布受入は[QEMU担当](docs/workstreams/06-native-qemu-release.md)で管理します。

eSIMは本人用Cloud Sky・Eve・Linuxサービスへの入口です。OS binaryをeSIMへ格納しません。既存OSのclient/browserと、機種ごとに署名・起動・復旧が受け入れられたnative OSを分けます。回線、SIM profile、利用権、client導入、OS導入も別の状態です。

<br>

### Game結果から仕事の下書きを作る

仕事画面で既存host fixtureのGame結果JSONと依頼を入力し、「仕事の下書きに入れる」で申告版・入力hash・目的を確認できます。取り込みだけでは保存せず、本人が「仕事を作成」を押して既存の未実行WorkJobへ保存します。入力/名前/templateの編集、破棄、本人scopeの再読込で古いGame下書きを無効にします。不明な保存結果は同じID/内容を明示確認し、自動再送しません。Game申告は完了・実行・予算承認になりません。[契約と検証範囲](docs/game-api-contract-draft.md#game-work-draft)。

### Eve 節の開発状況

### 現在の開発状況

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。 保存資料のEve料金見積では、各単価の「100万token当たり」を1回だけ表示します。見積・上限比較・有効期限の扱いは従来どおりで、この画面から有料実行は開始しません。

会話の明示保存・読戻し・削除と、本人の成果をHTMLへ持ち出すコードをmainへ統合済み。

アカウント履歴には本人認証と運営側の `EVE_HISTORY_KEYRING` 設定が必要で、設定不足を保存成功と表示しません。履歴を開いても仕事は再実行しません。

実アカウントの別端末引継ぎは未受入です。

保存・復旧コードの統合範囲は[統合記録](data/runtime-integration-audit.json)を参照してください。

### Sky 節の開発状況

### 現在の開発状況

投稿型Home/Sky、本人別保存、コミュニティーOSの版と鍵を扱うWebコードはmainへ統合済み。[総合・Sky入口](https://avoado.si/)があります。

実X投稿・独自For You・実MCP Providerの接続や、本番の料金・請求受入を一括で完了とは扱いません。[Web担当と公開記録](docs/workstreams/05-web-pwa-sites.md)。

機能の追加、商品の購入、仕事の実行、外部送信、課金は別の操作です。Cloud利用は事前見積・上限承認と明細を必要とし、許可済み予算を超えて実行しません。モデルの出力や作者の署名を権限承認へ昇格させません。mainと旧作業branchの料金案の差は[Git統合監査](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)で別に照合します。

### Pro 節の開発状況

### 現在の開発状況

[Pro公開サイト](https://avocadopro.si/)で構成検討・保存・購入希望受付と事業目的を案内。最初の実機は銀色Lian Li A4-H2Oで試作する候補です。

実機組立・部品適合・供給契約・在庫確保・最終価格・決済・配送は未受入。半導体確保は事業目的であり、確保済みの実績ではありません。有料注文は開始していません。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

### 開発と検証 節

## 開発と検証

[eSIM復旧試験・Mini設計の現行受入](docs/evidence/development-execution/esim-mini-ready-design-main-current.json)はPR240/main c3c4845cへ通常統合済みです。head7/main6CI成功、Linux3075試験失敗0。PDF58頁はGit外、実開通/実課金・光学/PCB・実機/全体受入・公開は別gateです。

[eSIM ready復旧試験](docs/evidence/development-execution/esim-ready-recovery-review.json)は `node --experimental-strip-types --test tests/rockstar-service-setup.test.mjs` で実行します。制御中断後のSQLite再open試験で、実開通・実課金の受入ではありません。

[Mini空間OS設計v0.10](docs/avocado-mini-r5/spatial-computer-use-design.md)は `python3 docs/avocado-mini-r5/render-spatial-design.py output/pdf/avocado-mini-spatial-os-design.pdf` で再生成します。Python/reportlabと埋込可能な日本語TrueType fontを用意し、必要なら `MINI_PDF_JAPANESE_FONT` を指定します。PDFはGit外、旧local研究の参照可用性と採用済み実装は第1.2章で区別します。

準備済みPixel/Miniの[現行受入](docs/evidence/development-execution/prepared-device-mini-main-current.json)はPR238/main440fへ通常統合済みです。最終head14/main13CI、Linux3074試験失敗0・common103/packet26成功を確認。旧231/234は238経由の採用として区別し、元失敗・修復・検収receiptを保持します。Developer Previewの限定範囲で、実機・実回線・実camera精度・全OS・公開は別gateです。

Pixel診断の正常fixtureは、実empty観測からstdout出力を順序付けて時刻・hash・CPU・privacyのassertionを維持します。`python3 -B tests/test_pixel_worker_diagnostics.py` を入口とし、[独立検収と採用段階](docs/evidence/development-execution/pixel-empty-observation-main-adoption.json)でLinuxとhost、初回CI失敗と同SHA retryを分けます。OS237とSmith235の現行Git/CI受入は各current receiptに記録し、実機・全OS・公開は別gateです。

Gameの旧UI反例は固定main `ee9b88010c4ccb20be1db46177e3805380995c4b` を参照します。浅いcloneで検証する場合は `git fetch --no-tags --depth=1 origin ee9b88010c4ccb20be1db46177e3805380995c4b` で準備します。CIもこのcommitだけを取得し、旧WorkbenchのSHA256 `d93e120c16b86f136cada419a500a4b192e71319fafc597024bab701f6b7f6c2` を照合してから反例を実行します。

undiciはrootで修正版7系（`^7.30.1`）、Miniサイトで修正版8系（`^8.12.2`）をoverrideで許容し、各lockfileで実版を固定します。`npm ci` と `npm ci --prefix sites/avocado-mini` 後に `node --test tests/undici-dependency-security.test.mjs tests/undici-tls-options.test.mjs` で依存先とTLS設定の保持を確認できます。[修正・検証記録](docs/evidence/undici-security-constraint.json)。

Node.js 22.13以降とnpmを使用します。Webのローカル起動:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

Mini/ProのWebソースは [sites/avocado-mini](sites/avocado-mini/) に共通で保存します。正式ドメインのrootはWorkerで各製品へ振り分け、旧 `/mini/`・`/pro/` は正式URLへ転送します。

変更の検証:

    npm ci --prefix sites/avocado-mini
    npm run project:update
    npm run design:check
    npm run verify

実装の承認・受入gate、次の作業、検証結果は [project.md](archive/root-snapshot-20261029/project.md)、[進捗JSON](data/project-status.json)、[作業分野](docs/workstreams/README.md)を確認してください。[全タスクの進捗](archive/root-snapshot-20261029/project.md#全taskの作業進捗)も参照できます。作業数は製品の完成率を表しません。GitHub保存、mainへの統合、各サイトの配備は別に記録します。

### 権利と公開 節の開発者向けメモ

Development: the explicit offline D1 alias helper is documented in [Git operations](docs/workstreams/10-git-ci-operations.md#git-04-explicit-local-d1-filename-alias-compatibility). It does not perform remote migrations or complete the Root/main schema union.

The offline alias helper requires SQLite authorizer/serialize/deserialize APIs (tested Node26.12.1), reviewed reference profiles and a second independently reviewed candidate before adoption. It never executes source SQL during planning.

Repository verification (`npm run verify`) uses Node26.12.1, matching the verify workflow and the accepted offline SQLite helper API boundary. `package.json` retains the existing application engine floor; it does not declare older engines capable of the offline helper. Tests are not skipped to emulate missing authorizer/serialization APIs.

Offline apply now requires an owned private0700 parent for both source copy and backup, trusted directory ancestry and a single-link complete rollback-journal SQLite copy with no recovery/WAL sidecars. It does not repair or modify a live database into that state. Backup snapshot bytes are saved, synced and restored through one O_EXCL/no-follow fd, held through the guarded commit; detected namespace replacement/disappearance refuses the operation. Single-operator offline copies are the scope; arbitrary root/same-UID host code is not isolated by this helper.

開発者向け: PR248でmain統合・同SHA CI確認済みのservice attachment検証は、入力から分離したsnapshotを返します。フィールド・署名wire・API引数・TTLは維持し、object identityの同一性を前提にせずfieldを扱います。成功値をdispatch許可にせず、現在factsと既存atomic gateを確認してください。[契約](docs/rockstaros-complete-design.md#esim-attachment-async-binding)。

開発の現在primaryはmiiの成立判断1件です。実行queueと所有・証拠段階は[data/development-model-routing.json](data/development-model-routing.json)のcurrentExecution、運用と残gateは[Git作業入口](docs/workstreams/10-git-ci-operations.md#execution-recovery-20261028)を参照してください。`npm run mission:check`は宣言の矛盾を拒否しますが、実GitHub/物理受入の証明は独立検収で確認します。

