# R2 — 構造・Tank

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 荷重、圧力、振動、熱に耐える構造、Tank、取付部を成立させる。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT02**: 構造・tank・取付Interfaceの解析入力と検証計画を整理する — 詳細: `npm run work -- RKT02`

RKT02: 構造、tank、取付部の要求とInterfaceを一覧にする

## 守る条件・残課題

- 材料公称値だけで合格しない
- 解析とcouponとarticle試験を分離する
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT02-01（子） | 構造・tank・取付部の要求とInterfaceを索引化する | 未着手 / 現行製品 | RKT01 |
| RKT02-02（子） | 材料候補と材料証拠の未決入力を整理する | 未着手 / 現行製品 | RKT01 / RKT02-01 |
| RKT02-03（子） | 荷重caseの出典・構成版・不足入力を対応付ける | 未着手 / 現行製品 | RKT01 / RKT02-01 |
| RKT02-04（子） | 製造方法・取付条件の未決と専門レビュー役割を整理する | 未着手 / 現行製品 | RKT01 / RKT02-01 / RKT02-02 |
| RKT02-05（子） | 材料試験・解析・構造試験の証拠順を定義する | 未着手 / 現行製品 | RKT01 / RKT02-02 / RKT02-03 / RKT02-04 |
| RKT02-06（子） | 製造リリースへ渡せない未確定条件を一覧化する | 未着手 / 現行製品 | RKT01 / RKT02-04 / RKT02-05 |
| RKT02（親） | 構造・tank・取付Interfaceの解析入力と検証計画を整理する | 未着手 / 現行製品 | RKT01 |

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

全体受入: 凍結荷重caseに対し解析、coupon、subscale articleの一致を示す。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R2 構造・Tankの <task ID> を進める。workspaces/R2/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
