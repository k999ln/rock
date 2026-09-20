# RockstarOS 緊急アクセスとインシデント対応

状態: **分離Operator Dock、hardware署名付き命令、署名付き端末channel、制限付きAndroid Agentのsource／emulatorと試験署名Pixel、本番公開設定stagerを検証済み、production配備・登録・Device Owner実行は未完了**。この文書と`data/device-emergency-access-policy.json`は、緊急時に運営1名が本人のその場の操作を待たず保護を開始できる契約を固定する。試験署名APKや公開設定stagerの検証はproduction端末へ到達済みという意味ではない。

## 目的

紛失、盗難、悪意あるTool、アカウント侵害、偽更新、運営基盤侵害などが疑われるとき、認定された運営担当者が端末を早く保護・隔離・診断できるようにする。一方、常設root、任意shell、秘密鍵取得、利用者の私的内容閲覧、Wallet操作を保守機能として作らない。

## 想定する攻撃

| 攻撃面 | 起こり得ること | RockstarOS側の主な防御・初動 |
| --- | --- | --- |
| release／署名鍵 | 偽OTAや改変アプリを正規版に見せる | 役割別鍵、失効、配布停止、現在trustの再取得、影響releaseの隔離 |
| build／供給網 | build worker、依存、Sky Toolへ悪性処理を混入 | 固定source/hash、再現性照合、Tool隔離、署名と権限の別判定 |
| OTA／通信 | 更新serverや通信経路を偽装 | 端末側署名検証、期限付きmanifest、失敗時fail closed |
| downgrade | 既知脆弱性のある古いOSへ戻す | AVB rollback index、partition別version、復旧版の明示allowlist |
| Sky Tool／MCP | 過大権限、情報流出、外部変更、横展開 | package/UID/signature照合、capability allowlist、停止・失効、SELinux分離 |
| Zema／LLM | prompt injectionで送金、鍵変更、外部操作を誘発 | LLM単独承認禁止、危険操作のOS側確認、payload固定、一回承認 |
| アプリ／kernel | 権限昇格や別アプリのデータ読取り | app UID、SELinux enforcing、Verified Boot、patchと実機受入 |
| 物理／USB | ADB、解除bootloader、盗難端末から侵入 | ADB既定無効、locked bootloader、端末credential、紛失モード |
| account／backup | session、復旧コード、backupを盗む | hardware-backed Keystore、session失効、暗号化backup、復旧監査 |
| 運営基盤 | 管理serverまたは担当者資格情報から全端末を操作 | hardware-bound operator credential、端末側scope検査、短時間session、監査 |
| wipe／DoS | 不正初期化、更新停止、接続遮断 | 消去取消猶予、署名・期限・incident ID、A/B復旧、rate limit |
| radio／network | baseband、Wi-Fi、Bluetooth経由の侵入 | firmware更新、分離、不要interface停止、影響通信の隔離 |

## 運営1名で直ちに行えること

対象端末が事前登録済みで、運営担当者が専用hardware credentialを使い、端末が署名・期限・scope・端末IDを検証できる場合に限り、次を本人のその場の承認なしで開始できる。

- 端末のロックと紛失モード
- Sky／Zemaの新規実行停止と未使用承認の失効
- local実行の停止（外部account／connector session失効はproduction adapter待ち）
- OTA適用の一時停止
- 外部接続の隔離
- 個人内容を除外した診断の取得
- 最大15分の限定保守session

運営serverの判断だけでは実行しない。端末側serviceが許可済みcommand、署名、nonce、対象端末、発行時刻、失効時刻を検証し、再送と期限切れを拒否する。端末がofflineなら命令を即時実行できず、再接続後に有効期限内の命令だけを評価する。

端末確認機能は、汎用の画面閲覧プラグインではなく`dev.rock.operator.agent`のsanitized診断として実装した。OS版、security patch、battery状態、空き容量、Device Owner状態、固定packageのversionだけを最大2 KiBで返し、写真、会話、原稿、通知本文、画面、位置、camera／microphoneは取得しない。事前登録済みで、端末が起動し通信でき、端末側が許可scopeを検証できる場合だけ使えるため、「何かあれば必ず覗ける」仕組みではない。

プラグインは事故の診断補助であり、release署名鍵の復旧やboot不能端末の復旧には使わない。署名鍵は別場所の予備HSM、boot不能はUSB経由の純正full OTA／factory imageで復旧する。

## 運営にも渡さない権限

緊急modeは、任意shell／root shell、利用者の写真・会話・原稿等の閲覧、Wallet送金や承認、秘密鍵・session secretの抽出、マイク／カメラ起動、未署名codeの導入、Verified Boot／SELinuxの無効化を許可しない。LLM、Sky Tool、MCP、外部Providerから緊急modeを開始することも許可しない。

初期化要求は運営1名から出せるが、端末へ警告を表示し、最低30分の取消猶予を設け、端末が受領するまで取消可能にする。実際の盗難・侵害対応でこの時間が妥当かは実機演習で確認し、短縮には別の明示的な製品判断を要する。

## 監査と利用者への表示

開始時から終了まで運営ID、incident ID、理由、端末、command、結果、時刻を端末側と運営側の追記記録へ残す。保守中は端末に表示し、終了後は利用者へ実行内容を通知する。担当者自身は記録を削除できない。監査記録に利用者本文、認証情報、Wallet秘密を保存しない。

## 運営専用Operator Dock

管理面は利用者向けRockstarOSのrouteではなく、`services/operator-dock/`から別hostnameへ配備する。利用者向けOS Home、アプリ一覧、Web/PWA asset、API bundleへ管理画面や入口を含めない。Dockは登録端末、online／offline、hardware trust、緊急操作、命令状態、監査件数を表示し、事故IDと5文字以上の理由がなければcommandを発行できない。

Dock Workerはassetを含む全requestでCloudflare Accessの署名JWTを検証する。`CF_ACCESS_TEAM_DOMAIN`、Dock専用`CF_ACCESS_AUD`、単一`ROCK_OPERATOR_SUB`の全てが必要で、issuer、audience、期限、subject、RS256署名のいずれかが不一致ならfail closedにする。ヘッダーがあるだけでは信用しない。

Dock内の`/api/devices`は最大100端末・100命令・100監査eventのsnapshotと、許可済みcommandの発行・未受領commandの取消を扱う。発行は2段階で、serverが正確な端末、action、理由、有効時間をcanonical commandへ固定し、運営の登録済みWebAuthn hardware credentialが利用者確認付きでそのdigestへ署名する。credential ID、RP ID、origin、challenge、UP／UV flag、P-256署名、増加counterをWorkerが検証し、同じassertionの別命令への再利用を拒否する。管理serverだけでは端末が受理できる署名を作れない。

利用者Web D1とは別のOperator Dock専用D1へ`operator_managed_devices`、署名材料を含む`operator_device_commands`、使用済みcredential counter、`operator_audit_events`を保存する。監査tableはupdate/delete triggerで追記専用にする。公開鍵とcredential IDはsecretではないが、production値は配備環境で固定し、private keyはhardware credential外へ出さない。

管理面と端末側は別状態で表示する。現在の端末側表示は`source_emulator_and_test_signed_physical_verified_production_enrollment_pending`であり、production credential、端末StrongBox identity／attestation、Device Owner provisioning、専用hostnameとD1が揃うまでは`ready`にしない。UIも「開発検証済み・本番登録待ち」と表示し、実端末へ本番配信済みとは表示しない。

Agentはlauncherを持たない別UID／別SELinux domainで、Platform Broker、Sky、Zema、Local AI、Tool、WalletまたはbackupへのBinder edgeを持たない。DockへのPOSTは端末Keystore P-256鍵でcanonical requestを署名し、Dockは登録済み端末公開鍵、時刻、nonce、body digestを確認する。端末は保存されたWebAuthn assertionを独立再検証し、対象端末、credential、RP ID、origin、UP／UV flag、P-256署名、payload、発行時刻、開始時刻、失効時刻、単調増加counterを確認してからackする。端末側SQLiteはcommand replayを拒否し、Android Keystore HMAC chainとupdate／delete拒否triggerで監査を追記する。

停止操作には署名された解除操作を対で用意する。Sky／Zema package suspension、OTA延期、外部connector package隔離、15分保守表示、紛失modeは、それぞれ再開／解除／終了できる。外部Provider側session失効はまだ実装しておらず、該当commandはlocal実行を停止したうえで`REMOTE_SESSION_REVOCATION_PENDING`としてfail closedにする。factory resetは30分前の端末通知記録があり、Device Ownerで、release gateが有効な場合だけ実行可能だが、実機取消演習が終わるまでgateは`false`である。

## 実装・受入gate

Dock／Agent source、Android 15 emulatorの6試験、試験署名APKを入れたPixel 10の5試験は合格した。実機では署名命令、replay／counter拒否、端末identity署名と、Device Ownerでないfactory resetのfail-closedを確認した。[秘密とserialを含まない実機証拠](evidence/android-pixel-10-prefull-physical-20260916.json)。さらにrepo外の公開入力だけから静的product RROを作り、P-256、origin／RP、32-byte challenge、StrongBox必須、factory reset無効、symlink／改変拒否を9試験で確認した。StrongBox identityのaliasはchallengeへ結び、古いchallengeの鍵を再利用しない。[stager証拠](evidence/android-operator-overlay-stager-20260916.json)。ただし以下が揃うまで`dock_agent_source_emulator_test_signed_physical_and_overlay_stager_verified_production_enrollment_pending`を維持し、運営がproduction端末へアクセス可能とは表示しない。

1. production operator WebAuthn credentialをOTA、AVB、Agent APK署名鍵と分けたhardwareへ作り、公開trust anchorだけをrepo外入力からreview済みproduct overlayへstageする。
2. Pixel 10でAgentをDevice Ownerにし、StrongBox device identityとattestationを専用D1へ登録する。
3. 外部Providerのsession失効adapterを実装するか、1.0のcapabilityから明示除外する。
4. SELinux enforcingで許可操作、別app data、Binder、network、任意shellのnegative testを行う。
5. 管理server侵害、資格情報盗難、counter巻戻し、古いcommand、別端末宛、通信切断、監査改ざんを閉鎖試験する。
6. Pixel 10実機でロック、停止／再開、隔離／解除、診断、15分終了、初期化取消、A/B復旧を演習する。
7. 独立security reviewとincident recovery drillを完了する。

秘密値、private key、実端末ID、operator identityはGitへ保存しない。Gitには公開contract、公開鍵fingerprint、失効状態、試験証拠だけを保存する。

最初の静的overlayは`pixel-10-frankel-gl066-single-device-preview`専用で、fresh challengeをその一台・buildだけに使う。同じimageを複数端末へ配らない。二台目以降はDockが一回限りchallengeをruntimeで発行し、attestation検証後に登録するdynamic enrollmentを実装・受入してから扱う。
