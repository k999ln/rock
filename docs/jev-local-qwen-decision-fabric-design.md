# RockstarOS Decision Fabric 完成設計書

版: 1.0 / 2026-09-18  
対象: Jev / TypeSafe、Local Qwen、Cloud LLM、Codex、RAG、Market、Wallet、MCP、Sky / Zema  
状態: **設計確定・host側Phase 0の限定実装**。既存のPixel 10向けLocal AI実装を土台にする。`lib/decision/`のProvider契約、Mock、Router、Harness、Policy、TypeSafeのserver側read-only adapterは固定fixtureで試験済み。Android Brokerへの統合、実APIキーでのTypeSafe接続、Local Qwen共通Provider、RAG、Cloud fallback、実機受入は未完了。

## 0. この設計を一文でいうと

RockstarOSは、決まった処理をコードで行い、文章の意味を素早く選ぶ仕事をJevへ、端末内で秘密を守りながら考える仕事をLocal Qwenへ、重い調査や長い推論を本人が許可したCloud LLMへ渡し、最後に別の検証とOSの権限判定を通してからToolを動かす。

JevもQwenもCloud LLMも、送金、購入、削除、公開、merge、装置操作を許可する権限を持たない。確率やconfidenceが高くても権限にはならない。

## 1. 誰の、何の問題を解くか

### 利用者

- RockstarOSを使って仕事、発明、調査、開発、端末操作を進める本人。
- SkyへToolを掲載・接続する開発者。
- Zema、Codex、Material Invention、Market、Walletを運用・監査する担当者。

### 解く問題

現在のRockstarOSには、端末内Qwenによる閉じたplan生成と、Tool・Wallet・Marketの安全境界がある。一方で「どの処理をコード、Jev、Local Qwen、Cloud LLMへ渡すか」という共通判断層がない。このまま個別機能へAIを足すと、次の問題が起きる。

- 同じ入力が機能ごとに別の基準で外部送信される。
- confidenceを権限や正しさと誤認する。
- Local AIが苦手な時に、利用者へ知らせずCloudへ送る。
- Tool自身の「完了」を、そのまま本当の完了として扱う。
- Codex、RAG、Market、Walletが別々の安全基準を持つ。
- providerやmodelを変えるたびにOS全体を作り直す。

本設計はこれを `DecisionProvider`、`DecisionRouter`、`DecisionHarness`、`PolicyEngine`、`ResultVerifier` の五つへ分け、すべての応用が同じ境界を使えるようにする。

## 2. 現在地—何があり、何を追加するか

| 領域          | 2026-09-18時点の事実                                                                                                                                    | 本設計で追加するもの                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Local AI      | `llama.rn 0.12.9`、Qwen3-0.6B Q8_0 GGUF、通信権限なしのAPK、Pixel 10 GL066で機内モード推論・再起動保持・33分22秒熱試験、plan-only JSON Schema経路を確認 | provider共通契約、用途別profile、routing、calibration、RAG連携 |
| Android / OS  | 試験署名APKでBinder経路とBroker連携を確認。AOSP image、正式署名、SELinux最終形、OTAは未完                                                               | Decision ServiceのOS統合、model/provider世代固定、監査event    |
| Platform Core | owner、capability、本人承認、work、Tool、receiptの契約と一部実装がある                                                                                  | 判断結果を権限から分離するPolicy Gate、Decision Receipt        |
| Sky / Zema    | Tool一覧、選択、仕事、進捗、結果の経路がある                                                                                                            | Routerの説明表示、Cloud送信同意、判断根拠と検証結果の表示      |
| Jev ecosystem | 10 repositoryをcandidate登録し、安全境界を設計。source導入・runtime接続は未実施                                                                         | TypeSafeJevProvider、OpenJev候補adapter、専用fixtureと採用試験 |
| Codex         | repository開発作業は可能                                                                                                                                | preflight、差分review、test、postflightを同じHarnessへ接続     |
| RAG / Memory  | 仕事記録と限定記憶の設計がある。汎用検索indexは未実装                                                                                                   | owner別Knowledge Engine、候補検索、Jev rerank、引用検証        |
| Market        | 型付き資産のPAPER提案・承認・receipt・positionが実装済み。LIVE無効                                                                                      | 数値計算と意味判断の分離、異常検知、説明、PAPER評価            |
| Wallet        | 内部台帳とsandbox境界がある。外部LIVE Providerは未接続                                                                                                  | AIを助言専用に固定し、宛先・金額・承認をhard policyで決定      |

既存証拠の正本は[Local AI統合](local-ai-os-integration-20260915.md)、[AIネイティブOS](ai-native-os-architecture.md)、[Platform Core](platform-core.md)、[Market](everything-market-and-autonomous-fund-20260913.md)、[Wallet Provider境界](external-wallet-fund-provider-boundary-20260913.md)とする。

## 3. TypeSafe公式仕様との照合

2026-09-18にTypeSafe公式資料を確認した。TypeSafeが公開するJev / System Oneは、入力stateへ小さなtyped questionを当て、生成文章ではなく構造化した値を返すものと説明されている。

| 公式仕様                                                 | RockstarOSでの扱い                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Choice`は固定候補と確率分布、confidenceを返す           | intent、domain、route、risk class、候補分類に使う                           |
| `Score`は定義済みの段階上のscore、分布、confidenceを返す | 緊急度、関連度、難易度、品質、危険度に使う                                  |
| `Noul`は命題が真である確率0〜1を返す                     | prompt injection疑い、秘密含有、引用支持、要確認の検出に使う                |
| 同じstateへの複数questionは独立に評価される              | 一回のfan-outでroute、risk、privacy、difficultyを尋ね、コードで組み合わせる |
| 複雑な判断は小さなquestionへ分け、コードで合成する       | 「最適行動を全部決めて」をJevへ渡さない                                     |
| confidenceは不確実性を表すが、閾値は用途と危険度で変える | 一つの全体閾値を使わず、action class別にcalibrationする                     |
| verification、routing、retrieval、guardrailが想定用途    | Harnessの判断・検証部品として使い、OS権限判定者にはしない                   |

参照: [TypeSafe Introduction](https://docs.typesafe.ai/introduction)、[Quick start](https://docs.typesafe.ai/introduction/quickstart)、[Primitives](https://docs.typesafe.ai/primitives)、[Confidence](https://docs.typesafe.ai/confidence)、[Use Case Map](https://docs.typesafe.ai/concepts/use-case-map)。性能、費用、精度に関するTypeSafe側の数値はvendor claimとして扱い、RockstarOSの合格値にはしない。

2026-09-20再確認: [公式HTTP API](https://docs.typesafe.ai/api)は`POST /v1/systemone`のhosted APIを公開し、`state`・`model`・`questions`を受け取る。`Choice`／`Score`／`Noul`はそれぞれ`choice`／`score`／`noul`として返る。OS共通契約の`boolean_probability`は`Noul`へ変換する必要がある。現行の[モデル一覧](https://docs.typesafe.ai/models)では`jev-1.13.0`と移動可能な`jev-latest` alias、テキスト入力のみ、英語で最も高い精度、日本語を含むCJKは個別評価が必要と明記される。thresholdを調整する場合はaliasを固定版へ置き換えて再評価する。[既知の限界](https://docs.typesafe.ai/model-jaggedness/jev-1.13)は数値計算、日時比較、長い無関係なstate、敵対的入力、多段推論、文章生成を挙げる。ローカルJevのweightやモバイルruntimeはこのAPI資料から確認できない。

host側TypeSafe adapterは外部送信前に正の費用予算と呼出し単位の見積りを要求する。公式APIの応答はtoken使用量を返すが確定した請求額は返さないため、見積りを`usage.costMicros`へ実費として記録しない。この段階では実費の厳密な上限を保証できず、実接続と課金の受入は未実施とする。

### Jevが行わないこと

- 長文の回答、コード、記事、企画書を生成しない。
- OS capability、Wallet権限、Tool権限を発行しない。
- 金額、税、残高、hash、署名、時刻、件数など決定的に計算できる値を置き換えない。
- それ自身のconfidenceだけで高リスク操作を自動許可しない。
- 事実検索や最新情報取得を、根拠なしで代行しない。

## 4. 全体構造

```text
利用者 / Sky / Zema / Codex / Material / Market
                     │
                     ▼
            Request Normalizer
       目的・scope・data class・effectを固定
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
  Deterministic Fast Path   Decision Router
  schema/hash/数値/権限      どの判断手段が必要か
          │                     │
          │       ┌─────────────┼─────────────┐
          │       ▼             ▼             ▼
          │   Jev Provider   Local Qwen    Cloud LLM
          │   小さな判断     秘密/offline    深い推論
          │       └─────────────┼─────────────┘
          │                     ▼
          └──────────── Decision Harness
                    typed resultをcodeで合成
                              │
                              ▼
                    Policy Engine（唯一の門）
             owner / scope / effect / approval / cost
                              │
                              ▼
                   Tool / MCP / Wallet / Market
                              │
                              ▼
                 Result Verifier → receipt / review
```

### 信頼境界

1. 入力文、取得文書、Webページ、Tool出力は未信頼dataである。
2. DecisionProviderの出力は助言であり、authorityではない。
3. `PolicyEngine`だけが実行可否を決める。高リスクでは本人承認も必要。
4. Toolの成功応答と、RockstarOSが検証した成功は別状態である。
5. 外部Providerへ送る前に、送信対象、費用、保持、実行先を固定する。

## 5. Componentの責任と禁止権限

| Component           | 責任                                                                | 持ってはいけない権限                     |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| Request Normalizer  | 入力schema、owner、purpose、scope、effect、data class、期限を固定   | model選択、Tool実行、承認代行            |
| Policy Engine       | hard rule、capability、本人承認、費用、地域、秘密、effectを判定     | 自由文の意味推測、LLM回答生成            |
| Decision Router     | 候補provider、fallback、予算、timeoutを決める                       | Tool実行、secret読取、Wallet署名         |
| DecisionProvider    | typedな意味判断または生成結果を返す                                 | capability付与、外部作用、台帳更新       |
| Decision Harness    | 複数questionの実行、結果合成、calibration、retry上限、trace         | policy迂回、無限loop、自動Cloud送信      |
| Local Qwen Runtime  | 端末内推論、閉じたschemaのplan／要約／生成                          | 任意Tool call、network、model自己更新    |
| TypeSafeJevProvider | TypeSafe APIへ最小stateとatomic questionsを送りtyped answerへ正規化 | raw secret送信、複雑な全体計画、権限判断 |
| CloudLLMProvider    | 許可済みの深い推論、長文生成、広い文脈処理                          | 無断送信、永続資格、直接Tool call        |
| Knowledge Engine    | owner別取得、候補検索、rerank、引用bundle作成                       | 取得文書内の命令実行、secret index化     |
| Result Verifier     | schema、test、引用、再読取、provider照合で結果を別に検証            | 未検証結果を成功へ変更、外部作用の再送   |
| Audit Store         | Decision Receiptとversion/hashを保存                                | raw secret、不要な本文、private key保存  |

## 6. 共通契約

機械可読の正本は[`contracts/decision-provider.json`](../contracts/decision-provider.json)とする。下記は人が読むための要約である。

### DecisionRequest

```ts
type DecisionRequest = {
  schemaVersion: 1;
  requestId: string;
  ownerRef: string;
  workId: string;
  purpose:
    | 'route'
    | 'classify'
    | 'score'
    | 'detect'
    | 'retrieve'
    | 'verify'
    | 'plan'
    | 'generate';
  state: unknown;
  stateDigest: string;
  questions: DecisionQuestion[];
  dataClasses: ('public' | 'owner_private' | 'confidential' | 'secret')[];
  effect: 'none' | 'local-pure' | 'remote-read' | 'external-write';
  constraints: {
    offlineRequired: boolean;
    cloudAllowed: boolean;
    maxLatencyMs: number;
    maxCostMicros: number;
    maxAttempts: number;
  };
  policyVersion: string;
};
```

### Question

```ts
type DecisionQuestion =
  | {
      id: string;
      kind: 'choice';
      instructions: string;
      options: Record<string, string>;
      unknownOptionRequired: boolean;
    }
  | { id: string; kind: 'score'; instructions: string; levels: string[] }
  | {
      id: string;
      kind: 'boolean_probability';
      instructions: string;
      yesMeans: string;
      noMeans: string;
    };
```

`boolean_probability`はprovider中立名である。TypeSafe adapterでは`Noul`へ、Local Qwenでは閉じたJSON probabilityへ変換する。provider固有型をCore契約へ漏らさない。

### DecisionResult

```ts
type DecisionResult = {
  schemaVersion: 1;
  requestId: string;
  provider: 'mock' | 'local_qwen' | 'typesafe_jev' | 'cloud_llm';
  providerVersion: string;
  modelId: string;
  modelRevision: string;
  answers: Record<
    string,
    {
      kind: 'choice' | 'score' | 'boolean_probability';
      value: string | number;
      probabilities?: Record<string, number>;
      confidence?: number;
    }
  >;
  status: 'answered' | 'abstained' | 'blocked' | 'failed';
  reasonCodes: string[];
  stateDigest: string;
  questionSetDigest: string;
  startedAt: string;
  completedAt: string;
  usage: { inputTokens?: number; outputTokens?: number; costMicros?: number };
};
```

自由なchain-of-thoughtは保存・要求しない。必要なのはtyped answer、入力・question・model・policyの版、短いreason code、計測値である。

### Provider interface

```ts
interface DecisionProvider {
  describe(): ProviderCapabilities;
  health(): Promise<ProviderHealth>;
  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionResult>;
}
```

最初に実装するproviderは次の順とする。

1. `MockDecisionProvider`: fixtureだけ。productionでは登録不可。
2. `LocalQwenDecisionProvider`: 現行plan-only runtimeをprovider契約へ包む。
3. `TypeSafeJevProvider`: 公式APIをatomic question専用で接続。
4. `CloudLLMProvider`: 長文生成と複雑推論専用。Jev互換を装わない。
5. `OpenJevProvider`: candidate検証後に追加可能。TypeSafe公式Jevと同一と表示しない。

決定的なcode pathは`DecisionProvider`へ入れず、`PolicyEngine`と通常の関数に置く。これによりAIが停止してもhash、金額、権限、状態遷移、停止、履歴は動く。

## 7. Router / Harnessの処理順

### 7.1 入口

1. owner、work、request IDを発行する。
2. schemaを閉じ、未知fieldを拒否する。
3. secret、private key、recovery phrase、OTP、認証cookieを検出し、providerへ渡さない。
4. effectを`none / local-pure / remote-read / external-write`へ分類する。この分類は最終的にcodeで確定する。
5. 決定的に解ける処理を先に実行する。

### 7.2 Routerの出力

Routerは次の一つだけを返す。

| route        | 意味                                     |
| ------------ | ---------------------------------------- |
| `CODE`       | schema、計算、lookup、policyだけで完了   |
| `JEV`        | 固定候補からの高速な意味判断             |
| `LOCAL_QWEN` | private、offline、短〜中程度の生成・計画 |
| `CLOUD_LLM`  | 本人が許可した複雑推論・長文生成         |
| `TOOL`       | model判断ではなく明示Toolを実行すべき    |
| `ASK_USER`   | 情報、同意、承認が不足                   |
| `BLOCK`      | policy、secret、scope、危険条件で拒否    |

Router自身をLLM一発判定にしない。codeのhard conditionを先に適用し、Jev等のsoft signalを使い、最後に再びcodeでrouteを確定する。

### 7.3 基本routing表

| 条件                          | 第一候補         | fallback                       | 禁止                     |
| ----------------------------- | ---------------- | ------------------------------ | ------------------------ |
| schema/hash/数値/権限/残高    | CODE             | なし                           | AIで上書き               |
| 固定候補のintent/domain/risk  | JEV              | Local Qwen → ASK_USER          | confidenceだけで外部作用 |
| owner_private、端末内で収まる | Local Qwen       | CODE/ASK_USER                  | 無断Cloud送信            |
| offline必須                   | Local Qwen       | CODE/ASK_USER                  | Jev API / Cloud          |
| 長文生成・多段推論            | Cloud LLM        | Local Qwenで縮退またはASK_USER | secret送信               |
| 最新外部情報                  | TOOL remote-read | cache表示または停止            | LLM記憶を最新扱い        |
| external-write                | planまでは上記   | Policy + 本人承認 + Tool       | provider判断から直結     |

### 7.4 retryとfallback

- schema不正は同じproviderで最大1回だけrepairできる。入力とmodel版は固定する。
- timeout、rate limit、network断は別reason codeとし、内容誤りと混ぜない。
- Jev停止時は、危険度が低く同じquestion schemaを再現できる場合のみLocal Qwenへfallbackする。
- Local Qwen停止時にCloudへ自動送信しない。`cloudAllowed`と本人の送信確認が必要。
- Cloud停止時は「未完」と表示し、成功を推測しない。
- providerを切り替えた場合、Decision Receiptに元provider、失敗理由、fallback先を残す。
- 同じrequestで最大2 provider、全attempt合計3回まで。無限routingを禁止する。

## 8. Confidenceとcalibration

confidenceは「当たっている証明」ではない。provider、model版、question、domain、言語、入力分布ごとに意味が変わる。

### 三段階

| 段階 | 低リスクread-only     | 中リスク                  | 高リスク・不可逆                    |
| ---- | --------------------- | ------------------------- | ----------------------------------- |
| 高   | 自動route可           | review付きで次へ          | それでも本人承認とhard policyが必要 |
| 中   | 複数signalまたは確認  | ASK_USER / 別provider検証 | 自動実行禁止                        |
| 低   | ASK_USERまたはabstain | 停止                      | 停止                                |

具体値は本書で固定しない。最低200件のowned fixtureをdomain別に用意し、precision、recall、false allow、false block、calibration errorを測って`data/decision-fabric-policy.json`のprofile版として決める。危険操作のfalse allowは0件必須。threshold変更はcode review、fixture再実行、policy version更新が必要である。

## 9. Local Qwen runtime

### 採用方針

現時点の実装基準は`llama.rn 0.12.9 + GGUF + Qwen3-0.6B Q8_0`を維持する。すでに物理Pixelで証拠があり、最短でProvider adapterを作れるためである。ただし最適runtimeやmodelの永久決定ではない。

| 候補                 | 公式に確認できる範囲                                                            | RockstarOS判断                                                  |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| llama.cpp / llama.rn | llama.cppはAndroid binding、GGUF読取、arm64 build経路を公開                     | 現行MVP。既存証拠を再利用                                       |
| ExecuTorch           | Android/iOS、Java/Swift/C++、`.pte`、CPU/GPU/NPU/DSP backendを公式文書化        | 1.1の比較候補。Qwen export、端末backend、品質を実測してから採用 |
| MNN                  | mobile/PC/IoT向けon-device LLM、Android/iOS app、Qwen対応を公式repositoryで公開 | 1.1の比較候補。license、変換、Pixel性能、保守を評価             |

参照: [llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md)、[ExecuTorch LLM deployment](https://docs.pytorch.org/executorch/stable/llm/getting-started.html)、[MNN公式repository](https://github.com/alibaba/MNN)。公開説明は採用証拠ではなく、同一fixtureをPixel 10で測る。

### ModelProfile

- model ID、revision、license、配布元。
- weight、tokenizer、chat templateのSHA-256。
- runtime ID、version、format、quantization。
- context上限、出力上限、RAM・保存・熱・電池予算。
- 対応purposeとschema。
- benchmark端末、OS、入力fixture、結果。
- activation generation、rollback可否、失効状態。

### 実行制限

- 同時推論は初期1件。
- Tool callは常時無効。出力は閉じたJSON Schemaかtext artifactだけ。
- model weightに実行権限を与えず、hashとlicense確認後に非active領域へ置く。
- 仕事開始時にmodel/runtime/prompt/schema版をpinし、途中変更しない。
- OOM、熱、電池、容量不足では成果と履歴を残して停止する。
- private入力をtelemetryへ送らない。token数、時間、error code、model hashだけを既定記録にする。

## 10. TypeSafeJevProvider

### 接続

- TypeSafe API keyはOS secret storeまたはserver secretへ保存し、app、prompt、log、backupへ出さない。
- `POST /v1/systemone`相当のrequestへ、許可済みstateとatomic questionsだけを送る。
- model aliasはそのまま信用せず、receiptへ返却model IDを保存する。
- API responseを共通`DecisionResult`へ正規化し、未知field、欠損、範囲外確率、合計不正を拒否する。

### question設計規則

- 一問一判断。
- Choiceには`other`または`unknown`を原則含める。
- Scoreは各levelを文章で定義する。
- Noul相当はyes/noの意味を明確にする。
- 複数要因は並列questionへ分け、weightはcodeに置く。
- 後段判断が前段結果に本当に依存する時だけ二回目を呼ぶ。

### 初期用途

1. requestのintent、domain、difficulty、riskの分類。
2. RAG候補の関連度scoreとrerank。
3. prompt injection、秘密要求、scope逸脱のsoft detection。
4. Tool結果とsuccess criteriaの意味的一致。
5. Codex差分のrisk分類とreview先routing。

## 11. Cloud LLM

Cloud LLMは「Jevより上」ではなく役割が違う。長文生成、複数資料の統合、複雑な計画、コード生成を担当する。

外部送信前に、provider名、送信するdata class、要約／原文、保持条件、見積費用を表示する。`owner_private`は目的限定同意、`confidential`は原文送信を既定拒否してlocal redactionまたは明示承認、`secret`は送信禁止とする。provider側のtool executionは無効にし、必要なToolはRockstarOSへtyped proposalとして戻す。

Cloud providerを一社へ固定しない。adapterは同じrequest/result契約、budget、timeout、region、retention capabilityを宣言する。provider変更時は同じevaluation setで品質、費用、待ち時間、privacy条件を再受入する。

## 12. Online / offline動作

| 状態             | 動くもの                                                         | 止まる／確認が必要なもの                             |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| 完全offline      | CODE、Local Qwen、local cache、仕事・履歴・停止、local-pure Tool | TypeSafe API、Cloud、remote-read、external-write完了 |
| TypeSafeだけ停止 | CODE、Local Qwen、許可済みCloud                                  | Jev必須の高リスクrouteはASK_USER                     |
| Cloudだけ停止    | CODE、Jev、Local Qwen                                            | 長文・深い推論は縮退または未完                       |
| networkが不安定  | local処理、送信前queue                                           | external-writeを自動再送しない                       |
| 全AI停止         | schema、policy、履歴、停止、手動Tool選択                         | AI判断・生成。権限を緩めない                         |

外部作用の送信直後に切断した場合は`uncertain`へ置き、provider query / reconcileだけで解消する。「失敗に見えるから再送」は禁止する。

## 13. Codex統合

CodexはDeveloper Toolとして次のHarnessを通る。

```text
task受領
  → scope（repo/path/branch/禁止操作）をcodeで固定
  → Jev: 種類・risk・必要reviewを分類
  → Local QwenまたはCloud: 実装案・code生成
  → Codex: file編集
  → deterministic: format/type/test/schema/diff
  → Jev: 要求との意味的一致・危険差分を検出
  → Result Verifier: test証拠とdiffを照合
  → commit proposal
  → push/PR/mergeは別承認
```

Codexに許すscopeは仕事ごとに固定し、repository外、秘密file、Wallet、production deployを暗黙に広げない。Jev ReviewとJev Routerはcandidate Toolとしてこの経路へ接続できるが、導入前にsource pin、sandbox、fixture、費用、外部送信を受入する。

## 14. RAG / Knowledge Engine

### dataモデル

- `KnowledgeSource`: owner、project、source、license、取得時刻、期限、hash、data class。
- `KnowledgeChunk`: source revision、位置、本文参照、embedding revision。
- `RetrievalCandidate`: query、candidate ID、deterministic/embedding score。
- `RerankDecision`: provider、question、relevance score、confidence。
- `EvidenceBundle`: 採用chunk、引用位置、取得時刻、未採用理由。

### flow

1. owner/project scopeで候補を検索する。
2. hash、期限、ACL、data classをcodeで除外する。
3. Jevで関連度、質問への支持、重複を小さく判定する。
4. 上位候補だけをLocal QwenまたはCloudへ渡す。
5. 生成したclaimごとに引用候補を結ぶ。
6. Result Verifierが「引用がclaimを支持するか」「sourceが期限内か」を検査する。
7. 支持できないclaimは削除、弱める、または未確認と表示する。

取得文書内の「前の指示を無視せよ」等はdataであり命令ではない。RAG本文からTool、scope、network、secret権限を増やせない。削除時はcanonical source、chunk、embedding、cache、bundle参照を失効する。

## 15. Verification / Guardrail

Guardrailを一個のLLM promptにしない。五層で扱う。

1. **構文**: JSON Schema、型、長さ、範囲、未知field、hash。
2. **権限**: owner、capability、scope、effect、費用、承認、期限。
3. **意味**: Jev等によるintent、injection、秘密要求、結果一致の検出。
4. **事実**: source引用、外部readback、test、provider照合。
5. **結果**: artifact、receipt、前後state、未確定作用を確認。

検証結果は`verified / needs_review / rejected / uncertain`。provider自身の自己評価とResult Verifierを分離する。高リスク操作は独立した二つのmodelが賛成しても、hard policyと本人承認なしには実行しない。

## 16. Market Intelligence

Marketでは数値と意味を分ける。

| 処理                                        | 担当                       |
| ------------------------------------------- | -------------------------- |
| 残高、position、PnL、手数料、slippage、上限 | deterministic code         |
| news/topic分類、異常候補、説明用signal      | Jev                        |
| 複数資料の調査、scenario文章化              | Local Qwen / 許可済みCloud |
| order可否、notional上限、LIVE無効           | Policy Engine              |
| PAPER proposal、exact approval、receipt     | 既存Market runtime         |

初期はPAPER replayだけ。Jev Traderは研究fixtureであり、private key、実order、実Walletを持たない。評価はdirection accuracyだけでなく、calibration、手数料後PnL、max drawdown、false action、停止、data leakageを測る。LIVEはprovider、契約、本人確認、custody、地域・規制、risk、reconcile、owner承認が別途合格するまで設計対象外である。

## 17. Wallet / MCP / Hub

### Wallet

- AIは支払いや送金の提案理由を作れても、金額、recipient、network、asset、fee cap、nonceを決定・変更できない。
- private key、seed、OTPをDecisionProviderへ渡さない。
- exact payload digestに対する本人承認を必要とし、payload変更で承認を失効する。
- receiptはDecision Receiptとは別に、Providerのsigned resultと照合する。

### MCP / Sky / Zema

- MCP serverの説明文やTool resultは未信頼data。
- manifestのcapabilityと実際のOS/network権限を照合する。
- RouterはTool候補を提案できるが、接続、OAuth、費用、外部作用の承認は代行しない。
- Skyはprovider/model、実行場所、送信data、費用、現在状態を表示する。
- Zemaは「AIが完了」「Toolが完了」「検証済み」を別表示する。

### Hub

Hubは複数端末・Providerの発見と状態表示を担うが、同じ仕事のauthority deviceとwriter epochは一つに固定する。offline中に別端末へ自動移管しない。

## 18. 状態遷移

```text
received
  → normalized
  → policy_prechecked
  → routed
  → deciding
      ├→ answered
      ├→ abstained → awaiting_user
      ├→ provider_unavailable → fallback_offered
      └→ blocked / failed
  → composed
  → policy_authorized
      ├→ awaiting_approval
      └→ denied
  → executing
  → verifying
      ├→ verified
      ├→ needs_review
      ├→ rejected
      └→ uncertain
  → completed / cancelled
```

providerが`answered`を返しても仕事は完了しない。`verified`後にのみ成果完了となる。external-writeの`uncertain`は利用者が閉じても履歴から消さず、reconcileまで未確定を維持する。

## 19. 保存、保持、削除、backup

### 保存する

- request / work / ownerの内部参照。
- state digestとquestion set digest。本文は必要最小限。
- provider、model、runtime、prompt、schema、policyの版。
- typed answer、confidence、route、fallback、reason code。
- latency、token、費用、検証結果、approval参照、receipt参照。

### 保存しない

- private key、seed、OTP、password、session cookie。
- providerへ不要なraw本文、画像、音声、画面全体。
- chain-of-thought。
- model weightのbackup複製。

初期保持案はDecision Receipt 30日、debug artifact 24時間、calibration用に明示同意した匿名fixtureは別管理。正式値はprivacy reviewで確定する。本人削除では本文、projection、embedding、cache、debug artifactを削除し、金融・安全監査で法的保持が必要なreceiptは本文を除いて保持理由と期限を示す。

backupはpolicy、provider profile、仕事状態、receipt参照を含め、API key、raw本文、credential、model weightを含めない。復元後はsession、approval、external-write権限を失効し、再認証・再承認する。

## 20. 更新、互換、rollback

- provider adapter、model、prompt、question set、threshold、policyを別versionにする。
- production aliasの「latest」を無検査で使わない。返却modelと評価結果を記録する。
- 更新は`stage → hash/license → fixture → shadow → owner review → activate → health`。
- 進行中workは旧versionへpinする。
- rollbackは互換性を確認した直前版だけ。失効版へ戻さない。
- schema majorが未知ならresetせず停止する。
- provider停止や品質悪化で権限を緩めない。

## 21. Threat model

| 脅威                           | 防御                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| prompt injection               | 入力をdataとして隔離、Tool権限を別管理、Jev soft検出、scope hard check |
| poisoned RAG                   | source/hash/license/provenance、owner scope、引用検証、期限            |
| confidence誤用                 | domain別calibration、abstain、hard policy分離                          |
| model差替え                    | signed manifest、全hash、generation pin                                |
| secret流出                     | data class、redaction、secret送信禁止、最小state                       |
| Tool自己申告                   | external readback、test、Result Verifier                               |
| 二重実行                       | idempotency key、fencing token、outbox、reconcile                      |
| provider outage                | bounded fallback、ASK_USER、offline degradation                        |
| 無限agent loop                 | 最大provider数、attempt、step、deadline、cost                          |
| compromised community Jev Tool | candidateのまま隔離、source pin、SBOM、fixture、最小権限               |

## 22. Observability

一つの`DecisionEvent`は、`eventId / ownerRef / workId / requestId / attempt / phase / provider / modelRevision / policyVersion / inputDigest / outputDigest / status / reasonCodes / latency / token / cost / timestamp`を持つ。本文とsecretは持たない。

見る指標は成功率だけではない。

- route別件数、abstain、ASK_USER、BLOCK。
- provider別latency p50/p95、schema有効率、費用。
- calibration error、false allow、false block。
- fallback、timeout、rate limit、offline成功率。
- Tool自己成功とResult Verifier不一致。
- external-write uncertain件数と解消時間。
- Local Qwenのpeak PSS、熱、電池、停止応答。

## 23. MVP実装順

### Phase 0 — 契約とfixture

- `DecisionRequest / Result / ProviderCapabilities`を実装。
- Mock provider、Policy Engine、Decision Receipt、event schemaを作る。
- 低・中・高リスクの合成fixtureを最低200件作る。
- AI停止中もCODE、停止、履歴、手動選択が動くことを確認。

合格: 未知field、secret、scope外、confidence-only authorization、無限retryをすべて拒否する。

### Phase 1 — Local Qwen

- 現行Binder plan-only APIを`LocalQwenDecisionProvider`へ包む。
- route/classify/plan schemaを分離する。
- Pixel 10でoffline、再起動、OOM、熱、取消、model pinを再受入する。

合格: networkなし、Tool call 0、危険plan実行0、通常fixture schema有効率95%以上の候補目標。品質閾値は実測後に確定。

### Phase 2 — TypeSafe Jev

- API adapter、secret管理、atomic question registry、response validationを実装。
- intent/risk/RAG rerank/result verificationをshadow modeで評価。
- domain別thresholdを固定する。

合格: vendor数値ではなくowned fixtureで基準を満たし、TypeSafe停止時に安全に縮退する。

### Phase 3 — Cloud LLM / Codex

- data class、consent、budget、redaction、provider adapterを実装。
- Codex preflight → edit → test → semantic postflightを接続する。
- push/PR/merge/deployの別承認を確認する。

合格: secret送信0、無断Cloud送信0、scope外変更0、検証前完了0。

### Phase 4 — RAG / Sky / Zema

- owner/project別source、chunk、retrieval、rerank、citation verificationを実装。
- Sky/Zemaへroute、送信先、費用、confidence、検証状態を表示する。

合格: cross-owner retrieval 0、削除後projection残存0、引用不支持claimの自動確定0。

### Phase 5 — Market / Wallet / Material

- PAPER Marketの異常検知・説明を追加。
- Walletはadvisoryだけを接続し、外部LIVEは無効のままにする。
- Material Inventionの候補分類、RAG、Patent AI引継ぎへ適用する。

合格: Jev/LLMから実送金、実order、物理装置操作へ直結する経路0。

## 24. 予定する実装file

| file                                     | 役割                               | 状態             |
| ---------------------------------------- | ---------------------------------- | ---------------- |
| `contracts/decision-provider.json`       | provider中立schema                 | 本設計と同時追加 |
| `data/decision-fabric-policy.json`       | routing、安全不変条件、段階        | 本設計と同時追加 |
| `lib/decision/types.ts`                  | 型                                 | host側実装・型検査済み |
| `lib/decision/router.ts`                 | deterministic routing              | host側実装・fixture試験済み |
| `lib/decision/harness.ts`                | provider実行・合成・retry          | host側実装・fixture試験済み |
| `lib/decision/policy.ts`                 | hard authorization                 | host側実装・fixture試験済み。OS Broker権限へ未統合 |
| `lib/decision/providers/mock.ts`         | fixture provider                   | fixture専用で実装・試験済み |
| `lib/decision/providers/local-qwen.ts`   | Binder / local adapter             | 未実装           |
| `lib/decision/providers/typesafe-jev.ts` | TypeSafe API adapter               | server側read-only実装・mock fetch試験済み。実API未接続 |
| `lib/decision/providers/cloud.ts`        | cloud adapter                      | 未実装           |
| `lib/decision/verifier.ts`               | independent verification           | 未実装           |
| `tests/decision-*.test.mjs`              | safety / routing / failure fixture | 16 host fixture試験済み。domain別200件calibrationは未実施 |

## 25. 受入条件

### 共通

- 同一request、version、fixtureで再現可能。
- provider不在でもpolicyと停止が動く。
- raw secretがrequest、log、backup、providerへ出ない。
- confidenceだけで外部作用を許可するcaseが0。
- Tool自己成功だけでcompletedへ行くcaseが0。
- retry、step、時間、費用に上限がある。

### 実機

- Pixel 10でoffline Local Qwen、再起動復元、30分以上の熱、OOM、cancelを確認。
- AOSP統合後はproduction signer、SELinux enforcing、OTA、rollback、復旧を別に確認。
- Web/PC、Android APK、Pixel OS imageの証拠を混ぜない。

### 外部Provider

- TypeSafeとCloudはsandbox/shadowから開始。
- API version、model、費用、retention、region、rate limitを記録。
- timeout、429、5xx、malformed response、partial response、model alias変更を試験。

## 26. 未決定事項と決め方

| 未決定                       | 決定者                          | 必要な試験                                       |
| ---------------------------- | ------------------------------- | ------------------------------------------------ |
| TypeSafe本番採用と契約       | OWNER + ROCK                    | owned fixture、費用、privacy、availability、契約 |
| question別threshold          | ROCK + domain owner             | 最低200 fixture、calibration、false allow 0      |
| Local Qwen次期model          | ROCK                            | Pixel同条件の品質/速度/RAM/熱/電池比較           |
| llama.cpp / ExecuTorch / MNN | ROCK                            | 同一model・fixture・端末の再現比較               |
| Cloud provider               | OWNER + ROCK                    | 品質、費用、保持、地域、障害、data policy        |
| 記憶保持期間                 | OWNER + privacy owner           | 利用価値、削除確認、backup復元、法的要件         |
| iPhone client runtime        | OWNER + ROCK                    | client-only要件、iOS実機、配布・署名条件         |
| LIVE Market / Wallet         | OWNER + legal/security/provider | 契約、許認可、KYC/AML、custody、risk、reconcile  |

未決定は未決定のまま表示する。providerを接続したこと、設計書があること、candidate repositoryを登録したことを、実装完成、精度達成、本番利用可能と表示しない。

## 27. 引き継ぎ要求との対応

| 要求                         | 本書の節   |
| ---------------------------- | ---------- |
| 現在のRockstarOS構造         | 2、4、5    |
| Jev/TypeSafeの位置           | 3、10      |
| DecisionProvider             | 6          |
| Router/Harness               | 7、8       |
| Local Qwen                   | 9、12      |
| online/offline fallback      | 7.4、12    |
| Codex                        | 13         |
| RAG/Knowledge Engine         | 14         |
| Market Intelligence          | 16         |
| Verification/Guardrail       | 15         |
| Wallet/MCP/Hub               | 17         |
| 公式TypeSafe資料照合         | 3          |
| Mock/Local/TypeSafe provider | 6、23      |
| safety/observability         | 15、19〜22 |
| MVP phase                    | 23〜26     |

## 28. 結論

RockstarOSのAI基盤は「一番大きいmodelに全部やらせる仕組み」ではない。codeが制御し、Jevが小さく速い意味判断をし、Local Qwenが秘密とofflineを守り、Cloud LLMが許可された重い思考を担い、別のVerifierとPolicy Engineが結果と権限を確かめる仕組みである。

この分離を守れば、Jev、Qwen、Cloud provider、mobile runtimeが変わっても、RockstarOSのowner、承認、Tool、Wallet、Market、Material Inventionの安全境界を作り直さずに進化させられる。
