> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 実機検証・復旧runbook

## 用途

このrunbookは、Cuttlefish接続、Android検証端末のADB接続、将来のPixel image書込み判定に使います。BlackBerry 10へ任意imageを書き込む手順ではありません。

## ADB接続

前提:

- Android Platform Toolsの `adb` がPATHにある。
- 端末所有者がUSB debuggingを有効にし、このPCのfingerprintを端末画面で承認した。
- PC receiverが `127.0.0.1` で起動している。

手順:

```bash
adb devices -l
./scripts/connect-android.sh 8765
adb reverse --list
```

解除:

```bash
adb reverse --remove tcp:8765
```

接続先が複数ある場合は勝手に1台を選ばず、`ANDROID_SERIAL` を明示します。

## Flash前ゲート

次を満たすまでflash commandを実行しません。

- [ ] 交換可能な検証端末で、正確なmodel/variant/serialを記録した。
- [ ] data backupを別媒体から復元できることを確認した。
- [ ] OEM unlocking可否を端末と公式資料で確認した。
- [ ] 対応するfactory image、hash、driver/BSPを取得した。
- [ ] bootloader/recoveryへ物理キーで戻れる。
- [ ] factory復旧を先に一度実施した。
- [ ] build targetがmodelと一致する。
- [ ] batteryが十分で、安定したUSB cableを使う。
- [ ] 利用者が「全データ消去」と対象端末を理解して直前承認した。

## 書込み中の停止条件

- serialまたはproduct codeが予定と違う。
- battery、USB、host storage、hashに異常がある。
- anti-rollbackやpartition layoutが資料と違う。
- command outputにFAILED、signature、verification、sparse image errorが出る。
- 復旧imageの取得元またはhashを検証できない。

エラー時は推測で別partitionへ書かず、出力を保存して停止します。

## Rollback

1. toolとPC receiverを停止し、job DBをbackupする。
2. bootloaderまたはrecoveryへ物理操作で入る。
3. model/variantを再確認する。
4. 検証済みfactory imageへ戻す。
5. boot完了、radio、USB、storageを確認する。
6. 必要ならbootloaderを再lockする。ただし公式imageと完全一致が確認できた場合だけ行う。
7. 原因、command、hash、結果をincident記録へ残す。

## Escalation

bootloaderにもrecoveryにも入れない、radio/EFS相当領域が失われた、端末が異常発熱する場合は通電と試行を止めます。hardware programmer等へ範囲を広げる前に、データ価値、端末交換費用、法的所有権を確認します。
