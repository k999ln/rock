## 2026-11-02 — Noahストアと既存モデル管理の接続

本人の指示により、Agent/LLMを探して端末へ追加・実行・更新・削除する入口は[Noahストア設計](noah-agent-model-store-design.md)に統合する。Eveは共通知能、Noahは構成とストア/端末管理を担当し、独立したSkyは設けない。以下のsky系名は既存実装・過去証拠の参照として保持する。manifest/stager/profile pin・Pixel Linux・既存Jobを再利用し、Noahの表示とAI02の状態を対応づける。実行中の旧版pin、成果編集/読戻し、削除と共用blob、Cloud送信承認を維持する。今回のストア一周は未実装/未受入。

<a id="eve-llm-identity"></a>
## Eve LLMの製品定義（2026-10-21本人訂正）

EveはLLMの製品名である。`/os/eve`・`/chat`の画面はEve LLMを使う会話・仕事の入口で、AMCはjob管理、SkyはTool接続、RockstarOS Broker/Engineは権限・承認・実行・費用を担当する。「Eveは単なる窓口でLLMではない」という従前の説明は廃止する。Eveの技術実体は固定されたmodel profile（重み、版、tokenizer、runtime、実行先、評価結果）で識別し、基盤モデル候補を比較できる。Eve NewsはEveのニュース用途profileであり、別ブランドの完成済み重みではない。現時点でEve専用の自社重みは作成・受入されておらず、既存モデルを使う会話経路や局所草稿試作を「Eve LLM完成」と呼ばない。モデル出力は非信頼で、本人承認やTool receiptを生成だけで確定しない。

## 正式名称：Eve（イヴ、旧称Zema）

2026-10-20、利用者の明示指示「zemaじゃなくてeveにしよadamとeveのeve」により、仕事・会話・進捗・承認・停止・成果・使用額を扱う製品の表示名を **Eve** に変更する。名前の由来はAdamとEveのEve。既存のSky、Jennifer、月額16ドルと利用枠、本人承認・保存・復旧の業務契約を引き継ぐ。文中の旧称Zemaは同じ製品の過去名として読む。

既存の`/chat`、`zema`利用権scope、保存キー、`sky-zema-core` package、公開済みの関数/schema/ファイル識別子は互換性のため保持する。名称変更で既存の会話/仕事/成果を消したり、新規サービス契約/追加課金を開始しない。過去の受入証拠・配布物の名称とhashは当時の記録として保持する。Web sourceの表示・名乗りと、Android APK/OS image・公開環境への反映は別に受け入れる。

### EveをSIの一つの窓口に統合

同日の本人追加指示「ジェニファーって何すんのeveでまとめて良くないそれ」「aiじゃなくてsiね」に従い、利用者向けのシステム種別は**SI（スーパーインテリジェンス）**、名前は**Eve**とする。2026-10-21の本人訂正により、EveはLLMの製品名であり、その画面は会話・依頼・計画の確認・実行の依頼/承認・進捗/停止・成果・利用枠/費用を見る入口と定義する。Jennifer localは既存ローカルmodel profileの過去の表示名であり、別の製品/追加契約/独立した利用窓口にしない。model/runtimeの技術的な識別・版・実行場所と本人権限は内部で維持し、Eveの設定で確認/選択する。Eveという名称で未実装の自社重み・推論能力・実行権限・計量接続を完成扱いにしない。

## Skyから本人用Linuxへモデルを配置（2026-10-18）

利用者は追加→環境準備→実行→料金確認→成果持出し→停止を同じSky仕事契約にそろえ、2026-10-19に実行先をPixel本体のLinuxと指定した。画面・仕事の管理・private store・固定GGUF推論を既存Terminal Debian guestへ配置する。先行のPixel画面→PC Linux受入は別証拠。同一Pixelで固定model/文章担当3つの追加、実依頼、費用表示、Download保存、実process停止、Sky終了後の読戻しを限定受入済み。現在は停止済みで、汎用model/任意code/全OSの受入ではない。[11項目の正本](sky-tools-complete-design.md#sky-private-linux-deployment)。一般公開・Cloud課金・全OS受入は保留。

<a id="sky-task-model-selection"></a>
## Skyが作業に適したLLMを選ぶ（2026-10-18明示指示）

2026-10-20追加の管理範囲は[AI・モデル管理契約](ai-native-os-architecture.md#ai-model-management)に従う。既存のMac loopbackの仕事別選定とPixel Linuxの複数GGUF体験は限定的な実例である。共通catalogには出所・版・license・全artifact hash・容量・適合結果と同条件の実測を結び、未測定値を推定値として表示する。Eveの仕事は選定理由と除外理由を残し、資料引用と生成文を区別する。Cloudへの切替は外部送信先・内容・料金の別承認を要し、local失敗時に自動で行わない。AI02・AI05の実装/実機受入は[進捗](../data/project-status.json)で個別に追う。

GPTや特定Providerを必須にしない。既存DecisionRouterが権限/外部送信可否を判定し、その範囲内で作業別のmodelを選ぶ。今回のprivate Mac接続はOllamaの導入済みローカル候補だけを実測し、会議メモ向けの品質・速度・推定容量から選ぶ。選定理由、比較範囲、除外理由を表示し、本人は合格候補へ変更できる。合格候補なしは停止し、Cloudへ自動fallbackしない。合成3問の成績を万能な最適性としない。`lib/sky-model-selector.ts` / `scripts/sky-zoom-local-runtime.mjs`。詳細な11項目契約と未受入は[実Zoomとローカル選定](sky-tools-complete-design.md#sky-zoom-local-runtime)。

本人了承のsuite v2では、要約をローカルLLM、明示された決定・担当を既存形式の見出し抽出コードへ分担する。比較も実行も同じ組合せを用い、modelが作った担当/決定を採用しない。Mac先行版はCPU実行、推定メモリ予算はRAM25%、比較後に候補cacheを解放する。これは実RAM使用量の保証ではない。suite v1のraw model欄の失敗は履歴として保持する。

Ollamaの[導入済み一覧](https://docs.ollama.com/api/tags)と[chat API](https://docs.ollama.com/api/chat)を固定loopback経由で利用する。APIキーやSkyへのログインをモデル実行の条件にしない。既存サービス利用権付きnative管理launcher・Pixel固定profileの受入はそれぞれ独立して維持する。

# avocadoOS — LLM・評価モデル設計

<a id="execution-si-owned-model"></a>
## 実行SI向け自社LLMの設計（2026-10-21）

本人の「LLMを作ろう」「まず設計から」に基づく設計段階の契約。製品上の実行SIはEveから依頼を受け、AMCが仕事の目標・進捗・検収を管理し、Skyの登録済みToolを使って成果を返す。モデルはこの系統に差し込む**交換可能な推論部品**であり、RockstarOSのBroker、Engine、本人承認、課金台帳そのものにはならない。最初の検証対象は「Eveで依頼した一件を、選択済みSky Tool一件で完了し、同じjobへ証拠付きで返す」縦断である。広い意味での超知能や自律的な外部操作を達成済みとは呼ばない。

### 目的・利用体験・責任

Eveは依頼・制約・予算・確認事項を受け、AMCはjob ID、目標、step、検収条件、停止を保持する。自社LLMの第一用途は、許可済みToolの仕様と最小限の資料から、**型付きの作業案・引数候補・不明点・根拠参照**を生成すること。実行SIは候補をBrokerへ渡し、Brokerが本人、利用権、Tool ID/版、入力schema、scope、費用上限、停止世代を再検査する。Engineまたは受入済みSky runnerだけがToolを呼び、実result/receiptをAMCとEveへ返す。LLMが「成功」「承認済み」と書いても、状態や会計を更新しない。ROCKはモデル契約・データ管理・評価・統合、EXTERNALは基盤モデル／推論runtime／計算機の供給条件、JOINTは同一artifactの端末・管理Linux受入、OWNERは学習データの利用許諾、外部送信、予算、実行を決める。

### 入出力・状態・保存

入力は `jobId`、`revision`、本人が許した依頼、許可済みToolのID/版/schema、費用・時間・資料scope、直前の検証済みreceipt、固定した `ModelProfile` ID/版/hash。出力は版付き `PlanCandidate` とし、`proposedSteps`、各stepの `toolId`/入力候補/必要な承認、`evidenceRefs`、`unknowns`、`stopReason` を含める。自由文、Tool結果、Web資料、別Agentの返答を非信頼データとして区切り、未知field、過大出力、存在しないTool、入力外の個人情報、権限昇格要求を拒否する。出力schemaの確定版と最大step数は既存 `contracts/local-ai-runtime.json` とSky runnerの差分を照合して固定する。モデルの自己評価値は承認条件に用いない。

モデルartifact、tokenizer、template、license、出所、全byte hash、量子化、必要RAM/storage、runtime適合、評価suite版をAI02の `ModelProfile` に記録する。jobへprofileを固定し、旧jobの監査・成果はモデルを削除しても読めるようにする。保存するのは必要最小限の入力参照、案、検証結果、実Tool receipt、費用明細であり、原稿・秘密値・生体情報を既定の学習集合へ自動投入しない。学習用の許諾・出所・保持期限・削除要求は実行履歴とは別台帳で扱う。

### 重みの作り方を決める順序

1. **データ契約を先に確定**: 合成のEve→Sky Tool仕事、許諾済み実jobの匿名化例、拒否・停止・結果不明・注入を含む評価例を作る。データごとに出所、利用許諾、個人情報処理、重複除去、訓練／検証／非公開試験の分離を記録する。実利用記録の無断学習はしない。
2. **基準を測る**: 現在の固定Qwen profile、選択可能なローカル／管理Linux候補、決定論的recipeを同じTool schemaと非公開仕事集合で比較する。schema適合、正しいTool選択、必要承認の識別、根拠、実仕事成功率、危険な越権提案、推論時間、peak memory、電力／費用を別々に測る。Pixel、本人用Linux、管理Cloudは別実行場所として記録する。
3. **重みの方式を選ぶ**: 既存の利用許諾が合う公開モデルの追加学習、継続事前学習、重みを一から学習する案を比較する。自社の仕事データ量、計算資源、再現性、権利、維持費と、基準に対する改善が揃うまで方式・規模・ベースモデルを確定しない。「自社LLM」はRockstarOSが版・データ・評価・配備を管理するという製品目標であり、現時点で自社重みが完成したという表示ではない。
4. **段階受入**: host上の非公開評価と安全試験→管理Linuxの隔離推論・費用計測→EveからSky Tool一件の実縦断→適合するPixel/Pro等で個別計測の順。モデル切替は待機中に行い、health失敗は互換のある旧版へ戻す。失効版へは戻さずjobを停止して新revisionで再計画する。ネットワーク断・timeout・部分成功・結果不明の外部作用をモデル判断だけで再実行しない。

### 合格条件と未決定

最初の合格は、固定した非公開仕事集合で現行基準より仕事成功／品質が改善し、越権Tool実行と予算超過が0件で、schema拒否・承認待ち・停止・結果不明・復旧が同一jobのreceiptで説明できること。件数・性能閾値・利用者代表性はデータ集合と対象機器の選定時に先に登録する。外部作用の0件は評価集合内の主張に限り、一般的な安全保証ではない。ROCKが評価手順、OWNERが実仕事/予算/学習許諾、JOINTが対象実行環境を決める。未決定は学習方式、重みの基盤とlicense、データ量、hardware、予算、modelサイズ、端末別配布範囲、長期運用の監視である。

DeepInferは[公式リポジトリ](https://github.com/deepseek-ai/DeepInfer)による**推論framework**候補であり、重みの学習方法やPixel runtimeの決定ではない。対応hardware・model・運用機能を対象の管理Linuxで再確認してから比較する。現時点の状態は `design_only`。学習、weights取得、Provider契約、追加modelの実機受入、本番配備は未実施。

### 公開情報の候補調査（2026-10-21、設計入力）

Hugging Faceの**発行元本人のmodel card**を読み、モデルの存在、配布形態、表示licenseを確認した。下表は採用・端末適合・仕事品質の判定ではない。artifactの正確なrevision、license本文、二次配布条件、量子化版の出所、必要資源は取得前に再照合する。モデルカード内の自己申告benchmarkをEve→Sky Tool仕事の成功率へ読み替えない。

| 候補 | 公開資料で確認した範囲 | 実行SIでの比較位置 |
| --- | --- | --- |
| [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B) | 発行元cardはtext model、Apache-2.0。現行Pixelの固定Q8 profileの系列 | 既存実機profileと決定論的recipeの基準。cardの元weightsとPixel量子化artifactは別に追跡 |
| [Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B) | 発行元cardは画像・文章model、Apache-2.0 | 本人用Linux／Pro／管理Linuxの中型候補。Pixel適合・日本語Tool選択は未測定 |
| [Gemma 4 E2B](https://huggingface.co/google/gemma-4-E2B) | 発行元cardはmultimodal model、Apache-2.0 | 小型の端末候補。E2Bという名称から実メモリ・速度・電池を推定しない |
| [Phi-4-mini-instruct](https://huggingface.co/microsoft/Phi-4-mini-instruct) | 発行元cardはtext model、MIT | 小型の対話・型付きplan比較候補。custom code要件を含むruntime供給鎖を検査 |
| [Ministral 3 3B Instruct](https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512) | 発行元cardは3B系列のinstruct model、Apache-2.0 | 端末／本人用Linuxの比較候補。量子化・runtime適合は未測定 |
| [gpt-oss-20b](https://huggingface.co/openai/gpt-oss-20b) | 発行元cardはtext model、Apache-2.0 | 推論・Tool形式の管理Linux／Pro比較候補。実行先の資源と出力schemaを測る |
| [DeepSeek-V4.1-Flash](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash) | 発行元cardは画像・文章model、MIT。大規模weightsを配布 | 管理Cloudの大規模比較候補。Pixel候補には置かない |

追加調査では、学習前の基盤重みとして[Qwen3.5-2B-Base](https://huggingface.co/Qwen/Qwen3.5-2B-Base)、[Ministral 3 3B Base](https://huggingface.co/mistralai/Ministral-3-3B-Base-2512)、[Granite 4.0 Micro Base](https://huggingface.co/ibm-granite/granite-4.0-micro-base)、[Gemma 4 E4B](https://huggingface.co/google/gemma-4-E4B)を、比較する事後学習済み重みとして[Qwen3.5-2B](https://huggingface.co/Qwen/Qwen3.5-2B)、[Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)、[Granite 4.0 Micro](https://huggingface.co/ibm-granite/granite-4.0-micro)を確認した。[xAIのGrok-1](https://huggingface.co/xai-org/grok-1)も公開weightsと[実行コード](https://github.com/xai-org/grok-1)があるが、発行元は314B規模で複数GPUを要すると説明しているため大規模実行先の参照候補に限る。この調査で手動確認した発行元cardの候補は計15件。Base／事後学習済みの別、表示license、URL、実行先の比較位置を[`data/execution-si-model-source-catalog.json`](../data/execution-si-model-source-catalog.json)へ記録した。表示licenseは採用許可でも仕事性能の証拠でもなく、正確なrevisionとファイルhash、license本文、学習元、配布権、実環境での資源を取得前に固定する。

15件は探索の起点であり、Hub全体の件数ではない。2026-10-21時点の[Hugging Face「Text Generation」分類](https://huggingface.co/models?pipeline_tag=text-generation)は**426,979 repository**を表示し、[Hugging Faceの2026年夏の集計](https://huggingface.co/blog/state-of-open-models-summer-2026)では全種類の公開model repositoryが8月に約296万件だった。Text Generationの件数は独立したLLMの数ではない。同じ基盤のfine-tune、adapter、merge、量子化、再配布を含み、画像・音声を扱う言語モデルの一部は別分類にも入る。探索は[公式HfApiの`list_models()`](https://huggingface.co/docs/huggingface_hub/en/guides/search)で分類・サイズ・発行元などのmetadataを段階取得し、[`base_model`と派生関係](https://huggingface.co/docs/hub/model-cards#specifying-a-base-model)で系列を束ねる。各取得snapshotの日付・query・revisionを保存し、license、出所、端末/管理Linux資源、日本語、Tool schemaを絞ってからweights取得と同条件の仕事評価へ進む。likes/download数だけでは選ばない。

データ候補もHugging Faceで[FineWeb-Edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu)、[SmolTalk](https://huggingface.co/datasets/HuggingFaceTB/smoltalk)、[The Stack v2](https://huggingface.co/datasets/bigcode/the-stack-v2)のcardを読んだ。データセットの公開やlicenseタグだけで収録元すべての学習権を確定しない。FineWeb-Eduは元のWebページの権利と出所、SmolTalkは各構成元、The Stack v2は元repositoryごとのlicenseに加えbulk取得の別途合意を確認してから利用可否を決める。いずれも今回の学習集合には追加していない。

収集の順序は、(1) 発行元card／上流repositoryと利用条件の所在を記録、(2) 正確なrevision・hash・license本文・データ出所を確定、(3) OWNERの原稿／実仕事の学習許諾とROCKの権利審査、(4) 必要分のみ隔離取得、(5) 同一Eve→Sky Tool仕事集合で現行profileと比較、とする。[Hugging Faceのmodel card](https://huggingface.co/docs/hub/model-cards)は出所やlicenseの入口で、[GitHubの公開repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)も無licenseなら再利用権を与えない。候補の発見・metadata確認からweights／データ取得、追加学習、運用承認への昇格を自動化しない。

GitHubの実装調査では、[TRL](https://github.com/huggingface/trl)がSFT/DPO等の**追加学習**、[Nanotron](https://github.com/huggingface/nanotron)が**事前学習**、[lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)が再現可能な**言語モデル評価**、[DeepInfer](https://github.com/deepseek-ai/DeepInfer)がDeepSeek系の**大規模推論**を扱う。これらは代替可能な開発道具であり、インストールや採用を決めた記録ではない。汎用言語benchmarkに加え、RockstarOS固有の承認、Tool選択、結果不明、費用上限、日本語対話を含む非公開仕事集合が必要になる。

Xでは[実利用者によるQwen3.5の複数ターンAgent試験の報告](https://x.com/RichP/status/2027055235756073319)を確認した。これは一人の環境・少数問の経験談で、モデル性能の一般化や採否には使わない。「架空データを作らない」「誤った指示を修正する」「数ターン後も目標を保つ」を実行SIの評価例へ追加する着想としてのみ扱う。[X Developer Agreement III.A(k)](https://docs.x.com/developer-terms/agreement)はX APIまたはX Contentを基盤／frontier modelのfine-tune・学習に使うことを禁じる。したがってXは発表先や外部資料のリンクを発見する経路であり、X投稿本文を自社LLMの学習集合へ入れない。Xの話題要約・未検証の性能宣伝も採用根拠にしない。

<a id="user-selectable-local-models"></a>

## 本人が選ぶローカルLLM profile（2026-10-18）

最新のnative SI月額offerでは、対応端末のLinux/AVF guestに本人選択モデルを置く場合、Rockstar管理launcherが本人/端末と有効なサービス利用権を確認してから起動する。eSIM契約終了またはoffline lease期限で新規管理起動を拒否するが、汎用Terminalやguest内の既存ファイルを遠隔で削除・封鎖したとは扱わない。ローカル推論tokenは標準Cloud枠や追加Cloud利用料の対象外。VMのCPU/RAM/熱/電池と実推論速度、二つ目のmodel profile、起動gateはPixel実機で未受入。Cloudへ切り替える場合は本人の別承認と見積を要求する。[native SI契約](sim-led-product-architecture.md#esim-si-subscription)。

利用者が好きなローカルLLMを後から載せ、Terminal/LinuxやSky Agentの下書き・plan候補作成に使えるようにする到達設計。初期imageへ全weightsを含めない。modelを「ファイルを選んだだけ」で`ready`とせず、本人がlicenseと配布元、形式（最初は既存GGUF／`llama.rn`適合を候補）、tokenizer／template、hash／byte length、必要RAM／storage、端末の熱・電池、runtime版を確認する。Brokerが署名済みprofileとOS能力を照合して導入・切替・失効・削除を管理し、実推論時に選択したprofile ID／版／hashをjobへ固定する。対応しないmodelは理由を示して導入不可とする。外部ファイルや作者宣言だけでOS imageや他端末への適合を宣言しない。

ローカルmodelの出力は非信頼の文章／plan候補で、Broker承認、Tool実行成功、Agent審査、Skyの売上にはならない。Linux guest内でmodelを使う場合もguest rootはhost権限ではなく、成果は限定adapterからowner、job ID/revision、型、hash、model版、保存scopeを付けてSkyへ渡す。Cloudへ自動fallbackせず、送信先と料金を本人が別承認する。保存・復旧はprofile manifest／hash／選択履歴とjobを分け、weightsは本人が再取得／export可能な条件を示す。切替中の仕事は旧profileで完了か明示停止し、再起動後のmodel再読込を端末で検証する。

ROCKは導入／切替UI、Broker profile検証、端末能力判定とSky artifact契約、EXTERNALはmodel license／runtime、JOINTは端末実推論・熱／電池・再起動受入、OWNERはmodel選択・原稿利用・外部送信を担う。第一合格はPixel 10で既存固定Qwenに加えて適合する第二profileを本人が選び、同一jobの結果をmodel版付きでSkyへ戻し、切替・再起動・削除後の失敗と復旧を区別すること。現状の実機証拠は固定Qwen試験署名APKのみで、任意model install・複数profile切替・Sky成果取込みは未受入。[Sky Add設計](sky-tools-complete-design.md#sky-add-agent-ecosystem)。

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

文章モデルadapterはOpenAIのusage（入力・出力・合計・cache token）を妥当性確認して返し、処理時間を計測する。usage未提供はnullで、費用を推定しない。Provider資格情報のredirect転送を拒否し、timeout=504／transport・不正JSON・未完了応答=502を区別する。失敗時の自動再送は行わない。本文やAPIキーの新規保存なし。9件のfixtureは合格、実Provider接続と料金照合は未実施。

[利用量契約の公式資料](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)。このusageはAPI応答であり、D1履歴やProvider請求書との照合は未実装。

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


## Agent Control Plane — 2026-09-27 runtime slice

The **Agent Control Plane** preserves an advisory software-engineering adapter and an authenticated deterministic preview without promoting any model to an authority role. As of the 2026-10-05 integration, its public route accepts `dryRun: true` only: pricing, durable owner budget reservations, idempotent dispatch and Provider usage receipts have not been integrated, so it does not construct a Jev or Cursor client. Environment flags and PR-only approval cannot enable remote execution.

The implementation lives in `lib/agent-control-plane.ts` with the authenticated entry point `app/api/agent-control-plane/route.ts`. Injected adapter tests cover deterministic gates, optional Jev workflow advice and a bounded Cursor Cloud Agent request. Repository policy and owner approval remain authoritative; those tests are not live dispatch or billing acceptance.

Jev is used only for public-class task metadata with explicit per-task decision consent. The state sent to Jev is minimized to title, risk/effect class, acceptance-criteria count, allowed-path count, and the pstack preference. The full task body, owner-private data, confidential data, secrets, credentials, wallet state, and production authority are not sent by this adapter. Jev remains `advisory-only`; its choice can be made stricter by deterministic policy and can never lower the required review level, grant permissions, merge code, deploy, move funds, rotate credentials, or approve destructive work.

Cursor Cloud Agents are used only after the deterministic execution gate passes. Repository writes require explicit `repository-pr-only` approval, and the worker prompt requires an isolated branch/workspace, a pull request, repository tests, independent verification, no direct main push, no merge, no production deployment, no real-money operation, no credential mutation, and no destructive action. High-risk work is clamped to a security review and a maximum of two workers. Critical-risk, any non-public data class, production-deploy, financial-transaction, credential-change, and destructive-operation requests fail closed instead of launching a cloud coding agent.

This slice does not mean that the whole Decision Fabric is runtime-complete. The generic Sky-wide `DecisionRouter` composition, Local Qwen Web/native bridge, live Cursor credential acceptance, pstack account installation, Grok Bot programmatic handoff, provider calibration, and production acceptance remain separate work. The existing `DESIGN_APPROVED_IMPLEMENTATION_PENDING` Decision Fabric status therefore remains unchanged.

2026-10-19の追加指示: PixelのSkyから既存Linuxを起動し、依頼・下書き確認・Android標準保存・停止を行う[本人用入口](sky-tools-complete-design.md#sky-private-linux-deployment)。固定localhost契約と公開Launcherを使い、一般公開は保留。[実機証拠](evidence/sky-pixel-linux-entry.json)で旧ブラウザ経路と分けて受け入れる。

## ニュース用LLMの追加意図（2026-10-20）

本人は政治的立場による情報抑制を避けたニュース用LLMと、Skyの任意配信元plugin→Home timelineを希望した。最初の候補はX、具体的な媒体/アカウントは未確定。原文と非信頼plannerの要約/推論を分離し、一次根拠、反対根拠、日時、訂正、同一評価基準の立場入替え試験を設計する。思想の影響ゼロや誤情報ゼロをmodelの名称/設定から保証しない。現在のmodel/接続先/安全境界を変更せず、学習・重み配布・X OAuth/API取得・実投稿表示は未実施。[Sky側の受入境界](sky-tools-complete-design.md#news-source-plugins)。

<a id="eve-news-1-0"></a>
### Eve News 1.0：政治的立場で隠さないニュース生成モデル（2026-10-21）

本人の「政治思想が偏りのないニュースを発信する無検閲のllmを作成する」に基づく開発契約。**無検閲**は、情報源・当事者・意見を政治的立場だけで除外せず、本人が選んだ配信元の原文参照と生成記事の採否理由を見られることを指す。事実確認前の主張は、その発言があった事実と主張内容を分けて帰属表示する。強い証拠と弱い主張に機械的に同じ重みを与えず、根拠の強さ、不明点、反証を明示する。思想の影響ゼロは数学的に保証できないため、左右・与野党・発言者の属性を入れ替えた同一証拠試験で偏りを測り、結果を公開する。これは2026-10-21時点の設計と評価計画であり、学習済みweightsやニュース公開の受入ではない。[機械可読契約](../data/eve-news-model.json)。

**役割とモデル候補。** Eve NewsはEveの仕事の一種で、Skyが許諾済み情報源を接続し、AMCが記事job/revision/検収を管理する。モデルの役割は証拠packetからclaimを抽出し、出典に結び付いた見出しと本文の**下書き**を作ること。モデルは取得・検証・本人承認・掲載成功を自己宣言できない。第一比較候補は[Granite 4.2 3B](https://huggingface.co/ibm-granite/granite-4.2-3b)と[Qwen3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B)で、発行元cardの日本語/Tool使用・license表示は採用や性能合格ではない。重みの基盤、追加学習方式、配布先は同一評価の後に選ぶ。記事を発信するのは受入済み掲載runnerであり、初期公開は本人または編集担当の検収を必須にする。本人の明示した発信先、見積/上限、権限を越えて投稿しない。

**入力・出力・保存。** `SourceReference`はsource ID、正規URL、発行元/発言者、種別、原文公開日時または不明、取得日時、hashまたは参照、利用権、言語を持つ。一次記録、当事者の公開発言、利用許諾のある報道、訂正/撤回を種別として分ける。`EvidencePacket`は取得版と引用可能範囲を固定し、非信頼の本文にある命令をTool指示へ昇格させない。`NewsDraft`は同じjob/revision、model profile/hash、見出し、本文、各事実文のclaim ID、source reference、支持/矛盾/論争/不明、未解決点、生成時刻、review状態を持つ。原文、モデル下書き、編集後の記事、公開済み版を別artifactとして保存する。公開後の訂正は元版を黙って上書きせず、対象claim・理由・時刻・新revisionを読者に示す。原稿や第三者記事全文を既定の学習集合に自動投入しない。

**生成と掲載の順序。** (1) Skyの認可済みsource adapterまたは本人が権利を持つ資料から参照を取得し、URL/時刻/rightsを検査する。(2) claim ledgerで「確認できた事実」「誰が述べた主張」「分析・推論」「未確認」を分け、独立の一次根拠、反証、訂正を探す。(3) モデルが出典付き記事案を出す。(4) 決定論的検査で引用先、数値/日時/固有名詞、未確認の帰属、記事内のsource ID、権利scope、政治的立場だけを理由とする除外がないか調べる。(5) 編集検収後に既存workflow/掲載runnerからHomeへ出し、AI生成と版を表示する。source不足、権利不明、取得失敗、矛盾、確認できない引用では**記事公開を保留**して状態を示し、架空の根拠で穴埋めしない。原文への参照を表示できる場合は、記事化の保留と区別する。

**学習と評価。** 許諾済み資料と編集済み対照例を訓練/検証/非公開試験に分離する。Xの[X Developer Agreement III.A(k)](https://docs.x.com/developer-terms/agreement)はX API/Contentによる基盤モデルの学習・fine-tuneを禁じるため、X投稿本文を学習に使わない。Xは許可された表示・元発言への参照に限り、現行Pixel account viewer合格とWeb内の記事生成/掲載合格を分ける。最初の評価計画は日本語・英語で120件以上の非公開対照例を作り、同じ証拠で政党/思想・発言者の肩書・賛否ソースの順序を入れ替える。題材選択、見出しの好悪、断定/不確実性、根拠と引用の正確さ、訂正、費用/時間を別々に測る。閾値はデータと採点規則の固定後、学習結果を見る前に登録する。ニュース組織の[Reuters Trust Principles](https://reutersagency.com/about/our-trust-principles/)と[記者基準](https://reutersagency.com/about/standards-values/)は正確性・公正な取材・透明な訂正の設計参照であり、RockstarOSが同社の認証を得た意味ではない。

**責任・合格・未決定。** ROCKはsource/claim/job schema、model profile、同一基準評価、版付き訂正、公開runnerの権限を実装する。EXTERNALは媒体/配信元の権利、model/runtime、元資料を提供する。JOINTは実source→下書き→本人検収→掲載→訂正を同一artifactで受け入れる。OWNERは情報源、対象読者/言語、編集責任、学習許諾、発信先と予算/公開を決める。第一合格は非公開評価を固定し、架空の引用を掲載せず、政治的立場だけによる除外を対照試験で検出可能にし、source不足の保留、実記事一件と訂正一件の同一job receiptを確認すること。未決定は基盤モデル、訓練データと権利、編集責任者、発信先、許容する自動化範囲、評価閾値である。現時点は `design_only`、モデル重み・記事実発信・政治的中立の実証は未実施。

2026-10-21の試作として`toolkits/eve-news/news-core.mjs`と`draft.mjs`へ、権利scope付きsource packet、非信頼本文、出典ID/claim型検査、未掲載草稿の出力を実装した。架空fixtureの構造テスト8/8は成功。初回Qwen3:4Bは120秒timeoutだったが、出力schemaとtoken上限を固定した再試行では架空の2資料から構造適合するレビュー待ち草稿を得た。Qwen2.5:1.5Bは根拠不足を確認済みと誤記したため検査で拒否した。1件の構造適合は記事品質、政治的中立、weightsの合格ではない。Sky Home側には[GDELT DOC 2.0の公開メタデータAPI](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)で取得した原文リンクを表示した。これは下書き生成と独立で、検出時刻は記事発行日ではない。公開Eveへモデルを載せるのは、権利・対照評価・review付き同一job草稿・掲載/訂正の受入後とする。

<a id="eve-training-prerequisites"></a>
## Eveの機械学習を始める必要要件（2026-10-21）

本人の必要要件の依頼に対し、最初の実験案を既存0.5B〜4B級の公開重みへのSFT + LoRA/QLoRAとする。採用や有料計算の開始は未実施であり、一からの事前学習は別の計算量/データ設計が必要。

- **学習目的**: 日本語での依頼整理・出典付き下書き・Sky Toolの型付き引数候補のうち最初の一用途と失敗条件を固定。ニュース最新事実は取得系から渡し、重みだけに最新性を期待しない。
- **基盤モデル**: 発行元、revision/hash、商用利用/改変/配布の条件、tokenizer/chat templateと対象runtimeの適合を確認。現在端末で推論するGGUFとは別に、対応する学習用checkpoint（通常safetensors）を用意する。
- **学習データ**: 許諾済みの依頼→望ましい返答、Tool呼出しと実結果、停止/不明/誤り訂正の例をJSONL等に整理。原文出所、許諾scope、個人情報除去、重複除去を記録。最初の計画値は高品質1,000〜5,000例だが普遍的な最低件数ではなく、learning curveで増減を決める。私有会話は自動投入しない。
- **独立評価**: 訓練と別の出所/話題単位で分離した200例程度を最初の計画値とし、未学習基盤との比較で事実根拠、Tool schema、未知/停止、日本語品質、漏洩/注入を評価。政治ニュースは立場・地域・話題別の非対称な誤りも計測し、思想影響ゼロを宣言しない。
- **計算機**: 0.5B〜4B QLoRAの試験計画として対応NVIDIA GPUのVRAM 16〜24GB、host RAM 32〜64GB、空SSD 100〜200GBを目安に実測。これは保証最小値ではなく、token長、batch、optimizer、architectureで変わる。Apple Siliconでは対応MLX/LoRAを別検証し、Pixelは初期学習の標準実行先にしない。
- **学習環境**: 選択hardware対応のdriver/runtime、Python/PyTorch/Transformers/Datasets/PEFT/TRL等を固定。まず少量でforward/backward・保存・再読込・VRAM峰値を確認してから拡大。Macなら選んだMLX系構成を固定する。
- **実行設定**: seed、学習率、LoRA rank/対象層、最大token長、batch/gradient accumulation、epoch、checkpoint頻度、早期停止、最大時間/費用を設定。学習lossだけで合格を決めない。
- **保存/復旧**: 許諾付きdataset版/hash、元model hash、設定、adapter/checkpoint、optimizer状態、評価記録、使用GPU時間を非公開のartifact storageに保存。大きな重みや秘密原稿はGitへ入れない。中断再開と元modelへの復帰を確認。
- **費用/外部送信**: 手元計算機の適合を先に確認し、cloudを使う場合はアカウント、送信データ、時間上限、料金上限を確定してから開始する。停止条件と計量を実行中も強制。
- **Eveへの搭載**: 改善が確認されたadapterを固定し、base/adapter/tokenizer/版/hashをEve ModelProfileへ登録。必要に応じてmerge/量子化/GGUF化した後、同じ評価を再実行し、PixelのRAM/速度/熱・既存Sky権限境界を受け入れてから切替。旧profileを復旧用に保持する。

一次資料: [PEFT quantization/QLoRA](https://huggingface.co/docs/peft/main/en/developer_guides/quantization)、[TRL SFTTrainerのdataset形式と学習](https://huggingface.co/docs/trl/main/en/sft_trainer)。hardware/件数はこのプロジェクトの初期計画値であり、これらの資料が保証する値ではない。

手元機確認: Apple M4、unified memory 16 GiBを読取り確認。初回の候補は0.5B〜1.5B級の対応モデルをMLX-LMのLoRA/QLoRAで少量検証する。これはメモリ適合/学習速度の受入ではない。NVIDIA機やcloud契約は小規模試験の必須条件にせず、実測OOM時にtoken長・batch・対象層を調整する。公式手順は[MLX-LM LoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)。

M4小規模試験の空SSD計画値は20〜50GB。現在Data volume空きは約113GiBを読取り確認した。model download、変換、中間checkpointで変わるため開始時に再計測する。

実行SIの先行runtimeは[SI01契約](sky-tools-complete-design.md#eve-execution-si)へ接続。決定的引用Toolと独立URL保持検査をbaselineとし、LLM planner/修正loop/Agent/端末/課金の受入を独立して継続する。

SI02の[非信頼計画候補](sky-tools-complete-design.md#eve-execution-si)は既存Ollama/LLM adapterを使用し、目的/素材hash/Tool graphをserver検証してから既存workflowへ保存する。モデル自己申告はTool成功・権限・支払へ昇格しない。実モデルのopt-in検証は`node --experimental-strip-types scripts/check-eve-local-planner.mjs`（導入済みQwen、localhost、合成資料のみ）。独自重み/学習/一般品質の受入ではない。

<a id="eve-microgpt-reference"></a>
### microgpt-lessonを参照したCPU基礎実験（2026-10-22）

本人指定の[GrEarl/microgpt-lesson](https://github.com/GrEarl/microgpt-lesson/tree/af735511e13af5881ade5dee0c15151ac23ca2a5)をREADME、章1〜11、共通準備・付録まで読んだ。参照commitは`af735511e13af5881ade5dee0c15151ac23ca2a5`。文字Tokenizer→bigram→softmax/損失→勾配/自動微分→埋め込み/MLP→causal multi-head Attention→RMSNorm/残差→Adam→生成/温度という分解を、Eveの学習設計と説明へ採用する。教材の約5千parameter・1層・短い文字列の人名生成は基礎実験であり、Eveの汎用仕事能力・ニュース品質の受入にはならない。

**GPU不要で先行できる実験契約**：

1. ROCKの責任で既存experiments領域を使い、秘密や利用者履歴を含まない自作合成データの小さな文字モデルを作る。公開資料のコードは無断転載せず、参照元と許諾を記録する。参照commitのrootにはLICENSEファイルがなく、データ側のMIT表記を教材コード全体の許諾と読み替えない。現段階は設計への参照で、コード/Notebook/データ/フォントは取り込んでいない。
2. 学習と推論を別コマンドにし、seed、語彙、model構成、dataset/split hash、学習率、optimizer、step、重み/checkpoint hashを固定。初期案は1層・16次元の小モデル、CPU・時間/step/出力容量の上限付きとし、上限は実測で確定する。GPU契約、モデルdownload、外部データの自動取得を前提にしない。
3. train/validation/testを学習開始前に分離し、同一由来の重複やテンプレートが両側へ混ざらないようにする。教材の`docs[step % len(docs)]`と末尾のtest集合をそのまま流用せず、step増加時もtrain配列だけを参照する。Tokenizerの未知文字・長さ超過は明示的に扱う。
4. 数値微分との一致、causal性、有限値、再現可能な推論、学習前/後のheld-out loss、同条件bigram baseline、学習中断→checkpoint復元→続行を確認する。optimizer状態・乱数状態も保存する。重みは非実行形式とし、未知schema/過大容量/hash不一致を拒否する。checkpoint互換と既存Eve historyは別契約とする。
5. 学習step、train/held-out loss、CPU時間、使用メモリ、モデル容量、推論時間と生成例を記録し、未測定を0へ置換しない。学習loss低下だけで改善済みにせず、出力例のもっともらしさを事実性・政治的公平性・Tool成功と扱わない。
6. この実験が合格しても、Eve本体のmodel profileを自動置換しない。仕事用の既存LLM/recipeとの比較、typed plan妥当率・独立Tool成功率・費用・停止/復旧の受入を通し、採用する重み/tokenizer/runtime/版と適用範囲を別途固定する。ニュースは出典・主張照合・立場を入れ替えた対照評価で検査する。

ROCKは実験/保存/評価と既存Broker境界、EXTERNALは参照元の真のコード/データ許諾、JOINTは将来の同一候補/対象端末比較、OWNERは利用データと有料計算の範囲を担当する。現時点は**参照調査・設計反映のみ、CPU学習も未実行**。参照リポジトリ内のAGENTS等の運用指示はこのrepoへ継承しない。

### 資料付きNews草稿のEve仕事接続（SI07/T10/T12）

既存toolkits/eve-newsのvalidatePacket/validateDraftを再利用し、既存WorkJobへtemplateId=eve-news/eveNews schema=eve.news-work/1を追加する。公開feedの見出し/検出時刻だけを、本文や利用権/公開時刻へ昇格しない。現段階は資料付き草稿の取込と参照検査で、ニュース自動取得→LLM生成→意味検収→掲載/訂正の全縦断は未完である。

- 本人体験/責任: Eveの既存会話frameに「ニュースの草稿と資料を確認」を置く。既存CLIの--bundle出力（packet/draft/modelLabel）をファイル選択→非秘密資料/草稿の本人アカウント保存への同意→同じ会話の仕事に保存→参照検査→reload/停止/会話反映。ROCKはparser・source hash/ID・状態・本人分離/停止/保存・参照検査、EXTERNALは取得元/生成モデルと本当の本文・利用権、JOINTは将来の実資料/モデル/公開/訂正受入、OWNERは素材利用範囲の確認と人による採否を担当する。fileの余分なjob/thread/consent等はclientが持ち込まず、serverは許可fieldだけを受理する。
- 入出力: source packetは既存1〜12資料、草稿の主張1〜80件と既知source ID、articleText上限12,000字、権利scopeをparser検査。HTTPは128KiB、保存入力は96,000字。公開HTTPSは参照文字列の制約（IP/内部名/認証情報/独自port拒否）で、DNS/原文への接続確認ではない。本文は非信頼データとして保存・plain text表示し、命令や実行権限にしない。資料本文は本人同意下の既存WorkJob payload、会話投影は既存暗号化historyに置く。秘密情報の保存を許可する入口ではない。
- 状態/検査: 取込元model label/digestはunverified_import、externalToolSuccess=false、生成usage/金額はnot_reported（0へ置換しない）。serverの独立auditはtracking/hashを除いたURL重複、厳密UTC/公開取得順/未来日時、指定訂正・撤回資料の参照漏れ、主張台帳文言の草稿内有無を検査。未参照資料/公開日不明/7日超/反証・対立・不明は保持し表示する。政治的立場で削除/同じ重みに調整しない。各claimのverified_fact/supportedも生成元の申告であり真偽検証済みと表示しない。構造通過はreview=人による確認待ちまで、semanticTruth=not_verified/politicalFairness=not_evaluated/publication=not_publishedを保持。全体の意味的主張網羅や根拠の強弱は未評価。一般record/edit/complete APIで昇格できない。
- 保存/失敗/復旧: 既存workStoreのowner/job/revisionとrequest hash（資料・草稿・指定model・thread）で作成再送を同jobへ束縛、入力変更は409。checkは操作UUIDを既存eventsに記録し再送を重複実行しない。owner/threadで絞ってから最新100件を返す。初回INSERTは同owner会話のtombstoneをSQLで検査、仕事を保存してからnews/schema/thread/revisionのDB fence付き暗号化投影を行う。会話との競合/鍵障害でも保存仕事を失わずhistorySaved=falseとしsyncで修復。停止はhistory鍵・期限/利用権gateから独立して新しいcheckを拒否し、素材・失敗結果を保持。停止後のcreate再送は復活しない。一般Workbenchの実行候補に混ぜず専用Eve表示から確認する。
- 承認/非対応: 取込/参照検査は推論/原文取得/投稿/課金を呼ばず、掲載APIを持たない。取込元の使用量・本当のmodel実行証明、学習同意/撤回、意味評価、政治立場入替えモデル評価、原文の再取得、訂正の旧稿連結・公開/取消は別の未完gateにする。ローカルCLIは既存導入済みモデルだけを使い、推論前後inventory digestが違う/再確認不能なら出力しない。前後一致は実行重みの暗号学的証明ではない。
- 合格: 同時作成/再送と同job/thread再開、他owner拒否/削除race/古いhistory投影拒否/鍵なし停止、訂正未参照・重複URL・古い/未来資料・未知出典・利用権なし拒否、同一入力の話者属性を替えても構造検査基準が変わらないこと、実Worker/実UI/全verifyを候補hashで記録する。話者入替えの構造対称性をLLMの政治的公平性へ転用しない。

### News草稿の同一仕事内修正（SI03/SI07）

目的/体験: 参照検査で要確認になった草稿を、同じowner/thread/jobのまま修正・再検査する。ROCKはCAS・操作ID・過去版・上限、OWNERは修正版と理由、EXTERNALは取込元モデル情報、JOINTは同候補のUI/保存復旧を担う。PATCH reviseはdraft/modelLabel/reasonと既存revision/commandIdを受ける。資料packetと初回request hashは固定。旧draft/audit/理由/時刻とreplacement hashをWorkJob内へ最大2件保存し、旧結果を消さない。修正版は未検査activeへ戻し、専用checkだけがreviewへ進める。掲載/真偽/公平性/Tool成功/料金の権限を得ない。

失敗/復旧/承認: 停止/完了/検査合格/未検査からの修正、同内容、変更された同操作ID、他owner、古いrevision、削除会話を拒否。応答喪失は同操作ID/hashで再読、CAS競合は読戻し、暗号化履歴投影失敗でもWorkJobを保持。上限2回は進展なし時の保留を明示し、検査を緩めない。本人の保存済み資料だけを使い、モデル呼出/投稿/外部送信を自動追加しない。合格条件は原稿/検査保持、再検査、同ID再送、再起動、停止非復活と上限の実保存試験/UI。これは本人編集の基盤であり、自動修正モデル/意味品質/公開は別gate。自動修正の方式は実測比較と既存予算承認を満たして選ぶ。

### Newsの上限付きローカルモデル修正（SI03/SI07）

目的/体験: 失敗した参照検査を原因として、同じ資料・仕事・会話の草稿をローカルOllamaで1回修正し、同じ独立検査へ通す。ROCKは既存generateText/Ollama inventory/共通usageとWorkJob CASを使い、EXTERNALはモデル応答/counters、OWNERはモデル名/digest/保存済み素材の実行サーバー内送信同意、JOINTは同候補の実HTTP/Worker/UIで検証する。`EVE_NEWS_LOCAL_REPAIR_ENABLED=true` の明示設定時のみAPI実行可能で、既定無効。Cloud fallback/新モデルdownload/公開/課金を追加しない。

入力は既存job/revision/commandId、auto-repair、導入済みmodelLabel/modelDigest、consentLocal。packet・前稿・失敗検査を非信頼データとして24,000文字まで、出力900token、既存adapter20秒timeout、試行60秒lease、最大2試行/修正版2回を強制。資料の重複/日時不整合は固定packetをモデルで直せないため呼出を拒否。正しいモデル前後観測に加えreportedResourceId照合後だけ草稿をparse/権利・参照schema検査→中央revision reducer→独立参照auditへ通す。名前/hashだけの変更を進展としない。合格しても人確認待ち・未掲載、真偽/政治公平性未検証。

保存/失敗/復旧/停止: 同じWorkJob内にinput hash、試行ID、同意モデル、lease、sendingをCAS保存してから呼ぶ。同ID再送は保存状態だけ返す。報告usageは既存SkyUsageObservation（原始token/未知金額/未照合/作者未契約）で保存、初回import生成の未報告usageと混同しない。timeout/応答喪失/worker crashのsending/unknownは再配送しない。異なるcommandの再試行もsending/unknownでは拒否。モデル変更/利用不可/不正草稿/無変更は採用せず理由を保持。停止後の遅着はusageを保存し草稿を採用しない。削除会話へ再投影せず、鍵障害では仕事と観測を保持。モデル呼出が停止済みとは確認できない場合、OS job停止と外部計算終了は別。合格証拠は集中/実HTTP/Worker再起動/同ownerUI/全verify。実Qwen品質・意味品質・複数実業者・Pixel・公開は別gate。次のモデル/上限は固定条件の実測から決める。

### News修正の構造化候補と失敗node限定（SI03/SI07）

原因/目的: 実QwenがJSONをMarkdown枠で囲み、主張文言も本文に含まれなかった。受信parserや独立auditは緩和せず、既存adapterのOllama専用`ollamaSchema`へserver生成schemaを渡す。公式仕様は https://docs.ollama.com/capabilities/structured-outputs （2026-10-22確認）。ROCKはtyped候補/parse/CAS/監査、EXTERNALは文法制約へのモデル応答と実token、OWNERは同じ保存済み目的・素材・モデル同意、JOINTは実HTTP/Worker/UIの同候補受入を担う。

入出力/状態/保存: ledger_text_presentだけが失敗した時は{articleText}候補だけを要求。既存headline/claimLedger/unresolvedQuestions/packetはserverで保持し、余計な候補fieldを拒否する。訂正参照の失敗には既存draftJsonSchema(packet)の全草稿候補を使い、許可source IDをschemaへ束縛する。共通adapterはOllama時だけschemaをformatへ、temperature0をoptionsへ付け、他providerへのschema転用・16,000文字超・不正schema形を呼出前に拒否する。通常呼出は既存wireを維持。24,000文字prompt/900token/20秒adapter/60秒lease/最大2試行とWorkJob・旧版・usage契約を維持する。

失敗/復旧/承認/合格: Markdown除去等の寛容parseや、URL/権利/主張対応検査の削除は行わない。実の全草稿schema試験が20秒timeout/unknownとなった事実を保持。同試行は再送せず、別候補試験前にserverログの500/cancel/全slot idleを確認。本文修正の実Qwenは構造対応まで合格したが、台帳外の表現や意味品質は未検証で人確認待ち・未掲載。修正済みというだけで真偽/政治公平性/投稿/Tool成功へ昇格しない。合格は同じ仕事/会話・旧版保持・実counter/前後digest・独立参照check・停止/再起動・Worker/UI・全verifyの範囲へ限定。次の課題は主張網羅/意味照合・対照評価と通常editor/選定で、既存の未完gateを維持する。

### News本文・台帳・資料の文字対応と通常編集（SI03/SI07）

目的/体験: 台帳文言が本文にあるという片方向検査だけでは、本文の台帳外記述が残る。ROCKは本文の文・段落をUTF-16位置付きで分け、claim文字の対応・未対応断片・同じ文言がある資料候補を保存/表示する。EXTERNALは資料やモデル応答の実内容、OWNERは編集・主張/出典/分類/理由の確認、JOINTは既存WorkJob/会話/再起動/UIで検証する。政治立場を判定/排除せず、原文を非信頼データとしてReact文字表示する。

入出力/状態/保存: NewsAuditの互換optional coverage(eve.news-coverage/1)とbody_ledger_coverage検査を追加。256文・段落/対応情報60,000文字を上限に、超過・空本文・未対応文字があれば通過させない。句読点/空白の扱いと逐語対応だけで、否定・数値・記号・その他の未対応文字を保持。主張の指定資料内に同文言があるかも別表示し、言い換えは意味未確認とする。資料で同文言が見つかっても、真偽/支持/主張の意味的網羅は合格にしない。前の4検査だけの保存物は新しい文対応を未検査と示し、専用checkで更新した時だけ現行結果へ変える。Source3検査とdraft2検査を混同しない。

操作/承認/失敗/復旧: 同じ本人の草稿編集をJSONから見出し/本文/主張文言/分類/根拠状態/資料checkbox/理由/未解決事項へ変更。未対応文を主張へ加える操作は本人が明示し、既定はunverified_claim/unknown、同文言資料は候補としてのみ選ぶ。資料packet/ID/初回hashを変更せず既存revise/CAS/2回上限/旧稿・旧audit保持/停止非復活を維持。serverの権利・参照schema検査は継続。本文文字対応だけの失敗でledger側が存在する時は全草稿schemaで主張を補う候補を扱い、本文限定修正はledger_text_presentも失敗した場合だけ。旧auditでの自動修正は再検査を要求。上限到達/不明/鍵障害/競合は既存保留・読戻し経路に戻す。

合格/未決: 否定/数値/Unicode位置/台帳外の資料由来文/過大範囲/旧audit移行/同jobでの台帳訂正・再検査・履歴・UIを検証。文字対応の成功は政治公平性/意味的支持/公開受入ではない。次はsemantic entailment/対照評価と適格model選定、取得/掲載/同意datasetを同じGoalの未完gateで進める。主張抽出・複合文の方式は対照fixtureと独立レビューで選び、文字一致を意味品質へ一般化しない。

### News主張ごとの資料照合モデル提案（SI03/SI07）

目的/体験: 逐語対応から進み、保存した主張1件と資料をモデルへ照合させ、支持/反証/不足/混在の提案・理由・引用を同じ仕事へ残す。ROCKは既存Newsローカル実行/WorkJob CAS/adapter/inventory/usageを再利用、EXTERNALは実モデル応答/counter、OWNERは主張/モデル/digest/保存資料のローカル送信同意、JOINTは同候補の実HTTP/Worker/UIで検証。Jevの明示Sky利用やremote権限へ置換しない。

入出力/権限: PATCH evaluate-claimはjob/revision/commandId、保存済みclaimId、modelLabel/modelDigest、consentLocal。既存local repair flagは既定無効で、各資料照合の明示操作/同意も必要。生成のadopted attemptで前後一致を観測したdigestと同じモデルは呼出前に拒否。生成本人性不明はwriter_unverifiedと明示し、別digestでも独立性/正確性の保証とはしない。資料/主張本文は非信頼データ。照合専用profileはschema指定800token、24,000文字prompt/40秒loopback adapter/60秒lease（300token/20秒で最終回答不足の実測を反映、既存修正900token/20秒は維持）、修正2試行と照合2試行を同job内で別計数し、いずれかsending/unknownなら新規呼出は止める。Cloud fallback/新download/課金を追加しない。

保存/検査/状態: 同じ既存attempt集合にpurpose=evidence-review/claimId/draftSequence/input hashをsendingとしてCAS保存後に1呼出。応答のclaim ID、enum、理由500文字、最大4引用/各600文字を検査し、引用は名指しした保存資料のexcerptへ逐語一致を要求。支持・反証・混在には該当relationの引用が必要。ただしrelation自体はモデルの申告で、引用存在から意味支持/真偽へ昇格しない。主張文言はserver保存値から付ける。モデル提案・実usage・前後digest・出力hashを保存し、草稿/参照audit/status/公開権限を変えない。semanticTruthはnot_verifiedを維持し、他の主張を評価済みにしない。

失敗/復旧/編集: 同ID再送は読戻しのみ。捏造/別主張/不正schemaはinvalid_review、モデル変化や期限/停止/草稿変更/削除会話後の遅着は保留しusageを保持。unknownを0金額/成功へ変えない。鍵がなくても既存停止は使える。前後参照検査が通ったreview草稿でも本人は既存2版上限内で訂正でき、旧提案は過去草稿向けと表示。モデル結果で本人の編集権限や公開許可を増やさない。合格はschema/quote偽装、並行1送信、停止/late usage、old scope/再起動、本人UIと全verifyの範囲。実モデルの意味品質・政治対照評価・ニュース掲載は別gate。次の評価モデル/小課題は固定の対立資料と独立した正解付けで選ぶ。

News照合の追加実測: 小Qwenは引用文字が正しくても意味評価を誤るため、protocol保存を品質合格としない。支持/反証relationが両方ある応答はmixed以外を拒否する。OllamaがHTTP応答したのに最終textが空の場合は、既存LlmProviderErrorへ観測meterだけを保持してNews attemptへ保存する（thinking本文は保存しない）。輸送不明はunknown/nullを維持。Qwen3はlocal /api/showのthinking.values=[true]を尊重してfalseを指定せず、800token/40秒の有限profileでも最終回答不成立なら不合格のまま記録。公開LLM APIのrequest bodyへこのtimeout指定を転送しない。モデルの適格性は固定課題の正解との一致と役割別実測で選び、引用一致だけで自動fact checkerとして扱わない。

### News資料照合の限定適格性評価suite

ROCKは既存`check-eve-news-local-evidence.mjs --suite`で本人作成の架空8件を既存WorkJob/adapterへ配送する。支持・反証・資料不足・対立の各2件は政治ラベルだけを入れ替え、期待assessmentと必要な出典/関係を事前固定する。各caseは独立した評価jobで同じ仕事の草稿/audit/statusを保持し、原始usage・digest・入力hash・suite版・時間・成功/不成立を逐次保存。最大8呼出、各800出力token/40秒、再試行0。結果不明・model変更/不明・保存異常はsuiteを停止して保存済み試行を再送しない。再実行は新規測定であり中断再開ではない。比較には同じfixture hash/model digest/runtimeを使う。

引用の実在検査と期待assessment・必要根拠関係を別に評価する。両政治ラベルで同じ誤答でも公平性/適格性の合格にはしない。8件すべて通っても実世界の真偽・一般的中立性・独立性・自動routing採用を保証しない。未完了/未報告は未測定、金額nullは0円へ変えない。外部Provider/実機/公開や学習利用には別受入が必要。EXTERNALは実model応答とmeter、OWNERは素材権利と外部送信、JOINTは同候補の実接続受入。失敗は元のreport/usageを保持し、次候補/改善は同一suiteの観測で決める。

### News照合モデルの用途別評価表示

目的/体験: 本人が照合モデルと64桁hashを入力すると、既存capabilitiesの測定記録から用途別の根拠を読む。ROCKのreaderは名前+digestの完全一致、suite版、8caseの件数/score、測定日時（未来5分許容・30日以内）を照合し、未選択/hash不足/未評価/別digest/古い評価/不完全/不合格/fixture限定を区別する。モデル未評価は0点へ変えず、該当しない成績を表示しない。資料hash/suite/参照記録日時と評価範囲は折りたたみで読める。

保存/責任: 元データは`data/llm-capabilities.json`の限定評価、readerは`lib/eve-news-model-advice.ts`、画面は既存News form。新DB/課金台帳/Provider呼出/自動routing/Cloud fallbackを追加しない。EXTERNALは観測された実model応答、OWNERは手動model選択/送信同意、JOINTは同候補の実UIと実接続受入。表示は助言であり、仮に架空case全件一致でも自動reviewerAccepted=false。Broker/送信時の前後digest・権限・上限・既存明示同意を変更しない。画面の日時は端末時計で助言表示するため権限の根拠には使わない。

失敗/復旧/合格: 古い記録や版変更は未適用の理由を表示、既存仕事/モデル入力/保存済みusageを保持する。新測定は同じsuite/hash/runtimeで比較し正本の記録へ反映。合格証拠は一致/別版/未評価/古い日時/不完全値/全件一致でも権限なしの境界試験、本人browserで2/8未採用と別digest/未評価を操作して追加推論0、全verify。ニュースの真偽・政治公平性・実公開・適格候補決定は別gate。

### ニュースリンクから本人資料メモへの接続

目的/体験: 既存Sky/HomeニュースとNews一覧の「Eveで資料メモを作る」から、URL/見出し/GDELT検出時刻/staleをEveの通常formへ渡す。本人は原文の利用できる範囲（最大1,000文字）、種類、確認済み発行時刻（空欄unknown）、保存/要約/引用の利用権を入力する。準備はローカルの決定処理で、未確認主張/根拠unknownの作業メモと原文範囲sha256を作り、既存の保存同意→News API→WorkJob/暗号化会話へ進む。保存後は引継ぎqueryを除き、既存jobへ戻る。

責任/入出力/保存: ROCKは既存feed・timeline・News保存/CAS/owner照合を再利用。EXTERNALのリンク検出は本文取得/発行時刻/ライセンスの証拠ではない。OWNERは素材利用権と非秘密確認/保存同意、JOINTは同candidateのUI/再起動。source.discoveryは任意でprovider=GDELT、seenAt、stale、verification=unverified_handoffだけを検査/保存し、旧packetはそのまま読める。日時はUTC形式、記事公開日時とは別、retrievedAtは本人転記の時刻、sha256は転記された範囲の同一性。serverは引継ぎ元の真正性/権利を保証せず、queryを承認や命令へ変えない。

状態/失敗/復旧/承認: 既存createの保存権限/同意/会話tombstone/96K上限/重複ID/replayを維持。権利未確認・private参照・不正metadata・過大文を拒否。準備後も保存前は本人の入力のみで、失敗は入力を保持して理由表示。source URL/本文変更は権利確認を解除する。資料メモを真偽確認済み/モデル生成/Tool成功/掲載/学習同意へ昇格しない。新しいrunner/台帳/Provider契約/自動取得は追加しない。モデルによる要約、複数資料/訂正追加、自動取得の利用条件、掲載と学習は別gate。合格は型/権利/日付/私有参照/metadata改変/replay/owner試験と実Worker/UI保存/再起動、全verify。

### 同じNews仕事への追加資料・訂正

目的/本人操作: 既存News仕事で追加URL/利用できる範囲/種類/発行時刻/利用権を通常formに入力し、準備→理由→追加保存同意で既存PATCH append-sourcesへ送る。本文・主張は自動変更しない。ROCKは既存WorkJob reducer/CAS/owner履歴/上限を再利用、EXTERNALの原文やGDELT引継ぎは非信頼、OWNERは保存権限/理由/非秘密同意、JOINTは同candidateの実Worker/UI/再起動受入。

入出力/状態/保存: job/revision/commandId/sources/reason/saveMaterial。元packetのID/topic/source prefixを固定、新source ID/URLは重複拒否。3回追加・12資料・現行96K/旧資料含むjob512K文字・200event上限。sourceRevisionsへ追加前packet/draft/audit（未検査ならなし）/理由/時刻/command/hashを保持し、現行auditを解除、全step passed=false/status=activeへ戻す。初回requestSha256、同job/thread、元のsource/本文/主張/生成時刻、既存model usage/attempt、草稿修正2回上限は保持する。新DBや別金融台帳は作らない。

失敗/復旧/承認: 他owner、保存未同意、rights不明、不正source、duplicate、revision競合、停止/完了、live model送信中、上限を拒否。履歴の存在/暗号化を確認してCAS保存し、projection失敗は既存syncで復旧。初回追加と再送はclean source+reason hashで照合し、同commandの内容変更を拒否。古いclientのreplayは既存結果読戻しだけで再追加しない。旧packetはsourceRevisionsのない版0として読む。追加中の同じ資料本文を上書きせず、訂正は新しいsourceとして記録する。

評価の版: model review attemptへpacketSequenceを追加（旧attempt省略は0）。草稿の版と資料の版が両方一致するときだけ現行への提案と表示、資料追加前の提案は過去の資料/草稿への提案として保持する。model結果の採用前input hash/lease/停止確認も維持。資料追加でモデル呼出/試行上限をリセットしない。追加された訂正を既存台帳が参照しない場合は次のauditで要確認、文字参照が通っても訂正の意味的反映・真偽・政治公平性・掲載は未受入。合格は不変条件/旧版/再送/並行/停止/権利/上限、実UI追加→再検査/旧提案/履歴→同artifact再起動とfull verify。

### 訂正資料を本人の草稿へ明示反映する

体験/責任: 既存News editorの資料ガイドで番号・媒体・種類・原文・公開不明/取得時刻を確認し、本人が主張の文言/分類/根拠状態/資料選択/本文を訂正する。同じ媒体の原記録と訂正を資料番号で区別する。原文は一つの折りたたみガイドへまとめ、各主張のcheckboxへ全文を重複展開しない。ROCKは既存editor/News revise/check/CAS/履歴を再利用、OWNERは根拠/対立/原文利用の判断、EXTERNALの原文/申告は非信頼、JOINTは同candidateのUI保存/再起動受入。

状態/保存/失敗/承認: 元記録と訂正を帰属付きの別主張として本文へ反映し、対立/独立検証が未解決ならdisputed/unknownを保持する。旧sourceRevisions/旧draft/audit/usage/初回hash/同job/threadを維持し、既存2回の草稿修正とcommand/revision/停止の規則を使う。参照検査が通ったstatus=reviewは、人の確認待ちであって真偽・政治公平性・Tool成功・掲載の合格ではない。本文外の意味網羅や発行/訂正関係の確認を文字一致へ代用しない。保存失敗/競合は元のjobを維持して再読込、旧稿は既存の履歴から確認する。

合格: 同jobに追加した訂正について、本文の逐語対応/両source参照/対立warning/semanticTruth not_verified/politicalFairness not_evaluated/not_publishedを境界試験で確認。実browserで資料選択と原文ガイド→本文/台帳の通常編集→保存/再検査→旧稿/旧資料/旧model提案保持→同artifact再起動を記録し、full verifyを通す。意味品質/政治的中立性/自動モデル採用/実取得/実公開/学習許諾は別gate。

### News学習準備の個別同意・撤回（設計契約）

目的/体験: GPU/学習の前に、本人が選んだNews仕事の現行資料と草稿だけを、評価用または学習候補の準備データとして確認する。会話保存・remember・sourceの引用権・公開を学習同意へ昇格しない。ROCKは既存News WorkJob/command/revision/owner/history/暗号化を再利用し、別DB/台帳/汎用runnerを追加しない。OWNERは全選択内容の利用権と秘密/個人情報確認を明示、EXTERNALのlicenseやmodel品質は別検証、JOINTは同candidateのWorker/UI/撤回/競合/再起動受入。

入出力/状態: 保存済みpacket/draftのSHAと現行job revisionへ、用途dataset_preparation_only・範囲current_news_material_and_draft・split evaluation/training_candidate・3つの明示同意を束縛する。既存News配下のlearningConsentsへgrant/withdrawのcommand/指紋/時刻を保存（grant最大10回、全履歴最大21（連続する撤回は現行撤回へ圧縮し、既存event上限内で操作履歴を保持）、撤回は停止・契約失効・鍵不明時も本人認証下で可能）。資料/草稿変更はdigest不一致で旧同意を適用しない。停止/会話削除/他owner/不正rights/疑わしい秘密や個人情報/既知評価素材のtrain候補化を拒否する。引用可summarize_and_quoteは学習準備権にしない。

準備/出力: serverで現在内容のallowlistとSHA・重複確認用content hash・用途を生成し、直前に同job revision/同意/会話存在を読戻す。権利はowner_authoredに限定し全内容の権利を本人が別確認。秘密/連絡先scannerは既知パターンの検出で保証ではなく、検出時は自動削除/改変せず出力を保留する。既知fixture指標を含む素材は評価用にだけ準備でき、train/eval汚染・横断重複・model/data license・独立品質・訓練設定/予算は未受入と明示する。trainingAllowed=false、モデル思考全文/秘密/金融receipt/過去版/一般会話を出力に混ぜない。

復旧/撤回/合格: withdraw後やsource変更後は新しいpreview/exportを拒否し、同command再送で旧grantを復活させない。既に本人がコピーしたファイルや学習済み重みの消去/忘却を保証しない。表示/ダウンロードごとにserverを再照合し、browserのcached許可を使わない。実訓練/外部転送は今回開始しない。境界試験はowner・保存/remember非同意・rights・secret・fixture汚染・digest変更・再送・撤回/停止/削除/並行照合、UIと同artifact再起動、全verify。News以外の実行trace、包括PII検査、実license確認、dataset集約/train-eval分離、実訓練・重み切替は残るgateとして記録する。

同意前でも撤回はrevisionを進める。これにより撤回と並行した古いgrantのCASが失敗し、遅着grantが準備許可を復活させない。過去grantは保持、連続撤回だけを圧縮する。

同じ本人の全保存済みNews仕事で過去に評価用へgrantしたcontent hashまたはdata SHAは、別jobへのコピー・撤回後・注釈だけの変更後も学習候補へ昇格させない。評価用grantは撤回で消さず、削除済み会話の割当も保持する。他ownerの仕事は照合せず、job ID/本文/件数を漏らさない。候補同意のUPDATEとpreview最終SELECTは同じSQL文内で評価割当の不存在を再検査し、並行評価grantが先に保存されたら拒否する。候補準備の後に評価割当が追加されても以降の候補preview/exportは拒否する。コピー済みJSONは回収できないため実訓練前の再照合は必須。正規化や近似重複、外部dataset、他owner横断の汚染確認は未受入で、実訓練前に別検査が必要。grantは元会話live条件をCASのSQLへ束縛し、previewは最後のlive会話join済みjob読戻し後に追加awaitをせず判定する。

#### 複数News仕事の準備データ集約

本人が一覧から1〜20仕事と単一用途を選び、各仕事の既存個別同意を再照合してまとめる。ここで同意は作らず、未同意/異用途/撤回/他owner/停止/会話削除/版変更/評価素材混入が1件でもあれば全体を拒否する。既存WorkJob/historyを読み、別DB・学習台帳・外部転送・model呼出を追加しない。各preview後に記録全体のSHAで完全一致だけを統合し、本文が同じでも注釈・根拠・source metadataが違えば保持する。選択全job/revision/data/contentSHA/consent commandと、統合前の全参照を残す。job ID順で決定的に出力、dataset本文のUTF-8 JSON.stringifyにSHAを付け、保存用整形JSONを128 KiBに制限する。

最後に全会話を復号可能か確認し、一つのSELECTで全job/live会話と同owner評価履歴を照合する。最終読戻し後にawaitせず、撤回・削除・編集・並行評価のいずれかを検出したら全体を409で拒否する。失敗時は選択を読み直し、問題の仕事の個別同意/資料を修正して再試行する。表示とJSON保存は毎回server再照合し、cached結果を実訓練の許可にしない。trainingAllowed=false、model license・実訓練config・近似重複・外部dataset汚染・独立品質は未受入。コピー済みJSONは回収できない。合格条件は重複統合と全provenance保持、順序不変hash、異なる注釈保持、全件同意、owner/CAS/撤回/削除/並行評価の拒否、実Worker/UIと再起動読戻し。

### 計画用モデルへの構造化出力の指示

計画用localhost Ollama呼出では、保存したjobId/objective/sourceSha256をconstにしたJSON Schemaを送る。許可Toolはmr-citations/compose-check/compose-joinのみ、未知のフィールドは禁止し、step/入力/検査条件/未決事項の長さ・件数を制限する。これは返答形式の指示であり、既存parseEvePlanCandidateの本人仕事/素材/権限/予算/グラフ/出典/完成条件の検査や本人採用を代替しない。600token、2試行、停止/重複排除を保持する。実測の20秒応答未確認を受けてlocalhost推論だけ40秒上限（既存90秒lease内）とし、CLIや外部課金の上限は変更しない。実Toolの出力は「## 出典」で、目的が明示しない必須文言を作らないよう指示する。構造化指示があっても不正候補は拒否、失敗usageを残し自動fallbackしない。実モデルの合格は同候補の実応答とTool縦断で別に受け入れる。

### 本文を使えない応答の使用量

Plannerの信頼したOllama adapterがEMPTY_RESPONSEと共に正規化済みusageを返した場合、LLM/provider一致を確認して同じ仕事/試行へ記録する。本文が使えないことと使用量未報告を分け、応答が失敗でも報告済みtokenをnullや0へ置き換えない。モデル名/digestは前後照合し、不一致は候補採用を拒否する。報告の保存で計画/Tool成功、本人承認、金額/請求/入金/作者精算を作らない。停止後の報告も同じ試行に保持し、再送しない。usageのないtransport timeoutは引き続きunknown/nullである。合成回帰試験は空本文+入力17/出力8を返し、通常/停止後の保存、候補なし・Tool0、同試行拒否と会話明細を確認する。

<a id="incomplete-local-usage"></a>
## 不完全な端末モデル応答の使用量

**目的・体験。** 出力上限などで回答を拒否しても、報告された資源使用量を失わず、未取得は未取得と表示する。
**責任。** ROCKはcounter検証と同job/runへの保存。EXTERNALは真のmodel応答とcounter。JOINTは実サービス照合。OWNERは既存予算/実行同意。
**入出力。** Ollamaのdone/done_reason/tool_callsを検査し、INCOMPLETE_RESPONSEにはobserveLlmUsageの検証済みmeteringと要求model IDを付ける。
**状態。** incompleteは失敗/partialのまま。本文を成果に採用せず、Usageだけを同じ評価観測へ保存する。
**保存。** 既存WorkJob.modelEvaluations/usageを使う。本文やcredential、別台帳を増やさない。
**失敗。** counter未報告はnull、不正値は既存invalid判定を維持。過去に未取得だった使用量は推測しない。
**復旧。** 同一run IDは保存済み結果を読み、追加推論しない。
**承認。** 使用量保持から実行/請求/精算/採用の権限を発行しない。local資源量を有料Cloud使用へ混ぜない。
**合格条件。** length/done false/tool-call拒否でもcounter保持、未報告null、同job partial保存・再読込・replay追加推論0。
**未決定。** 過去のqwen3初回provider_failedの真因は未確定。今回の修正で既存不明結果を成功へ変えず、別の許可された限定観測で調べる。




### 配信候補へのモデル評価・共通実行の統合

**目的・責任。** WEB04/SKY21/OS10・Web/ROCK O5が、保存済みfc2f8b34の評価/実測候補とa6b8b3c6の共通実行を、版付き共有・利用結果を含む現Source候補へ統合する。EXTERNALはモデル/端末、JOINTは同一候補の実画面/端末、OWNERは対象・資源・外部送信・公開を選ぶ。既存Source-only backendへ適応する。

**入力と保存。** owner/job/revision/run/task・現在の導入済みmodel digest/capabilities・推定メモリ予算を確認し、最大3問/各600token/40秒の逐次観測を既存WorkJobへ保存する。資源予算は候補判定用推定で、OSのRAM hard limitではない。共通runtimeの担当作成/登録/開始前停止/成果持出しは既存owner暗号化queue/replica/historyを使う。新DB/仕事台帳/移行は作らない。

**状態・失敗・復旧。** 共有担当の開始時snapshotを測定前にも検証し、破損ならモデル呼出0件で拒否する。測定/候補確認で担当・Tool権限・仕事状態・予算を昇格しない。停止後の観測usageとunknownを保持し、再起動後も同IDで読み、同じ測定を再送しない。文章持出しはexact request ID/owner/thread/revision/output hashを再照合する。未到着startのfenceと、実行先の実停止receiptを分ける。

**共存と合格。** 版付き共有→本人Add→同じjobの測定/候補確認→保存済み版で計画→実引用Tool/独立URL検査→本人完了→同意付き利用結果が、同じjob/threadで保持されることを合成Sourceで検証する。別のJDK/TLS/private bridge試験で、共通runtime登録/実行/保存/停止/再起動を確認する。元の担当版・出典・公開範囲・料金・旧Pixelデータを維持する。候補の自動採用、実モデル品質、実ブラウザ/Pixel、全OS/本番金融・成長の受入へ換算しない。

### 実測した計画モデルを同じ仕事へ採用する

目的は、仕事別の測定→候補確認→本人のモデル採用→計画作成→計画採用→実Toolという順序を同じjob/threadで保持すること。候補確認とモデル採用では推論・Tool・支払いを始めない。ROCK（WEB04/SKY21、Web O5）はUI/API/状態/保存/停止、EXTERNALは導入済みOllamaの提供、JOINTは同じartifactの実応答・Web/Pixel、OWNERは担当/モデル/実行の個別確認を担う。

`POST /api/llm/adopt`は本人用localhost限定。Origin、独立本人認証、`x-sky-owner`、Eve利用権、4KB入力、job/revision/commandId/runId/model/digest/task/memoryBudgetを照合する。clientの点数/report/権限は受け取らない。server保存済みの最新合格評価、suite3の課題/JSON/thinking抑制/上限を含むhash、1時間の期限、現時点のモデル容量/context/hashと照合する。選択した担当のモデルと異なる場合は拒否する。

未実行のactive仕事だけで、同じ既存work_jobs payloadへ採用元のrun/版/hash/能力と計画用modelを保存する。新DB/台帳/queue/権限は作らない。既存の計画試行・Tool成果を置き換えず、停止・revision競合・会話削除は同一SQL更新で採用を止める。同じcommandIdの応答喪失は読戻し、内容変更/別操作での再利用は拒否する。

実際の計画推論前後にもモデルhash/容量/context/completionを観測する。変更/未確認なら別モデルへfallbackせず、前段で拒否、または遅着使用量だけを保持して候補を採用不可にする。期限切れ、後続評価、担当/モデルの変更も確認する。これは観測したmetadataの一致であり、実行weightsの暗号学的証明ではない。遅着応答は停止済み仕事を再開しない。

不完全/停止/応答失敗の限定採点は画面と暗号化会話で「未確定」と表示する。全3問を採点した結果の0点とは分け、判定済み形式件数・報告済み使用量は残す。旧suite2の履歴は削除せず、現suiteの推薦へ流用しない。メモリ予算は候補容量の推定で、OS RAMの強制上限ではない。

合格条件は同job/thread/素材/予算/担当/評価の保持、明示クリック前の採用0、採用時の推論/Tool0、再送/再起動の一致、実行前後の版/能力変更拒否、停止/削除の競合拒否、不完全評価の未確定表示である。現在はSourceローカル候補。Web実画面と実Pixel、共有済み担当の同ID native準備、native成果の本人検収→利用結果共有→別本人Addは別の受入条件として続ける。Ollama計画用の採用をPixel GGUFの適合/導入済みへ換算しない。[証拠](evidence/eve-model-evaluation-integration.json#protocolFollowup)。

**次の条件。** 実装した明示採用/pinの同一Worker/実画面受入、共有済み担当を同じIDでnativeへ準備する入口、実UI/同一公開候補/実Pixel発話・保存・停止、実モデルの出力適合は残る。根拠と現在のsource差は[eve-model-evaluation-integration](evidence/eve-model-evaluation-integration.json)を参照する。全CORE/SI/U/RQのGoalを保持する。

**固定候補の受入境界。** 保存済み747までを取り込んだ同一Sourceは、全体2753pass/1skip/0fail、API1582/CSV385、共有HTTP207、JDK/Linux165項目を合成利用者・制御モデルで通過した。後続1c870e5（suite3/JSON/thinking抑制）は未統合で、次版では送信前の共有担当検査を保持して適応する。partialの数値0は品質未確定であり、UI/履歴を未確定表示に直す条件を残す。推薦の実行時固定・共有済み担当の同ID native再利用・実UI/Pixel/公開を合格へ繰り上げない。


<a id="evaluation-protocol-v3"></a>
## 評価のJSON・思考出力条件を固定する

**目的。** 回答形式と限られた出力予算を測定条件として固定し、思考だけで上限へ達した応答を成功にしない。
**体験。** 既存localhost評価から同じ仕事へ3問の結果を保存し、未完了は候補に採用しない。
**責任。** ROCKはrequestとsuite版/hashの固定・検査・旧成績拒否。EXTERNALはmodelの実応答。JOINTは同じmodel/hashでの実測。OWNERは既存の実行/資源同意。
**入出力。** 既存generateTextへjsonOutput:true/disableThinking:trueを指定し、600token/40秒/問を維持。Ollamaにはformat:json/think:falseを要求する。
**状態。** suiteをsky-local-model-eval/3へ更新し、suite hashにtask/cases/version/request protocolを含める。旧suite2を同じモデル名だけで再採用しない。
**保存。** 同じWorkJob/runに版付き成績を保存。旧観測・usage・失敗は書き換えず残し、新しい自動推論/再発行を行わない。
**失敗。** 要求したJSON/停止をmodelが守る保証はない。既存の終了/本文/JSON/品質/同digest検査を維持し、失敗はpartialとusageを保存する。
**復旧。** 同じrun IDは既存成績を読戻す。異なる測定条件は別の本人確認済み測定として扱う。
**承認。** 新条件は測定要求の指定でありmodel/Broker/Toolの権限を増やさない。Cloud fallback、モデル取得、出力上限拡大なし。
**合格条件。** request flags、protocol入りsuite hashと選定側の一致、旧成績拒否、保存/replayを試験。同じmodel/hashの実応答は別に測り、未達は採用しない。
**未決定。** 既存qwen3の一回診断ではHTTP200/length、本文0、thinking2557文字、output600tokenを観測。この条件を改善できるかはv3実測で判断し、一般能力や実務品質を宣言しない。
