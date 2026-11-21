# Noah — Web・PC相談 / 紹介案件の運営

複数サービスへの拡張は [組み合わせAgentの運営手順](COMBINATIONS.md) を使う。公式の対応関係から候補を作り、根拠・媒体・成果条件を確認した組み合わせだけ紹介する。

法人向けの①は [法人si導入準備 Agent の運営手順](BUSINESS.md) を使う。会員登録不要の公開Webと、集客・承認・支払・銀行照合・費用の本人用台帳を別に提供する。

相談で困りごとを整理し、運営側で紹介案件・下書き・実績を管理する2つのAgent。同じ台帳と処理を使い、相談者には運営の報酬や内部条件を渡さない。初版は規則による処理で、自由会話モデルや自動投稿ではない。

| Agent | 入力 | 成果 |
| --- | --- | --- |
| Web・PC相談 | Web制作・アクセス分析・PC修理・データ移行、媒体、予算 | 無料の確認手順、条件が合う候補を最大3件、広告表示、参照日 |
| 紹介案件の運営（本人用） | 本人用台帳、下書き指示、匿名の期間集計 | 未確認条件、公開前原稿、承認率・承認報酬・保留額 |

既存の `noah-agent/1`、`noah-terminal/1`、MCP HTTPに適合する。Noah本体・DB・決済は変更しない。[設計](../../docs/services/noah-affiliate-agents.md)。

## パッケージを作る

リポジトリのルートでNode 22.13以降を使用する。生成物は本人用のGit外のフォルダに保存する。

```sh
node --experimental-strip-types toolkits/noah-affiliate-agents/build.mjs \
  --catalog /absolute/private/catalog.json \
  --out /absolute/private/noah-affiliate
```

`--catalog`を省略すると案件0件のサンプルで作成する。`affiliate-consult.zip`と`affiliate-operations.zip`、それぞれのmanifest JSON、`SHA256SUMS`が生成される。実行用ZIPには固定テストと必要なソースを同梱する。相談ZIPには許可済みの公開フィールドだけが入る。運営ZIPには非公開台帳が入るので、本人用として保管する。

Noahのソース登録で各manifestとZIPを渡し、既存の専用実行環境でテスト・実行する。成果は本文と `result.md` / `result.json`。**ZIP作成・ローカル試験は、本番登録・実機稼働の証拠ではない。** ソース実行には専用環境が必要。スマホ側からサーバーの道具を使う場合は次のMCP接続を使う。

## スマホから使うMCPの準備

`mcp.mjs`はCloudflare Worker用。`wrangler.jsonc`に配備先のrouteを設定し、本人が所有する公開HTTPSのホストへ配備する。設定例のドメインは実在の配備先として使わない。`workers_dev`は初期状態でfalse。

- `CATALOG_JSON`: 本人用台帳のJSON全体を秘密設定へ投入する（UTF-8で5,000バイト以下）。Gitや通常のvarsへ入れない。[Workersの変数上限は5KB](https://developers.cloudflare.com/workers/platform/limits/#environment-variables)のため、このMCP版は小規模台帳用。大きい台帳はソースZIP（64KiB以下）を使うか、別途非公開ストレージを接続する。
- `OPERATIONS_TOKEN`: ランダムな32文字以上の本人用Bearer鍵を秘密設定へ投入する。URLやmanifestに入れない。
- `NOAH_ORIGIN`: Noahのブラウザorigin。初期値は `https://avoado.si`。
- `/consult/mcp`: 認証不要の相談専用。利用者は台帳を差し替えられない。
- `/operations/mcp`: 本人用の鍵が必要。1所有者専用であり、複数所有者を混ぜない。鍵付き接続を扱うNoahの登録画面から本人用として接続する。公開の棚へ運営用鍵を載せない。

配備前に検査できる。

```sh
npx wrangler deploy --dry-run --config toolkits/noah-affiliate-agents/wrangler.jsonc \
  --outdir work/noah-affiliate-worker-check
```

実際の配備先が決まったら、パッケージ生成に `--origin https://YOUR-DEPLOYED-HOST` を追加すると `affiliate-consult-mcp.json` / `affiliate-operations-mcp.json` も作れる。Noahで公開相談口の握手と道具一覧を確認し、相談を依頼して成果を受け取る。運営口は鍵を設定してから点検・下書き・集計を試す。外部登録機能の配備状態とスマホ実機での受入は別途確認する。

本キットは配備・秘密設定投入・Noah登録・ASPへの申請・投稿を自動では実行しない。ネットワークを使うのはMCPの要求と応答のみで、広告リンクや任意URLをサーバーから取得しない。本文や鍵を記録するログを追加していない。公開口のレート制御は配備先で設定する。

## 台帳

`catalog.example.json`は空の台帳。最大100件、確認日から最大30日間、日付はUTCの暦日。提供者が管理画面と媒体条件を確認して更新する。期限切れは自動的に紹介対象から外れる。

| フィールド | 内容 |
| --- | --- |
| schema / version / offers | `noah-affiliate-catalog/1` / 台帳版 / 案件配列 |
| id / name / topic / description | 識別子・公開名・分野・公開許可済み説明 |
| topic | `website` / `analytics` / `pc_repair` / `data_backup` |
| sourceUrl | 参照したHTTPS URL |
| checkedAt / validUntil | `YYYY-MM-DD`、確認日と期限 |
| status / partnership | `active`または`paused` / `partnered`または`unpartnered` |
| channels | 許可を確認した `web` / `social` / `email` / `chat` の配列 |
| agentPlacementApproved / publicContentApproved | このagent媒体での掲載・紹介文の公開を確認した真偽 |
| approvalReference | 確認記録の参照先。未確認ならnull。相談側には出さない |
| affiliateUrl | 登録媒体用に発行された正式広告URL。未発行ならnull |
| conditions | 本人用の成果条件・媒体制限。相談側には出さない |
| price | 未確認ならnull、確認済みなら `{ "amountYen": 5000, "period": "month" }`（`once`も可） |
| commission | 任意の本人用報酬 `{ "unit": "yen", "amount": 100 }`（`percent`も可）。利用料金とは別 |

正式広告URLは `https://www.rentracks.jp/adx/r.html` の `idx` / `dna` 形式のみ受け付ける。識別子を推測して作らない。別形式が発行された場合は確認してvalidatorを追加する。媒体掲載が未確認ならchannelsを空にし、2つの承認をfalse・参照と広告リンクをnullにする。広告リンクを返せなくても無料の対処は利用できる。

候補は分野一致・掲載条件を検査した後、ID順で最大3件。報酬額で順番を変えない。予算指定時は価格未確認・期間不一致・予算超過を除外する。価格は製品の総費用を保証せず、契約前に再確認する。

## 頼み方

ソース版の相談は「Webサイトを作りたい」「アクセスを分析したい」「PCを修理したい」「データを移行したい」。自然文の判定はこの4分野の語句で行い、既定媒体はchat。細かく指定する場合は依頼本文へJSONを渡す。

```json
{"action":"consult","topic":"website","channel":"chat","budgetYen":10000,"budgetPeriod":"month"}
```

運営版の自然文は台帳点検になる。下書き・集計はJSONで指定する。

```json
{"action":"audit"}
```

```json
{"action":"draft","offerId":"your-offer-id","channel":"web"}
```

```json
{"action":"analyze","periodStart":"2026-11-01","periodEnd":"2026-11-22","rows":[{"offerId":"your-offer-id","clicks":100,"pending":7,"approved":2,"rejected":3,"pendingYen":10000,"approvedYen":600}]}
```

MCP版は道具名を選んで入力するので`action`は渡さない。`analyze`のみ、上記からactionを除いたJSON文字列を`summaryJson`に渡す。各行は同じ期間・同じ案件の集計値。重複ID・個人情報などの追加フィールドを拒否する。承認率=承認/(承認+否認)、1クリック当たり承認報酬=承認額/クリック数。分母0はnull。保留額や承認額を入金済みとして扱わない。

## 検証と残件

```sh
node --experimental-strip-types --test tests/noah-affiliate-agents.test.mjs
npm run verify
```

専用試験は掲載条件、非公開情報の除外、予算、集計、認証、NoahのMCP client、ZIPのsource検査・固定テスト・端末protocolと成果hashを確認する。外部ASPには接続しない。本番配備・Noah登録・ASPの新媒体許可と広告URL・スマホ実機での依頼から受取は残件。レントラックス実績の自動取得も未実装。
