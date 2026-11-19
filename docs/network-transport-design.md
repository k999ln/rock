# RockstarOS 通信・ネットワーク共通設計

2026-10-20の利用者指示。主担当は Native / QEMU / Release（`NET01`、`ROCK`）。Android／Pixel、Web、Mini／Pro、管理Linuxの通信adapterは同じ状態契約を実装し、実機・回線・Providerの受入はそれぞれ分ける。標準商品は既存OSへ接続するRockstarOSサービスであり、eSIM利用権と実際の通信路は独立する。Sky／Eveのjob、Broker承認、費用上限と既存成果は通信状態で書き換えない。

## 目的と利用体験

本人は端末または管理Linuxがどこで切断されたか、仕事が進行中・待機中・結果不明のどれか、次にいつ再照合するかをEveで確認できる。Wi-Fi、携帯回線、有線、受入済み衛星回線の切替後も同じjob ID／revisionへ戻り、承認済み予算を超える再実行を起こさない。通話対応製品では帯域低下と切断復帰を相手への到達状態と分けて表示する。

## 責任と入出力

- `ROCK`: OSの接続状態収集、経路選択、宛先・VPN policy、timeout／再照合、差分同期、job／通知の順序と費用表示。任意Toolへraw socket、shell、rootやOS platform鍵を渡さない。
- `EXTERNAL`: OS／modem／carrier／衛星／DNS／TLS／VPN／通話／Cloud Providerの実通信、証明書、帯域と計量明細。
- `JOINT`: exact端末・回線・契約・Linux実行先で経路切替、外部到達、通話、料金明細、DNS／TLS監視を実測して照合する。
- `OWNER`: 回線・VPN・外部送信先・費用上限・有料の衛星／通話契約を選び、必要な本人承認をする。

入力は`ownerId`、`deviceId`、`jobId`、`revision`、許可済みorigin／scope、端末とLinuxの別々のnetwork observation、経路capability、VPN policy、期限、費用上限、直近のserver cursor。出力は通信面ごとの状態、採用経路、観測時刻、遅延／制限の理由、再照合時刻、進捗cursor、確定済みusageと推定通信量を区別した表示である。資格情報と本文をdiagnosticへ残さない。

## 通信面と状態

| 面 | 観測と意味 | 切断時 |
| --- | --- | --- |
| 端末 | link、IP取得、DNS、Rockstar HTTPS endpoint到達、VPN制約 | 端末UIは保存済み状態を表示し、外部操作は送らない |
| 管理Linux | executorのlink、DNS、Provider endpoint到達、queue／worker health | 導入済みmodelの許可済み自己完結処理のみ継続。外部作用は待機／照合 |
| Provider | API、通知、通話signaling／mediaの別到達 | 結果不明を失敗扱いにしない |

各面は`unknown → probing → online | degraded | constrained | offline`を時刻・原因付きで保持する。`degraded`は高遅延／低速、`constrained`はデータ制限・metered・衛星等の制約を示す。OSが示すlink成立だけでRockstar endpoint到達やjob成功を宣言しない。端末断でも管理Linuxがonlineなら、本人が事前に認めた期限・権限・予算内の受領済みjobだけ継続できる。逆にLinux断は端末onlineでも実行不能と表示する。

## 下位通信と保護

端末adapterはOSのIP割当・route・DNS resolverとTCP／UDP stackを使い、IPv4／IPv6、アドレス更新、DNS失敗、TCP connect／read、UDP到達の診断を分ける。Rockstar画面とAPIはHTTPS／TLSを必須にし、hostnameと証明書の検証失敗時は接続を拒否する。HTTPへの自動降格や証明書例外を通常経路にしない。DNS回答とTLS成功は別の観測であり、DNSだけで正しいサービス接続と判定しない。

経路はOSが提供するWi-Fi、携帯回線、有線から、能力・本人policy・費用・到達性に基づき選ぶ。衛星は対応機器、地域、通信事業者契約、許可されたapp traffic、実測帯域が揃った場合だけ候補にする。切替では同じTLS sessionの存続を仮定せず、新経路で再認証・cursor照合する。VPN必須のjobはVPN断、DNS leak、split-tunnel逸脱時にfail closedとし、本人が許可した経路以外へ自動切替しない。

時刻はOSの信頼できる同期源と署名済みserver時刻などを照合し、端末時刻の大きなずれをTLS、token、receipt期限の異常として表示する。時刻不明で証明書・承認期限の検証を省略しない。公開ドメイン`avoado.si`、`avocadomini.si`、`avocadopro.si`について、DNS回答、TLS証明書の対象／期限、HTTPSの到達と実配備のreadbackを別々に監視する。これらの監視仕様をもって公開済みとはしない。

## 再接続、通知、進捗

要求ごとにconnect／read／総期限を設定し、通信失敗は上限付き指数バックオフとjitterで再試行する。回線切替やforeground復帰は待機を早めてもよいが、同時再試行の集中を抑える。GETや明示的に冪等な読取りだけを自動再送する。変更系APIは永続化したidempotency keyとserverのreadback／Provider referenceが揃う場合に限り同じkeyで再照合する。送信直後の切断、timeout、5xxは`uncertain`として保持し、別keyで再実行しない。

通知は`ownerId + jobId + eventId`で重複排除し、server revision／単調cursorで遅延・順序逆転を照合する。古い通知で新しい状態を巻き戻さず、gapを検出したらcursor以降の差分を取得する。リアルタイム進捗は認証済みSSE／WebSocket等の採用経路で配信し、再接続時は保存済みcursorから差分取得、cursor失効時は権限付きsnapshotとrevisionを照合する。Push通知は再取得のきっかけであり成功証拠にはしない。stop、予算、利用権失効は再接続後のdispatch前に必ず再評価する。

## 通話・通信量・費用

音声・映像を扱う対応製品はsignaling、media、相手の受信確認を別状態にする。実装する場合はProvider／OSが受け入れた安全な通話stackを使い、帯域・遅延・損失に応じた品質調整、再接続、終了理由を記録する。通話中の再接続を相手への連続到達とみなさない。Miniの衛星データ、通話、SOSは別gateであり、衛星経由の通常音声や緊急通話を推定しない。

送受信byte、経路、metered flag、job／Provider API request IDと推定通信費を記録する。外部APIの確定usage／単価版／請求明細はProvider receiptと照合し、端末byte計測から料金を確定しない。通信料、Rockstarサービス料、AI使用料、外部実費を別に表示する。有料経路への切替や追加API呼出しが承認済み上限を超えるなら止めて再承認を求める。

## 保存、失敗、復旧、受入

owner別にnetwork observation、最終cursor、再照合待ちのrequest ID／idempotency key、失効／停止、通信量と費用receiptへの参照を保存する。機密payload、VPN secret、資格情報は共通diagnosticへ置かず、保存期間と削除は既存のowner data policyに従う。再起動後は状態を`unknown`から再観測し、未確定送信をserver／Providerへ照合してから次へ進む。

`NET01`の設計合格はこの契約をOS／端末／Linux adapter、Sky／Eve表示、テストfixtureへ落とすこと。実装合格は同一jobでIP／DNS／TCP／UDP／HTTPS、Wi-Fi↔携帯↔有線切替、端末だけの断、Linuxだけの断、低速／高遅延／制限、timeout／重複／順序逆転／cursor gap、VPN leak、時計ずれ、費用上限を再現し、二重外部作用・二重計上・予算超過がゼロであること。衛星、通話、実料金、公開ドメイン監視は対応する実機／Provider／配備条件で別に受け入れる。既存QEMU／APK／host fixtureの成功をそれらの実受入へ転用しない。

採用する通話Provider、衛星回線、VPN方式、DNS／時刻源、timeout値、監視閾値、通信費単価は実測・契約・脅威分析で決める。BGPは通常carrier／network operatorの基盤で、Rockstarアプリの共通機能に含めない。FTPは標準成果転送方式に採用せず、認証・暗号化・権限・receiptのある既存成果APIを使う。
