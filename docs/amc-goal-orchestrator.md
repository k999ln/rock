# AMC Goal Orchestrator

H1 / AMC02。依頼からGoalと意図を確認し、部隊案・準備工程・仮工数・Goal用指示文・進捗台帳を作る。既存standalone HTML／CLIを保持し、Skyの第一者ToolとZema内の専用画面にも接続する。Web版は本人認証と既存D1を使い、WebからAIを直接起動しない。ローカルCodex CLIの明示的な一件実行は別入口で、新しいWorker・DB・model・常駐executorは追加しない。

## Sky／Zema統合版の使い方

Tool IDは`rockstar-amc`。SkyでAMCの「今すぐ使う」を押すとZemaを開く。依頼を書いて送ると、専用の埋込みカードへ原文を引き継ぎ、そのままGoalと意図を確認できる。独立画面はWebアプリの`/amc`からも開ける。iframeで古いHTMLを表示するのではなく、既存のWeb仕事契約へ接続した画面である。独立画面の初期の「部隊・進捗」では正本5師団32部隊のGoal・段階・残課題・手順・条件を参照する。ここから正本の進捗を変更することはない。

1. 「新しい依頼」または「依頼・Goal」を開き、作りたいソフトウェアを入力する。
2. 「Goalと意図を確認する」で、できたら完成となるGoalと、誰の何を良くするのかを確認する。
3. サインインした本人が「このGoalと意図で計画を保存」を押す。既存と同じ4役割7工程のソフトウェア準備テンプレートを保存する。`active`はこの限定計画の承認で、全7工程は`pending`のまま。LLMによる意味分解や作業開始ではない。
4. 後から「保存したGoal」で本人の記録を開く。実際に別環境で行った開始・成果提出・別担当の検収を手動で記録する。前提、保留、成果物pathの排他、証拠、親とGoal全体の受入条件は既存engineが検査する。
5. 「AIへ渡す指示をコピー」または「指示文・バックアップ」から指示文／Goal JSONを書き出す。コピー・書出しだけではAIへ送信しない。ローカルでCodexを起動する場合は次節の明示コマンドを使う。

### このPCのCodexで一件動かす

`codex login status`がログイン済みであることを確認する。Webの保存済みGoalで「このPCのCodexで作業を進める」→「Codex用Goalを保存」を押し、このrepositoryのターミナルで実行する。`<...>`は実際に保存したファイルの絶対パスに置き換える。

```sh
npm run mission:codex -- status --goal <保存したGoal JSONのパス>
npm run mission:codex -- run --goal <保存したGoal JSONのパス> --allow-codex-upload
```

`--allow-codex-upload`はGoal本文と関連repository文脈をCodexへ送る明示操作。Goalに秘密情報を含めない。既存テンプレートの「外部送信しない」に対する例外はこのCodex呼出しに限り、その他の外部送信やサービス変更は許さない。`run`はAMCの`readyTaskIds`の先頭一件だけを選ぶ。別の着手可能taskを選ぶ場合は`--task <ID>`を指定する。Codexはローカルrepositoryを`workspace-write`で扱い、追加権限要求は許可せず止める。commit、push、公開、課金、実機操作、資産移動を禁じる指示を付けるが、生成結果は自己申告なので必ず内容を確認する。作業記録はGit管理外の`work/amc-codex-runs/`に作り、元のGoal JSONは変更しない。

実行フォルダには開始時のGoal、Codexの指示・イベント・最終報告、結果反映後のGoalを残す。同じGoal ID・revision・taskの再実行はclaim記録で拒否する。必要な成果物が実在しCodexが完了を報告した場合だけ`submitted`（別担当の検収待ち）にする。報告不正、成果物不足、失敗・結果不明・人の判断が必要な場合は`paused`または`failed`で保存し、勝手に次の作業へ進まない。processが強制終了して開始時JSONだけ残った場合は結果不明として実物とCodex履歴を照合し、自動再実行しない。Codexの自己申告だけで`verify_task`、`accept_goal`は行わない。

結果をWebに表示するには`goal-r…-submitted.json`などの最終Goalを確認し、下部の「Codexの結果・既存Goalを読み込む」でJSONファイルを選び、内容を確認して本人の領域へ追加する。ファイル選択だけでは保存されない。これは元のWeb記録の更新ではなく別記録であり、元の記録と自動mergeしない。実行前に別画面で元Goalが更新された場合は、古いJSONをそのまま使わず再書き出しする。ローカルCodex実行とWeb保存、Codex processの復旧はまだ一体化していない。

準備計画は固定テンプレートであり、依頼の詳細・実装path・正確な工数は最初の3工程で再確認する。4役割はそのGoal内の提案で、正本32部隊へ追加しない。元の依頼・Goal・意図を保持し、重要な範囲追加・権限不足は本人判断に戻す。Web画面からの直接起動・自動同期・継続的な自律実行・通知配送は未接続。上記の明示的なローカルCodexコマンドだけがAIを起動する。model導入、課金、公開、契約、実機操作、実売買・送金は行わない。

Zemaの「計画保存」「記録更新」はAMC Tool操作の成功だけを表す。保存処理中をAI稼働中、記録成功をGoal完了と表示しない。Goalの全体受入は、各作業・親条件・全体条件を証拠付きで検収する別の操作である。

### 本人別保存・読込み・失敗時

`/api/amc`は本人認証・Origin検査を通し、既存`work_jobs.payload`へAMC Goalを保存する。Goal revisionと仕事レコードのrevisionを区別し、更新はcompare-and-swapで競合を拒否する。他の本人の記録は取得・更新できない。同じID・同じ内容の再送は重複更新せず、同じIDの異なる内容は拒否する。新規DBや有料外部実行は不要である。

履歴を含む仕事レコード全体は1.9 MBまで。上限超過は保存前に拒否し、Goal JSONを書き出して別記録へ引き継ぐ。汎用`/api/work-jobs`の作成・更新からAMCを操作できない。

保存途中の入力はまだ保存されていない。別画面との競合は「保存済み記録を再読込」で最新状態を確認する。通信断などで保存結果が不明な場合は、元のIDと内容を保持する「同じ記録を再試行」を使い、別操作を重ねない。再読込で保存済みeventを照合してから次へ進む。画面を閉じたことやGoalのpauseは、別のAI・PC processを停止した証明ではない。

「既存のAMC Goal JSONを読み込む」は、内容と自己申告の限界を確認して本人領域へ別記録として追加する。元のGoal ID・状態・証拠・検収を検査して保持し、未承認の`draft`を自動承認しない。このWeb画面のdraft読込みは閲覧・保存までで、承認操作は既存standaloneの詳細管理等で範囲と条件を確認した後、そのJSONを別記録として取り込む。読込みによって実作業の真正性が保証されるわけではない。

Goal JSONは1,500,000 byteまで、API書込みbody全体は2,000,000 byteまで。依頼・Goalは各8,000文字、意図は2,000文字まで。ブラウザだけのstandalone保存とは異なり、明示保存した本文と証拠参照は本人用サーバー領域に置く。秘密や不要な個人情報は入力しない。専用の自動削除期限・完全削除・バックアップ復元の運用受入は未確定で、停止を削除済みとは扱わない。JSONは本人管理の控えとして保存できる。

Web本人認証は保存ownerを守るためのもので、Goal内の担当名・reviewer名・role・証拠の自己申告を別担当本人の認証や署名へ昇格しない。旧standaloneのlocalStorage、WebのD1、AMC正本は別の保存先であり、自動同期・自動merge・正本更新はしない。Skyでのreadyは計画と手動台帳の機能範囲で、実ブラウザ受入や本番配備の合格は別に確認する。

今回の限定Web統合はSky→Zema→AMC→本人保存→再読込のローカル実ブラウザ確認済み。ローカルCodexの一件実行では成果物を作り`submitted`まで記録した。[試験記録](evidence/amc/codex-local-smoke.json)。全体検証`npm run verify`はNode 482件、追加Tool 19件、ローカルAPI 284項目を含めexit 0。本番配備readback、WebからのAI直接起動、本人のUX受入、独立reviewerの本人認証は未完了。詳細契約は[Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md)のAMC節を参照する。

## 既存standalone版：体験と責任

標準画面は「部隊・進捗」。統合司令部・RockstarOS・avocadoMini・avokadoPro・rocketstarの5師団32部隊を並べ、部隊を押すとGoal、もたらす結果、証拠のある段階、残課題、次タスクを表示する。担当タスクから子作業・前提・後続・他部隊へ移動でき、ルール・手順・成果物・合格条件・保留理由も確認できる。正本から埋め込んだ保存時点の記録であり、自動同期や現在のAI稼働状況ではない。親・旧版・公開説明を集計から区別し、製品完成率は算出しない。

「依頼・Goal」で従来の依頼入力と保存中のGoalを開き、「新しい依頼」で新規入力へ進む。ボードと依頼側を切り替えても入力中のGoal・意図を保持する。ボードの選択だけを`amc-mission-selection-v1`へ保存し、Goalや会話の記録は変更しない。壊れた選択状態や保存不可でも閲覧を継続する。初期選択はO2 / AI04。既存の会話内表示は従来の状態保存方式を維持する。

入力判定はbot/BOT・ボット・半角カナ・全角英数字、プログラム・スクリプト・自動化なども受け付ける。判定用だけNFKCで正規化し、原文をGoalへ保持する。「jevで仮想通貨のbot作成して」が誤って拒否される不具合を修正した。受付はProvider接続・実売買・送金の実行許可ではない。

標準の入口は「作りたいものを一つ入力→Goalと意図だけ確認」。Goalには元の依頼をそのまま入れ、意図は勝手に推測しない。Goalは自由に言い換えられる。部隊選択、範囲と合格条件の入力、詳細な設定質問は通常導線から外した。「このGoalと意図で準備する」で初めて計画を保存する。レビュー中は旧Goalを保持し、置換時は確認と同一rawの競合検査を行う。入力上限は依頼・Goal各8,000字、意図2,000字。確認前の入力はメモリ内だけなので再読込前に控える。

新しい入口はソフトウェアのローカル試作向け。固定の共通テンプレートで設計・実装・検証・統括の4役割と7工程（要件化、現状調査、作業設計、試作、試験、意図確認、引渡し）を準備する。AIによる意味分解ではなく、依頼の細部や具体的な編集pathは最初の3工程で確認する。重要な不明点・範囲追加・追加権限は本人判断へ戻す。元の依頼、Goal、意図は検証付きの`requestBrief`として従来のGoal JSON内へ保存する。H1/AMC01等の既存製品taskへ置換しない。提案4役割は正本32部隊への追加ではない。

承認後は部隊・作業の検収件数・参考工数・判断が必要な点を表示する。初期作業はすべて未着手で、状態は「AIへの引渡し待ち」。AI実行・進捗自動取得・通知の配送は未接続。「AIへ渡す指示をコピー」はコピーだけで、送信・起動ではない。公開・課金・実機などはこの計画承認に含めない。すべての作業が検収済みならGoal全体の検収待ちを示す。

工数は未校正の人時係数で、文書1–3、コード/試験2–6、既存証拠確認0.5–1.5、親検収0.5–1。新テンプレートは規模に関係なく9–27人時となるため、依頼に応じた実見積りではない。具体化後の再見積りが必要。未完了は100%残として集計し、未知・実機・外部・build等は未算定件数を別表示する。親は子の実装ではなく親条件の確認分だけ加算する。AI所要時間・PC並列能力・納期・料金への換算はしない。

## 詳細・手動管理（standaloneの既存機能）

「依頼・Goal」下部の折りたたみに、従来の32部隊選択・チャット・計画・進捗・検収・保存機能を維持する。既存OS・ハードウェアのGoalを準備するときはこちらから扱う。正本の閲覧は「部隊・進捗」から行う。チャットはローカルの固定案内で、範囲と完成条件を一つずつ入力する従来方式も使える。「うん」「開始して」「全部完了」などの発言を状態変更に使わない。日本語の変換中は送信せず、Enterは改行、送信はボタンまたはCtrl/Cmd+Enter。

会話は`amc-goal-chat-v1`へ、Goalは従来の`amc-goal-workbench-v1`へ分けて保存する。会話は直近100発言、入力1回8,000文字、読込み2,000,000文字まで。会話のGoal ID/revisionが現在のGoalと一致しなければ、最新のGoalから案内を再構成する。会話は実行記録の正本ではない。「会話を保存」は閲覧用の控えで、Goal JSONの復元には使わない。ブラウザ会話とGoal JSONの同時書込みはtransactionではなく、保存不可・別画面競合を明示する。

チャットと詳細画面を併用して条件を変更した場合は、チャット承認時に差分を検出して新しいまとめを示し、改めて承認を求める。詳細画面から承認した場合も、実際に承認した範囲と完成条件を会話へ表示する。

詳細のチャット横（狭い画面では下）の「計画・進捗の詳細」に、以下の操作を残す：

指示 → 候補部隊 → 親子の計画案 → 範囲と合格条件の承認 → AIへの引渡し → 作業結果 → 別担当による検収 → 保存・次の作業。

1. 「やりたいこと」に指示を入力し、「担当部隊を確認する」を押す。次に部隊候補と、それぞれの既存の次作業を表示する。対象部隊は調整できる。候補選択はキーワード補助であり、AIが任意の要求を理解・細分化した結果ではない。H1は製品責任の整理であり、AMCの自律化開発とは読み替えない。
2. 選択部隊の次task、登録済みの子作業、必要な前提を再帰的に取り込む。前提の担当が他部隊ならその担当も表示する。
3. 利用者の指示に対して足りない要求を確認し、対象・対象外、全体の合格条件を記す。詳細計画のない前提は、成果物と合格条件を補完しないと承認できない。
4. Goalの指示文とJSONを保存して、利用するAIへ渡す。部隊Goal、担当、手順、依存、成果物、証拠、保留、再開方法を一括で含める。
5. 実際に別の環境で行った作業について、開始・成果提出・検収をこの台帳へ記録する。画面の開始操作そのものはAIや作業processを起動しない。
6. 全子作業、親の元の合格条件、全体指示の合格条件を別々に検収する。子の完了だけで親や製品を完了させない。

「詳細・手動管理」の中には「チャット」「計画」「進捗」の切替がある。会話と詳細パネルを併用できる。詳細の計画承認欄は案の段階で開き、承認後の進捗詳細は状態別の「次にすること」を先頭に出す。作業一覧は着手候補・作業中・確認待ち・要確認・検収済みで絞り込める。作業選択時は成果物と合格条件を先に表示し、手順・依存・出典ファイルは詳細にまとめる。記録操作と入力欄も状態に合わせて限定する。

`active`は「計画承認済み」と表示し、AI稼働中とは呼ばない。AI未接続を常時表示し、コピー成功も未送信と明示する。未整備の計画は不足内容と「補完を依頼する」を提示し、承認せず相談できる。並列数、全選択、JSON形式、履歴は詳細操作へ分ける。既存の保存キーとJSON形式は維持し、保存から復元した際は該当段階と同時作業上限を戻す。

AMC正本は[data/mission-control.json](../data/mission-control.json)と[data/project-status.json](../data/project-status.json)。Goal JSONは別の作業sessionであり、正本を自動更新しない。正本のdoneも今回のGoalでは既存証拠の再確認対象で、無条件に再実装も合格移管もしない。

## できること／まだできないこと

- 実装済み：依頼→Goalと意図→準備計画、4役割7工程のソフトウェア試作テンプレート、仮の人時係数と未算定の区別。新旧Goal JSONの保存・復元。テンプレートで最終仕様・具体path・工数を確定したとは扱わない。
- 実装済み：32部隊からの選択、登録済み192子作業の展開、前提の取込み、入力・成果物・合格条件の引継ぎ、部隊別の進捗、指示文出力、JSON保存・読込み、別担当の検収、revision競合とイベント再送の検査。
- 実装済み：同じ成果物pathへの並列着手防止。検収待ちもlockを保持。親子を実行件数へ二重加算しない。
- 今回追加：Sky Tool `rockstar-amc`、`/amc`とZemaの専用カード、認証済み本人別のD1保存・再開、手動記録、競合拒否、Goal JSON import/export。全体回帰・実ブラウザ受入の結果は上記の今回状態と区別する。
- 今回追加：ローカルCodex CLIでAMCの着手可能task一件を実行し、報告をAMCの`submitted`または停止・失敗のGoal JSONへ保存する入口。mockで正常・不確実結果を検査する。Webの元記録への自動同期や独立検収は含めない。
- 未実装：任意の新規指示をLLMで意味分解するplanner、WebからのCodex直接起動・同一記録同期、executorのサーバー常駐、再起動時の実process復旧、独立reviewerの本人認証・署名・監査ログの耐改ざん保護。
- Goal内の担当名・role・証拠参照は自己申告であり、別担当本人の認証や証拠内容の真正性を保証しない。Web保存ownerの本人認証とは別の問題である。JSONの検査は構造・遷移・参照整合の検査で、実物の成果を検収した代わりにはならない。
- 料金・公開・契約・実機・飛行・資産移動は別承認。計画承認から権限を増やさない。物理・外部・build・未分類の新規leaf作業はこの第一版では着手不可とし、実行先・権限・資源の接続を待つ。
- `executionHolds`は子へ継承して安全側に全停止する。現行SKY19の保留では設計整理が許されるが、この第一版では設計子作業も停止する。許可された準備作業と実行禁止範囲を分けるadapterは未実装。
- 親の前提を子にも継承するため、実機gate前にできる準備まで待機する場合がある。前提を自動解除せず、着手前提と親受入gateの分離を正本レビューで決める。

## standalone HTML・CLIの使い方

ブラウザ用の自己完結した画面を生成する。親ディレクトリは事前に用意する。出力先は既存ファイルを上書きしない。

```sh
npm run mission:goal -- build --out /absolute/path/amc-goal-workbench.html
```

生成したHTMLをブラウザで開く。外部通信なし。ブラウザ保存が使えない場合は明示し、JSON保存を案内する。別タブによる保存内容の変更を検出した場合は上書きを拒否するが、完全な同時書込みtransactionではないため一つの画面で編集する。importは16MBまで、現在の表示を置き換えるため確認が必要。秘密・鍵・個人データを指示や証拠へ記録しない。

CLIで計画と指示文を作る場合：

```sh
npm run mission:goal -- compile --instruction-file /absolute/path/request.txt --squads H1,P4 --out /absolute/path/goal-r0.json --max-parallel 1
npm run mission:goal -- prompt --goal /absolute/path/goal-r0.json --out /absolute/path/goal-prompt.md
npm run mission:goal -- status --goal /absolute/path/goal-r0.json
```

`maxParallel`はこのGoal内の設定上限で、サーバー実測、Provider利用枠、現在のCodexの利用可能人数ではない。初期値1。資源が不明なら増やさない。

進捗更新はイベントJSONを用いて新しいrevisionへ保存する：

```sh
npm run mission:goal -- event --goal /absolute/path/goal-r0.json --event /absolute/path/event.json --out /absolute/path/goal-r1.json
```

全イベントに`id`、`type`、`expectedRevision`、`actor`を指定する。再送は同じID・同じpayload。同じIDの違う内容、古いrevision、証拠なしの検収を拒否する。時刻は任意の`at`。前のJSONを残して復旧点にする。

- `approve_plan`：`role: owner`、`scopeConfirmed: true`、`coverageStatement`、全体の`acceptanceCriteria`。計画未整備の前提があれば`taskPlanReviews`で`taskId`・`acceptanceCriteria`・`deliverables`を補う。既存の合格条件は縮めない。
- `start_task`：`taskId`。検収済み前提、実行可能区分、保留、同時作業上限、成果物lockを満たす場合だけ開始の記録を許す。
- `submit_result`：`taskId`、`outcome: succeeded | failed`、`summary`、`deliverables`、`evidence`。実行担当だけが提出し、成功時はすべての予定成果物を必要とする。
- `verify_task`：別担当の`role: reviewer`、`accepted`、各条件の`criterionResults: [{criterionId, passed, evidence}]`、総括`evidence`。
- `block_task`：未着手・失敗作業と`reason`。進行中・検収待ちは結果不明のままlockを解放せず、Goalを`pause`する。
- `resume_task`：`role: owner | reviewer`、解除の`reason`と`evidence`。前試行を保存して未着手へ戻す。料金等の保留はこの操作では解除できない。
- `pause`／`resume`：台帳上のGoal停止・再開。`pause`に`reason`が必要。実processの停止を保証しない。
- `accept_goal`：`role: owner`、`accepted: true`、全体条件の`criterionResults`と`evidence`。親を含む全作業が検収済みの場合のみ全体受入。受入済みGoalの追記は新Goalへ分ける。

## 次段階：実行基盤との接続

計画と実行を分離する。将来のadapterは承認されたtaskだけを実行先へ渡し、operation ID、予算、上限時間、利用量、結果不明の照合を保存する。LLMの文章を任意shellとして実行しない。契約・公開・物理作用は独立した承認gateを通す。再起動後は保存済みsessionと実行先を照合してから再開し、完了確認後に終了する。

OpenAI側のagent制御と、ファイル・コマンドを扱う実行環境を分ける考え方は[公式Architecture](https://developers.openai.com/api/docs/guides/agents-api/architecture)を参照した。この第一版はそのAPIを呼んでおらず、アカウントの利用可否やScalewayへの接続を検証していない。

## SPIDER: 観測元ファイルの安全な読取り

H1 / AMC02、ROCK、主stream Git / CI / Operations。観測元はcanonical repository内に解決した通常ファイルだけとし、内部symlinkは維持する。対象をNOFOLLOW・NONBLOCKで一度開き、FDのfile種別と現在のpathのcanonical位置・BigInt dev/inoを照合してから同じFDを読む。検証後のpath差替えで別のファイルを再openしない。終了・失敗時にFDを閉じ、最初から無い入力だけをabsentとする。途中消失や照合失敗は観測失敗として再取得・レビューへ戻し、実行許可へ昇格させない。

sourceInputsとsourceSnapshotの存在判定・hashは同じ一回の取得Bufferを使用する。同じinodeの同時書換、複数ファイル全体のatomic snapshot、あらゆる祖先差替えの排除は保証しない。入力名の既存.env拒否は保持するが、秘密情報全般の検出器ではない。

検証: `node --test tests/amc-sky-observe.test.mjs`。実temporary filesystemに同期raceを差し込む単体試験で、directives/Git境界は明示したadapterを用いる。現mainのrevalidationImpact export欠落で通常module importは失敗するため、AMC全体の統合受入と区別する。要約証拠は[spider-observation-source-read.json](evidence/spider-observation-source-read.json)。同じbranchの修正前CodeQL #56と修正後をID・rule・path・stateで比較し、未取得を修正完了にしない。

## 検証

```sh
node --test tests/amc-goal-engine.test.mjs tests/amc-goal-cli.test.mjs tests/amc-request-plan.test.mjs tests/amc-effort.test.mjs tests/mission-control.test.mjs tests/amc-capacity.test.mjs
node --experimental-strip-types --test tests/amc-sky-integration.test.mjs
npm run mission:check
npm run design:check
npm run verify
```

standalone画面の操作契約はmock DOMで確認する。Web統合では本人分離、認証・Origin、size、CAS、再送、draft保持、Sky/Zemaと保存結果の分離も確認する。実ブラウザの描画・操作、AI送信、executor常駐、実機受入とは区別する。過去の検証結果は[AMC検証記録](evidence/amc/goal-orchestrator-audit.json)にあり、今回の未完了検証の合格証拠へ転用しない。
