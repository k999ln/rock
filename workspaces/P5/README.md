# P5 — 映像・Audio・I/O

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Pro単体でdisplay、audio、controller、network、外部機器を接続する。

**主担当:** ROCK / **評価対象:** 公開製品説明と要求整理

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO05**: Proの映像・音声・controller・端子の最小I/O表を作る — 詳細: `npm run work -- PRO05`

PRO05: 代表display・audio・controllerの接続と非接続時挙動を整理する

## 守る条件・残課題

- 接続規格と実装済みportを区別する
- latencyとaccessibilityを同時に測る
- 未解決: Pro固有の統合設計・BOM・実測は未作成

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO05-01（子） | 映像・音声・controllerの用途と最小接続構成を整理する | 未着手 / 現行製品 | PRO01 |
| PRO05-02（子） | 端子・規格候補とdriverの対応表を作る | 未着手 / 現行製品 | PRO01 / PRO05-01 |
| PRO05-03（子） | I/Oの帯域・電力を演算基板候補の制約へ対応付ける | 未着手 / 現行製品 | PRO01 / PRO05-02 |
| PRO05-04（子） | 起動前未接続と機器認識失敗の期待挙動を定義する | 未着手 / 現行製品 | PRO01 / PRO05-01 / PRO05-02 |
| PRO05-05（子） | 抜去・再接続の操作継続と音映像復帰ケースを定義する | 未着手 / 現行製品 | PRO01 / PRO05-04 |
| PRO05-06（子） | 最小I/O表の未決と選定前受入条件をまとめる | 未着手 / 現行製品 | PRO01 / PRO05-03 / PRO05-04 / PRO05-05 |
| PRO05（親） | Proの映像・音声・controller・端子の最小I/O表を作る | 未着手 / 現行製品 | PRO01 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run baseline:check
npm run design:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 代表display、audio、controllerで起動から連続sessionまで実測する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P5 映像・Audio・I/Oの <task ID> を進める。workspaces/P5/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
