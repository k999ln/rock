# R4 — 空力・熱

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 上昇、分離、再突入、帰還時の空力・熱環境へ耐える。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT04**: 空力・熱・構造の結合条件と検証入力を整理する — 詳細: `npm run work -- RKT04`

RKT04: 飛行領域、熱、扉・構造への影響を要求へ対応付ける

## 守る条件・残課題

- CFDを飛行証拠にしない
- 上昇と再突入のcaseを分離する
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT04-01（子） | 飛行領域・熱・扉・構造の要求対応表を作る | 未着手 / 現行製品 | RKT01 |
| RKT04-02（子） | 解析caseのMission版と構成版を揃える規則を定義する | 未着手 / 現行製品 | RKT01 / RKT04-01 |
| RKT04-03（子） | 境界条件・材料・不確かさの不足入力を整理する | 未着手 / 現行製品 | RKT01 / RKT04-02 |
| RKT04-04（子） | 空力・熱・構造の受渡入力と解消順を可視化する | 未着手 / 現行製品 | RKT01 / RKT04-01 / RKT04-03 |
| RKT04-05（子） | 解析と独立検証を照合する記録要件を定義する | 未着手 / 現行製品 | RKT01 / RKT04-02 / RKT04-03 |
| RKT04-06（子） | 解析計画と実環境受入の証拠境界をまとめる | 未着手 / 現行製品 | RKT01 / RKT04-04 / RKT04-05 |
| RKT04（親） | 空力・熱・構造の結合条件と検証入力を整理する | 未着手 / 現行製品 | RKT01 |

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

全体受入: 解析、風洞または相当試験、材料試験の適用範囲と不確かさを閉じる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R4 空力・熱の <task ID> を進める。workspaces/R4/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
