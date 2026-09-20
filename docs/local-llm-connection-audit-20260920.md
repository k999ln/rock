# Local LLM 接続監査（2026-09-20）

## 結論

Local Action Assistant は、端末内Qwenを動かすruntimeとして設計・検証済み。ただし、現在のWeb版SkyからAndroid Binderへ直接つなぐ実行経路はまだ完成していない。localhostでOllamaを使う経路も、Ollama自体が起動している場合だけ動く。

## 検証したこと

- `npm run typecheck`：合格
- `npm run build`：合格
- LLM provider / routing / handoffの対象テスト：9件合格
- Local AI準備・APK stagingのPythonテスト：15件合格
- `npm run llm:architecture:check`：合格
- `npm run os:check`：合格
- 現在の実行環境：Ollama `11434` は未起動、Sky `3001` は応答なし

## 問題として残っている箇所

### 1. Webから端末内LLMへ渡すbridgeが未接続

`local-model` は意図的に `LOCAL_LLM_BRIDGE_REQUIRED` で停止する。これは秘密情報を外部へ送らないためのfail-closedだが、Webの `/api/llm/text` からLocal Action AssistantのAndroid Binderを呼ぶ実装はない。

必要な接続は次の形。

```text
Sky / Zema
  -> native shell or Android bridge
  -> Broker
  -> Local Action Assistant Binder API v2
  -> llama.rn / GGUF / Qwen
```

Cloudflare Workerから端末の `localhost` やBinderへ直接アクセスする設計にはしない。

### 2. OS imageにはまだ入っていない

`os/physical/local-action-assistant-artifact-lock.json` は `imageIntegrated: false` で、`os/physical/rockstaros.mk` は `vendor/rockstaros-local-ai/product.mk` がないと物理OS buildを停止する。現在は source pin・APK review・端末検証までで、production signing／OS image／boot受入は未完了。

### 3. Routerの本番compositionが未接続

`DecisionRouter`、`LocalQwenDecisionProvider`、`TypeSafeJevProvider` は実装済みだが、アプリの本番routeで `new DecisionRouter(...)` を構成する呼出しはなく、現状はfixtureとadapter境界まで。Providerを作っただけではSkyの全依頼は自動的にRouterを通らない。

### 4. Provider選択はモデルの導入・起動を行わない

Skyのmodel ID欄に `qwen3:8b` などを入力しても、Ollamaへのpull、GGUFの端末取込、互換性確認は自動で行わない。未導入モデルは接続待ちで停止する必要がある。

## 追加できるLocal LLM経路

### すぐ接続できる（既存のHTTP adapterを再利用）

| runtime | 接続方法 | RockstarOSでの扱い |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` または `/api/chat` | 既存adapter。Mac/Linux/Windowsの最短経路 |
| LM Studio | OpenAI互換または `/api/v1/chat` | `openai-compatible` adapter。モデル一覧・load/unload APIあり |
| llama.cpp `llama-server` | `/v1/chat/completions`、Responses、JSON schema、tool use | `openai-compatible` adapter。軽量な基準サーバー |
| vLLM | OpenAI互換サーバー（通常 `:8000`） | `openai-compatible` adapter。GPU・複数同時実行向け |
| MLX-LM | OpenAI類似サーバー（Apple Silicon） | `openai-compatible` adapter。Mac開発機向け |
| LocalAI | OpenAI / Anthropic / Responses互換 | `openai-compatible` adapter。認証・MCP・複数backendあり |
| GPT4All Local Server | OpenAI API subset（通常 `:4891`） | `openai-compatible` adapter。手軽だが機能は限定的 |

### 端末内に組み込む（新しいnative bridgeが必要）

| runtime | 対応 | 評価 |
| --- | --- | --- |
| Local Action Assistant + `llama.rn` | Android/iOS、GGUF | 現在の基準。Binder API v2とBroker境界を維持する |
| MLC LLM | Android/iOS/Web、GPU最適化 | 高速候補。ただしモデルをMLC形式へ変換し、別Binder adapterが必要 |
| Google LiteRT-LM | Android/iOS/Web/Desktop、Gemma/Llama/Phi/Qwen、tool use | 将来のPixel/NPU候補。Swiftはearly preview、Kotlinはstable |
| ExecuTorch | Android/iOS、XNNPACK/Core ML/Vulkan/Qualcomm | 端末最適化の候補。`.pte`変換とnative runnerが必要 |

## Hugging Faceから選べるモデル候補

Local Action Assistantの現行取込契約はGGUFなので、まずはGGUFを優先する。モデルを選ぶだけではなく、端末のRAM、コンテキスト長、chat template、ライセンス、Tool呼出しの安定性を実機で確認する。

| モデル | 向いている用途 | 現行構成への接続 |
| --- | --- | --- |
| Qwen3 1.7B / 4B GGUF | 日本語、一般相談、Router候補、軽量端末 | そのままGGUF取込。Qwen公式カードにllama.cpp、Ollama、vLLM例あり |
| Qwen2.5-Coder 3B GGUF | コード生成・修正案 | GGUF取込。Tool実行はBroker側で検証する |
| Gemma 3 4B IT GGUF | 文章、要約、画像理解対応の候補 | GGUF取込。Googleの利用条件を確認 |
| Gemma 3n E2B / E4B LiteRT-LM | Android/iOSのオンデバイス、画像・音声寄り | GGUFではなくLiteRT-LM native adapterが必要 |
| FunctionGemma 270M | Tool選択・短い構造化判断 | 小型だが、単独の会話モデルではなくBroker補助向け |
| SmolLM3 3B GGUF | 小型の多言語・推論・長文 | llama.cpp / GGUF取込。Apache 2.0 |
| DeepSeek-R1-Distill-Qwen 1.5B GGUF | 小型の推論実験 | GGUF取込。回答の検証と速度測定が必要 |
| Phi-4-mini-instruct GGUF | 文章・コードのローカル実験 | GGUF取込。モデルカード上の量子化配布元とライセンスを確認 |

Qwen公式の1.7BはQ8_0で約2GB、4BはQ4_K_Mで約2.5GBの候補で、どちらもllama.cpp / Ollama / vLLMの接続例がある。[Qwen3 1.7B](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF)・[Qwen3 4B](https://huggingface.co/Qwen/Qwen3-4B-GGUF)

小型候補では、SmolLM3-3BはQ4_K_Mが約1.92GBで、llama.cpp・ONNX・MLX・MLCの利用先が示されている。[SmolLM3-3B GGUF](https://huggingface.co/ggml-org/SmolLM3-3B-GGUF)

コード用にはQwen2.5-Coder 3B、推論実験にはDeepSeek-R1-Distill-Qwen 1.5B、文章用にはPhi-4-miniを候補にできる。[Qwen2.5-Coder](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF)・[DeepSeek-R1-Distill](https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF)・[Phi-4-mini](https://huggingface.co/microsoft/Phi-4-mini-instruct)

## X / xAIについて

xAIの現行Grokは基本的にAPI経由のクラウドモデルで、Local Action Assistantへそのまま入れるローカルGGUF候補ではない。公開されているGrok-1は314Bパラメータで、スマホ用の現実的な候補ではない。[xAIのGrok-1リポジトリ](https://github.com/xai-org/grok-1)

したがって、xAIは`cloud provider`として別接続し、端末内モデル候補には含めない。

## 優先順位

1. **まず現在のLocal Action Assistant BinderをSky/Zema native shellへ実接続**する。
2. PCでの比較用にOllama、LM Studio、llama.cppを同じOpenAI互換adapterで接続する。
3. Pixel/NPUを狙う場合だけLiteRT-LMを別profileとして試す。
4. MLC LLMとExecuTorchは、実機ベンチマークの根拠が必要になった時点で追加する。

## 公式資料

- Local Action Assistant：[README](https://github.com/noellesugar99/local-action-assistant)、[Architecture](https://github.com/noellesugar99/local-action-assistant/blob/main/docs/ARCHITECTURE.md)
- Ollama：[OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- llama.cpp：[HTTP server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- LM Studio：[REST API](https://lmstudio.ai/docs/developer/rest)
- vLLM：[OpenAI-compatible server](https://github.com/vllm-project/vllm/blob/main/docs/getting_started/quickstart.md)
- MLC LLM：[Android/iOS quick start](https://github.com/mlc-ai/mlc-llm/blob/main/docs/get_started/quick_start.rst)
- LiteRT-LM：[official repository](https://github.com/google-ai-edge/LiteRT-LM)
- ExecuTorch：[mobile runtime](https://github.com/pytorch/executorch/blob/main/docs/source/getting-started.md)
