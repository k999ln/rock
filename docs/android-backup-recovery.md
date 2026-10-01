# RockstarOS Androidバックアップ・全損復元

対象はPixel 10 / `frankel` / GL066で開始するが、formatはRockstarOS共通とする。機械可読正本は`data/android-backup-recovery-policy.json`、暗号envelopeの実装は`android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java`。

## 固定した方式

バックアップごとに256-bitのdata encryption key（DEK）を新規生成し、payloadをAES-256-GCMで暗号化する。同じDEKを次の2経路で別々にwrapする。

1. 非exportable・hardware-backed Android Keystore鍵。同じ端末での日常復元に使う。
2. 所有者だけが保管する256-bit recovery secret。初期設定画面ではchecksum付き24単語として表示し、端末初期化または交換後の復元に使う。

recovery secretは短いパスワードから作らない。backupごとの256-bit saltと、format・ownerを含むdomain separationを使い、HKDF-SHA-256でAES-256 recovery wrapping keyを導出する。payload、端末wrap、owner wrapにはそれぞれ異なる12-byte nonceと128-bit tagを使う。owner identityのSHA-256、作成時刻、salt、全nonce、全長を認証対象に含める。平文上限は4 MiB、末尾の余分なbyteは拒否する。

24単語はWallet seedではない。Walletへ取り込ませず、Walletのseed phraseもこのbackupへ含めない。

## 所有者の保管と復元

- recovery phraseは端末内で生成し、network、Git、運営サーバーへ送らない。
- 初期設定では指定された単語を再入力してから有効化する。
- 紙または専用offline媒体へ2部保存し、backup fileとは別の2か所に置く。
- 暗号化backup file自体はUSB、PC、利用者が選んだcloudへ置ける。
- 旧端末でphraseを失った場合、端末が動く間に新phraseを生成し、現在の全backupを再出力する。
- 新端末では24単語で復号し、外部接続と失効済み承認を再有効化せず、新しいKeystore鍵へ結び直す。
- 元Keystoreと24単語の両方を失った場合は復元不能。運営用の万能復号鍵は作らない。

Operator Dockは利用者が明示的に開始した診断・復旧操作を支援できるが、backupを単独で復号できない。緊急端末管理と所有者dataの復号権限を同じcredentialにしない。

## 復元対象

allowlist方式とし、SkyのTool構成・選択、Zemaのworkflow／job状態／進捗／結果、ローカル設定、継続に必要な非secret receiptとreplay indexを対象にする。

次は除外する。

- Wallet private keyとseed phrase
- login password、session cookie、refresh token
- 運営credentialと緊急access credential
- AVB／OTA／APK／APEX／HSM署名secret
- 復元後に再認可すべきprovider secret

## 互換移行

旧`rockstar-platform-backup/1`は元端末のKeystore鍵がある場合だけ読める。v2有効化後は新規v1 backupを禁止する。既存v1は元端末上で一度復号し、v2へ再出力する。v1をKeystore喪失復旧可能と表示しない。

## 現在の実装境界と合格条件

dual-wrapped v2 envelope、owner binding、legacy読取、wrong key／wrong owner／header・payload改ざん／末尾byte拒否に加え、RockstarOS専用24単語codec、指定4単語の確認UI、Shell API v4のexport／import、allowlist方式のtransactional restore、新端末Keystoreへの再bindingまで実装した。Java 11 Coreは37/37、Android 15 emulatorはBroker 11件（物理再起動専用2件を条件skip）とShell 5/5に合格した。[秘密を含まないemulator証拠](evidence/android-backup-v2-emulator-20260916.json)を保存している。

2026-09-16に、OSを書き換えていない所有Pixel 10でv2 backupを実ファイルへexportし、書込み完了の同期確認、device wrapとrecovery secretのhardware-backed Keystore確認まで合格した。続いて同じ端末を通常再起動し、Skyで選んだTool、実行中だった仕事、履歴とreview状態を復旧し、中断工程をattempt 2として再取得して完了できた。Shell 5件、Broker／Tool／Local AI／Wallet 11件、Operator Agent 5件、再起動2段階の計23件が合格した。[秘密とserialを含まない実機証拠](evidence/android-pixel-10-prefull-physical-20260916.json)を保存している。

復元先は対象ownerの仕事・選択・承認・台帳が空でなければ拒否する。復元後は自動化を必ず一時停止し、Sky selection tokenを新規生成し、実行中leaseを破棄し、`PROPOSED`／`ISSUED`承認を`STOPPED`へ変換する。導入済みcomponentの権限、session、operator credential、provider secretは復元しない。これによりbackup単体を別端末の実行権限cloneとして使えない。

未完了なのは、物理Pixel 10のdataとKeystoreを実際に消去し、24単語だけで復元、新Keystoreで再export、再起動後も停止状態とdataを確認する試験である。今回の実ファイルexportと非破壊の再起動復旧はこの前段だけを合格させたもので、Keystore喪失後の物理gateの代用にはしない。

したがって初回flash gateは未合格のまま。合格には同じrelease候補で次をすべて実測する。

1. 合格済み: 物理端末で24単語を生成・確認し、v2 backupを実ファイルへexportして同期完了を確認する。
2. 元dataとKeystoreを消去した新規profileを作る。
3. 24単語だけで復号し、allowlist dataをtransactionalに復元する。
4. wrong phrase、別owner、改ざん、unsupported formatを拒否する。
5. 新Keystoreで再backupし、再起動後に復元結果とinactiveな旧承認を確認する。
6. secretを含まない実施記録をhash付き証拠として保存する。
