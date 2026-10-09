# P3 — Game Runtime・SDK

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Pro単体とMini連携のgameを作者が導入、実行、保存、削除できるようにする。

**主担当:** ROCK / **評価対象:** 公開製品説明と要求整理

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/game-api-contract-draft.md](../../docs/game-api-contract-draft.md)
- [systems/rock-star-os/examples/game/README.md](../../systems/rock-star-os/examples/game/README.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO03**: Pro非金融ゲームのsample・保存再開・入力SDKの差分仕様を作る — 詳細: `npm run work -- PRO03`

PRO03: 既存DX01の共通契約とPro固有profileの不足を対応付ける

## 守る条件・残課題

- 共通Game SDK完成をPro受入へ加算しない
- Game point発行とWallet記帳権限を分離する
- 未解決: Pro固有の統合設計・BOM・実測は未作成

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO03-01（子） | DX01共通契約とPro固有profileの差分を整理する | 未着手 / 現行製品 | PRO01 |
| PRO03-02（子） | controllerの操作を意味操作へ対応付ける | 未着手 / 現行製品 | PRO01 / PRO03-01 |
| PRO03-03（子） | 任意Mini入力を同じ意味操作へ変換する差分を定義する | 未着手 / 現行製品 | PRO01 / PRO03-02 |
| PRO03-04（子） | sampleの版・導入・playの再現手順を定義する | 未着手 / 現行製品 | PRO01 / PRO03-01 / PRO03-02 |
| PRO03-05（子） | 中断・保存・再開の形式と期待状態を定義する | 未着手 / 現行製品 | PRO01 / PRO03-04 |
| PRO03-06（子） | 削除まで含めた非金融gameの受入ケース表を作る | 未着手 / 現行製品 | PRO01 / PRO03-03 / PRO03-04 / PRO03-05 |
| PRO03（親） | Pro非金融ゲームのsample・保存再開・入力SDKの差分仕様を作る | 未着手 / 現行製品 | PRO01 |

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

全体受入: Pro candidateでsample gameの導入、実行、Mini入力、保存、削除、復旧を完走する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P3 Game Runtime・SDKの <task ID> を進める。workspaces/P3/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
