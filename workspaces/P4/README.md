# P4 — Service・Storage

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 利用者別のservice、session、assetを暗号化して保存・復元する。

**主担当:** ROCK / **評価対象:** OS/apps用とmodel/assets用の保存構成案・仕事復旧の要求

## 触る場所・読む資料

- [docs/avokado-pro-pc-design.md](../../docs/avokado-pro-pc-design.md)
- [sites/avocado-mini/src/pages/pro/index.astro](../../sites/avocado-mini/src/pages/pro/index.astro)
- [docs/data-storage-boundaries.md](../../docs/data-storage-boundaries.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)
- [docs/workstreams/08-game-market-fund.md](../../docs/workstreams/08-game-market-fund.md)

## 次の作業

- **PRO04**: Proの利用者別保存・容量・backup・復旧契約を定義する — 詳細: `npm run work -- PRO04`

PRO04: 既存2TB×2構成案に本人分離・backup・仕事とゲームsaveの復旧条件を対応付ける

## 守る条件・残課題

- 利用者間でdataを共有しない
- 保持・削除・backupをcategory別に定義する
- 未解決: 暗号化・backup・失効・再起動後復旧のPro固有契約は未固定。共通storageの証拠をPro実機受入へ転用しない

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| PRO04-01（子） | session・game・作品・秘密参照・ログの保存分類表を作る | 未着手 / 現行製品 | PRO01 |
| PRO04-02（子） | 利用者分離と別owner読取拒否のfixtureを設計する | 未着手 / 現行製品 | PRO01 / PRO04-01 |
| PRO04-03（子） | 容量不足・並行更新・中断時の保存契約を定義する | 未着手 / 現行製品 | PRO01 / PRO04-01 |
| PRO04-04（子） | 暗号鍵の責任とcrash・鍵喪失時の復旧境界を定義する | 未着手 / 現行製品 | PRO01 / PRO04-01 / PRO04-02 |
| PRO04-05（子） | backup・restoreとschema版更新のfixtureを設計する | 未着手 / 現行製品 | PRO01 / PRO04-01 / PRO04-03 / PRO04-04 |
| PRO04-06（子） | export・deleteと削除後の再アクセスのfixtureを設計する | 未着手 / 現行製品 | PRO01 / PRO04-01 / PRO04-02 / PRO04-04 / PRO04-05 |
| PRO04（親） | Proの利用者別保存・容量・backup・復旧契約を定義する | 未着手 / 現行製品 | PRO01 |

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

全体受入: 複数利用者、容量不足、電源断、backup、削除、復元を実機で受け入れる。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
P4 Service・Storageの <task ID> を進める。workspaces/P4/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
