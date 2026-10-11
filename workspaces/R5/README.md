# R5 — GNC・Avionics・Flight SW

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 姿勢、軌道、分離、帰還を一般OSから独立した安全系で制御する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT05**: Flight SWの独立性・状態・SIL試験要件を整理する — 詳細: `npm run work -- RKT05`

RKT05: 飛行核と地上支援OSの責任・authorityを整理する

## 守る条件・残課題

- 一般RockstarOSやLLMへ飛行actuation権限を与えない
- SIL、HIL、flightを別段階にする
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT05-01（子） | 飛行核と地上支援OSのauthority境界を図示する | 未着手 / 現行製品 | RKT01 |
| RKT05-02（子） | 正常状態の入出力と独立判定役割を整理する | 未着手 / 現行製品 | RKT01 / RKT05-01 |
| RKT05-03（子） | 中止・通信断・再起動の状態遷移を定義する | 未着手 / 現行製品 | RKT01 / RKT05-02 |
| RKT05-04（子） | SILの入力・期待結果・trace記録形式を定義する | 未着手 / 現行製品 | RKT01 / RKT05-02 / RKT05-03 |
| RKT05-05（子） | 禁止遷移と権限越境を照合するレビュー表を作る | 未着手 / 現行製品 | RKT01 / RKT05-01 / RKT05-03 / RKT05-04 |
| RKT05-06（子） | SIL計画・SIL結果・HIL・実機・飛行認定を分離する | 未着手 / 現行製品 | RKT01 / RKT05-04 / RKT05-05 |
| RKT05（親） | Flight SWの独立性・状態・SIL試験要件を整理する | 未着手 / 現行製品 | RKT01 |

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

全体受入: SILとHILでnominal、sensor故障、通信断、abortを決定的に再現する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R5 GNC・Avionics・Flight SWの <task ID> を進める。workspaces/R5/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
