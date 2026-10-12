# RockstarOS Spatial Invention Studio — Material Invention CoreのVR／AR設計

状態: RQ49 Material Invention Coreの標準製品体験として設計承認。RQ48のVR応用方針を再利用し、scene契約と安全policyは固定済み。VR／AR runtime、headset実機、camera／marker認識、共同session、化学simulation、外部ラボ、装置制御は未実装。

## 1. 目指す体験

Spatial Invention Studioは、物質、配合、工程、simulation、実測、失敗を空間内で比較し、発明候補の違いを理解しやすくするMaterial Invention Coreの標準表示・操作systemである。別製品や任意addonではない。XRを見栄えのためだけに使わず、次の三つを短時間で行えることを価値にする。

1. **VRで探索する**: 候補graph、配合差、工程順、予測値、不確かさ、証拠の強さを立体的に並べ、複数案を比較する。
2. **ARで照合する**: 現実の試料、容器、設備、測定位置へ、正しい候補ID、lot、工程版、安全状態、観察項目を重ねる。
3. **Coreへ証拠を戻す**: 空間内のメモ、比較、写真をそのまま実験結果にせず、出所付きの`SpatialAnnotation`／`ObservationReceipt`として候補へ関連付ける。

画面、マウス、キーボードでも同じ情報を確認できる2D fallbackを必須にし、XR機器をMaterial Invention Coreの利用条件にはしない。

最初のreference device conceptは[`avocadoMini`](avocado-mini-spatial-invention.md)とする。四方向のsensor／cameraで手の動きを捉え、Invention Volume内の物質digital twinを接続・分離して候補を再計算し、Patent AIへ発明履歴を引き継ぐ。`avocadoMini`はhardware名で、搭載OSの正式名はRockstarOSのまま維持する。

## 2. 空間ワークスペース

### VR Candidate Workbench

- **Matter Space**: 物質をnode、候補をcomposition node、工程をtimelineとして配置する。候補を選ぶと物質lot、比率、工程版、安全状態を同時表示する。
- **Ratio Morph**: 二物質の比率候補を連続した帯として見せる。ただし未計算の中間値を予測済みデータとして補間しない。
- **Process Tunnel**: 混合、保持、加工、冷却などを時間軸に沿ってたどる。温度、圧力、雰囲気、設備条件を単位付きで表示する。
- **Evidence Layers**: AI仮説、文献、supplier、simulation、実験receiptを別layerにし、同じ色や確度として混ぜない。
- **Ghost Compare**: 最大4候補を同じ基準座標へ重ね、差分だけを表示する。表示倍率や色の意味を常時legendへ出す。
- **Failure Museum**: 失敗候補を削除せず、停止理由、測定差、次の仮説とともに再利用する。

### AR Lab／Field View

- signed QR、NFC、画像marker等を交換可能なadapterで読み、`materialId + lot`、`candidateId`、`processId + version`をCoreの記録と照合する。
- 試料や設備へ安全状態、期限、担当、観察点を重ねる。位置が不安定、markerが古い、対象が不一致ならoverlayを灰色にして`STALE_OR_UNBOUND`を表示する。
- 利用者が音声、文字、写真、空間pinで観察を残せる。camera frameや音声は既定で端末内処理し、明示承認なしに外部送信しない。
- ARの矢印や境界線は案内表示であり、設備の安全距離、校正、PPE、法規適合の証明に使わない。
- XRから作れるのはapproval **intent**まで。物理実験の最終承認は、対象、量、工程、設備、停止条件、費用、候補digestを固定した信頼済み確認画面で別に行う。

## 3. システム構成

| 層 | 責任 | 正本性 |
| --- | --- | --- |
| Material Invention Core | 物質、候補graph、工程、安全判定、証拠、版、owner分離 | 正本 |
| Spatial Projection | Core snapshotを`SpatialSceneManifest`へ決定的に変換し、source digestを固定 | 派生物 |
| XR Interaction Runtime | 選択、比較、filter、annotation、presence、2D fallback | 正本ではない |
| Device Adapter | pose、hand/controller、camera、marker、display能力の差を吸収 | 一時入力 |
| Zema | scene作成、比較依頼、追加確認、approval intent、結果の仕事管理 | 仕事の正本 |
| Sky | simulation、材料DB、XR renderer、marker、lab adapterの発見と接続 | 接続catalog |
| Evidence Boundary | annotation／観察を候補へ取り込み、署名・hash・owner・時刻を検証 | gate |

依存方向は`Core snapshot → Spatial Projection → XR Runtime → Device Adapter`とする。XR runtimeがCore DB、Wallet、外部ラボ、装置へ直接書き込む経路を作らない。annotationは専用境界で検査した後に追記し、候補の既存証拠を書き換えない。

## 4. XR共通データ契約

正本のscene入力は[`contracts/material-invention-xr.json`](../contracts/material-invention-xr.json)とする。

| entity | 必須内容 | 不変条件 |
| --- | --- | --- |
| `SpatialSceneManifest` | scene ID、source graph digest、候補digest、revision、生成器版、安全snapshot、能力 | Core snapshotから再生成可能 |
| `CoordinateFrame` | frame ID、種類、単位、親frame、anchor参照、tracking状態 | 長さはmetre、右手座標系。変換元を保持 |
| `SpatialObjectBinding` | object ID、Core entity種別／ID、frame、transform、geometry hash、semantic role | 見た目だけのobjectを物質や候補と誤認させない |
| `VisualizationAssumption` | 表示倍率、補間、色、簡略化、予測範囲 | 物理事実と表示上の仮定を分離 |
| `SafetyOverlay` | Core安全状態、blocker、review要求、source digest | 常に最前面。利用者設定で非表示にできない |
| `SpatialAnnotation` | owner、scene、対象binding、pose、内容種別、content hash、時刻 | 実験receiptではない |
| `ObservationReceipt` | annotation集合、取得端末、source scene、raw hash、同意、署名検証状態 | 検証済み測定へ自動昇格しない |
| `PresenceSession` | project、scene、参加者、role、期限、共有範囲 | 候補所有権・承認権を付与しない |

sceneは`sourceGraphDigest`、`candidateDigest`、物質lot、工程版、安全判定を固定する。いずれかがCoreの現在値と違えば`STALE`とし、比較と閲覧だけを許可してapproval intentを作らない。

## 5. 座標、単位、見た目の意味

- 空間長はmetre、角度はradian、transformは4×4 column-major matrix、右手座標系に統一する。端末固有座標はadapterで変換する。
- 分子、粒子、繊維、層構造等の表示倍率をsceneへ明記する。異なるscaleのobjectを同じ実寸空間に見せる場合はscale breakを表示する。
- 色はmaterial identity、安全状態、証拠種別の三用途を同時に兼用しない。色覚だけに依存せず、形、pattern、文字を併用する。
- simulation mesh、推定surface、未計算補間、実測点を別primitive／legendで表す。滑らかなsurfaceを実測済みと誤認させない。
- occlusion、depth、marker pose、hand trackingの誤差を保持し、精度不明のposeから寸法、設備適合、接触、安全距離を確定しない。

## 6. 操作と権限

| 操作 | XRで可能 | Coreへの作用 |
| --- | --- | --- |
| sceneの閲覧、候補filter、比較 | 可 | なし |
| 表示倍率、layer、配置変更 | 可 | 個人表示設定だけ |
| annotation／観察の作成 | 可 | 検査後に追記候補 |
| 新しい配合・工程案の提案 | 可 | `HYPOTHESIS`としてZema仕事へ戻す |
| simulation依頼 | intentのみ | 費用・Provider・入力digest確認後に別実行 |
| 物理実験承認 | 最終承認不可 | 信頼済み確認画面へのintent作成だけ |
| 装置操作、robot制御 | 不可 | capabilityを持たない |
| 実験成功、安全、特許性の確定 | 不可 | 検証済み外部証拠が必要 |

共同sessionでは`viewer`、`annotator`、`facilitator`を分ける。facilitatorもCoreのowner、reviewer、experiment approverには自動昇格しない。remote pointer、avatar、voice、room recordingは発明データと別の同意・保存期間を持つ。

## 7. Safety UX

- `BLOCKED`は赤色だけでなく、固定pattern、文字、音／hapticの選択可能な警告で示す。対象objectを隠しても視野固定のstatus panelを残す。
- `REVIEW_REQUIRED`と`SANDBOX_ONLY`を明確に分ける。XR内で安全に見えることを物理安全と表現しない。
- sceneが古い、tracking喪失、marker不一致、Core照合不能、offlineで必要な安全snapshotがない場合は`VIEW_ONLY`へ落とす。
- AR利用中も周囲確認、guardian／boundary、休憩、座位mode、字幕、片手操作、motion軽減を提供する。これらは実験用PPEや施設安全の代替ではない。
- 危険物候補、設備近傍、移動中の利用ではqualified reviewerと施設policyを別gateにし、consumer headsetだけで物理作業を許可しない。

## 8. Privacy、IP、共同開発

- raw camera、room mesh、eye／hand tracking、voice、身体寸法、正確な位置は既定で保存・送信しない。
- scene共有はproject、候補、layer、annotation種別、相手、目的、期限を選択する。秘密配合を含むsceneのpublic linkを既定生成しない。
- rendererや共同session Providerへは必要最小限の派生sceneだけを送り、material名をproject-local aliasへ置換できるようにする。
- exportはsource digest、契約版、scene generator版、共有範囲、透かし、失効状態をmanifestへ含める。screenshotや録画は証拠の正本ではない。
- offline sceneは暗号化し、端末紛失時のremote secret失効とproject削除をCoreのbackup／restore方針へ従わせる。

## 9. 性能とfallback

- scene生成は同じCore snapshotとgenerator版から同じbinding IDとdigestを作る。deviceごとのLOD差でCore entity bindingを変えない。
- frame rate低下時は装飾、particle、shadow、remote avatarから落とし、安全overlay、文字、選択対象、退出操作を残す。
- headset非対応、権限拒否、cameraなし、trackingなしでも、2D graph／timeline／evidence表で同じ候補と警告を確認できる。
- network断中は検証済みsnapshotの閲覧とlocal annotation queueだけを許可する。外部作用、共同承認、実験状態の確定は再接続後に照合する。

## 10. 実装順

### XR01 — 契約と決定的projection

`SpatialSceneManifest`、安全policy、合成fixture、Core graphからsceneへのpure projection、digest、stale判定を実装する。2D JSON inspectorで先に受入し、headsetを必要条件にしない。

### XR02 — View-only VR prototype

Matter Space、Process Tunnel、Evidence Layers、Ghost Compareを一つの候補fixtureで表示する。閲覧、filter、比較だけを許可し、Core書込み、camera、共同session、物理承認を持たせない。

### XR03 — Annotationと2D fallback

文字／音声／空間pinをproject-local annotationとして保存し、同一sceneを2Dでも編集・確認できるようにする。raw contentの外部送信は別承認にする。

### XR04 — AR binding

合成markerと非危険fixtureでmaterial lot、candidate、process versionを照合し、tracking喪失、marker差替え、stale scene、別projectをfail closedで拒否する。実設備制御は接続しない。

### XR05 — Collaboration／simulation／lab独立受入

共同session、simulation Provider、外部ラボ、測定receiptをそれぞれ独立gateで受け入れる。XR成功をsimulation精度、ラボ資格、装置安全、材料性能の代用にしない。

## 11. 合格条件

1. 同じCore snapshotとgenerator版から同じscene digest、binding ID、object関係が生成される。
2. 物質lot、候補digest、工程版、安全状態の変更で旧sceneが`STALE`になる。
3. Core entityと結び付かないobjectは装飾として区別され、物質／候補／証拠として選択できない。
4. `BLOCKED`／`REVIEW_REQUIRED`／`SANDBOX_ONLY`と証拠種別が全表示modeで保持される。
5. tracking喪失、marker不一致、offline安全snapshot欠落、scene改変で`VIEW_ONLY`へ落ちる。
6. XR runtimeに装置制御、Wallet直接操作、物理実験最終承認、Core DB直接書込みのcapabilityがない。
7. raw camera、room mesh、eye／hand、voiceが同意なしに保存・外部送信されない。
8. 2D fallbackで候補、工程、安全、証拠、annotation、退出を完了できる。
9. 片手、座位、字幕、色覚非依存、motion軽減の受入を行う。
10. headset／emulator／fixtureの成功を、実物質、実設備、実験安全、特許性、量産性の合格として表示しない。
