# Mini camera gesture preview

MAT15 / M1、ROCKのR5単体入力prototype。カメラで手・指を追い、pinchで選択、保持中に表示を移動/回転、releaseで表示操作を終え、palm stopでpending操作を取り消す。本人の2026-10-25追加要望を受けた最初のslice。Eveへ「よい/違う」を明示的に伝える入力、全身動作認識、実Miniのcamera選定/校正は後続。

## 起動

モデル準備用installerは、UID、`O_NOFOLLOW`、同一filesystem内のhardlinkを使えるmacOS/Linux向けです。Windowsと未検証のACL/filesystem構成は非対応です。信頼したcheckoutと本人管理の保存先を使い、同UIDや特権者が並行して親directory/codeを交換する攻撃への完全な防御は保証しません。

保存先・既存file・旧`.download`残骸にsymlink/hardlink/FIFO等があればfetch前に拒否します。新しいprivate一時領域でsize/hashを検証してから、既存対象を上書きしない方式で採用します。正常な既存modelは再fetchせず検証し、不整合な対象や古い残骸は自動削除しません。停止理由とpathを本人が確認して復旧してください。

repository rootで以下を実行し、localhostの画面を開く。

```sh
npm ci --ignore-scripts --prefix systems/rock-star-os/targets/avocado-mini/gesture/runtime
node systems/rock-star-os/targets/avocado-mini/gesture/install-model.mjs
python3 systems/rock-star-os/targets/avocado-mini/gesture/serve.py
```

`http://127.0.0.1:8768/demo.html` の「合成動作を試す」はcameraを使わない。本人が「カメラを開始」を押した時だけモデルを初期化し、browserのcamera許可を要求する。停止、tab非表示、画面離脱でtrackを閉じworkerを破棄する。SDK/modelがない場合は開始できない旨を表示する。外部CDNへfallbackしない。配備・LAN公開・実機のdevice権限付与は含まない。

SDKは `@mediapipe/tasks-vision@1.1.1`（Apache-2.0）を専用lockfileで固定。モデルは[公式HandLandmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)のfloat16/version 1をdownload時にSHA-256照合し、Git管理外へ保存する。配布前のmodel card/配布条件とMini端末性能の受入は別に確認する。モデルの大きさやSDK導入だけを実機性能の証拠にしない。

## 入出力と状態

`tracking-worker.js` は端末内の別workerで `detectForVideo` を実行する。SDKの手検出/presence/追跡しきい値を0.7として試験する。出力は最大2handの21関節座標と左右labelのみ。左右labelのscoreはtracking精度や本人性の証拠ではない。[Web APIの公式契約](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)。

`GestureEngine` は最大1handの連続frameを受け、3frameの安定確認とpinchのhysteresisで候補を作る。手が消える、2handが混ざる、左右labelや位置が急変する、frame順序逆転・200ms超gap・画面外座標の場合はpendingをcancelする。one-camera画像座標から実寸や全空間座標を推定したことにはしない。しきい値は初期fixture値であり、誤操作率/アクセシビリティ測定後に版付きで更新する。

出力は `mini-gesture-preview/1`、sessionId/sceneRevision/sequenceに束縛される。kindはselect/transform/stop、phaseはBEGIN/UPDATE/END/CANCEL、作用はVIEW_ONLY。`calibrated/physicalExecutionAllowed/approvalGranted/preferenceInferred` は常にfalse。古いsceneのpendingを新sceneへ持ち越さない。`END` はローカル表示の操作終了で、CoreへのCOMMITではない。

既存 `contracts/avocado-mini-spatial-interaction.json` は校正済み四方向rig等を必要とする。この一眼prototypeで架空の四方向観測やsignatureを生成しない。将来の接続は、校正/owner/project/scene/対象bindingと既存Core条件を満たすadapterを別途受け入れる。旧大型Full-scaleやE3の別Hub必須をR5へ戻さない。Eveの好み予測、明示的な本人feedback、Smithの操作許可は別情報として扱い、観測した仕草だけで内心・同意を断定しない。

`CameraSession` はidle→loading→permission→running→idle。モデル準備15秒、permission10秒、video再生3秒を上限に待ち、遅れて許可が返ったstreamもstopする。最大15fps・同時1frame、1frameのcapture/推論待ちは1.5秒、1session最大4500frameまたは5分。有限上限後は明示再開を必要とする。frameごとのtimeout・失敗はworker/trackを閉じてpendingを取り消す。未解放bitmapはcloseし、転送済bitmapはworkerがfinallyでcloseする。

## 保存・責任・復旧

raw映像、room mesh、手の履歴、顔、生体本人情報を保存/外部送信しない。SDK/modelはlocal assetから読み、demoのCSPは外部接続を許さない。gesture候補も初期版では保存しない。表示を閉じると失う。好み学習や永続保存を追加する場合は対象と本人操作を別契約にする。capture失敗は停止を表示し、本人が準備/権限を確認して再開する。任意shell、Wallet、物理装置、共有、出願、外部Tool実行へ接続しない。

ROCKはcamera lifecycle/候補/境界試験、JOINTはMini camera・照明・遮蔽・上下/全域・遅延・電力/熱・誤操作/使いやすさの同一個体測定、EXTERNALは部品/driver/model条件、OWNERは対象用途/反応入力/保存範囲を決める。Mini単体、板・膜なし、少ない表示部、上下を含む全範囲、まぶしくしない4条件を維持する。browserの矩形プレビューは開発fixtureで、製品表示方式の変更ではない。

## 検証

```sh
node --test tests/avocado-mini-gesture.test.mjs
# serve.pyを起動し、PlaywrightとChromeを用意した試験環境で実行
node systems/rock-star-os/targets/avocado-mini/gesture/browser-smoke.cjs
```

`browser-smoke.cjs` はgetUserMediaを合成canvasへ差し替え、物理cameraを使わず実SDK/modelの推論・停止・外部通信0をassertする。Playwrightを別pathに導入している場合は`PLAYWRIGHT_MODULE`でmodule pathを指定できる。

合成landmark、停止race、遅延応答、stale scene、追跡喪失、有限上限を検査する。browserの合成canvas streamで実SDK/modelのロードと推論を別確認し、合成デモ/モデル実行/実camera/精密3D/全域/実機を別々に記録する。最初の物理試験は照明・距離・手の大きさ・左右・遮蔽・複数人・tab停止/permission拒否を揃え、false activation、誤取消、p50/p95遅延、CPU/メモリ/電池を計測する。未測定を成功にしない。
