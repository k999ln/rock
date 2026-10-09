# M3 — Sensor・Tracking

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 身体、手、物体の動きを時刻付き空間入力Eventへ変換する。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI03**: R5単体3D入力の方式比較と測定計画を作る — 詳細: `npm run work -- MINI03`

MINI03: 単体深度方式と候補sensorの観測可能範囲を比較する

## 守る条件・残課題

- 予測値と実測を分離する
- 追跡不能を推測座標で埋めない
- cameraは物理設備を直接制御しない
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI03-01（子） | 単体深度方式と候補センサーの観測範囲を比較する | 未着手 / 現行製品 | MINI01 |
| MINI03-02（子） | 床置き・台上・着座の入力評価シーンを定義する | 未着手 / 現行製品 | MINI01 / MINI03-01 |
| MINI03-03（子） | 遮蔽・交差・複数人の欠落ケースを定義する | 未着手 / 現行製品 | MINI01 / MINI03-01 |
| MINI03-04（子） | 基準器・時刻・座標と誤差計算の記録形式を決める | 未着手 / 現行製品 | MINI01 / MINI03-01 |
| MINI03-05（子） | 精度目標の未決値と決定に必要な入力を整理する | 未着手 / 現行製品 | MINI01 / MINI03-02 / MINI03-03 / MINI03-04 |
| MINI03-06（子） | R5単体測定と旧pose fixtureを分離した受入表を作る | 未着手 / 現行製品 | MINI01 / MINI03-02 / MINI03-03 / MINI03-04 / MINI03-05 |
| MAT05 | Core graphから決定的XR sceneを生成し、四方向pose fixtureのconnect／separate／stale拒否を実装 | 未着手 / 共通基盤 | — |
| MINI03（親） | R5単体3D入力の方式比較と測定計画を作る | 未着手 / 現行製品 | MINI01 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run avocado:r5:check
npm run design:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 1台benchで視野、精度、欠落率、遅延、遮蔽復旧を実測する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M3 Sensor・Trackingの <task ID> を進める。workspaces/M3/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
