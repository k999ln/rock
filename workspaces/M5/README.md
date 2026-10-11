# M5 — 組込み・Firmware

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Mini単体でboot・入力・game・保存・停止・復旧を成立させる。

**主担当:** ROCK / **評価対象:** R5の基本設計・候補・試験計画

## 触る場所・読む資料

- [docs/avocado-mini-r5/](../../docs/avocado-mini-r5)
- [contracts/avocado-mini-spatial-interaction.json](../../contracts/avocado-mini-spatial-interaction.json)
- [docs/avocado-mini-r5/package/integrated_design.md](../../docs/avocado-mini-r5/package/integrated_design.md)
- [docs/workstreams/11-material-invention-avocado-mini.md](../../docs/workstreams/11-material-invention-avocado-mini.md)

## 次の作業

- **MINI05**: Mini単独boot・入力・game・保存・停止の最小実装仕様を作る — 詳細: `npm run work -- MINI05`

MINI05: 単独nodeのSensor、World、Input、Game、Display、保存、Safety MCUの責任を割り当てる

## 守る条件・残課題

- OS共通Coreとfirmware責任を分ける
- 通信断時に外部作用を自動再送しない
- 未解決: 表示・精密3D・製造仕様に未決。実機受入0件

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| MINI05-01（子） | 単独nodeのSensor・World・Input・Gameの責任を割り当てる | 未着手 / 現行製品 | MINI01 |
| MINI05-02（子） | Display・保存・停止までの単独利用シーケンスを定義する | 未着手 / 現行製品 | MINI01 / MINI05-01 |
| MINI05-03（子） | 候補基板と必要ドライバーの対応・不足を整理する | 未着手 / 現行製品 | MINI01 / MINI05-01 |
| MINI05-04（子） | 再現buildと起動失敗・保存復旧の記録要件を定義する | 未着手 / 現行製品 | MINI01 / MINI05-02 / MINI05-03 |
| MINI05-05（子） | OS停止と独立Safety MCU遮断の経路を分ける | 未着手 / 現行製品 | MINI01 / MINI05-01 |
| MINI05-06（子） | stub・実Sensor・R5実基板を分けた最小boot受入表を作る | 未着手 / 現行製品 | MINI01 / MINI05-02 / MINI05-03 / MINI05-04 / MINI05-05 |
| MINI05（親） | Mini単独boot・入力・game・保存・停止の最小実装仕様を作る | 未着手 / 現行製品 | MINI01 |

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

全体受入: 候補基板で電源投入から入力Event、停止、再起動、状態復元を完走する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
M5 組込み・Firmwareの <task ID> を進める。workspaces/M5/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
