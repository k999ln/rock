# R8 — 地上・Launch

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 輸送、設置、燃料、発射準備、hold、abortを安全に運用する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT08**: 地上設備・運用役割とgo/no-go・abortの机上確認計画を作る — 詳細: `npm run work -- RKT08`

RKT08: 輸送・設置・発射準備・回収の設備と責任を整理する

## 守る条件・残課題

- AI判断だけでlaunchしない
- 人、地上system、機体のgo/no-goを分離する
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT08-01（子） | 輸送・設置・発射準備・回収の設備要求を索引化する | 未着手 / 現行製品 | RKT01 |
| RKT08-02（子） | 運用段階ごとの実行者・確認者・中止権限を定義する | 未着手 / 現行製品 | RKT01 / RKT08-01 |
| RKT08-03（子） | 要求と結果の照合・go/no-go・holdの記録形式を作る | 未着手 / 現行製品 | RKT01 / RKT08-02 |
| RKT08-04（子） | abort時の通知・確認・記録の机上ケースを定義する | 未着手 / 現行製品 | RKT01 / RKT08-02 / RKT08-03 |
| RKT08-05（子） | 地域・施設・運用資格の未決と確認先を整理する | 未着手 / 現行製品 | RKT01 / RKT08-01 |
| RKT08-06（子） | 机上rehearsalの入力と期待記録をGateへまとめる | 未着手 / 現行製品 | RKT01 / RKT08-03 / RKT08-04 / RKT08-05 |
| RKT08（親） | 地上設備・運用役割とgo/no-go・abortの机上確認計画を作る | 未着手 / 現行製品 | RKT01 |

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

全体受入: full rehearsalでnominal、hold、abort、通信断、設備故障を完走する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R8 地上・Launchの <task ID> を進める。workspaces/R8/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
