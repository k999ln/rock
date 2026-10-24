# MINI-02 可動・切替出口の有限同時割当

2026-10-24。主担当はMaterial Invention / avocadoMiniのROCK。前段の[固定範囲比較](mini-02-candidate-assessment.md)はPR189でmain `7e36c8390f8321c87113b49a3069ab37ebd98e18`へ統合、同SHAの6チェック成功を直接読戻した。本稿はその後の新規host研究batchであり、独立検収・Git保存は別段階。

像位置に板・膜を置かない、少ない表示部、上下を含む要求範囲全体、まぶしくしない条件を維持する。出口数を筐体数と読み替えず、未成立の光学を採用しない。世界に固定した点に、必要な瞳光線を同時に割り当てられるかを扱う。

## 実装と使用

[mini-02-joint-allocation.mjs](mini-02-joint-allocation.mjs)の `runJointAllocation(JSON文字列)` は、同じframeの全demandをまとめて評価する純粋な計算入口。Nodeの標準ライブラリと既存geometryのみを使い、デバイス・ネットワーク・永続stateを操作しない。利用例：

```sh
node --input-type=module -e 'import {createJointFixture,runJointAllocation} from "./docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs"; console.log(JSON.stringify(runJointAllocation(JSON.stringify(createJointFixture())),null,2))'
node --test tests/avocado-mini-joint-allocation.test.mjs
node_modules/.bin/oxlint docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.mjs tests/avocado-mini-joint-allocation.test.mjs
```

fixtureは実機の仕様書ではない。上下2光線を1台の排他的な2姿勢へ割り当てる合成反例である。`stopConfirmed:true`、校正名、時刻、容量も合成宣言であり、実測receiptや通電許可にはならない。全結果でphysical/lowGlare/independentStop/manufactured/grantsAuthorityはfalse。

## 入力契約

入力schemaは `rockstaros.mini-joint-allocation-study/1`。`studyOnly:true` と `assumption:ideal_geometry_hypothetical_sample_slots` を必須とする。最大128KiB、深さ16、10,000値、128demand、6device、各4pose、各8exit、全pose合計96exit、16source。未知field・重複ID・非有限数・過大入力は拒否する。JS objectを直接受け取らず、getterやtoJSONを呼ばない。

- `profile` と `frame` のrevision/hashを一致させる。frameはscene hash、世界固定指定、有限demand全件、評価時刻・期限・観測の最大経過時間・停止確認宣言を持つ。同じtarget IDは全瞳・観察者で同じ世界座標でなければ拒否する。scene hashはpose側の補償参照とも一致させる。これらは計算入力の一貫性検査であり、真正な本人・issuer・校正の認証ではない。
- demandはID、viewer ID、target ID、眼座標、対象座標。座標は共通の4×4×3m箱内で、上下の点を含められる。眼と対象の同一点は拒否する。poseの選択は眼・対象・IDを変更しない。全scene面・連続瞳・実viewerを自動生成した扱いにはしない。
- deviceは排他的poseの集合。各poseは世界座標の境界faceとrect、guard、校正ラベル、scene参照、整定状態、観測/有効期限、角度モデルを持つ。内部空間の任意剛体変換・連続機構軌道は未対応。境界上の複数位置・開口を離散poseとして比較する。
- exitはsource IDと仮のsample slot容量を持ち、sourceにも全exitで共有する容量を持つ。整数0は供給不可、`null`は未知。個数を光束・解像度・実光学の同時光線容量へ換算しない。実部品の有限coneは未実装で、`ideal_unlimited`は前段の楽観比較だけを表す。角度不明をこの値で補完しない。
- `searchLimit` は1〜1024構成。入力配列はID順に正規化し、同じ入力は同じ選択・反例・digestへ収束する。shapeや検索予算の違いはinput digestに残る。

## 計算と状態

初めにgeometryと前段studyのsource SHA256、固定fixture hashを照合する。各pose/exitで眼→対象を延長した境界位置を既存 `createExitGeometry` へ問い合わせる。個々のdemandが異なるposeを自由に選んだ場合の到達件数を、同時判定とは別の緩和結果として返す。

実判定では1frameにつき各deviceから1poseだけを選択する。選択された出口について、demand→exit→shared sourceの整数最大流を解く。demandは1slot、exit/sourceは各宣言容量まで。逆向きの残余辺で割当を組み直すため、最初に見つけた出口へ固定するgreedy法で誤って不成立にはしない。共有sourceを出口ごとに複製しない。

| status | 意味 |
| --- | --- |
| `finite_joint_allocation_found` | 指定した有限demand全件に、仮定内の同時割当の証人がある |
| `finite_joint_allocation_impossible` | 指定した有限pose集合を全探索しても、仮定内で全demandを割り当てられない |
| `search_incomplete` | 予算内では証人がなく、未探索構成が残る。不可能の証明ではない |
| `unsupported` | 校正・角度・容量・時刻・整定・停止確認が未知、古い、未来、期限切れ等で評価不可 |

入力不正・profile/scene不一致・source改変は例外で拒否し、fallbackはしない。呼出元は前の入力/証拠を保持し、現在入力を利用不可として扱う。関数はstateを持たず、正しい入力へ戻せば同じdigestを再生成できる。

成功時はdeviceごとのposeと各demandのexit/source割当を返す。不成立/予算切れでは成功の `assignment` はnull。調べた範囲で最も多く割り当てた `bestAttempt` と未割当demand IDを反例として返す。これは実行命令ではない。早期成功時は全構成を調べていないため `searchComplete:false` になり得るが、返した証人自体は全demandを満たす。

筐体/設置像源/センサー/実測同時人数は未知のまま。モデル上のdevice数・source数・pose数・排他pose全体のexit延べ数、pose別の公称/guard後面積を別記する。排他poseの面積合計を同時に利用できる面積にしない。

## 同じDと分母を保つ回帰

有限scene APIの128demand上限は製品領域の縮小ではない。全結果に元の35,721組・18光線を記録し、`fullBaselineEvaluated:false` / `continuousDomainEvaluated:false`を付す。frameの部分集合を全域合格として表示できない。

別関数 `runFixedBaselineReduction()` は元の243眼×147対象×18瞳点をすべて再生成し、全面6出口を1poseへ縮退させて同じ最大流へ通す。各眼-対象組を別々に評価し、組をまたぐ同時性は主張しない。各構成は35,721組・642,978光線、縁なし未達0、10mm縁未達708を再現する。前段study全結果digest `b24881bbcd4262d1dd7b0f7a68de9735552268d12a707001b044fa0ee9f7689b`も照合する。

この回帰の18slot源は計算上の制約を緩めた仮定で、実在する「1sourceで全面80m²を駆動する機器」の採用ではない。両眼と上下を同じframeに入れた4demand試験も別に行う。

## 検証・限界・次の一件

13件の対象試験で、排他poseの和集合なら到達しても同時不可、独立deviceでの証人、両眼上下、shared source/exit容量、greedy失敗の残余再割当、guard、探索打切り、unknown/stale/late/停止未確認、入力拒否、順序/復旧を確認する。小型3demand問題の432容量組合せは、最大流を使わない独立総当たりoracleで最大割当数と可否を照合する。実装担当の自検証であり、独立検収担当の合格ではない。

次は境界開口poseから実source/relayの校正済み光線生成・有限角度・可動軌道・遅延へ接続する契約を具体化する。移動中のblank、独立停止/残光/読戻し、遮蔽、world固定誤差、実際の同時scene、放射/色/偏光/熱、低眩しさは未測定。未知を無制限へ変更したり、明るさを上げたり、上下/瞳/要求範囲を削って成立にしない。

ROCKはこの純粋な計算と反例、EXTERNALは実像源/relay/機構、JOINTはSC01/02/04/08、OWNERは用途/予算/快適上限を担当する。料金・本人・job・保存・一般公開保留を維持し、購入・実験・最終PCB・物理出力を行わない。

[新batch証拠](../../evidence/development-execution/mini-02-joint-allocation.json)にexact4pathと旧8hash不変、再現結果、未解決条件、Git単一writer向けsharedChangeRequestsを記録する。旧lane/旧studyは検収時点のsnapshotを保持する。詳細設計/index/workstream/project/status/READMEの同期、独立検収後の固定候補 `npm run verify` とGit保存は統合担当へ渡す。
