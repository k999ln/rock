> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# MCP接続を再起動後も引き継ぐ — 2026-09-09

「用意された対応端末をタップして使い始める」体験には、OSだけでなく接続先の管理サービスも再起動できる必要がある。今回、所有試験サービスを購入者backendの任意機能として永続化した。既配布8点は固定し、現作業は新しい証拠へ保存する。

## 実装した境界

- 同じauthority・CA・port・consumer・aliasでBrokerと提供者の受領記録を再開する。欠損した保存履歴を新規状態として作り直さない。
- 送信後に応答が失われても、元の要求の結果を照合する。照合操作は非同期で、同じ処理を自動再送しない。
- 接続解除の世代と履歴を保持し、未払いでも有効な所有者は結果の取得と解除を続けられる。
- MCPだけが起動できないときもWallet・既存購入者サービスは利用可能。MCPの停止処理は依存先を順に終了し、終了に失敗した所有lockを早期解放しない。
- 明示的にMCPを含む保存設定と、署名付きrootfs内の接続先・consumer・設定原本のハッシュを照合する。backend設定が利用できないときも既存のoffline OS起動を保持する。
- HTTPの接続・TLS・ヘッダー・本文に共通期限を適用。所有試験サービスはOriginを拒否し、許可された2ツールの一覧を返す。

これはRock独自の受領記録契約に対応した所有loopback試験サービスである。公式仕様の調査（元snapshot内の参照。履歴資料は今回のGit対象外）のとおり、現アダプターはJSON応答のみで、一般のStreamable HTTP/SSE全面準拠や任意のMCP接続は未達である。OAuth、外部の売上、送金、実ATMは接続していない。

## 現在の証拠

Linux全体試験は2026-09-09 03:44:32–03:45:40 UTCに実行し、1,003件がPASS。root767、認証63、契約85、ATM40、購入者controller25、AI計算予算23で、skip・未処理警告なし、入力の前後ハッシュ一致。

- `artifacts/os/mcp-runtime-continuation/tests-linux-0349/test-summary.json`
- SHA256: `d4532fb6516543bfc5b4f3696da2f5d0d11e8eb1c1e1ed0cc2410e3f8cf14f08`

初期Mac焦点試験の2不一致は、照合が非同期であることと解除応答が`state`ではなく`event`を返す契約を試験側で正しく待つ/読むよう修正した。製品を弱める変更はしていない。その後Mac13件PASS＋Linux専用1件skip、上記Linuxでは14件すべてPASS。Macのloopback bindがsandboxに制限された別実行もあり、実通信に必要な権限で再実行した。

新イメージ、管理backendの別プロセスへの交換、actual native OSの再起動と永続結果は下記で確認した。固定runtimeと配布用起動ファイルは現在確認中であり、生成だけを実起動証拠としない。

## 残る条件

対応OSを事前に導入した端末の利用開始と、任意のBlackBerryへタップだけでOSを書き込むことは異なる。機種未定のため、正規の起動・書込・復旧経路とドライバー、実USBは未検証である。実ユーザーのWallet本人確認・月額同意、本番金融provider・ATM、外部MCP提供者、AI実行先、ToB精算、運営配信を元のMustから外さない。全Goalはactive。


## 04:22 UTCの実動作確定

新baseは03:50:17–03:52:04 UTCにビルドし、162 build/source入力は前後一致。freeze manifestは58898fcef63e22e58d2a945fe0dcf565c356c043c7137ab745c0ce5365869f68、99 host観測と119 embedded検査を含む。host側のruntime/authorityはイメージ内へ格納した機能ではなく、端末外管理サービスである。

管理プロセス検証は03:57:56–03:58:17 UTC。初回の実処理後に応答本文を故意に切断し、正常停止後の第2世代で元の結果をstatus照合した。第3世代はMCP提供側ポートを所有fixtureで占有し、MCP UNAVAILABLEでもWalletにアクセスできた。第4世代まで同じauthority・提供者記録・解除世代・Wallet7表を保持し、効果呼出しは総計1回。4子プロセスはexit0/STOPPED、全5ポート解放を検証した。原本 `service-process-0358/report.json` のSHAはf2a0b062f6c70b21c4134db7bf4ff63ca42921f636e411becab067ea9b02cdfd。95入力と前後一致。独立公開記録レビュー（元snapshot内の参照。履歴資料は今回のGit対象外）は再実行ではない。

新しい署名付きprofileをactual Mac launcherから起動し、OSの実画面を22枚確認した。利用開始一回tap→接続→試験用本文65byte→条件確認→明示送信→大文字の結果→管理backend139443から140253へ正常交換→結果照合→OS内reboot→一回更新→保存済みHub→同じ履歴/結果→解除→結果→OS内poweroff。ゲスト業務APIをhostから直接呼ばず、入力はネイティブpointerイベントのみ。親は検証プログラムexit0を観測し、detached QEMU自体のexitcodeは不明として記録した。二つの起動区間それぞれにhealth→UI停止→network停止→data unmount→reboot/powerdownの順序を要求する。

native原本 `native-0403/report.json` のSHAはb19b6e4063e3ffb8bbe463959a927fcee28a284d9856ad9a6478a8ff28a6ee37。処理keyはui-9d5c3648d9d5303d8380148660b6ff03、効果一件、Broker本文消去、接続closed、模擬Wallet前後一致、userdata正常。base rootfs8551b2c8ca29c620cce1106406bfca296715c49c223974fca598dcc2ab8ba8a1、実起動profile rootfs5ba22d750694363dca7894dc6e3705f6dcc0d9ef46c71417bf0ec8117621da0fを混同しない。

Wallet登録、認証器enroll、月額同意、模擬入金5000・控除888は、観測前にこの新authorityへ明示したhost側公開fixtureで準備した。今回のnative Wallet登録/本人同意や実送金を証明しない。再起動直後には確認待ち表示があり、一回更新して保存済み状態を表示した。このUX改善は残る。
