# Noahの端末内Agent・LLMストア

2026-11-15: 本書は端末内文章Agentの既存実装契約。現在のWeb版の市場・管理・外部Agent接続は[統合仕様](../service-design/noah-agent-platform.md)を優先する。Eveは外部Agentの知性を置換しない。端末内stateとaccountライブラリの統合は未実装。

2026-11-02本人指示「NoahでAgentやLLMを探して自分の端末に追加し、Eveで実行」を実装する最初の縦断。既存Noahストアv0.4の全機能の完成とはしない。

- 本人が言う一言: 「要約するAgentをこの端末に入れて、Eveから使いたい」。
- Goal: Agent/LLMを検索→対象Linuxへ追加・検証→Eveで依頼→既存Jobの成果を保存。初回は文章生成、本人用loopback runtimeのみ。
- Noahがつなぐもの: 既存モデル定義、data-only Agent recipe、既存Linux manager。外部のLLM取得先・ライセンス・容量・役割を追加前に表示。独立Sky製品は作らず、`sky-*` API/保存形式を互換利用する。
- AMCの工程: このsliceは既存`createPrivateLinuxWorkJob`の文章生成工程を再利用する。複雑な工程分解や任意Tool実行は追加しない。
- Jevの合格条件: 追加後に同じモデルSHAで1 Jobを実行、再送/再起動で重複実行0、端末/版不一致でdispatch 0、取得失敗/停止時ready 0。合成試験と実機実推論を別に判定する。
- 出力先: Eve画面、既存の文章/Job export。成果は確認待ちを経て本人が完了とする。
- Wallet: 既存owner-local契約。cloud使用額0、CPU/電力/機器実費は未計測。月額契約や課金を新規開始しない。
- hardware profile依存: Pixel内Linuxの既存text GGUF adapterを使用。PCの既存Lima adapterは元のcacheモデルのみ。対応外のモデルをPC catalogへ載せない。browser-only・任意端末の遠隔導入は未対応。
- 失敗時: 追加番号で照合。登録済みと実行可能を分け、再送でdownloadを自動再開しない。失敗/停止/再起動後は本人が「準備を再開」を押す。同じAgentを残す。
- 記録: 既存owner-local `state.json`に追加先IDと有限の追加記録。model/Agent/Jobを別DBへ複製しない。

## 責任と範囲

主担当Noah/MCP（ROCK、既存SKY21・AI02・WEB04）。EXTERNALはmodel weights/runtime/license。OWNERは端末・利用条件・取得・実行・保存を確認。JOINTは機種適合・実機受入。署名/hashは安全性保証ではなく、Agentは文章指示だけでshell/Tool/送信権限を持たない。

既存role境界はEve＝対話・Agent共通の知性、Noah＝Agentの構成・検索・導入、AMC＝仕事管理、Broker＝実行許可、Work＝Job/成果、Jev＝独立評価。local resultを本人承認へ昇格しない。cloud fallbackは行わない。

## 画面・入出力

Pixel packageは`/noah`（旧`/sky`も互換入口）と`/eve`。開発用Webはlocalhost限定`/os/noah`と`/os/noah/eve`。追加先は接続している本人用Linuxを明示し、任意の別端末を選べる表示はしない。

検索は既存固定model catalogと3種類のrecipe（段取り・要約・下書き）。LLM単体の追加でもEve用の文章Agentを同時に登録する。リンク/設定ファイルからの既存importとAgent自作は詳細入口に残す。

## API・保存

transportは既存同一origin・loopback限定`POST /__sky/linux`（32KBまで、JSON、no-store）。remote/account APIと混ぜない。

| action | 入力 | 結果 |
| --- | --- | --- |
| `status` | actionのみ | 既存snapshot＋`noah.device{id,name}`、catalog、installs |
| `noah-add` | `deviceId,catalogId,catalogDigest,requestId(UUIDv4),accepted:true`を正確に送る | modelとAgentを原子的に登録・永続化し、未準備なら既存prepareを開始。snapshotで進捗を読む |
| `prepare` | modelId、accepted、NoahからはdeviceId/modelSha256も固定 | 既存modelの準備を明示再開 |
| `run` | agentId,input,requestId,accepted、`surface:eve`、agentSha256/modelSha256/deviceId | 既存Work Job、同じrequestIdは同じ仕事。未知の成功として再実行しない |
| `stop-environment`, `stop`, `confirm`, `export` | 既存契約 | 準備/仕事の停止、本人検収、成果持出し |

`state.json`（schema 1互換）に`noahDeviceId:UUIDv4`、`noahInstalls: [{requestId,catalogId,catalogDigest,agentId,agentSha256,modelId,modelSha256}]`を追加。端末IDはこのruntime保存領域の識別子で、本人認証の代用にしない。OS accountと既存loopback/lease guardを維持する。端末移行時のID/所有権復元は別受入。

カタログdigestはmodelとrecipeの内容全体のSHA256。登録済みmodelの同一ID異内容は拒否。モデル最大8件・計6GiB、Agent32件、追加記録256件。記録の自動追出しは行わず、超過は拒否する。

## 状態・復旧・承認

検索→確認→登録→準備中→実行可能。readyは既存adapterのplatform/architecture/model SHA検証後だけ。新規追加と同じモデルを使うAgent追加は既存bytesを再利用。保存の失敗は登録をrollbackし、取得を始めない。

追加番号はbrowser sessionStorageにも保持。同じ番号の再送は保存済みrecordを返し、別内容は拒否。取得失敗/停止後もrecordを保持し、再送では取得し直さない。Eveリンクはdevice/Agent/model SHAを含み、UIとruntimeで確認。EveのrequestIdには選んだ端末と版を結び付ける。

既存prepareの部分ファイル掃除・hash検証・memory検査・停止・再起動照合を再利用。model/Agentの更新削除、一般公開market、remote host adapter、account復元はこのsliceの未完了事項。v0.4設計の順序と個別gateで進める。

## 検証・引継ぎ

`node --experimental-strip-types --test tests/noah-device-store.test.mjs tests/sky-linux-models.test.mjs tests/sky-linux-local.test.mjs`、`npm run typecheck`、`npm run lint:product`、`node scripts/build-sky-linux-pixel.mjs /private/tmp/noah-device-package`、`npm run design:check`、`npm run verify`。

実装先は`codex/noah-device-store`。合成adapterの画面/Job成功とPixelでの取得・推論は区別する。main統合・公開・実機導入を実施済みとしない。最新結果は`data/project-status.json`の`noahDeviceStoreImplementation`を参照。

## 運用準備（2026-11-08）

この節はCodexが先に整理した端末保守・市場運営の補助手順。本人の「運用」の意味は下記「既存自動化Toolの運用」を優先する。以下は開始条件であり、本人がPixel導入を選んだ記録や運用開始済みの記録ではない。

| 範囲 | 確認できた実装 | 運用に残る条件 |
| --- | --- | --- |
| 本人端末のストア | 固定catalog、3種の文章recipe、model追加・照合、Eve Job、停止・成果export | 今回と同じpackageでPixel実推論・成果保存・再起動後の照合。main統合は別途必要 |
| 掲載・審査 | 既存`/api/sky/submissions`、`tool-packages`、`tool-publications`、`tool-reviews`、`tool-registry`。版/SHA、審査期限、公開取消しを保持 | 固定catalogのNoahとは未接続。Agent/LLMの配信契約、所有者境界、対象端末への追加までの通し試験が必要 |
| 販売 | 既存`/api/sky/commerce/[action]`に出品・購入・照合・返金処理 | この端末ストアの商品・利用権とは未接続。本番設定・実決済・運用受入は今回未確認 |
| 継続保守 | runtime配布物は既存`update-pixel.py`で停止確認・整合性確認・復旧を扱う | Agent/LLMの更新・削除UI、端末喪失時のaccount復元、常時稼働は未受入 |

2026-11-08確認時のmainは`9393ed97fc0333ed3a26be49c86b87fd21254b50`。今回の`lib/noah-device-catalog.ts`はmainに存在せず、このbranchのPRも未作成。公開サイトの入口や従来Pixel試験を今回の導入成功として数えない。

### 本人Pixelでの開始と日常利用

1. 導入前: 端末・既存package版・空き容量・準備状態を読み、実行中/停止未確認の仕事が0件であることを確認。配布manifestと全11ファイルを照合する。本人の成果・設定・モデル・pairing鍵を保持する。
2. 初回受入: 今回のpackageでNoahから要約Agentを追加し、Eveへ新しい試験文章を渡す。実workerの同一model SHA、Job ID、保存成果を確認。通信再接続とruntime再起動後も同じJob/成果が読め、余計なJobが増えないことを合格条件とする。旧成果の再表示だけでは合格にしない。
3. 日常利用: 起動→モデル準備→Eveへ依頼→成果確認→必要な文章とAgent設定をexport。使い終えたら実行を停止し、停止済みの表示まで確認する。画面を閉じただけで停止済みにしない。
4. 失敗時: 追加失敗は既存追加番号で状態を確認して「準備を再開」。依頼の通信切断は同じJobを再照会する。停止未確認なら新規依頼と更新を止め、既存runtimeの復旧手順へ戻る。
5. 更新時: 元版と候補版を記録し、既存updaterの停止・保護データ・健康確認に従う。失敗時はupdaterの記録と復旧結果を照合する。コードのrollbackは成果や端末全体のbackupの代用ではない。
6. 容量・記録: model 8件/計6GiB、Agent 32件、Job 100件、追加記録256件を上限として残量を確認する。上限を避けるためにstateを手で削らない。必要な成果をexportし、削除・保管機能の実装へ引き継ぐ。

### 少人数への配布と市場運営へ進む条件

- 商品管理: 所有者、固定版/SHA、取得先、ライセンス、対応端末、要求容量、審査結果を一つの商品に結び付ける。既存審査は全項目と証拠が揃うまで公開しない。端末向けcatalogは現状コード変更・再配布が必要。
- 配信・取消し: 公開済みAgent/LLMだけをNoahで取得できる接続を実装し、期限切れ・取消し後の新規取得と導入済み端末での動作を定義・検証する。Registryから消えるだけでは端末上の停止まで保証しない。
- 運営担当: 商品の登録・審査・公開取消し・問い合わせ・障害復旧の担当と操作権限を決める。Jevの判定やSpiderの読取結果から自動で公開権限を得ない。
- 記録と監視: 配布版、対象端末、追加/準備/実行/停止/復旧の成否、所要時間、失敗理由を確認する。本人用は既存記録から手動確認し、集中監視が実装済みとはしない。依頼本文・成果・鍵を監視ログへ転記しない。
- 拡張の合格条件: 2所有者間のデータ分離、配信取消し、更新失敗時の復旧、Agent/LLM削除時の共有依存保持、backup復元を通しで試す。招待配布・一般公開・有料販売は各範囲の受入記録を別に残す。

## 既存自動化Toolの運用（2026-11-08本人補足）

本人は以前の自動化Toolを使う文脈で「運用」と述べた。市場そのものの運営・本人Pixelの保守に限定せず、既存資産から対象業務を特定する。選ぶ業務と外部アカウントはまだ確定していない。

- 基本4 Tool: ココナラ案件チェック、記事の無料版作成、出典整理、納品照合。`toolkits/mr`のCLI/MCPと`lib/mr-tools.ts`のWeb処理が存在する。今回、同梱サンプルによるCLI 4件は終了コード0・成果出力を確認。記事の新規執筆・外部投稿・受注の実成功ではない。
- 旧Mr. Hubの11候補: 提案文、受託案件、依頼整理、YouTube台本、SEO、LP、営業返信、顧客分析、予定、Telegram、ツール発見。[候補契約](../sky-mr-automation-candidates.md)と`lib/catalog.ts`では本体の実行器接続が未完了。候補カードや下書き表示を実行成功へ数えない。
- ブランド運営: [Instagram運用・受注型ブランド管理](../fashion-brand-ops-integration.md)のMCP、投稿計画・DM返信案・受注・制作管理を再利用する。Provider初期値はmockで、本番の投稿・送信・決済の接続受入とは別。
- 接続の残り: 既存`lib/work-composition.ts`には出典整理・無料記事・CSV等の実行対象があるが、今回の端末内recipeにTool権限はない。選択した業務でNoahのTool発見→Eveの依頼→既存Broker/Work→成果・停止・復旧までを照合する。全Toolを端末内LLMから直接呼ぶ権限は追加しない。
- 現在の接続: このチャットのSkyプラグインで検索を試みたところ、設定済みURLの`/mcp`が404を返した。ローカルCLIの成功と接続先の利用可否を分け、原因と正しい接続先は未確認として扱う。
