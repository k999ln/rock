# P7 — 筐体・電源・Security・受入

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Proを家庭内で安全に連続利用し、更新失敗から復旧できる製品へする。

**主担当:** JOINT / **評価対象:** 公開製品説明と要求整理

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO07**: Pro筐体・熱・電源・更新復旧の制約と評価計画を作る — 詳細: `npm run work -- PRO07`

PRO07: 基板、冷却、storage、I/Oから筐体包絡と電力予算の未決を整理する

## 守る条件・残課題

- 参考価格を製造原価と呼ばない
- secure bootとrecoveryを同じ鍵運用で受け入れる
- 未解決: Pro固有の統合設計・BOM・実測は未作成

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO07-01（子） | 基板・冷却・storage・I/Oの筐体包絡入力を整理する | 未着手 / 現行製品 | PRO01 |
| PRO07-02（子） | 動作モード別の電力予算と未選定条件を分ける | 未着手 / 現行製品 | PRO01 / PRO07-01 |
| PRO07-03（子） | 最大同時負荷と通風阻害の熱評価条件を定義する | 未着手 / 現行製品 | PRO01 / PRO07-01 / PRO07-02 |
| PRO07-04（子） | 電源断・中断更新・復旧失敗の受入入力を定義する | 未着手 / 現行製品 | PRO01 |
| PRO07-05（子） | 署名・個体鍵・譲渡消去のOSとProの責任を分ける | 未着手 / 現行製品 | PRO01 |
| PRO07-06（子） | 筐体・熱・更新復旧の計画受入と完成品受入を分離する | 未着手 / 現行製品 | PRO01 / PRO07-03 / PRO07-04 / PRO07-05 |
| PRO07（親） | Pro筐体・熱・電源・更新復旧の制約と評価計画を作る | 未着手 / 現行製品 | PRO01 |

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

全体受入: 同一試作機で連続負荷、過熱、電源断、更新、rollback、data復元を通す。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P7 筐体・電源・Security・受入の <task ID> を進める。workspaces/P7/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
