# Mini 空間操作のローカル開発

**実装範囲は、合成rayの幾何解決と、同じページ/Node内の下書きアプリの移動・読戻し。実手sensor、光学、外部app、Rockstarアカウント、実機Miniは未接続。**

## できること

- 右手系mのrayと表示面を交差させ、UVへ変換する。
- 入力期限100ms、boot/calibration/place epoch、sequence、指定範囲、遮蔽、入力誤差、端部を検査する。
- 準備した対象とアプリrevision、場面、明示承認、期限を照合して一件だけ動かす。
- 結果を実際のlocal draftから読戻す。同じaction IDの実行結果は再読し、再操作しない。
- ブラウザでは既存 `lib/workflow.ts` の状態遷移を使い、local previewの仕事をreviewへ進める。本人検収/外部Tool/物理合格とは別。
- Nodeでは既存private UID journalを再利用する。browser/MCPで実行したと偽ってworkflow transportを記録せず、jobはactiveに保持しlocalStagesを別記録する。

## 起動

repository rootから。ブラウザ用bundleは既存esbuildで作る。

```sh
node systems/rock-star-os/targets/avocado-mini/spatial/build-lab.mjs /private/tmp/mini-spatial-lab
node systems/rock-star-os/targets/avocado-mini/spatial/serve-lab.mjs /private/tmp/mini-spatial-lab
```

表示された127.0.0.1のURLを開く。ポートは起動ごとに変わる。公開domainへの配備は禁止ではなく、**このLabは本人用localhostに限定する既存方針**に従い配備対象へ含めない。camera/録音/外部送信は行わない。再読込でブラウザ内の下書きと仕事は消える。

枠内をクリックして移動先を準備し、10秒以内に「移動を確定」。移動結果はlocal appで読戻される。「場所を切り替える」は旧candidateを失効。「障害物」は合成AABBで、実空間を測った形状ではない。「合成校正を更新」は実機の校正ではない。

Nodeで明示的なlocal draft移動を行う場合:

```sh
node --experimental-strip-types systems/rock-star-os/targets/avocado-mini/spatial/node-preview.mjs --state-dir NEW_PRIVATE_DIRECTORY --accept-local-draft --u 0.68 --v 0.42
node --experimental-strip-types systems/rock-star-os/targets/avocado-mini/spatial/node-preview.mjs --state-dir SAME_PRIVATE_DIRECTORY --read-id SAVED_ACTION_UUID
```

private directoryは0700、journalは0600。既存の `openNodeExecutorJournal` のUID、排他lock、atomic claim/revision、fsync/renameを使用する。古いlockを自動削除しない。raw input/結果を公開/Gitへ入れない。実sensorから受けたと主張できないよう、この版はsource `synthetic-pointer` だけを受ける。

## 目的と境界

ROCKは幾何・候補・承認・local adapter・既存workflowへの接続を担当する。入力からowner/grantを取り込まずhost closureが固定する。これはdeveloper sessionで、正式な本人認証ではない。料金0のlocal操作以外は公開していない。

保存はページ内メモリまたは既存のprivate journal。外部顧客台帳を増設しない。読み戻し不一致やdispatch後の失敗はUNKNOWNとして保存し、同じactionを自動反復しない。journal失敗後は保存済み状態を読み、アプリ操作が戻ったと仮定しない。

実sensor/driver、実optics、native compositor、対応外部app adapterは未実装。input TTL、誤差、matrix検査はsoftware条件であり物理保証ではない。host callbackの隔離や強制timeout、実機stop latency、悪意ある同一owner processへのhard isolationもこの版の合格範囲外。

合格条件はまずlocal appの実変更/読戻しと既存状態遷移。物理受入はSC01〜10/OI/MP/ASを同一個体で実施する。unit/自動回帰を実施する場合の新しい試験は別途必要で、今回の成果に含めない。


## Mini分散光学・実入力adapterの更新（2026-10-23・MAT15／OS10／WEB04）

[空間設計正本](../../../../../docs/avocado-mini-r5/spatial-computer-use-design.md)26〜28章を追加。3×3mサービス範囲は固定し4×4m設置も比較。仮1.2m角開口52台で24,336有限姿勢の必要条件は未達0だが、巨大・未実測・干渉未評価なので製品採用なし。連続全範囲/任意位置の空中表示は未解決。sensor-camera.mjsは既存smis画素契約と実カメラAPIを接続、実機未受入。display-coordinator.mjsはhost登録/校正/測定済み輝度/快適上限/health/frame承認とblackout要求を実装し、実表示adapter/通信/独立遮断は未接続。回路分割JSONとKiCad面積図を追加したが新しい配線済みmainboardではない。既存料金・本人/job経路を維持。次は設置制約と連続余裕付き探索、実光学/カメラ、native driverとengine選定、完全回路/PCB。実機/公開/購入なし。unit/full suite未実行。

### v0.3 integration boundaries

- sensor-camera.mjs: real camera API adapter, camera approval/stop/visibility, shared smis fingerprint; raw images stay local. Not depth/hand rays, biometrics or Mini physical acceptance.
- display-coordinator.mjs: host-only registered profiles; measured luminance and glare approval, rigid transform, surface/UV extent, 200ms local health/frame leases; authorization binds content hash. Host must call tick and supply independent physical cutoff. No built-in network or optical driver. Expired/unhealthy nodes require remove/re-register. software-presented never means optically visible.
- hardware/spatial-mainboard-plan.json and generate_spatial_floorplan.py: partition and editable ECAD area study only. Existing LED bench remains unchanged; no new routed mainboard or optical power circuit.

## v0.4 source pixels and native camera observer

- source-preview.mjs renders the same local draft to a normal-monitor source raster; no calibrated warp, aerial output or volumetric depth. Build command unchanged.
- Linux `stereo_marker_observer.py`: explicit capture of two by-id V4L2 devices using measured calibration/OpenCV4.13, ArUco corners and triangulation. This is marker observation, not markerless hand tracking. No raw frame storage/upload. Actual capture, dependencies and error/sync acceptance have NOT run.
- `stereo-observer-host.mjs --allow-local-capture CALIBRATION_JSON EXTRINSIC_JSON`: Linux-only parent starts the fixed source for max100 frames/30sec. Owner-controlled calibration and extrinsic files; extrinsic contains calibrationId, placeEpoch, leftCameraToPlace rigid4x4. The checked-in template has nulls and MUST NOT be treated as measured calibration. No service/automatic capture is installed.
- `stereo-observation.mjs` binds calibration hash, monotonic reception time, boot/sequence/place and converts CV coordinates via the exact extrinsic. Exposure time, independent position error and action eligibility remain unknown/false. OS ray/Tool execution is deliberately unconnected until those acceptance requirements are met.
- Detailed output path and limitations: design chapters29–34. Final optical engine, circuit and routed mainboard remain pending. Existing LED carrier is unchanged and cannot power an optical engine.

## D405 selected E0 source

`d405-observer-host.mjs --allow-local-capture DEVICE_PROFILE_JSON EXTRINSIC_JSON` starts the fixed Linux d405_depth_observer.py for up to100 frames/30sec. Requires the selected pyrealsense2 2.56.5 API profile on /usr/bin/python3 and received device serial. Profile template contains nulls and cannot run as calibration. Extrinsic JSON binds calibrationId/placeEpoch/cameraToPlace. No auto-service/capture, credentials or charges. SDK frame time/domain and host receipt time are separate. Sample pixels produce depth points only, not hand/tap recognition. Error/time mapping are unqualified so action eligibility stays false. Physical camera/SDK execution was not performed.

Selected E0 optics/source: ASKA3D-200NT + Waveshare5.5inch HDMI AMOLED SKU16103; E1 light-field candidate: Looking Glass Go with an unqualified enlarged LeAIRR. These do not constitute a few-unit whole-room product. The cell-power coupon source has routing but no ERC/DRC/DFM acceptance. See design35–39 and selected-cell.json.

D405の明示起動例（Linux・部品/校正/SDK準備後のみ）:

```sh
node --experimental-strip-types systems/rock-star-os/targets/avocado-mini/spatial/d405-observer-host.mjs --allow-local-capture /private/path/device-profile.json /private/path/extrinsic.json
```

新しい評価回路は[用途と未達](../hardware/cell-power/README.md)を参照。既存の光学enableや最終mainboardを置き換えません。
