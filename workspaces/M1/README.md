# M1 — 製品設計・ICD

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** R5の要求、構成、BOM、接続、未決定、受入条件を一つの正本へ固定する。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/README.md](../../docs/avocado-mini-r5/README.md)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI01**: R5要求・OPEN01〜08と部隊別試験の追跡表を作る — 詳細: `npm run work -- MINI01`

MINI01: R5の全要求、OPEN01〜08、試験IDを抽出する

## 守る条件・残課題

- 現行profileはR5
- 旧profileは履歴
- 未確定部品を製造承認済みと表示しない
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI01-01（子） | R5のREQ01〜12と根拠章を要求台帳へ転記する | 未着手 / 現行製品 | — |
| MINI01-02（子） | OPEN01〜08の必要入力と閉じ方を分ける | 未着手 / 現行製品 | — |
| MINI01-03（子） | R5要求と受入試験IDを対応付ける | 未着手 / 現行製品 | MINI01-01 |
| MINI01-04（子） | 要求・未決・試験の主担当をM1〜M7とOSへ割り当てる | 未着手 / 現行製品 | MINI01-01 / MINI01-02 / MINI01-03 |
| MINI01-05（子） | 1本自律・200mm・同型増設・Pro任意の境界を照合する | 未着手 / 現行製品 | MINI01-01 |
| MINI01-06（子） | 要求追跡の欠落とMAT15全体受入との差分をまとめる | 未着手 / 現行製品 | MINI01-04 / MINI01-05 |
| MAT15 | R5単体の裸眼空間表示・安全・精密3D入力を成立させ、収納/熱/電源/確定回路/加工図と実機受入を閉じる | 進行中 / 現行製品 | — |
| MAT09 | Mini200 E1専用入力profile・Core adapter・ゲーム／ASR／console OSと20cm実機を独立受入 | 未着手 / 旧版・参考 | — |
| MAT11 | 4本のMotion Towerと中央Mini200 E2 Coreの統合engineering package・prototype・実機受入 | 未着手 / 旧版・参考 | MAT09 |
| MAT13 | Tower20 E3の確定CAD・配線・4camera同期・光学・転倒／滑り・熱・電源・音響・OS image・復旧を同一試作機で受入 | 未着手 / 旧版・参考 | — |
| MINI01（親） | R5要求・OPEN01〜08と部隊別試験の追跡表を作る | 未着手 / 現行製品 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MAT14 | R5統合基本設計・PDF/Word・図面8組・計算・参考資料を欠落なく保存し、現行入口と履歴を整理（製造承認保留） | 完了記録あり / 現行製品 | — |
| MAT04 | Material Invention Coreの標準体験としてavocadoMiniの四方向sensor・hand操作・再計算・Patent AI設計を固定 | 完了記録あり / 共通基盤 | — |
| MAT07 | 誰でも全体像から担当作業へ合流できるavocadoMini統合完成設計書と全体構成を正本化 | 完了記録あり / 共通基盤 | — |
| MAT08 | Mini200 E1のゲーム中心・生活拡張・衛星通信方針と20cm本体・音声をREADME・図・参照モデルへ保存（実機未受入） | 完了記録あり / 旧版・参考 | — |
| MAT10 | Mini200 E2資料と利用者確定の4本＋中央Core外観をGit正本と公開製品Siteへ同期（実機未受入） | 完了記録あり / 旧版・参考 | — |
| MAT12 | Tower20 E3資料を現行avocadoMini基準へ固定し、4本の固定200mm塔＋別筐体Edge HubをGit正本と公開Siteへ同期（実機未受入） | 完了記録あり / 旧版・参考 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run avocado:r5:check
npm run design:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 確定部品、回路、加工図、Mini–Pro ICD、全未決定の閉じ方が記録される。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M1 製品設計・ICDの <task ID> を進める。workspaces/M1/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
