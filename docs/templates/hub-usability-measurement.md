# Hubの初回完了・再探索・復旧を測る記録票

**未実施の測定手順。参加者、時刻、秒数、改善率は記入していない。** 外部利用者への連絡や募集は含まない。Gitの10人/30%/7日再利用という数字は提案されたpilot目標であり、実績ではない。

RQ01–11 / 0→1・逆張りの問い・秘密を探す / 結果を探す、接続が切れた要求をやり直す、費用の確定が分からない不便 / 既存Hub・PC商品と停止後結果 / 同じ公開入力と事前固定の観測票 / 初回準備・操作・待ち・成果再探索・元要求復旧 / 未加工イベントと成果hash、失敗を含む全試行。

## 比較の前に固定する

- 参加者は匿名ID、既存PC手順、使用経験、実際のhost/入力方法を記入する。本人が普段使わない内部workerを「既存手順」と代用しない。
- 対象は公開引用sample150 bytes、SHA256 `bad73028a4b23b6e046abc4a1463f2fa14ffd4f55844ec9146cdc9acc3b1387e`。機密原稿は使わない。
- source/image、商品ID/版/作者、入力・成果契約、事前説明の量、利用条件、実行先、cache/初回準備の状態、観測用の時計を試行前に記録する。
- nativeの同一recipe間は151 bytes / SHA256 `e5e655f1c0c3008fd895f0eba61f206cf83035d376ab63d76846bf0636840fa7` を完全照合する。Mr.の既存CLIは155 bytes / SHA256 `30dafde5d3c32d7c690276656f8d5ed0ff924b2c9b5617ede86820efc0b1a0f6`。区切り線一行の差を持つ別成果契約なので、同名だけで同一商品としない。
- 違う契約の経路を比べるなら、本文/コード中の引用/出典一覧/順序/リンクの保持を別に採点し、区切り線の差を表示する。利用者が必要とする成果条件を片方が満たさない場合、その試行を同品質の速度比較へ含めない。測定後の正規化で完全一致を作らない。
- 順番による学習差を避けるため、経路AB/BAを事前に割り当てる。反復回数と停止条件も先に記録し、結果を見て試行を追加したり外れ値を除いたりしない。

## 一回の仕事の区間

| 区間 | 開始・終了の観測点 | 記録すること |
| --- | --- | --- |
| 初回準備 | 手順を開く→実行可能な状態 | 依存取得、設定数、同意、所要時間、支援の有無 |
| 実行 | 入力を開く→結果を読み確認 | 意味のあるクリック/キー操作、画面切替、手動copy、active時間、機械待ち |
| 再探索 | 結果を閉じる→同じ成果を再発見 | ファイル検索・履歴操作、元job/版/output hash、探索時間 |
| 正常再開 | 通常終了確認→同じ保存結果を確認 | OS/runner起動待ちと人の操作を別計時 |
| 切断からの復旧 | 承認済み試験runner停止→元要求の完了確認 | 失敗表示まで、原因特定、復旧操作、待ち、元key/receipt一致、二重実行数 |
| 費用の説明 | 仕事完了→状態を本人が説明 | 見積・保留・確定・未接続の区別、説明時間、誤認数 |

active時間と機械待ちが重なる場合は区間を分け、経過時間へ二重加算しない。画面切替はアプリ/主要画面の遷移、単なるscrollは別記録。Ctrl+Enterなど一つの意図を持つキー操作と文字入力数を区別する。自動QMPのpointer park/OCR capture/監視pollは人の操作に加えない。記録していない値はnull/未測定とし、0にしない。

## 記録票（1試行ごとにコピー）

```json
{
  "schema": "rock-hub-usability-trial/1",
  "status": "TEMPLATE_NOT_RUN",
  "participant_id": null,
  "route": null,
  "source_commit": null,
  "image_sha256": null,
  "product_contract": null,
  "input_sha256": null,
  "output_sha256": null,
  "prepared_plan_sha256": null,
  "started_utc": null,
  "finished_utc": null,
  "initial_setup_seconds": null,
  "human_active_seconds": null,
  "machine_wait_seconds": null,
  "semantic_actions": null,
  "text_characters": null,
  "screen_transitions": null,
  "manual_copy_actions": null,
  "result_rediscovery_seconds": null,
  "diagnosis_seconds": null,
  "recovery_human_seconds": null,
  "recovery_machine_seconds": null,
  "same_request_recovered": null,
  "duplicate_effects": null,
  "quality_accepted_under_preregistered_contract": null,
  "assistance_and_failures": [],
  "events": [],
  "evidence_sha256": {}
}
```

時刻付きeventはaction、開始/終了、観測方法、対象job/key、画面/保存結果のhashを持たせる。秘密値・原稿は記入しない。接続切断などの故障は所有する合成試験環境だけで行い、実ユーザーの実行中作業へ割り込まない。

## 集計と今回の未達

全試行数、初回完了数、失敗と支援の件数を分母付きで示す。同品質の対を確認したうえで、人のactive時間と機械待ちの中央値を別に比較する。改善率は `(既存 − Hub) / 既存` で、基準が0または未測定なら算出しない。内部機械測定、内部UI自動操作、人の測定、外部pilotを混ぜない。

今回のMac機械測定ではnative151-byte成果一致を確認したが、人のactive時間削減、初見利用者の完了率、7日間の自主再利用、需要・利益は未測定。再利用を測るときも、7日後の本人の自発利用とリマインド後の利用を分け、まだ経過していない日数の実績を作らない。
