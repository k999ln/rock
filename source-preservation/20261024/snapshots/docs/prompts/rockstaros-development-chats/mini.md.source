# Mini・空間と回路：軽量な担当引継ぎ

目的：板膜なし/少数全範囲/低眩しさ、手/声/光学/独立停止/PCB、Material/CAD/BIMと現地計測。主担当workstreamは `docs/workstreams/11-material-invention-avocado-mini.md`。本チャットのID/相手先/進捗は `data/rockstaros-development-chats.json` が正本。

## 完了済みの初回整理（履歴として保持）

1. AGENTSと正本5ファイルの最新指示、共通分岐入口を確認する。巨大JSONは担当task/phaseGate/nextPromptへ絞り、全履歴・全差分・全ログを出力しない。
2. 元75unitの担当は MINI-01, MINI-02, MINI-03, MINI-04, MINI-05, MINI-06, MINI-07, MINI-08。詳細正本 `docs/prompts/rockstaros-remaining-work-development.md` は見出し/anchorを検索し、まず `MINI-01` と依存契約だけを読む。詳細正本の全文を毎回読まない。追加180項目はcoverageの本lane割当だけを見る。
3. 最初は `MINI-01` の既存sourceと試験・不足・exact編集path・他lane依存を最大8path程度で確認し、短い実装batch案/合格条件/衝突を提出する。初回bootstrapでは製品コード、共有契約、Git履歴、実機/Provider/公開/実課金は操作しない。
4. `data/development-lanes/mini.json` だけを更新し、状態を `bootstrap_complete` にする。書くのは対象SHA/主要hash・参照path・実装あり/不足・最初のowned file・shared change requests・実在コマンド・未実行/外部条件・次の一件。原稿/秘密/生体/全ログを入れない。20行以内で結果を返して終了し、待機loopや他laneの全履歴取得をしない。

## 編集境界と連携

所有候補（初回でexact pathを確定するまで編集権ではない）：
- `systems/rock-star-os/targets/avocado-mini/`
- `docs/avocado-mini-r5/`

`lib/workflow.ts`、schema/migration、package/lock、共通status/baseline/README/project/design-index、共用Sites worker/router、CI/Git操作は統合担当がsingle-writerを割り当てる。自laneはsharedChangeRequestsへ変更案/理由/契約/負例を書き、他担当の差分を戻さない。AGENTSの進捗更新は本lane記録を経由してGit担当がproject/status/READMEへ同期し、省略しない。

Eveは共通Web実行と型付きbinary Artifact、OSはnative/Pixel/保護storage、Smithは目的/能力/共有、eSIMはissuer/利用権/準備、Billingは料金/usage/Invoice、Walletは残高/入金/払出しの境界。変更するshared APIはconsumerとschema担当が同じrevision/hashで合意してから実装する。チャットが参照できることを、他チャットの未読内容が自動同期されたことにしない。

統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3。統合とGitが別activeなら各1枠として数え、元Smithもactiveなら新しい作業は枠が空いてから開始する。全verifyはGit担当が固定candidateでまとめ、各laneは変更箇所の局所試験を行う。1batchは一つの小unit、次へ渡すのは短いhandoffとsource/contract/hash/残件だけ。長くなれば新しい軽量チャットへ同じunitを引き継ぎ、元履歴全文を複製しない。

## 現在地の注意

最新完了turnではv0.9/PDF53ページ。上下を含む6面理想出射は80㎡で未達0、10mm非出射帯で708未達。小型少数表示部の採用/実光学/最終PCBは未受入。v0.8/52pは履歴であり再実装の起点にしない。
GitHub main7304e449 / branch951d82d5は 2026-10-24T04:16:26.119Z のfresh読戻し。同SHA CIはmain22件、branchはsource-preparation1件のみ。大量dirtyと別Sourceは保存・統合待ち。一般ローンチ保留、料金/資金/製造/書込・鍵の既存gateを維持する。

## 参照する元チャット

- [miniの設計を確認](codex://threads/01a15026-972f-7f32-945a-2c2045c1f14e)
- [内容を確認](codex://threads/01a1596a-9af6-7a23-800a-22be115e3275)：14分野180項目＋10中核算法。必要設計の棚卸しであり、実装済み一覧ではない。
- [全体の統合担当](codex://threads/01a16aeb-1268-7491-a2ce-cda09d15df11)：今回の分岐依頼と現在の統合入口。

## 全機能照合と追加unit

元75unitの担当を保持し、追加担当は MATERIAL-01。詳細正本の同名anchorだけを読む。全機能対応JSONの担当行は F150, F161, F162, F163, F164。元180項目・10算法の監査分類と今回の追加割当を分け、全行を実装済みにしない。

## 履歴成果から維持するものと再開条件

### 履歴から維持する成果と再開条件

元「miniの設計を確認」8page/73unique turn、新「RockstarOS｜Mini・空間と回路」1page/1turnを取得。各threadのhasMore=false。参照先チャットや動画の全件再読は含まない。根拠turn/source/hashは `data/rockstaros-chat-achievements.json` のMini記録を使う。

- **製品体験を落とさない**：本人の最低要求はセンサー、生体認証、通話・空間着信/応答、同じRockstarOS、設備連動、取り外した同一coreでの直接衛星双方向＋Wi-Fi。PCの前に立たず制作、携帯を持たず連絡する。最低機能を用途の上限にせず、優先20体験/1,000候補、ゲームを作る・権利のある作品を持ち込む・Miniで合格した作品を遊ぶ・save/更新後に続ける経路を保持。MP01〜06/AS01〜06は別受入。GTA/FivePlay/Pro成功をMini互換へ昇格しない（turn `01a1504d-7ece-79d0-b113-5e65df8b5dd6`、`01a1530a-5e89-79a3-8eb3-9912381ae862`）。
- **外観と携行**：銀色の細い円筒＋黒sensor帯、Stow/Ready/Carry、Orbit L-T。映像の長いポールは不採用。D76×H186mm/せり上がり50mmは仮設計で、9523幅75mm＞仮内径72mm、電池/光路/熱/RF/配線の衝突を消さない。初回衛星検証地域は米国。dockから外したら場所の権限を失効し、本人/job/成果は続ける。31の製品・技術比較を再利用する。
- **既存sourceを再利用**：`packages/rockstaros-runtime/`、Mini `firmware/`、Linux USB CDC/systemd/Eve client、76×62mm Pico2接点LED KiCad carrier/UF2/Gerber/drillは存在する。host/firmware cross-build/bench CADの成果であり、全ハードへflashするOS image、Mini実機Eve、光学停止/最終mainboardではない。共通Eve/本人/仕事/CAS/UNKNOWN/料金を作り直さない。料金は維持（turn `01a15eec-d2e7-74a3-a58e-5899975833dc`）。
- **光学の反証を保持**：4/8/16台、追従4/8基、52大型開口、E0 ASKA3D-200NT＋AMOLED16103＋D405、Go＋拡大AIRRを既存計算/sourceから続ける。52は必要最小数でも製品採用でもなく、本人が製品として拒否。固定像と追従で動く像を混同しない。Go案の507位置/20mm診断や900mm開口8基の未達も全範囲合格へ変えない。
- **最新の本人条件とv0.9を固定**：像の場所に板・膜を置かず、上下を含む要求領域全体、少ない表示部、手操作、まぶしくしない。ARRAY/水槽状の2動画は見え方と入力反応の参考で、光学方式/全方向/低眩しさの証拠ではない。六面理想出射面は80m²、35,721眼-対象組、guard0で未達0/10mmで708。小型6表示器の採用ではない。出射面・像源・センサー・受動面の部数を別記。v0.9 PDF53頁の現hashは既存evidenceと一致（turn `01a16bcd-e2ae-7641-aeff-4a3ee821a4f6`）。
- **既存入力/出力を限定して継承**：`HAND-PREVIEW.md` のpinch/drag/releaseは画像座標→一時下書き。Go/D405識別・校正session・期限失効、prewarp、`optical-exits.mjs` は既存。実hand、RGB/depth融合、精密tap、job/CAD原本変更、Go画素送信、低眩しさ、物理停止は別未受入。`cell-power/`は5V部分評価基板で電流制限/逆流分離/watchdog/独立遮断なし、ERC/DRC未実行。古いLED carrierの検査指摘0件を移し替えない。
- **新bootstrapのexact境界**：編集済み所有は `data/development-lanes/mini.json` のみ。次候補 `systems/rock-star-os/targets/avocado-mini/spatial/place-profile.mjs` は提案で、担当割当後に着手。`contracts/avocado-mini-spatial-runtime.json` のrevisionをOS/Eve/Smithとsingle-writerで合意し、眼位置/向き・像位置/size・瞳/IPD・同時人数・遮蔽/照度・移動経路・設置可能域と四種部数をstrict検証。要求を縮めずunknownを利用不能にし、requirement→幾何必要条件→bench→実機→qualifiedを分離。hash receipt/旧revision/未知authority/不正bounds/黙った領域除外を試験する。
- **再開の証拠**：今回bootstrapはJS2件構文成功のみで、計算/動作/全verify未実行。既存 `tests/avocado-mini-native-development.test.mjs` を出発点に挙動試験を追加し、共有contract変更は全体設計/index/design:checkへ依頼。実光学/hand/低眩しさ/独立停止/最終PCB、same closed-box/直接衛星、製造releaseは未完了。一般公開を保留。
- **履歴証拠と現byteの差**：native evidence内のpixelVoicePreview/osUnifiedInteractionにある11件のhash参照は現sourceと不一致。旧試験成功を現revisionへ転用せず、OS/Eve担当と差分原因・同source再検証を確認する。空間v0.9/PDFとbench CAD/firmware、両bootstrapの対象hashは一致。
- **3つの体験を入力から成果へ保持**：音楽コピー、紙からWeb制作、実寸配置はcomputer-use-scenarios.jsonの同意/入力→Eve→結果保存の設計条件であり、映像や計算だけで実行受入にしない。


## この担当の実装を実行するとき

初回整理は完了済み。実装の依頼を受けたら、棚卸しのみで再終了せず、共通入口の有限dispatch手順に従う。まず履歴成果と現candidateの差分、既存bootstrapのnextUnit、共有契約/単一writer/実機leaseを確認する。統合担当が割り当てた一つのunitとexact owned pathだけを実装し、正例/負例と復旧を局所検証して自lane JSONへ返す。shared schema/移行/共用sourceは変更依頼を渡す。Git担当が小さく保存し、独立検収の結果を統合担当がunit台帳へ反映した後、次のeligible unitへ進む。履歴の試験合格を現版に流用せず、外部待ち/品質不合格/不成立を区別する。

全体台帳は `data/development-unit-progress.json`、履歴根拠は `data/rockstaros-chat-achievements.json` の自laneだけを読む。現在のprompt改訂から製品実装/実機/Provider/別chat送信を自動開始しない。実装開始後の一batchは一つの小unit、最大3関連unitでcheckpoint。完了条件は詳細正本の該当unitと独立検収/保存段階で判定し、全履歴・全文prompt・全ログを再読/転載しない。

## 開発モデルの指定

この担当の初期割当は gpt-6.1-sol/medium：MINI-01, MINI-03, MINI-04, MINI-05, MINI-08, MATERIAL-01；gpt-6-astra/high：MINI-02；gpt-6.1-sol/high：MINI-06, MINI-07。正本は `data/development-model-routing.json` の担当unitだけを読む。

実際のdispatch引数へmodelとthinking/effortを指定する。Luna lowは必要なread-only抽出/照合だけ、Solが結果を確認する。権限/金銭/鍵/停止復旧/共有移行/物理安全の不変条件を変える差分はunit指定のAstra high独立検収へ渡し、無変更の既存成果照合はSol検収でよい。Astraはbuild/計算の待機に常駐させない。候補自身の採点だけで採用せず、同candidateの固定合格条件と負例で判定する。

モデルを変えても同job/request・scope・予算・lease・試行数を保持する。permission/Provider未準備/元Smith操作中を推論不足扱いにしない。切替後も同原因の通算試行は最大3、結果不明作用は照合先行。補助/検収/元Smithも合計3枠へ算入する。履歴とexact write setを短く引き継ぎ、実装・検収・小さいGit保存後に次eligible unitへ進む。今回のprompt作成だけで既存チャットの設定や製品を変更したとは記録しない。
