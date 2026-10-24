# MINI-02 有限出射角を満たす同時割当探索

状態: host研究用の実装と局所検証が完了。独立検収・Git保存・main統合は未完了。基準はmain起点 `ccec6d43341dd8f12326766311553a59bc301fae`。実光学・低眩しさ・安全・実校正・dispatch・製造の受入はすべてfalse。

## 目的と責任

既存の幾何solverが最初に返したwitnessが有限cone外でも、同じ姿勢の別出口や別の同時割当を探索する。ROCKがデータの検証、既存最大流/姿勢探索の再利用、有限モデルの必要条件を担当する。EXTERNAL/JOINTが実部品の校正・光量・停止・同じ装置の物理受入、OWNERが目的・設置・実施条件を担当する。

板・膜を像位置に追加しない。少ない表示部を目標とし、device/pose/exit/sourceと実設置数を分ける。上下・両瞳を含む宣言済みDを全件保持し、少数の成功光線へ分母を縮めない。まぶしくしない要求を維持する。整数sample slotsや角度合格は実光量・低眩しさの証拠ではない。

## 実装と互換性

- `mini-02-joint-allocation.mjs`: 既存parser、前提検査、幾何、姿勢DFS、残余辺を持つ最大流を共有する。新しい辺マスクは幾何的に存在するdemand→exit辺だけを制限する。装置・姿勢・需要・出口/共有光源の容量を変更しない。
- `mini-02-finite-cone.mjs`: 校正、witness、安定な角度計算をprivate helperへ分け、既存検査器と新探索で共用する。新探索の最終witnessは全需要・一装置一姿勢・幾何・容量・角度をもう一度検査する。最初の不合格witnessを理由にposeやexit全体を削除しない。
- 旧`runJointAllocation`の無mask入力は全出力、digest、順序を保持する。旧`inspectFiniteCone`は挙動を保持し、明示的に更新するjoint source pinと、それに依存するresult digestだけが変わる。

Rootは再利用拡張のためjoint source、cone source、cone testの3既存パスを明示的に変更許可した。旧12パスのうちjoint source以外の11パスはbyte不変。旧レビュー/証拠は上書きしない。従来の12hash検査は「11件不変＋許可されたjoint進化を新candidate hashで固定」という名前付き検査へ進めた。これは独立検収の自己承認ではない。mainの`void test`形式も維持する。

## APIと入力

すべてserialized JSON stringだけを受ける同期host関数であり、callback、式、module path、shell、model由来の実行権限を受けない。hardware、network、永続化、光出力の機能はない。

### inspectJointCandidates(serializedJointRequest)

既存joint形式の検査と幾何準備を行い、探索せずに`canonicalJointRequest`、`jointInputSha256`、`candidateEdgesSha256`、`candidateEdges`、部数・前提状態を返す。未知の前提は`unsupported`でcandidate tableはnull。`available`はhost幾何準備ができたという意味。

device/pose/exit/demandのIDを既存の辞書順で正規化し、その入れ子順に候補辺を番号付けする。sourceはexitに固定。各辺はindex、deviceId、poseId、exitId、demandId、sourceId、boundaryPointMを持つ。candidate digestは元joint input digest、geometry source digest、候補配列全体を含む。guard外など幾何的に届かない辺は候補に存在しない。

### runJointAllocationWithEdgeMask(serializedEnvelope)

厳密なfieldは`schema:"rockstaros.mini-joint-edge-mask/1"`、`studyOnly:true`、`jointRequest`、`jointInputSha256`、`candidateEdgesSha256`、`allowedEdgeIndices`。元入力と候補を再生成してdigestを照合する。indexは実在する非負整数、重複不可。配列順を正規化してmask digestを計算する。入力を変更した場合は、その入力のcandidateとdigestを取り直す必要がある。

空maskは辺をすべて除く有効な制限で、需要は残る。不明前提の場合はnullのcandidate digestと空maskだけが成立し、探索せず`unsupported`となる。未知fieldや外来/範囲外index、古いbindingは例外で拒否する。入力fieldに`maskSha256`はなく、実際に適用する正規化maskから結果側で計算する。

結果schemaは`rockstaros.mini-joint-edge-mask-result/1`。元の`jointInputSha256`、candidate/mask/result digest、選択姿勢・割当・探索件数を返す。結果の`inputSha256`はmaskを含む依頼のdigestなので、witnessには元の`jointInputSha256`を使う。`scope`はhypothetical geometry edge restriction、`coneAcceptance:false`。任意のindex選択そのものを校正済みcone適格性とは扱わない。`individuallyReachableCount`等は従来の幾何だけの緩和診断であり、mask適用後の充足数は`bestAllocatedDemandCount`。

### runConeAwareSearch(serializedSearchEnvelope)

厳密なfieldは`schema:"rockstaros.mini-cone-aware-search/1"`、`studyOnly:true`、`coordinateFrame`、`clockDomain`、`jointRequest`、`calibrationModels`。座標・時計・modelは既存有限cone検査と同じworld metres、synthetic monotonic ms、synthetic circular cone契約。外部witnessや外部eligibilityは受けず、全候補辺の適格性を内部で計算する。

初期版は**宣言された全出口**の有効校正を要求する。未選択pose、容量0、幾何候補がない出口も含む。これは未使用modelの省略を許す既存witness検査より保守的な新探索の規則で、旧APIの規則は変えない。全modelのprofile/scene/pose形状/source/clock/time bindingと総角度誤差を検査する。synthetic digestは実測レコードや署名の検証ではない。

```sh
node --input-type=module - <<'JS'
import { createFiniteConeFixture, runConeAwareSearch } from './docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs';
const request = createFiniteConeFixture();
delete request.witness;
request.schema = 'rockstaros.mini-cone-aware-search/1';
const result = runConeAwareSearch(JSON.stringify(request));
console.log(result.status, result.declaredDemandCount, result.witness, result.acceptance);
JS
```

## 探索と状態

出口→瞳の方向を、R1修正済みの正規化`atan2(norm(cross),dot)`で検査する。総角度誤差と1e-7度＋64epsilon rad相当の数値余裕を保ち、`inside`辺だけを最大流へ渡す。全候補を分類してから一度だけpose探索を行い、別の無mask探索は挟まない。見つかったwitnessを共通検査で再検査し、矛盾時は`unavailable`。

| status | 意味と復旧 |
| --- | --- |
| finite_cone_allocation_found | 全宣言需要へ厳密inside辺だけの割当があり、再検査済み。未使用boundary辺は合格に含めない |
| unavailable | 校正/前提の未知・欠落・期限切れ・binding不一致等。現行入力を修復して再検査する |
| unknown / search_cutoff | 完全なwitnessを得ず探索上限に達した。上限内の不成立を全解不成立としない |
| unknown / angular_boundary_unresolved | inside辺だけでは不成立、境界誤差の候補辺が残る。境界辺が実際には不要でも初期版は保守的にunknownとする |
| finite_cone_allocation_impossible | 全前提が既知で境界辺がなく、全pose組を最大流で検査しても不成立。宣言した有限モデルだけの不成立証明 |

`bestAttempt`は部分割当を含む診断で、完全witnessではない。`witnessVerified`は完全witnessに対する再検査だけ。`poseSearchComplete`は全pose組の検査完了、`finiteModelInfeasibilityProven`は上記の限定不成立だけを示す。個々の全割当列挙や連続全領域の評価ではないため、`allAllocationsEvaluated/fullBaselineEvaluated/continuousDomainEvaluated`はfalse。

最大128需要×96出口instanceで候補辺12,288、装置6・各4pose、pose探索上限は既存1〜1,024。全pose組が4,096など上限を超える場合は、witnessなしの終了をunknownとする。一配置の増加流は最大128回。これは演算回数の有限境界で、実時間latency保証ではない。mask envelopeは262,144 bytes/32,768 nodes/18 levels、index最大12,288。nested jointは従来131,072 bytes/10,000 nodes/16 levelsを別に通す。search envelopeは従来coneと同じ262,144 bytes/20,000 nodes/18 levels。候補表全量をGit証拠へ保存しない。

## 検証・証拠・次

```sh
node --test tests/avocado-mini-cone-aware-search.test.mjs tests/avocado-mini-finite-cone.test.mjs tests/avocado-mini-joint-allocation.test.mjs tests/avocado-mini-optical-study.test.mjs tests/avocado-mini-place-profile.test.mjs
./node_modules/.bin/oxlint docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs docs/avocado-mini-r5/factory-development/mini-02-finite-cone.mjs tests/avocado-mini-finite-cone.test.mjs tests/avocado-mini-cone-aware-search.test.mjs
git diff --check
```

新規14件を含む70/70成功、lint・diff検査成功。独立なface/XY/scalar-angleと割当列挙を使う1,728条件で、found226/impossible1,156/unknown346、全1,728件のbestAttemptを検証。旧solverのsingle-pose432件とtwo-device432件は、隔離した固定main moduleで作った全出力stream hashと一致し、後者の既存98possible/334impossibleも維持。旧検査器の128条件はjoint source/result digestを除いて完全一致。既存23件とR1数値回帰も通過した。

固定baselineの35,721組×18瞳光線＝642,978光線/candidate、6面ideal未達0・10mm guard未達708も再現した。同一時刻の全sceneや連続全域の合格へ転用しない。要約・exact hash・負例/復旧・共有設計依頼は[証拠](../../evidence/development-execution/mini-02-cone-aware-search.json)に保存する。

Rootは別担当の独立検収へ渡し、Git担当が共有設計・project/status/README/AMC同期と固定候補全verifyを行う。次の研究候補は境界辺を含む楽観グラフの補助判定だが、現実の3D校正、総誤差根拠、同時ray throughput、trajectory/遮蔽/光量/熱、低眩しさ、独立光学停止の実証が別に必要。host探索を進めるための購入や実機操作は不要で、今回それらを実施した記録はない。
