# cancel実停止 / RSS 性能ゲート（OS記録）

- 記録担当: rockstar_bot｜OS
- 作業branch: `codex/rockstaros-launch-candidate-20260910`（PR #4）
- 対象配布: `1.0.0-preview.20260911-rc2`
- native source: `b7d819cd291b653d165aa124f25a52b9898bfb2e`
- 本文書の性質: **既存証拠の読取りに基づく合格条件の固定**。このcommit時点で新しいQEMU再走は行っていない。
- Release整合: cancel / RSS を正式配布ブロッカーとしてチェックリストへ固定済み（空のACK不要の受領）。
- mainへは入れない。

関連正本:

- [rc2追加受入](../../rc2-remaining-acceptance-20260911.md)
- [rc2導入受入](../../os-acceptance-b7d819c-20260911.md)
- [最終受入計画](../../os-final-acceptance-plan-20260910.md)
- 取消観測: [cancel-observation.json](../rls01/remaining-b7-rc2/cancel-observation.json)
- RSS再集計: [cancel-memory-reanalysis-20260911.json](./cancel-memory-reanalysis-20260911.json)

## 環境ラベル（必須）

| ラベル | 意味 | このゲートでの使い方 |
| --- | --- | --- |
| host | macOS/Lima上などのQEMUプロセス計測 | RSS / CPU sample の計測面 |
| 仮想OS (guest) | ARM64 QEMU virt 内のUI / job / authority | cancel UI・child PID・台帳の判定面 |
| fixture | 合成開発データ・テスト署名 | 正式署名・本番資金ではない |

混ぜないもの: 実機、本番provider、main、正式署名配布。

## A. cancel実停止ゲート

### 現状

- 結果: `NOT_OBSERVED_SINGLE_ATTEMPT`
- child: `NOT_OBSERVED_NO_PID_PROOF`
- 証拠: `docs/evidence/rls01/remaining-b7-rc2/cancel-observation.json`
- Release判定: 正式配布ブロッカーとして維持

### 再現手順（仮想OS / fixture）

1. 過去受入VMと合算しない、専用の新しいguest端末を使う。
2. 通常UIから引用整理（既存商品）を起動する。
3. **実行中状態**（取消ボタンが present）になるまで待つ。入力編集画面への固定座標クリックは無効。
4. UIから取消を1系統で実行する。
5. 同時にguest内で対象jobの child PID を観測する（開始→終了）。PID証明なしは不合格。
6. cancel receiptの有無、job最終状態、authority 5DB/71表、停止diskを独立readbackする。
7. workerを故意に遅くして合格を作らない。繰返し試行で `NOT_OBSERVED` を PASS に書き換えない。

### 合格条件（全部必須）

- 環境ラベルが host / 仮想OS / fixture で記録されている。
- 実行中UI present の画面証拠（before）と cancel 操作後の画面。
- child PID の started → terminated（または同等のguest証明）。`NOT_OBSERVED_NO_PID_PROOF` は不合格。
- cancel receipt が作成され、取消対象jobが成功完了のまま残らない。
- authority / 停止DB整合。live秘密鍵ファイルを開かない。
- 結果コード契約を明示する（既存 exit 2 は観測不成立用。PASS時は成功契約を別に書く）。

### 読み替え禁止

- 入力画面クリックのみでの「取消成功」
- 単発失敗を無視した再試行水増し
- 2bootの正常終了だけを cancel PASS に数える
- D6 / soak 成績への合算

## B. RSS / 性能ゲート

### 現状

- cancel補助kit 2bootの RSS growth: `721328` / `714104` KiB
- 上限: `524288` KiB（512 MiB）
- `performance_gate_pass: false`
- 再集計 `docs/evidence/launch/cancel-memory-reanalysis-20260911.json` は `DIAGNOSTIC_NOT_ACCEPTANCE`
- D6 scoped PASS でこの超過を消さない

### 計測ラベル

- RSS / CPU sample = **host上のQEMUプロセス**
- guest各serviceのリーク証明ではない
- D6長時間試験と cancel補助2boot は別キット・別判定

### 再現手順（host計測 + 仮想OS負荷）

1. 全性能gate判定ありの性能専用キットを使う。cancel補助kitは使わない。
2. 閾値を固定する: peak RSS 2 GiB、RSS growth 512 MiB、平均QEMU CPU 3.5 cores、sample間隔2s・gap上限10s（受入計画準拠）。
3. ready monotonic を保存してから steady-state 区間を切る。shutdown区間を growth に混ぜない。
4. 原本 samples / report の hash を残し、別readerで再集計可能にする。

### 合格条件

- growth ≤ 524288 KiB かつ peak ≤ 2 GiB、CPU / gap が計画内。
- ready時刻ありの steady-state 区間であること。
- 終了操作混入の conservative subset だけでは PASS にしない。
- D6（または同等soak）原本との独立照合。

### 読み替え禁止

- cancel補助2bootの超過を無視する
- conservative subset（例: 7504 / 23376 KiB増）をリークなし・steady-state合格と宣言する
- guestサービス別リーク未計測のまま「OSメモリ合格」と表示する
- 旧版（例: 9ab）のD6成績を rc2 へ転用する

## C. 関連未完（OS同意）

- 別host / VM全損復旧: 未完了
- 保存データあり端末の削除: 空端末削除のみ実績
- rc2未署名: 正式配布不可

## D. Release向け要約

| 項目 | 判定 |
| --- | --- |
| cancel実停止 | `NOT_OBSERVED` 維持。PID証明なしは不合格。正式配布ブロッカー |
| RSS | `performance_gate_pass: false` 維持。補助kit超過を無視しない |
| 環境ラベル | host / 仮想OS / fixture 必須 |
| rc2署名 | 未署名のため正式配布不可 |
