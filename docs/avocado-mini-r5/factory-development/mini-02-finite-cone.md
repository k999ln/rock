# MINI-02 有限出射角・校正の検査

状態: host研究用の検査を実装し、独立検収の数値反例R1を修正したattempt 2。局所試験済みで、独立再検収・この新4ファイルのGit保存/main統合は次の担当へ渡す。実光学、低眩しさ、実校正、独立停止、製造、dispatchの受入はすべてfalse。

前段の同時光線割当は [PR #191](https://github.com/k999ln/rock/pull/191) でmain `7e290e01255c4b3ca1d62ba164bc7eec4b64dc9f` に統合済み。同じSHAのCI 6/6成功を確認してから本実装に着手した。verification attempt 1は滞留後cancelled、attempt 2で成功。原因は未確定で、再試行の成功を原因修正とは記録しない。

## 目的・責任・維持する要求

- ROCK: 既存joint solverを変更せず、供給された一つの同時割当が有限出射角の必要条件を満たすか検査する。EXTERNAL/JOINT: 実部品の3D校正・光量・精度・停止・同じ実空間の受入。OWNER: 目的、設置、実施条件。
- 像の場所に板・膜を追加しない。`imageLocationPassiveSurfaces=0`を保持する。
- 少ない表示部を目標として維持し、モデル内のdevice/pose/exit/source数と実設置数を区別する。fixtureの2基/6基を製品採用や最小数の証明にしない。
- 上下、両眼、world-fixed targetを含む**宣言済み需要の全件**を検査する。要求範囲や分母を黙って減らさない。旧35,721組×18 pupil rays、6面80m²、guard 0/10mmの未達0/708は不変。本adapterの有限fixtureを連続全範囲の合格へ換算しない。
- まぶしくしない条件を維持する。sample slotsは光量ではない。角度合格から低眩しさ/眼安全を推定しない。

## 入力と利用

`mini-02-finite-cone.mjs` は `createFiniteConeFixture()` と `inspectFiniteCone(serializedJSONString)` をexportする。hardware、network、driver、runtime権限、永続化を持たない。

```sh
node --input-type=module - <<'JS'
import { createFiniteConeFixture, inspectFiniteCone } from './docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs';
const result = inspectFiniteCone(JSON.stringify(createFiniteConeFixture()));
console.log(result.status, result.declaredDemandCount, result.acceptance);
JS
```

envelopeはschema `rockstaros.mini-finite-cone-study/1`、`studyOnly:true`、`coordinateFrame:"place-world-metres/1"`、`clockDomain:"synthetic-monotonic-ms/1"`、既存形式そのままの`jointRequest`、`witness`、`calibrationModels`を持つ。

`witness`は既存solverの正規化入力`inputSha256`、`selectedPoses`、全需要への`assignment`。solverの最初の解との一致を合格条件にしない。別の割当を渡してよいが、その姿勢・出口・光源・幾何・容量を改めて検査する。既存solverの探索が未完でも完全なwitnessを検査できる。その際も探索完了とは報告しない。

各校正modelの厳密なfield:

| fields | 意味 |
| --- | --- |
| deviceId / poseId / exitId / sourceId | 同じ姿勢・開口・共有光源への対応 |
| calibrationId / calibrationSha256 | poseと一致するラベル、synthetic校正記録の参照digest。後者は64桁hexの形だけを検査し、実レコードや署名を取得/検証しない |
| poseBindingSha256 | deviceId、poseId、sceneSha256、calibrationId、ID順の全exitsの正規化JSON SHA-256。開口形状・guard・source/capacityが変われば古い校正を失効させる |
| profileRevision / profileSha256 / sceneSha256 | 同じplace/sceneへのbinding |
| coordinateFrame / clockDomain / modelKind | world metres、同一synthetic clock、`synthetic-circular-cone`のみ |
| axisWorld / halfAngleDeg / angularErrorDeg | world座標の単位軸、半角0〜90度、総角度誤差の上限0〜90度 |
| observedAtMs / validUntilMs | frame時刻に対して未来でなく、maxAge以内かつ期限内であること |

poseBindingはobject keyを辞書順、配列は宣言順（exitsだけID順）に正規化する。input/result digestもobject keyを辞書順にする。model/witness/既存joint内のID集合の並べ替えは結果digestに影響しない。SHAは整合性の道具であり、測定・署名者・権限の証明ではない。

`angularErrorDeg`は軸校正と眼/出口/座標の誤差による方向変化を含む**総上限のsynthetic宣言**。位置誤差から角度誤差への実換算や実測誤差の保証は未実装。不明ならnullで利用不可とする。Goの水平cone値を3D円錐へ変換する入口はない。

## 検査・状態・失敗

1. JSON stringのみ、262,144 bytes/20,000 nodes/18 levels、witness最大128需要/6装置、model最大96。未知field、非有限値、重複model、壊れた構造は例外で拒否する。既存joint入力自身の制限も維持する。
2. pin済みjoint/geometryと旧studyへの依存hashを照合。place/scene binding、stop/settled/time、未知容量などは既存jointの保守的判定を継承する。古いprofile/sceneは`unavailable`。未使用のposeに未知値があっても旧joint同様に利用不可となる。
3. witnessの全装置につき一姿勢、全需要につき一割当、実在する出口/光源、同じworld ray、開口guard、出口容量と装置を跨ぐ共有光源容量を検査する。solverの返したstatusだけを信用しない。
4. 全使用開口にmodelがあることを確認し、供給された全modelを検査してから角度を計算する。欠落・不一致・未知・古い/未来/期限切れ・非単位軸は`unavailable`、角度検査件数0。未使用開口のmodelは省略できるが、供給した場合は同じbinding/時刻/角度宣言の検査を通す。未使用modelに対する光線角度の合格は報告しない。
5. 既存geometryの境界点から瞳へ向かう単位ベクトルを作る。eye→targetの逆方向である。正規化した軸との角度を`atan2(norm(cross),dot)`で計算し、総誤差を加減した区間を[0,180]度へ制限する。内積が±1へ丸まっても、外積に残る小角の垂直成分を使う。
6. 区間全体が半角より厳密に内側なら`inside`、外側なら`outside`。境界に接する/またぐ場合は`boundary_unknown`。境界余裕1e-7度に、演算の丸め余裕`64 × Number.EPSILON × 180/π`度（約8.14e-13度）を加える。単位軸は1e-9のnorm許容後に正規化し、成分積は[-1,1]へ収まる。正規化/外積/内積/角度換算の少数演算に対して十分広い64 epsilon radの余裕を未知帯側へ置き、coneを広げて合格させない。追加余裕は結果の`angleRoundoffGuardDeg`にも明示する。実測誤差はこれで代用しない。

| 全体status | 次の動作 |
| --- | --- |
| finite_cone_witness_passed | このsynthetic witnessの必要条件のみ通過。実表示の承認なし |
| reallocation_required | 一つ以上の光線が確実に外側。別の姿勢/割当候補を作り、完全なwitnessで再検査する。全解不成立とは言わない |
| unknown | 確実な外側はないが角度境界に誤差がかかる。より確かな校正/余裕を用意して再検査する |
| unavailable | binding/容量/時刻/校正等を修復し、現在の全入力で再検査する。古い成功の再利用不可 |

outsideとboundaryが混在すれば`reallocation_required`とし、両方の光線診断を残す。返す値はinput/result digest、要求件数・検査件数、全件検査flag、witness、各rayの境界点/方向/角度区間、upstream探索状態、部数、falseの受入欄。結果を書き込むAPIや光出力機能はない。

## 合格証拠・保存・次

```sh
node --test tests/avocado-mini-finite-cone.test.mjs tests/avocado-mini-joint-allocation.test.mjs tests/avocado-mini-optical-study.test.mjs tests/avocado-mini-place-profile.test.mjs
./node_modules/.bin/oxlint docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs tests/avocado-mini-finite-cone.test.mjs
```

新規23/23、関連合計56/56、lint成功。六方向、両眼×上下、方向反転、境界誤差、需要欠落、姿勢混在、共有容量超過、校正の時刻/座標/形状binding、最初の解の不合格から代替解への復旧、探索上限後のwitness、未使用modelの未知校正、順序非依存、入力制限、旧12hash保持を検査した。要約と再現情報は`docs/evidence/development-execution/mini-02-finite-cone.json`。

attempt 1の独立検収 `mini-02-finite-cone-review.json` は上書きせず保持する。R1では軸傾き5e-7度/半角2e-7度/誤差0が`acos`で0度になり誤合格した。修正前に同じ120条件の21判定差・9件の明確outside→insideを再現した。attempt 2では独立scalar oracleと同じ120条件で判定差0、明確outside→inside 0。さらに近平行/反平行と軸・光線長のスケール135条件、非座標軸の回転3条件、誤差/比較端点20条件を追加し、正しいinsideと修復後の成功も維持する。修正済みの自己試験を独立検収の合格とは記録しない。

統合担当はこの新4の独立検収を別担当へ渡す。Git担当は固定候補の全verify、project/status/README、workstream/設計入口の同期と保存を担当する。本laneで共有文書や旧sourceを変更しない。新4のmain統合・CIや独立検収を本記録だけで完了扱いにしない。

次の研究候補は有限coneを辺の適格性へ組み込んだ再割当探索と、総角度誤差の根拠を持つ校正fixture。現在の検査は任意の内側移動開口、trajectory/latency、遮蔽、放射測定、wave optics、熱、実視認/低眩しさの検証を持たない。これらの不明を無制限coneや製造合格へ置換しない。
