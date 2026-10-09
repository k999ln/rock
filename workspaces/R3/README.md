# R3 — 推進

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 上昇と帰還に必要な推力を安全に発生、供給、停止、再始動する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT03**: 推進系の要求・機体Interface・検証段階を整理する — 詳細: `npm run work -- RKT03`

RKT03: 要求、停止・状態通知、機体側Interfaceを台帳にする

## 守る条件・残課題

- 計算推力を燃焼試験結果と呼ばない
- component、subsystem、stageを別受入にする
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT03-01（子） | 推進要求と機体側Interfaceの出典台帳を作る | 未着手 / 現行製品 | RKT01 |
| RKT03-02（子） | 停止要求・状態通知の責任と確認記録を分ける | 未着手 / 現行製品 | RKT01 / RKT03-01 |
| RKT03-03（子） | 方式・型式・個数・寿命の未決台帳を作る | 未着手 / 現行製品 | RKT01 / RKT03-01 |
| RKT03-04（子） | 比較性能と採用値を分ける記録様式を定義する | 未着手 / 現行製品 | RKT01 / RKT03-03 |
| RKT03-05（子） | 専門設計レビューへ提出する項目と責任をまとめる | 未着手 / 現行製品 | RKT01 / RKT03-02 / RKT03-03 / RKT03-04 |
| RKT03-06（子） | 設計レビューから地上実証までの証拠Gateを整理する | 未着手 / 現行製品 | RKT01 / RKT03-05 |
| RKT03（親） | 推進系の要求・機体Interface・検証段階を整理する | 未着手 / 現行製品 | RKT01 |

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

全体受入: componentからstageまで段階試験し、start、throttle、shutdown、異常停止を受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R3 推進の <task ID> を進める。workspaces/R3/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
