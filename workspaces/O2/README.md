# O2 — Work・Data

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 仕事、状態、成果物、Receiptを競合なく保存し、再起動後も復元する。

**主担当:** ROCK / **評価対象:** Webの仕事保存APIと既存platform契約

## 触る場所・読む資料

- [lib/workflow.ts](../../lib/workflow.ts)
- [app/api/work-jobs/](../../app/api/work-jobs)
- [db/schema.ts](../../db/schema.ts)
- [drizzle/](../../drizzle)
- [contracts/platform-api.json](../../contracts/platform-api.json)
- [docs/platform-core.md](../../docs/platform-core.md)
- [docs/workstreams/01-product-ux.md](../../docs/workstreams/01-product-ux.md)
- [docs/data-storage-boundaries.md](../../docs/data-storage-boundaries.md)

## 次の作業

- **AI04**: 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 — 詳細: `npm run work -- AI04`

AI04: OS10の保存契約とoperation key・結果照会の対応を確認する

## 守る条件・残課題

- idempotencyを必須にする
- 結果不明を成功へ変換しない
- 利用者別保存を分離する
- 未解決: AI04の結果不明/crash拡張と全環境parityは未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| AI04-01（子） | OS10保存契約と外部作用outboxの状態・永続fieldを対応付ける | 未着手 / 共通基盤 | OS10 |
| AI04-02（子） | 結果不明・重複・取消・crashの決定的fixtureを固定する | 未着手 / 共通基盤 | OS10 / AI04-01 |
| AI04-03（子） | dispatch前のoutbox保存・権限再検査・operation key固定を実装する | 未着手 / 共通基盤 | OS10 / AI04-02 |
| AI04-04（子） | provider照会とreceiptの署名・内容・金額・finality照合を実装する | 未着手 / 共通基盤 | OS10 / AI04-03 |
| AI04-05（子） | 再起動後の承認・receipt回収と取消競合を故障注入試験する | 未着手 / 共通基盤 | OS10 / AI04-04 |
| AI04-06（子） | AI01・OS10の依存とAI04全体の復旧証拠を同一版で受入する | 未着手 / 共通基盤 | OS10 / AI04-05 |
| AI04（親） | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 | 未着手 / 共通基盤 | OS10 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| DB01 | 全データ境界・table・migration・本番readback状態を一つの監査レポートへ統合 | 完了記録あり / 共通基盤 | — |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了記録あり / 共通基盤 | — |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了記録あり / 共通基盤 | — |
| G03 | Web DBの保存境界・互換migration・重複防止checkを整理 | 完了記録あり / 共通基盤 | — |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run schema:check
npm run database:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: Web、QEMU、Androidで同一fixtureのcrash、競合、重複、復旧を通す。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O2 Work・Dataの <task ID> を進める。workspaces/O2/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
