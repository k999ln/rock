# M2 — 筐体・機構

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 200mm以内で安全に設置、組立、清掃、保守できる筐体を成立させる。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI02**: R5の200mm収納と部品干渉を確認する機構評価計画を作る — 詳細: `npm run work -- MINI02`

MINI02: 候補部品の寸法、脚、配線、工具空間を同じ座標系で整理する

## 守る条件・残課題

- 外観CGを加工図と扱わない
- 重心とserviceabilityを同時評価する
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI02-01（子） | 候補部品の寸法・出典・未選定範囲を包絡表へ整理する | 未着手 / 現行製品 | MINI01 |
| MINI02-02（子） | 脚・配線・工具空間の共通座標と干渉確認区画を定義する | 未着手 / 現行製品 | MINI01 / MINI02-01 |
| MINI02-03（子） | 全使用姿勢で200mmを判定する寸法鎖と測定図を指定する | 未着手 / 現行製品 | MINI01 / MINI02-02 |
| MINI02-04（子） | 重心・滑り・転倒の評価条件と判定者を整理する | 未着手 / 現行製品 | MINI01 / MINI02-01 |
| MINI02-05（子） | 未選定光学方式が外径・台座へ与える制約を切り出す | 未着手 / 現行製品 | MINI01 / MINI02-01 |
| MINI02-06（子） | 分解保守の確認項目と加工図へ移行できない条件をまとめる | 未着手 / 現行製品 | MINI01 / MINI02-02 / MINI02-03 / MINI02-04 / MINI02-05 |
| MINI02（親） | R5の200mm収納と部品干渉を確認する機構評価計画を作る | 未着手 / 現行製品 | MINI01 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |

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

全体受入: 実寸mockで寸法、重心、転倒、滑り、組立、保守を測定する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M2 筐体・機構の <task ID> を進める。workspaces/M2/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
