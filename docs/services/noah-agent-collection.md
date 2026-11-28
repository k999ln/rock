# Noah の Agent 収集

- 本人が言う一言: 「agentを集めるシステムを作成して」
- Goal（Eveが作る）: 公開Agentの継続収集 / 公式MCP台帳・GitHub・Hugging Face・X / 再開できる台帳と掲載用ファイル / 新規契約・モデル費用なし / 公開情報の取得・接続確認・Noahの紹介欄への掲載。
- Noaがつなぐもの: 既存 `noah-intake-store` と `noah-discovery-store`。公式MCP台帳は全件と差分、GitHub・Hugging Faceは既存の最新検索窓を使う（全件収集とは呼ばない）。
- AMCの工程: 1. 出所ごとの期限を確認 2. 上限内で取得 3. 既存の名寄せ 4. MCPの握手 5. 状態と掲載用ファイルを保存 6. 設定済みのNoahへ署名付きで掲載。各段の結果を数で記録する。
- Jevの合格条件: 再起動後の頁位置保持、同じDBの多重起動拒否、429の待機、接続先の内部IP拒否、道具呼出0回、候補と接続確認済みの別集計、既存取込APIで読める出力を自動試験する。
- 出力先: 収集機のSQLiteとJSON、Noahトップ `/noah` と `/noah/agents` にある「新しく見つかったAgent」。接続確認済みの取込ファイルは既存 `/noah/review/intake` でも使える。
- Wallet: 新しい課金型なし。MCP・GitHub・Hugging Faceは公開APIを読む。Xは運営が用意したAPIキーと利用枠で読む（新規契約・購入は行わない）。提供者の道具・登録・課金は実行しない。
- hardware profile 依存: 運営のNode実行環境。利用者のスマホ・画面は操作しない。
- 失敗時: 出所ごとの待ち時間と頁位置を保存し、次の巡回で再開。停止時は現在の保存を終えて終了。ファイルは一時ファイルから置換し、途中のJSONを見せない。
- 記録: `status.json` に時刻・収集数・接続確認数・出所の状態・エラー符号。人の仕事を実行しないのでWorkの成功Receiptは作らない。

## 運用

`npm run noah:collect -- --once` で1巡、`npm run noah:collect -- --watch` で継続。`npm run noah:collect -- --status` で保存済みの状態と稼働/停止を読む。継続の停止はCtrl-C。再開は同じコマンド。

既定の保存先は `work/noah-collector/`。`--dir /absolute/path` で継続して使う専用ディレクトリを指定できる。出所の取得間隔、接続先の間隔、1巡の上限は既存実装を使う。これは手元での検証方法。通常運用は後述のクラウド定期実行を使い、Mac停止中も進む。

公式台帳の候補は接続を確認してから `import.json` に入る。GitHub・Hugging Faceの検索結果は `discovery.json` に残す。Xは公式Recent Searchで紹介中のGitHub/Hugging Faceの配布リンクを抽出し、投稿本文は転載しない。`collection.json` の紹介用スナップショットを `--publish https://avoado.si` で自動掲載する。同じ配布URLは出典をまとめる。検索・出所フィルタ・頁送りを備える。接続の権利や実行許可は作らない。紹介は元の確認から7日、Xのリンクは1日で表示期限を迎える。置換・期限切れは紹介欄だけに効き、既存の接続一覧を削除しない。

公式台帳の差分・頁位置・待機は [MCP Registryの取得契約](https://modelcontextprotocol.io/registry/registry-aggregators) に従う。Node側は [Undiciの接続時lookup](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md) で検査済みIPだけへ接続する。

## 掲載と認証

- `NOAH_COLLECTION_KEY`: 32文字以上。NoahのSites secretと収集機で同じ値。本文hash・時刻・固定pathのHMACを `/api/noah/collection` が検証する。R2の専用prefixに出所ごと最大500件のJSONを保存し、古い版の上書きと競合を拒否。DB migrationなし。
- `NOAH_X_BEARER_TOKEN`: 収集機だけ。Xの公式検索へだけ送り、掲載データ・ログへ出さない。未設定は `needs_credentials`、他の収集は継続。
- `npm run noah:collect -- --watch --publish https://avoado.si` で定期収集から掲載まで。取得側・掲載側の失敗は `status.json` に分けて残す。
- Xは [公式Recent Search](https://docs.x.com/x-api/posts/search/quickstart/recent-search) の認証・頁送りを使う。最新7日間の検索であり全履歴取得ではない。1回1頁、続きは次の巡回。完了後は2時間待機し、429では指定された時刻まで待つ。

## 随時更新と外部の評価（2026-11-22 本人指示）

- 収集器は60秒ごとに期限を確認する。MCPは初回全件→毎時差分、GitHub/Hugging Faceは2時間ごとの検索と既知候補の再確認、Xは頁送り中60秒・完了後2時間。API制限の待ち時間を優先する。
- GitHubの `stargazers_count`、Hugging Face Spaceの `likes`、X投稿の `public_metrics` を出所付きで保存・表示する。値の減少も反映し、値が無い場合は0と補わない。Noahの王冠・利用人数・コメントへ加算しない。外部の反応は動作・品質の保証ではない。
- macOSでは `scripts/noah-collector-service.mjs --install --dir <保存先> --env-file <権限600の設定ファイル> --origin https://avoado.si` でログイン時起動・異常終了時再開を設定できる。`--status`で稼働を確認、`--stop`で停止。設定ファイルと保存先はGit外。Macが停止中は更新しない。

## クラウド常時運用（2026-11-22 本人追加指示）

GitHub ActionsのLinux runnerで5分ごとに期限を確認し、同じ収集・握手・外部評価同期・署名付き掲載を行う。GitHub側の混雑による遅延はあり、秒単位のリアルタイム保証はしない。収集途中のSQLiteは停止後に圧縮し、Noah R2の非公開checkpointへ保存する。GitHub artifact/cacheやGitには未検証の生データを保存しない。状態の取得・置換は時刻/本文/path付きHMACとETagによる競合拒否を使う。復旧できない場合は空の台帳で掲載を置き換えず失敗する。

合格条件: Mac常駐停止後にクラウド実行が2回成功し、同じcheckpointの続きから収集して公開APIの確認日時が進むこと。失敗した出所の再試行時刻と候補を維持すること。クラウドの同時実行を1つに制限すること。XのAPIキー未設定は引き続き未稼働として表示する。新しい本番D1 migrationは行わない。

- Workflow: `.github/workflows/noah-agent-collection.yml`。既定branch mainだけ、`ubuntu-latest`、実行上限8分、同時実行1つ。Gitの権限はread-only。Actions secretに `NOAH_COLLECTION_KEY`（Sitesと同じ値）と任意の `NOAH_X_BEARER_TOKEN` を設定する。secretは収集stepだけに渡す。
- チェックポイント: `POST /api/noah/collection/checkpoint`。認証付きread/write、R2キー固定、1要求16MiB以下、256MiBの復元上限。大きな台帳は3MiBのbase64断片をhash付きで送り、全断片を保存してからETag付きmanifestを置換する。復元時にもhashを照合し、途中失敗で前回の台帳を失わない。現行manifestが参照していない2時間以上前の断片は、保存成功後に最大1,000件ずつ回収する。ETagが変わっていたら保存も掲載も拒否。停止したSQLiteだけを保存し、署名付き非公開状態の復元が失敗したら収集を開始しない。新規導入はMac常駐停止後に `scripts/noah-cloud-collector.mjs --dir <空の作業先> --origin https://avoado.si --bootstrap <停止した台帳の保存先>` で1回だけ行う。既存checkpointは上書きしない。
- 診断/停止: GitHub Actionsの「Noah cloud Agent collection」で結果を読む。公開するログは件数・出所の状態・実行IDのみ。workflowをDisableすると定期収集が止まり、R2の台帳と掲載は残る。復旧はEnable後にRun workflow。
- 実行全体の結論と、出所ごとの実掲載は分けて読む。`outcomes.execution` は取り込み・他出所の異常も含むが、`outcomes.publication` と `published[]` は実際に公開受け口が受けた数。掲載後は公開 Hacker News API の最新 `observedAt` を再読し、`freshness` に記録する。2時間以上なら鮮度の異常として扱う。手動の計測は `node --experimental-strip-types scripts/noah-collection-freshness.mjs --origin https://avoado.si --source hackernews`。
- GitHubの[定期実行](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)は混雑時に遅延する。公開repoで60日活動がないと自動無効化されるため、[状態確認と再有効化](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)を運用に含める。Macを起動して再開する設計には戻さない。
- 正本切り替えまで、本番へ掲載するのは `k999ln/rock` の `main`。Codexの毎時の予備実行も同じ `main` を起動し、実行中の収集があれば完了を待つ。`iceiceice999/rock` には既存の掲載キーを安全な場所から設定し、移行先の `main` に `data/noah-scout/leads.json` と、それを sparse-checkout して掲載する収集機が入っていることを確認する。旧workflowを無効にして実行が残っていないことを確認した後で、repository variable `NOAH_COLLECTION_ACTIVE=true` を設定する。新しい正本の `main` から手動実行し、公開APIが更新されたら予備実行の参照先も切り替える。復旧時は新側の変数を無効にし、詳細を確認してから旧側を有効に戻す。

公開トップ `/noah` に出所を偏らせない収集カードを直接表示する。詳細な検索と一覧は `/noah/agents`。画面が表示中は60秒ごととフォーカス復帰時に再取得し、外部評価も更新する。

## 出所を増やす・新しく使いやすい順・一覧へ自動で入れる（2026-11-22 task 121）

本人指示「twitterとかredditとか、github repoとか他に考えられる場所探して、常に新しく使いやすいものが上に」。task 121。

- 足した出所（`scripts/noah-collector-feeds.mjs`。どれも鍵なしの公開 API か、許諾（MIT）を確かめた一覧）:

  | 出所 | 読む物 | 間隔 | 出た時 | 動かし方 |
  | --- | --- | --- | --- | --- |
  | Hacker News | Algolia の検索（直近 7 日、MCP・AI agent など 4 語）。配布元（GitHub・HF・npm）へのリンクか Show HN で、題名に MCP・agent などがある物だけ | 30 分 | 投稿の時刻 | — |
  | GitHub（MCP） | 検索 `topic:mcp-server` など 4 つ、直近 14 日に作られた物をスターの多い順 | 2 時間 | 作られた日 | — |
  | Hugging Face（MCP） | Space のタグ `mcp-server` を新しい順・いいね順。`not-for-all-audiences` は読まない | 2 時間 | 作られた日 | ブラウザで試せる |
  | npm | 鍵語 `mcp-server`・`modelcontextprotocol`・`mcp` | 6 時間 | 最後の公開日（初回に読んだ物は 30 日前） | Macで動く |
  | Docker | `hub.docker.com` の mcp 名前空間（未認証で読める 1 頁目を、更新順と取得数順で） | 6 時間 | 登録日 | Macで動く |
  | awesome 一覧 | punkpeye・wong2・jaw9c の README（ETag で変わった時だけ） | 6 時間 | 初めて見た時（初回に読んだ行は 30 日前） | 鍵が要る（一覧が OAuth 等と書く物） |
  | Smithery | `api.smithery.ai/servers` を 1 回 20 頁ずつ回る。無料の鍵 `SMITHERY_API_KEY` が有る時だけ | 6 時間 | 作られた日 | 鍵が要る／Macで動く |

- 読まない所: Glama（鍵と、表示する全画面への Glama の表示とリンクの義務）、PulseMCP（新 API は申請制）、Bluesky の未認証の検索（403）。X の公式 API は従量課金なので、運営の鍵が無い間は読まない。
- X・Reddit・Bluesky（本人「Codexにやらせて」）: 運営の Codex が、検索で見つかる公開ページを人の速さで読み、リンクと数だけを `leads.json` に書く。`NOAH_COLLECTION_KEY=… node --experimental-strip-types scripts/noah-collector-social.mjs --file leads.json --dir work/noah-social --publish https://avoado.si`（`--dry-run` で形だけ確かめる）。投稿の本文・利用者名は受け取らない（X・Bluesky は @handle、Reddit は板 r/… だけ）。期限は X 1 日・Reddit と Bluesky 3 日。ログインしたままの自動読み取りは X・Reddit の規約で禁止されているので、しない。鍵の無いクラウドの収集機は X の紹介を出さない（Codex の掲載を空で上書きしない）。
- 並び（`lib/noah-collection.ts`）: 1 枚の点 = log10(票) + 出た時 / 12.5 時間。票 = 話題（スター 1・いいね 1（HF は 5）・リポスト 3・点 1・コメント 0.5・賛成 1・週の取得 0.01・取得 0.001・接続 0.1。1 つの数は 1,000 票まで）＋ 動かし方（スマホで今すぐ 40・ブラウザ 15・Mac 5・鍵 0）＋ 日本語の説明 10 ＋ 別の出所での話題 10 ×（出所の数 − 1）。出た時は、出所のうち新しい方（古い repo でも、今日の投稿で話題になれば今日）。学習・乱数なし。`GET /api/noah/collection?order=hot|new`。トップの欄は、出所ごとに 1 枚ずつ、点の高い出所から。
- 1 つの出所の中では、同じ配布元・同じ名前の写しは上の 1 件だけ。成人向けの語（`NOAH_COLLECTION_BLOCKED`）に当たる紹介は、収集機でも公開の API でも出さない。利用規約やライセンスをすり抜ける道具（試用のリセット・機械 ID の書き換え・クラック・キー生成・ゲームの不正の実行器・個人向けの定額の契約を API に変える中継。`NOAH_COLLECTION_CIRCUMVENTION`）も同じく出さない（2026-11-28 に本番のホームの 59 枚目に「Claude Code Pro Trial Reset & Machine ID」、74 枚目に「Codex Roblox Script Executor」が出ていた。試験は `tests/noah-collection-circumvention.test.mjs`）。公式の製品を名乗る、作者の違うインストーラー（`NOAH_COLLECTION_IMPERSONATION`。偽物を配ってマルウェアを入れさせる型）も出さない（2026-11-28 に本番のホームの 145 枚目に「claude-code-cli-windows-native-installer」が出ていた。その日のうちに GitHub から読めなくなった。自分の物を入れる道具や、道具の追加の手伝いは外さない。試験は `tests/noah-collection-impersonation.test.mjs`）。
- 一覧（グリッド）へ自動で入れる: クラウドの収集機は `--import` で、握手の済んだ系列を `POST /api/noah/intake/import` へ送る。認証は `NOAH_COLLECTION_KEY` の HMAC（時刻・POST・この path・本文 hash。掲載の署名は path が違うので使えない）。Origin の付いた要求は審査者の扱いのまま。送るのは前回から変わった系列だけ（握手の時刻・速さだけの変化では送らない）。押すだけで試せる物・新しく握手が通った物から、1 日（UTC）400 系列・1 回 120 系列まで。手元で載らなくなった系列は今の行を送り、本番でも外す。成人向けの語に当たる系列は入れない。本番がまだ受け付けない版の間は `not_ready`（失敗にしない）。止める時は workflow の `--import` を外す。
- 紹介のカードの「スマホで今すぐ」と「Noahで開く」は、一覧へ入れ終えて載っている系列だけ。
- グリッドのお試し（まだ実績の無い物）は、新しく握手が通った順。押すだけで試せる物は 3 日分新しく扱う（`NOAH_PIN_RANK.freshOneTapMs`）。
- 合格条件: 出所ごとの期限・失敗の待ち（Retry-After）・ETag の保持、1 つの出所の失敗で他が止まらない、初回の一覧が新着にならない、投稿本文・利用者名・追跡の引数の不保存、署名の別 path・偽造・Origin 付きの拒否、変わった物だけ・日の上限、鍵の無い収集機が X を上書きしない。`tests/noah-collection-sources.test.mjs`。

## Noah が自分で探す（2026-11-22 task 125）

本人指示「こういう便利機能を私がツイッターで検索するんじゃなくて Noah にやらせたい」。Switch（sandbox-quantum/switch）を拾えなかった原因は 3 つだった。X は誰も読んでいなかった。GitHub は作られて 14 日以内の MCP の repo だけを読んでいた。Product Hunt は読んでいなかった。

| 出所 | 読み方 | 間隔 |
| --- | --- | --- |
| GitHub の急な伸び（`github-rising`） | Agent の道具の話題ごとに、直近 7 日に更新があるスター 300 以上の repo を 100 件。スターの数を残し、1 日に 50 以上かつ全体の 2% 以上伸びた物を拾う。出た時は、Noah が初めて伸びを確かめた時 | 6 時間 |
| GitHub の新着（`github-mcp`） | MCP に加えて ai-agents・multi-agent・agent-orchestration・claude-code・codex の話題 | 2 時間 |
| GitHub の公式版（`github-releases`） | 運営が登録した公開リポジトリの公式リリースを確認。最初は [Switch Console](https://github.com/sandbox-quantum/switch/releases/latest) と [Switch Buddyの公式発表](https://www.switchagents.ai/blog-posts/whats-new-in-switch-rooms-november-2026)。公開後7日間、同じリポジトリの紹介を公式版の出典と一枚にまとめる | 2 時間 |
| Product Hunt（`producthunt`） | 公開の Atom フィード。Agent・AI の道具の語がある物だけ。作った人の名前は載せない | 6 時間 |
| Noahが読んだ（`noah-read`） | Codex の Luna Max が、Noah 用の X アカウントのリスト「Noah scouts」（`data/noah-scout-curators.json`）を 1 日 1 回読み、投稿・引用元・配布元まで読んで日本語で書いた理解。`data/noah-scout/leads.json` に書き、クラウドの収集機が毎回まとめて載せる（2026-11-23 から。運営の Mac に鍵を置かない）。1 枚のカードの説明の先頭に出る | 1 日 |

本番の受け口が新しい出所をまだ知らない間（Sites の配備の前）は、収集機はその出所を `not_ready` として飛ばし、失敗にしない。

## 図解ピンの生成（task 131）

Noah の収集機は、掲載中の系列と新しい紹介に図解ピンを作ります。モデルには、名前、提供元の説明、日本語要約、握手で取得した先頭 20 個までの道具名と説明を送ります。元の文と道具の定義が同じ候補は再生成しません。道具の定義が記録されていない系列は、次の握手を待ちます。

生成には GPT-5.4 mini の固定版を使います。1 巡で最大 20 件を処理します。月の API 費用の見積もりは最大 50 米ドルです。再試行も見積もりに含めます。料金と見積もりには差が出る場合があります。収集機の状態に、上限で止まった数を出します。

Actions secret に `NOAH_PIN_OPENAI_API_KEY` を設定します。収集機で生成するときはリポジトリ変数 `NOAH_PINS_GENERATE` を有効にします。本番 D1 の個別適用 SQL 0061 は、本人の承認を得て適用します。適用と保存先の確認が済んでから、`NOAH_PINS_IMPORT` を有効にします。

候補詳細の「Eveで使い方を組み立てる」は、公開候補の識別子をEveに渡す。EveはNoahから出典を取得し、本人が選び、接続・試用・成果受取をまとめた依頼文を入力できる。パッケージの工程の組立と公開条件は [task 126](../../codex/tasks/126-noah-packages-first.md) に従う。
