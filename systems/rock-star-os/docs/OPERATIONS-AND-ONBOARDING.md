> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 運営管理と端末導入 — 最初の実装範囲

2026-09-08。運営が更新内容・対象・承認・観測結果を同じ記録で扱い、利用者には端末の実際の対応状況に応じた短い開始手順を返す。今回の実装はローカルの永続plan/承認/段階配布状態機械、導入planner、検証済みpreinstall端末向け永続activationとOS接続adapterである。新しい運営サーバー、実機書込み、配信、署名鍵生成、遠隔操作、実送金は行わない。JSONの「承認済み」や画面のボタンを実機導入成功の証拠にはしない。

## 既に実証した更新基盤

購入者stage0 5boot（元snapshot内の参照。履歴資料は今回のGit対象外）では新私有profileのA1→B2正常更新→service-only設定欠損A3を2回拒否→B2自然rollbackを実ARM64仮想OSで確認した。ローカルclosed binding、Tool/Wallet/cache/認証/個人ファイル履歴を停止後に照合した。運営planはこの署名envelope、対象画像hash、既存profile binding、健康判定の関係を維持する。実証済み対象はQEMU ARM64だけで、BlackBerryの型番・variantを同じ対応済み一覧へ加えない。

## 運営の役割と状態

`os/operations/store.py` の `OperationsStore` は保護されたSQLiteにplan、承認者、device assignment、観測、request receipt、auditを保存する。認証adapterはJSON外のcontextを現在の主体へ解決し、操作別の権限を毎回検査する。既定は全拒否。adapterが認証した主体名だけを受け取り、requestのrole/actorフィールドで昇格できない。これは本番SSO/機器証明書の実装ではない。テストは明示fixture adapterを使う。

| 操作・役割 | 契約 |
| --- | --- |
| planner / plan作成 | 既存の公開fixture署名を実検証し、対象機種・新release・既存image・protected binding・historyのhashを不変planへ固定する。期限とcanary集合も変更不可 |
| release approver | 作成者とは別の認証主体がplan hashそのものを承認する。承認後にpayloadを差し替えない |
| operator | 承認済みcanary開始、全canaryの健康報告後だけ明示promotion、hold、回復要求。revisionを一致させて競合を拒否する |
| device reporter | adapterが許可したdeviceだけをclaim/reportする。割当はdevice/planごと一件。通信不明はUNKNOWNを保持し、新keyで別割当を発生させない |
| auditor | 要約・append-only auditの読取り。shell実行、任意パス読取り、Wallet残高/credential/PIN/tokenの採取機能は持たない |

状態はDRAFT→APPROVED→CANARY→ROLLOUT→COMPLETE。失敗・復帰報告はHELDとして次の新規割当を止める。運営のholdは通信中の操作を取り消せた意味ではない。UNKNOWNは期限切れ/hold/再起動の後も照合できる。RECOVERY_REQUESTEDも回復完了ではなく、新規配布を止めた依頼の記録である。端末側の実行adapterは今回未接続なので、返すassignmentは `execution_authorized:false` を明記する。

receiptは操作・主体・完全payloadと結び、同key同bodyを再取得できる。同key別body/別主体を拒否し、権限取消後は保存済みreceiptにも認証を再要求する。状態遷移・receipt・auditは同じSQLite writer transactionでcommitする。terminal device observationは変更不可。clockが保存済みhigh-waterより戻った場合、新規配布/承認は拒否するが、hold・回復・既存UNKNOWN照合・読取りは維持する。

署名権限と配布承認は別である。この版の署名器は既存public RFC8032 fixtureだけであり、運営の承認から新しい署名を生成しない。既に確定したrelease counterを下げる「rollback配信」は拒否する。未確定trialの回復は既存stage0の仕事である。確定済み不良版を元の内容へ戻す場合は、現在のfloorを超えるcounterを持つ新たな署名済み回復releaseと別planが必要になる。

## 導入を短くするための正確な分岐

`os/operations/onboarding.py` の `OnboardingPlanner` は実行を伴わないplannerである。機種能力のcatalogとdevice observationは信頼済み検査adapterから渡す前提で、利用者がJSONのbooleanを書くだけでは検査・OEM承認・hardware attestationの代わりにならない。標準catalogは実証した仮想機種だけを含む。将来の実機追加には正確な型番/variant、boot chain、driver、署名、更新/復旧の証拠とOEMの許可された導入経路を登録する。

| 観測した状態 | 返す案内 |
| --- | --- |
| 対応機種に正しいOSがpreinstall済みで、署名済みimage・local health・protected bindingが一致 | 「使い始める」のactivation手順。これは既存OSのactivationで、新しいOSを書き込んだ意味ではない |
| 対応機種でOEM許可済みの正式経路、または既にunlockedで検証済み導入経路がある | 画像・機種・data保全・必要な別承認を確認できるinstall plan。現段階では実行しない |
| lockedで許可経路なし、型番不明/未対応、観測未検証、異なる既存binding | 具体的な停止理由と必要な確認項目。shortcut、Web app、Mac launcherをOS導入として返さない |

設定引継ぎはauthority/owner/deviceと既存receiptを維持する。Walletの登録、Wallet利用規約、月額8.88 USD継続同意はそれぞれ別操作で、端末activationや更新の承認から自動実行しない。既存dataへのアクセスと回復に月額PAIDを要求しない。

## 永続activationと端末画面の接続

`ActivationStore` はprivate directory0700、SQLite/marker0600に一件のactivationを保存する。本人確認の引継ぎreference、初回image/profile hash、初回時刻は変更しない。保存とrequest receiptは原子的で、commit前の中断なら同keyで再実行、commit後の応答喪失なら元receiptを返す。新keyによる再タップも別activationを増やさない。現在資格の失効や異なる本人referenceでは元receiptの再取得も拒否し、保存履歴を消さない。署名付きの新しいreleaseへの更新は同じprotected bindingのactivationを引き継ぐ。観測済みrelease counterを下げた起動は拒否する。

`os/operations/device.py` はOS内の信頼境界である。root-owned0444の購入者configと.required、UID1002-owned0600の永続binding、現在boot IDと一致するroot-owned0444のboot facts、同じauthority/consumer/deviceに結び付いたWallet応答の現在購入資格を照合する。symlink・不正mode・過大/重複JSON・署名/image/hash不一致は拒否する。本人referenceは認証済みservice scopeのopaque digestであり、KYC原本や元の本人確認eventそのものではない。既存公開fixture以外の本人認証・鍵保管・実機attestationを追加したとはしない。

root helperは実stage0の署名済みslot、mounted root、release floor、`rock-boot-good.json`、data mount policyを検査して `/run/rock-activation-boot.json` を作る。S97が実際にmark-goodした後だけ呼ぶ。direct-kernel起動にはこの証拠がないためactivationはUNAVAILABLEとなる。helperの失敗はactivationを停止し、基本OS/local Toolを停止させない。boot healthにネット疎通や月額PAIDは要求しない。

Platform APIはLinux peer UID1000だけを受け付ける。

```json
{"v":1,"op":"device.activation.snapshot"}
{"v":1,"op":"device.activation.activate","key":"同じ要求を照合するキー"}
```

通常snapshotの `device_activation` と専用snapshotには `state`、`can_activate`、`recovery_required`、固定reason/labelを返す。activate成功には要求と同じ `request_key` と不変 `receipt` を別フィールドで返す。成功時はACTIVE/can_activate=false/recovery_required=false。Wallet登録・Wallet規約・月額同意・OS書込みの4副作用flagは全てfalseである。UIからdevice、authority、本人証拠、role、保存pathを指定できない。activationはサービスのauthority grantではなく、別のadmissionやWallet認証を迂回しない。

購入者profileの実起動は `os/platform/wallet_view.py` の単一workerでWallet表示を2秒ごとに読む。通常snapshotはdetached cacheを即時取得し、初回未取得はNone、失敗/5秒TTL超過/clock rollbackは元の金額を保持してconnected=false/stale=trueとする。期限切れのviewではtapできない。Wallet mutationとその不明応答はcache世代を無効にしてwakeし、古いin-flight応答がfreshへ戻さない。既存契約の成功したread-only Wallet pollingは無効化しない。明示的な拒否または通信不明を観測した場合は直ちに無効化する。close成功にはowned readerのjoinが必要で、timeoutは停止済みと偽らずエラーにする。同期constructor既定と従来local profileは維持する。5秒以内のprojectionは瞬時の失効通知ではなく、activation以外の実行・支払い認可は常に既存authority側で再判定する。

## 一次資料と設計への反映

以下を2026-09-08に確認した。ここからの設計上の採用であり、Rock star osが各規格の認証を受けた主張ではない。

- [AOSP: bootloader lock/unlock](https://source.android.com/docs/core/architecture/bootloader/locking_unlocking) はlocked状態での書込み制限、unlock前の利用者確認とdata resetを説明する。従って不明・locked機種へ「タップでOSを書き換え済み」を返さず、必要な物理操作/消去を事前planへ分離する。
- [AOSP: A/B updates](https://source.android.com/docs/core/ota/ab) は現在のslotを保ちながら未使用slotへ更新し、起動不成功なら以前のslotへ戻る構成を説明する。Rockのstage0実証との対応は限定的で、AOSP update_engineやVirtual A/Bを実装したとはしない。
- [Android Enterprise: zero-touch](https://support.google.com/work/android/answer/7514005?hl=en) は対応する購入/販売店・管理構成・EMM等を前提とする企業管理のprovisioningである。任意の市販BlackBerryへ別OSを無条件でflashする機能ではなく、このplannerのOEM導入経路と同一視しない。
- [Uptane 2.1.0 standard](https://uptane.org/docs/2.1.0/standard/uptane-standard) はimageと対象指定の信頼を分け、hash/size・機器ID・release counterを対応させる。ここでは署名済みartifactと対象別planを分離する考え方を採用するだけで、Root/Timestamp/Snapshot/Director全metadataや本番鍵管理を備えたUptane実装とは呼ばない。
- [RAUC integration](https://rauc.readthedocs.io/en/latest/integration.html) は機種compatibleの一致と、必要サービスが起動した後のmark-goodを説明する。健康条件は端末内部の構成整合を対象にし、ネット断や未払いをboot失敗条件へ混ぜない。

## 検証と未接続境界

新しいnormal/auth/境界/replay/recoveryテストで、署名不正、同key別body、自己承認、canary未完了時promotion、hold後の新規割当拒否、UNKNOWNの再起動後照合、terminal報告改変、clock rollback、権限失効、機種分岐、tapの中断/更新後回復、UIDと保護ファイル、Wallet読取りの遅延/失敗/世代競合を検証する。実デバイス・運営endpoint・SSO・image配信agentは未接続。新tapは実stage0二回起動・native一回tap・正常終了・保持（元snapshot内の参照。履歴資料は今回のGit対象外）を確認した。これはQEMU上の実OS証拠であり、BlackBerry実機の健康・導入証拠へ格上げしない。
