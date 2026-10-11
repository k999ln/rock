# R7 — 電源・Data・A-LINK

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 機体、Payload、地上間で電源、時刻、記録、通信を維持する。

**主担当:** JOINT / **評価対象:** R1.0の要求・Interface・基本設計資料

## 触る場所・読む資料

- [docs/rocketstar-design/](../../docs/rocketstar-design)
- [sites/avocado-mini/src/pages/rocket-star/](../../sites/avocado-mini/src/pages/rocket-star)
- [docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md](../../docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.md)
- [docs/rocketstar-design/README.md](../../docs/rocketstar-design/README.md)

## 次の作業

- **RKT07**: R1.0の電源・data・時刻とA-LINK旧試作の差分表を作る — 詳細: `npm run work -- RKT07`

RKT07: 電源・記録・時刻・通信の要求を現行R1.0へ対応付ける

## 守る条件・残課題

- 通信回復を実行承認とみなさない
- 時刻、sequence、digestで重複を拒否する
- 未解決: 詳細設計・地上実証・飛行・同機番再使用の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| RKT07-01（子） | R1.0の電源・記録・時刻・通信要求を対応付ける | 未着手 / 現行製品 | RKT01 |
| RKT07-02（子） | A-LINK v0.4受信試作の適用範囲を切り出す | 未着手 / 現行製品 | RKT01 |
| RKT07-03（子） | 現行要求と旧試作を一致・差分・未確認へ分類する | 未着手 / 現行製品 | RKT01 / RKT07-01 / RKT07-02 |
| RKT07-04（子） | link別の容量・可視条件・電力・時刻の未決を整理する | 未着手 / 現行製品 | RKT01 / RKT07-01 |
| RKT07-05（子） | 切断・遅延・順序・再送のlink simulatorケースを定義する | 未着手 / 現行製品 | RKT01 / RKT07-03 / RKT07-04 |
| RKT07-06（子） | 受信試作・simulator・実電波・機体統合の受入を分ける | 未着手 / 現行製品 | RKT01 / RKT07-03 / RKT07-04 / RKT07-05 |
| RKT07（親） | R1.0の電源・data・時刻とA-LINK旧試作の差分表を作る | 未着手 / 現行製品 | RKT01 |

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

全体受入: 通信断、遅延、packet loss、再送、時刻ずれ、電源切替をsimulationとbenchで受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
R7 電源・Data・A-LINKの <task ID> を進める。workspaces/R7/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
