# R9 — 帰還・回収・再使用

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 同じ個体を帰還、回収、検査、整備し、再飛行可否を判定する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT09**: 帰還・回収・整備・同一機番再使用の証拠台帳を設計する — 詳細: `npm run work -- RKT09`

RKT09: 機番、構成版、部品寿命、回収履歴の記録を定義する

## 守る条件・残課題

- 回収成功を再飛行可能と同一視しない
- 部品・個体・flight historyを分離追跡する
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT09-01（子） | 機番・構成版・部品識別の台帳schemaを定義する | 未着手 / 現行製品 | RKT01 |
| RKT09-02（子） | 部品寿命・回収履歴の記録項目を定義する | 未着手 / 現行製品 | RKT01 / RKT09-01 |
| RKT09-03（子） | 点検・交換・不適合の判定経路を整理する | 未着手 / 現行製品 | RKT01 / RKT09-01 / RKT09-02 |
| RKT09-04（子） | 再飛行可否に必要な証拠と判定責任を整理する | 未着手 / 現行製品 | RKT01 / RKT09-02 / RKT09-03 |
| RKT09-05（子） | 不足証拠・版混在を拒否するsynthetic履歴を設計する | 未着手 / 現行製品 | RKT01 / RKT09-01 / RKT09-03 / RKT09-04 |
| RKT09-06（子） | synthetic判定と同一機番の実再使用証拠を分離する | 未着手 / 現行製品 | RKT01 / RKT09-04 / RKT09-05 |
| RKT09（親） | 帰還・回収・整備・同一機番再使用の証拠台帳を設計する | 未着手 / 現行製品 | RKT01 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run baseline:check
npm run mission:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 個体履歴から検査、交換、整備、再飛行判定を一意に再現できる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R9 帰還・回収・再使用の <task ID> を進める。workspaces/R9/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
