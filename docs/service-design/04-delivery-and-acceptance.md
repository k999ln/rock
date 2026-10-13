# 実現順と受入

再構成版 1.0。最初に完成させるのは、文章を納品する個人が「自分の素材から成果を作り、確認・保存・持ち帰り・再利用できる」一周。需要と改善量は実測で判定し、Mini/Pro/Rocketstarの研究と非金融Gameを並行して進める。

主担当はGit / CI / Operations、ROCK、既存DOC04、AMC主担当H1。Sky/ZemaはO5/SKY21、WebはWEB06、共通runtimeはOS10、ProはP2/MAT16、Game/発明は既存AI06等のtaskPlansへ渡す。担当は[Mission Control](../mission-control.md)のtaskAssignmentsを正本にし、prefixから推測しない。

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

加えて、worker/reviewer別delegationは存在するが、手動owner検収と真正なreviewer証拠のserver相関照合を区別する必要がある。AMC APIでowner/Goal revision/leaf/別delegation/成果hash/usage/判定を照合する受入、COLOMBIA原本/版、context grant、native UI、実Providerのgateを個別に残す。

横断統合では[整合契約と12シナリオ](06-consistency-contracts.md)を先に固定する。root/leaf/子job/role/realmのserver相関、account/Goalを束ねた予算、取消fence、真正なreview/実artifact、grant/保持/削除/backup、authority epochの順で不足を修正する。現行A2AのparentJob予算だけを月上限へ読み替えない。

## 1. 既存の成果を持ち帰れる一周

担当: O5/SKY21とWeb/WEB06、ROCK。再利用: 引用整理・無料記事・CSV・結合・形式検査、composition、既存WorkJob、owner保存、原成果を保持する編集、レシピ。

不足: 同じ公開artifactで本人が素材を入れ、review・download完了・同じjob再取得・次のレシピへ進む最終受入。mainとSite固有のCSV lease/納品revision/DB移行を保存互換のまま整合する。

合格証拠: desktop/390px/狭い画面、keyboard/focus、本人A/B/A、401、保存commit後応答喪失、process終了、再取得のhash、端末のdownload完了。初回結果までの時間、再利用と復旧所要時間を既存手順と比較する。計測値がないうちは改善を宣言しない。

## 2. アカウント・費用・実Agentを一周へつなぐ

担当: O5/SKY21、Wallet/Billing/Securityの既存担当、ROCK/JOINT/OWNER。再利用: 本人認証、device link、service access、見積、A2A委任、usage receipt、取消・結果不明照合。

不足: 自前passkey登録/紛失復旧/Web Push、期間パスと後払い/月上限の同意、stored balanceを持たないbudget予約と現行funded-wallet gateの整合、信頼価格・実meter・請求・返金照合。既存成功報酬のexecutionHoldsは解除しない。

順序: 課金ADR/Provider条件→sandboxでexactな見積と同時予約→本人の上限と同意→実Providerの有限仕事→meter/取消/不明照合→請求/返金→同じ公開artifactで限定本人受入。外部契約と対象額が揃うまでは無断課金しない。

合格証拠: 同一job/quote/owner、上限0、並列予算競合、期限切れ、料金改定、通信断、停止要求と確認、遅い結果、請求失敗、月境界、項目別usage。credential設定済みや自然な返答だけを合格にしない。

## 3. Skyを場所が変わっても使えるようにする

担当: O5/WEB06、Core/AI05、ROCK/JOINT。まず通常SkyとmainのColumbia NFC英語入口を同じsource/実responseで受け入れる。カードにURLだけを書き、NFCを本人・利用権・鍵にしない。

5大学共用Hub、対象学生6枠/一般5枠、host app内成果は元作業コピーの追加候補として正本と競合を確認する。アプリ連携は認証、recipient/scope、artifact schema、削除/失効、version対応、本人A/Bを同じAPIで受け入れる。別origin SDK・スマホcloud MCP・有料追加枠を画面だけで完成にしない。

複数clientは既存jobを表示/照合し、単一authority deviceの移管は独立gate。PC sleep・圏外・失効で仕事を重複実行しない。OS内Zemaとhost app結果画面の違いを、業務契約の複製で解決しない。

## 4. OSとハードウェアの独立系列

PixelはOS10/RLS02、正確なPixel10 GL066/frankel、専用x86_64 Linux full build、正式署名、同じimageのboot/権限/保存/再起動/OTA/rollback/純正復旧。試験署名APK23/23や後続Shell受入をfull OSへ転用しない。QEMU/RQ12は独立Developer Previewで同一archive受入を維持する。

MiniはR5の単独操作/保存/停止、光学・入力・安全のprototypeとIoT回線benchを分ける。Proは既存MAT16の閉箱BOM/QVL/si/game/熱/復旧matrix。Game/発明は非金融fixtureと合成digital twinを共通jobへつなぐ。rocketstarは専用地上記録/観測adapterの契約から進め、工学/製造/飛行gateを独立に保持する。

各系列の成果はそのprofileの証拠で判定する。汎用Web回帰の成功をhardwareの成立条件へ数えない。

## 未決定事項と決め方

- **Jenniferの統合・検収・context** — ROCKが統合sourceのworker/reviewerのserver証拠相関と既存AMCの受入を検証する。OWNERがCOLOMBIA原本/版と利用資料を指定し、JOINTがProvider/nativeの同一候補を受け入れる。役割を再質問せず、既存Git正本を使う。
- **期間パスの対象・金額・期間** — OWNERとBillingが既存確定範囲内でSKU、対象能力、更新通知、取消/返金条件を固定する。最終確認画面とsandbox/外部確認を通してから販売へ進む。
- **後払いと旧Wallet gate** — ROCKが支払能力・budget reservationのADRと移行案、EXTERNALが価格/meter/Stripe条件を出す。並列月上限・結果不明・請求失敗を受け入れるまで旧paid gateを開けない。
- **大学別候補の優先順位** — OWNERの最新指示とmainのColumbiaカードを起点に、元dirty候補を同じSkyへ統合する範囲を確定する。学生所属/枠の資格水準、追加枠価格と実NFCは未受入。
- **Pro最終構成・Mini表示/回線** — 各hardware担当が値入りBOM/ICD/試験を出し、OWNERが候補と調達条件を決める。旧価格/旧Hubや比較仮定を製品仕様へ昇格しない。

## 継続する時に読むもの

[再構成の証拠](../evidence/service-design-rebuild.json)、[プロジェクト進捗](../../data/project-status.json)、[Mission Control](../../data/mission-control.json)、[次の実行プロンプト](../prompts/rock-current-next-20261002.md)。次の実装ではまず最新main/対象branch/公開artifactとdirty候補を保全照合し、上記1の一周を同じsourceへ固定する。

文書検証は `npm run project:update`、`npm run mission:update`、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`npm run mission:check`、最後に `TMPDIR=/private/tmp npm run verify`。UI実利用の受入は実装変更を対象に別途行い、この設計保存だけで実施済みにしない。
