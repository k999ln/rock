# avocadoOS 初回flash前の固定ゲート

対象は所有済み Google Pixel 10 / `frankel` / GL066。正本は
`data/android-first-flash-gate.json`。4項目がすべて合格するまで、初回flash、unlock後の書込み、`flashReady=true` を禁止する。

このゲートはfull buildの成否とは別である。buildに成功しても、署名・rollback・純正復旧・Keystore喪失復元が揃わなければ実機へ書き込まない。

## 1. 正式署名鍵と鍵紛失・更新・失効

Gitへ保存するのは公開鍵fingerprint、key set ID、保管方式、手順書、試験証拠だけ。秘密鍵、seed、復元secretは保存しない。

保管方式は、**専用オフライン署名PC＋YubiHSM 2本番1台＋別場所に封印する予備1台＋別端末での独立検証**に決定した。鍵は最低でもAVB、OTA、system application、APEX system componentの4系統に分ける。二人承認は必須にせず、認定された運営者1名で復旧可能にする。生のprivate keyはHSM外へ出さず、予備への移行は暗号化wrapped backupだけを使う。詳細と未完了条件は`docs/android-production-signing-custody.md`を正本とする。

更新・失効は、AVB／platform／APEXを長期・事故駆動、通常system app鍵を24か月目安、旧新鍵を最低1 release段階移行、漏洩鍵は即時署名停止・再使用禁止とする。役割ごとのAndroid対応と復旧を実証するまで旧鍵を退役させない。

合格条件:

- Android用のAVB、OTA、APK/APEX署名鍵を開発testkeyから分離する。
- AVB公開鍵とOTA公開鍵のSHA-256を固定する。
- 本番HSMと予備HSMの物理的な保管場所を定め、同時に失われない構成にする。
- 鍵紛失時の署名停止、影響release一覧、失効情報の公開、replacement key登録を手順化する。
- 更新時に旧鍵と新鍵をどの版・期間で信用するかを決める。
- dummy候補で署名、検証、旧鍵拒否、新鍵受入、失効鍵拒否を実測する。

鍵が失われた時に既存端末を更新できなくなる構成は、紛失手順が完成したとは扱わない。緊急時に公開testkeyへ戻す経路は作らない。

## 2. rollback indexの運用

rollback indexは単なるversion名ではなく、端末に保存される単調増加値として管理する。最終値はtarget-filesとAVB metadataを生成した後に固定する。

採番方式は、avocadoOS管理locationに署名前固定の正式release UTC Unix秒を使い、直前のproduction releaseより必ず増加させる。Google管理部分は純正値を維持する。A/B端末内のstored indexはtrial slotから進めず、新slotが`SUCCESSFUL`になった後だけ確定する。詳細は`docs/android-rollback-index-policy.md`を正本とする。

合格条件:

- 使用するrollback index locationと各値を同一buildの証拠として保存する。
- 通常updateで値を下げない規則と、どのreleaseで増加させるかを文書化する。
- downgrade要求は署名が正しくても拒否する。
- A/B update失敗時は、rollback indexを破らずに前slotへ戻れる組合せだけを公開する。
- Google側anti-rollbackに反する古いAndroid 16 bootloaderをflashしない。
- upgrade成功と、古いindexを持つdummy imageの拒否を同じ端末系統で確認する。

data救出のために古いbootloaderへ下げる運用は作らない。復旧は対応する現行full OTAまたはfactory imageを使う。

## 3. Google純正factory image／full OTA

Google利用条件を本人が確認した後、`frankel`に対応するfactory imageとfull OTAの実ファイルを取得する。URLやページ名だけでは合格にしない。

選定は、avocadoOS firmware baselineのfreeze時点におけるGoogle公式最新安定版とし、factory imageとfull OTAを必ず同一buildで揃える。full OTAは非wipe復旧と両slot boot可能化、factory imageはwipeを伴う最終復旧に使う。詳細は`docs/android-google-stock-recovery.md`を正本とする。

合格条件:

- 実ファイル名、byte数、SHA-256をそれぞれ固定する。
- 対象がPixel 10 / `frankel` / GL066の現在のboot chainと整合することを確認する。
- 危険な書込み前にmatching full OTAで両slotを起動可能にする。
- full OTAによる非wipe復旧と、factory imageによるwipe復旧の用途を分ける。
- 復旧後のboot、再lock可否、端末警告状態を記録する。

巨大なGoogle配布物そのものをGitへ入れない。GitにはidentityとSHA-256を含む小さな証拠だけを保存する。

## 4. dataとKeystoreを失っても復元できるbackup

旧 `rockstar-platform-backup/1` は非exportable Android Keystore鍵を要求する。同じ端末での日常復元には使えるが、端末dataとKeystoreを同時に失った場合の災害復旧にはならない。

初回flash前に、backupのdata encryption keyを少なくとも次の2経路で復号できるformatへ更新する。

1. 端末Keystoreでwrapした日常復元用経路
2. 端末外で保管するowner recovery要素でwrapした災害復旧用経路

方式は `avocadoos-recoverable-backup/2` に固定した。backupごとに新しい256-bit DEKでpayloadをAES-256-GCM暗号化し、同じDEKをhardware-backed Keystore鍵と、所有者だけの256-bit recovery secretの2経路でwrapする。recovery secretはchecksum付き24単語で提示し、HKDF-SHA-256、backupごとの256-bit salt、format／owner domain separationを使う。短いpasswordだけの復元、運営の万能復号鍵、server escrowは禁止する。詳細は`docs/android-backup-recovery.md`を正本とする。

coreのdual-wrapped envelopeは実装済みだが、24単語codec／確認UI、transactional import、新端末Keystore再binding、Pixel全消去後の実復元は未完了である。生のWallet秘密鍵やseed phraseをbackupへ含めない。復元要素そのものを運営サーバーやGitへ保存しない。

合格条件:

- versioned backup envelope、KDFまたはkey wrapping方式、salt/nonce、認証範囲、上限サイズを固定する。
- 端末初期化後、旧Keystoreが存在しない状態で新規端末profileへ復元する。
- 誤ったrecovery要素、改ざん、古いformat、別ownerを拒否する。
- 復元対象と除外対象を固定する。Wallet秘密鍵、ログインtoken、運営credentialは含めない。
- recovery要素を1つ失った場合の再発行・再backup手順を試す。

## 現在の判定

4項目すべて未合格。1番は保管アーキテクチャ、YubiHSM 2、4鍵系統、更新・失効ルールまで決定済みで、機材調達・署名bridge・予備切替・旧新鍵移行試験が未完了。2番は運用規則だけ決定済みで、正確なlocation/valueと実機試験が未完了。3番は純正復旧セットの選定規則だけ決定済みで、利用条件同意・実ファイル・hashが未完了。4番は方式固定とcore envelope実装まで進んだが、利用者UI、実data import、新Keystore再binding、物理端末の全損復元試験が必要。

実施順:

1. YubiHSM 2を調達し、全署名経路と予備切替を実測して、公開fingerprintと紛失・rotation手順を作る。
2. 決定済みrollback規則に従い、full buildのtarget-filesから正確なlocation/valueを固定してA/B実機試験を行う。
3. Google純正2ファイルを取得しSHA-256を固定する。
4. 24単語UI、transactional import、新Keystore再bindingを実装し、決定済みdual-wrapped formatでwipe後の復元試験を通す。
5. 4/4のhashed evidenceが揃った時だけ正本の `passed` をtrueにする。
