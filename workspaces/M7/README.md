# M7 — Calibration・安全・受入

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 校正、privacy、入力停止、故障、復旧を実機で受け入れる。

**主担当:** JOINT / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI07**: R5校正・停止・privacy・復旧の危険分析と受入表を作る — 詳細: `npm run work -- MINI07`

MINI07: 校正失敗・過熱・通信喪失・OS停止・更新中停電を危険分析へ登録する

## 守る条件・残課題

- gestureを物理承認にしない
- camera原データの保存・送信を既定OFFにする
- 失敗時はfail-closed
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI07-01（子） | 校正失敗・過熱・通信喪失・OS停止・更新停電を危険台帳へ登録する | 未着手 / 現行製品 | MINI01 |
| MINI07-02（子） | 危険ごとの検出・独立停止・復帰条件を対応付ける | 未着手 / 現行製品 | MINI01 / MINI07-01 |
| MINI07-03（子） | 来客の物理停止と校正失敗時の受入ケースを作る | 未着手 / 現行製品 | MINI01 / MINI07-01 / MINI07-02 |
| MINI07-04（子） | 原データ保存・送信の既定OFFと許可取消を確認表へ落とす | 未着手 / 現行製品 | MINI01 |
| MINI07-05（子） | M2〜M6の評価計画から安全側へ渡す条件を整理する | 未着手 / 現行製品 | MINI01 / MINI07-01 |
| MINI07-06（子） | 未決をHOLDにする安全受入表とレビュー担当をまとめる | 未着手 / 現行製品 | MINI01 / MINI07-02 / MINI07-03 / MINI07-04 / MINI07-05 |
| MAT06 | avocadoMini四方向Bench／Full-scale prototypeとMaterial Core→Patent AI provenance bridgeを独立受入 | 未着手 / 共通基盤 | MAT03 / MAT05 |
| MINI07（親） | R5校正・停止・privacy・復旧の危険分析と受入表を作る | 未着手 / 現行製品 | MINI01 |

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

全体受入: 校正失敗、遮蔽、過熱、通信断、電源断、復旧を同一試作機で受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M7 Calibration・安全・受入の <task ID> を進める。workspaces/M7/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
