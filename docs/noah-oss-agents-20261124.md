# オープンソースの、自分で動く Agent（2026-11-24）

[外にある Agent の実測（2026-11-20）](noah-agent-census-20261120.md) の続き。11-20 は MCP の公式台帳（67,703 件）と、調べた 85 件の分類だった。ここでは、目的を渡すと自分で手順を進めるオープンソースの Agent のうち、2026 年 10 月の時点で大きい物を並べ、Noah で何に使えるかと、もっと良い組み合わせを書く。**動かしていない。星の数は記事が数えた時点の物で、GitHub の API では確かめていない（この環境からは API が使えない）。**

## 1. 本人の言葉と答え

> もっといい組み合わせを考える。オープンソースのエージェントってさ、今何があるんやろ、そもそも。把握できてないよね。うん。調べてみよう。（2026-11-24 07:01）

| 問い | 本人の答え（2026-11-24） |
| --- | --- |
| 何を数えるか | 自分で動くエージェント（単発の道具の MCP は 11-20 の実測で数えた） |

## 2. 一覧

星は、2026-10-02 の数（[Octomind](https://octomind.run/blog/open-source-ai-agents)）と、2026-10-16 の数（[Glukhov](https://www.glukhov.org/developer-tools/comparisons/trending-open-source-ai-projects/)）、2026-08-04 の数（[Digital Applied](https://www.digitalapplied.com/blog/best-open-source-ai-agent-projects-github-2026)）から取った。「11-20」の列は、[11-20 の実測](noah-agent-census-20261120.md) 6 章の分類。

| 種類 | 名前（repo） | 星（数えた日） | ライセンス | 何をするか | 11-20 |
| --- | --- | ---: | --- | --- | --- |
| 本人の常駐 | OpenClaw（openclaw/openclaw） | 392,126（10-16） | MIT | 自分の機械で動き、20 以上のチャットの窓口から頼める本人の Agent | 無し（`lib/noah-agent-requirements.mjs` に名前だけ） |
| 本人の常駐 | Hermes Agent（NousResearch/hermes-agent） | 254,122（10-16） | MIT | 使うほど技能と記憶が貯まる。決まった時刻の仕事（cron）も回す | ターミナル型。Noah のクラウドで公式の SDK を動かしている（[task 125](../codex/tasks/125-noah-cloud-agents.md)） |
| 本人の常駐 | DeepSeek Harness（deepseek-ai/deepseek-harness） | 242,000（10-02） | MIT | 差し込み式の Agent の土台と Web の画面。開発者向けの試し版 | 対応済み |
| 作る（コード） | OpenCode（anomalyco/opencode） | 213,922（10-16） | MIT | ターミナルでコードを書く Agent。75 以上のモデルの提供元 | 無し |
| 作る（コード） | Codex CLI（openai/codex） | 129,395（10-16） | Apache-2.0 | ターミナルでコードを書く Agent | 対応済み |
| 作る（コード） | Gemini CLI（google-gemini/gemini-cli） | 107,389（10-16） | Apache-2.0 | ターミナルでコードを書く Agent | ターミナル型 |
| 作る（コード） | OpenHands（OpenHands/OpenHands） | 91,004（10-16） | MIT | 作業の繰り返しと画面を持つ開発の Agent。決まった時刻の自動化も | SDK は対応済み |
| 作る（コード） | Cline（cline/cline） | 70,370（10-16） | Apache-2.0 | 編集器・CLI・SDK の Agent。既定では変更と命令に承認が要る | SDK は対応済み |
| 作る（コード） | Open Interpreter（openinterpreter/openinterpreter） | 68,500（10-02） | Apache-2.0 | Codex を元にした Rust の Agent。ほかの Agent の動かし方をまねる命令がある（Octomind の説明） | 無し |
| 作る（コード） | Goose（aaif-goose/goose） | 55,324（10-16） | Apache-2.0 | 手元の汎用 Agent。70 以上の MCP の拡張 | 対応済み |
| 作る（コード） | Aider（Aider-AI/aider） | 49,300（10-02） | Apache-2.0 | 変更のたびに git に残す、ペアプログラミングの Agent | 対応済み |
| 画面を操作 | browser-use（browser-use/browser-use） | 117,000（10-02） | MIT | Agent がブラウザを動かすための Python の土台 | Space 版だけ（止まっていた） |
| 画面を操作 | Stagehand（Browserbase） | 23,753（08-04） | MIT | ブラウザの自動化の土台 | 無し |
| 画面を操作 | Skyvern | 22,695（08-04） | AGPL-3.0 | ブラウザで申込の画面などを進める | 無し（名前だけ） |
| 画面を操作 | Cua | 20,994（08-04） | MIT | OS をまたいで画面を操作する土台 | 無し |
| 調べる | DeerFlow（bytedance/deer-flow） | 83,300（10-02） | MIT | 計画を立て、下の Agent を分け、箱の中でコードを動かして、調べ物を報告にする | サーバー型 |
| 調べる | GPT-Researcher | 28,868（08-04） | Apache-2.0 | 深く調べる Agent | ターミナル型 |
| 調べる | STORM（Stanford） | 30,813（08-04） | MIT | 調べて長い記事を書く（最後の更新 2025-09-30） | 無し |
| 取り込む | Firecrawl（firecrawl/firecrawl） | 191,908（10-16） | AGPL-3.0 | Web の頁を Agent が使えるデータにする | 無し |
| 動画を作る | MoneyPrinterTurbo（harry0703/MoneyPrinterTurbo） | 約 101,000（[記事](https://dev.to/creeta/101k-stars-and-cant-do-long-form-moneyprinterturbos-limit-26jk)） | MIT | 語 1 つから縦・横の短い動画を作る。台本（DeepSeek・Qwen・Gemini・Ollama）、無料の素材（Pexels・Pixabay）、声（Edge TTS ほか）、字幕、FFmpeg。TikTok・Instagram・ショートへ出せる。長い動画の構成は苦手。v1.3.3（2026-07-24） | 無し |
| 流れを組む | n8n | 199,652（08-04） | Sustainable Use License（OSI のオープンソースではない） | AI の部品を持つ自動化の流れ | 無し（`lib/sky-gig-offers.ts` などに名前） |
| 流れを組む | Langflow（langflow-ai/langflow） | 155,500（10-02） | MIT | 見て組む土台。1 つの流れを API と MCP の口で出せる | 無し |
| 流れを組む | Activepieces | 23,614（08-04） | MIT | 自動化の流れ | 無し |
| 記憶 | Mem0（mem0ai/mem0） | 67,243（10-16） | Apache-2.0 | Agent と画面のための本人と会話の記憶 | 無し |
| 記憶 | Letta（letta-ai/letta） | 25,156（10-16） | Apache-2.0 | 記憶が中にある Agent の土台 | 無し |
| 健康（目的型） | SparkyFitness（CodeWithCJ/SparkyFitness） | 記事に無し | 記事に無し | 自分で置ける MyFitnessPal の代わり。食事・運動・体重の記録、目標、毎日の確認、写真から食事を記録する AI の栄養の相談（試し版） | 無し |
| 健康（目的型） | HiMe（thinkwee/HiMe） | 記事に無し | 論文に無し | 自分で置ける健康の Agent。スマホと時計の心拍・睡眠などを読み、決まった時刻の仕事と見張りを回す（[arXiv 2607.21019](https://www.alphaxiv.org/abs/2607.21019.md)、2026-07-23） | 無し |

自分で組む土台（自分では動かない）: LangChain 147,400・AutoGen 61,300（保守だけ）・CrewAI 59,300・LangGraph 42,600・Agno 42,500・smolagents 29,600・OpenAI Agents SDK 29,800・Google ADK 21,700・Pydantic AI 20,300・Microsoft Agent Framework 13,900（どれも 10-02）。AutoGPT は 187,598（10-16。`autogpt_platform` の中は Polyform Shield）。

## 3. もっと良い組み合わせ

[07 の 2026-11-24（2 回目）⑦](structure/07-decisions-from-minutes.md) のとおり、見込みの利益で並べる。数は [稼ぐ設計図の見積もり](noah/business-blueprints-average.md)。

1. **動画の稼ぐ設計図を、作る費用の小さい形にする。** 調べる（DeerFlow か GPT-Researcher）→ 動画を作る（MoneyPrinterTurbo。無料の素材と声）→ 出す（TikTok は本人が押す。[spec-122](noah/spec-122-business-blueprints.md) 3 章）→ 成果を読む。今のコードは動画を月 3,000 円と置いていて、94 件の動画の設計図は 1 年目の見込みでは赤字。月 300 円で作れれば、後回しを除く 452 件を全部回した時の月の利益は −178,805 円から +121,795 円に変わる（真ん中の見積もり）。
2. **全部の設計図を止めている 2 つの工程を埋める。** [spec-122](noah/spec-122-business-blueprints.md) の 2026-11-22 の結果では、市場調査と成果の読み取りが 433 件すべてを止めている。市場調査 = DeerFlow・GPT-Researcher（公開の頁は Firecrawl）。成果の読み取り = browser-use か Stagehand で、本人がサインインしたブラウザの ASP・売り場の画面を読む（サインインと口座は本人。Codex の PR #374 は Chrome で ASP を読んでいる）。どれも 5 章の「確かめる」（見本の仕事と決まった検査）を通してから使う。
   - 2026-11-27 追記: 2 つとも、Eve の部品で埋まった（2026-11-24、task 130）。`data/noah-business-capabilities.json` の `research.market` = `eve-part:keyword-research`、`tracking.results` = `eve-part:results-csv`（成果は、ASP から書き出した CSV を読む）。部品は手元の Qwen で確かめた版なので、別のモデルで動かす時は確かめ直す。DeerFlow・browser-use は、部品で足りない時（画面を直に読む・深く調べる）の次の候補として残す。
3. **目的型（ヘルスケアなど）は、記憶と決まった時刻の仕事を持つ常駐の Agent に、記録の道具をつなぐ。** 例「1 キロ痩せたい」: Hermes Agent（記憶と cron。Noah のクラウドで動いている）＋ SparkyFitness か HiMe（食事・体重・睡眠の記録）＋ 本人が使うチャットの窓口（LINE など）。毎日の確認と週の振り返りを回し、目標に届いたら完成。値段は一旦無料（本人回答 2026-11-24）。医療の判断に当たる事（診断・薬の指示）は言わない。
4. **Eve が足りない Agent を作る時の作り手。** OpenCode・Codex CLI・OpenHands を箱の中で動かす（[spec-122](noah/spec-122-business-blueprints.md) 5 章の 3）。アプリの設計図（App Store × 5）もこれで作る。
5. **本人ごとの記憶。** 複数の Agent が同じ本人の文脈を使う時は Mem0 か Letta。健康の記録は本人の側に置く（扱いの決まりは別に決める）。

## 4. 気をつける事

- ライセンス: Firecrawl と Skyvern は AGPL-3.0（ネットワークで使わせると、変えたソースを出す義務）。n8n は OSI のオープンソースではない。AutoGPT の `autogpt_platform` は Polyform Shield。Noah の中で動かす前に、1 件ずつ条件を確かめる。
- 星の数は記事の時点の物。動かしていないので、役に立つか・安全か・続くかは分からない（11-20 の実測 7 章と同じ）。
- SNS への出し方は、各社の決まり（大量の自動投稿・複数のアカウントの使い分けはしない。spec-122 6 章）に従う。

## 5. 出典

- [Octomind: Open Source AI Agents in 2026（2026-10-23。星は 10-02）](https://octomind.run/blog/open-source-ai-agents)
- [Glukhov: Trending Open Source AI Projects on GitHub（2026-10-19。星は 10-16）](https://www.glukhov.org/developer-tools/comparisons/trending-open-source-ai-projects/)
- [Digital Applied: The Best Open-Source AI Agent Projects on GitHub, Mapped（2026-08-04）](https://www.digitalapplied.com/blog/best-open-source-ai-agent-projects-github-2026)
- [MoneyPrinterTurbo の記事（DEV）](https://dev.to/creeta/101k-stars-and-cant-do-long-form-moneyprinterturbos-limit-26jk)
- [SparkyFitness の説明](https://openaitx.github.io/projects/CodeWithCJ/SparkyFitness/README-en.html)
- [HiMe（arXiv 2607.21019）](https://www.alphaxiv.org/abs/2607.21019.md)
