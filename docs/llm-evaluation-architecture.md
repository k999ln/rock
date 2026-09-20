# avocadoOS — LLM・評価モデル設計

更新日: 2026-09-20。対象: `avocadoOS 1.0` / `dev.rock`。

この文書は、端末内LLM、Sky内の交換可能な文章モデル接続、Jev評価モデル、Broker／Engineの責任を分ける正本である。機械可読の現在地は [`data/llm-capabilities.json`](../data/llm-capabilities.json)、共通Coreの到達設計は [AIネイティブOS共通設計](ai-native-os-architecture.md)を参照する。

## 1. 結論

- 現行の端末内LLMは、Pixel 10上の `Qwen3-0.6B Q8_0` と `llama.rn 0.12.9` による固定profileの試験署名APK実証である。交換可能な複数profileやOS image搭載は未実装。
- 端末内LLMは**非信頼planner**である。Toolを実行せず、許可を発行せず、台帳や仕事状態を書き換えない。
- Brokerが唯一の実行権限判定者、Engineが検証済みToolの決定論的実行者、Zemaが依頼・進捗・承認・停止・結果の窓口である。
- WebのOpenAI接続はSkyの `法務受付` と `特許アシスタント` のオンライン検索オプション内部だけにある。標準経路は端末内の決定論的ガイド／ドラフトで、通信断時もSkyの受付・整理・引継ぎを止めない。
- Jev (`typesafe-ai/jev`) はTypeSafe AIのremote評価モデルである。端末内modelや汎用文章生成modelに数えない。
- JevはSkyから本人が明示的に使う**任意の評価Tool**として導入する。結果は助言・品質証拠であり、Brokerの権限判定、本人承認、Tool成功、仕事完了を置き換えない。
- Jev runtimeの状態は `implemented_configuration_required`。`ai@7.0.107` の `experimental_evaluate` をserver-side routeから呼び、Skyの同意UI、closed rubric、Evaluation Receiptまで実装した。API key、provider条件、料金上限、sandbox／本番受入は別の設定・外部gateとして残る。

## 2. 現在の構成

```text
Sky
  ├─ browser / PC / MCP Tool
  ├─ 法務受付 ───── 端末内ガイド（標準） / OpenAI Responses API（明示許可時のみ）
  ├─ 特許アシスタント ─ 端末内ドラフト（標準） / OpenAI Responses API（明示許可時のみ）
  └─ Jev評価Tool ─── Vercel AI Gateway → TypeSafe AI Jev（実装済み・設定待ち）

Zema
  └─ 依頼 / 進捗 / 承認案内 / 停止 / 結果 / 履歴

Platform Core
  ├─ Broker ───── 唯一のidentity / capability / approval / policy判定
  ├─ Local AI ─── plan候補だけを返す。network・Tool実行権限なし
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

上流の責任分界はRockstarOSのLocal AI境界と一致する。モデルは提案だけを返し、Toolは6個のclosed allowlist、引数検証、1回1Tool、書込前の本人確認を通る。アプリはクラウド推論・telemetry・モデル自動配布を持たず、release/local variantではnetworkを禁止する。モデル重みのlicenseはアプリのMIT licenseと別に扱う。[上流アーキテクチャ](https://github.com/noellesugar99/local-action-assistant/blob/main/docs/ARCHITECTURE.md)

Web／native共通の判断境界は [`lib/decision-layer.ts`](../lib/decision-layer.ts) の `DecisionProvider` に揃える。

| Provider | 役割 | 現在地 |
| --- | --- | --- |
| `RuleDecisionProvider` | deterministic fast path、不可逆操作のhard stop | 実装済み |
| `MockDecisionProvider` | provider未接続時のfixture／開発 | 実装済み |
| `LocalQwenDecisionProvider` | `local-action-assistant-binder-v2`へのadapter境界 | transport差替え可能。自動cloud fallbackなし |
| `TypeSafeJevProvider` | remote semantic routingのadapter | AI Gateway key／provider gate設定待ち |

Routerは、単純処理をCODEへ、高リスク／不可逆操作を本人確認へ、local-only要求をLocal Qwenへ、複雑かつremote許可済みの要求だけをJev／cloud候補へ送る。Local runtime未接続時に秘密データをcloudへ送らない。Jevのchoice結果も `advisory-only` であり、Brokerの権限、Wallet、MCP、Tool成功を決めない。

## 3. Local plannerの契約

現在の経路は `Sky selection → Zema request → Broker → Local AI plan-only API v2 → Broker validation → Engine → review` である。

Local AIは閉じたJSON Schemaへplan候補を返す。Brokerは次を再検査する。

1. Local AI package、versionCode、signer、API version。
2. 選択token、owner、Tool ID / version、recipe。
3. planの未知field、step数、Tool identity、入力schema。
4. claim時の権限、generation、停止、資源条件。

LLMが返したTool名、成功、確率、説明を実行許可に変換しない。LLM障害時も履歴、停止、review、既存成果を失わない。再試行、確認待ち、成果保存の主体はAgent runtime / Broker / Engineであり、LLMではない。

現行証拠は試験署名APK、stock Pixel、固定model一構成の範囲である。AOSP image、production signer、SELinux enforcing、OTA、複数ModelProfile、起動後autoloadは別受入とする。

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

### OpenAI

OpenAIへの接続は次の2 Toolの任意オンライン検索だけである。標準では呼び出さない。

| Sky Tool | route | 用途 | 停止時 |
| --- | --- | --- | --- |
| 法務受付 | `app/api/legal-guidance/route.ts` | 本人が許可した場合の公式情報検索 | 標準は端末内ガイド。許可時のみ503へ縮退 |
| 特許アシスタント | `app/api/patent-research/route.ts` | 本人が許可した場合の先行技術候補検索 | 標準は端末内ドラフト。許可時のみ503へ縮退 |

どちらもserver-sideの `OPENAI_API_KEY` を使い、現在はOpenAI Responses APIへの直接`fetch`である。`ai` packageの存在だけからVercel AI SDK推論を実装済みと判定しない。`store: false` はrequest optionであり、Zero Data Retention契約の証明ではない。

### Jev

JevはTypeSafe AIのSystem One評価モデルで、typed questionに対するchoice、score、boolean probabilityを返す。初期用途を次に限定する。

1. 本人がSkyで評価対象を選び、送信内容、provider、料金状態を確認する。
2. server側で登録済みrubric IDをclosed question setへ解決する。
3. 同意済み・最小化済みの`state`だけをJevへ送る。
4. typed answerとprovider metadataを検証し、Evaluation Receiptを返す。
5. Zemaは結果を「外部評価」と表示する。Brokerは結果を権限、承認、Tool成功へ昇格させない。

JevをSkyの全依頼へ自動適用しない。決定的な既存routingは残し、未知依頼をJevが分類しても候補表示までにする。local不足時の自動fallback、Legal / Patent原文の自動送信、外部writeの自動承認には使わない。

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
- [AIネイティブOS共通設計](ai-native-os-architecture.md)
- [Platform Core](platform-core.md)
- [Local AI実機統合](local-ai-os-integration-20260915.md)
- [Sky](sky.md)
