// Reviewed requirements are display data, never executable recipes or credentials.
import { recipeFor } from './noah-execution-contract.mjs';
export const AGENT_REQUIREMENTS = Object.freeze({
  "anicca": {
    "id": "anicca",
    "name": "Anicca / Local Life Manager",
    "mode": "account",
    "requirements": "このMacのCodexログイン、業務で使うサービスの本人設定",
    "note": "公式composition runnerを専用環境で動かし、本人Codexで文章・計画を作成。外部サイト操作・投稿・営業・常時運用は未対応。",
    "reference": "https://github.com/daisuke134/life-manager",
    "checkedAt": "2026-11-17"
  },
  "research-773d42c942c1ecee17f6": {
    "id": "research-773d42c942c1ecee17f6",
    "name": "11x",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.11x.ai",
    "checkedAt": "2026-11-16"
  },
  "research-8782e21ebeda898af4b7": {
    "id": "research-8782e21ebeda898af4b7",
    "name": "aaif-goose/goose",
    "mode": "local",
    "requirements": "このMacの隔離実行環境と既存ローカルモデル",
    "note": "Noahの実行アダプターに対応。接続後に依頼を入力する。",
    "reference": "https://github.com/aaif-goose/goose",
    "checkedAt": "2026-11-16"
  },
  "research-f6074e8b6f9e543140e2": {
    "id": "research-f6074e8b6f9e543140e2",
    "name": "AgentFlow/agentflow",
    "mode": "resource",
    "requirements": "vLLMモデル環境、用途別ツール",
    "note": "公開デモ停止中。固定版をローカル起動する構成が必要。",
    "reference": "https://huggingface.co/spaces/AgentFlow/agentflow",
    "checkedAt": "2026-11-16"
  },
  "research-ec7b16295dd6ec599dcd": {
    "id": "research-ec7b16295dd6ec599dcd",
    "name": "Agents-MCP-Hackathon/consilium_mcp",
    "mode": "account",
    "requirements": "Mistral/SambaNovaの利用設定、調査ツール",
    "note": "公開コードは本人のモデルキー設定に対応。Noahへの接続は未対応。",
    "reference": "https://huggingface.co/spaces/Agents-MCP-Hackathon/consilium_mcp",
    "checkedAt": "2026-11-16"
  },
  "research-8cb4e42df80387bb4e6b": {
    "id": "research-8cb4e42df80387bb4e6b",
    "name": "Agents-MCP-Hackathon/ScouterAI",
    "mode": "resource",
    "requirements": "Anthropic認証、Modalと画像処理モデル",
    "note": "公開デモは実行エラー。画像処理環境の復旧と接続が必要。",
    "reference": "https://huggingface.co/spaces/Agents-MCP-Hackathon/ScouterAI",
    "checkedAt": "2026-11-16"
  },
  "research-2190e9fe46c338667ad2": {
    "id": "research-2190e9fe46c338667ad2",
    "name": "Agents-MCP-Hackathon/ShallowCodeResearch",
    "mode": "account",
    "requirements": "対応モデル、MCPの接続先と実行環境",
    "note": "公開デモ停止中。MCP処理と認証を含む固定版の起動対応が必要。",
    "reference": "https://huggingface.co/spaces/Agents-MCP-Hackathon/ShallowCodeResearch",
    "checkedAt": "2026-11-16"
  },
  "research-ce4d82de8c3d6abcf0ee": {
    "id": "research-ce4d82de8c3d6abcf0ee",
    "name": "agentscope-ai/QwenPaw",
    "mode": "local",
    "requirements": "モデル、QwenPawの設定と用途別Skills",
    "note": "公式Python/Consoleの導入・実行APIの結線が必要。",
    "reference": "https://github.com/agentscope-ai/qwenpaw",
    "checkedAt": "2026-11-16"
  },
  "research-ce4e58553bea6313acf7": {
    "id": "research-ce4e58553bea6313acf7",
    "name": "Aider",
    "mode": "local",
    "requirements": "このMacの隔離実行環境と既存ローカルモデル",
    "note": "Noahの実行アダプターに対応。接続後に依頼を入力する。",
    "reference": "https://github.com/aider-ai/aider",
    "checkedAt": "2026-11-16"
  },
  "research-4e55532b9f121e0eb131": {
    "id": "research-4e55532b9f121e0eb131",
    "name": "AlexWortega/my_pi_agent",
    "mode": "resource",
    "requirements": "指定GGUFモデル、llama.cpp/ブラウザー実行環境",
    "note": "公開デモ停止中。モデルとブラウザー内Agentの接続対応が必要。",
    "reference": "https://huggingface.co/spaces/AlexWortega/my_pi_agent",
    "checkedAt": "2026-11-16"
  },
  "research-ed2dac846af3f76bffb4": {
    "id": "research-ed2dac846af3f76bffb4",
    "name": "Alibaba-NLP/Tongyi-DeepResearch",
    "mode": "account",
    "requirements": "DeepResearchモデルのAPI接続、検索・閲覧ツール",
    "note": "公式SearchAgentと依存サービスをNoahへ結線する必要がある。",
    "reference": "https://huggingface.co/spaces/Alibaba-NLP/Tongyi-DeepResearch",
    "checkedAt": "2026-11-16"
  },
  "research-39fb7b5f58fda4b68d62": {
    "id": "research-39fb7b5f58fda4b68d62",
    "name": "Artisan / Ava",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.artisan.co",
    "checkedAt": "2026-11-16"
  },
  "research-41da695e64aa34de2508": {
    "id": "research-41da695e64aa34de2508",
    "name": "Blip Go",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.blip.ai/blip-go",
    "checkedAt": "2026-11-16"
  },
  "research-5c04c1ebeaf57681227c": {
    "id": "research-5c04c1ebeaf57681227c",
    "name": "Botpress",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://botpress.com",
    "checkedAt": "2026-11-16"
  },
  "research-9bfc7d14b05ee833d50c": {
    "id": "research-9bfc7d14b05ee833d50c",
    "name": "Bredrumb/TomoriBot",
    "mode": "account",
    "requirements": "Discord Bot権限、PostgreSQL、モデル接続",
    "note": "Discord側の本人設定と許可済みチャンネルの接続が必要。",
    "reference": "https://github.com/bredrumb/tomoribot",
    "checkedAt": "2026-11-16"
  },
  "research-16389f32495280ea98c7": {
    "id": "research-16389f32495280ea98c7",
    "name": "bytedance/deer-flow",
    "mode": "local",
    "requirements": "モデル、検索・ブラウザー等の用途別ツール",
    "note": "バックエンドAPI・サンドボックス・成果物のNoah接続が必要。",
    "reference": "https://github.com/bytedance/deer-flow",
    "checkedAt": "2026-11-16"
  },
  "research-a58d8a3160bcac2b53e8": {
    "id": "research-a58d8a3160bcac2b53e8",
    "name": "CherryHQ/cherry-studio",
    "mode": "desktop",
    "requirements": "デスクトップ本体、モデル設定、使う機能のOS権限",
    "note": "独立したデスクトップアプリ。Noahからの起動と実行結果回収は未対応。",
    "reference": "https://github.com/cherryhq/cherry-studio",
    "checkedAt": "2026-11-16"
  },
  "research-c23f3e7cbb0eb40f23d1": {
    "id": "research-c23f3e7cbb0eb40f23d1",
    "name": "Claude Code",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://code.claude.com/docs/en/overview",
    "checkedAt": "2026-11-16"
  },
  "research-533d51d9d3dea76fea8f": {
    "id": "research-533d51d9d3dea76fea8f",
    "name": "Cline",
    "mode": "local",
    "requirements": "公式CLI/SDK、モデル接続",
    "note": "CLI/SDKも公開されている。Noahの隔離実行と結果回収への対応が必要。",
    "reference": "https://github.com/cline/cline",
    "checkedAt": "2026-11-16"
  },
  "research-a90e1fa2514daead7766": {
    "id": "research-a90e1fa2514daead7766",
    "name": "code-yeongyu/oh-my-openagent",
    "mode": "local",
    "requirements": "公式omo実行器、対応モデルへのログイン",
    "note": "公式実行器と利用条件の確認、Noahへの実行アダプターが必要。",
    "reference": "https://github.com/code-yeongyu/oh-my-openagent",
    "checkedAt": "2026-11-16"
  },
  "research-c7226d0221560839a7f4": {
    "id": "research-c7226d0221560839a7f4",
    "name": "DAMO-NLP-SG/CoI_Agent",
    "mode": "account",
    "requirements": "主モデルと補助モデル、調査ツール",
    "note": "公開デモは実行エラー。必要なモデル設定とサービス復旧が必要。",
    "reference": "https://huggingface.co/spaces/DAMO-NLP-SG/CoI_Agent",
    "checkedAt": "2026-11-16"
  },
  "research-890a56b0d2aff0c91c90": {
    "id": "research-890a56b0d2aff0c91c90",
    "name": "deepseek-ai/deepseek-harness",
    "mode": "local",
    "requirements": "このMacの専用実行環境と既存ローカルモデル",
    "note": "固定版の公式headless profileへ接続。文章・ファイル編集が対象で、外部サイト操作と本人の画面操作は行わない。",
    "reference": "https://github.com/deepseek-ai/deepseek-harness",
    "checkedAt": "2026-11-17"
  },
  "research-1b070c7b6e05fc3815df": {
    "id": "research-1b070c7b6e05fc3815df",
    "name": "Devin",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://docs.devin.ai/get-started/devin-intro",
    "checkedAt": "2026-11-16"
  },
  "research-2563bf70ca9c6fe11872": {
    "id": "research-2563bf70ca9c6fe11872",
    "name": "Dust",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://dust.tt",
    "checkedAt": "2026-11-16"
  },
  "research-1ca98e260e53dafb0af6": {
    "id": "research-1ca98e260e53dafb0af6",
    "name": "edinetdb/dexter-jp",
    "mode": "account",
    "requirements": "EDINET DBの認証、/checkにはTYPESAFE_API_KEY",
    "note": "録画デモは実行合格に含めない。対応先の本人認証が必要。",
    "reference": "https://github.com/edinetdb/dexter-jp",
    "checkedAt": "2026-11-16"
  },
  "research-d89365a90ca03bcc3690": {
    "id": "research-d89365a90ca03bcc3690",
    "name": "ElevenAgents",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://elevenlabs.io/agents",
    "checkedAt": "2026-11-16"
  },
  "research-113c5b039cbcbc975c35": {
    "id": "research-113c5b039cbcbc975c35",
    "name": "Fin",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://fin.ai",
    "checkedAt": "2026-11-16"
  },
  "research-77d3c2e6be82e7b8ddbd": {
    "id": "research-77d3c2e6be82e7b8ddbd",
    "name": "ghostwright/phantom",
    "mode": "local",
    "requirements": "公式実行環境、モデルと用途別接続先",
    "note": "固定版の実行入口とNoahの依頼・結果・停止APIへの対応が必要。",
    "reference": "https://github.com/ghostwright/phantom",
    "checkedAt": "2026-11-16"
  },
  "research-24684c1ecca249c03e58": {
    "id": "research-24684c1ecca249c03e58",
    "name": "google-gemini/gemini-cli",
    "mode": "account",
    "requirements": "Geminiの本人ログインまたは利用可能なAPI設定",
    "note": "認証済みCLIとNoahの実行記録の接続が必要。",
    "reference": "https://github.com/google-gemini/gemini-cli",
    "checkedAt": "2026-11-16"
  },
  "research-3c87705c98eedbc929a4": {
    "id": "research-3c87705c98eedbc929a4",
    "name": "google/artemis",
    "mode": "local",
    "requirements": "ADB接続したAndroid試験端末、画面認識モデル、端末操作の許可",
    "note": "固定版の処理入口と必要なモデル・権限の確認が必要。",
    "reference": "https://github.com/google/artemis",
    "checkedAt": "2026-11-16"
  },
  "research-abd23f5f9fcf0501fc07": {
    "id": "research-abd23f5f9fcf0501fc07",
    "name": "google/ehr-navigator-agent-with-medgemma",
    "mode": "account",
    "requirements": "Google Cloud/MedGemma、権限のあるFHIRデータ環境",
    "note": "本人の認証と合成医療データでの接続試験が必要。",
    "reference": "https://huggingface.co/spaces/google/ehr-navigator-agent-with-medgemma",
    "checkedAt": "2026-11-16"
  },
  "research-d2fc479804301a66d2d8": {
    "id": "research-d2fc479804301a66d2d8",
    "name": "GPT Researcher",
    "mode": "account",
    "requirements": "モデル、検索サービスの利用設定",
    "note": "調査先への通信と検索認証をNoahの権限管理へ接続する必要がある。",
    "reference": "https://github.com/assafelovic/gpt-researcher",
    "checkedAt": "2026-11-16"
  },
  "research-5fadfef082632d30513d": {
    "id": "research-5fadfef082632d30513d",
    "name": "gptme/gptme",
    "mode": "local",
    "requirements": "このMacの隔離実行環境と既存ローカルモデル",
    "note": "Noahの実行アダプターに対応。接続後に依頼を入力する。",
    "reference": "https://github.com/gptme/gptme",
    "checkedAt": "2026-11-16"
  },
  "research-9b00f109c8922c01ae75": {
    "id": "research-9b00f109c8922c01ae75",
    "name": "Harvey",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.harvey.ai",
    "checkedAt": "2026-11-16"
  },
  "research-54a13a8785508a8ae4fc": {
    "id": "research-54a13a8785508a8ae4fc",
    "name": "Heartsync/open-deep-research",
    "mode": "account",
    "requirements": "モデル接続、HF認証、SerpAPI等の調査設定",
    "note": "公開デモ停止中。検索・ファイル入力を含む実行接続が必要。",
    "reference": "https://huggingface.co/spaces/Heartsync/open-deep-research",
    "checkedAt": "2026-11-16"
  },
  "research-27254956e417e563e560": {
    "id": "research-27254956e417e563e560",
    "name": "HKUDS/DeepTutor",
    "mode": "local",
    "requirements": "教材データ、モデル・埋め込み・用途別ツール",
    "note": "教材取込と実行APIの接続が必要。",
    "reference": "https://github.com/hkuds/deeptutor",
    "checkedAt": "2026-11-16"
  },
  "research-a6f998d4efb0307b4707": {
    "id": "research-a6f998d4efb0307b4707",
    "name": "HKUDS/nanobot",
    "mode": "local",
    "requirements": "このMacの隔離実行環境と既存ローカルモデル",
    "note": "Noahの実行アダプターに対応。接続後に依頼を入力する。",
    "reference": "https://github.com/hkuds/nanobot",
    "checkedAt": "2026-11-16"
  },
  "research-9a3562ba0882fa6498dc": {
    "id": "research-9a3562ba0882fa6498dc",
    "name": "hsliuping/TradingAgents-CN",
    "mode": "account",
    "requirements": "対応モデル、金融データの利用設定",
    "note": "分析用データ取得と結果回収の対応が必要。実売買の接続は含まない。",
    "reference": "https://github.com/hsliuping/tradingagents-cn",
    "checkedAt": "2026-11-16"
  },
  "research-cd84ba392e4256dfbdfc": {
    "id": "research-cd84ba392e4256dfbdfc",
    "name": "HyperCluster/Fara-BrowserUse",
    "mode": "resource",
    "requirements": "ブラウザー・画面操作モデルの実行環境",
    "note": "公開デモ停止中。隔離ブラウザーとNoahの入出力接続が必要。",
    "reference": "https://huggingface.co/spaces/HyperCluster/Fara-BrowserUse",
    "checkedAt": "2026-11-16"
  },
  "research-abd020b4446c057af9bc": {
    "id": "research-abd020b4446c057af9bc",
    "name": "ibm-research/cuga-agent",
    "mode": "local",
    "requirements": "CUGA環境、モデルと対象ツール",
    "note": "公開デモの稼働と本人用の利用可能性は別。固定版と実行APIの対応が必要。",
    "reference": "https://huggingface.co/spaces/ibm-research/cuga-agent",
    "checkedAt": "2026-11-16"
  },
  "research-8d78f36dcae2cc337727": {
    "id": "research-8d78f36dcae2cc337727",
    "name": "Indigenius Agents Studio",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://indigenius.ai",
    "checkedAt": "2026-11-16"
  },
  "research-79785d8250a21b378c5e": {
    "id": "research-79785d8250a21b378c5e",
    "name": "JAPAN AI AGENT",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://japan-ai.co.jp/agent",
    "checkedAt": "2026-11-16"
  },
  "research-6183f60663fe709319a0": {
    "id": "research-6183f60663fe709319a0",
    "name": "jd-opensource/joyagent-jdgenie",
    "mode": "local",
    "requirements": "公式サーバー・ツールサービス、モデル接続",
    "note": "サービス群の導入とNoahからのタスク実行・停止の対応が必要。",
    "reference": "https://github.com/jd-opensource/joyagent-jdgenie",
    "checkedAt": "2026-11-16"
  },
  "research-eebda39d7c180eda9fc8": {
    "id": "research-eebda39d7c180eda9fc8",
    "name": "Jio Haptik",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.haptik.ai",
    "checkedAt": "2026-11-16"
  },
  "research-0c7e03529fdb99884973": {
    "id": "research-0c7e03529fdb99884973",
    "name": "jupyter-agent/jupyter-agent",
    "mode": "account",
    "requirements": "E2B APIキー、HF認証、分析する入力",
    "note": "公式処理はE2Bでノートブックを動かす。両サービスの本人設定が必要。",
    "reference": "https://huggingface.co/spaces/jupyter-agent/jupyter-agent",
    "checkedAt": "2026-11-16"
  },
  "research-e1075e675316492e2017": {
    "id": "research-e1075e675316492e2017",
    "name": "katiue/browser-use-webui",
    "mode": "resource",
    "requirements": "隔離ブラウザー、モデルと利用先の認証",
    "note": "公開デモは実行エラー。ブラウザー環境と接続APIの対応が必要。",
    "reference": "https://huggingface.co/spaces/katiue/browser-use-webui",
    "checkedAt": "2026-11-16"
  },
  "research-a6748c2555be852bf9e0": {
    "id": "research-a6748c2555be852bf9e0",
    "name": "kecbigmt/docgent",
    "mode": "account",
    "requirements": "Slack App、GitHub App、課金設定済みGoogle Cloud",
    "note": "Slack/GitHubの権限とWebhook設定が必要。投稿・PR作成の実処理は未試験。",
    "reference": "https://github.com/kecbigmt/docgent",
    "checkedAt": "2026-11-16"
  },
  "research-b0c03eff06822b7da0e1": {
    "id": "research-b0c03eff06822b7da0e1",
    "name": "lealone/Lealone",
    "mode": "local",
    "requirements": "Java実行環境、サーバー設定",
    "note": "単体Agentとしての実行入口・モデルと処理内容の特定が必要。",
    "reference": "https://github.com/lealone/lealone",
    "checkedAt": "2026-11-16"
  },
  "research-c2eb6eb3ed6c5b5f0ca6": {
    "id": "research-c2eb6eb3ed6c5b5f0ca6",
    "name": "li-xiu-qi/data_analysis_agent",
    "mode": "local",
    "requirements": "Pythonデータ分析環境、モデル接続",
    "note": "入力文中の数値を扱う固定版アダプターを開発中。",
    "reference": "https://github.com/li-xiu-qi/data_analysis_agent",
    "checkedAt": "2026-11-16"
  },
  "research-f7ba3d05614ad1017b24": {
    "id": "research-f7ba3d05614ad1017b24",
    "name": "Lindy",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.lindy.ai",
    "checkedAt": "2026-11-16"
  },
  "research-600589e734b59ec26e23": {
    "id": "research-600589e734b59ec26e23",
    "name": "lvwerra/agent-ui",
    "mode": "local",
    "requirements": "公式UIのバックエンドとモデル設定",
    "note": "UIの公開だけでは業務実行できない。バックエンド接続条件の確定が必要。",
    "reference": "https://huggingface.co/spaces/lvwerra/agent-ui",
    "checkedAt": "2026-11-16"
  },
  "research-18aecaa2e7a3b2b83cb1": {
    "id": "research-18aecaa2e7a3b2b83cb1",
    "name": "lvwerra/jupyter-agent-2",
    "mode": "account",
    "requirements": "E2B APIキー、HF認証",
    "note": "公式ノートブック実行環境の本人設定と結果回収が必要。",
    "reference": "https://huggingface.co/spaces/lvwerra/jupyter-agent-2",
    "checkedAt": "2026-11-16"
  },
  "research-66b9093a837a358a666b": {
    "id": "research-66b9093a837a358a666b",
    "name": "m-ric/agent-data-analyst",
    "mode": "account",
    "requirements": "HFモデル認証、CSV入力、科学計算環境",
    "note": "公開デモは実行エラー。公式コードの認証・入力・図表出力への対応が必要。",
    "reference": "https://huggingface.co/spaces/m-ric/agent-data-analyst",
    "checkedAt": "2026-11-16"
  },
  "research-b0ee72991a58ee1b4354": {
    "id": "research-b0ee72991a58ee1b4354",
    "name": "m-ric/open_Deep-Research",
    "mode": "account",
    "requirements": "HF認証、SerpAPI等の調査設定",
    "note": "公開デモ停止中。研究ツールの認証と外部検索への接続が必要。",
    "reference": "https://huggingface.co/spaces/m-ric/open_Deep-Research",
    "checkedAt": "2026-11-16"
  },
  "research-d3414794302313051ff0": {
    "id": "research-d3414794302313051ff0",
    "name": "Manus",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://manus.im",
    "checkedAt": "2026-11-16"
  },
  "research-f43f9ebb722404a94e8d": {
    "id": "research-f43f9ebb722404a94e8d",
    "name": "minorun365/m365-agent",
    "mode": "account",
    "requirements": "AWS Bedrock/AgentCore、Microsoft Entra IDとM365の本人認証",
    "note": "クラウド資源と本人のOutlook等の権限設定が必要。",
    "reference": "https://github.com/minorun365/m365-agent",
    "checkedAt": "2026-11-16"
  },
  "research-e7ea3eff20f3f9ae98c5": {
    "id": "research-e7ea3eff20f3f9ae98c5",
    "name": "Mintplex-Labs/anything-llm",
    "mode": "local",
    "requirements": "モデル・埋め込み設定、ワークスペースと資料",
    "note": "公式サーバーAPIと資料入出力の接続が必要。",
    "reference": "https://github.com/mintplex-labs/anything-llm",
    "checkedAt": "2026-11-16"
  },
  "research-7b10bd3159301e47e849": {
    "id": "research-7b10bd3159301e47e849",
    "name": "N1nEmAn/sapper-v2",
    "mode": "lab",
    "requirements": "許可された専用競技環境、CLI Agent、モデル認証",
    "note": "公式起動には競技APIが必須。一般業務向け基盤への置換は別製品となるため、このAgentの実行合格にはしない。",
    "reference": "https://github.com/n1neman/sapper-v2",
    "checkedAt": "2026-11-16"
  },
  "research-37c32873c163df122fc4": {
    "id": "research-37c32873c163df122fc4",
    "name": "nanocoai/nanoclaw",
    "mode": "account",
    "requirements": "公式ランタイム、モデルと利用するチャネルの認証",
    "note": "公式の隔離実行方式とNoahの権限・Workの結線が必要。",
    "reference": "https://github.com/nanocoai/nanoclaw",
    "checkedAt": "2026-11-16"
  },
  "research-a17476e9d79551521382": {
    "id": "research-a17476e9d79551521382",
    "name": "NousResearch/hermes-agent",
    "mode": "resource",
    "requirements": "64K以上のコンテキストを確保できるモデル実行環境",
    "note": "公式0.19.0を起動試験。現在の8K実行設定では本体が拒否するため、実行対応には含めない。",
    "reference": "https://github.com/nousresearch/hermes-agent",
    "checkedAt": "2026-11-16"
  },
  "research-adc2fb98c295eaf3fc52": {
    "id": "research-adc2fb98c295eaf3fc52",
    "name": "OpenAI Codex",
    "mode": "account",
    "requirements": "このMacの公式Codexへの本人ログイン",
    "note": "本人のCodexへ依頼し、隔離作業領域でファイルを作成。送信内容と契約枠の利用を確認して実行する。",
    "reference": "https://developers.openai.com/blog/codex-as-a-platform",
    "checkedAt": "2026-11-17"
  },
  "research-d9330c307f7dbfb63c2f": {
    "id": "research-d9330c307f7dbfb63c2f",
    "name": "OpenHands",
    "mode": "local",
    "requirements": "このMacの隔離実行環境と既存ローカルモデル",
    "note": "Noahの実行アダプターに対応。接続後に依頼を入力する。",
    "reference": "https://github.com/openhands/openhands",
    "checkedAt": "2026-11-16"
  },
  "research-08088d5dc1e4f9c81059": {
    "id": "research-08088d5dc1e4f9c81059",
    "name": "OpenRaiser/NanoResearch",
    "mode": "account",
    "requirements": "モデル、論文・検索サービスの利用設定",
    "note": "検索と研究処理の通信・認証・結果回収の対応が必要。",
    "reference": "https://github.com/openraiser/nanoresearch",
    "checkedAt": "2026-11-16"
  },
  "research-8c24d2dc729748abf2e0": {
    "id": "research-8c24d2dc729748abf2e0",
    "name": "pankona/makasero",
    "mode": "account",
    "requirements": "GitHub Actionsの対象リポジトリ権限、GEMINI_API_KEY",
    "note": "リポジトリのワークフローとして実行する。本人の対象選択と接続が必要。",
    "reference": "https://github.com/pankona/makasero",
    "checkedAt": "2026-11-16"
  },
  "research-88a603f6573126fa493c": {
    "id": "research-88a603f6573126fa493c",
    "name": "PHPer8080/ec-analytics-agent",
    "mode": "account",
    "requirements": "Google Cloud、Gemini、BigQuery、対象Data Agent",
    "note": "本人のクラウド設定と参照を許可するデータの指定が必要。",
    "reference": "https://github.com/phper8080/ec-analytics-agent",
    "checkedAt": "2026-11-16"
  },
  "research-8ba5b0ef7554f00b17e5": {
    "id": "research-8ba5b0ef7554f00b17e5",
    "name": "plandex-ai/plandex",
    "mode": "local",
    "requirements": "Plandexサーバー、モデルの接続設定",
    "note": "サーバーとCLI間の接続、Noahの実行・成果・停止対応が必要。",
    "reference": "https://github.com/plandex-ai/plandex",
    "checkedAt": "2026-11-16"
  },
  "research-dbdde6b88e3ec3e235ad": {
    "id": "research-dbdde6b88e3ec3e235ad",
    "name": "RightNow-AI/openfang",
    "mode": "local",
    "requirements": "公式OpenFang実行器、モデル接続",
    "note": "固定版の隔離実行APIを開発中。",
    "reference": "https://github.com/rightnow-ai/openfang",
    "checkedAt": "2026-11-16"
  },
  "research-666aba9d744833a3291f": {
    "id": "research-666aba9d744833a3291f",
    "name": "SanMuzZzZz/LuaN1aoAgent",
    "mode": "lab",
    "requirements": "モデル、許可された試験対象、隔離したExecutor",
    "note": "所有する検証環境内の合成試験とNoahの実行境界への接続が必要。",
    "reference": "https://github.com/sanmuzzzzz/luan1aoagent",
    "checkedAt": "2026-11-16"
  },
  "research-e73eaca90328a1cd8a5f": {
    "id": "research-e73eaca90328a1cd8a5f",
    "name": "Sarvam / Indus Cowork・Voice Agents",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.sarvam.ai",
    "checkedAt": "2026-11-16"
  },
  "research-4f93e98b2f89f35b2508": {
    "id": "research-4f93e98b2f89f35b2508",
    "name": "ServiceNow AI Agents",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://www.servicenow.com/products/ai-agents.html",
    "checkedAt": "2026-11-16"
  },
  "research-0bbd6ee9b79a0fcbf123": {
    "id": "research-0bbd6ee9b79a0fcbf123",
    "name": "shun-shobon/luna-chat",
    "mode": "account",
    "requirements": "Discord Bot Token、ChatGPT本人ログイン、pi実行環境",
    "note": "本人のDiscord接続が必要。外部への自動送信はまだ有効化しない。",
    "reference": "https://github.com/shun-shobon/luna-chat",
    "checkedAt": "2026-11-16"
  },
  "research-cbcdc68d1b5d7d1ea5a2": {
    "id": "research-cbcdc68d1b5d7d1ea5a2",
    "name": "Sierra",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://sierra.ai",
    "checkedAt": "2026-11-16"
  },
  "research-8f223a76007822e85943": {
    "id": "research-8f223a76007822e85943",
    "name": "simoncck/my-browser-use-server",
    "mode": "account",
    "requirements": "モデルAPIキー、隔離ブラウザー",
    "note": "公開デモは実行エラー。公開実装はモデルキーなしでの実行を拒否する。",
    "reference": "https://huggingface.co/spaces/simoncck/my-browser-use-server",
    "checkedAt": "2026-11-16"
  },
  "research-fa06c8f85587bf3006f8": {
    "id": "research-fa06c8f85587bf3006f8",
    "name": "smolagents/computer-agent",
    "mode": "account",
    "requirements": "E2Bデスクトップ、HFモデル認証",
    "note": "公開デモ停止中。公式のリモートデスクトップ処理と認証の接続が必要。",
    "reference": "https://huggingface.co/spaces/smolagents/computer-agent",
    "checkedAt": "2026-11-16"
  },
  "research-f313148368388af232c6": {
    "id": "research-f313148368388af232c6",
    "name": "smolagents/computer-use-agent",
    "mode": "resource",
    "requirements": "画面操作モデルと隔離デスクトップ",
    "note": "公開デモ停止中。モデル・デスクトップの実行環境への対応が必要。",
    "reference": "https://huggingface.co/spaces/smolagents/computer-use-agent",
    "checkedAt": "2026-11-16"
  },
  "research-b9cd67bc1917c8d4de25": {
    "id": "research-b9cd67bc1917c8d4de25",
    "name": "swjybky/deepwrite",
    "mode": "desktop",
    "requirements": "デスクトップ本体、モデル、用途に合うライセンス",
    "note": "公式配布の個人利用とNoahでのサービス提供は条件が異なる。自動起動・成果回収は未対応。",
    "reference": "https://github.com/swjybky/deepwrite",
    "checkedAt": "2026-11-16"
  },
  "research-bdec20ae6527d6fdc3ae": {
    "id": "research-bdec20ae6527d6fdc3ae",
    "name": "TeamWiseFlow/xiaobei",
    "mode": "account",
    "requirements": "OpenClaw実行環境、本人のチャネルログイン、モデル設定",
    "note": "WeChat等のログインと用途別ツールの設定が必要。",
    "reference": "https://github.com/teamwiseflow/xiaobei",
    "checkedAt": "2026-11-16"
  },
  "research-8ed2cce02536b2fac870": {
    "id": "research-8ed2cce02536b2fac870",
    "name": "tinyhumansai/openhuman",
    "mode": "local",
    "requirements": "公式実行器、モデルと用途別ツール設定",
    "note": "固定版の隔離実行とNoahの成果・停止への対応が必要。",
    "reference": "https://github.com/tinyhumansai/openhuman",
    "checkedAt": "2026-11-16"
  },
  "research-e9c77aaaf58c6a67cb67": {
    "id": "research-e9c77aaaf58c6a67cb67",
    "name": "Tsitsi19/V0ID-SHIELD-OPENMANUS",
    "mode": "resource",
    "requirements": "公式実行環境、モデル・用途別ツール",
    "note": "公開デモ停止中。固定版の起動・依頼・結果回収の対応が必要。",
    "reference": "https://huggingface.co/spaces/Tsitsi19/V0ID-SHIELD-OPENMANUS",
    "checkedAt": "2026-11-16"
  },
  "research-b0d327628dfb442e4ac3": {
    "id": "research-b0d327628dfb442e4ac3",
    "name": "vxcontrol/pentagi",
    "mode": "lab",
    "requirements": "専用の検証環境、PostgreSQL、モデル、許可された試験対象",
    "note": "隔離された所有環境での試験が必要。一般の接続先への検証は開始しない。",
    "reference": "https://github.com/vxcontrol/pentagi",
    "checkedAt": "2026-11-16"
  },
  "research-789c22d09d8c4e91edec": {
    "id": "research-789c22d09d8c4e91edec",
    "name": "wangzan101/Mika",
    "mode": "android",
    "requirements": "Androidアプリ、端末権限、モデル接続",
    "note": "Android端末上で動く。現在のMac実行ホストでは動作試験できない。",
    "reference": "https://github.com/wangzan101/mika",
    "checkedAt": "2026-11-16"
  },
  "research-393b110bb6f8d67f876a": {
    "id": "research-393b110bb6f8d67f876a",
    "name": "wangzhishou/OneBox",
    "mode": "android",
    "requirements": "Androidアプリとローカルモデル、またはモデル認証",
    "note": "Android端末内で動く。現在のMac実行ホストへの実行対応には含めない。",
    "reference": "https://github.com/wangzhishou/onebox",
    "checkedAt": "2026-11-16"
  },
  "research-486b4feaa201e0539dbd": {
    "id": "research-486b4feaa201e0539dbd",
    "name": "WecoAI/aideml",
    "mode": "resource",
    "requirements": "学習用データ、評価指標、科学計算の依存環境",
    "note": "公式配布はTorch等を含む。現在の隔離VM容量内の実行構成と実データ入出力の対応が必要。",
    "reference": "https://github.com/wecoai/aideml",
    "checkedAt": "2026-11-16"
  },
  "research-d50b1c53d8e77aba8fb9": {
    "id": "research-d50b1c53d8e77aba8fb9",
    "name": "Zenvia",
    "mode": "account",
    "requirements": "提供元の利用アカウント・利用権限、対象ワークスペース",
    "note": "本人の契約・認証と公式の接続仕様を確認してから接続する。現在はNoahからの実行未対応。",
    "reference": "https://zenvia.com",
    "checkedAt": "2026-11-16"
  },
  "research-25a5f6ae5d1576507f83": {
    "id": "research-25a5f6ae5d1576507f83",
    "name": "zhayujie/CowAgent",
    "mode": "local",
    "requirements": "公式cow実行環境、モデル、用途別チャネル",
    "note": "ローカルの実行APIとチャネル別の本人設定が必要。",
    "reference": "https://github.com/zhayujie/cowagent",
    "checkedAt": "2026-11-16"
  }
});
/** @param {unknown} id */
export function requirementsFor(id) {
  if (typeof id !== 'string' || !Object.hasOwn(AGENT_REQUIREMENTS, id)) return null;
  const value = AGENT_REQUIREMENTS[id];
  const recipe = recipeFor(id);
  return { ...value, executable: Boolean(recipe), ...(recipe ? { requirements: recipe.provider ? 'このMacの公式Codexへの本人ログインと専用の隔離実行環境' : 'このMacの隔離環境と既存ローカルモデル（Noahが準備）', note: recipe.capability } : {}) };
}

