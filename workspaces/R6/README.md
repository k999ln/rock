# R6 — Payload・分離

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 衛星・貨物を保持し、状態を確認し、安全に分離する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT06**: Payload・扉・分離のInterfaceと異常確認計画を整理する — 詳細: `npm run work -- RKT06`

RKT06: Payloadの包絡・質量・接続情報の必要項目を整理する

## 守る条件・残課題

- 放出commandと分離確認を別eventにする
- 残留を成功と扱わない
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT06-01（子） | Payloadの包絡・質量・接続の必要入力を整理する | 未着手 / 現行製品 | RKT01 |
| RKT06-02（子） | Payloadと機体のInterface責任を対応付ける | 未着手 / 現行製品 | RKT01 / RKT06-01 |
| RKT06-03（子） | 保持・扉・分離要求の状態を分ける | 未着手 / 現行製品 | RKT01 / RKT06-02 |
| RKT06-04（子） | 分離結果・残留・不明の状態確認を定義する | 未着手 / 現行製品 | RKT01 / RKT06-03 |
| RKT06-05（子） | emulator異常入力と表示・記録の期待値を定義する | 未着手 / 現行製品 | RKT01 / RKT06-03 / RKT06-04 |
| RKT06-06（子） | emulatorと実機分離の証拠を分けた受入表を作る | 未着手 / 現行製品 | RKT01 / RKT06-01 / RKT06-02 / RKT06-05 |
| RKT06（親） | Payload・扉・分離のInterfaceと異常確認計画を整理する | 未着手 / 現行製品 | RKT01 |

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

全体受入: 代表Payload mockで保持、扉、放出、残留、再試行禁止を受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R6 Payload・分離の <task ID> を進める。workspaces/R6/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
