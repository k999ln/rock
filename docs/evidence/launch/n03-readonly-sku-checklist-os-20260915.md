# N03 機種SKU — 読取り専用診断チェックリスト

- 記録担当: rockstar_bot｜OS
- 作業branch: `codex/rockstaros-launch-candidate-20260910`（PR #4）
- 記録時 HEAD: `0cc5415e4724199505e1f54942918b72eb88ccae`
- 性質: **読取り専用の適合手順**。flash・初期化・unlock実行・クラウド課金は含まない。
- 端末build/flashの実装はスマホ担当。署名はRelease。OSはゲートと証拠区分を維持する。

関連:

- `os/physical/frankel-source-lock.json`
- `docs/phone-preview-20260911.md`
- `docs/current-state-20260911.md`（2026-09-12節）
- `docs/evidence/launch/progress-audit-20260912.json`
- `systems/rock-star-os/docs/device-runbook.md`
- `scripts/inspect-phone.py`（serial非出力・書込みなし）

## 0. 現状ブロッカー

| 候補 | 状態 |
| --- | --- |
| Pixel 10 / `frankel` | lock設定済み。SKU候補 GLBW0 / GL066 / GK2MP。`confirmedSku=null` |
| Pixel 7 / `panther` | 相談で言及のみ。lock未切替 |
| BlackBerry優先 | 旧方針。機種未定。Pixel完了へ読み替え禁止 |
| `targetConfirmedByOwner` | **false** → full OS build / flash **開始禁止** |

## 1. 読取り専用診断（実機1台）

前提: 所有者がUSB debuggingを承認済み。OS/スマホは **書込みコマンドを打たない**。

正規入口（`--serial` **必須**。所有者指定の1台だけ）:

```sh
# Rock root。stdout JSON schema: rock-phone-inspection/1
# serial は成果物JSONに出ない。書込み・flash・unlock実行はしない。
python3 scripts/inspect-phone.py --serial <所有者指定の1台>
```

不足 / 逸脱（使わない）:

- 裸の `python3 scripts/inspect-phone.py`（serial未指定）
- 成果物としての `adb devices -l`（本人の接続確認専用。診断成果物に載せない）

記録する項目（空値は適合にしない。inspect JSON + 必要なら端末表示/公式資料）:

- [ ] 型番（marketing / hardware）
- [ ] 機種コード（frankel / panther / その他）
- [ ] 地域SKU
- [ ] 現在OS build / security patch
- [ ] OEM unlocking 可否（端末表示 + 公式資料）
- [ ] bootloader / recovery へ物理キーで戻れるか（手順確認のみ。実際のwipeはしない）

成果物: `rock-phone-inspection/1` JSON（serial非出力）。環境ラベルは **実機(read-only)**。

訂正: 2026-09-15、スマホ担当の指摘で §1 入口を `--serial` 必須へ更新。

## 2. 1機種固定ゲート

診断後、次のどれか **一つ** に固定する（OSが勝手に課金・flashしない）:

1. Pixel 10 / frankel + 確認済みSKU → lockの `confirmedSku` / `targetConfirmedByOwner` 更新案
2. Pixel 7 / panther → lock・hook・lunch・kernel を panther へ差し替える変更案（スマホ担当）
3. BlackBerry継続 → Pixel bring-up を候補のまま凍結し、N03をBlackBerry適合表へ戻す

固定前に full sync / Soong / flash / クラウド作成を始めない。

## 3. bring-up 前ゲート（固定後・実行は承認/担当境界）

- [ ] lock の device / lunch / hook / target が選んだ機種と一致
- [ ] 未確認SKUは `build-phone-bringup.sh` が fail-closed
- [ ] host: RAM≥64GiB・空き≥400GiB（公式要件）
- [ ] QEMU virt image を実機に書かない
- [ ] **クラウド課金・Droplet作成はユーザー確認後のみ**（方針例外）

## 4. Flash前ゲート（明示承認・別作業）

device-runbook どおり。OSはこのチェックリストでは flash しない。

- 交換可能検証端末、backup復元、OEM unlock、factory hash、物理recovery、battery/USB
- 「全データ消去」と対象端末の直前承認
- serial/product不一致・hash異常で即停止

## 5. 読み替え禁止

- Phone source preparation CI → 実機boot合格
- QEMU / emulator / APK → 実機OS完成
- frankel設定のまま panther 実機へ書込み
- クラウド未承認のまま full source sync

## 6. N03 done 条件

- 読取り専用診断で1機種1SKUが固定され、lockに反映（または明示的にBlackBerryへ戻した記録）
- boot/BSP/更新/復旧の適合表が公式資料付きで埋まる
- flash成功は **含まない**（別ゲート・別承認）
