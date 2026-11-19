# Eve「仕事の窓口」開発実行プロンプト

作成: 2026-10-21（America/New_York）。主担当: Product / UX（UXRS01、ROCK）。連携: SKY12/SKY21、BIL02、OS10、Security、Web、Git/CI。**この文書を読んだ担当は実装と検証を進める。文書更新だけでEveを完成と記録しない。** 本人が明示したEve＝SIの単一窓口を製品表示に使い、既存`zema`・Jennifer・AMCの保存IDや内部処理は互換性を保って再利用する。RQ01〜RQ49と`docs/rockstaros-complete-design.md#eve-work-desk`を正本にする。

## 0. 着手時の事実を取り直す

まず`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/01-product-ux.md`、`docs/prompt-playbook.md`、`docs/execution-approval-20260909.md`、`data/execution-approval.json`、`docs/design-implementation-alignment-20260909.md`と`phaseGates`を読む。設計v1.1の実装承認を再要求しない。`npm run prompt:context`または同等のGitHub読取りでmain、実在branch、関連PR、**同一SHA**のCI、対象sourceと試験を再取得する。取得失敗を「最新確認済み」にしない。

2026-10-21の読戻し時点ではGitHub mainは`01b6aecd8b4d8bd2385665232dfb4b57029f991f`で、同一SHAのRock star verification、SPIDER repair/security、CodeQLが成功。作業checkoutの`codex/esim-cloud-access`は`951d82d5a491a284aed4e0d4d280171d835d4b43`で、同一SHAで確認できたのはphone source preparation成功のみ。`npm run prompt:context`はGitHub文脈を確定できずexit 2だったため、上記はGitHub接続から同等の読取りで取得したsnapshotである。作業木には多数の未commit差分がある。resetやforce pushで消さない。

製品baselineの監査入力である旧main`7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head`fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head`de5b102d3525daccf604efd5685bdf8c14ad5d50`は**履歴snapshot**であり、現在のhead/CIではない。

関連PRは#170（Jennifer coordination、mainへ統合済み）、#180（外部AI送信claim台帳、統合済み）、#181（D1 recovery watermark、統合済み）、#110（複数Toolの仕事・レシピ・成果編集、**open**、head`b10c56688b9e38045685246c718d2de7c6f92f2c`、同一SHAのRock star verificationとrepository securityは失敗）、#105（仕事の二重保存・入力消失・復旧競合、**open**、head`6b72470ce25d4e7b20940b1698fde5a12281ed69`、同一SHAのverification成功・repository security失敗）、#130（main catchup、open）。実装前に状態を再確認し、open PRをmain実装として数えない。mainに新しい送信台帳・coordinationがあるため、**最初の変更はmainと作業branchの引継ぎ入口・優先順位・対象契約の同期**とする。dirty checkoutは保全し、必要なら分離worktreeを使う。文書保存、branch反映、GitHub保存、main統合を別々に記録する。

## 1. 一件の利用体験と既存契約を固定する

本人の依頼→目的・入力・期待成果の確認→Skyで選択済み能力を同じowner/jobに引継ぎ→計画（Agent/Toolの順序、依存、送信先、権限、見積、上限、期限、停止条件）を表示→**計画revisionへの本人承認**→許可範囲で実行→進捗・予約費用・確定使用額→成果検収・保存・書出し・別アプリ読戻し、を代表job一件で通す。利用者向けは「下書き／承認待ち／実行中／検収待ち／完了／停止／失敗」の7状態。内部の`cancel_requested`・`indeterminate`・`remote_completed`等を隠して誤って「停止済み」「完了」と表示しない。失敗時は残ったデータ、費用状態、再開できるstepを普通の言葉で示す。

次を実際に読み、`要望 / main・branch SHA / source / 現在の実装 / host・fixture・provider・端末・本番の証拠 / 不足`を記録する。

- 仕事と会話: `lib/workflow.ts`、`lib/work-store.ts`、`app/api/work-jobs/route.ts`、`components/sky-chat-workspace.tsx`、`app/api/eve/`、Eveの履歴・owner保存、対応migrationと試験。ローカルではreadyな`mr-citations` Toolの確認カード→明示実行→同じEve会話の結果→reload保持を合成記事でブラウザ確認済み。これは汎用Agent連鎖ではない。
- 複数step: `lib/work-composition.ts`、`lib/work-composition-executor.ts`、`app/api/work-jobs/composition/route.ts`、PR #110の実装・失敗CI、mainのJennifer/AMC plan graph。既存の有限DAG・レシピ・成果編集を比較し、同じ業務契約に統合する。PRの失敗を修正せず採用しない。
- 外部実行と継続: `lib/a2a-delegation-store.ts`、`lib/a2a-delegation-recovery.ts`、`lib/a2a-usage-receipt.ts`、`lib/remote-ai-text-store.ts`、mainの送信claim台帳・watermark、`docs/sky-cloud-continuity.md`。承認済みoffline継続と、Providerで実際に継続・停止した証拠を分ける。
- 費用・成果: 既存Wallet予約/台帳と請求契約、`lib/a2a-result-handoff.ts`、`lib/sky-owner-export.server.ts`、成果hash・owner/revision check、独立reader試験。Eve表示額を検証済みreceiptなしで確定しない。
- OS移植: Web業務契約とfixtureを基準に`docs/os-prototype.md`、`docs/native-os-integration.md`、Pixel 10 GL066／frankel向け受入を別gateで照合する。APK・QEMU・host成功を同一imageの物理OS受入へ転用しない。

mainの#170に残るJennifer coordinator表示と、本人の新しいEve単一窓口の指示は**名称・責務の差分**として扱う。Eveを本人向け入口とし、内部Zema job、Jennifer/AMC graph、model profileのIDは互換維持する。別の第2窓口や新契約を作らず、保存済み会話・仕事・成果の読戻し試験を通す。

## 2. 原因、修正順、合格証拠

| ID | 現在の差・原因 | ROCKの修正順 | 合格証拠・未解決条件 |
| --- | --- | --- | --- |
| EVE01 | Sky選択→Tool一件の確認/結果はあるが、会話で確認した目的・入力・期待成果と同一owner/job/revisionの永続draftが全入口で一致しない | 既存owner保存と`lib/workflow.ts`遷移でdraftを作り、Sky選択ID・版・権限・入力を結ぶ。修正競合は409で再確認 | 別owner拒否、二端末同時編集、reload後の内容/選択/計画revision一致。model文言をTool成功へ昇格させない |
| EVE02 | Web jobの`active/review/completed/cancelled`とA2A内部状態、Eveの7表示状態が分散する | 状態を増殖させず、許可された遷移と本人向け投影を定義。送信結果不明・停止要求中・remote結果受領・検収前を分ける | 全内部状態→7表示のfixture、禁止遷移拒否、古いrevisionの完了/停止/承認拒否。`cancel_requested`は停止完了にしない |
| EVE03 | Tool compositionは限定DAG、Cloud delegation/AMCは別経路で依存・引継ぎが一件にまとまらない | 既存有限DAGとgraphを比較してjob内step/attempt/依存/結果referenceを統一。前stepの真正なreceipt後だけ後続を解放 | 2 Agent＋2 Toolの順序・並列・部分失敗・再開・上限step数、未完了依存の実行0件。外部Agentはsandbox接続まで未受入 |
| EVE04 | 見積、署名済みquote、Wallet予約、実行権限が経路ごとに独立 | 計画revision・送信先・scope・Tool版・上限額・期限・停止条件を承認対象に固定。開始前に原子予約し、追加費用/権限/送信先/版変更なら待機して再承認 | 無承認・見積欠落・上限超過・送信先変更時のdispatch 0件、承認後の正当一回実行。新料金を創作せず現契約の未決値はfail closed |
| EVE05 | 画面内runner成功と、画面を閉じても続くserver jobは異なる | 承認済みjobだけserver側lease/checkpoint/deadline/epochで継続。ack消失・結果不明は同じprovider referenceで照会し、保証できない再送を止める | browser閉鎖/再open、server再起動、旧worker、期限切れ、応答消失でも外部作用・予約・usageの二重化0件。Provider照会不能は`indeterminate`で保留 |
| EVE06 | 進捗・予約額・確定usageの表示と台帳照合が一件のEve UIで未完走 | step receiptとusage IDを検証し、予約、暫定使用、確定明細、残上限を同一jobへ投影。遅延/逆順/重複イベントを吸収 | 画面とAPI/台帳の額一致、重複receipt 1件扱い、上限到達で新規作用拒否、推定/確定の明示。実Provider計量未接続は未受入 |
| EVE07 | 停止ボタンとProvider停止受領は異なる | 停止要求を永続化し後続stepを遮断。Provider取消を同じattemptで照会し、証拠が揃ってから停止済みにする。old workerをfence | cancel未確認、遅延成功、取消拒否、再起動、期限切れを試し、停止要求中と実停止を別表示。Provider stop receiptなしは`cancel_unconfirmed`相当で保持 |
| EVE08 | job成果とowner exportはあるが、検収・保存・独立アプリ読戻しまでの一周が未受入 | artifact原本/hash/receiptを結び、本人の受領/差戻し、保存、版付きexport、別readerでのbyte/hash読戻しを通す。失敗画面に残存データ・予約/請求・安全な再開点を示す | 別owner拒否、破損/欠落拒否、他アプリ独立parserの値/hash一致、再開後に確定stepを再実行しない。実別端末・実Providerは別gate |

## 3. 実装・検証の順序

1. **同期と差分表:** dirty変更を保全し、mainの#170/#180/#181とopen #110/#105の対象source/試験/CIを比較する。mainベース未反映なら引継ぎ入口・優先順位を最初に同期し、採用/保留の理由を記録する。
2. **代表job:** EVE01・02・04を実装し、Sky選択→Eve draft→見積と計画→本人承認→既存ready Tool実行→同一会話/仕事に実結果までを通す。候補下書きとTool実行結果を分ける。Webの新しい仕事遷移は必ず`lib/workflow.ts`を通す。
3. **有限multi-stepと継続:** EVE03・05・06を追加。最初は合成/host fixture、次に署名済みsandbox Agent/Providerで検証する。許可された予算・権限・送信先・期限内に限って画面終了後も進める。新しい条件が必要なら待機し、承認の自動拡張をしない。
4. **停止・成果・復旧:** EVE07・08を同じjob/attempt/receiptで通す。停止要求送信と停止確定の時刻、未確定外部作用、予約と確定使用額、保存原本・export hashを本人に見せる。失敗時の再開を本当に試す。
5. **移植と対外受入:** Web契約/fixtureとOS Broker・Android SQLite/native実装を一致させる。Pixel試験署名APK、QEMU Developer Preview、Pixel同一imageの全OS受入、Provider sandbox、本番配備をそれぞれ別記する。公開・実機導入・実資金は既存条件付きgateでのみ判断する。

ROCKは本人分離、承認/Broker、job、Wallet予約、状態/停止/証拠/復旧表示を強制する。EXTERNALはAgent/Tool/Providerの実処理、取消、計量receipt、可用性。JOINTはsandboxでのE2Eと実端末接続。OWNERは送信先・権限・上限・期限の承認、成果検収、未決の契約/単価決定。第三者ToolへOS platform鍵や任意shell/root権限を渡さない。`ready`、credential設定、sandbox、実機、本番を分ける。

## 4. 合格ゲートと引継ぎ

変更箇所の集中試験を先に選び、`tests/workflow.test.mjs`、`tests/a2a-delegation-store.test.mjs`、`tests/a2a-delegation-recovery.test.mjs`、`tests/a2a-result-handoff.test.mjs`、composition、Wallet、export、Eve UIの該当試験を実行する。**実Eve/Sky利用の検証ではUIも操作**し、承認前/後、画面を閉じた後、停止、reload、成果の独立読戻しを観察する。代表job fixtureでは、正常、別owner、旧revision、上限、送信先変更、ACK消失、SIGKILL、逆順/重複receipt、取消未確認、原本破損を含める。意味のない実装写しテストは作らない。

OS componentまたはSky catalog Toolを変更したら`data/design-document-index.json`と全体/Tool詳細設計を同じ変更で更新し、`npm run design:check`を通す。着手・判断変更・検証後に`project.md`と`data/project-status.json`を更新し、`npm run project:update`でREADMEへ反映する。利用方法変更時はREADME本文も同じcommitで更新。完了前に`npm run verify`を実行し、失敗はexit code・原因・再現commandを記録する。長いlogやimageをGitへ入れない。vendor/mr固定原本/hashは変更せず、adapter変更時は`python3 scripts/package-mr.py`を実行する。

検収ではEVE01〜08の各行に`source SHA / command / 件数 / 正常・否定結果 / 環境 / 残る条件`を記入する。`docs/templates/os-acceptance-report.md`にhost、fixture、仮想OS、Provider sandbox、実機、本番を分ける。文書保存、作業branch commit、GitHub push、PR、main統合、Sites/DNS/TLS/実配備読戻しを混同しない。次担当へ未解決step、予約残、Provider reference、再開方法を残す。最後にRQ01〜RQ49、単一owner多端末と複数playerの差、商品/通信/AI/外部実費、月額契約の端末重複防止、ATM自社手数料0とゲーム料金未決定、予測市場/ゲーム資産売買の実行未許可を点検する。
