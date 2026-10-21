# R1 — Mission・System

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Mission、要求、質量、Interface、成功条件を一つのsystem基準へ固定する。

**主担当:** ROCK / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT01**: rocketstar R1.0のMission入力・未決台帳と要求追跡を整理する — 詳細: `npm run work -- RKT01`

RKT01: 射場・回収・投入・搭載・環境の必要入力をRDRへ対応付ける

## 守る条件・残課題

- 理想計算を飛行性能と呼ばない
- 上昇成功を帰還成功へ転用しない
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT01-01（子） | 射場・回収・投入・搭載・環境のMission入力台帳を作る | 未着手 / 現行製品 | — |
| RKT01-02（子） | R1.0の60要求へ根拠と必要証拠を対応付ける | 未着手 / 現行製品 | — |
| RKT01-03（子） | 18 Interfaceの入出力とR1〜R10の責任を対応付ける | 未着手 / 現行製品 | — |
| RKT01-04（子） | 要求と未決事項の主担当・閉じ方をR1〜R10へ割り当てる | 未着手 / 現行製品 | RKT01-01 / RKT01-02 / RKT01-03 |
| RKT01-05（子） | 不足Mission入力の決定順と影響先を整理する | 未着手 / 現行製品 | RKT01-04 |
| RKT01-06（子） | W1要求整理とW2統合成立性のGateを分ける | 未着手 / 現行製品 | RKT01-04 / RKT01-05 |
| RKT01（親） | rocketstar R1.0のMission入力・未決台帳と要求追跡を整理する | 未着手 / 現行製品 | — |

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

全体受入: 最初のMission、凍結入力、全Interface owner、検証方法が一意になる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R1 Mission・Systemの <task ID> を進める。workspaces/R1/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
