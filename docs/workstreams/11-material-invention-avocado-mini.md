# Material Invention / avocadoMini

## 目的

物質digital twinを四方向sensorと手の動きで接続・分離し、安全検査、simulation再計算、発明履歴、Patent AI支援までを一つの再現可能な仕事にする。初めて参加する人は、まず[共有用完成設計書](../rockstaros-avocado-mini-complete-design.md)を読む。

## 普段の言葉での全体像

avocadoMiniはRockstarOSを搭載する空間発明端末である。利用者が目の前のデジタル物質を手で組み合わせると、Material Invention Coreが新しい仮説として保存し、安全条件を確認してから計算を更新する。人、AI、計算、文献、実験の根拠を分けたままPatent AIへ渡す。

cameraが実物を変化させるわけではない。gestureだけで物理実験、装置制御、外部共有、Wallet操作、特許出願を承認しない。

## 現在地

- `MAT01`: Core entity、発明loop、安全境界の設計完了。
- `MAT02`: 二物質・複数比率のsandbox Coreと9 testを実装済み。
- `MAT03`: Zema、限定記憶、simulation、外部lab接続は未着手。
- `MAT04`: avocadoMini、XR、四方向sensor、hand interaction、Patent AI統合設計は完了。
- `MAT05`: 決定的scene projectionと合成pose interactionは未着手。
- `MAT06`: 四方向実機prototype、simulation／Patent AI bridgeは未着手。

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
5. `MAT06`: 一台cameraで誤操作を測り、その後four-view tabletop rigへ進む。
6. 合成simulation receiptとPatent AI packet fixtureを接続する。
7. 実Provider、実headset、実labはそれぞれ独立して受け入れる。

## 担当を選ぶ

- Product／UX: 完成設計書15章のProduct／UX
- XR／3D: 完成設計書15章のXR／3D
- Computer Vision／Sensor: 完成設計書15章のComputer Vision／Sensor
- Material／Simulation: 完成設計書15章のMaterial／Simulation
- AI／Agent: 完成設計書15章のAI／Agent
- Patent／Legal: 完成設計書15章のPatent／Legal
- Security／Privacy: 完成設計書15章のSecurity／Privacy
- QA／Safety: 完成設計書15章のQA／Safety

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

- [共有用完成設計書](../rockstaros-avocado-mini-complete-design.md)
- [Material Invention Core](../material-invention-core.md)
- [Spatial Invention Studio](../material-invention-xr.md)
- [avocadoMini端末設計](../avocado-mini-spatial-invention.md)
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

