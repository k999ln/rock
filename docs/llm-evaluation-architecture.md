# RockstarOS — LLM・評価モデル設計

更新日: 2026-10-17（Pixelのモデル選択と公開モデル検索を実装）。対象: `RockstarOS 1.0` / `dev.rock`。

この文書は、端末内LLM、Sky内の交換可能な文章モデル接続、Jev評価モデル、Broker／Engineの責任を分ける正本である。機械可読の現在地は [`data/llm-capabilities.json`](../data/llm-capabilities.json)、共通Coreの到達設計は [siネイティブOS共通設計](ai-native-os-architecture.md)を参照する。

## 1. 結論

- 現行の端末内LLMはPixel 10の署名済2 profile（Qwen2.5 1.5B / Qwen3 0.6B）と `llama.rn 0.12.9` / Binder v4を使うDeveloper Preview APK。手動指定と記事準備向け自動選択を実装した。全OS image搭載と一般品質は未受入。
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

<a id="selectable-models-and-automatic-default"></a>

## LLMの明示選択と、作業に応じる自動選択

2026-10-17、本人が「Codex経由しか使えない形にせずLLMを選べるように、defaultは作業に一番良いものを自動で選ぶ」と指示。これを次の実装要件として記録する。現在のPixelはCodex loginを使わない端末内Qwenの有限Tool経路を持ち、Webに6 provider adapterがあるが、選択肢の登録を接続・credential・本番利用可能と扱わない。AMCの一部実作業はCodex CLIへの個別引渡しであり、任意LLMと同等のTool実行を持つわけではない。

model推論先とAgent/Tool runnerを分離する。PixelのHomeの通常値は「自動」、LLM名の手動指定は別の選択として実装した。候補のready状態、対応作業/入出力、privacy/外部送信許可、必要資源、事前見積/予算で適合候補を選び、理由と実際に使うmodel/hostを実行前に表示する。「世界で一番優れる」という未検証の保証をしない。手動指定を黙って別modelへ替えず、実行中の無断fallback、未導入weightの無断取得、Codex/OAuth sessionの転用、未承認の有料cloud実行は行わない。利用者の自動選択指示はmodelの選択方針であり、Broker権限・本人承認・既存の本番課金gateを解除しない。

**Pixelの実装範囲。** 新候補の `ModelSelectionPolicy` v3は記事・要約・翻訳・コード下書き・計画・文章を区別する。署名catalog、owner別license同意、検証済private cache、RAM条件を満たす候補から選ぶ。記事・要約・翻訳はQwen2.5 1.5B、コードは導入済Qwen2.5 Coder 1.5B、発想・計画・文章はQwen3 4B Instruct 2507を優先する。1.5Bは発想の内容試験不合格でplanning/writingから除外。4Bは短文20案の限定生成・保存試験であり、関連性が弱い案もあるため有用性・事業性の保証ではない。0.6Bは文章品質不合格のため自動候補に入れない。手動指定はexact digestを固定し、無断切替・cloud fallbackはしない。私有Shell API 22、Platform API 1、Local Binder API 4/package version 8（新候補、実機再受入中）は別の版である。新候補の実機合格は下記の受入で確定し、旧版15件の成功を転用しない。

**未受入と次の判断。** 全作業共通のmodel/runner能力契約、比較benchmark、文章品質、各cloud providerの接続・手動model指定・実利用/費用の受入は残る。現在の自動選択は世界全体の最新modelから最良を保証するものではない。合格証拠は[同一APK台帳](evidence/pixel-intuitive-experience.json)で実model pin、Tool成果、同IDを照合する。credential不足や商用契約待ちはそのまま表示する。

<a id="public-model-discovery"></a>

## Skyの公開モデル検索と、実行できるモデルの境界

2026-10-17の本人指示「今何が使えるのかリアルタイムでサーチ、XやGit等のopen LLM」を受け、Skyに明示検索を追加。検索語は原稿とは独立した1〜80文字。検索buttonを押したときだけBrokerがGitHub repository searchとHugging Face model APIへHTTPS GETし、各4件のGGUF関連候補をGitHub更新順・Hugging Faceダウンロード数順に取得する。Homeの依頼文・原稿・credentialを検索へ渡さず、Shellとlocal runtimeにはINTERNET権限を付けない。

**責任・入出力・状態。** ROCKは固定origin/path、無redirect、8秒connect/read timeout、1MiB応答上限、ID/文字列/件数の検査を管理する。GitHub/Hugging Faceは公開情報の提供者で、licenseや性能の記載は第三者のclaim。表示は出典URL、取得時刻、更新日時、licenseの公開表記、未導入・未検証、Pixel適合未確認とする。OSSかどうか・商用許可を自動認定しない。外部sourceの本文や命令をplan/Tool/署名catalogへ昇格しない。検索自体はweightsのdownload、license同意、model登録、実行を伴わない。対応署名catalogとHugging Face repository IDが完全一致した候補にだけ、別操作の導入buttonを表示する。

**保存・失敗・復旧。** 検索結果は画面メモリのみで、履歴・原稿・認証情報を保存しない。15秒以内の再検索とsource別403/429を抑止し、Retry-After/resetを最大1時間まで尊重。片方失敗はpartial、全失敗はunavailableとして再検索を案内し、古い結果を最新として再表示しない。system browserで公開元を開ける。任意URLやgithub clone/scriptを取得実行しない。

**Xと未決定。** 現在は明示確認付きでXの最新検索を外部browserへ開く。X APIは未接続で、投稿取得/ランキング/検証済み表示はない。API連携には公式App Bearer認証と契約・予算・秘密管理を先に定義する。検索結果から導入候補を増やす際は、重みlicense・固定revision/hash・runtime適合・資源・品質試験・publisher署名・本人同意を既存配布契約へ通す。検索人気や自己申告だけで自動実行対象を増やさない。

**合格条件。** parser/rate/応答上限/不正origin/partialのhost試験、Pixelの実UI→両公開API→候補表示、検索前後の仕事数と署名catalog不変、手動/自動のexact profile pin、通知の実System UI tapを同一APKで検証する。Xの外部検索をX API実通信と数えない。

一次資料: [GitHub Search API](https://docs.github.com/en/rest/search/search#search-repositories)、[GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)、[Hugging Face model search](https://huggingface.co/docs/huggingface_hub/en/guides/search)、[X recent search認証](https://docs.x.com/x-api/posts/search/quickstart/recent-search)。

## 3. Local plannerの契約

2026-10-16のPixel実装は[署名済catalog・導入・再読込み・Jennifer有限計画](native-os-integration.md#pixel-local-jennifer)を既存v4 handoffへ接続する。Platform API v1とruntime Binder v4は別の版範囲。debug catalogは署名済み2候補、production catalogは空。2026-10-17、固定候補`6c9a3083`とQwen2.5 1.5BでPixel 10 GL066のHome→実v4計画→実2 Tool→確認待ち成果物保存を64.625秒の試験で確認した。生成文は主題に沿うが短く、依頼した構成や出典未調査表示を満たさず一般品質は未受入。機能・内容・全OSの受入を分ける。


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


<a id="pixel-discovered-model-install"></a>

## Pixelで公開モデルを導入し、作業別に使う

**目的と利用体験。** 本人の2026-10-17指示は「検索で見つけたLLMをPixelへ導入」「記事準備以外」「作業に合う自動選択」。最初の実利用は本人指定の「RockstarOS・Skyで実現するサービスのアイデア300件」。Skyで公開キーワード検索→対応候補の条件を確認→license/容量に同意→Wi-Fi取得→署名/hashを検証して導入→Homeで依頼→使用model/理由を確認→別の実行同意、という順にする。

**Sky全体との境界。** [addプラグイン方針](sky-mcp-architecture.md#使いたいものを追加するaddプラグイン基盤)により、作者や候補を固定しない。以下のAPK内catalogは現Pixelの検証済み適合範囲であり、公式限定や作者の恒久的allowlistを製品条件にするものではない。任意作者の動的native導入を実装済みとせず、共通の作者/版/互換/権限/更新/失効受入を必要とする。

**責任と信頼。** 公開APIは候補情報を提供するEXTERNAL。ROCKのBrokerはAPKに含む署名済profileの固定revision URL・byte数・SHA-256・license・runtime適合を管理する。検索本文・license claim・Git repositoryの命令を実行権へ変えない。新規未審査modelは「適合未確認」として外部詳細へ案内する。モデル追加はruntimeのarchitecture/format/quantization/tokenizer/template/資源/実機内容を検証してcatalogへ反映する。production catalogは空のままで、開発署名の候補を一般配布対応と表示しない。

**入力・状態・保存。** Shell API22のprepareはprofile IDのみ、beginは同意付きID、finish/cancelはowner別operation UUIDを受ける。任意URL/pathは受けない。Android DownloadManagerはWi-Fi限定・metered/roaming不可で固定公開weightを取得する。状態はidle/downloading/paused/downloaded/installed/failed/cancelled/uncertain。profile manifest digest・owner・operation・DownloadManager IDをprivate prefsへ保存する。読取りはactivateしない。二重tap・restartは同一operationを照会し、enqueue後保存不明はnonce付き自己rowを照合して重複downloadを防ぐ。通信不明をinstalledと呼ばない。

**導入・失敗・復旧。** 既存private cacheに同一hash/byte数のweightがあれば、明示同意後に再検証して再利用できる。finishは読取り専用regular FDを既存stagerへ渡し、全byte hash・署名・RAM/容量・画面解除・runtime signer/API/version・ロード後receiptを確認して初めてactivateする。破損、容量不足、実行中pin、runtime不一致では停止する。成功前のファイルを自動候補へ入れない。完了ファイルは検証失敗時に保持し、取得中止は自己DownloadManager rowだけに限定する。secret/API keyやCodex loginは使わない。

**生成と仕事。** 通常の `local-work@1/output-v1` はtask/title/body/summaryの4文字列のみ。サービス発想の現候補はpackage8の派生schema `local-work@1/ideas-N-v2`（N=1..10、raw文字列上限48、Broker各案96 UTF-8 bytes）を使い、旧v1の24文字契約も維持する。モデルの生出力を `ideas` 文字列配列ひとつへ限定し、minItems/maxItemsをNに固定する。runtimeは実在するN文字列を検査してbodyへそのまま配列JSONとして格納し、task=planning・title・注意summaryはruntime側のメタデータとして付ける。モデルのtaskを付け替える処理や、不足案の補填はしない。Brokerでも実件数と全仕事の重複を再検査する。modelは非信頼な下書きを返し、Brokerがtask・型・byte上限を検査する。単一の正確なJSON code fenceは表示上の包みとしてだけ除去し、後続の文章・未知field・別taskは拒否する。taskはBroker側の決定と一致しなければならず、モデルの誤分類を付け替えて通さない。新runtimeはtitle60/body600/summary120文字のschema制限と最大512 output tokens、plan180秒を用い、Brokerのgeneration lease240秒と分ける。通常文書は生成→検査→保存の3段階、記事は既存2 Tool。コードは文章として保存し、shell/外部実行へ渡さない。新規の第三者Tool権限や本番課金を追加しない。通常文書の最初の入力artifactにはowner依頼と生成promptそのものを保存し、開始時のrequest digestへ結び付ける。保存promptのない旧試験入力は明示再計画を求め、更新した指示を黙って適用しない。各仕事は開始前のexact profile pinを保持し、各推論の前後に実weight hashとruntimeを再照合する。

**300件のアイデア。** planningの有限subtypeとして最大300件をcheckpoint v6で5件ずつ生成・保存する。raw5件を1回（plan180秒以内）、generation lease240秒で扱う。旧v1（20件）/v2（10件）/v3（5件・raw v1）/v4〜v5（5件・raw v2）の保存本文・読取契約を保持し、新しい生成契約で再実行する旧未完了workは明示再計画を要する。空行と単一のJSON表示fenceだけを正規化し、一貫した全体番号/回内番号、箇条書き、または文字列配列のactual itemsを同じ検査へ通す。全体の番号はBrokerが付ける。各回の実件数、文字数、Unicode正規化後の完全重複を検査してからcheckpointをhash付きartifactへ保存する。途中の件数を300と表示せず、目標件数が揃って最後のsealが成功した場合だけ確認待ちにする。意味上の類似・事業性・独自性は別の人による確認事項。停止・プロセス終了は既存lease/token fenceを使い、確定済みprefixを保持する。件数・重複・形式の不正は同じ5件範囲を最大3回まで再生成し、揃わなければ保存済みprefixを残して停止する。これは端末内の純粋な発想生成だけで、他のTool・有料cloud・権限不足を自動再試行しない。run attemptと再生成eventを永続化し、再起動で上限を巻き戻さない。欠けた案をfixtureで補完しない。

**互換性と受入。** Engine DBは3→4のtransactionで既存runsを保存し、有限stageを最大61（生成60回+seal）に拡張する。旧schema3の二工程backupを受け入れ、new backupのstage列は既存記事・3段階文書・最大60batch+sealのclosed形だけを許す。restoreは既存のpause/権限失効を維持する。更新前のAPKとprivate DB退避はGit外へ保存し、旧schema3 BrokerへDB4をそのまま戻さない。旧model profile/versionと成果物は書き換えない。

合格条件はhostのschema/選択/重複拒否/migration/backup/停止fence、同一source APKのbuild/lint、Pixelの実公開検索→実download→hash検証/導入→codeでCoder・planningで4Bのexact pin→実推論→成果readback。300件は実保存した番号と件数を検査し、実機のcheckpoint/persistenceと最終成果を照合する。全OS image、正式署名/flash/OTA、X API、有料cloud、一般的な品質保証は別受入。実機未実行や失敗は進捗台帳へそのまま残す。

## 作業別のモデル自動選択（2026-10-17）

本人の明示変更「LLMを選べるように、デフォルトは作業に合うものを自動選択」により、Skyの会話モデルは自動を初期値とし、手動Provider/モデルID指定を残す。Codex専用の契約ではない。Toolの自動ルーティングとモデル選択は別で、Agent配置・権限・料金承認をモデル選択から昇格させない。

入力は依頼文と保存済み選択モード。サーバーで本人・利用権を確認し、設定済みloopbackのモデル一覧（Ollama tags / OpenAI互換models）を読み取る。モデル一覧にある候補のうちコード作業ならcoder系、その他なら一般系を優先する決定的な初期ヒューリスティック。性能比較による「世界で一番」の実証ではない。返すProvider/モデルID/理由を当該依頼に固定し、会話モデル設定に表示する。自動選択に失敗したら依頼文を保持し、接続設定後に再送する。別Providerへの実行時フォールバックは行わない。

初期local selector単体の対象はローカル。現在のWebは後述の同意・本人限定flag・有効Sandboxプランを満たす匿名無料Cloud selectorを使う。Pixel native実機はlocalで受け入れ、Web Cloudと混同しない。手動のOpenAI/Anthropic/Google/互換接続先とモデルIDは選択できるが、実行の料金gate・同意・対応coordinatorは別条件である。Cloud実利用が有効になる場合も既存Sky140の予約/確定usage/$100停止を経由し、選択API自体は予算や請求を変更しない。

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


### 実アカウントでの無料Cloud検証と公開Sky互換移行

公開Sky (`appgprj_6abdfad4c5648191bcae957913bd02fa`) はColumbiaとは別のsource/DB/0000・0001 migration系列である。既存50テーブル144行を読み取り退避し、ローカルSQLiteへの行再構成と追加migration後の全行一致・integrity_checkを検証する。非原子的な行snapshotを物理D1 backupと呼ばない。既存SQLを変更せず、未作成work_jobsとsandbox契約表だけを追加し、配備後に既存行を再照合する。失敗時はversion 56へWorkerを戻し、追加表は残す。既存表をdrop/restoreで上書きしない。

`/sky/free-cloud` は実ログインの本人IDを確認し、明示同意で1時間の合成契約を開始する。`/api/llm/free-cloud/account` のGETは本人と接続・プラン状態を返す。POSTは `SKY_FREE_CLOUD_ENABLED=true`、完全一致 `SKY_FREE_CLOUD_OWNER_ID`、`SKY_FREE_CLOUD_SANDBOX_SETUP=true` と `synthetic-free-only-v1` 同意をすべて要求する。既存契約は上書きも延長もしない。Stripe/支払いAPIは呼ばず、月額契約の成立としない。期限切れは停止し、継続は新たな検証判断とする。

モデル候補取得・実行・保存・再送防止は共通コードを使う。公開Sky adapterは既存Sites認証/4引数scope検査を保持し、mainはdevice/passkeyも含む既存認証/6引数scope検査を保持する。read-only利用枠projectionを `lib/sky-recurring-plan.ts` へ分離し、無料配備へ有料実行/請求adapterを持ち込まない。owner以外・同意なし・設定なし・期限切れ・枠不足はCloud送信前に停止する。合格証拠は同一公開source/versionの実アカウントUI→自動候補選択→実Cloud応答→token/$0保存→再送0と既存行照合。実アカウントでも合成契約であることを表示し、本番課金・実契約受入へ転用しない。

Cloudflare Workersではfetchのredirect:errorが未対応のため、metadata/生成ともredirect:manualを使い、3xxを不成功として停止する。リダイレクト先へ再送しないことを試験する。

### 月次契約の無料Cloud統合Sandbox

月額140 USD・利用枠100 USDの月次契約を無料Cloud自動選択/実行の共通gateへ接続する。枠切れ・未払いで停止し、入金照合と期間更新を区別して復旧する。目的/体験/入力/状態/保存/失敗/復旧/承認/受入/未決条件は[月次Cloud統合契約](sky-billing.md#月額プランと無料cloudの統合sandbox2026-10-17)、証拠は[Sandbox受入](evidence/sky-monthly-free-cloud.json)。公開アカウント移行と本番課金の受入には転用しない。

公開実アカウントの月次Sandbox移行では、旧契約履歴・専用合成usage・本人限定操作・署名通知・送信前照合を追加する。[目的/体験/責任/入出力/状態/保存/失敗/復旧/承認/合格/未決条件](sky-billing.md#公開実アカウントの月次sandbox移行2026-10-17)。本番課金/無人schedulerは未受入。

無料Cloudの402/429は契約未払いと区別し、Providerが数値Retry-Afterを返した場合だけ待機秒数を表示する。未指定なら無料枠の利用可否確認を案内する。同じ依頼IDは結果未確認のまま保持し、再送・有料切替をしない。検証はtests/sky-free-cloud.test.mjsのcooldown/refusal試験と公開UIで行う。

### 過去の候補試験（現行候補への合格転用なし）

package6は実機で発見したllama.rnのJSI `stopCompletion()` が型宣言に反してvoidを返す経路にも対応する。停止の戻り値をPromiseへ正規化し、同期throw/非同期rejectをtoken callbackの外へ漏らさない。package5の5件試験はJSON完成後に`.catch`参照でcrashしたため未受入、10件試験は180秒で停止し0件保持。旧runtime pinを更新せず新profileへ明示再同意する。

導入失敗時は取得状況を読み直して回復する。旧model pinを持つ未完了仕事があれば、本人にその仕事の完了/中止を案内し、自動中止・自動repinをしない。失敗応答にoperationIdがない場合、空の取得IDで中止要求を送らず「取得状況を更新」を表示する。

過去のpackage6試験では、raw10件schemaが180秒を超え、raw5件が17.749秒で完了したため、当時のv2の1保存工程を最大2回のraw5件生成（各105秒上限）へ分割した。各回は新しいIPC tokenを使い、Engine ticket/model pin/leaseは不変。メモリ上の5件も重複・実数検査し、2回とも合格した10件だけを元の工程checkpointへ保存する。不完全な回の5件を保存済みと表示しない。再生成上限は元の保存工程あたり3回、通常Toolや有料処理へ適用しない。旧v1 checkpointの20件検査・backup読取は維持し、新runtimeでの再実行は明示再計画を求める。

端末内1.5Bで長い共通説明の付いた5件依頼も90秒を超えたため、生成promptはowner依頼を保持し、Sky/Miniの最小文脈、30の具体的な視点、対象、直近2案へ絞る。履歴全体の重複判定はBrokerの全prefix照合で維持する。短縮は依頼文そのものの切捨てではない。長い依頼で時間を超えれば保存済みprefixを保持して停止する。

package7はclosed idea subtypeだけtemperature0.7/top_p0.9/top_k40/repeat_penalty1.12とし、実機で発見したgreedy同一案の反復を減らす。文字列の実数/重複検査は緩和しない。他taskのsamplingと権限は不変。ShellはonStartからonStopまで既存の同署名Brokerへ空のbindingを保持し、画面表示中の実行をforegroundの優先度へつなぐ。binding自体は仕事の作成・再開・承認ではない。画面外では解放し、JobScheduler/lease/checkpointへ戻る。一般backgroundモデル品質/完走をこの受入へ流用しない。

発想の重複対策として各raw5件へ異なる分野を1つずつ割り当て、30分野と10対象を切り替える。これは入力の視点であり、成果の案を固定文言で補填する処理ではない。owner依頼は保持する。新しい案のAI表記はsiを要求し、append時に明示指定の用語AIをsiへ整形し、その後で重複を検査する。旧checkpointのAI表記は改変せず読み取れる。意味上の新規性・類似は引き続き人による確認が必要。

小型General1.5Bは20件保存/形式検査は通ったが、分野名コピー・途中切れが多く内容品質不合格。planning/writingの自動候補から除外する。上位候補Qwen3-4B-Instruct-2507（Qwen元モデル、Unsloth Q4_K_M、Apache-2.0、revision a06e946bb6b655725eafa393f4a9745d460374c9、2497281120 bytes、SHA256 3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597）を既存runtime7/API4へ署名定義として追加し、8GiB未満の端末を自動候補にしない。当時のv3のPixel手動選択20件で実生成/保存/5工程すべて1回目成功を確認した。後述の制御記号問題と文末切断によりその試験を内容受入へ転用せず、Native8/profile2のv5実20件で再検証してからplanning/writingの限定自動候補（priority80）とした。用途の関連性が弱い案は残り、一般品質を合格扱いにしない。実tokenizer/template metadataを固定hashから抽出検査し、作者/量子化者/配布定義署名者を分ける。元モデルと量子化の根拠はhttps://huggingface.co/Qwen/Qwen3-4B-Instruct-2507 およびhttps://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF 。

4Bの実返答を限定診断で確認したところ、具体的な5動作は返るがAI表記で拒否されていた。本人の表記指定を決定的なAI→si整形として新規案へ適用する。要素数は不変で、表記整形後の全prefix重複を検査し、URL/作者名のliteral識別子と旧保存本文は変えない。動作の完成した短文を求める。当時のv2は各raw105秒×2回/lease240秒だったが、現行v3はraw180秒×1回/5件保存へ置き換える。長いworkは1Jobあたり最大2工程とし、正常な継続は新しい即時Job IDへ渡す。失敗backoffを正常な分割へ累積せず、充電/熱/停止/lease/token gateを保持し、pauseは継続IDも取り消す。

package7当時のcheckpoint v3は生成5件が合格した時点で保存し、300件は60生成+sealの61工程とする。新規案にモデル制御記号（`<|`、`|>`、code fence、JSON終端断片）が混入した場合は除去して通さず拒否・有限再生成する。旧保存本文は読取り時に書き換えない。SkyはAgent/Tool hub、Miniは家具・建築へ埋め込む端末であることをpromptへ含める。4Bの旧20件試験は形式・保存・正常Job継続が成功したが、終了記号が1件に混入して重複を隠したため内容受入に算入しない。

旧v4〜v5の長い仕事では、同じ分野が別対象へ再登場するため、promptへ関連分野の過去最大6案と直近2案を上限付きで含めた。現v6は関連2案+直近1案へ縮小する（後述）。いずれも対象の暮らしに即した1分野の動作を求める。全prefixの重複拒否はBrokerで維持し、modelの記憶やpromptだけに依存しない。意味上の類似はdraft確認事項。

### 発想の途中切れを受けたpackage8候補

package7/旧raw v1の300件試験は、保存prefixで文末切断と大文字SIを発見したため、実25件を保持して当該仕事だけ中止した。未受入であり、実20件の限定試験を一般品質へ転用しない。旧24文字上限で文章を閉じる圧力を除くため、新raw `ideas-N-v2` は48文字の余裕を設ける。旧v1は24文字契約のまま、新checkpoint v4だけv2を使い、旧checkpointは読取維持・生成再開に明示再計画を要する。Brokerの各案96 UTF-8 bytes/Engine32KiB上限は維持し、長過ぎる返答を切って合格にせず拒否する。promptは20字程度の完結した動作、見出し/反復主語/途中切れ不可を指定。新規AI/SIはsiへ決定的整形し、要素数不変・alias重複検査・URL/作者識別子/旧本文の保全を維持。runtime8向けprofileは新version/既存publisher署名で再同意し、同じ重みを再検証して再利用する。package8実APKはrun39072982374/source31414985から実bytesを検証済み、同一preview signer/payload一致。Pixel再受入20→300は未完了。

### 過去のprompt契約v5とNative8再検証

package8/raw-v2の20件は実生成/保存/表記/通し番号/完全重複検査が合格（397.822秒、5工程attempt1）。文末切断は見つからないが、家具・温度等を無関係な分野へ結ぶ弱い案が残った。新checkpoint v5は、Skyをソフト/機器のhub、Miniを埋込端末と明示し、ソフト単体の案を許し、家具/環境連動は課題解決に必要な時だけと指定する。各分野の困りごとを解く具体動作が単独で分かる短文を求める。旧v4を新promptで自動再開せず、read-only履歴を保つ。raw-v2/Native8/署名profile/byte上限/件数/重複/停止/有限再生成は不変。prompt5の実手動20件は533.698秒で5工程すべてattempt1、実20件/番号/si表記/制御記号なし/完全重複なしを確認。弱い関連性や粗い説明は残るため、限定draftとしてpriority80 planning/writingへ接続し、一般品質合格とはしない。実自動300件は未完了。

## 無料Cloudの待機と自動続行（2026-10-17）

本人の追加指示により、従来の「すべての402で自動再送なし」を限定更新する。依頼送信時の「無料枠の待機後、同じ依頼を自動で続行する」を有効にした場合、HTTP 402・error.code=FREE_LIMIT・1〜300秒の数値Retry-Afterがすべて確認できた生成前拒否だけをwaitingとして保存する。単なる402/429、通信切断、timeout、usage欠落、保存失敗はunconfirmedで停止し、再送しない。有料fallback・決済呼出しを追加しない。

既存WorkJobのowner/id/requestDigest/modelを固定し、revision CASでwaiting→sendingを一人だけが獲得する。retryAtまでは外部呼出しなし。再開前に同意・無料接続設定・月次契約・残枠・モデル無料対象を再確認する。最大5送信試行（拒否を含む）、最初の依頼から10分以内に限定。待機記録の永続化失敗では再送不可。同じ完了IDは保存済み応答だけを返す。請求明細は増やさず、成功時も匿名無料の実トークン/$0を記録する。

画面は残り秒数、依頼ID、試行回数、同じモデルの結果を表示する。チェック解除で自動続行を停止できる。旧version65ではタブ終了で停止した。現行の画面外継続は下記の永続ジョブ仕様に従う。未確定要求の解放や別IDへの自動置換はしない。最大回数・期限到達は手動調査へ進み、成功を偽装しない。

受入はtests/sky-free-cloud.test.mjsで同時再開・早期再送拒否・同意撤回・未払い・期限・回数・異常応答・一仕事/請求追加0を確認する。公開実accountでは実FREE_LIMIT→カウントダウン→同ID実応答、再押下同じ応答ID/試行回数、既存月次請求維持を検証する。Providerの無料枠が回復しなければその条件を未受入と記録する。

公開実accountの待機・停止/再開・同ID実応答・再押下・請求件数不変の受入は[自動続行の証拠](evidence/sky-free-cloud-auto-continue.json)。本番課金と無人queueの受入ではない。


## 無料Cloudの画面外継続

2026-10-17の本人指示により、画面内タイマー限定を永続ジョブに変更する。目的は、本人が送信・保存・画面外続行へ同意した依頼を、タブを閉じても待機・実行し、再訪時に同じアカウントで成果を読むこと。Sky（SKY07/ROCK）がジョブと無料モデル実行を所有し、Web（WEB01/JOINT）が認証・保存・公開UIを担当する。

入力は依頼ID、prompt、選択済み無料model、送信/保存/画面外続行の明示同意。D1の既存WorkJob JSONにprompt・同意・期限を追加保存する。DB移行や既存行の書換えは不要。GET /api/llm/free-cloud/jobs は本人の最新20件と保存成果を返し、promptを返さず、実行もしない。再訪はGETだけ。POSTの再押下は同一ID/同一digestなら既存記録を返す。

queued → sending → completed、生成前FREE_LIMITとRetry-Afterを確認できた場合だけwaiting → sending。1分周期の専用Cloudflare Workerが署名付きwakeを送り、Siteは固定ownerの保存済み依頼から1件を処理する。Workerにはprompt・本人情報を渡さない。timestamp/HMAC/固定bodyでwakeを検証し、owner/revision CASを唯一の送信権とする。複数wakeの重複配信でも送信権は1件。各送信前にservice scope、月次契約、100 USD利用枠、無料model eligibilityを再確認する。有料切替はない。

最大5試行・開始から10分。待機秒数は次回確認の目安であり成功保証ではない。停止はqueued/waitingをCASでcancelledにする。送信中の取消は受理しない。通信断・結果不明・保存不明・期限切れは自動再送しない。sendingでプロセスが失われた場合も成果不明として手動確認し、勝手に送信権を戻さない。モデル出力はレビュー待ちでありTool成功や本人承認ではない。

運用設定はservices/sky-free-cloud-wake/README.md。secretはGit外。enabled flagは配備設定であり常設Worker稼働の証明とは区別する。合格条件は実アカウントでタブを閉じた期間のcron処理、再訪成果、同ID再押下で試行不変、Sandbox請求の件数/invoice不変。合成の並列・停止・期限・署名試験と実Provider結果を分けて docs/evidence/sky-free-cloud-background.json に記録する。本番課金は無効のまま。

Generic summaryの実機試験は生成/保存が通っても、日本語指定への英語返答を不合格として分離する。明示した日/英の要約言語を有限のtrusted prompt controlへ抽出し、コピーした依頼本文の後で指定する。既存仕事は保存promptをそのまま使い、新規仕事だけへ適用。codeの本文/識別子や翻訳先をこの修正で書き換えない。実機harnessはruntime所有のtitle/footerを除いた本文の日本語も検査する。

### 長い発想仕事の明示的なcompact復旧（契約v6 / Shell22）

実auto300は30件保存後、関連する過去案が増えた入力で180秒の推論上限に到達し、6番目の生成工程をneeds_reviewで保持した。上限を延長して成功にせず、保存済み30件・旧artifact・元依頼・モデルpinを保つ。現v6は重複抑制の例を関連2案+直近1案へ上限化し、冗長な指示を短縮する。全prefixの件数/byte/完全重複検査はBrokerで維持し、未生成案の補完はしない。

Shell22のcompactReplanIdeasは本人同意、同じowner/pin、activeかつneeds_reviewの純粋発想工程、LOCAL_GENERATION_TIMED_OUT、停止中でないこと、expected checkpoint digest一致、同仕事でcompact復旧未実施をtransactionで確認する。成功済みrun/旧input/output/artifactは更新しない。停止工程だけqueuedへ戻し、human_compact_replan eventを同じtransactionで一度記録。次のticketは当該stepのeventがある場合だけv5入力をメモリ上でv6へ変換し、新しい実5件が合格した後に新checkpointを保存する。旧v5を通常の自動継続で書き換えない。他Tool/cloud/費用/権限不足/失敗一般の再送へ広げない。

画面は「N件を残して続ける」と確認dialogを提示し、進捗/モデルを保つことを説明する。外部intentは仕事を開くだけで、復旧を承認しない。取消/全停止/遅延callback fenceを維持する。false consent・別owner・古いdigest・二重復旧・pause・遅延finish・再起動をhostで検査する。実機は同じ300件仕事の30件を引き継ぐ一度の明示復旧を別記録し、ゼロ介入の自動完走と呼ばない。runtime8/モデル2/raw-v2/180秒/lease240秒/DB4は不変。この時点の実300は未完了。最終の限定受入は次節で別記録する。

### 現Pixelの限定機能受入

Native8/API4・Shell22・checkpoint6の同preview署名APKで、本人指定の実300件を60生成+sealの61工程から保存。番号/実数/正規化完全重複/si表記/制御記号/全保存prefixのhash連鎖と、Broker processを開き直した同bytes読戻しを確認した。16,274bytes、SHA256 `5418343ae39cc80f2d9659eb72aa3f8d489472d8814ff4c3842e894ca9c8b2e6`。元の24仕事/70artifactを保持し、全248 artifactのhashを検査。30件で一度のcompact復旧、220件で通常の再試行を一度、形式等の拒否には計3回の有限自動再生成が必要だった。v6新規仕事は既に短い入力なので、時間切れには通常の再試行を使い、旧v5向けcompactを重ねない。無介入完走や一般background信頼性へ転用しない。

現在のAPKで、auto code→Coder5の実3段階保存と、実際の手動chooser→同profileの生成保存も確認。コードは実行しない。実通知タップ/公開GitHub・Hugging Face検索を含むUI13件、既存opt-in未選択1件、導入境界/SQLite5件を分けて記録する。全300の本文には意味の近い案、不自然な物理連携、前提条件の不足があり、300の独立した事業案・一般的なモデル品質・医療/計測/外部通知の能力を合格扱いにしない。owner確認待ちを維持する。[artifact・各source・失敗と復旧・同一APKの詳細証拠](evidence/pixel-discovered-models.json)を正本とする。

実402受入追記（2026-10-17）: 公開実accountで生成前FREE_LIMIT待機→タブ終了→cron再開→同ID実応答の再訪確認に成功。拒否1回/生成1回、再読込不変、Sandbox請求件数とinvoice不変。手動wakeや合成402は使っていない。証拠はdocs/evidence/sky-free-cloud-background.jsonのreal402Acceptance。本番課金は無効。


### 待機中の契約停止・翌月復旧のSandbox受入

本人指示（2026-10-18）で、既存の公開Sandboxを履歴保持のまま繰り返し試験できるようにする。restoredからのcapは現在契約の期間へ合成100 USDを適用し、close-monthは既存の失敗用テスト支払方法で対象月を締める。payは対象期間の請求1件だけを選択し、以前の請求や旧契約JSONを削除しない。復旧時計は実時間と試験月初の遅い方に固定し、未来月の試験でも期限外扱いにしない。本人限定flag・test鍵・Stripe account照合・livemode=false・既存leaseとidempotency keyを維持する。DB移行なし。

保存済みqueued/waitingは毎回の送信前に同じ月次契約と利用枠を再確認する。quota_exhaustedまたはpayment_or_contract_blockedの間はProvider送信を行わず、試行回数を消費しない。10分の同意期限内に入金照合と翌月更新が完了すれば同じIDを続行する。期限を越えた古い依頼は復旧後も自動再送せず、新しい明示依頼が必要。入金だけで同月の使用額を消さない。送信済み・結果不明を自動的にqueuedへ戻さない。画面終了中の公開実account受入と合成並列試験を分けてdocs/evidence/sky-background-plan-gates.jsonへ記録する。本番課金なし。
