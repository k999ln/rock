# Noah — 業務Agentを入れて管理する箱

## 2026-11-17 使用版と更新の管理

Agent詳細から使用版を準備してライブラリへ追加し、版管理で更新・旧版への復元・失敗後の再試行・整理と再追加を操作できる。accountのinstanceは固定source/manifest/model/権限を参照し、Workと継続運用は開始時の版を保つ。使用版の切替は準備完了後のみ。同時操作、取消後の遅延完了、現在の利用権を照合する。処理中/結果不明/運用中は整理できない。

コード・成果・共有モデル・取得本体は整理しても残る。取得本体とモデルの安全な回収、全catalog版、招待とPixelは未完了。[DB/API・受入条件](../service-design/noah-agent-platform.md#15-使用版更新復元の実装契約2026-11-17)。証拠は`work/verification/noah-lifecycle-20261117/`。

2026-11-16実装: `/noah`の公開feed・明示設定による推薦、`/noah/library`の既存資産への参照一覧、`/noah/work`のローカル実行/成果/停止、`/noah/publisher`の作者提出/撤回を追加。下書き、公開GitHub/HFコード取得、ZIPの限定リファクタ、限定招待も接続した。8種類の公式実行器で接続→モデル呼出→実ファイル→同じWorkを今回再試験。一般Agentの定期/イベント運用、全77未対応Agent、スマホ中継、版更新/rollback、購入から実行への全方式統合は未完了。[受入と未完了台帳](../../codex/tasks/68-noah-completion.md)。以下の「現在の設計」は目標契約として残す。

## 現在の設計（2026-11-15、以下の旧範囲より優先）

Noahは「いろいろなAgentが流れてきて、選んで買い、接続して使い、自分のAgentを運用する場所」。**まずNoah単独でこの一周を完成させる。その後、Noahで使えるAgentをbuildできるsiとしてEveを追加する。** Agentは独自のモデル・プログラム・専用画面を持つ。

1. `/noah`でおすすめ・フォロー中・新着のタイムラインを見る。用途、できる仕事、料金、対応環境、推薦理由がカードに出る。
2. タップして詳細を見る。成果例、提供者、対応操作、必要な接続先・権限、実行場所を確認する。
3. 無料なら「接続する」、有料なら「購入して接続」。必要なアカウント設定・実行先準備を経て、自分のAgentに入る。
4. `/noah/library`でAgentごとの設定・接続・予算・稼働・停止・更新を管理する。接続ボタンだけで仕事を自動開始しない。
5. NoahのAgent画面で仕事を依頼するか、対応する専用画面を開く。定期/イベント運用は対応能力と本人の設定が揃った場合に開始する。Eveがなくても使える。
6. 本人は自分の実行、提供者は自分のAgentの利用、運営は権限に応じた全体の実績を確認する。外部Agentの未計測分を0件と断定しない。
7. 自作Agentは下書き・本人利用から始め、明示的に掲載申請する。公開・限定配布・有料販売を選び、審査後に市場へ載る。

**[実装に渡す仕様の正本](../service-design/noah-agent-platform.md)** に全ページ、接続方式、DB/API、状態遷移、推薦、利用計測、移行順、受入試験を定義する。これは目標仕様であり、新しいタイムライン・統合ライブラリ・スマホからMacを使う接続・継続運用が完成したという記録ではない。

2026-11-15フロント: 現行`/noah/agents`をX型の縦投稿表示へ変更。実データの検索、接続方式、紹介/新着/本人登録の切替と既存詳細/追加への導線を持つ。公開marketの動的取得・account推薦学習・統合libraryへの移行を完了扱いにはしない。

管理の正本はaccount。既存の担当設定、外部Agentのアップロード、端末内の導入を同じ「自分のAgent」へ参照でまとめ、Job・Receipt・秘密情報は各既存の正本を使う。画面名や同じ表示名を根拠にレコードを統合しない。Eveの生成物も同じ登録・検査・接続経路へ入れ、特別な実行権限を付与しない。

初回の通し受入は「スマホ/PCのNoahでAniccaを発見→詳細→自分のMacへ接続→公式画面を開く→接続/停止状態を確認」。業務アカウントの設定と実仕事の合格は別項目。次にMCP/A2Aの別Agentを同じ仕組みへ載せ、Anicca専用設計でないことを確かめる。

下記の2026-11-14入口、Pixel向け文章Agent、ZIP試作は既存実装と履歴の説明として残す。現在の入口・能力・完成条件は上記とリンク先を優先する。

2026-11-14本人回答: 最初の開発対象はeve.siのWeb版。`/noah`から既存の本人別Agent一覧・追加・設定・利用停止を使い、同じAgent ID/版を指定して`/chat`のEveへ渡す。Tool探索は`/noah/discover`。旧API/DBと認証・承認を再利用する。業務の定期実行・完全な削除/復旧・mii接続の未実装範囲は下記に残す。

2026-11-08本人再補足: ココナラ担当、資産運用担当、別の業務担当をそれぞれAgentと呼び、そのAgentを管理する箱がNoah。「パッケージ化」はこの集まりを扱う意味。業務Agentの管理・運用は以下の設計で、先行するZIP試作とは実装状況を分ける。

- 本人が言う一言: 「それぞれをagentと呼ぶんだけど、そのagentの管理してる箱がnoah」。
- Goal: 本人の用途別AgentをNoahに集め、個別に追加・設定・利用・運用・停止/再開・更新・削除をNoah内で完結させる。後段のEveから生成Agentを受け入れる。
- Noahがつなぐもの: 業務Agentの定義・本人の設定と、既存catalog、Tool/MCP、モデル管理、実行先。Agentは一つの業務担当で、内部に複数のTool・モデル・工程を持てる。
- AMCの工程: Noahで操作/入力→担当Agentと版を特定→必要条件とBrokerの権限を確認→必要な工程をAMCが組む→既存Workで実行→Jevで評価→Noahで成果を表示。専用画面だけの接続は外部での実行を未観測とする。別Job DBを作らない。
- Jevの合格条件: テスト用3 Agentの設定・状態が個別に保持され、1件の停止で他2件が停止しない。他人のAgent操作は0件、未接続Agentの実行可能表示は0件。接続済みAgentの実行は同じAgent ID・版のJob/Receiptへ追跡できること。これらの統合受入は未実施。
- 出力先: Noahの自分のAgent一覧・利用画面・仕事・成果。後段でEveとも連携する。LLMの出力だけで業務完了としない。
- Wallet: Agentごとの予算・実費・Receiptを既存Walletで管理し、Noahには対応する記録を表示する。集計表示は支払いや資金移動の許可にならない。既存価格は変更しない。
- hardware profile依存: accountを管理の正本とし、端末はcache。Agentごとに端末内/接続PC/remoteの対応実行先と必要モデルを示し、未接続先を実行可能にしない。Pixel受入は別途必要。
- 失敗時: 対象Agentに接続待ち・承認待ち・失敗と再開条件を表示。停止は新規実行を止め、実行中Jobは既存Workの停止・照合を使う。結果不明の処理を自動再送しない。
- 記録: Agent ID・定義版・本人設定・実行先と既存Job/Receiptの参照。鍵は既存credential管理を使い、共有するAgent定義へ混入させない。

## Noahの中身と操作

| Noahに入るもの（例） | 一つのAgentとして扱う単位 |
| --- | --- |
| ココナラAgent | ココナラに関する仕事の担当。具体的な対応工程・接続は個別に定義する |
| 資産運用Agent | 資産運用に関する仕事の担当。対応機能・データ接続・実行権限は未確定 |
| その他のAgent | 利用者が追加する別の用途の担当。3種類に固定しない |

「パッケージ」という別の必須階層を挟まず、Noahが各Agentを直接管理する。ToolはAgentが使う道具、LLMはAgentが使うモデルとして扱い、既存LLMの検索・導入・準備ともつなぐ。Eveからの作成・依頼はNoah先行開発後に接続する。

Noahは「探す・追加する」と「自分のAgent」を持つ。自分のAgentでは担当名、用途、準備/稼働状態、実行先、直近の仕事、成果・費用を確認し、設定・起動・停止/再開・更新・削除を個別に行う。定期/イベント実行はAgentごとの対応能力と設定として扱い、追加だけで自動開始しない。

更新でAgentの設定や権限を他のAgentへ引き継がず、変更内容と必要な承認を確認する。削除時は新規実行を止め、実行中Jobを照合し、既存の成果・Receipt保存契約を保つ。Noahで複数Agentを表示すること自体は、各Agentの承認を束ねたり省略したりする根拠にならない。

## 実装との対応

既存の端末追加→Eve実行は[文章Agentの最初の実装](noah-device-store.md)。既存の業務Toolと設定雛形は下の技術試作で確認済み。業務単位のAgent登録、Noahでの個別管理、Eveから業務実行する統合、定期/イベント実行は未完了。上の3例を実装済みのAgent一覧として表示しない。

既存Automation FundはTool選定と配分を扱う仕組みで、このAgent管理の箱そのものとは扱わない。業務Agentの定義と本人設定、既存Work/モデル管理への参照をつなぐ実装へ進める。

## 技術配布の先行試作（業務Agent管理の完成ではない）

以下はCodexが「パッケージ化」をZIP配布と解釈して作ったv0.1.0。既存MCPの接続・処理検証には利用できるが、上のNoahの管理機能を実装した成果とはしない。PCのNode.js 22.13以上、macOSはPython 3.13以上、LinuxはPython 3.10以上を要する。基本4 Toolは外部APIなし、ブランドはmockで確認した。

### 配布内容と互換性

| ID | 担当 | 実装と到達点 |
| --- | --- | --- |
| article-editing | 出典整理、無料記事編集 | 同梱MR CLI/MCP。原稿を加工し、執筆・投稿は行わない |
| delivery-support | 案件条件チェック、納品照合 | 同梱MR CLI/MCP。応募・契約送信を行わず、記録の一致を確認 |
| brand-operations | 企画、接客下書き、制作管理 | 同梱Fashion MCPの内部計画・mock。外部生成/投稿/送信/請求は未接続 |

`noah.operation-pack/1`は配布メタデータで、Registryの`sky-tool-package/1`や実行権限を置換しない。Agent設定は既存`parseSkyAgentSettings`で検証し、初期enabled=false。モデルは既存local-model既定値の参照だけで、weights・認証・モデルreadyを同梱しない。基本4 ToolはLLMなしで動く。

各manifestはid/version/name、roles（既存Agent設定とcatalog ID・推奨Tool）、connector（同梱registryと公開Tool集合）、workflow（手順と確認事項）、runtime/approval/storage/limitationsを持つ。役割ごとの推奨Toolは権限分離の実装ではない。記事/納品パックのConnectorは既存MRの4機能全体を公開し、操作は既存の個別Tool契約に従う。

旧Mr. Hubの11 candidateは未接続一覧に載せるだけで、起動対象へ昇格させない。Noah端末ストアへのZIP一括import、Agentのaccount登録、定期実行、自律的な連続運転、remote接続先404の復旧はこの配布の完了条件に含めず、次の統合対象として明記する。

### 試作の起動・保管・更新

配布物の`README.md`と`node noah.mjs help`が操作入口。`list`、`verify`、`demo`、`start <pack-id> --origin <本人が使うWeb origin>`を提供する。startはloopback限定、指定した単一origin、既存認証/一回承認を維持し、SDKの自動追加を無効にする。外部のMCP URLを生成したり公開サイトへ配備したりしない。

ブランドのDBは本人用state directoryへ保存し、配布directoryから分離。Provider秘密値を子processへ渡さずmockを維持する。停止後のDB backup/復元は手動で同版へ戻す。コード更新は別directoryへ展開し旧版を保持し、DB migrationのrollbackは保証しない。Agentの設定変更/削除は既存libraryの扱いに従い、自動一括削除は行わない。

buildは明示したsourceだけを収録し、vendor原本hashを確認する。`.env`、DB、credential、node_modules、利用者stateを除外する。lockは転送・改変検出用であり、署名や信頼された配布元の証明ではない。

### 試作の検証と配布

`npm run noah:package`で`work/noah-operation-packs/0.1.0/noah-agent-operations-0.1.0.zip`を生成し、`npm run noah:package:check`でsourceとの完全一致を検査する。既存ZIPは上書きしない。候補を作り直す場合は`--out <新directory>`を指定する。

今回のZIP SHA-256は`61ab0f52e6abb7ea75de1092e3514a2cd7a3bab1bd0d3a0afdd68cf205db5285`。67ファイル（lockを含む）、3パック、7担当設定、candidate 11件。`tests/noah-operation-packs.test.mjs`の6試験で独立展開・4 Tool MCP・ブランド内部計画・hash改変/symlink拒否・認証/単一origin/承認再利用拒否・子process停止・DB再起動照合を確認した。直接のCLI demoも合成入力で成功。型・lint・Sky・設計検査は合格。これらは実認証Web UI、実モデル、実機、本番外部作用の受入ではない。

全体verify初回は3612件中3606成功・4skip・2失敗（DB移行の子試験と親試験）。既存Miniflareへのloopback接続timeoutで、単独再試験は13/13成功。後半を継続し、配布/ビルド/仕事API1678項目は成功。CSV試験もloopback timeout後の単独再試験385項目が成功し、mission/work/botまで通過。verify一回での全合格とは記録しない。配布ZIPと同じdirectoryの`validation.json`に段階とログ参照を残す。archive/evidenceの編集、本番migration、公開、main統合は行っていない。

## ローカルモデルの運用上限（2026-11-18）

- 継続運用画面の任意設定 `maxModelCalls` は1〜1,200。1回の仕事にある既存8呼出し上限と、最大100仕事・24時間の上限を併用する。料金・利益・成功回数への換算はしない。Codexの内部呼出しは観測できないため設定を拒否し、既存のprovider_turnsとは別に扱う。
- 既存Workの `noahOperation` に `reservedModelCalls` と `modelBudgetSinceSequence`、activeに仕事内予約数を保存する。新しいテーブル・Job体系・料金台帳は作らない。旧運用は計測開始回を表示し、過去が不明なら累計上限を後付けできない。
- 内部 `POST /api/noah/operations` の `reserveModel` は `id,revision,lease,occurrenceId,modelCall` を照合する。モデル送信前にCAS保存し、同じ番号は再加算せず、飛び番・別主体・別運用の仕事・古いhostを拒否。既存のloopback/owner/Originを維持する。
- 応答消失は実モデルへ送らず枠を保持する。開始済み処理の停止や切断で枠を戻さない。枠が尽きた場合は新規呼出し・次の仕事を開始しない。結果不明の処理を再送しない。条件変更でも累計を引き継ぎ、使用済み未満の上限を拒否する。
- Jev: 設定上限を超える実モデル送信0、同じ番号の加算1回以下、別owner/lease/仕事の予約0、応答消失後の自動送信0、旧記録不明時の金額/回数推定0。金額予算と一般cloudの契約は未完了。
