# Noah — テストAgentのクラウド運用

2026-11-16 task68: 本人回答により、一般Agentを動かすクラウドと予算は未決定。以下の固定テストWorkerは既存の受入であり、8種類のローカル公式実行器がクラウド対応した証拠にはしない。新たな契約・配備は行っていない。一般クラウド化では既存Work/Broker/Walletと実行先の認証・容量・lease・再起動時照合を接続する必要がある。Mac用loopback middlewareを公開bindするだけの移設は行わない。

- 本人が言う一言: 「Macを閉じても動くように、テストagentをクラウドで常時稼働。Noahから運用開始・停止」
- Goal: 固定のテキスト整形テストをクラウドで継続し、Noahで開始・停止・結果確認する。
- Noaがつなぐもの: task 58の固定Agent ID/manifest hash、本人の既存所有確認、専用Cloudflare Worker。
- AMCの工程: 所有確認→一回限り接続→入力/間隔指定→永続alarm→整形/結果/次回予定を同一transactionで保存。
- Jevの合格条件: ローカルhost停止中に新規成功2件以上、停止応答後新規0件、同一開始IDで運用1件、未認証/別owner/別Originの操作0件、更新後同一運用の継続、再配信の二重計上0件。
- 出力先: Noahクラウド運用画面。状態・成功数・次回予定・直近20件の結果。
- Wallet: 有料モデル/外部業務を使わない固定テスト。基盤利用は既存Cloudflare契約の使用量。利益/業務成果の証明にしない。
- hardware profile依存: Cloudflare Workers + SQLite Durable Object。Mac/スマホは操作画面。継続運用にMacやブラウザの起動は不要。
- 失敗時: 保存失敗はtransactionをrollbackし再試行。整形は外部副作用のない固定関数に限定。遅延は画面で要確認を表示。5分cronが欠落alarmを復旧し、遅延分をまとめ実行しない。
- 記録: 所有scope、Agent/manifest固定値、運用ID・入力snapshot・間隔・状態・成功数・時刻、直近20結果、開始IDの再送台帳（最大1000）、接続/セッションのhashと期限。

## API / 保存

- 専用Worker `avokado-noah-test-runtime`。既存本番D1へのmigrationなし。DO namespace/classの初期作成のみ。
- `POST /api/pair`: bridge専用Bearer認証。固定ownerのみ。一回限りコードを発行（5分）。ブラウザへ管理鍵を返さない。
- `POST /auth/exchange`: `{code}`。同一Origin。コードhashを消費して30日有効のSecure/HttpOnly/SameSite=Strict cookieを作る。接続/セッション各最大8件。
- `GET /api/operation`: cookieで本人確認。`operation,runs,health,serverTime,agentId,manifestSha256`。
- `POST /api/operation/start`: `{requestId:UUID,text:1..4000文字,intervalSeconds:60|300|900}`。稼働中の別開始409、同じID/内容は再送結果、古いIDは再開しない。初回は直ちにalarmを予約。
- `POST /api/operation/stop`: `{}` または開始応答不明時の `{cancelStartId:UUID}`。停止状態とalarm削除を同一transactionで保存。未到着の開始IDも使用済みとして記録し、停止後の遅延開始を拒否。古いalarmも停止状態なら処理しない。
- `POST /auth/logout`: `{}`。現在のcookieを失効。運用は明示停止まで継続。
- GETは実行を起動しない。フロントの5秒pollは表示用。次回時刻を超えても長時間更新がなければ「実行遅延・要確認」。
- DOの`state`キー: version,operation,runsのmetadata。`starts`キー: 開始ID→入力/間隔のSHA-256（最大1000）。`result:<運用ID>:<連番>`キー: 個別の結果（最新20件、古い本文を削除）。`auth`キー: 有効期限付きpair/session hash。各値を128KiB未満に収める。
- 各alarmは保存された次回時刻を検査。結果・連番・次回alarmをatomicに更新するので、再配信/再起動で同じ回を二重計上しない。

## 境界

本人用テスト環境。既存Sites公開範囲を拡張しない。クラウドの画面の枠以外（入力/履歴/操作）は認証必須。接続は現Macの本人用preview accountと固定hashを照合する。全ユーザー向けのaccount連携、任意Agentホスティング、外部業務/課金/Work台帳統合、72時間耐久は別工程。

根拠: [Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)・[transactional storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)。alarmはat-least-onceのため、外部副作用のあるAgentへこの整形処理を単純置換しない。

## 受入（2026-11-15）

専用Workerへ配備し、ローカルNoahからクラウドへ接続。Mac側hostを170秒停止した間に3回の実処理、Worker更新後の運用保持、同期間中のクラウド画面からの停止、停止後1分以上の新規0件を確認。関連45試験成功。物理的な蓋閉じと72時間耐久は未実施。[検証記録と残課題](../../codex/tasks/60-noah-cloud-operation.md)。
