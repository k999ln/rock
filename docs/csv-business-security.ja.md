# CSV仕事 v1 — セキュリティ・プライバシー運用

更新日: 2026-09-15

1. CSVは内容を推測せず、全ファイルを機密情報として扱う。PII検知は免責手段にしない。
2. 認証はSites標準の`oai-authenticated-user-id`を正本とする。dispatch hostの認証済みemail fallbackはSHA-256 pseudonymにし、通常のクライアントheaderでは成立させない。
3. D1の全job、event、料金行はowner IDを持つ。R2 object keyを利用者入力から作らず、取得前にD1でowner一致を検査する。
4. 入力と成果物はR2、metadataとhashはD1へ分離する。APIレスポンスにobject key、email、秘密値を返さない。
5. uploadは`.csv`、10MiB、50,000行、100列を上限とし、NUL、構文不正、列数不一致、重複見出し、未対応文字コードをfail closedにする。
6. 成果物は`private, no-store`、`nosniff`、attachmentで返す。HTML報告は全値をescapeし、scriptを含めないCSPを付ける。
7. 受付から7日後はdirect artifactとbuyer share取得を拒否し、次回の本人アクセスcleanupでR2原本・全納品成果物・共有token行を物理削除する。支払/返金イベントがあるjobは必要なjob/payment監査metadataを保持し、支払記録のないsample/unpaid jobはmetadataも削除する。独立scheduled purgeは未配置である。本人の即時削除は支払記録のない削除可能jobだけに対応する。会計・紛争記録の別保持期間は実販売主体・契約に合わせて設定が必要。
8. 処理はrevision付きlease、最大3回、attempt固有object keyとhashで二重完了・古いworkerの上書きを防ぐ。D1確定後に`waitUntil`を登録し、失効leaseは次の認証済みpollで回収する。独立Queueは未配置なのでブラウザ閉鎖後の無人完了は保証しない。送信結果が不明なら自動で売上・納品・請求を確定しない。
9. 外部入金の手入力は`manual_verified`であり、署名済みProvider証拠ではない。手動の払出し額はProvider収益・月額閾値を増やさない。Provider払出しIDに紐付けて運営者が根拠を確認した返金だけは対象額を減らす方向に反映する。
10. バックアップはmetadataとschemaを対象にし、平文CSVの長期複製を既定にしない。障害時は入力hash、event、attempt、error codeで復旧し、任意ファイル閲覧を避ける。
11. buyer共有URLは高エントロピーbearer tokenをfragmentで渡し、D1にはSHA-256 hashだけを保存する。これはURL保有者を許可するcapability URLであり、受取人の本人確認・identity bindingではない。転送を避けるよう顧客へ説明し、本人確認が必要なら公式市場の納品経路を使う。buyer APIはhash、job、失効時刻、revoke状態、7日保管期限を毎回照合する。取得APIも`private, no-store`とし、tokenや成果物をログ・分析へ記録しない。
12. Provider webhookはHMAC timestamp署名を5分以内に検証し、`provider + provider_event_id`のunique制約で同一イベントの再送を冪等化する。同じIDに異なるpayloadが来たら409として記録を上書きしない。運営者手動照合は参照文字列を保存せずdigestのみを持ち、`manual_verified`をProvider売上証拠と区別する。
13. 運営の全体/利用者/売主別の新規受付制御、介入、直接費、手動入金、月次再判定は、状態変更・監査event・outbox・idempotencyをD1 batch内で確定する。outbox外部配送、production operator allowlist/secret、実運用者受入は未配置。本人exportは認証userだけのjob/payment/billing metadataと本人認証が必要なartifact URLを返し、他ユーザー識別子は含めない。翌月解約は月額課金が有効であることを意味せず、内部の翌JST月停止状態を記録するだけである。

インシデント時は新規受付を停止し、影響job、期間、object、access log、hashを特定する。利用者通知、秘密のrotation、削除、復旧、再開判断を記録する。対象地域・販売主体・窓口が確定するまで一般の購入者から直接個人情報を集める経路は有効化しない。
