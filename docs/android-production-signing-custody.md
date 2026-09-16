# avocadoOS Android正式署名鍵の保管方針

決定日: 2026-09-16
状態: **構成・機種・4鍵系統・手順hash固定済み／調達・全署名経路の実測は未完了**

機械可読の正本は`data/android-signing-custody-policy.json`。秘密鍵、HSM認証情報、wrap key、復元要素はGitへ保存しない。

## 固定した構成

- 専用のオフライン署名PCを使う。
- 秘密鍵はローカル物理HSM内で生成・使用し、平文で取り出さない。
- 本番HSM 1台と、別の場所に封印して保管する予備HSM 1台を持つ。
- 機種はYubico `YubiHSM 2`、合計2台に固定する。
- 予備への移行はHSMの暗号化されたwrapped backupだけで行う。
- 署名PCとは別の端末で、公開鍵fingerprint、署名、artifact SHA-256を検証する。
- 二人承認は必須にせず、認定された運営者1名で緊急復旧できる構成にする。
- Cloud KMSだけを唯一のrootにはせず、通信、クラウド契約、外部accountがなくても正式署名を維持できるようにする。

AVB、OTA、APK、APEXの全てを1本の鍵にまとめない。最低でも次の4系統へ分離し、最終target-filesから実際の署名対象と個別鍵を列挙する。

1. OS起動用のAVB鍵
2. OTA更新用のpackage／payload鍵
3. system application用のplatform／application鍵群
4. APEX system component用のpayload／container鍵群

「4系統」は秘密鍵が4本だけという意味ではない。system appやAPEX moduleごとに必要な個別鍵は、最終target-filesのinventoryに従って追加する。運営の端末診断credentialは全release keyから完全に分ける。

## 更新・失効ルール

- AVB root、platform identity、APEX payload/containerは長期鍵とし、日付だけを理由に交換しない。漏洩の疑い、暗号方式の移行、検証済みplatform trust移行時に更新する。
- OTA鍵は事故または移行が必要な場合に、旧鍵と新鍵の段階的な信頼期間を設けて更新する。
- platform identityと分離できる通常のsystem application鍵は24か月を更新目安とし、対応するAPKではproof-of-rotationを使う。
- 先行する移行releaseで旧鍵と新鍵の信頼関係を導入し、最低1 release後に新鍵だけの署名へ切り替える。ただし、役割ごとのAndroid実装、実機更新、復旧経路を先に実証する。
- 旧鍵の使用停止によって未更新端末を永久に更新不能にしてはならない。新鍵の受入と復旧を確認するまで旧鍵を退役させない。
- 漏洩または漏洩の疑いがある場合は、その鍵による署名を直ちに停止し、fingerprintと影響releaseを公開する。漏洩鍵は再び署名へ使わず、新しい鍵素材で移行する。
- APEXはpayload鍵とcontainer鍵の片方だけを無計画に交換しない。platform署名権限や旧shared identityを使うsystem appは、署名lineageだけで安全と仮定せず回帰試験を必須にする。

この規則は運用方針の決定であり、鍵更新済みという証拠ではない。AVB、OTA、APK、APEXそれぞれで旧鍵受入、新鍵受入、旧鍵拒否、rollback、復旧を実測するまで初回flash gateはblockedのままにする。

## 合格前に必要な実測

物理HSMを使えば自動的に初回flash gateへ合格するわけではない。次を同じ候補で完走する。

1. YubiHSM 2が必要なRSA algorithm、padding、鍵数、監査、wrapped backupを満たすことを確認する。
2. AVB external signing helperを実装し、各partition imageを署名・検証する。
3. A/B OTA payload signerとOTA package署名を接続し、更新を受理できることを確認する。
4. APKとAPEXのpayload/container署名をHSMへ接続する。stock releasetoolsが秘密鍵fileを要求する経路を残さない。
5. 本番HSMを使用不能にした演習で、別場所の予備HSMから同じ公開鍵identityの署名を再開する。
6. 別端末で署名、certificate chain、AVB metadata、artifact SHA-256を独立検証する。
7. 役割別に旧鍵・新鍵の移行候補を作り、移行前後の受入・拒否・復旧を確認する。

機種や接続プログラムがこの全経路を通らない場合は、HSMを購入済みでも正式方式として採用しない。公開testkeyへの緊急fallbackは作らない。

## 端末診断との分離

運営用の端末確認プラグインまたはAndroid診断agentは、事前登録された端末が起動し、必要な通信路が使える場合の事故対応を助ける。端末ロック、Sky／Zema停止、接続隔離、個人内容を除いた診断などに限定する。

この経路では、失ったrelease keyの復元、秘密鍵の抽出、任意shell、Verified Boot回避、起動不能端末の修復はできない。署名鍵の復旧は予備HSM、端末のboot不能復旧はGoogle純正full OTA／factory imageとUSB手順で行う。

## 現在の未完了

- YubiHSM 2本番・予備の2台が未調達
- HSM signing bridge未実装
- 予備HSM切替演習未実施
- 役割別の鍵rotation／revocation演習未実施
- Pixel 10で署名済みOS／OTA未検証

したがって`production-signing-key-lifecycle`は引き続きblockedであり、初回unlock／flashは禁止する。

## build入力への手順固定

`scripts/freeze-phone-build-inputs.py signing-plan`は、このpolicyと本文の実byte SHA-256、4つの役割class、秘密鍵export禁止をbuild証拠へ保存する。秘密鍵、HSM認証情報、仮のfingerprintは生成・読取りしない。出力は`hsmProvisioned=false`、`signingBridgesVerified=false`、`productionSigningReady=false`を明示し、手順を固定したことと正式署名可能であることを分ける。最終target-files生成後にAPK／APEXを含む正確なkey inventoryを追加するまで、この状態をproduction署名完了へ昇格させない。
