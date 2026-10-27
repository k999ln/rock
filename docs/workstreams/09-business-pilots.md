## PRO-01原本archive入口候補

検収済み3source/testをmainb1b0基点で採用。Pro local export→固定avoado.si/account/import/pro→手動再選択/本人account確認/別同意を案内し、既存archive/auth/crypto/schemaは不変。関連40/独立5群とChrome local1512/390 UIを限定確認。最終head CI/独立metadata検収、認証済server保存・公開先実click/配備/native/wholePRO01は別gate。[詳細](../rockstaros-complete-design.md#pro-original-archive-entry)／[有限11lane引継ぎ](../evidence/development-execution/all-lanes-main-handoff-summary.json)。Rootregistry非操作、残616公開保留。

## PRO-01原本account archive候補

ROCKは既存Pro parserとEve暗号化履歴を再利用し、選択file→local preview→本人account確認/別同意→原本保管→全bytes/SHA読戻しをexact6で限定採用。旧P1/P2はr2で閉鎖、first56/current69の履歴訂正をhashで保持。新schema/鍵/WorkJob/Tool/modelなし、実account/browser/native/全移行は未受入。[設計](../rockstaros-complete-design.md#pro-account-original-archive)／[証拠](../evidence/development-execution/pro-account-import-main-adoption.json)。統合主担当10、Security/Eve境界を共有。

# Business Pilots

## CSV共通処理の4修正（2026-10-05、G04）

CSV変換・出力・検査・報告は共通標準機能として扱い、今回は[既存変換契約](../csv-business-v1.ja.md)の未知指定拒否、boolean型検査、未選択の重複キーの誤計数、code point順sortだけを修正する。主担当はGit / CI / Operations、ROCK。最新mainの受付・保存・復旧を保持し、料金・販売経路は変更しない。合成fixtureと4回帰試験は実顧客の受注・納品・検収・入金の証拠ではなく、P1/P2/P3やAMC完成へ換算しない。[統合証拠](../evidence/amc-fixture-csv-main-integration.json)。

## 目的

自動化を実際の仕事と収益へつなぎ、コード完成、販売開始、第三者取引、入金照合、継続利用を別々に測る。

## 現在地

- CSV整形は決定的変換、独立検査、私有成果物、7日保持、料金policyのP0実装中。35作業中11完了、5進行中、外部gate 19。
- メルカリは本人操作を前提に出品準備、費用計算、承認、未照合売上の安全な保存を実装済み。
- Fashion Brand OpsはCampaign、Sales Concierge、Production Cockpit、Instagram候補取込、MCP操作をmockで実装済み。
- SkyのココナラToolには応募前チェックと案件管理を統合。代表受注と担当者への個別発注、事前合意済み報酬・支払期日、進行、手入力の入金・返金・支払をowner別に記録する。実取引や振込は未接続で、手入力を売上実績としない。
- 真正な第三者有料取引、Provider入金、返金、払出し、継続利用の実績は未完了。

主なtask: `CSV00`, `BIL03`, `FB01`〜`FB06`, `B02`, `B05`, `B06`。

## 次に進める順番

1. CSV P0の独立queue、lease回収、scheduled purge、実スマホ動作を完成する。
2. 販売主体、注文表示、連絡、返金、個人情報、provider証拠を確定する。
3. 第三者の真正な有料取引1件を納品、検収、入金照合まで通す。
4. 5人、10件へ広げ、受注0、未入金、返金、介入、再注文も分母へ含める。
5. 自己購入、合成入金、手入力だけの完了を売上実績にしない。

## 完了条件

- P0コード、P1取引1件、P2複数利用者、P3自動接続、事業検証を別状態で記録する。
- 顧客データと成果物を本人別に分離し、retentionと削除を実測する。
- 外部市場の規約、公式API、固定IP、OAuth、決済条件に従う。
- 売上、利益、時間短縮を実測なしに表示しない。

## 関連資料

- [CSV仕事 v1](../csv-business-v1.ja.md)
- [CSV security](../csv-business-security.ja.md)
- [Mercari revenue loop](../mercari-revenue-loop.md)
- [Fashion Brand Ops](../fashion-brand-ops-integration.md)
- [Skyのココナラ](../sky-tools-complete-design.md#9-ココナラ)
- [CSV task manifest](../../data/csv-business-tasks.json)

## 検証

- `npm run csv:check`
- `node --experimental-strip-types --test tests/csv-transform.test.mjs tests/csv-fee-policy.test.mjs`
- `npm run test:fashion-brand-ops`

## メルカリ出品原稿の保存復旧

BIL03（AMC O5、ROCK）の原稿作成は、同じowner・保存ID・正規化済み商品条件で再確認できる。サーバー生成時刻や後続の承認状態は再送比較へ含めず、同時再送も本人別readbackで1件へ収束させる。入力変更は409、他ownerは内容を返さず、PATCHのrevision競合拒否は維持する。画面は応答不明時に入力と保存IDを保持し、新規作成・状態変更を止め、本人の操作で同じ内容を再確認する。確認前は画面を閉じないよう案内する。 追加の認証・離脱レビューでは、確認前の同一タブ内リンク移動を止め、別タブのサインインとダウンロードを許可する。認証確認中はフォームを保持したまま隠し、復帰後は本人別一覧を再取得する。component／navigation試験とローカルbrowserのHomeリンク停止→保存確認後の移動で検証する。

2026-10-11、修正前に時刻差のある再送と同時再送の409を再現。`node --experimental-strip-types --test tests/mercari*.test.mjs` は15件合格。実handlerとSQLiteで4096 byte境界、壊れたJSON/UTF-8、owner・Origin・認証、100件上限、保存前DB失敗、保存後の再送、再読込を検証した。component試験は保存後の応答喪失・同一ID再確認・二重submit防止を確認。ローカルbrowserの390px/1280pxでは合成商品の保存前503→同じ内容で再確認→1件保存→再読込→原稿承認を確認した。未確認入力は画面内だけに保持し、実出品・取引・Provider入金・料金徴収は行わない。

## ココナラの保存復旧

案件と手入力の入出金記録は、結果不明時に同じID・同じ正規化入力で再確認する。最初の作成条件と変更操作を本人別D1 payloadに残し、後続更新や応答喪失を挟んでも再送を重複計上しない。画面は未確認操作を保持して別操作を止める。API／SQLite、componentの応答喪失試験、ローカルbrowserの一時的保存失敗→再確認→再読込で検証する。外部受注・入金照合・銀行送金は追加しない。

2026-10-11の追加競合検証では、一覧GETへ世代を付け、認証失敗・新しい本人別一覧・保存開始より前の応答を破棄する。ココナラは401後の旧案件復活、アカウント切替後の旧一覧、担当開始PATCH後の画面巻戻しを3つの実component回帰で拒否する。メルカリは初回GETの空一覧が新規保存カードを消す競合を回帰試験とChromeの実component＋合成transportで検証した。サーバーのowner条件・同一ID再送・revision CASは変更していない。

追加の離脱回帰ではココナラも共通`usePendingSaveNavigation`へ接続した。ローカル実vinext/API/D1で保存前503→Home/Library移動の停止と入力維持→同一記録の再確認→移動再開を確認し、手入力receiptは0→1、revisionは1→2。別タブ認証・exportは許可する。強制終了・crash・history/programmatic navigationの永続復旧は保証しない。


## 保存途中の認証切替

2026-10-11、Material・メルカリ・ココナラで、Aの保存前DB失敗→401→Bとして同じPOSTを再確認すると、未保存の旧入力がBへ登録されることを実route／全migration SQLiteで再現した。既にAへcommit済みならID衝突で409、別ownerへの金額PATCHは404であり、認証権限の突破や自動二重入金ではなかった。

3画面は既存の一覧GETに追加した`ownerScope`を未確認操作へ固定し、送信直前のGET一致と`X-Rock-Owner-Scope`のAPI照合を行う。scopeは現在の`requestUser`のSHA-256識別値で、認証・権限・新DBではない。`POST/PATCH /api/coconala-team`（DELETEにも適用）、`POST/PATCH /api/revenue/mercari`、Material POST／WorkJob PATCHは、headerがある場合は不正値・別ownerを409 `OWNER_CHANGED`で書込前に拒否し、owner決定は常に`requestUser`に従う。既存API client互換のためheader自体は任意だが、この3復旧UIは確認済みscopeを必須とし、省略・不明を同一ownerと見なさない。

別ownerでは旧操作の再送と旧入力の表示を止め、元ownerで接続確認する。保留解除は元ownerで同じ保留操作を表示しているときだけ許可し、古いhandlerや別ownerから新しい保存IDへ移さない。解除は本文を残し、保存済み記録を削除しない。元owner側の保存結果確認を案内し、確認前の強制終了・永続復旧は従来どおり保証しない。外部送信・取引・実決済は追加しない。

関連98試験が合格（実route／SQLiteのowner固定8、実component復帰31、既存Material/Coconala/Mercari/WorkJob/eSIMの回帰）。未知scope、401→BでPOSTなし、A復帰の同一ID再送、確認直後のowner切替409、明示解除後の本文保持と新IDを検証した。Chromeでは実Mercari component・既存認証確認hook・実HTTP client・実route／SQLiteを接続し、認証入口だけを合成化したlocal fixtureで、A保存前503→401→Bで再送停止・A0/B0→Aへ戻り同一操作保存→再読込後A1/B0を確認した。本番IdPや実取引の受入ではない。

## Pro unknown原本archiveの限定復旧（2026-10-27）

ROCK/09主担当、05保存UI、10/G04統合。[同ID復旧契約](../rockstaros-complete-design.md#pro-archive-unknown-recovery)は未照合中のfile置換を同期live guardで拒否し、quarantine中cancelでもowner/targetだけを保持、私有内容は隠す。既存暗号化履歴/server/CAS/同意は不変。独立38+追加2・旧4反例とRoot31は別count。全verify/Git/main/同SHA CIは[新候補証拠](../evidence/development-execution/pro-recovery-eve-drain-main-adoption.json)で分ける。wholePRO01/実本人保存/native/公開は未受入。
