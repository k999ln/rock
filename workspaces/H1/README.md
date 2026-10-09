# H1 — 製品・Interface統合

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Mini、Pro、RockstarOS、rocketstarの優先順位、正本、Interface、合格条件を同期する。

**主担当:** ROCK / **評価対象:** AMCの部隊台帳とtask参照の整合

## 触る場所・読む資料

- [PROJECTS.md](../../PROJECTS.md)
- [data/mission-control.json](../../data/mission-control.json)
- [data/project-status.json](../../data/project-status.json)
- [.github/workflows/](../../.github/workflows)
- [docs/mission-control.md](../../docs/mission-control.md)
- [docs/workstreams/01-product-ux.md](../../docs/workstreams/01-product-ux.md)
- [docs/workstreams/10-git-ci-operations.md](../../docs/workstreams/10-git-ci-operations.md)

## 次の作業

- **AMC01**: 現行3製品とOSの責任表・未決事項台帳をレビューする — 詳細: `npm run work -- AMC01`

AMC01: Mini単体、Pro単体、任意連携、rocketstar地上支援の4利用構成に入出力と主担当を記す

## 守る条件・残課題

- 製品名と現行profileを一意にする
- 設計履歴を現行受入へ加算しない
- 一つの作業にprimary squadを一つ指定する
- 未解決: 製品優先順位・個人担当・期限は未確定

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| AMC01-01（子） | Mini単体・Pro単体・任意連携・rocketstar地上支援の入出力表を作る | 未着手 / 調整 | — |
| AMC01-02（子） | 各Interfaceの主担当・受渡し先・安全境界を一意に割り当てる | 未着手 / 調整 | AMC01-01 |
| AMC01-03（子） | 公開説明・R5・Pro定義・rocketstar保存資料の相違台帳を作る | 未着手 / 調整 | AMC01-01 |
| AMC01-04（子） | 未決事項へ決定者・必要入力・影響先・次の作業を付ける | 未着手 / 調整 | AMC01-02 / AMC01-03 |
| AMC01-05（子） | 責任表と未決台帳を32部隊・親子タスクへ相互リンクする | 未着手 / 調整 | AMC01-04 |
| AMC01-06（子） | 関係部隊の責任表レビューを記録し残る未決を引き継ぐ | 未着手 / 調整 | AMC01-05 |
| WEB09 | avocadoMiniクラファン企画を提示し、募集確定後に公開支援リンクを設置する | 進行中 / 公開説明 | MAT06 |
| WEB15 | avocadoMiniの予約販売画面と決済バックエンドを用意し、販売条件確定後に全額決済を有効化する | 進行中 / 公開説明 | WEB13 |
| BIZ01 | 無料配布の対象とOS従量課金の計量単位・単価・上限を確定する | 進行中 / 調整 | — |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 / 調整 | — |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 / 調整 | — |
| AMC01（親） | 現行3製品とOSの責任表・未決事項台帳をレビューする | 未着手 / 調整 | — |
| SYS15 | Spider Security AgentのGitHub検査・コード検査・OS常駐監視・送信前拒否・native表示・boot監督を統合する（ROCK・同一image起動未受入） | 進行中 / 調整 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| AMC02 | AMC Goal Orchestratorの計画・Sky／Zema本人別Web台帳と明示起動のローカルCodex一件実行入口を整える（Web直接起動・連続自律実行は対象外） | 完了記録あり / 調整 | — |
| ORG01 | 製品・SkyのAI自動化チーム単位からソース、設計、担当作業へ進めるプロジェクト別入口を整備 | 完了記録あり / 調整 | — |
| ORG02 | avokado Mission ControlでRockstarOS・Mini・Pro・rocketstarを32部隊へ分け、Goal・進捗段階・rule・依存・証拠・次の作業を正本化 | 完了記録あり / 調整 | — |
| DOC01 | RockstarOS本体・Sky／Zema・全ready／candidate Tool・Material Inventionの詳細設計入口と被覆監査を正本化 | 完了記録あり / 調整 | — |
| DOC02 | RockstarOS設計書完全版v1.0の原本PDF・全文抽出・完全性記録・設計索引をGit正本へ保存 | 完了記録あり / 調整 | — |
| DOC03 | rocketstar R1.0・衛星・OS付録・ボタン・生成元・旧版を原本と照合し、設計アーカイブと索引へ保存（製造/飛行未認定） | 完了記録あり / 調整 | — |
| DOC04 | avokado READMEをR5端末・RockstarOS v1.0現行OS・rocketstar R1.0現行ロケット・事業・機能・全設計書の入口へ刷新 | 完了記録あり / 調整 | — |
| BRD01 | 正式製品名をRockstarOS、内部識別子をdev.rockで固定 | 完了記録あり / 調整 | — |
| WEB05 | avocadoMiniの製品紹介と回転ツアーをP0.2設計書と黒い製品写真のデザインへ統一 | 完了記録あり / 公開説明 | — |
| WEB07 | 利用者の目的とAIの役割を先に伝える製品紹介へGitHub冒頭とWebページを改訂 | 完了記録あり / 公開説明 | — |
| WEB11 | 製品構想モデルをスクロールで一周見せ、参考価格・購入準備中・OS導入へつなぐ | 完了記録あり / 公開説明 | — |
| WEB12 | 利用者提供の伸縮式センサータワーを製品サイトとGitHubの主役にする | 完了記録あり / 公開説明 | — |
| WEB16 | 公開avocadoMini Siteを現行R5へ同期し、旧E3商品構成・価格を販売導線から撤去する | 完了記録あり / 公開説明 | — |
| WEB17 | 公開avocadoMini SiteをAstroへ移行し、承認済みデザイン・全route・Worker配布契約を維持する | 完了記録あり / 公開説明 | — |
| WEB18 | 公開avocadoMini Siteの画像原本を保護し、表示・導線・アクセシビリティ・SEOの不具合を解消する | 完了記録あり / 公開説明 | — |
| WEB19 | 利用者指定のTower20 E3公開Siteを承認済み画像・英語UI・180度演出ごとAstroで復元して本番配備する | 完了記録あり / 公開説明 | — |
| VER01 | RockstarOS 1.0と将来の1.5／2.0版更新規則を一元管理 | 完了記録あり / 調整 | — |
| SYS14 | 製品目的から全層の選択・接続・実証状態を一つの構成監査へ固定 | 完了記録あり / 調整 | — |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了記録あり / 調整 | — |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了記録あり / 調整 | — |
| R04 | README・設計進捗の同期とCI検証 | 完了記録あり / 調整 | — |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了記録あり / 調整 | — |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了記録あり / 調整 | — |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了記録あり / 調整 | — |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了記録あり / 調整 | — |
| ORG03 | AMCの担当・旧版混入・受入条件を精査し、部隊ごとの実行可能taskと検査を同期 | 完了記録あり / 調整 | — |
| ORG04 | 既存AMC担当表を再利用し、機能別の作業部屋・一件の再開手順・アイデア置き場を同期する | 完了記録あり / 調整 | — |
| AMC03 | 機能別開発Botの定義と、依頼時にCodexからGit／PRへ提出する起動入口を整備する | 完了記録あり / 調整 | — |
| AMC04 | 担当BotがGitから情報を収集し、既存AMCで計画を作って実行・検収・Git提出を進める入口を接続する | 完了記録あり / 調整 | — |
| AMC05 | 既存AMC Goal JSONを担当Botへ直接渡し、ID・revision・履歴を維持して引き継ぐ | 完了記録あり / 調整 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run project:check
npm run mission:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 全project taskにちょうど一つのprimary squadが明記され、各squadにGoal、対象範囲、証拠、次taskと合格条件がある。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
H1 製品・Interface統合の <task ID> を進める。workspaces/H1/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
