# avocadoOS — LLM・評価モデル設計

更新日: 2026-09-19。対象: `avocadoOS 1.0` / `dev.rock`。

この文書は、端末内LLM、Sky内のcloud model接続、Jev評価モデル、Broker／Engineの責任を分ける正本である。機械可読の現在地は [`data/llm-capabilities.json`](../data/llm-capabilities.json)、共通Coreの到達設計は [AIネイティブOS共通設計](ai-native-os-architecture.md)を参照する。

## 1. 結論

- 現行の端末内LLMは、Pixel 10上の `Qwen3-0.6B Q8_0` と `llama.rn 0.12.9` による固定profileの試験署名APK実証である。交換可能な複数profileやOS image搭載は未実装。
- 端末内LLMは**非信頼planner**である。Toolを実行せず、許可を発行せず、台帳や仕事状態を書き換えない。
- Brokerが唯一の実行権限判定者、Engineが検証済みToolの決定論的実行者、Zemaが依頼・進捗・承認・停止・結果の窓口である。
- WebのOpenAI接続はSkyの `法務受付` と `特許出願アシスタント` の2 Tool内部だけにある。OS全体のcloud LLM層や端末内LLMの自動fallbackではない。
- Jev (`typesafe-ai/jev`) はTypeSafe AIのremote評価モデルである。端末内modelや汎用文章生成modelに数えない。
- JevはSkyから本人が明示的に使う**任意の評価Tool**として導入する。結果は助言・品質証拠であり、Brokerの権限判定、本人承認、Tool成功、仕事完了を置き換えない。
- Jev runtimeの状態は `designed_not_implemented`。現在の `ai@7.0.99` は実行時に `experimental_evaluate` をexportしていないため、SDK更新または公式HTTP API採用を互換試験後に選ぶ。

## 2. 現在の構成

```text
Sky
  ├─ browser / PC / MCP Tool
  ├─ 法務受付 ───── OpenAI Responses API（任意、未設定時503）
  ├─ 特許アシスタント ─ OpenAI Responses API（明示同意後、未設定時503）
  └─ Jev評価Tool ─── Vercel AI Gateway → TypeSafe AI Jev（設計済み・未実装）

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

## 3. Local plannerの契約

現在の経路は `Sky selection → Zema request → Broker → Local AI plan-only API v2 → Broker validation → Engine → review` である。

Local AIは閉じたJSON Schemaへplan候補を返す。Brokerは次を再検査する。

1. Local AI package、versionCode、signer、API version。
2. 選択token、owner、Tool ID / version、recipe。
3. planの未知field、step数、Tool identity、入力schema。
4. claim時の権限、generation、停止、資源条件。

LLMが返したTool名、成功、確率、説明を実行許可に変換しない。LLM障害時も履歴、停止、review、既存成果を失わない。再試行、確認待ち、成果保存の主体はAgent runtime / Broker / Engineであり、LLMではない。

現行証拠は試験署名APK、stock Pixel、固定model一構成の範囲である。AOSP image、production signer、SELinux enforcing、OTA、複数ModelProfile、起動後autoloadは別受入とする。

## 4. Skyのcloud model接続

### OpenAI

OpenAIへの接続は次の2 Toolだけである。

| Sky Tool | route | 用途 | 停止時 |
| --- | --- | --- | --- |
| 法務受付 | `app/api/legal-guidance/route.ts` | 公式情報に限定した一般案内 | 503。公的案内と弁護士導線は継続 |
| 特許出願アシスタント | `app/api/patent-research/route.ts` | 先行技術候補と予備評価 | 503。検索式とbrowser内draftは継続 |

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

2026-09-19時点のVercel model pageでは、Jev provider行のZDRとNo Training表示を確認できない。そのため初期状態では、個人情報、法務相談、未公開発明、credential、秘密鍵、契約原文、顧客原稿を送らない。Provider Terms / Privacy、Gatewayログ、retention、学習利用、地域、削除経路を確認してから用途を拡張する。

同ページのFree表示は恒久価格として固定せず、2026-09-25終了予定のpromotional pricingとして扱う。無料を前提に本番flowへ必須化しない。request上限、日次・月次budget、timeout、circuit breaker、費用表示を先に実装する。

秘密値は `AI_GATEWAY_API_KEY` とし、client、Git、receipt、ログへ出さない。Vercel以外で配備する場合もserver-side secretとして設定する。`OPENAI_API_KEY`と共有しない。

## 7. 実装順と受入条件

### AI07-A: SDK / API互換fixture

- `ai` packageの候補versionまたは公式HTTP Evaluation APIを固定する。
- Node 22 / Cloudflare runtimeでboolean、choice、score、parallel questionをfixture検証する。
- timeout、429、5xx、不正answer、欠落answer、費用上限をfail-closedで確認する。
- API keyなしの状態を通常の`unavailable`として扱い、既存Skyを壊さない。

### AI07-B: Sky評価Tool

- catalogへJev評価Toolを追加するのはroute、同意UI、rubric allowlist、receipt、テストが同じcommitで揃った時だけ。
- `ready`にするのは、credentialなしの縮退、provider sandbox、privacy表示、budget制限を受け入れた後。
- Legal / PatentのOpenAI接続とは別runner、別environment表示、別provider consentにする。

### AI07-C: 任意の品質評価

- deterministic validation合格後の成果だけを対象にする。
- Jev不合格や低確率は本人へのreview signalにできるが、既存成果を削除・非公開化・再実行しない。
- 自動gateへ使う場合はgolden fixture、誤判定率、threshold版、再現性、human override、rollbackを別受入する。

## 8. 完了と呼ばない範囲

この設計書と能力表の保存はJev接続完了ではない。API key作成、SDK更新、route、UI、catalog登録、provider sandbox、privacy審査、料金上限、本番受入は未実施である。Jevを追加してもlocal plannerの交換、Sky Memory、外部作用reconciliation、AOSP imageは完成しない。

## 9. 参照

- [Vercel AI Gateway — Jev](https://vercel.com/ai-gateway/models/jev)
- [Vercel AI Gateway Evaluation Quickstart](https://vercel.com/docs/ai-gateway/getting-started/evaluation)
- [AIネイティブOS共通設計](ai-native-os-architecture.md)
- [Platform Core](platform-core.md)
- [Local AI実機統合](local-ai-os-integration-20260915.md)
- [Sky](sky.md)
