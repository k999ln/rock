# 786系列の本番接続・初回受入

2026-11-23 14:10 JST時点。公開先: https://avoado.si/noah/agents/verified

## 配備した範囲

[PR #28](https://github.com/iceiceice999/rock/pull/28)をmainへ統合し、Sites 216の配備成功を確認した。main `3fcf449c26535bb0eb31d9a6034baea0dde023b1`、Sites source `8b004b2cf0bde7a74e6a2744c0259d235e81a15a`の追跡treeはともに `970fefc91be43dfc30e985c869b2f2f4b75fac05`。配備ID `appgdep_6b03c9a62ae08191bf303d26f07df7ca` は2026-11-23 05:06 UTCにsucceeded。

786系列を既存Noahの正規projectへ結び付け、本番APIがtotal=786を返す。全786系列の実行合格ではない。公開APIの接続候補30件を本番で事前確認し、5系列で実際の成果を受領した。10秒ごとの一覧取得、5件の成果確認表示、接続確認のみ15件を本番画面でも確認。

## 本番で受領した成果

| ID | Agent | 実際の確認内容 |
| --- | --- | --- |
| AG0491 | AI Car Assistant | 500 km・8 L/100 km・単価1.5から燃料費60を返した |
| AG0477 | Agentic RAG Chatbot API | 17×23の計算結果391を返した |
| AG0574 | DC Metro Transit Assistant | Metro Center / Red Lineの静的GTFS始終発時刻を返した。現在の運行保証ではない |
| AG0449 | Multi-Agent Research Paper Analysis | RAGの公開論文を検索し、arXiv ID・著者・分析結果を返した |
| AG0734 | Trailhaven AI Shopping Assistant | 架空店舗の商品検索を実行。TH-0016 / Northfork Insulated Vest / 128.99の返答とsearch_products出力が一致。実店舗・購入機能の受入ではない |

5系列とも、本番のsubmit=202、成果保存=200、同じ依頼IDの再送=200（同じ仕事）、再読込で同じ成果を確認。別の新規利用者の結果GETは404。利用者cookieや所有者情報はこの記録に含めない。

AG0495 Sobit AI Research Assistantは提供元のAuthenticationErrorを検知してfailedとなり、利用可能へ昇格しなかった。AG0476はローカルの実接続で回答不能を返し、仕事の成功には数えていない。AG0719はローカルの実接続が失敗、AG0786は対応するGradio実行入口がなく保留。

停止はAG0449でsubmit=202 → stop=200 → 再読込state=stoppedを確認した。最初の停止試験の新規依頼は1分当たりの回数制限で429となったため未実行。制限期間後に再試験した。停止はNoahの成果受領を止めるもので、提供元ですでに始まった計算の停止は保証しない。

## 利用可能表示の条件

実仕事と個別確認した入口の本番成果、同じ提供元ソース版・API定義、成功と接続確認の両方が24時間以内であること。ローカルの結果を本番DBへ注入せず、本番runtimeの仕事終了から状態を記録した。成果本文や利用者情報は公開availabilityへ入れない。失敗・定義変更・確認期限切れで表示を戻す。表示中は10秒更新、画面復帰時にも更新する。画面を閉じた後に10秒間隔のブラウザ更新は続かない。毎時・一度に2件までのメタデータ再確認は一覧要求と既存巡回に連動し、健康確認のための自動推論は行わない。

## 接続保留と継続範囲

全786系列の接続条件をdata/noah-agent-connection-assessment.jsonへ記録した。HF 155件は公開状態/API定義確認。他631件のうち16件は公式資料の個別確認、615件は自動一次選別で、個別実行試験は未完了。外部認証・契約・有料利用・ローカル実行環境の準備が必要な系列は、本番利用可能に数えない。

共有履歴・文書・実行状態や第三者への送信を確認した21 Spaceは、自動接続を保留する。追加判明したAG0553 co-scientist-public-demoは、[app.py](https://huggingface.co/spaces/sdajani/co-scientist-public-demo/blob/54e4e1d3f43bbe288eddd9807348b14e3488c379/app.py#L161)と[run_store.py](https://huggingface.co/spaces/sdajani/co-scientist-public-demo/blob/54e4e1d3f43bbe288eddd9807348b14e3488c379/app/run_store.py#L127)に共通履歴の所有者確認なしの削除入口がある。削除や履歴本文取得は実行していない。本人専用の環境・権限の分離が必要。

## 検証と引継ぎ

PR #28の全体npm run verify、提供元runtime・availability・正規URL照合・UI・DB migration検証が成功。最終head `2c9a3598e43b2b1a3cb3bbc171bd7bef4380d841`のGitHub verify、CodeQL、secrets、regressions/web-securityがすべて成功後に配備した。

追加保留の変更は同じtaskの追補PRで検証・配備する。以後の系列追加は、公開ソースの仕事入口・本人分離・必要権限を確認し、実行→保存→再読込→失敗/停止を検証してから利用可能へ進める。615件の自動一次選別の個別確認、未対応API/CLI用の隔離実行器、必要な提供元認証の接続は未完了。

### 追加候補10件の確認

本番のAPI定義が取得できた未受入候補10件を公開ソースで個別確認した。追加で無条件に実行できるものは0件。既存の共有データ保留11件にAG0553と下表のうち認証条件だけのAG0445を除く9件を加え、21 Spaceを保留する。元の接続確認状態は、保留判定を通した再確認で利用不可へ戻す。

| ID | 本体 | 継続に必要な条件 | 出典 |
| --- | --- | --- | --- |
| AG0493 | AI Coding Crew (Dubberkuro) | 公開AgentがSpace所有者のHF_TOKENを共有し、モデルのtool選択から外部リポジトリ作成・削除・上書き・Secret設定へ進む。read-only制約がない。 | [公開ソース](https://huggingface.co/spaces/Dubberkuro/ai-coding-crew/blob/83ac661fb5849cfa4fc06bee19f77ff22a8bdfa2/app.py#L39) |
| AG0557 | Construction Company AI Assistant | 全利用者が同じConstructionChatbot.memoryを使い、直近5会話が次の回答プロンプトへ入る。clear_chatも共有履歴を消す。 | [公開ソース](https://huggingface.co/spaces/SaiPavankumar22/Construction-Assistant/blob/915b4bdbfdd1f05afd03cab53bbae68345b0f0c1/app.py#L9) |
| AG0773 | GeminiBot Deep Research (regulus1999) | 公開UIはchannel_idなしでDiscord会話DBを検索し、取得内容を回答生成へ投入する。入力を非機密にしても保存済みの他者会話混入を除外できない。 | [公開ソース](https://huggingface.co/spaces/regulus1999/geminibot-research/blob/538bdc246f6bec4605c362bff9ba402cf16a96b6/app.py#L163) |
| AG0642 | Loan Finance Agent (mozhet5550) | 計算toolは純粋関数だがAgentオブジェクトは全利用者共有。reset_agent_memory=Trueは毎回リセットであり利用者別Agent生成ではない。UI/API別経路の同時実行を共通lockで防ぐ証拠がなく、本人分離済みとは判定できない。 | [公開ソース](https://huggingface.co/spaces/mozhet5550/my-ai-agent/blob/91f6b7211ccc41491821a9a2633e5e9ba69319b8/app.py#L147) |
| AG0631 | Julia Browser Agent (rootxhacker) | 全要求がglobal AgentSDK browserを共有する。ページ内容読取りに加えclick/type/submit_formが可能で、利用者別ブラウザやread-only制限が確認できない。 | [公開ソース](https://huggingface.co/spaces/rootxhacker/Julia-browser-Agent/blob/83919b09ba99a49a5504c8fcec09d2293f2bbc97/app.py#L16) |
| AG0151 | Jupyter Agent | ソースはsession_hashごとにSandboxと出力を分離するが、現在Noahの呼出bodyはdataだけでsession_hash未送信。未送信時はNoneキーのsandbox共有・path.join(None)失敗があり得る。fresh session_hash対応後に限定試験を検討可能。Sandbox終了処理は見当たらず即時低負荷の無条件推奨はしない。 | [公開ソース](https://huggingface.co/spaces/jupyter-agent/jupyter-agent/blob/0f4c8887910436addc17af423de610b2f03dcd51/app.py#L25) |
| AG0445 | Multi-Agent Deep Researcher (MCP Hackathon) | 本体run_researchはTavily鍵に加え選択モデルのGeminiまたはOpenRouter鍵を入力必須とし、空欄は明示的に拒否する。鍵なしの公開実試験不可。 | [公開ソース](https://huggingface.co/spaces/Agents-MCP-Hackathon/multi-agent_deep-research/blob/8e728b961c638d18fbbff2c9ca01eb218e03b842/mcp_server.py#L368) |
| AG0681 | PaperLens | AgentとLLMClientは1要求ごとに作るが、出力PDFがoutputs/paperlens_<paper_id>.pdf共通パス。同じ論文の別要求の出力衝突を排除できず、今回の本人分離条件を満たさない。実際の他者成果漏えいは未検証。 | [公開ソース](https://huggingface.co/spaces/Ethan-WZ/ResearchPaperAgent/blob/c8c6f371d43983e1800c7b5d6637a82451171f8c/src/paperlens/ui.py#L129) |
| AG0785 | VGR Assistant (Mavigal) | Mistralで非公開HFデータセット中の説教コーパスを検索し、質問・回答をログへ記録してCommitSchedulerでHF datasetへ定期書込みする。厳密な公開データのみ・外部書込みなしの今回の試験条件外。会話自体はgr.Stateだが共有question-cacheもある。 | [公開ソース](https://huggingface.co/spaces/Mavigal/VGR_Assistant_EN/blob/a9f3174a23d326a647e9184e148ae443482a222f/app.py#L10) |
| AG0458 | Agente Financeiro Davi | 全要求が共通transacoes.jsonを読み、取引全件の一覧や固定relatorio.pdf/csv出力toolを利用できる。資料が合成/公開データである保証と本人分離が確認できない。取引データ自体は調査で読んでいない。 | [公開ソース](https://huggingface.co/spaces/daviccoimbra/agente-financeiro-Davi/blob/d53e18b6a315f0163859f570541eaa714bd2facd/app.py#L13) |

公開ソースだけを読み、共有履歴・非公開データ・鍵の中身は取得していない。外部への実行POSTも行っていない。AG0151の推論上限はソース上5回。利用者ごとのsession_hash、sandbox終了、成果の所有分離を整えた後に改めて試験する。
