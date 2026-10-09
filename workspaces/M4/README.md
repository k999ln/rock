# M4 — 空間表示・出力

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 入力結果と体験状態を空間表示、音、または2D fallbackで理解可能に返す。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/material-invention-xr.md](../../docs/material-invention-xr.md)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI04**: R5裸眼表示の成立条件・方式比較・試験開始条件を整理する — 詳細: `npm run work -- MINI04`

MINI04: 裸眼・通常室内・周囲空間という要求と測定可能な項目を対応付ける

## 守る条件・残課題

- 裸眼表示の未成立を隠さない
- 2D fallbackで同じprojectを扱う
- 表示を物理実験の証拠にしない
- 2D fallbackの合格はR5裸眼表示要求の合格にしない
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI04-01（子） | 裸眼・通常室内・周囲空間の要求を評価項目へ対応付ける | 未着手 / 現行製品 | MINI01 |
| MINI04-02（子） | 表示媒体・視域・光路の方式比較欄を作る | 未着手 / 現行製品 | MINI01 / MINI04-01 |
| MINI04-03（子） | 表示電力と200mm収納の必要入力を機構側へ渡す表にする | 未着手 / 現行製品 | MINI01 / MINI04-02 |
| MINI04-04（子） | 有効領域・明るさ・視域の測定方法を指定する | 未着手 / 現行製品 | MINI01 / MINI04-01 / MINI04-02 |
| MINI04-05（子） | 光学試験の専門レビュー・開始条件・中止条件を整理する | 未着手 / 現行製品 | MINI01 / MINI04-02 / MINI04-03 / MINI04-04 |
| MINI04-06（子） | 2D fallbackと裸眼表示受入を別の証拠欄に分ける | 未着手 / 現行製品 | MINI01 / MINI04-01 / MINI04-04 / MINI04-05 |
| MINI04（親） | R5裸眼表示の成立条件・方式比較・試験開始条件を整理する | 未着手 / 現行製品 | MINI01 |

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

全体受入: 選定方式で視認範囲、輝度、遅延、安全、fallback一致を実測する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M4 空間表示・出力の <task ID> を進める。workspaces/M4/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
