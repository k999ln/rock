# 実現順と受入

再構成版 1.0。最初に完成させるのは、文章を納品する個人が「自分の素材から成果を作り、確認・保存・持ち帰り・再利用できる」一周。需要と改善量は実測で判定し、Mini/Pro/Rocketstarの研究と非金融Gameを並行して進める。

主担当はGit / CI / Operations、ROCK、既存DOC04、AMC主担当H1。Sky/ZemaはO5/SKY21、WebはWEB06、共通runtimeはOS10、Pro統合設計はP1、PC実装はP2/MAT16、Game/発明は既存AI06等のtaskPlansへ渡す。担当は[Mission Control](../mission-control.md)のtaskAssignmentsを正本にし、prefixから推測しない。

横断調査で見つかった不足は[14 gapと改修順](07-ecosystem-strategy-and-data.md#i-不足を何で補いどの順で直すか)へまとめた。月/Goal予算と後払い、実Provider identity、realm間移行、削除/backup、host/建築Mini/Proの実受入を既存taskへ接続する。

## 設計入力の現在地

最初の設計入力の読取確認: GitHub main `4273ef02da9dbb28ede8ba8862b874615fa8a0d7`、同一SHA6 check成功。mainにはPR #105/#110由来のcomposition・原成果を保つ編集・レシピ・保存/設定復旧の改善が統合済み。open PRが残っていてもmain内のコードを未実装へ戻さない。公開Site v54/source `b10c566`の既存記録は別artifactであり、今回の公開readbackではない。

元の作業コピーは`codex/esim-cloud-access`/`37c06cec`と未保存差分を持ち、同名remote branchは確認できなかった。5大学共通Sky/Fitness成果plugin/要求署名eSIMは、この候補と最新mainのColumbia英語NFC・既存authを比較して個別統合する。再構成は最新mainから分離したbranchで保存し、元のdirty変更を保全する。

JenniferはPR #113 / head `3349c2475468443bc7ecd94a4e3782343f514a8f`で役割とsourceを確認し、2026-10-13 18:21:19 UTCにmain `01d2e41857e8e713bd5df31476deaea8c942e983`へ統合された。head8check、main7checkは各同一SHAで全成功。役割不明の扱いを訂正し、今回の設計へ利用者窓口→裏のZema/AMC→担当siという関係を継承する。

## 0. 基準と引継ぎを揃える

原因: 設計と進捗が複数branch・公開Site・歴史資料へ分かれ、古いSIM入口や過去の受入が現在の説明へ残っている。

成果物: 入口と6章の計7冊、更新した関係図/ポータル/全体・Tool設計の入口、baselineの再構成理由、横断契約と12受入シナリオ、si表示の統一、証拠と進捗。原本R5/R1.0/PDF、vendor、実行契約、旧受入証拠は維持する。

合格: RQ01〜RQ50の対応、リンク、design/baseline/project/mission整合、`npm run verify`。文書保存、作業branchのGit保存、GitHub、main統合、公開は別記録。設計の見やすさをruntime修正の完了へ換算しない。

### Jenniferの統合済みsourceと残る受入

初回source `d0151e89`のMCP ZIP/source不一致とSPIDER生成module/依存不足は、`89f869df`/`3349c247`で修復され、同一head8check全成功を確認後PR #113がmainへ統合された。今回のdesign branchもmainを保全mergeし、si表示を同期した。このGit/CIの解消を真正review証拠や本番Providerの受入にしない。

現行mainにはAMC APIの型付きTaskReport/ReviewReportと、root/plan/task、workerのpredecessor委任、成果hash、usage、判定のserver相関処理がある。新しい台帳を作り直さず、この処理を再利用して手動owner判断とremote検収を分ける。残る受入は実Providerのidentity/運用上の独立性、公開D1/secret/trust/callbackでの一周、COLOMBIA原本/版、context grant、native UIである。

横断統合では[整合契約と12シナリオ](06-consistency-contracts.md)を先に固定する。root/leaf/子job/role/realmのserver相関、account/Goalを束ねた予算、取消fence、真正なreview/実artifact、grant/保持/削除/backup、authority epochの順で不足を修正する。現行A2AのparentJob予算だけを月上限へ読み替えない。

## 1. 既存の成果を持ち帰れる一周

担当: O5/SKY21とWeb/WEB06、ROCK。再利用: 引用整理・無料記事・CSV・結合・形式検査、composition、既存WorkJob、owner保存、原成果を保持する編集、レシピ。

不足: 同じ公開artifactで本人が素材を入れ、review・download完了・同じjob再取得・次のレシピへ進む最終受入。mainとSite固有のCSV lease/納品revision/DB移行を保存互換のまま整合する。

合格証拠: desktop/390px/狭い画面、keyboard/focus、本人A/B/A、401、保存commit後応答喪失、process終了、再取得のhash、端末のdownload完了。初回結果までの時間、再利用と復旧所要時間を既存手順と比較する。計測値がないうちは改善を宣言しない。

## 2. アカウント・費用・実Agentを一周へつなぐ

担当: O5/SKY21、Wallet/Billing/Securityの既存担当、ROCK/JOINT/OWNER。再利用: 本人認証、device link、service access、見積、A2A委任、usage receipt、取消・結果不明照合。

Jennifer/Columbia限定の自前passkey登録、assertion検証、session、復旧時の旧credential/session一括失効、auditはsourceとlocal試験まで実装した。初回登録・復旧は既存Sites accountをownerに結び付けるが、platformからfresh reauthentication時刻を取得できないため、本番で本人が登録・再訪・復旧・旧端末拒否を読戻す受入は残る。複数端末を旧credential失効なしで追加する管理画面、親domain全体の共通passkey、Web Push、期間パスと後払い/月上限の同意、stored balanceを持たないbudget予約と現行funded-wallet gateの整合、信頼価格・実meter・請求・返金照合も不足する。既存成功報酬のexecutionHoldsは解除しない。

順序: 課金ADR/Provider条件→sandboxでexactな見積と同時予約→本人の上限と同意→実Providerの有限仕事→meter/取消/不明照合→請求/返金→同じ公開artifactで限定本人受入。外部契約と対象額が揃うまでは無断課金しない。

合格証拠: 同一job/quote/owner、上限0、並列予算競合、期限切れ、料金改定、通信断、停止要求と確認、遅い結果、請求失敗、月境界、項目別usage。credential設定済みや自然な返答だけを合格にしない。

## 3. Skyを場所が変わっても使えるようにする

担当: O5/WEB06、Core/AI05、ROCK/JOINT。まず通常SkyとmainのColumbia NFC英語入口を同じsource/実responseで受け入れる。カードにURLだけを書き、NFCを本人・利用権・鍵にしない。

5大学共用Hub、対象学生6枠/一般5枠、host app内成果は下記の保存済みbranchと元作業コピーの候補を比較し、正本との競合を確認する。アプリ連携は認証、recipient/scope、artifact schema、削除/失効、version対応、本人A/Bを同じAPIで受け入れる。別origin SDK・スマホcloud MCP・有料追加枠を画面だけで完成にしない。

### 並行する大学NFC・Sky候補の引継ぎ

PR #114へ保全した2026-10-13の上流main baseは`d779297a8684111ac8948137c0ecc3d83b84c5e8`。#115のSky Phoenix/完成feed/Columbia/local Agent、#116/#117のlocal preview・Site互換DB移行、#112の5大学Hub/PWA/NFCと型付きapp成果表示、#118のcanonical D1 bridge/legacy履歴保全が統合済み。#112 headは`df756bea745277b2a292790e843f185e80f00b02`、#115 headは`64cfc83402c8c0b8cde054e10262982838fa85af`。これらをopen候補や未実装へ戻さない。本設計branchは最新mainを保全mergeし、head `7b27ae7d`の全体verify/同一SHA9 CI成功後、利用者の「mainへあげて」によりPR #114をmain `59412c04`へ通常mergeした。merge treeは受入headと一致。Site再配備と実受入は別。

NFC担当からの別artifact報告は`avoado.si`のSky v48/source `202ab24e8f2b8d427ea4602ce689fffcd90772db`、5大学の`/os/sky/campus/{nyu|fit|columbia|fordham|johnjay}/hub?source=nfc`。version/sourceと実画面の受入は担当報告として保持する。2026-10-13 20:35 UTCに本設計担当がHTTP再読取りを行い、`/`・`/os/sky`・`/os/sky/outputs`・5大学Hubの8URLで200と各ページtitleを確認した。これだけでは配備source一致、画面操作、実カード、学生資格/枠、Providerの受入にならない。カードのURLは大学contextを選ぶだけで、本人性、学生所属、優待、購入、実行権限を与えない。既存OS/browserからSky→Zemaへ進める。NTAG215への実書込・iPhone/Android再読取り、6枠の運用、有料MCP/Providerの一周は独立した未受入条件である。

統合順は最新mainと適用済み#115/#116/#117の保全→本設計の入口/優先順→残るdirty候補の未回収差分の比較→同一候補のCI/UI/実NFC受入。NFC担当のmerge比較報告では`components/sky-workspace.tsx`、`project.md`、`tests/web-route-style-contract.test.mjs`が競合対象。採用時に最新headで再比較し、大学別導線・host成果・feed・local agentの双方の必要機能を保持する。別origin、所属確認、学生枠、料金gateをURL表示だけで成立させない。

複数clientは既存jobを表示/照合し、単一authority deviceの移管は独立gate。PC sleep・圏外・失効で仕事を重複実行しない。OS内Zemaとhost app結果画面の違いを、業務契約の複製で解決しない。

### 同じSiteへの配備で大学入口を失わない

NFC担当から、Sky Site `sky-marketplace` のv49/source prefix `b06402db`（2026-10-13 19:57 UTC公開）が`/os/sky`と大学Hubを削除して404となり、v48の再配備で復旧したとの報告を受けた。これは別担当による障害・復旧報告であり、本設計担当が配備した記録ではない。v49の追加機能はv48の必要routeと比較して保全統合する。

同一Siteの次の配備は、直前の受入済みsource/versionを取得し、`/`・`/os/sky`・`/os/sky/outputs`・5大学HubとNFC queryを回帰対象へ固定する。配備前に同じ候補のrouteと画面を確認し、配備後にsource/version・HTTP・title・実画面とSky→Zemaを読戻す。別候補が同じSiteを更新していた場合は最新の機能を保全比較し、古い候補で上書きしない。routeや画面が欠落した候補を公開受入とせず、既存の復旧手順・直前の受入済みversionを使う。本人性、学生枠、実NFC、有料MCP/Providerのgateは別に残す。

## 4. OSとハードウェアの独立系列

PixelはOS10/RLS02、正確なPixel10 GL066/frankel、専用x86_64 Linux full build、正式署名、同じimageのboot/権限/保存/再起動/OTA/rollback/純正復旧。試験署名APK23/23や後続Shell受入をfull OSへ転用しない。QEMU/RQ12は独立Developer Previewで同一archive受入を維持する。

MiniはR5の単独操作/保存/停止、光学・入力・安全のprototypeとIoT回線benchを分ける。Proは既存MAT16の閉箱BOM/QVL/si/game/熱/復旧matrix。Game/発明は非金融fixtureと合成digital twinを共通jobへつなぐ。rocketstarは専用地上記録/観測adapterの契約から進め、工学/製造/飛行gateを独立に保持する。

各系列の成果はそのprofileの証拠で判定する。汎用Web回帰の成功をhardwareの成立条件へ数えない。

### OS候補を引き継ぐ際の検査

QEMU/RQ12はsource/依存版/manifestから新しい領域へ再buildし、同一archiveのfresh導入、boot/native UI/Sky/模擬Wallet、許可外操作・通信・重複拒否、通常終了/再起動後の結果・同意・履歴、更新失敗/容量不足/通信断、A/B/backup復元、削除までを一連で記録する。開発者の既存VMやprivate pathへ依存した試用を配布受入にしない。Gameを追加した候補は過負荷/停止でもCoreとWalletの基本操作を維持できることを再試験する。

Pixelは正確なSKUのBSP/firmware/vendor/partition/AVB/rollback index、再配布条件、純正復旧物/hash、USB経路、署名鍵保管/rotation、更新前後のdata互換、保守担当/SLAを揃えて既存first-flash gateへ進む。OTAでsystemを戻しても共有userdataや外部取引が戻るとは扱わず、直前OS/backup形式との互換、未確定取引とauthorityの再照合を受け入れる。開発用userdebug/ADB/root、APK、Cuttlefish、QEMUの成功を正式user imageや実機の証拠へ移さない。

旧AT01〜AT14の分類は[Native OS検証](../native-os-validation.md#継続受入と旧設計からの引継ぎ)に集約する。旧並列数・時間・電池/熱・catalog期限等の仮定は自動採用せず、現行profileの強制点/実測/証拠と、[OS受入報告](../templates/os-acceptance-report.md)、[Native/QEMU](../workstreams/06-native-qemu-release.md#continuing-acceptance)、[Device gate](../../data/android-first-flash-gate.json)へ結ぶ。

## 未決定事項と決め方

- **Jenniferの統合・検収・context** — ROCKが統合sourceのworker/reviewerのserver証拠相関と既存AMCの受入を検証する。OWNERがCOLOMBIA原本/版と利用資料を指定し、JOINTがProvider/nativeの同一候補を受け入れる。役割を再質問せず、既存Git正本を使う。
- **期間パスの対象・金額・期間** — OWNERとBillingが既存確定範囲内でSKU、対象能力、更新通知、取消/返金条件を固定する。最終確認画面とsandbox/外部確認を通してから販売へ進む。
- **後払いと旧Wallet gate** — ROCKが支払能力・budget reservationのADRと移行案、EXTERNALが価格/meter/Stripe条件を出す。並列月上限・結果不明・請求失敗を受け入れるまで旧paid gateを開けない。
- **大学別候補の優先順位** — OWNERの最新指示とmainのColumbiaカードを起点に、#112/#115のmain適用を保持し、元dirty候補の未回収差分を比較して同じSkyへ統合する範囲を確定する。学生所属/枠の資格水準、追加枠価格と実NFCは未受入。
- **Pro最終構成・Mini表示/回線** — 各hardware担当が値入りBOM/ICD/試験を出し、OWNERが候補と調達条件を決める。旧価格/旧Hubや比較仮定を製品仕様へ昇格しない。

## 継続する時に読むもの

[再構成の証拠](../evidence/service-design-rebuild.json)、[プロジェクト進捗](../../data/project-status.json)、[Mission Control](../../data/mission-control.json)、[次の実行プロンプト](../prompts/rock-current-next-20261002.md)。次の実装ではまず最新main/対象branch/公開artifactとdirty候補を保全照合し、上記1の一周を同じsourceへ固定する。

文書検証は `npm run project:update`、`npm run mission:update`、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`npm run mission:check`、最後に `TMPDIR=/private/tmp npm run verify`。UI実利用の受入は実装変更を対象に別途行い、この設計保存だけで実施済みにしない。

任意サービスclaimの公開`/connect`はMini proxyへ送らずSky Worker自身が扱う。限定prefix修正とclaimリンク/POST/HEAD/近似prefixのfixtureを受け入れた。これはホストのルーティング契約で、同じ配備物の本人claim登録・issuer・device・本番失効の受入は別gateである。
