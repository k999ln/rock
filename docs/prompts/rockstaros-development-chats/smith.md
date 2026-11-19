# Smith・接続と共有：軽量な担当引継ぎ

目的：目的/不足・3接続方式・Add/共有/作者の接続、実feed・MCP接続/作者SDK。主担当workstreamは `docs/workstreams/02-sky-mcp.md`。本チャットのID/相手先/進捗は `data/rockstaros-development-chats.json` が正本。

## 完了済みの初回整理（履歴として保持）

1. AGENTSと正本5ファイルの最新指示、共通分岐入口を確認する。巨大JSONは担当task/phaseGate/nextPromptへ絞り、全履歴・全差分・全ログを出力しない。
2. 元75unitの担当は SMITH-01, SMITH-02, SMITH-03, SMITH-04, SMITH-05, SMITH-06。詳細正本 `docs/prompts/rockstaros-remaining-work-development.md` は見出し/anchorを検索し、まず `SMITH-01` と依存契約だけを読む。詳細正本の全文を毎回読まない。追加180項目はcoverageの本lane割当だけを見る。
3. 最初は `SMITH-01` の既存sourceと試験・不足・exact編集path・他lane依存を最大8path程度で確認し、短い実装batch案/合格条件/衝突を提出する。初回bootstrapでは製品コード、共有契約、Git履歴、実機/Provider/公開/実課金は操作しない。
4. `data/development-lanes/smith.json` だけを更新し、状態を `bootstrap_complete` にする。書くのは対象SHA/主要hash・参照path・実装あり/不足・最初のowned file・shared change requests・実在コマンド・未実行/外部条件・次の一件。原稿/秘密/生体/全ログを入れない。20行以内で結果を返して終了し、待機loopや他laneの全履歴取得をしない。

## 編集境界と連携

所有候補（初回でexact pathを確定するまで編集権ではない）：
- `lib/smis-`
- `components/smis-`
- `lib/sky-agent-share`
- `lib/sky-agent-outcome`
- `lib/sky-timeline`
- `lib/mcp-`

`lib/workflow.ts`、schema/migration、package/lock、共通status/baseline/README/project/design-index、共用Sites worker/router、CI/Git操作は統合担当がsingle-writerを割り当てる。自laneはsharedChangeRequestsへ変更案/理由/契約/負例を書き、他担当の差分を戻さない。AGENTSの進捗更新は本lane記録を経由してGit担当がproject/status/READMEへ同期し、省略しない。

Eveは共通Web実行と型付きbinary Artifact、OSはnative/Pixel/保護storage、Smithは目的/能力/共有、eSIMはissuer/利用権/準備、Billingは料金/usage/Invoice、Walletは残高/入金/払出しの境界。変更するshared APIはconsumerとschema担当が同じrevision/hashで合意してから実装する。チャットが参照できることを、他チャットの未読内容が自動同期されたことにしない。

統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3。統合とGitが別activeなら各1枠として数え、元Smithもactiveなら新しい作業は枠が空いてから開始する。全verifyはGit担当が固定candidateでまとめ、各laneは変更箇所の局所試験を行う。1batchは一つの小unit、次へ渡すのは短いhandoffとsource/contract/hash/残件だけ。長くなれば新しい軽量チャットへ同じunitを引き継ぎ、元履歴全文を複製しない。

## 現在地の注意

元「Smith」ではPixel画面操作と端末内AIの復旧報告があり、目的/不足表示を実機確認した後の接続承認・縦断試験が進行中。15:09のTerminal errorや20:56のUSBだけの旧snapshotを現在状態にしない。元threadの実機leaseが終わるまで、新担当は実機を操作しない。
GitHub main7304e449 / branch951d82d5は 2026-10-24T04:16:26.119Z のfresh読戻し。同SHA CIはmain22件、branchはsource-preparation1件のみ。大量dirtyと別Sourceは保存・統合待ち。一般ローンチ保留、料金/資金/製造/書込・鍵の既存gateを維持する。

## 参照する元チャット

- [Smith](codex://threads/01a16b30-82bb-7cc1-985d-fc74970a26c6)
- [smis](codex://threads/01a14ff2-50d6-75d1-bf5f-aadcf37e934e)
- [内容を確認](codex://threads/01a1596a-9af6-7a23-800a-22be115e3275)：14分野180項目＋10中核算法。必要設計の棚卸しであり、実装済み一覧ではない。
- [全体の統合担当](codex://threads/01a16aeb-1268-7491-a2ce-cda09d15df11)：今回の分岐依頼と現在の統合入口。

## 全機能照合と追加unit

元75unitの担当を保持し、追加担当は MCP-01。詳細正本の同名anchorだけを読む。全機能対応JSONの担当行は F085, F086, F087, F088, F089, F090, F091, F092, F093, F094, F095, F096, F097, F098。元180項目・10算法の監査分類と今回の追加割当を分け、全行を実装済みにしない。

## 履歴成果から維持するものと再開条件

### 履歴から維持する成果と再開条件

旧smisを7page/60turn、Smithを7page/63turn（継承60を除く新規3turn）まで終端確認した。ユーザーがEveで用途を作りSmithが内蔵/外付け/周辺観測の3方式でつなぐ本人決定（turn01a16669-0b34-72a1-adbf-ff098d490926）を維持する。micro:bitの確認済み動きだけを使い、目的不足を勝手に縮めない。原作者/親版/共有失効/本人任意の利用結果共有、普通の言葉と読めるexport、旧/sky・smis内部IDの互換を再実装せず利用する。

元Smithの進行中turn01a16c1b-1506-7d93-9634-093268597ec9とsmis-object-purpose.jsonのfollowup20261024を最初に読む。私用接続承認済み、担当登録/実推論、1961byte SHA51d7495167babb5a44dea2a2c6373517bea14d9ea92e911eb95db72bd43fe02dのcanonical一致/Pixel外部開封/終端job停止・待機は記録済み。一方内容は拒否/役割反復で品質不合格、稼働中推論取消・通常接続復旧・全周は未受入。session隔離事故で通常device credential削除、job/results/server account保持、通常再接続が必要。古い承認待ち/外部保存未実施を繰り返さず最新追補に従う。他laneはPixelに触れない。

SMITH-01次batchは固定候補でlegacy route/保存参照のread-only回帰map（tests/os-shell-navigation.test.mjs、tests/home-sky-panel.test.mjs）を作る。編集leaseは別途exact pathで共有担当が割当。bootstrap bc0cdc99…の6host試験は表示限定、owner/job/ACL/cap/revocation同一性は未受入。

## この担当の実装を実行するとき

初回整理は完了済み。実装の依頼を受けたら、棚卸しのみで再終了せず、共通入口の有限dispatch手順に従う。まず履歴成果と現candidateの差分、既存bootstrapのnextUnit、共有契約/単一writer/実機leaseを確認する。統合担当が割り当てた一つのunitとexact owned pathだけを実装し、正例/負例と復旧を局所検証して自lane JSONへ返す。shared schema/移行/共用sourceは変更依頼を渡す。Git担当が小さく保存し、独立検収の結果を統合担当がunit台帳へ反映した後、次のeligible unitへ進む。履歴の試験合格を現版に流用せず、外部待ち/品質不合格/不成立を区別する。

全体台帳は `data/development-unit-progress.json`、履歴根拠は `data/rockstaros-chat-achievements.json` の自laneだけを読む。現在のprompt改訂から製品実装/実機/Provider/別chat送信を自動開始しない。実装開始後の一batchは一つの小unit、最大3関連unitでcheckpoint。完了条件は詳細正本の該当unitと独立検収/保存段階で判定し、全履歴・全文prompt・全ログを再読/転載しない。

## 開発モデルの指定

この担当の初期割当は gpt-6.1-sol/medium：SMITH-01, SMITH-02, SMITH-03, SMITH-04, SMITH-05, SMITH-06, MCP-01。正本は `data/development-model-routing.json` の担当unitだけを読む。

実際のdispatch引数へmodelとthinking/effortを指定する。Luna lowは必要なread-only抽出/照合だけ、Solが結果を確認する。権限/金銭/鍵/停止復旧/共有移行/物理安全の不変条件を変える差分はunit指定のAstra high独立検収へ渡し、無変更の既存成果照合はSol検収でよい。Astraはbuild/計算の待機に常駐させない。候補自身の採点だけで採用せず、同candidateの固定合格条件と負例で判定する。

モデルを変えても同job/request・scope・予算・lease・試行数を保持する。permission/Provider未準備/元Smith操作中を推論不足扱いにしない。切替後も同原因の通算試行は最大3、結果不明作用は照合先行。補助/検収/元Smithも合計3枠へ算入する。履歴とexact write setを短く引き継ぎ、実装・検収・小さいGit保存後に次eligible unitへ進む。今回のprompt作成だけで既存チャットの設定や製品を変更したとは記録しない。
