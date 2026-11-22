# 法人のsi導入準備 Agent の運営

相談者は会員登録不要。公開Webで業務の整理票と相談文を作る。運営者は別の鍵で集客計画・ASP成果・支払・入金・費用を管理する。継続実行器は15分ごとに自社記事の公開・記録済み実績の点検・改善判断を行う。ASPは認証済みChromeの実取得に接続し、6時間ごとの既存追跡を設定済み。Mac・Chrome・ログイン維持が必要。銀行取得と実入金の受入は未完了。手動取込は移行・調査用の補助手段で、完成の条件ではない。

## 公開と接続

- 公開入力: https://noah-business-si.mr-kirin999.workers.dev/
- Noahの入口: `/noah/business-si`。ホームの「導入準備票をつくる」から開く。
- 公開MCP: `https://noah-business-si.mr-kirin999.workers.dev/consult/mcp`
- 運営画面: `https://noah-business-si.mr-kirin999.workers.dev/operations`
- 運営MCP: 同じoriginの `/operations/mcp`。`Authorization: Bearer <OPERATIONS_TOKEN>` が必要。
- manifest: 同じoriginの `/manifest.json`。公開Web用。秘密鍵は含めない。

運営キーは秘密管理場所の `OPERATIONS_TOKEN` を使う。画面はキーをメモリだけに保持し、更新すると消える。台帳は単一所有者用のDurable Objectに保存する。別所有者の運営口として共有しない。

## 収益化を開始する条件

`BUSINESS_CONFIG_JSON` は `validateBusinessConfig` の形式で秘密設定に保存する。実案件ID、単価、掲載記録を公開Gitに入れない。

1. 広告を掲載する媒体と利用経路をASPの登録媒体として確認する。Noah未登録の場合は登録済み記事を案内する方式を選び、Noah自身のmediaApprovedをfalseのまま保つ。
2. 案件提携・この媒体での掲載許可・公開する文面と経路を確認し、証拠を残す。
3. **この媒体用に発行された正式URL**を設定する。他サイトのリンクを流用しない。
4. 確認日・有効期限（最大30日）を更新し、確認済みの `channels` だけを設定する。`enabled` を有効にする。
5. 条件に合う本人が自分の意思で申し込む。運営が申込を代行したり、試験成果を作ったりしない。

不足・期限切れは広告リンクを返さない。無料の整理票は利用可能。`registeredArticle` に記事URL・mediaOrigin・siteId・approved・tagVerified・referenceを設定すると、Noahはその記事URLだけを案内する。正式タグは登録記事上に原文保持し、相談IDは外へ渡さない。直接紹介も `trackingApproved: true` の明示許可がなければURLを改変しない。リンク表示数はクリック数・申込数ではない。媒体成果を個別相談や集客キャンペーンへ推測帰属させない。

## 集客から入金までの1巡

1. **計画**: 運営画面で `noah-home` などの識別名、経路、見出し、全費用の上限を保存する。出力された流入URLと原稿を確認する。原稿の `readyToPublish` がfalseなら広告配信は保留。自動投稿・営業メール送信・広告費の支出はしない。
2. **相談**: 法人、研修目的、担当者、会社メールの使用可否、既存申込の有無、相談希望を確認する。対象外でも整理票を返す。社名・メール・入力本文は台帳へ保存しない。
3. **成果**: ASPの実績をCSV等で取得し、必要列に変換して `import_conversions` で取り込む。保留・承認・否認を区別する。最初の1件は成果ID、案件ID、匿名IDの対応を元画面で確認する。
4. **承認**: 次の実績を同じ成果IDで取り込む。承認日・否認理由を記録する。期限を超えた保留は調査対象にし、自動承認しない。確定後の訂正は通常取込で上書きせず、ASP差異を調査する。
5. **支払**: ASP支払履歴の支払ID・含まれる成果ID・金額を `import_payouts` で取り込む。他媒体が混ざる場合も支払全体の承認成果を取り込む。調整額は根拠が必要。承認合計＋調整額と支払額が一致しない場合は保存できない。
6. **入金**: 銀行の実入金を元明細で確認し、支払ID・金額・入金日だけを `import_deposits` で取り込む。金額不一致・重複は拒否。これは所有者による証拠照合であり銀行APIによる自動確認ではない。
7. **採算**: 制作、集客、対応人件費、実行費、固定費の配賦を `import_costs` へ保存する。承認額と入金を分け、キャンペーン別の入金対応成果額から費用を引いて見る。全体振込額には他媒体の成果も含み得る。未配賦の調整額があれば利益を確定しない。

毎営業日に保留/否認/不一致を確認し、月末・支払日に支払履歴と銀行明細を照合する。処理後は「台帳を保存」で本人の保存場所へJSONを書き出す。1日200相談、台帳各区分5,000件・全体4MBの小規模運用。上限に近づいたら保存容量と運用単位を見直す。古い記録を勝手に消さない。

## CSVの必要列だけを取り出す

生の銀行/ASP CSVは端末内に置き、アップロードしない。列の対応を明示するJSONを作る。以下は銀行の**合成例**。実際の見出しに変更する。

```json
{
  "action": "import_deposits",
  "encoding": "utf-8",
  "fields": {
    "id": {"column":"取引ID"},
    "payoutId": {"constant":"確認したASP支払ID"},
    "amountYen": {"column":"入金額"},
    "receivedOn": {"column":"入金日"}
  }
}
```

```sh
node toolkits/noah-affiliate-agents/business-import.mjs /private/input.csv /private/mapping.json /private/normalized.json
```

新規ファイルのみ作成、権限0600。UTF-8 / Shift_JIS、1〜100件に対応。金額は整数円、日付は日本時間のYYYY-MM-DDかYYYY/MM/DD。元ファイルSHA256＋行番号を `sourceRef` に残す。名義・口座・顧客名など対応表にない列は出力しない。出力を元資料と照合し、運営画面で確認チェックを入れて取り込む。

全ての必要フィールドは `business-import.mjs` の `IMPORT_COLUMNS` が正本。各フィールドに `column` または `constant` を指定する。状態の変換は `{"column":"状態","values":{"未承認":"pending","承認":"approved","否認":"rejected"}}` のように明示する。想定外の状態は拒否。`conversionIds` は `separator` で1文字の区切りを明示する。空の任意列はnullへ変換する。無関係の成果のuixはnullにし、Noahへ帰属させない。

同一操作IDの再送は二重計上しない。台帳の版が古い場合は再取得してやり直す。同じ成果IDの状態更新は可能だが、入金済みの金額変更や識別子の変更は拒否する。バッチ途中で不正行があれば全体を保存しない。

## 配備と検証

`business.wrangler.jsonc` で独立WorkerとSQLite Durable Objectを配備する。既存Noahの本番D1 migrationは不要。秘密設定をvars、URL、公開manifestへ入れない。

```sh
node --experimental-strip-types --test tests/noah-business-agent.test.mjs tests/noah-affiliate-agents.test.mjs
npx wrangler deploy --dry-run --config toolkits/noah-affiliate-agents/business.wrangler.jsonc
```

試験の合成申込・成果・入金はローカルの一時台帳だけで行う。公開相談の動作確認はqa-launchとして区別し、ASPの申込送信や偽の成果投入はしない。紹介停止時は秘密設定のenabledをfalseにする。台帳の書き出しと確認機能は維持される。

## 継続実行の現在地

運営画面で開始・停止・工程状況を確認できる。公開記事は `/guides`。サーバーのDurable Object alarmが15分ごとに進み、5分cronが欠落alarmを復旧する。ブラウザの表示更新を実行トリガーにしない。各回の証拠と直近100回の記録を保持する。

自社記事は4つの業務別に公開し、確定成果20件以上・比較対象10件以上になるまで優劣を断定しない。条件が揃えば入金対応成果額と記録費用から既存記事の更新先を決める。未記録の費用があり得るため利益の確定とは呼ばない。新規の外部SNS投稿、広告購入、申込代行、送金は実行しない。

**残件**: 次回以降の定期取得の実行確認、銀行の読み取り専用接続、支払明細発生時の通知書/内訳対応、実成果・承認・入金の通し運用。法人研修の登録済み媒体への掲載・正式タグ・Noahからの記事遷移は2026-11-22に実確認済み。これらが未接続なら工程状態は `needs_connection` / `needs_setup` のまま。timerや合成試験で完了にしない。


## Chromeからの実取得

`business-rentracks.mjs` は認証済みChromeで取得した注文表・選択中フィルターを検証し、対象案件の必要列だけを既存の鍵付き運営APIへ保存する。ブラウザ操作自体は提供しない。Cookieやプロファイルを取り出さない。CSVの手動編集は不要だが、このCLI単体を継続取得Agentとは呼ばない。

取得時は `detail_sales` で全媒体・全広告主・全備考・全状態、売上日と承認日の両方を確認する。詳細期間は365日未満の差分で指定し、最大2000行に達したら期間を分割して全件取得する。年月日未選択、見出しの変更、未知の状態、小計不一致は保存しない。`detail_pay` は現時点で実確認できた「明細なし・小計0」の検証に対応。明細発生時は支払通知書の支払実施日・成果内訳を確認して対応する。支払予定日を実施日に読み替えない。

端末内の対象設定は `offerId`・画面と完全一致する `productName`・登録媒体の `siteId`。媒体が未登録なら `siteId: null` のままにする。別媒体の匿名IDはNoahへ帰属しない。現在の対象以外の成果は件数だけ取得記録へ残す。

```sh
node toolkits/noah-affiliate-agents/business-rentracks.mjs /private/capture.private.json /private/target.private.json /private/business-secrets.private.json /private/receipt.private.json
```

送信先はこのWorkerの運営APIに固定。秘密はヘッダーだけに使い、リダイレクトを拒否する。取得受領票は0600で新規保存する。運営の `agent_status` / `source_status` で取得元・日時・期間・件数・hashを確認できる。0件と未接続を区別し、24時間経過した取得は `stale`。保存後は継続実行器を起動し、承認待ち点検・改善判断へ進む。単発の読取成功は `recurringConnectionVerified: false` のまま。

銀行の `matchBankEntries` は口座一致・確認済み振込元・実入金・金額・日付・双方向の一意対応を検査する。これは照合ロジックの試験済み実装で、銀行の認証/明細取得接続の受入ではない。

### Chrome取得器と検索導線
`business-browser-collector.mjs` の `collectRentracks(tab, target)` は、支持されたCUAセッションの選択済みChrome Tabだけを使い、売上日/承認日の過去365日・全状態と支払画面を読み取る。ブラウザを独自起動せず、Cookieを抽出しない。取得値は0600のGit外ファイルへ保存し、上の同期処理で端末内正規化する。対象媒体フィルターが残る、見出し変更、全件未取得、未知の状態、支払通知書が必要な場合は成功扱いにしない。既存の6時間ごとのChrome追跡に接続済み。単独WorkerのalarmはASP画面を取得せず、Mac側の実取得結果だけを点検する。

公開記事は `/guides`、`/sitemap.xml` と `/robots.txt` に反映する。canonicalはキャンペーンqueryを除いたURL。運営画面はnoindexで、権限検査は従来どおりサーバー側で行う。媒体登録は本人が不要と回答したため送信しない。既存媒体の公開と編集認証を分け、正式タグを別媒体へ転用しない。
