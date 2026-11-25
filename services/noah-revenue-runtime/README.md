# 本人用Noah収益業務クラウド

商品設計・納品サンプル・提案書の順序管理をCloudflareのSQLite Durable Objectへ移す。ブラウザやMacの稼働に依存せず、alarmが次の担当を実行する。本文・成果は既存Work形式の`work_jobs`へ保存する。一般公開Noahアカウントとの同期は未実装。

配備前に対象アカウントがWorkers **Free**であることを確認する。OAuthの`default_usage_model: standard`だけでは無料プランの証拠にならない。Paidへの自動切替・契約変更は行わない。Freeの上限を超えると処理は失敗する。推論はAPIキー不要のPollinations匿名無料経路のみ。

## 本人接続

管理者のランダムな32byte以上の秘密を`NOAH_REVENUE_ADMIN`としてWorker secretへ保存する。リポジトリ・ログ・コマンド引数へ値を残さず、CLIの標準入力を使う。管理者秘密は利用者のパスワードや第三者APIキーではない。

`POST /admin/pair`（Bearer認証、空JSON）で5分・一回限りの`pairUrl`を発行し、本人携帯で開く。URL fragmentを同一Originの`POST /api/pair`へ交換し、Secure/HttpOnly/SameSite=Strictの30日cookieを設定する。接続後URLからキーを除去する。生成URLをチャットや共有ログに出さない。新端末・cookie削除・30日後は管理者から再接続が必要。

携帯はHTTPSの本人用ページで依頼入力、匿名無料送信への同意、開始、成果確認、停止を行う。ADB reverseは不要。停止は送信済み処理を取り消さず、次段を止める。新しい依頼は同じ携帯から開始できる。

## 上限と復旧

- 1日UTCで4回・12担当まで。総保存400依頼・1200Workで受付停止し、自動削除しない。
- 46秒以上の間隔。生成前の明示的FREE_LIMITだけ最大5試行・10分以内でalarm待機する。
- 送信中にプロセスが失われた場合、durableなsending記録を再送しない。needs-reviewで止める。
- 未承認の成果はreview。金額、実績、産地などの創作を防ぐ意味検証は未合格であり、商用利用前の本人確認が必要。
- Work成果には応答ID・使用量・無料経路の生成使用額0を保存する。クラウド契約料金や通信料を計測した値ではない。

## 検証・配備

`node --experimental-strip-types --test tests/noah-revenue-cloud.test.mjs`は認証・停止と遅延start・再送防止・無料拒否・日次上限、実workerdでのSQLite/alarmと永続再起動を検証する。外部推論はfixture。`wrangler deploy --dry-run --config services/noah-revenue-runtime/wrangler.jsonc`で配布を検査する。

無料プラン確認後、同じ設定でdeployしsecretを追加する。配備後に匿名アクセス拒否、携帯の一回接続、クラウドだけでの3担当完了と停止を実測して受入記録を残す。既存D1のmigrationは行わない。既存`noah-test-runtime`は変更しない。

現在: クラウド6試験（収益業務全体16試験）、型・lint・dry-run・全体verify通過。無料プラン確認待ち、未配備・実携帯クラウド受入未完了。管理者秘密はまだ生成・登録していない。

料金根拠: https://developers.cloudflare.com/durable-objects/platform/pricing/
