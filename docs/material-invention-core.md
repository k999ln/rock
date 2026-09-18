# RockstarOS Material Invention Core — 物質の組合せから発明候補を作る共通設計

状態: RQ49の設計と装置非接続sandbox Coreを実装済み。化学simulation、外部データベース、Zemaの仕事／限定記憶、外部ラボ、実験設備との接続は未実装。本文と実装は候補生成と検証の契約であり、安全性、性能、特許性、量産性の実証ではない。

## 目的

Material Invention Coreは、物質と物質だけでなく、配合比、混合順序、温度、圧力、雰囲気、加工、保持時間、冷却、表面処理を一つの候補として扱い、求める特性に近い材料・用途・工程を探索する。RockstarOSは発明の履歴と判断根拠を管理し、物理計算、化学計算、材料データベース、測定器、ロボット、ラボは交換可能なTool／Providerとして接続する。

## 共通データ契約

| entity | 必須内容 | 役割 |
| --- | --- | --- |
| `MaterialRecord` | 物質ID、組成、状態、純度、由来、lot、単位、不確かさ、SDS／規制参照 | 入力物質を再現可能にする |
| `CompositionCandidate` | 構成物質、比率、許容差、代替候補、生成根拠、版 | 配合仮説を比較する |
| `ProcessRecipe` | 順序、温度、圧力、雰囲気、時間、加工、設備条件 | 組成と工程を分離せず記録する |
| `SafetyAssessment` | 危険性、反応性、PPE、設備、廃棄、輸送、法規、reviewer | 物理実行のgateにする |
| `SimulationResult` | 使用モデル、入力hash、版、予測値、誤差、適用範囲 | 予測を再計算可能にする |
| `ExperimentReceipt` | 承認、実施者、設備、校正、測定値、raw data hash、異常、時刻 | 実験結果を追記型証拠にする |
| `InventionCandidate` | 目的特性、候補版、根拠集合、比較対象、未確認事項、IP区分 | 次の検証判断を一か所にまとめる |

各値は単位を必須にし、変換元、測定誤差、欠損、推定値を区別する。生成AIの提案、simulation、文献値、supplier申告、実測値は同じ信頼度として混ぜない。

## 発明ループ

1. 利用者が目的特性、用途、禁止物質、費用、設備、環境条件を定義する。
2. Skyから材料データ、simulation、文献検索、ラボ候補を接続する。
3. Zemaが候補の配合と工程を生成し、既知データ、制約、類似候補と比較する。
4. Safety AssessmentがSDS、反応性、毒性、可燃性、圧力、温度、廃棄、輸送、法規を検査する。
5. simulationまたは低危険度の机上比較で候補を絞る。予測は実験済みと表示しない。
6. 物理実験の対象、量、設備、実施者、停止条件、費用上限を本人が承認する。
7. 資格・設備を持つ外部ラボまたは明示的に許可された装置が実験し、署名付きreceiptとraw data hashを返す。
8. Coreが予測と測定を照合し、失敗も削除せず次の候補生成へ使う。

## 安全境界

- 危険性情報、法規、設備適合、廃棄方法のいずれかが不明なら、物理実行を`blocked`にする。
- 爆発性、高毒性、病原性、放射性、違法・規制対象、高圧・極端温度などの候補は、資格を持つreviewerと適切な施設の証明なしに実行へ進めない。
- RockstarOSは危険な合成を無人で開始せず、任意shellや装置の包括制御権限をMaterial Toolへ渡さない。
- Toolは許可された物質、量、工程、装置、時間、費用上限だけを一回承認で実行する。変更時は再承認する。
- simulation、生成AI、文献一致だけで「安全」「発明成功」「特許可能」「量産可能」と断定しない。
- 実験ノート、未公開配合、raw data、知的財産はowner／project単位で分離し、外部共有には対象と目的を明示した承認を要求する。

## RockstarOSへの接続

- Core: entity、provenance、権限、version、approval、receipt、監査、backup／restoreを提供する。
- Sky: 材料データベース、simulation、測定器、ラボ、知財調査Toolの発見と接続を担当する。
- Zema: 目的、候補、追加確認、実行計画、停止、結果、次の反復を一つの仕事として管理する。
- Wallet: simulation、試料、外部ラボ、測定、廃棄の費用を事前上限とreceiptで照合する。研究成果や将来収益を未確認で計上しない。
- Local AI: 秘密の条件を端末内で扱える候補生成・要約を優先する。モデル版と入力hashを候補へ固定する。

## 最初の実装単位

1. `MaterialRecord`、`CompositionCandidate`、`ProcessRecipe`、`SafetyAssessment`のJSON Schemaとfixtureを実装する。**完了**
2. 物理装置へ接続しないsandboxで、二物質・複数比率・工程条件から候補graphを作る。**完了**
3. 危険性情報不足、単位不整合、禁止物質、設備外条件をfail closedで拒否する。**完了**
4. simulation結果と署名検証済み測定receiptを別sourceとして取り込み、候補順位と不確かさを再計算する。**証拠区分のみ実装、取り込みと順位計算は未実装**
5. 第三者ラボ接続は契約、資格、設備、データ保持、事故責任、知財境界を確認した後に独立受入する。**未実装**

初期合格はsandbox上の候補生成、危険gate、provenance、再現、失敗記録までとする。実物の新材料、安全性、性能、特許性、量産性は外部試験を通るまで未確認と表示する。

## 実装済みのsandbox Core

- 入力契約: [`contracts/material-invention.json`](../contracts/material-invention.json)
- 危険物を含まない合成fixture: [`contracts/material-invention-fixture.json`](../contracts/material-invention-fixture.json)
- 純粋runtime: [`lib/material-invention.ts`](../lib/material-invention.ts)
- 自動試験: [`tests/material-invention.test.mjs`](../tests/material-invention.test.mjs)

runtimeは2〜16物質から二物質pairを作り、指定された複数比率と版付き工程を候補graphへ変換する。候補IDとrequest digestはcanonical JSONのSHA-256で、物質lot、配合比、工程版の変更を別候補として固定する。未知field、重複ID、矛盾する危険分類、工程順の欠落は入力拒否、SDS不足、危険性不明、禁止物質／危険分類、配合単位不一致、許可外設備、温度・圧力上限超過は候補を`BLOCKED`にする。既知の危険分類は`REVIEW_REQUIRED`にするが、どの状態でも`physicalExecutionAllowed`はfalseのままである。

simulationは`SIMULATED`、文献・supplier情報は`SCREENED`として実測と分離する。実験扱いへ進めるのは、外部境界で署名検証済みとされたreceiptと有効なraw data SHA-256が揃った場合だけである。現在のCore自身は署名検証、装置操作、物理実験を行わない。
