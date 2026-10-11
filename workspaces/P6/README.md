# P6 — Mini接続・時刻同期

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 一台以上のMiniを発見・pairingし、Poseを正しい順序と遅延でProへ届ける。

**主担当:** ROCK / **評価対象:** Mini単独通信とPro独立PCを維持した任意連携の責任境界

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO06**: 任意Mini–Pro接続の認証・時刻・Pose契約v0を作る — 詳細: `npm run work -- PRO06`

PRO06: Mini cellular設計とPro P0設計を照合し任意連携・切断時独立動作の契約を具体化する

## 守る条件・残課題

- 1台と複数台を別caseで受け入れる
- packet欠落を架空Poseで補わない
- 再接続時に外部作用を重複しない
- 未解決: Mini接続の本人認証・校正・時刻同期・停止と切断復旧のPro固有受入は未実施。Miniの単独動作・SIM通信をPro必須へ変更しない

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO06-01（子） | pairingと能力交渉の機器認証条件を定義する | 未着手 / 現行製品 | PRO01 |
| PRO06-02（子） | Pose eventのschema版・座標・単位・時刻を共通化する | 未着手 / 現行製品 | PRO01 / PRO06-01 |
| PRO06-03（子） | Poseの順序・鮮度・重複・時計ずれの判定を定義する | 未着手 / 現行製品 | PRO01 / PRO06-02 |
| PRO06-04（子） | 切断・古いepoch・再接続の状態遷移を整理する | 未着手 / 現行製品 | PRO01 / PRO06-01 / PRO06-02 |
| PRO06-05（子） | 未知機器と異常Poseのsynthetic fixtureを設計する | 未着手 / 現行製品 | PRO01 / PRO06-03 / PRO06-04 |
| PRO06-06（子） | 1・2・4 Mini追加profileと単独動作の境界をまとめる | 未着手 / 現行製品 | PRO01 / PRO06-01 / PRO06-02 / PRO06-04 / PRO06-05 |
| PRO06（親） | 任意Mini–Pro接続の認証・時刻・Pose契約v0を作る | 未着手 / 現行製品 | PRO01 |

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

全体受入: 1台・4台で遅延、jitter、欠落、時刻ずれ、切断、再接続を測定する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P6 Mini接続・時刻同期の <task ID> を進める。workspaces/P6/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
