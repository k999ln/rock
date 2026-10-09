# R10 — 製造・品質・安全試験

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 設計どおりの機体を再現し、部品からflightまで構成と不適合を追跡する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT10**: 製造・品質・安全の構成管理と段階別証拠matrixを作る — 詳細: `npm run work -- RKT10`

RKT10: 要求・BOM・供給元・inspection・不適合・構成変更を対応付ける

## 守る条件・残課題

- 文書保存を製造releaseと呼ばない
- 不適合、逸脱、再試験を削除しない
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT10-01（子） | 要求・BOM・供給元・inspectionの識別関係を定義する | 未着手 / 現行製品 | RKT01 |
| RKT10-02（子） | 不適合と構成変更の記録・影響判定を定義する | 未着手 / 現行製品 | RKT01 / RKT10-01 |
| RKT10-03（子） | 設計reviewと製造引渡しの証拠Gateを分ける | 未着手 / 現行製品 | RKT01 / RKT10-01 |
| RKT10-04（子） | 地上・飛行・再使用の証拠Gateを分ける | 未着手 / 現行製品 | RKT01 / RKT10-03 |
| RKT10-05（子） | 証拠提出者と独立確認者の役割をGateへ割り当てる | 未着手 / 現行製品 | RKT01 / RKT10-03 / RKT10-04 |
| RKT10-06（子） | 版変更時に再評価する合格範囲をmatrixへまとめる | 未着手 / 現行製品 | RKT01 / RKT10-02 / RKT10-04 / RKT10-05 |
| RKT10（親） | 製造・品質・安全の構成管理と段階別証拠matrixを作る | 未着手 / 現行製品 | RKT01 |

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

全体受入: 部品lot、製造、検査、試験、不適合、構成、releaseを一個体へ追跡できる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R10 製造・品質・安全試験の <task ID> を進める。workspaces/R10/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
