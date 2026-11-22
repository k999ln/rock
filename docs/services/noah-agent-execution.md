# Noah — 外部Agentを接続して使う

## 2026-11-17 CowAgentの背景接続（短文・ファイルの限定受入）

- 対象は`research-25a5f6ae5d1576507f83`、MITの公式`zhayujie/CowAgent`。commit `bcc36de52ca17b45d1132f388a04b7a456bd3f95`とtar sha256 `8a63fc30101eff9ffac7889112ea2ee8c79a632dc33fd7d7a0b5e01e9d6a2ccd`を固定する。
- 公式`agent.protocol.Agent`のloopとread/write Toolを呼び、モデル要求を既存の固定ローカル中継へ渡す。作業領域のファイル/文章を扱い、TUI、外部チャット、skills、browser、shell、本人desktopへの接続は開始しない。原本を改変せず、adapterの対応範囲を画面に表示する。
- 接続で固定版とToolのprobe、依頼で正常な最終応答/打切り/エラーを区別し、モデル呼出と成果を既存Workへ保存。既存の同時1件/時間/CPU/メモリ/非root/外部networkなしを維持。元モデルを変更せずTool接続版の共有管理を利用する。
- Jev条件: 公式配布/依存hash一致、実入力→公式Toolによる指定ファイル→Work、画面閉鎖後の同Job成果、実行中停止後container0、再接続、重複実行0、他owner/別Origin拒否。終端欠落・出力打切り・Tool失敗を成功へ昇格しない。全業務/クラウド/Pixelの完了とは分ける。

- SSDの実画面から接続・指定ファイル・3ファイル・Work保存を確認。最終adapterでタブ閉鎖の5.862秒後に`COW_FINAL_CLOSED_OK\n`を保存した。開始直後のUI停止はcancelled・container0（モデル呼出前）、同じ実行期間中に別画面の検索欄へ入力できた。これは全端末の遅延や推論中の停止性能の測定ではない。再送は同Workを返し、本文改変409・別Origin403・scope不一致409。別実accountの受入は含まない。
- 公式Toolの開始/終了ID・名前・success・permission拒否と正常な最終応答を照合する。準備診断は公式run.logへ残し、成果本文に混ぜない。500語の依頼はexitCode 1・成果なしで保存し、長文/実務の成功には数えない。
- 限定受入を1件追加し13/85件、残72件。試験・全11項目・初回取得失敗と修正・最終hashは`work/verification/noah-cow-runtime-20261117/`。

## 2026-11-17 Tool接続版の実処理検証

- 元モデルのTool定義描画を修正した管理ID `qwen2.5-tools:1.5b-v1` をQwenPawの新接続へ使用。重み・license・推論条件は原本と一致し、変換前後のtemplate hashと派生digestを固定する。元モデルと過去Workは残る。native Tool結果の`tool_name`を直前のTool call IDから対応付ける。
- 同じ3ファイル依頼が2回のモデル呼出で指定内容を生成。停止Workはcancelled・container0。接続停止後に専用参照を削除しても元モデルは残り、再接続ボタンで同じdigestへ復元した。その後の3ファイルWorkはタブ閉鎖の4.533秒後に完了し、再表示で成果を確認した。
- 300語の長文は修正版でも失敗。実診断で643入力token・2048出力token・`done_reason=length`・空応答を記録。上限を引き上げたり短文へ差し替えたりして合格扱いしない。画面非共有と業務品質は別に判定する。
- 記録: `work/verification/noah-model-tool-calls-20261117/`。今回追加0、12/85件・残73件を維持。一般cloud/Pixel/全画面の無遅延は未受入。

## 2026-11-17 QwenPawの背景接続（短文・ファイルの限定受入）

- 対象: `research-ce4d82de8c3d6abcf0ee`、公式 `agentscope-ai/QwenPaw`、Apache-2.0。PyPI `qwenpaw==2.3.0` のwheel sha256 `be6ffdb0f3ebca2b077373daee04d0cc178bfd693708fc8174cca628c3c702a1`。依存を解決時の版/hashへ固定し、準備は専用Linux VM内に限定する。公式本体とlicenseを保存する。
- 接続: 既存「接続する」→背景準備→起動probe→固定ローカルmodelの参照→依頼待ち。Nodeの取得hostから本人用Terminal/ブラウザを開かない。公式 `QwenPawAgent` の実loop、file Toolとguardを使用する。独自のLLMチャットへ置換しない。
- 対応範囲: 新規の作業領域に文章/ファイルを作る1依頼。入力は既存prompt、出力は本文/最大12ファイルとWork。外部networkなし、画面/入力/socket/本人ファイル共有なし、既存CPU/メモリ/時間/モデル回数上限。browser、desktop、外部チャット、長期記憶の共用は対象外。
- 失敗: 準備/権限/モデル/Tool/正常終端を分け、打切りや中断を成功にしない。停止は専用processの終了確認まで待つ。画面を閉じてもhostは処理を続ける。未確認の依存準備成功を接続済みにしない。
- Jev条件: 固定本体/依存probe、実モデル→公式Tool→指定内容の成果→Work、タブ閉鎖中の継続、別画面操作、再送実行0、owner違反0、停止後container0、再接続を確認する。実測前は85件の受入数を増やさない。記録: `work/verification/noah-qwen-runtime-20261117/`。
- 実測: SSDのUI接続、固定qwen2.5:1.5bによる指定ファイル、タブ閉鎖後の`CLOSED_SCREEN_OK`、Work保存、UI停止後container0、再接続後`RECONNECTED_OK`を確認。今回1件を限定追加し12/85件・残73件。300語の長文はモデル出力不足で失敗しており、長文/実務品質の合格ではない。背景タブの入力応答は確認したが、全画面の無遅延を保証しない。本人が同じ認証のままscopeヘッダを変える操作は別アカウントの試験ではない。一般cloud/Pixelは未受入。

2026-11-17招待の実行共有: 作者は「保存版コードのダウンロード」に加えて「この版の実行」を明示許可する。受取人は招待を受け取った後、接続・依頼・停止とライブラリ追加を選ぶ。view/sourceの既存招待へ実行権は後付けしない。`executionAllowed`はsource権限とNode/Pythonのruntime定義がある時だけ受け付ける。`invite-<UUID>`を既存の背景runnerへ接続し、Workに招待/原本ID・manifest/source hash・runtime・grant revision・期限を固定する。開始時・モデル呼出時・終了時に照合し、実行中は期限timerと2秒間隔の権限再確認（通信時間は別）で期限切れ/撤回/許可変更を検出してprocess終了を待つ。画面を閉じても照合は継続し、失効による停止はWorkのfailedとして理由を保存する。購入・外部送信の許可は含めず、既取得ファイルの遠隔消去は行わない。作者の利用集計は既存Workから算出し、仕事本文や成果を公開しない。実UIの接続/実モデル結果/招待撤回と、別利用主体の合成DB試験は別々に記録する。

## 2026-11-17 DeepSeek Harnessの背景接続

- `research-890a56b0d2aff0c91c90`を公式`@deepseek-ai/dsh@0.2.2-rc.3`のheadless profileへ接続。npm配布sha256と全依存lock、Node imageを固定。公式loopとread/write/edit Toolを使い、単なるLLM応答への置換をしない。
- 専用VM/非root/外部networkなし/host mountなし、CPU1.5・1536MiB・同時1件を保持。固定ローカル`qwen2.5:1.5b`への既存stdio中継を使い、本人の画面・入力・browserを使わない。Shell・Web・subagent・対話機能は対象外。公式native loaderは`NARB_DISABLE_NATIVE_CACHE=1`で読み取り専用imageの部品を使い、scratchのnoexecを外さない。
- 接続でCLIの起動確認、依頼で公式headlessを実行。process終了0と同一sessionの`final.reason.kind=completed`を両方要求し、成果とモデル呼出を既存Workへ保存。既定上限240秒/8呼出/成果12ファイル、各32KiB/合計64KiB。
- 実UI接続→依頼→タブ閉鎖→成果再表示で`result.txt=137\n`、停止後container残存0、再接続後の実処理、実行中の別画面検索入力を確認。再送は同じrevision、入力変更/owner変更は409。実アカウント2者のログイン試験は別途必要。
- 文章品質の保証ではない。再接続試験の1500語指定は671 bytesの短文となり、分量要件は未達。実行経路の受入と、Agentの業務品質を分ける。起動引数とnative cacheの初回失敗は証拠に保存。
- 限定受入は初回8＋Codex＋Anicca＋今回DSH=11/85件、残74件。証拠`work/verification/noah-dsh-runtime-20261117/`。Mac停止後の一般cloud、全外部業務、Pixel、本番の受入ではない。

## 2026-11-17 Aniccaの文章作成を本人Codexへ接続

- `anicca`は公式commit `28e7f3f333474f18b5da51acfe18b063cf727ad0`の`runtime/agent-runner/agent_runner.py`を専用VMで実行する。現行mainで確認したrunnerと同じblob。公式MIT LICENSEをimageに保持。取得先はcanonical `Daisuke134/anicca.git`へ更新し、旧life-managerのcacheは同じ固定commit・tar hash・Git検査に合格する場合だけ再利用する。
- Noah adapterは公式runnerの`provider_process_env`だけをcredential-free transportへ置換する。これは公式標準のMac導入そのものではなく、Noahの連携adapterである。候補選択・期限・schema検証・attempt/summary生成は原本runnerで処理し、実行imageとadapter版を固定する。auth fileの複製、偽token、host filesystem/画面へのfallbackは使わない。
- 対応は`composition-agent`の文章/計画作成1依頼。固定schemaは`answer/next_steps/limitations`、入力16文字以上・12KB以下、応答16KB以下、最大240秒。本人Codexは既存の実モデルを使い、Tool・environment・MCPなしの一時threadで応答する。外部サイト操作・投稿・営業・常駐loopは未対応。
- 画面は「接続する」→背景準備→送信確認付き依頼→`result.json`と`anicca-receipt.json`→停止。前述Codexと同じ`providerConsent`が必須。WorkにAnicca固定版・image・実モデル・公式CLI hashを結び、受領票に公式runner hash・schema判定・試行記録を残す。provider/runner双方の停止確認前に停止成功としない。
- Jev受入: 実UIで接続・文章成果・Work保存。タブ閉鎖後も同Jobがrunning、別画面検索後に成果を再表示。別Jobの処理中停止後はcontainer残存0。同ID再送は同revision、入力差替409・送信確認なし400・短すぎる入力400・別owner409・別Origin403。個人集計は成功2/停止1、費用は未計測。証拠: `work/verification/noah-anicca-runtime-20261117/`。
- 外部Agentの限定受入は初回8件＋前回Codex1件＋今回Anicca1件=10/85件、残75件。Aniccaの全業務・一般クラウド常時稼働・Pixel・本番の合格とは数えない。下の日付節は以前の受入時点の記録。

## 2026-11-17 本人Codexのバックグラウンド実行

- `research-adc2fb98c295eaf3fc52`を公式app-server＋専用VMに接続。接続時は本人の既存ChatGPT認証、端末environmentなしの一時thread、固定作業imageを確認し依頼待ちにする。認証fileをAgentへ渡さず、本人設定も書き換えない。
- `POST /__noah/executions`はこのAgentに限り`providerConsent:"codex-account/1"`を必須にし、依頼文と一緒にdigestへ固定。画面でOpenAIへの依頼・作業結果送信と本人契約枠の消費を確認する。料金未計測を0円と表示しない。
- Workの`provider`はname/model/公式CLI版・SHA256/consent/metric=`provider_turns`。1件の依頼を内部model呼出回数とは数えない。model/版変更後は再接続。同ID再送は同じWorkを返し推論しない。
- 公式code-modeはV8のTool中継だけを使用。thread/turnのenvironmentは空、host shell・browser・computer use・plugins・既存MCPを無効化。動的Toolは固定`noah_workspace`だけで、コマンドは認証なし・networkなし・host mountなしのLinux containerへ渡す。無対応protocolは拒否する。
- 初期範囲はPython標準ライブラリ・テキスト・ファイル作成。最大240秒、Tool12回、成果12ファイル/各32KiB/合計64KiB。containerはCPU1.5相当/メモリ1536MiB/96process、共通host実行は同時1件。すべてのPC操作の無遅延を保証する値ではない。
- Jev受入: UIの接続→実Codex→Python計算89→成果/Work、タブ閉鎖後の結果、別画面検索、処理中停止後container0、送信確認なし拒否、再送/異なる入力拒否。証拠`work/verification/noah-codex-runtime-20261117/`。既存8件＋Codex1件=9/85件、残76件。Anicca公式runnerとの接続、GUI Agentの専用画面、一般常時運用/cloud/Pixelは未完了。

2026-11-17配布版接続: `source.artifact.runtime`を審査manifestへ固定し、`release-{manifestSha256}`を接続IDとする。既存の購入/サービス利用権と審査の有効性を準備・実行開始・モデル呼出時に照合する。作者private登録の削除後も配布snapshotを用い、外部操作の許可へ昇格しない。入出力は文章prompt/text、成果ファイルはWork添付、処理時間は配布版の上限（最大240秒）。

## 2026-11-17 背景モデル要求の負荷制限

2026-11-17 Tool通信の修正: Ollama 0.40.8の実描画でQwen2.5のTool定義がJSONではなく内部structになり、621入力token/79出力token後に空応答となることを再現。提供元の[不具合報告](https://github.com/ollama/ollama/issues/19529)とも一致する。Noah専用の固定template修正版を既存モデル管理へ追加し、QwenPawの新しい接続に使用する。共有Ollamaの更新/全体設定変更、未知Toolの推測実行、空応答の成功扱いはしない。元モデルと古いWorkを保持する。実結果の受入前に複数ファイル/長文対応を保証しない。

- NoahがローカルOllamaへ送る要求は`options.num_thread=2`を固定し、Agent由来のthread/並列/モデル保持設定を転送しない。Ollamaの全体設定や他アプリの要求は変更しない。公式の[Runner options](https://github.com/ollama/ollama/blob/main/api/types.go)に基づくCPU推論thread設定で、GPU使用率・全processのthread数・Mac全体のCPU上限ではない。
- 既存のhost同時1実行、container CPU1.5/1536MiB、専用モデルの要求後30秒保持を維持する。接続準備が完了すると依頼待ちになり、入力した仕事または本人が開始した運用だけを処理する。本人desktop/Terminal/browserへの自動切替をしない。
- Jev条件: Agentが大きい`num_thread`/`keep_alive`を要求してもhost固定値を送ること、既存の成果/停止試験が通ること、実モデルによる成果を得ること、別画面の入力とWork継続を同時に観測すること。端末全体の「無遅延」は別の性能受入であり、この設定だけで合格としない。

## 2026-11-17 本人の画面を操作しないAgentテンプレート

- 全Agentの実行に本人desktop非接続を要求する。CLIであってもhost上の任意コード実行は認めない。Macの画面・入力・clipboard・本人browser profile・desktop socketを共有しない。
- 作者用テンプレートは`noah-agent/1`の任意`runtime`に`noah-terminal/1`、言語(node/python)、相対entrypoint、モデル(none/固定ローカルモデル)を宣言する。既存manifestのhashは任意項目を追加しなければ変わらない。
- テンプレートのstdinへ1行JSONで依頼を渡す。stdoutは既存`model_request`/`result` protocolを使う。終了コード・ファイルhashを照合し、モデルなしのプログラムも実行対象とする。表示専用のログはstderr。未知のopcode、画面操作要求、任意URL転送を拒否する。
- コードは固定したZIP/単一ファイルから専用volumeへ格納し、読取専用で非root containerへ渡す。外部network・host mount・daemon socket・device・display共有なし。固定base imageを使い、任意install hookをhostで実行しない。初期対応は標準ライブラリと同梱モジュール。
- Jev条件: Node/Pythonの実入力→実出力、原本hash不一致拒否、経路逸脱拒否、画面socket/hostファイルなし、ネットワーク拒否、停止後containerなし、同じWorkへの再送で実行1回。提供元の外部業務合格とは別に記録する。
- ブラウザ/GUI必須の外部Agentは専用仮想環境adapterが必要。未配備の間は起動条件未達として表示する。Aniccaの旧host設定serverは新規起動を拒否する。互換解除APIは残すが、この実装はhost processを生成しない。以前の別hostが所有するprocessの停止確認は別途必要。


- 本人が言う一言: 「残りのagentも、ワンクリックで接続して実際に使えるところまで」「接続処理のテストも同時にして」
- Goal: Noahの取得済みAgentを、本人入力→Agent固有の処理→結果・生成ファイルまで使えるようにする。まず本人Macのローカルモデルで0円の範囲。
- Noaがつなぐもの: 固定版の外部Agent配布物、Noah専用の隔離実行器、既存Ollamaモデル、本人のWork。
- AMCの工程: 対応recipe/版確認→本体と依存の準備→実測接続→明示入力の受付→実行許可/上限確認→Agent自身の処理→結果/生成ファイル保存→本人確認。
- Jevの合格条件: 接続とモデル応答/Tool成功を区別、再送実行0件、取消後の新規モデル呼出0件、別ownerの結果取得0件、hostファイルと鍵のmount0件、実行containerから外部network0件、生成ファイルの境界外読取0件。各対応Agentで実入力/実出力を検証する。
- 出力先: Noah詳細内の依頼欄、進捗、結果、生成ファイルとWork参照。
- Wallet: ローカルモデルのみ、費用0円。有料API・公開・送信・購入を自動起動しない。計算上限はhost実行時間/回数/容量で制限する。
- hardware profile依存: 初回はMac上のNoah専用Linux VM。既存Docker/VMのcontextやhome mountを変更しない。Mac非稼働中の一般Agent実行はこの経路では対応しない。
- 失敗時: 未対応/モデル不在/依存/認証/実行失敗/結果不明を表示。結果不明を自動再送しない。停止はNoahが所有する実行だけ。
- 記録: Agent ID・配布版/hash・実行器版・モデル・入力hash・実行ID・出力/生成物・時間・呼出数。accountのWork記録とhost cacheを区別し、推論結果だけで外部業務完了にしない。

## 実行器

- 既存Colimaを専用profileで使い、`--mount none`、context自動切替なし、SSH config追記なし。SSD内にVM状態を保存する。
- 実行containerはnetworkなし、host mount/daemon socketなし、rootfs readonly、非root、CPU/memory/PID/time制限。作業領域だけを一時書込可能にする。
- Agentのモデル要求はstdio経由でNoahへ渡す。Noahは本人が指定した固定ローカルモデル・固定loopback endpointだけを呼ぶ。AgentからURL/credentialを受け取って転送しない。
- recipeで確認した公式AgentのCLI/SDKをそのまま実行する。SDK接続の場合はその事実と制限を画面へ表示する。
- 本体のないサービス、認証・有料host必須、外部送信を含むAgentは必要条件を明示し、別製品へ勝手に置換しない。
- 本工程の接続テストは合成した非機密入力で行う。本人の私有ファイルや会話履歴を試験入力へ転用しない。

## 2026-11-15 実装仕様

| Agent | 配布・実行版 | ローカルモデル | 実行できる範囲 |
| --- | --- | --- | --- |
| Aider | aider-chat 0.86.2、公式CLI | qwen3:4b | 空の作業領域でコード・テキストを作成 |
| gptme | gptme 0.36.0、公式CLI | qwen2.5:1.5b | save / shell Toolによるファイル・Python処理 |
| OpenHands | openhands-sdk / openhands-tools 1.62.0 | qwen2.5:1.5b | 公式SDK AgentとTerminal Tool。Web UI全体ではない |

公式Agent自身へ依頼文を渡す。Noahが代わりに定型ファイルを生成する試験ではない。qwen3はこのMacの`/api/show`が`thinking.values=[true]`を返すため、その設定で呼び出し、推論過程を結果へ転記しない。モデルの出力には誤りがあり得るので、終了コード0だけで業務成功・Jev合格にしない。OpenHandsはSDKのsystem_prompt設定で今回の隔離作業に必要な指示へ絞る。モデルが応答もToolも返さない場合はエラーとし、空ファイルには画面で警告する。UTF-8の依頼文・出力は通信chunkの境界で壊れないように復元する。

### APIと状態

- `GET /__noah/installations/:agentId`: 接続状態、固定版、実行イメージSHA、対応範囲、モデル、上限を返す。既存connect/disconnect/removeを利用。
- `POST /__noah/executions`: `{ id: UUID, agentId, prompt }`。依頼を明示して押した操作だけを受付。最大12,000 UTF-8 bytes、host同時1件。Owner scopeとOrigin必須。同じID/同じ入力は同じWork、異なる入力は409。
- `GET /__noah/executions[/:id]`: 本人の実行記録。`POST /:id/stop`は`{}`で停止。ホストの実行表が失われたqueued/runningはunknown表示にし、自動再送しない。
- `GET/POST /api/noah/executions`: 既存`work_jobs`への保存・CAS更新。新しいJob DBを作らない。現在はloopbackの`local-preview:rockstar-owner`限定。一般公開hostからは404。
- 状態はqueued → running → returned / failed / cancelled。終了はWorkのreviewで、steps.passed=falseを保持。`verification=host_observed_unverified`、`chargeMinor=0`。外部Toolの受領票やBroker署名には昇格しない。
- Work bindingにAgent ID/版、image SHA、モデル、入力/hash、記録権限のhash、呼出回数、生成物、状態を保存。記録権限の秘密値はhostメモリだけに置き、ブラウザへ返さない。汎用Work操作からの完了化を拒否する。
- 実行許可は本人・同一Origin・固定recipe/image/model・入力hash・時間/容量上限に限定。外部A2A/業務Tool/認証情報への許可は持たず、既存Broker/Walletの有償・外部実行ゲートを開けない。

### 実行上限と保存

最大240秒・モデル8回・1応答2,048 tokens・コンテナ1.5CPU/1,536MiB/96PID。外部networkなし、host mount/socketなし、非root、rootfs readonly。workspace/home/tmpは各64MiBの一時領域。生成ファイルは12件、各32KiB、合計64KiB。パス/重複/容量/hashをhostとWork APIで照合し、HTMLも添付ファイルとして保存する。任意HTMLとして画面へ実行しない。

SSDの`work/runtime-state/noah-engine/colima`に専用`noah-exec` VMを置く。配布ベースと上位パッケージを固定し、実行時はイメージSHAで指定する。依存一覧はイメージ内`/opt/dependencies.txt`。全推移依存を配布用lock/hashとして管理する工程と一般利用者への配布・更新は未完了。

### 検証コマンドと残件

- 単体/境界: `node --experimental-strip-types --test tests/noah-agent-execution.test.mjs tests/noah-managed-installations.test.mjs`
- 実接続: SSDのNoahを起動後、`node scripts/check-noah-agent-execution.mjs --live --output /private/tmp/noah-execution-proof.json`。3つの公式Agentが合成入力から指定ファイルを作ったか、二重送信、変更入力、Origin/owner、偽の記録権限、停止/再接続を検証する。
- 一般AgentのMac停止中の稼働、スマホからMacへの認証付き中継、私有ファイルの選択投入、継続セッション、外部業務アカウント操作、SaaS契約・購入はこのローカル経路の合格に含めない。
- 残りのcatalogは配布条件・対応recipeが必要。Aniccaは設定画面まで、Codexは認証/接続確認までという先行範囲を保持する。Hugging Face computer-agentにはE2B/HF認証と提供元への実行ログ送信処理があり、無設定で起動しない。全79,643件が実行可能という表示はしない。

### 日本語の実処理受入

OpenHands SDKへ「Pythonを実行して1200+800を計算し、sales-total.txtへ保存」を依頼し、公式Terminal ToolによるPython終了コード0と、生成物`2000\n`の内容・SHA-256を確認。小型モデルの誤りや空応答も検出したため、これは個別タスクの受入であり、任意業務の正しさの保証ではない。詳細はtask 63とSSDの検証記録に残す。

## 2026-11-16 リファクタと対応追加

- 対応定義を`lib/noah-execution-contract.mjs`へ集約。詳細画面の依頼欄、Work bindingの検証、hostのモデル選択/上限が同じrecipeを使う。旧script importは互換re-export。catalogの文章から実行命令を生成しない。
- 隔離runnerは通信/子process/成果回収を担当し、OpenHandsとnanobotの公式SDK構成を各`*_sdk.py`へ分離。実行image fingerprintは両SDKファイルも含む。
- nanobot-ai 0.4.1の公式SDKを追加。qwen3:4b、公式exec Toolのみ（ファイル操作も同Toolで実行）。標準CLIの全Tool/Skillは小型モデルの入力枠に収まらないため、このprofileではSkill・チャネル・常時運用を含めない。入力枠8,192 tokens、SDKの応答予約2,048 tokensを使い、hostは最大2,048以内の小さい予約を尊重する。公式AgentLoop自身が処理を行う。qwen2.5の日本語計算は空応答となり、qwen3の1,024 tokens予約も出力不足となったため、現在の構成へ変更した。
- 詳細データは最大4 shardのLRUとし、同時読込を共有。読込失敗後は再試行できる。閲覧だけでは永続runtime slotを作らない。検索は全件数を数えつつ、返す最大50件だけを保持する。Viteには大規模JSONをraw dataとして渡す。
- 実行記録の取得エラーと操作エラーを分離。読込復旧で古い読込エラーだけを消し、操作の拒否は残す。本人照合/取得に失敗した結果は隠し、再読込まで新規依頼を無効化する。Agent/ownerが変わると依頼panelを作り直す。
- 85件の登録Agentを現行経路と照合: 隔離実行recipe 4、Codex認証接続1、Anicca設定画面1、本体取得のみ60、配布・接続条件確認19。最後の79件の実行対応は未完了。公開検索候補79,643件全体を実行可能とは扱わない。

メモリ再現コマンドは`node --expose-gc --max-old-space-size=192 scripts/check-noah-memory.mjs --output /private/tmp/noah-memory.json`。85件×5周、425回の読込後heapは旧111.22 MiB→新11.85 MiB、観測peakは132.98→33.88 MiB。これはcatalog loader単独のGC後測定で、モデル/VM/ブラウザ全体や長期連続稼働の保証ではない。

実試験の詳細・失敗履歴・残件はtask 64とSSDの`work/verification/noah-runtime-refactor-20261116/`に残す。Macを閉じた状態の一般Agentの稼働や、有料SaaSを無契約で使えるようにする変更は含まない。

## 2026-11-16 task 65 追加4件

| Agent | 配布・実行版 | 確認した処理 |
| --- | --- | --- |
| Goose | 1.59.1、公式Linux arm64 CLI | モデル→ファイルTool→指定テキスト保存 |
| OpenFang | 0.6.9、公式Linux arm64実行器 | 公式daemonの隔離Agent→指定テキスト保存 |
| Data Analysis Agent | commit d0991fca3bb3d5431237053830b12b962268f6ad | 公式Python Agentが1200+800を実計算→2000のレポート |
| Cline | @cline/sdk 0.2.0 | 公式SDK Agentとbash Tool→指定テキスト保存 |

いずれも既存qwen2.5:1.5bを使う制限付きprofile。Web検索・外部業務アカウント・製品全体の機能を動かしたとは扱わない。Clineは小型モデルでコードリファクタを返せない失敗も確認し、保存時運用の担当にはAiderを選択した。Data Analysis Agentは公式の最終レポート例が架空の数値を誘発したため、レポートpromptを観測結果だけに限定した。元Agentの分析とPython実行は維持する。

Goose/OpenFang/Clineは固定URL・SHA-256の公式配布物を取り寄せ、取得済みファイルも再照合する。HTTPSの許可済み配布hostだけ、redirectは3回、取得は256MiB/180秒以内。Clineの推移依存はnpm lockで固定する。native/SDKが作る一時DBに限りscratchのファイル上限を4MiBにし、成果物32KiB/件などの回収上限は保持する。日本語の成果物名は許可し、制御文字・bidi・traversalは拒否する。

85件すべてに個別の実行方式・必要環境・認証条件・公式参照を持たせた。実行対応は8件、残る77件は未完了。Devin/Harvey/11x等は本人の契約なし、Hermesは64K contextが必要で現構成は不足、ARTEMISはAndroid試験端末が必要など、条件を画面へ表示する。本体の取得と実行可能を分ける。

新規4件は接続→実出力→Work記録、二重依頼、変更入力、別Origin/owner、偽Receipt、停止/再接続を実測。証拠はSSDの`work/verification/noah-agent-connections-20261116/`。任意業務の正しさ、全機能、全Agent、一般利用者向け配布の合格ではない。
