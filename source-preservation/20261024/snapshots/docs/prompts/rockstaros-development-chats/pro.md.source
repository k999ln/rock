# Pro・共通OSと実機：軽量な担当引継ぎ

目的：旧localStorageの非破壊移行・共通UI・native/実機SKU・販売12gateと注文配送。主担当workstreamは `docs/workstreams/09-business-pilots.md`。本チャットのID/相手先/進捗は `data/rockstaros-development-chats.json` が正本。

## 完了済みの初回整理（履歴として保持）

1. AGENTSと正本5ファイルの最新指示、共通分岐入口を確認する。巨大JSONは担当task/phaseGate/nextPromptへ絞り、全履歴・全差分・全ログを出力しない。
2. 元75unitの担当は PRO-01, PRO-02, PRO-03, PRO-04。詳細正本 `docs/prompts/rockstaros-remaining-work-development.md` は見出し/anchorを検索し、まず `PRO-01` と依存契約だけを読む。詳細正本の全文を毎回読まない。追加180項目はcoverageの本lane割当だけを見る。
3. 最初は `PRO-01` の既存sourceと試験・不足・exact編集path・他lane依存を最大8path程度で確認し、短い実装batch案/合格条件/衝突を提出する。初回bootstrapでは製品コード、共有契約、Git履歴、実機/Provider/公開/実課金は操作しない。
4. `data/development-lanes/pro.json` だけを更新し、状態を `bootstrap_complete` にする。書くのは対象SHA/主要hash・参照path・実装あり/不足・最初のowned file・shared change requests・実在コマンド・未実行/外部条件・次の一件。原稿/秘密/生体/全ログを入れない。20行以内で結果を返して終了し、待機loopや他laneの全履歴取得をしない。

## 編集境界と連携

所有候補（初回でexact pathを確定するまで編集権ではない）：
- `sites/avocado-mini/src/pages/pro/`
- `sites/avocado-mini/src/pro-os.js`
- `sites/avocado-mini/src/pro-os.css`
- `data/avocado-pro-sales-readiness.json`

`lib/workflow.ts`、schema/migration、package/lock、共通status/baseline/README/project/design-index、共用Sites worker/router、CI/Git操作は統合担当がsingle-writerを割り当てる。自laneはsharedChangeRequestsへ変更案/理由/契約/負例を書き、他担当の差分を戻さない。AGENTSの進捗更新は本lane記録を経由してGit担当がproject/status/READMEへ同期し、省略しない。

Eveは共通Web実行と型付きbinary Artifact、OSはnative/Pixel/保護storage、Smithは目的/能力/共有、eSIMはissuer/利用権/準備、Billingは料金/usage/Invoice、Walletは残高/入金/払出しの境界。変更するshared APIはconsumerとschema担当が同じrevision/hashで合意してから実装する。チャットが参照できることを、他チャットの未読内容が自動同期されたことにしない。

統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3。統合とGitが別activeなら各1枠として数え、元Smithもactiveなら新しい作業は枠が空いてから開始する。全verifyはGit担当が固定candidateでまとめ、各laneは変更箇所の局所試験を行う。1batchは一つの小unit、次へ渡すのは短いhandoffとsource/contract/hash/残件だけ。長くなれば新しい軽量チャットへ同じunitを引き継ぎ、元履歴全文を複製しない。

## 現在地の注意

公開v46はlocalStorage browser preview。account/job/実AI/native/実機・販売12gateは未受入。旧doneを仕事成功へ移行しない。
GitHub main7304e449 / branch951d82d5は 2026-10-24T04:16:26.119Z のfresh読戻し。同SHA CIはmain22件、branchはsource-preparation1件のみ。大量dirtyと別Sourceは保存・統合待ち。一般ローンチ保留、料金/資金/製造/書込・鍵の既存gateを維持する。

## 参照する元チャット

- [Proの設計を確認](codex://threads/01a15027-87c3-74b0-a840-ba8e97ea4265)
- [内容を確認](codex://threads/01a1596a-9af6-7a23-800a-22be115e3275)：14分野180項目＋10中核算法。必要設計の棚卸しであり、実装済み一覧ではない。
- [全体の統合担当](codex://threads/01a16aeb-1268-7491-a2ce-cda09d15df11)：今回の分岐依頼と現在の統合入口。

## 全機能照合と追加unit

元75unitの担当を保持し、追加担当は なし（既存unitで実装手順を明示）。詳細正本の同名anchorだけを読む。全機能対応JSONの担当行は F151。元180項目・10算法の監査分類と今回の追加割当を分け、全行を実装済みにしない。

## 履歴成果から維持するものと再開条件

### 履歴から維持する成果と再開条件

元「Proの設計を確認」4page/29unique turn、新「RockstarOS｜Pro・共通OSと実機」1page/1turnを取得。各threadのhasMore=false。根拠turn/source/hashは `data/rockstaros-chat-achievements.json` のPro記録を使う。過去配備の記録と現在liveの再読を区別する。

- **商品定義と役割**：Proは本人が明示したAI専用PC。NVIDIA重視/価格対抗、Mac Studio風の低い角丸アルミは外観方向で、20案のCGは実機適合の証拠ではない。Miniで依頼/修正/承認→Proの対応処理→同じ仕事へ成果返却。共通Core/本人/仕事/費用/保存/復旧を再利用し、複数GPUのVRAM自動合算や無制限補填を仮定しない（turn `01a1504d-c693-7a40-aa0a-365709a62188`）。
- **Builderの採用と訂正**：実在部品型番/寸法/メーカー参照、部品を直接tapする組立UI、構成保存/share/購入希望、mobile追従操作は既存。本人は参考投稿を部品customだけと選び、広告枠/競売を不採用。「商品紹介と何をしているか直感的に」を優先し、assembly演出を任意へ戻した。旧演出を製品の主役に再導入しない（turn `01a158ee-85db-7141-93dc-7a3eb04c7c75`）。
- **最新入口はOS操作画面**：本人の「サイトとしてじゃなくてpro専用OS画面」を採用したv46はHome/Eve/Work/Systemとdraft/board localStorage、Eve/Smith導線。商品Builderは `/build/`。既存evidenceはSites v46/source `c49a0eaa385bb8b0d2b94055e393cee89d17c718` のHTTP/UI読戻しで、今回の最新live再確認ではない。Miniとの共通Sites projectを作り直さず、Mini OS混入を避ける（turn `01a16583-5959-7bf1-943d-82e10c5e4e84`）。
- **browserデータを保全**：`pro-os.js` の2 key、draft3000字、board160字/100件、clipboard/board JSON exportを保持。loaderのfilter/slice前のraw原本とdraftを保存する。local `done=true` は履歴provenanceであり、共通workflowのcompletedへ昇格しない。現状はauth/account/job/AI実行の接続前で、Pro native実機受入は別。
- **販売の本人判断を落とさない**：米国、avokado LLC、NY登記自己申告、一台ずつ受注生産、自転車操業。NY住所は連絡先だけで、完全住所は転載しない。初号銀色Lian Li A4-H2Oを本人が選択し、低い専用筐体は次版。初回候補 `pro-studio-16`、9700X/5060Ti16GB/64GB/2TB/750W級SFX等はexact BOM/見積/適合未受入。5090/GB10は別商品候補（turn `01a15d87-36ae-7233-9f07-a6ffc7097add`）。
- **決済・事業の未決条件**：Stripeを候補に残してSquare/PayPal等と比較する本人判断で、provider未選定。OAuth「できた」をmerchant成功へ転用しない。予算上限、組立/返品現物先、資金/返金reserve、seller照合、仕入引当、同実機burn-in/熱/騒音/配送/保証/merchant sandbox受入が残る。販売12gate全false、有料注文0/発送0/`salesEnabled=false`。購入希望は有料注文ではない。古い暫定価格/手数料仮定/再投資・寄付方針を確定契約や送金許可へ変えない。
- **新bootstrapのexact境界**：編集済み所有は `data/development-lanes/pro.json` のみ。PRO-01最初候補 `sites/avocado-mini/src/pro-local-import.mjs`、同 `pro-os.js` / `pages/pro/index.astro` / `tests/pro-local-import.test.mjs` は提案で、割当後着手。まず明示export＋strict envelope previewの一件に絞り、raw byte不変/cancel-error無破壊/draft+board roundtrip/version-field-ID-control-oversize拒否を検証。ネットワーク/Tool/課金はこのbatchに含めない。
- **共有依頼と試験**：Eve/Security/Gitへ `pro-local-import/1` のowner provenance/operation/hash/item mapping/CAS/idempotency/失敗後同ID GETを依頼。Web/Miniへorigin/audience/session gatewayを依頼し、合意までは明示file export/import、cookieコピー/任意CORSなし。bootstrapのsales試験3/3、checker想定exit2はhost判定だけ。coverage欠落はbootstrap時の観測のみで、今回は現ファイル存在を確認。全verifyは親が固定candidateで集約し、source/GitHub/main/deploy/physical/販売を別記。


## この担当の実装を実行するとき

初回整理は完了済み。実装の依頼を受けたら、棚卸しのみで再終了せず、共通入口の有限dispatch手順に従う。まず履歴成果と現candidateの差分、既存bootstrapのnextUnit、共有契約/単一writer/実機leaseを確認する。統合担当が割り当てた一つのunitとexact owned pathだけを実装し、正例/負例と復旧を局所検証して自lane JSONへ返す。shared schema/移行/共用sourceは変更依頼を渡す。Git担当が小さく保存し、独立検収の結果を統合担当がunit台帳へ反映した後、次のeligible unitへ進む。履歴の試験合格を現版に流用せず、外部待ち/品質不合格/不成立を区別する。

全体台帳は `data/development-unit-progress.json`、履歴根拠は `data/rockstaros-chat-achievements.json` の自laneだけを読む。現在のprompt改訂から製品実装/実機/Provider/別chat送信を自動開始しない。実装開始後の一batchは一つの小unit、最大3関連unitでcheckpoint。完了条件は詳細正本の該当unitと独立検収/保存段階で判定し、全履歴・全文prompt・全ログを再読/転載しない。

## 開発モデルの指定

この担当の初期割当は gpt-6.1-sol/medium：PRO-01, PRO-02, PRO-03, PRO-04。正本は `data/development-model-routing.json` の担当unitだけを読む。

実際のdispatch引数へmodelとthinking/effortを指定する。Luna lowは必要なread-only抽出/照合だけ、Solが結果を確認する。権限/金銭/鍵/停止復旧/共有移行/物理安全の不変条件を変える差分はunit指定のAstra high独立検収へ渡し、無変更の既存成果照合はSol検収でよい。Astraはbuild/計算の待機に常駐させない。候補自身の採点だけで採用せず、同candidateの固定合格条件と負例で判定する。

モデルを変えても同job/request・scope・予算・lease・試行数を保持する。permission/Provider未準備/元Smith操作中を推論不足扱いにしない。切替後も同原因の通算試行は最大3、結果不明作用は照合先行。補助/検収/元Smithも合計3枠へ算入する。履歴とexact write setを短く引き継ぎ、実装・検収・小さいGit保存後に次eligible unitへ進む。今回のprompt作成だけで既存チャットの設定や製品を変更したとは記録しない。
