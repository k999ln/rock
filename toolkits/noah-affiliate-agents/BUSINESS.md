# 法人のsi導入準備 Agent の運営

相談者は会員登録不要。公開Webで業務の整理票と相談文を作る。運営者は別の鍵で集客計画・ASP成果・支払・入金・費用を管理する。継続実行器は15分ごとに自社記事の公開・記録済み実績の点検・改善判断を行う。ASPや銀行の自動取得は未接続であり、一連の自動化は未完成。手動取込は移行・調査用の補助手段で、完成の条件ではない。

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

1. Noahの入力画面と利用経路をASPの登録媒体として確認する。
2. 案件提携・この媒体での掲載許可・公開する文面と経路を確認し、証拠を残す。
3. **この媒体用に発行された正式URL**を設定する。他サイトのリンクを流用しない。
4. 確認日・有効期限（最大30日）を更新し、確認済みの `channels` だけを設定する。`enabled` を有効にする。
5. 条件に合う本人が自分の意思で申し込む。運営が申込を代行したり、試験成果を作ったりしない。

不足・期限切れは広告リンクを返さない。無料の整理票は利用可能。正式URLの `uix` に匿名の紹介IDを加え、短縮URLを挟まず紹介先へ渡す。リンク表示数はクリック数・申込数ではない。ASP側で `uix` が実際に返ることは初回の実成果で確認する。

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

試験の合成申込・成果・入金はローカルの一時台帳だけで行う。本番の公開確認はGET/初期化と道具一覧で行い、偽の成果を投入しない。紹介停止時は秘密設定のenabledをfalseにする。台帳の書き出しと確認機能は維持される。

## 継続実行の現在地

運営画面で開始・停止・工程状況を確認できる。公開記事は `/guides`。サーバーのDurable Object alarmが15分ごとに進み、5分cronが欠落alarmを復旧する。ブラウザの表示更新を実行トリガーにしない。各回の証拠と直近100回の記録を保持する。

自社記事は4つの業務別に公開し、確定成果20件以上・比較対象10件以上になるまで優劣を断定しない。条件が揃えば入金対応成果額と記録費用から既存記事の更新先を決める。未記録の費用があり得るため利益の確定とは呼ばない。新規の外部SNS投稿、広告購入、申込代行、送金は実行しない。

**残件**: 実在するレントラックス実績取得接続、登録受取口座の確認、銀行の読み取り専用接続、許可済み媒体と正式URL、実成果・承認・入金の通し運用。これらが未接続なら工程状態は `needs_connection` / `needs_setup` のまま。timerや合成試験で完了にしない。
