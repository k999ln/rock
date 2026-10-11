# P2 — Compute・基板

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** ゲーム、サービス、ローカルAIを所定性能と電力内で実行する。

**主担当:** ROCK / **評価対象:** 公開製品説明と要求整理

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO02**: Proの代表負荷・性能予算と演算基板候補の比較条件を定義する — 詳細: `npm run work -- PRO02`

PRO02: ゲーム単独、ゲーム＋音声、サービス＋保存、ローカルAI併用の負荷を定義する

## 守る条件・残課題

- 候補SoCの公称値を製品性能と呼ばない
- 性能・熱・価格を同じworkloadで比較する
- 未解決: Pro固有の統合設計・BOM・実測は未作成

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO02-01（子） | ゲーム単独とゲーム＋音声の再現負荷を定義する | 未着手 / 現行製品 | PRO01 |
| PRO02-02（子） | サービス＋保存とローカルAI併用の再現負荷を定義する | 未着手 / 現行製品 | PRO01 |
| PRO02-03（子） | 解像度・FPS・p95遅延・RAM・I/Oの計測欄を統一する | 未着手 / 現行製品 | PRO01 / PRO02-01 / PRO02-02 |
| PRO02-04（子） | 電力・温度・継続負荷の比較条件を定義する | 未着手 / 現行製品 | PRO01 / PRO02-01 / PRO02-02 |
| PRO02-05（子） | CPU・GPU・NPU候補のdriver・OS・供給条件を比較表へ揃える | 未着手 / 現行製品 | PRO01 |
| PRO02-06（子） | 同条件比較から候補を選ぶ判定手順と保留条件を作る | 未着手 / 現行製品 | PRO01 / PRO02-03 / PRO02-04 / PRO02-05 |
| PRO02（親） | Proの代表負荷・性能予算と演算基板候補の比較条件を定義する | 未着手 / 現行製品 | PRO01 |
| MAT16 | avokadoProのNVIDIA搭載小型PC設計・調達・AI/PCゲーム/熱/復旧受入 | 進行中 / 現行製品 | — |

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

全体受入: 代表game、AI、serviceを同時負荷で実測し、熱・電力上限内に収める。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P2 Compute・基板の <task ID> を進める。workspaces/P2/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
