# 22 hardware profile `mii` — targets/avocado-mini → targets/mii、3 筐体の記述

## やること
1. `systems/rock-star-os/targets/avocado-mini` → `targets/mii` に `git mv`（task 04 と同じ PR でも可）。
2. `targets/mii/README.md`: profile に書いてよいもの（docs/structure/02 §2）だけを書く: 入出力（4 Tower、表示層 Tier）、電源・熱、通信（Wi-Fi / 有線 / 衛星候補）、local 演算上限、オフライン時の動作（Hub の cache）。**仕事の意味・権限・課金は書かない**。
3. `targets/mii/forms/{column,puck,slot,ceiling}.yaml`: 筐体ごとの差（センサー数、向き、IP 等級、電源）。Core の中身は共通であることを README に明記。`ceiling` は第 1 形態（docs/mii/design/v2-study/30〜45）: 真上視点、引掛シーリング／US ボックス給電、投影 0〜2 出力、警報基板（独立 MCU、profile には「有/無」だけ書く）、質量・電力の上限（A 4.5 kg/150 W、D 1.8 kg/50 W、E 7.5 kg/250 W）。
4. `data/product-baseline.json` / `data/design-document-index.json` の avocado-mini パスを更新、`npm run avocado:r5:check` と `npm run baseline:check` を通す。

## 合格条件
- `ls systems/rock-star-os/targets` が `mii` を含み `avocado-mini` を含まない。
- 2 つの check が通る。

## 入力

設計書 docs/mii/design/ の 03 §4（三形態）、06（配線・電源）、07 §6（本数可変）。
