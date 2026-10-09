# M6 — 電源・熱・通信

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Miniを安全に連続運転し、複数MiniとProへ時刻付きで接続する。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI06**: R5電源・熱・1/2/4台通信の評価条件を定義する — 詳細: `npm run work -- MINI06`

MINI06: 部品・動作モード・起動ピーク別の電力表を作り表示未決分を独立にする

## 守る条件・残課題

- 計算budgetを実測と呼ばない
- 通信切断時の状態を明示する
- 電力・熱上限を同時に閉じる
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI06-01（子） | 部品・動作モード・起動ピークの電力予算表を作る | 未着手 / 現行製品 | MINI01 |
| MINI06-02（子） | 表示方式未決の電力を独立した条件欄へ分離する | 未着手 / 現行製品 | MINI01 / MINI06-01 |
| MINI06-03（子） | 周囲条件・吸気閉塞・同時負荷の熱評価条件を定義する | 未着手 / 現行製品 | MINI01 / MINI06-01 / MINI06-02 |
| MINI06-04（子） | 1台時の時刻・順序・再接続の通信評価入力を定義する | 未着手 / 現行製品 | MINI01 |
| MINI06-05（子） | 2台中1台喪失時の共同確定停止ケースを定義する | 未着手 / 現行製品 | MINI01 / MINI06-04 |
| MINI06-06（子） | 4台の過半数・少数側停止と再接続のケースを定義する | 未着手 / 現行製品 | MINI01 / MINI06-04 |
| MINI06（親） | R5電源・熱・1/2/4台通信の評価条件を定義する | 未着手 / 現行製品 | MINI01 |

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

全体受入: 実負荷で連続運転し、温度、電力、packet loss、再接続、複数Node同期を測る。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M6 電源・熱・通信の <task ID> を進める。workspaces/M6/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
