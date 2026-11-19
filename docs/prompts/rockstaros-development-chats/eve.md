# Eve・仕事と編集：軽量な担当引継ぎ

目的：共通Web仕事・Artifact・Remix/media・model評価・Tool/repair・CU・研究内容回収/学習体験。主担当workstreamは `docs/workstreams/02-sky-mcp.md`。本チャットのID/相手先/進捗は `data/rockstaros-development-chats.json` が正本。

## 完了済みの初回整理（履歴として保持）

1. AGENTSと正本5ファイルの最新指示、共通分岐入口を確認する。巨大JSONは担当task/phaseGate/nextPromptへ絞り、全履歴・全差分・全ログを出力しない。
2. 元75unitの担当は EVE-01, EVE-02, EVE-03, EVE-04, EVE-05, EVE-06, EVE-07, EVE-08, EVE-09, EVE-10, EVE-11, EVE-12, EVE-13, EVE-14, EVE-15。詳細正本 `docs/prompts/rockstaros-remaining-work-development.md` は見出し/anchorを検索し、まず `EVE-01` と依存契約だけを読む。詳細正本の全文を毎回読まない。追加180項目はcoverageの本lane割当だけを見る。
3. 最初は `EVE-01` の既存sourceと試験・不足・exact編集path・他lane依存を最大8path程度で確認し、短い実装batch案/合格条件/衝突を提出する。初回bootstrapでは製品コード、共有契約、Git履歴、実機/Provider/公開/実課金は操作しない。
4. `data/development-lanes/eve.json` だけを更新し、状態を `bootstrap_complete` にする。書くのは対象SHA/主要hash・参照path・実装あり/不足・最初のowned file・shared change requests・実在コマンド・未実行/外部条件・次の一件。原稿/秘密/生体/全ログを入れない。20行以内で結果を返して終了し、待機loopや他laneの全履歴取得をしない。

## 編集境界と連携

所有候補（初回でexact pathを確定するまで編集権ではない）：
- `lib/eve-`
- `lib/rockstar-eve-interaction.ts`
- `components/eve-`
- `app/os/eve/remix/`

`lib/workflow.ts`、schema/migration、package/lock、共通status/baseline/README/project/design-index、共用Sites worker/router、CI/Git操作は統合担当がsingle-writerを割り当てる。自laneはsharedChangeRequestsへ変更案/理由/契約/負例を書き、他担当の差分を戻さない。AGENTSの進捗更新は本lane記録を経由してGit担当がproject/status/READMEへ同期し、省略しない。

Eveは共通Web実行と型付きbinary Artifact、OSはnative/Pixel/保護storage、Smithは目的/能力/共有、eSIMはissuer/利用権/準備、Billingは料金/usage/Invoice、Walletは残高/入金/払出しの境界。変更するshared APIはconsumerとschema担当が同じrevision/hashで合意してから実装する。チャットが参照できることを、他チャットの未読内容が自動同期されたことにしない。

統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3。統合とGitが別activeなら各1枠として数え、元Smithもactiveなら新しい作業は枠が空いてから開始する。全verifyはGit担当が固定candidateでまとめ、各laneは変更箇所の局所試験を行う。1batchは一つの小unit、次へ渡すのは短いhandoffとsource/contract/hash/残件だけ。長くなれば新しい軽量チャットへ同じunitを引き継ぎ、元履歴全文を複製しない。

## 現在地の注意

元「Smith」ではPixel画面操作と端末内AIの復旧報告があり、目的/不足表示を実機確認した後の接続承認・縦断試験が進行中。15:09のTerminal errorや20:56のUSBだけの旧snapshotを現在状態にしない。元threadの実機leaseが終わるまで、新担当は実機を操作しない。
Source3f6075fは別repoでoriginもlocal。Remix/mediaはRoot未追跡、既存WorkJob/Artifact/usage/stopと未統合。原本とbinaryを100KB text欄へ詰めない。
GitHub main7304e449 / branch951d82d5は 2026-10-24T04:16:26.119Z のfresh読戻し。同SHA CIはmain22件、branchはsource-preparation1件のみ。大量dirtyと別Sourceは保存・統合待ち。一般ローンチ保留、料金/資金/製造/書込・鍵の既存gateを維持する。

## 参照する元チャット

- [eve](codex://threads/01a15b7f-e98c-7c32-ae03-8cb61be8bd7d)
- [eve (2)](codex://threads/01a16b30-fec8-7f60-af9d-b2411e0f231c)
- [内容を確認](codex://threads/01a1596a-9af6-7a23-800a-22be115e3275)：14分野180項目＋10中核算法。必要設計の棚卸しであり、実装済み一覧ではない。
- [全体の統合担当](codex://threads/01a16aeb-1268-7491-a2ce-cda09d15df11)：今回の分岐依頼と現在の統合入口。

## 全機能照合と追加unit

元75unitの担当を保持し、追加担当は SYNC-01, MODEL-01。詳細正本の同名anchorだけを読む。全機能対応JSONの担当行は F058, F059, F060, F061, F062, F063, F064, F065, F066, F067, F068, F071, F072, F073, F074, F075, F076, F077, F078, F079, F080, F081, F082, F083, F084, F099, F100, F101, F102, F103, F104, F105, F106, F107, F108, F109, F110, A02, A03, A04, A05, A08, A09。元180項目・10算法の監査分類と今回の追加割当を分け、全行を実装済みにしない。

## 履歴成果から維持するものと再開条件

### 履歴から維持する成果と再開条件

Eve元chatを23page/223turn、eve (2)を24page/226turn（継承223を除く新規3turn）まで終端確認した。EveはLLMの製品名という本人訂正（turn 01a15e9b-c837-7022-a751-01f9384d7dd3）を維持し、専用自社重み完成としない。既存の計画採用→Tool→独立検査→同job/会話保存、Agent署名/停止、Newsの資料/訂正と訓練同意撤回、AMC条件→task対応、同IDresume/50件履歴/旧版成果/knownExisting/専用stopExisting/復旧503は維持する。モデル33.3点/0点の不採用、旧protocol非互換、固定recipeと自動LLM採用の区別を消さない。

Remix最新turn 01a16b5d-9fa4-7d60-8d58-ee84739edaadとdocs/evidence/eve-media-studio.json（SHA36c96e91462f…）には写真/音楽/動画4編集・外部ファイル読戻しのローカル成果がある。4製品sourceのhashは現byte一致だがmedia testは旧c75467…と現a47b73…が異なる。Source3f6075f/publicv118にはRemixがない。600token直接API/React結果/IndexedDB作品棚は永続WorkJob/stop receipt/認可binary転送を満たさない。編集engineを作り直さず、承認済み共有契約と所有path確定後EVE-02の純粋なtext request/digest validation（2〜4素材/本文8000/目的500）を1batchで行う。EVE-03 binaryは別gate。bootstrap f7919d44…はlaneJSONのみ、15/15host、製品/公開/実機受入ではない。

## この担当の実装を実行するとき

初回整理は完了済み。実装の依頼を受けたら、棚卸しのみで再終了せず、共通入口の有限dispatch手順に従う。まず履歴成果と現candidateの差分、既存bootstrapのnextUnit、共有契約/単一writer/実機leaseを確認する。統合担当が割り当てた一つのunitとexact owned pathだけを実装し、正例/負例と復旧を局所検証して自lane JSONへ返す。shared schema/移行/共用sourceは変更依頼を渡す。Git担当が小さく保存し、独立検収の結果を統合担当がunit台帳へ反映した後、次のeligible unitへ進む。履歴の試験合格を現版に流用せず、外部待ち/品質不合格/不成立を区別する。

全体台帳は `data/development-unit-progress.json`、履歴根拠は `data/rockstaros-chat-achievements.json` の自laneだけを読む。現在のprompt改訂から製品実装/実機/Provider/別chat送信を自動開始しない。実装開始後の一batchは一つの小unit、最大3関連unitでcheckpoint。完了条件は詳細正本の該当unitと独立検収/保存段階で判定し、全履歴・全文prompt・全ログを再読/転載しない。

## 開発モデルの指定

この担当の初期割当は gpt-6.1-sol/medium：EVE-01, EVE-02, EVE-03, EVE-04, EVE-06, EVE-07, EVE-08, EVE-09, EVE-12, EVE-14, EVE-15, MODEL-01；gpt-6.1-sol/high：EVE-05, EVE-10, EVE-11, EVE-13, SYNC-01。正本は `data/development-model-routing.json` の担当unitだけを読む。

実際のdispatch引数へmodelとthinking/effortを指定する。Luna lowは必要なread-only抽出/照合だけ、Solが結果を確認する。権限/金銭/鍵/停止復旧/共有移行/物理安全の不変条件を変える差分はunit指定のAstra high独立検収へ渡し、無変更の既存成果照合はSol検収でよい。Astraはbuild/計算の待機に常駐させない。候補自身の採点だけで採用せず、同candidateの固定合格条件と負例で判定する。

モデルを変えても同job/request・scope・予算・lease・試行数を保持する。permission/Provider未準備/元Smith操作中を推論不足扱いにしない。切替後も同原因の通算試行は最大3、結果不明作用は照合先行。補助/検収/元Smithも合計3枠へ算入する。履歴とexact write setを短く引き継ぎ、実装・検収・小さいGit保存後に次eligible unitへ進む。今回のprompt作成だけで既存チャットの設定や製品を変更したとは記録しない。
