# Noah の Agent 収集

- 本人が言う一言: 「agentを集めるシステムを作成して」
- Goal（Eveが作る）: 公開Agentの継続収集 / 公式MCP台帳・GitHub・Hugging Face・X / 再開できる台帳と掲載用ファイル / 新規契約・モデル費用なし / 公開情報の取得・接続確認・Noahの紹介欄への掲載。
- Noaがつなぐもの: 既存 `noah-intake-store` と `noah-discovery-store`。公式MCP台帳は全件と差分、GitHub・Hugging Faceは既存の最新検索窓を使う（全件収集とは呼ばない）。
- AMCの工程: 1. 出所ごとの期限を確認 2. 上限内で取得 3. 既存の名寄せ 4. MCPの握手 5. 状態と掲載用ファイルを保存 6. 設定済みのNoahへ署名付きで掲載。各段の結果を数で記録する。
- Jevの合格条件: 再起動後の頁位置保持、同じDBの多重起動拒否、429の待機、接続先の内部IP拒否、道具呼出0回、候補と接続確認済みの別集計、既存取込APIで読める出力を自動試験する。
- 出力先: 収集機のSQLiteとJSON、Noahの `/noah/agents` にある「新しく見つかったAgent」。接続確認済みの取込ファイルは既存 `/noah/review/intake` でも使える。
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
- チェックポイント: `POST /api/noah/collection/checkpoint`。認証付きread/write、R2キー固定、16MiBの要求上限、256MiBの復元上限。ETagが変わっていたら保存も掲載も拒否。停止したSQLiteだけを保存し、署名付き非公開状態の復元が失敗したら収集を開始しない。新規導入はMac常駐停止後に `scripts/noah-cloud-collector.mjs --dir <空の作業先> --origin https://avoado.si --bootstrap <停止した台帳の保存先>` で1回だけ行う。既存checkpointは上書きしない。
- 診断/停止: GitHub Actionsの「Noah cloud Agent collection」で結果を読む。公開するログは件数・出所の状態・実行IDのみ。workflowをDisableすると定期収集が止まり、R2の台帳と掲載は残る。復旧はEnable後にRun workflow。
- GitHubの[定期実行](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)は混雑時に遅延する。公開repoで60日活動がないと自動無効化されるため、[状態確認と再有効化](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)を運用に含める。Macを起動して再開する設計には戻さない。

公開トップ `/noah` に出所を偏らせない収集カードを直接表示する。詳細な検索と一覧は `/noah/agents`。画面が表示中は60秒ごととフォーカス復帰時に再取得し、外部評価も更新する。
