# P1 — Pro統合設計

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Proの要求、構成、BOM、接続、受入条件を一つの正本へ固定する。

**主担当:** ROCK / **評価対象:** 公開製品説明と要求整理

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO01**: Pro v0.1の製品要求と単独利用・任意Mini連携の境界を定義する — 詳細: `npm run work -- PRO01`

PRO01: 公開説明からgames・services・compute・storage・audioの要求候補を抽出する

## 守る条件・残課題

- 公開サイトの文言を実装証拠にしない
- 旧E3 Hubを現行Proへ自動転用しない
- 未解決: Pro固有の統合設計・BOM・実測は未作成

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO01-01（子） | games・services・compute・storage・audioの要求候補を抽出する | 未着手 / 現行製品 | — |
| PRO01-02（子） | Pro単独利用の利用者・入出力・成功条件を定義する | 未着手 / 現行製品 | PRO01-01 |
| PRO01-03（子） | 任意Mini連携の追加機能と切断時の境界を分ける | 未着手 / 現行製品 | PRO01-02 |
| PRO01-04（子） | Pro要求の主担当と受入方法をP2〜P7へ割り当てる | 未着手 / 現行製品 | PRO01-01 / PRO01-02 / PRO01-03 |
| PRO01-05（子） | 性能・端子・価格・筐体の未決台帳を作る | 未着手 / 現行製品 | PRO01-01 |
| PRO01-06（子） | v0.1要求整理からv1.0統合設計へ渡す不足をまとめる | 未着手 / 現行製品 | PRO01-04 / PRO01-05 |
| PRO01（親） | Pro v0.1の製品要求と単独利用・任意Mini連携の境界を定義する | 未着手 / 現行製品 | — |

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

全体受入: Pro専用正本とproject taskが作成され、P2〜P7のInterfaceと合格条件が閉じている。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P1 Pro統合設計の <task ID> を進める。workspaces/P1/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
