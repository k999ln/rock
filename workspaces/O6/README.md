# O6 — Device Adapter

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 共通Coreを作り直さず、各hardwareをDevice ProfileとAdapterで接続する。

**主担当:** ROCK / **評価対象:** QEMU/Androidの限定試作とDevice Profile設計

## 触る場所・読む資料

- [android/](../../android)
- [os/](../../os)
- [data/device-support-matrix.json](../../data/device-support-matrix.json)
- [docs/device-support-architecture.md](../../docs/device-support-architecture.md)
- [docs/workstreams/07-android-device-local-ai.md](../../docs/workstreams/07-android-device-local-ai.md)
- [docs/os-prototype.md](../../docs/os-prototype.md)

## 次の作業

- **OS02**: 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 — 詳細: `npm run work -- OS02`

OS02: 型番・source lock・vendor artifactを同じ構成で確認する

## 守る条件・残課題

- hardware固有処理をCoreへ埋め込まない
- Device Profileごとに互換範囲を宣言する
- 実機証拠を機種間で転用しない
- 未解決: R5/Pro固有adapterとPixel全OSは未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| OS02-01（子） | Pixel 10 GL066/frankelとsource lockの対象を再照合する | 未着手 / 共通基盤 | — |
| OS02-02（子） | source署名・vendor inventory・純正復旧artifactの入力matrixを作る | 未着手 / 共通基盤 | OS02-01 |
| OS02-03（子） | 専用x86_64 LinuxのCPU・RAM・空き容量・依存を適合判定する | 未着手 / 共通基盤 | — |
| OS02-04（子） | build前freezeの不足入力と準備検査のfail-closedを検証する | 未着手 / 共通基盤 | OS02-02 / OS02-03 |
| OS02-05（子） | 適合済みLinux向けcompile-only再現手順とartifact保全条件を固定する | 未着手 / 共通基盤 | OS02-04 |
| OS02-06（子） | OS02適合確認の全条件とfull build・first-flashの別gateをレビューする | 未着手 / 共通基盤 | OS02-05 |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 未着手 / 共通基盤 | OS10 |
| OS02（親） | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 / 共通基盤 | — |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 / 共通基盤 | OS02 |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 / 共通基盤 | OS03 |
| OS10 | Tool／MCP／Provider共通APIとnative Zema選択Tool経路、本人承認、Wallet台帳、暗号化backup、署名更新gateを実装 | 進行中 / 共通基盤 | — |
| OS11 | Platform CoreをAOSPでbuildしSELinux enforcing boot、production署名更新、OTA rollbackを実機検証 | 未着手 / 共通基盤 | OS10 / OS04 / OS08 / OS09 |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 / 共通基盤 | — |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 / 共通基盤 | — |
| N04 | Pixel 10受入後だけ二機種目のDevice Support Package候補を再評価 | 未着手 / 共通基盤 | N03 |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 / 共通基盤 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了記録あり / 共通基盤 | — |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了記録あり / 共通基盤 | — |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了記録あり / 共通基盤 | — |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run android:architecture:check
npm run device-support:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 同じCore fixtureをQEMU、Pixel、Mini emulator、Pro emulatorで通す。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O6 Device Adapterの <task ID> を進める。workspaces/O6/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
