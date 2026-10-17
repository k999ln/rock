# RockstarOS — LLM・評価モデル設計

更新日: 2026-10-15（Pixel実装設計への接続を追補）。対象: `RockstarOS 1.0` / `dev.rock`。

この文書は、端末内LLM、Sky内の交換可能な文章モデル接続、Jev評価モデル、Broker／Engineの責任を分ける正本である。機械可読の現在地は [`data/llm-capabilities.json`](../data/llm-capabilities.json)、共通Coreの到達設計は [siネイティブOS共通設計](ai-native-os-architecture.md)を参照する。

## 1. 結論

- 現行の端末内LLMは、Pixel 10上の `Qwen3-0.6B Q8_0` と `llama.rn 0.12.9` による固定profileの試験署名APK実証である。交換可能な複数profileやOS image搭載は未実装。
- 端末内LLMは**非信頼planner**である。Toolを実行せず、許可を発行せず、台帳や仕事状態を書き換えない。
- Brokerが唯一の実行権限判定者、Engineが検証済みToolの決定論的実行者、Zemaが依頼・進捗・承認・停止・結果の窓口である。
- WebのOpenAI接続はSkyの `法務受付` と `特許アシスタント` のオンライン検索オプション内部だけにある。標準経路は端末内の決定論的ガイド／ドラフトで、通信断時もSkyの受付・整理・引継ぎを止めない。
- Jev (`typesafe-ai/jev`) はTypeSafe AIのremote評価モデルである。端末内modelや汎用文章生成modelに数えない。
- JevはSkyから本人が明示的に使う**任意の評価Tool**として導入する。結果は助言・品質証拠であり、Brokerの権限判定、本人承認、Tool成功、仕事完了を置き換えない。
- Jev runtimeの状態は `implemented_configuration_required`。`ai@7.0.107` の `experimental_evaluate` をserver-side routeから呼び、Skyの同意UI、closed rubric、Evaluation Receiptまで実装した。API key、provider条件、料金上限、sandbox／本番受入は別の設定・外部gateとして残る。
- Skyの固定振り分けは既存12会話役とAMC計画管理1役の計13役。AMC（`rockstar-amc`）はLLMを呼ばない計画・手動記録Toolであり、model providerやLLM能力の追加ではない。ZemaでAMCへの依頼を送っても会話LLMを呼ばず、本人確認後のGoal保存と手動記録だけを既存WorkJobへ接続する。

## 2. 現在の構成

```text
Sky
  ├─ browser / PC / MCP Tool
  ├─ AMC ─────── 計画・手動記録（LLMなし、si実作業は未接続）
  ├─ 法務受付 ───── 端末内ガイド（標準） / OpenAI Responses API（明示許可時のみ）
  ├─ 特許アシスタント ─ 端末内ドラフト（標準） / OpenAI Responses API（明示許可時のみ）
  └─ Jev評価Tool ─── Vercel AI Gateway → TypeSafe AI Jev（実装済み・設定待ち）

Zema
  └─ 依頼 / 進捗 / 承認案内 / 停止 / 結果 / 履歴

Platform Core
  ├─ Broker ───── 唯一のidentity / capability / approval / policy判定
  ├─ Local si ─── plan候補だけを返す。network・Tool実行権限なし
  ├─ Engine ───── 検証済み有限recipeを実行
  └─ Job / Receipt / Artifact ─ 状態と証拠の正本
```

Sky Tool、model provider、実行場所、通信方式を同じ分類にしない。

| 項目 | 意味 | 例 |
| --- | --- | --- |
| surface | 利用者が能力を選ぶ場所 | Sky、Zema、native Core |
| tool | 利用者向けの限定能力 | 法務受付、特許アシスタント、Jev評価 |
| model role | modelへ許す責任 | local planner、cloud generator、remote evaluator |
| provider | 外部または端末内の供給元 | local runtime、OpenAI、TypeSafe AI via Vercel |
| runtime / transport | 実際の呼出し場所 | Android Binder、server-side fetch、AI Gateway API |
| status | 到達段階 | designed、implemented、configured、device-verified、production |

`ready` はSkyの商品UIが利用可能というcatalog状態であり、外部credential設定済み、provider到達確認済み、本番合格を意味しない。

## 2.1 共通Decision LayerとLocal Action Assistant

Local Qwenの端末実装には、[noellesugar99/local-action-assistant](https://github.com/noellesugar99/local-action-assistant)を採用候補として固定している。Rock側では上流commit、MITのアプリlicense、`llama.rn 0.12.9`、GGUF、Android package、主要ファイルhashを [`os/physical/local-action-assistant-source-lock.json`](../os/physical/local-action-assistant-source-lock.json) で管理する。これはQwen等を端末内で実行するruntime／Tool Brokerであり、Jevの代替モデルではない。

上流の責任分界はRockstarOSのLocal si境界と一致する。モデルは提案だけを返し、Toolは6個のclosed allowlist、引数検証、1回1Tool、書込前の本人確認を通る。アプリはクラウド推論・telemetry・モデル自動配布を持たず、release/local variantではnetworkを禁止する。モデル重みのlicenseはアプリのMIT licenseと別に扱う。[上流アーキテクチャ](https://github.com/noellesugar99/local-action-assistant/blob/main/docs/ARCHITECTURE.md)

Web／native共通の判断境界は [`lib/decision-layer.ts`](../lib/decision-layer.ts) の `DecisionProvider` に揃える。

| Provider | 役割 | 現在地 |
| --- | --- | --- |
| `RuleDecisionProvider` | deterministic fast path、不可逆操作のhard stop | 実装済み |
| `MockDecisionProvider` | provider未接続時のfixture／開発 | 実装済み |
| `LocalQwenDecisionProvider` | `local-action-assistant-binder-v2`へのadapter境界 | transport差替え可能。自動cloud fallbackなし |
| `TypeSafeJevProvider` | remote semantic routingのadapter | AI Gateway key／provider gate設定待ち |

Routerは、単純処理をCODEへ、高リスク／不可逆操作を本人確認へ、local-only要求をLocal Qwenへ、複雑かつremote許可済みの要求だけをJev／cloud候補へ送る。Local runtime未接続時に秘密データをcloudへ送らない。Jevのchoice結果も `advisory-only` であり、Brokerの権限、Wallet、MCP、Tool成功を決めない。

## 3. Local plannerの契約

2026-10-16のPixel実装は[署名済catalog・導入・再読込み・Jennifer有限計画](native-os-integration.md#pixel-local-jennifer)を既存v4 handoffへ接続する。Platform API v1とruntime Binder v4は別の版範囲。現在の候補はdebug-onlyの一modelで、production catalogは空、Pixel実推論は本人の再接続待ち。


現在のsource契約は `Sky selection → Zema request → Broker → Local AI plan-only API v4 → Broker validation → Engine → review`。`contracts/local-ai-runtime.json`を正本とし、9月のAPI v2実機証拠を現v4実機合格へ転用しない。transport識別子等に残るv2は互換IDとして扱い、実際に照合するAPI版と混ぜない。

Pixel si端末への組込みは[実装設計](native-os-integration.md#pixel-si専用端末の実装設計)のPX-VOICE/PX-LOCAL/PX-LINK/PX-JOBへ対応する。GrapheneOS SpeechServices v3のTTSと、ASR、会話LLM、Tool実行を分け、日本語ASR/TTSは未受入の不足とする。混合工程はmodel推論先/runner/root authorityを別々に固定し、realm間adapter受入前に利用可能と表示しない。

Local siは閉じたJSON Schemaへplan候補を返す。Brokerは次を再検査する。

1. Local si package、versionCode、signer、API version。
2. 選択token、owner、Tool ID / version、recipe。
3. planの未知field、step数、Tool identity、入力schema。
4. claim時の権限、generation、停止、資源条件。

LLMが返したTool名、成功、確率、説明を実行許可に変換しない。LLM障害時も履歴、停止、review、既存成果を失わない。再試行、確認待ち、成果保存の主体はAgent runtime / Broker / Engineであり、LLMではない。

現行証拠は試験署名APK、stock Pixel、固定model一構成の範囲である。AOSP image、production signer、SELinux enforcing、OTA、複数ModelProfile、起動後autoloadは別受入とする。

### Zema Webの有限local Agent（最新mainの別profile）

`lib/zema-local-agent.ts`と`/api/llm/local-agent`は、同じPCのOllama/OpenAI互換loopbackに限定した非信頼plannerを使う。閉じたJSON schema、最大3手、`sky_route`/`format_citations`/`coconala_check`だけを受け入れ、Tool結果・入力を命令として扱わない。shell、任意file、外部network、購入/投稿/送信/権限変更とCloud fallbackはない。local previewのqwen3:0.6b会話受入は本番公開・Tool選択品質・native Pixel受入と別。公開Workerは本人PCの127.0.0.1へ到達できず、companion/bridgeは未実装。local preview固定userはloopback hostだけに限定し、公開認証を迂回しない。model出力をBroker権限や未実行Tool成功へ昇格させない。

## SkyでmodelとAgent実行先を選ぶ

2026-10-15、本人はcloud Agentと端末内LLMの双方を使え、選択できること、そしてそのためにSkyがあると明示した。**Skyはmodel/Agent/Toolを探し、必要な能力を導入・接続し、実行先を選ぶ共通入口。** cloud固定や全機種local必須を製品方針にしない。先の専用端末設計の「cloudを標準候補」はこの明示判断で更新し、Pixel先行/iOS clientの提供順は維持する。これは既存registryを使う到達設計で、全選択肢の接続/実機/本番受入ではない。

### 二つの選択軸

- **modelの推論先**: 対応端末内の導入済みLLM、許可したPro/PC等の計算先、契約したcloud model。別PC/LANやcloudのendpointを「この端末内」と表示しない。互換APIのadapter名やregistryの`locality`値だけをデータ所在地の証明にしない。
- **Agentの実行先**: cloudで継続する仕事runner、対応端末の有限local runner。LLMは生成/計画の能力、Agentはその能力とToolを使い仕事を進める実行系で、同一のものとして選ばせない。cloud Agentから本人端末のLLMへ接続する構成には明示bridge/認証/到達性/停止/費用が必要で、cloudが端末のlocalhostへ到達できる前提にしない。

初期の理解しやすい選択は「端末内で処理」「cloudで処理」「工程ごとに明示して組合せ」。組合せはlocal草案→本人が選んだ部分だけcloud検査等の有限工程で表し、未接続の任意構成を実行可能にしない。LLMを使わない既存有限Toolも選べる。local planner/remote evaluatorの結果をBroker権限やTool成功へ昇格させない。

### Skyで確認してから使う

カード/詳細には作者・model/Agent/Toolの版、実行する実host、送信先と送信範囲、必要RAM/保存容量/対応runtime、license、準備状態、費用/見積と上限を示す。未導入、未接続、未対応、試験合格、本番受入を分け、選択肢は不足理由を示す。LLMを持たない利用者は受入済みcloudを選べ、対応Pixelでは検証済みmodel/runtimeを導入する選択もできる。

local導入は版/hash/信頼できる配布元/license/空き容量/対応性を検査し、download/検証/導入/利用可能/失敗を分ける。実行前はmodel読込みと熱/電池/資源上限を確認する。中断・容量不足・hash不一致で旧受入版を壊さず、削除時も既存成果を保持する。既存の固定GGUFと署名/manifest/Device Capabilityの仕組みを再利用し、任意binary取得やroot APIを増やさない。複数model導入と起動後autoloadは別受入のまま。

選択は設定上の希望と、そのJob/stepで確定した実行経路を分ける。Zema側の既存Job/step/Artifactへowner、実host、model/Agent/Tool版、入力digest/grant、見積/上限、承認対象を対応し、実行記録へ残す。保存した希望だけでdispatch/課金しない。切替時は互換性・送信条件・見積と必要な承認を再確認し、旧承認/実行をそのまま再利用しない。新しい万能Job状態や別の仕事DBを作らず、既存WorkJob四状態と工程記録を使う。

### 保存・停止・失敗・復旧

選んだ実行先が使えない時は理由を表示し、草案/仕事/成果を保持して停止・明示再試行・別経路の選び直しへ進む。local失敗からcloud、cloud失敗から別Providerへ黙って切り替えず、本文や費用を無断で増やさない。組合せの工程間でも同じowner/版/grantを再検査し、応答喪失は同じ実行IDを照合する。local保存とcloud同期は別操作、credentialは既存の保護された配置を維持する。

cloudは見積→予算予約→承認→実行→usage/Receipt照合、localは受入済み資源制限と停止を通す。「local」はmodel推論先の説明であり、すべてのToolや同期が無通信になるという保証にしない。必要な外部接続は別表示/同意する。iOSは受入済みclient能力だけを表示し、Pixelのlocal Binderやmodel搭載をiOSで利用可能とは表示しない。

### 現在地・担当・合格条件

`lib/llm-providers.ts`の6 adapter、Skyの既存provider/model選択、端末のLocal Action Assistant、Webの有限local Agentを再利用する。6定義は6接続の本番合格を意味せず、native bridge/公開Webから本人PCへの到達/複数model/全host共通の選択UIと版付きJob経路は追加受入が必要。既存の`defaultProvider: local-model`はsourceの初期値で、本人が全仕事でlocalを選んだ証拠ではない。paid cloud gateは閉じたまま。

主担当SKY07/SKY21（ROCK）、OS11/AI04がPixel導入と有限実行、WEB04が選択面、BIL02が費用、DOC04が設計同期を担う。最初は既存の一仕事と一つの検証済みlocal model/runtime・一つのcloud経路を比較対象にし、ROCKが資源/接続/費用の測定briefを提示する。OWNERが用途別の希望と外部送信/予算を選ぶ。

SC01は同じ対応仕事でlocal/cloudを選び準備状態と実hostを照合、SC02はlocal導入/改竄/容量/完全offline/再起動/削除、SC03はcloud見積/上限/同意/usage/停止、SC04は未接続/切断で無断fallbackなし、SC05は明示組合せの版/grant/予算/再送防止。全5件は未実行で、既存Pixel/eSIM/iOSの受入を兼ねたことにしない。

## 4. Skyの交換可能な文章モデル接続

Skyの文章生成は `lib/llm-providers.ts` のadapter registryを経由する。UIの「Skyの接続管理 → Providerルーティング → 文章・LLM」でproviderとmodel IDを選べる。現在のadapterは次の6種類である。

| adapter | 実行場所 | 用途 |
| --- | --- | --- |
| `local-model` | Local Action Assistant / Qwen Binder | 端末内planner。Webから直接呼ばず、native bridgeが必要 |
| `ollama` | Ollama | Qwen、Llama、Gemma等のローカルHTTPモデル |
| `openai` | OpenAI Responses API | server-sideの文章生成と、法務・特許の公式検索 |
| `anthropic` | Anthropic Messages API | Claude系の文章生成 |
| `google` | Gemini Generative Language API | Gemini系の文章生成 |
| `openai-compatible` | LM Studio、llama.cpp、vLLM等 | Chat Completions互換の任意runtime |

APIキーやendpointはブラウザ・D1へ保存せず、server environmentだけで設定する。`local-model`を使えない場合にcloudへ黙ってfallbackせず、`LOCAL_LLM_BRIDGE_REQUIRED`として停止する。remote providerはrequestごとの同意と `SKY_REMOTE_LLM_ENABLED=true` の両方が必要である。法務受付・特許アシスタントの標準経路は引き続き端末内の決定的ガイド／ドラフトであり、provider registryは将来の一般文章生成と明示的なremote経路に使う。

文章モデルadapterはOpenAIのusage（入力・出力・合計・cache token）を妥当性確認して返し、処理時間を計測する。usage未提供はnullで、費用を推定しない。Provider資格情報のredirect転送を拒否し、timeout=504／transport・不正JSON・未完了応答=502を区別する。失敗時の自動再送は行わない。本文やAPIキーの新規保存なし。9件のfixtureは合格、実Provider接続と料金照合は未実施。

[利用量契約の公式資料](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。このusageはAPI応答であり、D1履歴やProvider請求書との照合は未実装。

### 文章生成の完了判定（2026-10-11）

ROCKの共通adapterは非streaming応答に文章が存在するだけで成功を返さない。Ollamaは`done: true`と`done_reason: stop`、Anthropicは`stop_reason: end_turn | stop_sequence`、Geminiは各candidateの`finishReason: STOP`、local bridgeとOpenAI互換Chat Completionsは各choiceの`finish_reason: stop`を要求する。欠落・不正型・上限打切り・filter・Tool待ちの理由は`INCOMPLETE_RESPONSE`（502）とする。成功理由と矛盾する未処理Tool callも文章成功へ変換しない。任意のTool配列の省略／null／空配列は許容する。

Ollamaへは既存の1〜8,000 token上限を`options.num_predict`として送信し、runtime既定の無制限生成へ任せない。完了失敗時も自動再送・cloud fallback・Tool実行・本文の新規保存は行わず、既存の同意と予算条件で利用者が再試行を判断する。OpenAI Responsesの`status`は公式SDK schemaでoptionalのため、既存の未報告=nullを保持する。明示された非`completed`は拒否し、streamingでは`response.completed` eventが必要である。この未報告値を完了receipt／料金照合の根拠へ補完しない。

合格条件は全adapterの途中出力・欠落理由・pending Toolの拒否、正常stop／stop sequenceとoptional defaultの維持、Ollama上限の一致、失敗時の送信1回。`tests/llm-completion-boundary.test.mjs`と`tests/llm-providers.test.mjs`で検証する。Provider実接続、モデル品質、料金照合、native実機は別受入とする。

仕様根拠（2026-10-11確認）: [Ollama chat](https://docs.ollama.com/api/chat)、[Ollama num_predict](https://docs.ollama.com/modelfile)、[Claude stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons)、[Gemini candidate/finish reason](https://ai.google.dev/api/generate-content#v1beta.Candidate)、[OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)、[OpenAI Responses optional status](https://developers.openai.com/api/reference/python/resources/responses/methods/create)。

### OpenAI

OpenAIへの接続は次の2 Toolの任意オンライン検索だけである。標準では呼び出さない。

| Sky Tool | route | 用途 | 停止時 |
| --- | --- | --- | --- |
| 法務受付 | `app/api/legal-guidance/route.ts` | 本人が許可した場合の公式情報検索 | 標準は端末内ガイド。許可時のみ503へ縮退 |
| 特許アシスタント | `app/api/patent-research/route.ts` | 本人が許可した場合の先行技術候補検索 | 標準は端末内ドラフト。許可時のみ503へ縮退 |

どちらもserver-sideの `OPENAI_API_KEY` を使い、`lib/research-ai.ts` の共通transportからOpenAI Responses APIへ直接`fetch`する。`ai` packageの存在だけからVercel AI SDK推論を実装済みと判定しない。`store: false` はrequest optionであり、Zero Data Retention契約の証明ではない。

共通化するのは固定endpointへの送信、HTTP失敗の扱い、引用付き本文の解析だけである。本人認証・same-origin・利用上限、remote有効化、法務の緊急案内、入力上限（法務4,000文字／特許12,000文字）、固有の案内文は各routeに残す。質問の組立、モデル設定、出力token数、検索回数、公式domainのallowlistも各Toolが持つ。引用はToolごとの公式domainまたはそのsubdomainに属する絶対HTTPS URLだけを表示し、userinfo、標準以外のport、制御文字、曖昧なURLを拒否する。回答または有効な引用がなければ `UNCITED_RESPONSE` とする。JSONを取得できた上流HTTPエラーは502、通信・JSON・回答解析の失敗は既存どおり一般入力エラー400へ縮退し、上流本文は利用者へ返さない。

### Jev

JevはTypeSafe AIのSystem One評価モデルで、typed questionに対するchoice、score、boolean probabilityを返す。初期用途を次に限定する。

1. 本人がSkyで評価対象を選び、送信内容、provider、料金状態を確認する。
2. server側で登録済みrubric IDをclosed question setへ解決する。
3. 同意済み・最小化済みの`state`だけをJevへ送る。
4. typed answerとprovider metadataを検証し、Evaluation Receiptを返す。
5. Zemaは結果を「外部評価」と表示する。Brokerは結果を権限、承認、Tool成功へ昇格させない。

JevをSkyの全依頼へ自動適用しない。決定的な既存routingは残し、未知依頼をJevが分類しても候補表示までにする。local不足時の自動fallback、Legal / Patent原文の自動送信、外部writeの自動承認には使わない。

評価routeと `lib/decision-layer.ts` のJev adapterは、`lib/jev-transport.ts` だけを共通のAI Gateway呼出し口とする。model、server-side Authorization、`maxRetries: 0`、`zeroDataRetention: true`を一か所で固定し、試験時は送信関数を差し替える。評価用とrouting用のrubric、同意・privacy・hard stop、応答の解釈、receiptと `advisory-only` の責任は呼出し側に残す。別PRの公式TypeSafe API直結・Android provider・Agent Control Planeを取り込んだ状態ではなく、それらを接続するときもprovider固有の契約と受入を維持する。

## 5. Jev API契約

初期request案:

```json
{
  "schemaVersion": 1,
  "requestId": "client-generated-id",
  "rubricId": "sky-output-quality-v1",
  "state": "本人が確認した最小評価対象",
  "consent": {
    "provider": "typesafe-ai-via-vercel-ai-gateway",
    "approved": true,
    "approvedAt": "RFC3339 timestamp"
  }
}
```

`state` は初期4,000文字以下、rubricはserver allowlist、question数とtypeは固定する。利用者が任意instructions、model ID、provider、callback URLをrequestから注入できないようにする。

response / receipt案:

```json
{
  "schemaVersion": 1,
  "requestId": "client-generated-id",
  "status": "evaluated",
  "model": "typesafe-ai/jev",
  "rubricId": "sky-output-quality-v1",
  "rubricHash": "sha256:...",
  "stateHash": "sha256:...",
  "answers": {},
  "evaluatedAt": "RFC3339 timestamp",
  "authority": "advisory-only"
}
```

Receipt生成時にもclosed rubricを検査する。`grounded`・`safe`は型がbooleanで確率0〜1、`usefulness`は型がscoreで有限の0〜2（SDKの3段階criteriaのゼロ始まり位置）を必須とする。欠落・余分な回答ID・型違い・範囲外は`INVALID_RESPONSE`で拒否する。返す回答は検証した3つのscalarだけへ投影し、Providerが加えた本文・metadata・確率分布は保存・表示しない。usageは欠落をnullに保ち、存在するtoken数の非負整数・加算の安全性・合計との整合を検査する。usageは請求書や精算の証拠ではない。共通Jev transportは20秒のabortと自動再送0回を固定し、timeoutを評価成功にしない。adapterがabortを無視してもローカル待機を終了し、遅い結果をReceiptへ採用しない。timeoutはHTTP 504で返し、送信後に処理がなかったとは表示しない。fixtureは`tests/jev-receipt-boundary.test.mjs`・`tests/jev-transport.test.mjs`で検証する。Provider実接続と料金gateは別受入のまま維持する。

仕事本文をreceiptへ保存しない。保存する場合もowner、用途、保持期限、削除、export、provider送信同意を別途実装する。`unavailable`、`invalid_response`、`denied`、`budget_exceeded`を`evaluated`や合格へ読み替えない。

## 6. Privacy・料金・運用gate

Jev呼出しにはリクエスト単位の`zeroDataRetention: true`を指定するが、providerの利用条件・保持・学習利用・地域・削除経路の確認を代替しない。そのため初期状態では、個人情報、法務相談、未公開発明、credential、秘密鍵、契約原文、顧客原稿を送らない。Provider Terms / Privacy、Gatewayログ、retention、学習利用、地域、削除経路を確認してから用途を拡張する。

同ページのFree表示は恒久価格として固定せず、2026-09-25終了予定のpromotional pricingとして扱う。無料を前提に本番flowへ必須化しない。request上限、日次・月次budget、timeout、circuit breaker、費用表示を先に実装する。

秘密値は `AI_GATEWAY_API_KEY` とし、client、Git、receipt、ログへ出さない。Vercel以外で配備する場合もserver-side secretとして設定する。`OPENAI_API_KEY`と共有しない。リモート呼出しは `SKY_REMOTE_LLM_ENABLED=true` を別途設定した環境だけで有効にし、未設定時は法務・特許・Jevを端末内／手動確認へ縮退する。

## 7. 実装順と受入条件

### AI07-A: SDK / API互換fixture

- `ai@7.0.107` と `experimental_evaluate` を固定し、AI Gatewayのserver-side Authorization header経路を実装する。
- Node 22 / Cloudflare runtimeでboolean、choice、score、parallel questionをfixture検証する。
- timeout、429、5xx、不正answer、欠落answer、費用上限をfail-closedで確認する。
- API keyなしの状態を通常の`unavailable`として扱い、既存Skyを壊さない。

### AI07-B: Sky評価Tool

- catalogへJev評価Toolを追加し、route、同意UI、rubric allowlist、receipt、テストを同じcommitへ揃えた。`ready`はUIと安全な縮退経路の状態で、credential設定済みやprovider本番合格を意味しない。
- `ready`にするのは、credentialなしの縮退、provider sandbox、privacy表示、budget制限を受け入れた後。
- Legal / PatentのOpenAI接続とは別runner、別environment表示、別provider consentにする。

### AI07-C: 任意の品質評価

- deterministic validation合格後の成果だけを対象にする。
- Jev不合格や低確率は本人へのreview signalにできるが、既存成果を削除・非公開化・再実行しない。
- 自動gateへ使う場合はgolden fixture、誤判定率、threshold版、再現性、human override、rollbackを別受入する。

## 8. 完了と呼ばない範囲

Jevのroute、UI、catalog、rubric、receiptは実装済みである。ただしAPI key設定、provider sandbox、privacy審査、料金上限、本番受入は未完了で、Jevを追加してもlocal plannerの交換、Sky Memory、外部作用reconciliation、AOSP imageは完成しない。

## 9. 参照

- [Vercel AI Gateway — Jev](https://vercel.com/ai-gateway/models/jev)
- [Vercel AI Gateway Evaluation Quickstart](https://vercel.com/docs/ai-gateway/getting-started/evaluation)
- [siネイティブOS共通設計](ai-native-os-architecture.md)
- [Platform Core](platform-core.md)
- [Local si実機統合](local-ai-os-integration-20260915.md)
- [Sky](sky.md)


## Agent Control Plane — 2026-09-27 runtime slice

The **Agent Control Plane** preserves an advisory software-engineering adapter and an authenticated deterministic preview without promoting any model to an authority role. As of the 2026-10-05 integration, its public route accepts `dryRun: true` only: pricing, durable owner budget reservations, idempotent dispatch and Provider usage receipts have not been integrated, so it does not construct a Jev or Cursor client. Environment flags and PR-only approval cannot enable remote execution.

The implementation lives in `lib/agent-control-plane.ts` with the authenticated entry point `app/api/agent-control-plane/route.ts`. Injected adapter tests cover deterministic gates, optional Jev workflow advice and a bounded Cursor Cloud Agent request. Repository policy and owner approval remain authoritative; those tests are not live dispatch or billing acceptance.

Jev is used only for public-class task metadata with explicit per-task decision consent. The state sent to Jev is minimized to title, risk/effect class, acceptance-criteria count, allowed-path count, and the pstack preference. The full task body, owner-private data, confidential data, secrets, credentials, wallet state, and production authority are not sent by this adapter. Jev remains `advisory-only`; its choice can be made stricter by deterministic policy and can never lower the required review level, grant permissions, merge code, deploy, move funds, rotate credentials, or approve destructive work.

Cursor Cloud Agents are used only after the deterministic execution gate passes. Repository writes require explicit `repository-pr-only` approval, and the worker prompt requires an isolated branch/workspace, a pull request, repository tests, independent verification, no direct main push, no merge, no production deployment, no real-money operation, no credential mutation, and no destructive action. High-risk work is clamped to a security review and a maximum of two workers. Critical-risk, any non-public data class, production-deploy, financial-transaction, credential-change, and destructive-operation requests fail closed instead of launching a cloud coding agent.

This slice does not mean that the whole Decision Fabric is runtime-complete. The generic Sky-wide `DecisionRouter` composition, Local Qwen Web/native bridge, live Cursor credential acceptance, pstack account installation, Grok Bot programmatic handoff, provider calibration, and production acceptance remain separate work. The existing `DESIGN_APPROVED_IMPLEMENTATION_PENDING` Decision Fabric status therefore remains unchanged.

Sky/Zemaの決定的routingはAMCのGoal・部隊管理役を加えた13役。AMCの指示照合はモデルの出力を権限とせず、信頼できる観測と担当認証が必要。Web観測adapter未接続時は着手・検収を拒否する。


## avokado専用モデルの研究工程（2026-10-05）

利用者指定により、ゼロから事前学習する自作モデルを端末内とcloudに使う研究工程を追加。追加費用0の小型host試作を実装した。既存Qwen実機受入とは別で、既存profileを置換していない。 詳細・責任・入出力・状態・保存・復旧・承認・合格条件は[専用モデル事前学習設計](avokado-llm-pretraining.md)を参照。

## 作業別のモデル自動選択（2026-10-17）

本人の明示変更「LLMを選べるように、デフォルトは作業に合うものを自動選択」により、Skyの会話モデルは自動を初期値とし、手動Provider/モデルID指定を残す。Codex専用の契約ではない。Toolの自動ルーティングとモデル選択は別で、Agent配置・権限・料金承認をモデル選択から昇格させない。

入力は依頼文と保存済み選択モード。サーバーで本人・利用権を確認し、設定済みloopbackのモデル一覧（Ollama tags / OpenAI互換models）を読み取る。モデル一覧にある候補のうちコード作業ならcoder系、その他なら一般系を優先する決定的な初期ヒューリスティック。性能比較による「世界で一番」の実証ではない。返すProvider/モデルID/理由を当該依頼に固定し、会話モデル設定に表示する。自動選択に失敗したら依頼文を保持し、接続設定後に再送する。別Providerへの実行時フォールバックは行わない。

無料枠のみという現在の条件では自動対象をローカルに限定。Cloudの資格情報・無料利用権・料金契約は未確認で、自動Cloud送信は未受入。手動のOpenAI/Anthropic/Google/互換接続先とモデルIDは選択できるが、実行の料金gate・同意・対応coordinatorは別条件である。Cloud実利用が有効になる場合も既存Sky140の予約/確定usage/$100停止を経由し、選択API自体は予算や請求を変更しない。

選択モードと手動指定は既存provider draftへ本人別保存し、選択理由は画面内のみ。資格情報は応答・ログに出さない。一覧取得は2.5秒で停止し、redirectを拒否。未接続/不正一覧は候補に加えない。主担当Web/Sky（ROCK、SKY07）、Cloud利用権はEXTERNAL/OWNER、料金境界BIL02はJOINT。合格条件は作業別選択、一覧由来の候補のみ、未接続停止、外部URL除外、手動指定維持、型・全体試験。Cloud能力比較と無料利用権の接続は未解決で、確認済みの契約ごとに追加する。

実装: `lib/sky-model-routing.ts`、`app/api/llm/select/route.ts`、`components/sky-chat-workspace.tsx`。試験: `tests/sky-model-routing.test.mjs`。


## 無料Cloud拡張の途中保存（2026-10-17）

本人の「Cloudも自動選択、無料枠で実応答検証」に基づきSKY07/ROCKを主担当、BIL02/JOINTの既存契約停止に接続する試作を追加。続く「ここまでをGitへ」により途中保存する。`lib/sky-free-cloud.ts` はPollinations Classicの匿名モデル一覧を取得し、同意・owner限定flag・有効なSandboxプランを確認して一回だけ送信する。入力は依頼ID/本文/選択モデル、出力は本文/Provider参照/実token usage/無料費用0。既存workStoreの本人別保存・revision CASとworkflowのreview状態を使い、独立した金銭台帳は作らない。資格情報・Wallet・x402支払い・有料APIへのfallbackは使わず、402/429・欠落usage・未知の完了はunconfirmedに保持して再送しない。モデル結果はTool成功や本人の承認に昇格させない。

公式仕様 https://raw.githubusercontent.com/pollinations/pollinations/master/APIDOCS.md は無料/匿名・30秒間隔・best effortを記載。2026-10-17の実モデル一覧はopenai-fast（GPT-OSS 20B）。実POSTは1件行ったが完了/usageの厳密検査で停止したため、実応答受入は未合格。これはProviderへの接続と完了を区別する記録。次はProvider実応答形式の確認、使用量整合、select APIと会話UIのCloud同意/実行配線、100 USD停止/並列/再送試験、認証済みUI受入。API/画面へのCloud候補接続はまだない。`tests/sky-free-cloud.test.mjs`の合成試験を実応答成功に転用しない。本番課金・公開gateは閉じたまま。


## 無料Cloudの自動選択と実応答受入（2026-10-17）

本人の継続指示により、前項の途中保存からCloud候補・実行API・画面を接続した。`tool_calls: []`をTool実行と誤判定した原因を修正し、匿名tier/stop/本文/Provider ID/実token usageの整合を確認する。非空Tool呼出し・usage欠落・有料tierは拒否する。

`selectSkyModel`はローカル一覧に、本人がCloud送信に同意し、owner限定flagと既存Sky140契約の有効性・残り枠を満たすときだけ公式匿名Cloud一覧を加える。選択はコード向け/一般向けの初期ヒューリスティック。現在の匿名Cloud候補は1モデルで、複数Cloud間の最適性能を実証した意味ではない。会話のチェックボックスはその会話画面内だけ保持し、送信するのは現在の依頼文のみ（過去会話/Tool成果を追加しない）。手動指定にも同じ無料coordinatorを使い、既存有料料金gateは開けない。

入力は依頼ID・選択モデル・本文・同意。`/api/llm/free-cloud`は既存認証・origin/rate limit・service scopeを通す。owner限定環境変数 `SKY_FREE_CLOUD_ENABLED=true` / `SKY_FREE_CLOUD_OWNER_ID` と既存Sandbox契約が必要。送信直前にもプランを確認し、$100枠到達や未払い時に停止する。workflowの本人別仕事とrevision CASを一回送信の根拠にし、Provider参照・本文・token usage・費用0を保存する。モデル結果はreviewに留めて本人承認やTool成功へ昇格しない。無料0円の試験で$100を実消費したとしない。

402/429、タイムアウト、usage欠落、保存競合では結果未確認を保持し、同じIDでは再送しない。画面の「新しい依頼」で本人が明示的に再試行する。x402支払い、Wallet接続、クレジット購入、有料APIへのfallbackは実装しない。無料プランはbest effort/待機制限あり。

`/sky/free-cloud`は共通React確認画面。`node --experimental-strip-types scripts/sky-free-cloud-preview.mjs`は127.0.0.1:5227限定で同じReact panel/selector/HTTP handlerを動かすMac専用harness。合成Sandbox契約をGit管理外SQLiteへ置き、Host/Origin/HttpOnlyセッションcookieでPOSTを制限し、Stripeには接続しない。実Cloudの応答「2 + 3 は 5 です。」、入力331/出力118 tokens、無料$0.00をブラウザで確認。同一依頼再押下の追加POST0。証拠は `docs/evidence/sky-free-cloud-live.json`。認証済み本体会話UIはcomponent回帰で確認、実パスキーsessionでの受入は別条件。

主担当SKY07/ROCK、BIL02/JOINT。`tests/sky-free-cloud.test.mjs` は未払い、$100予約到達、同意なし/別owner、並列一回送信、未知結果の再送防止を確認し、`tests/sky-chat-session-recovery.test.mjs` は会話から無料APIへの同意付きUUID送信と表示を確認する。Cloud利用権/匿名APIの提供継続はEXTERNAL、実アカウントのパスキーはOWNER。一般公開/本番課金のgateは別受入を必要とする。
