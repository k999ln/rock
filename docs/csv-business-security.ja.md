# CSV仕事 v1 — セキュリティ・プライバシー運用

更新日: 2026-09-15

1. CSVは内容を推測せず、全ファイルを機密情報として扱う。PII検知は免責手段にしない。
2. 認証はSites標準の`oai-authenticated-user-id`を正本とする。dispatch hostの認証済みemail fallbackはSHA-256 pseudonymにし、通常のクライアントheaderでは成立させない。
3. D1の全job、event、料金行はowner IDを持つ。R2 object keyを利用者入力から作らず、取得前にD1でowner一致を検査する。
4. 入力と成果物はR2、metadataとhashはD1へ分離する。APIレスポンスにobject key、email、秘密値を返さない。
5. uploadは`.csv`、10MiB、50,000行、100列を上限とし、NUL、構文不正、列数不一致、重複見出し、未対応文字コードをfail closedにする。
6. 成果物は`private, no-store`、`nosniff`、attachmentで返す。HTML報告は全値をescapeし、scriptを含めないCSPを付ける。
7. 受付から7日後はdirect artifact取得を拒否し、次回の本人アクセスcleanupで入力、結果、安全版、報告、event、job metadataを物理削除する。独立scheduled purgeは未配置である。本人の即時削除も同じ対象を削除する。保全義務がある取引記録はファイル本体と分け、実販売経路で法令・契約に従う。
8. 処理はrevision付きclaim、最大3回、決定的object keyとhashで二重完了を防ぐ。送信結果が不明なら自動で売上・納品・請求を確定しない。
9. 外部入金の手入力は`manual_verified`であり、署名済みProvider証拠ではない。Wallet収益、月額閾値、公開実績へ昇格させない。
10. バックアップはmetadataとschemaを対象にし、平文CSVの長期複製を既定にしない。障害時は入力hash、event、attempt、error codeで復旧し、任意ファイル閲覧を避ける。

インシデント時は新規受付を停止し、影響job、期間、object、access log、hashを特定する。利用者通知、秘密のrotation、削除、復旧、再開判断を記録する。対象地域・販売主体・窓口が確定するまで一般の購入者から直接個人情報を集める経路は有効化しない。
