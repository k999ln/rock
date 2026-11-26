# 141 Noah 機器保守の模擬状態境界

## 目的

明示的に用意した模擬状態JSONから、利用者のローカル機器の接続状態・操作状態・消耗品の不足を説明する。端末・ネットワーク・外部APIへ接続せず、修理や設定変更を行わない。

## 実装

- `lib/noah-hardware-maintenance.ts` が `noah.hardware-maintenance/1` を検証し、識別子・認証情報・パス・未知の項目を拒否する。
- 12機器ファミリーを同じ純関数の境界で扱う。12個の実機Agentを作ったという意味ではない。
- `lib/catalog.ts` とSkyのcandidate-localテンプレートへ登録し、`deviceWrites: 0` / `externalCalls: 0` を固定する。
- `tests/noah-hardware-maintenance.test.mjs` と既存Sky UI/hand-off試験で、正常・注意・不明・拒否境界を確認する。
- `scripts/check-sky.mjs` の候補数と現行構造ガイドを更新する。
- `data/design-document-index.json` と設計書の候補台帳を39件（ready 16＋candidate 23）へ同期する。

## 検証

`node --experimental-strip-types --test tests/noah-hardware-maintenance.test.mjs tests/sky-tool-ui.test.mjs tests/sky-tool-workspace-handoff.test.mjs`（59件成功）、対象ファイルのoxlint、対象モジュールのtsc（skipLibCheck）を通過。PR: [#112](https://github.com/iceiceice999/rock/pull/112)。

## 数の境界

- 仕様上の機器ファミリー: 12。
- 模擬JSONで確認した実装: 共通状態説明器1つ（12ラベル）。
- このPRの実機受入: 0。既存のCUPS PR #107は別のキュー機能で、この数に含めない。
- 元の96は12×8の模擬分岐、追加300は企画・実機検証待ち。独立Agentの完成数は0/396。

## やらないこと

ホスト探索、ネットワーク探索、任意コマンド、遠隔操作、端末リセット、flash、ドローン制御、実機の修理・成功判定、外部サービスへの送信。
