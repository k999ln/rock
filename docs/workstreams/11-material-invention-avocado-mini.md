# Material Invention / avocadoMini

## Tower20 E3の最新入口

2026-09-22の利用者提供資料により、現行製品は[avocadoMini Tower20 E3](../avocado-mini-tower20-e3/README.md)へ更新した。固定式200mm以下のTower20 4本と、低い別筐体Edge Hub 1台を一つの製品構成とする。P0.2の伸縮塔、E1/E2の単体筐体は設計履歴であり、現行外観ではない。

- `MAT12`: E3資料の境界、現行外観、予定価格、公開Site、Git正本を同期する。資料保存と公開説明の更新であり実機完成ではない。
- `MAT13`: E3の確定CAD、配線、4camera同期、光学、転倒・滑り、熱、電源、音響、OS image、復旧を同一試作機で受け入れる。未着手。
- 主担当`ROCK`は正本、公開説明、software境界を維持する。`JOINT`は実部品、機構、電気、光学、音響、熱、統合実測を担当し、`OWNER`は外観、費用、販売条件、外部用途を確定する。

## Mini200 E2と4本構成の最新入口

2026-09-21の利用者確認により、完成製品の外観は4本の銀色Motion Towerと低い中央ユニットを囲む現在の公開画像を正本とする。[Mini200 E2 four-tower integration baseline](../avocado-mini-mini200-e2/README.md)で、E2のOS・ローカルゲーム・PTT音声・権限・保存・候補computeを中央Coreへ適用し、E2資料の20cm角単体筐体は完成外観へ採用しない。P0.2塔の機構とE2 Coreを一つにする配線、同期、電源、冷却、音響、signed imageと実機受入は未完了。

- `MAT10`: E2資料を精査し、外観の利用者訂正を正本・公開Site・予約説明へ反映。資料保存と公開説明の更新であり実機完成ではない。
- `MAT11`: 4塔＋中央E2 Coreの統合engineering package、prototype、実機受入。未着手。

## Mini200 E1の新しい設計入口

2026-09-21の利用者要求により、使用時20cmのゲーム機から創作・研究・生活へ進む[Mini200 E1](../avocado-mini-mini200-e1/README.md)を追加した。身体入力、本体内計算、日本語ローカルASR候補、PTT、独立MIC OFF、ゲームから保存までを設計する。下記の四方向研究profileとは別で、旧schemaを緩めない。

- `MAT08`: E1本文・図7枚・算術と許可モデル・README保存。設計資料の検証であり実装完成ではない。
- `MAT09`: E1入力profileと既存Core adapter、実ゲーム・実ASR、console OS、閉箱での光学・音響・熱・物理ミュートの独立受入。未着手。
- 最新の[生活・自律動作・衛星通信追補](../avocado-mini-mini200-e1/game-first-life-connectivity.md)は`MAT08`の設計保存に含む。`MAT09`では通信断のゲーム継続、模擬生活機器の同意・越境拒否・結果不明を別試験し、実回線・実家電は別承認と共同受入に進める。製品の入口はゲームだが、既存Pixel/QEMUのCore gateは維持する。
- 主担当`ROCK`は資料と参照モデル、`JOINT`は実部品と統合実測、`OWNER`は外観・費用・外部用途の確認。既存`MAT05`/`MAT06`をE1計算で完了にしない。

再計算: `python3 docs/avocado-mini-mini200-e1/engineering/verify_all.py`。140項目は算術・直列モデルの集計、実ASR・実機は0。Git保存、main統合、Site配備を区別する。

## 目的

物質digital twinを四方向sensorと手の動きで接続・分離し、安全検査、simulation再計算、発明履歴、Patent AI支援までを一つの再現可能な仕事にする。初めて参加する人は、まず[共有用完成設計書](../rockstaros-avocado-mini-complete-design.md)を読む。

## 普段の言葉での全体像

avocadoMiniはRockstarOSを搭載する空間発明端末である。利用者が目の前のデジタル物質を手で組み合わせると、Material Invention Coreが新しい仮説として保存し、安全条件を確認してから計算を更新する。人、AI、計算、文献、実験の根拠を分けたままPatent AIへ渡す。

cameraが実物を変化させるわけではない。gestureだけで物理実験、装置制御、外部共有、Wallet操作、特許出願を承認しない。

## 現在地

- `MAT01`: Core entity、発明loop、安全境界の設計完了。
- `MAT02`: 二物質・複数比率のsandbox Coreと9 testを実装済み。
- `MAT03`: Zema、限定記憶、simulation、外部lab接続は未着手。
- `MAT04`: avocadoMini、XR、四方向sensor、hand interaction、Patent AI統合設計に加え、Bench／ビリヤード台規模Full-scaleの寸法budget、concept画像、機構・光学・電気・演算・安全・校正・HVTのhardware詳細設計まで完了。
- `MAT05`: 決定的scene projectionと合成pose interactionは未着手。
- `MAT06`: 四方向Bench／Full-scale実機prototype、simulation／Patent AI bridgeは未着手。

## 作業範囲

### 含む

- MaterialRecord、候補graph、工程、安全、evidence
- XR scene projectionと2D fallback
- four-view calibration、hand tracking、gesture confidence
- connect、separate、branch、undo／redo
- simulation manifest、receipt、stale、cancel、unknown result
- invention event ledger
- Patent AI provenance bridge
- privacy、accessibility、security、合成fixture、受入

### 含まない

- 未承認の物理実験
- 危険な合成手順の自動生成・実行
- camera serviceからの装置直接制御
- Patent AIによる特許性・発明者・権利帰属の確定
- 自動出願、電子署名、料金支払
- 実材料性能や量産性の未検証合格

## 責任分界

| 主担当 | 責任 |
| --- | --- |
| ROCK | Core、contract、projection、Zema仕事、local interaction、安全gate、2D fallback |
| EXTERNAL | sensor／headset vendor、simulation Provider、材料DB、Patent検索、外部lab固有機能 |
| JOINT | calibration、Provider接続、専門家review、実機／lab受入 |
| OWNER | project作成、共有範囲、費用、物理実験、外部送信、専門家handoffの最終確認 |

## 次に進める順番

1. `MAT05`: 合成Material Core graphから決定的なXR sceneを作る。
2. 合成pose streamでconnect／separate／undoをeventへ変換する。
3. stale、別project、改変、low confidence、sensor欠落を拒否する。
4. view-only 2D／XRでMatter Space、Process Tunnel、安全overlayを表示する。
5. `MAT06`: 一台cameraで誤操作を測り、その後four-view Bench rig、最後にビリヤード台規模Full-scale rigへ進む。
6. 合成simulation receiptとPatent AI packet fixtureを接続する。
7. 実Provider、実headset、実labはそれぞれ独立して受け入れる。

## 担当を選ぶ

- 全担当: 完成設計書Aで、まず同じ製品像を持つ
- Product／UX・Visual: 完成設計書Bと19章
- XR／3D・Computer Vision／Sensor: 完成設計書6〜9章、14章、19章
- Core／Material／Simulation・AI／Agent: 完成設計書10〜16章、19章
- Patent／Legal・Security／Privacy・QA／Safety: 完成設計書15章、19章、21章、24章

## 完了条件

- 同じ入力と版から同じ候補／scene digestを作る。
- lot、工程版、model版、owner、projectを混同しない。
- unknown、stale、unbound、blockedを成功にしない。
- simulationと実験結果を分ける。
- raw cameraとbiometric streamを既定保存・送信しない。
- headsetなしの2D fallbackで同じ主要作業を完了できる。
- 人、AI、simulation、文献、実測のsourceをPatent AI packetで分ける。
- emulatorやfixtureの成功を、実材料・実機・特許・量産の成功と表示しない。

## 関連資料

- [Mini200 E1 — ゲーム機・身体入力・日本語音声](../avocado-mini-mini200-e1/README.md)

- [共有用完成設計書](../rockstaros-avocado-mini-complete-design.md)
- [Material Invention Core](../material-invention-core.md)
- [Spatial Invention Studio](../material-invention-xr.md)
- [avocadoMini端末設計](../avocado-mini-spatial-invention.md)
- [avocadoMiniハードウェア詳細設計](../avocado-mini-hardware-design.md)
- [Patent AI](../sky-patent-assistant-20260912.md)
- [製品ベース](../product-baseline.md)
- [全体構成](../system-composition.md)
- [`contracts/material-invention.json`](../../contracts/material-invention.json)
- [`contracts/material-invention-xr.json`](../../contracts/material-invention-xr.json)
- [`contracts/avocado-mini-spatial-interaction.json`](../../contracts/avocado-mini-spatial-interaction.json)

## 検証

- `npm run baseline:check`
- `npm run system:composition:check`
- `node --experimental-strip-types --test tests/material-invention.test.mjs tests/product-baseline.test.mjs tests/patent-assistant.test.mjs`
- `npm run typecheck`
- `npm run lint:product`
