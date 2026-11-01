# 22 hardware profile `mii` — targets/avocado-mini → targets/mii、3 筐体の記述

## やること
1. `systems/rock-star-os/targets/avocado-mini` → `targets/mii` に `git mv`（task 04 と同じ PR でも可）。
2. `targets/mii/README.md`: profile に書いてよいもの（docs/structure/02 §2）だけを書く: 入出力（4 Tower、表示層 Tier）、電源・熱、通信（Wi-Fi / 有線 / 衛星候補）、local 演算上限、オフライン時の動作（Hub の cache）。**仕事の意味・権限・課金は書かない**。
3. `targets/mii/forms/{column,puck,slot}.yaml`: 筐体ごとの差（センサー数、向き、IP 等級、電源）。Core の中身は共通であることを README に明記。
4. `data/product-baseline.json` / `data/design-document-index.json` の avocado-mini パスを更新、`npm run avocado:r5:check` と `npm run baseline:check` を通す。

## 合格条件
- `ls systems/rock-star-os/targets` が `mii` を含み `avocado-mini` を含まない。
- 2 つの check が通る。
