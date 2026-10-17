# RockstarOS 多機種対応アーキテクチャ

決定日: 2026-09-12。利用者は、共通のRockstarOS体験を維持しながら、Pixel、対応可能なAndroid、BlackBerry、iPhone/iPad、PC・仮想端末へ提供形態を分ける方針を選択した。本書は設計決定であり、新しいOS image、実機対応、クラウド契約、端末書込み、production署名の完了記録ではない。

機械可読の正本は [`data/device-support-matrix.json`](../data/device-support-matrix.json)。`npm run device-support:check`は、未確認端末を対応済みまたはflash可能へ変更する誤りを拒否する。

<a id="graphene-reuse"></a>

## GrapheneOSの長所の再利用（2026-10-10 / OS10・RLS02）

**目的と判断。** 利用者の「グラフェンのいいとこどりをしよう」に基づき、Pixel版は既存のGrapheneOSベースとAndroid／Linux接続の仕組みを再利用し、Rockstarの依頼・承認・仕事・成果へつなぐ。以下はこの方向を具体化した実装案であり、Linux VMへの製品全体の移動や安全機能の無条件削除を要件にしない。主担当はAndroid / Device / Local AI、既存OS10とRLS02を使用する。QEMU受入、他機種client、SIM/eSIMによるservice accessを保持する。

### 再利用する範囲

| 範囲 | 再利用とRockstar側の変更 | 受入の境界 |
|---|---|---|
| Androidと機種対応 | GrapheneOS／AOSPの起動・driver・firmware・通常アプリ互換性を土台に、既存RockShell／Broker／Toolを組み込む | Pixel 10 GL066／frankelの同一imageで機能・更新・純正復旧を検証。Pixel用imageを他機種へ流用しない |
| 権限と隔離 | UID、SELinux、アプリsandbox、GrapheneOSの保護機能を一体の基盤として保持。既存Brokerで本人・scope・同意を判定する | ToolやLLM、VM rootをAndroidの管理権限にしない。上流同等の安全性を改変後の試験なしに宣言しない |
| 検証起動と更新 | AVB、署名確認、更新・復旧の仕組みを再利用し、Rockstar固有の鍵・配信・失効・復旧運用を構成する | 公式GrapheneOSの鍵／更新配信は流用しない。既存first-flash gateを通す |
| Terminal／Linux | 開発・検証の作業場、および限定したLinux Tool実行先の候補として使う。Terminalを利用者全員の必須操作にはしない | AVF／guest／port forwardingの実機能力を最初に確認。VM内の成功はAndroid本体の改変、full OS受入、常時稼働の証拠ではない |
| Rockstarの体験 | Home／Sky／Zema、共通本人、仕事、承認、停止、成果、usageを既存実装から使う | cloud送信と端末内実行を区別し、端末処理の失敗を無断で有料cloud実行へ切り替えない |

Terminalの標準Linux環境はAVFを用いるDebian系の非protected VMであり、protected VMの機密性保証を付与しない。guest rootとAndroid host権限は別。初回案ではhostの任意shell、root、ADBを共通Tool APIとして公開しない。ブラウザから開けるlocalhostだけを認証根拠にもせず、接続は明示pairingした本人・端末・sessionへ束縛する。実transportとportの到達範囲は実測してから決定する。

### 体験と責任

利用者はHomeからSkyのToolを選び、実行先、使う入力、必要権限、保存先、cloudの場合は見積と上限を確認する。Zemaが同じjobを追跡し、Brokerが承認した操作だけを実行先adapterへ渡す。通常の画面操作はAndroid側、許可されたLinux処理はguest側で実行する。Linuxがない端末では利用不可の理由を表示し、別実行先の選択を利用者へ戻す。

- ROCK: 共通API、能力表示、Android BrokerとLinux adapterの認証・制限・状態照合、UI、互換と復旧の試験。
- EXTERNAL: GrapheneOS／AOSP／AVF／Debian、機種固有firmwareとdriver、上流修正の提供。Rockstar改変版の保守責任を上流へ転嫁しない。
- JOINT: 同一機種・host／guest版の互換、実機の停止・再開・保存、更新後の接続を受け入れる。
- OWNER: 入力・端末機能・外部作用・費用を承認。鍵生成、OS書込み、有料環境は既存の個別条件で扱う。

### 契約・保存・失敗・復旧

**入出力。** 入力候補はowner、device session、job ID、revision、承認digest、実行先、Tool ID／版／hash、許可scope、入力hash、timeout、CPU／RAM／出力量上限、必要時の予算予約。出力は同じjob IDの実行状態、成果hash／参照、実測usage、失敗理由とする。既存`lib/workflow.ts`の業務状態へadapterで対応させ、Linuxの`succeeded`を本人検収後の`completed`へ直接置換しない。第三者Toolは作者署名と審査済みmanifestを照合し、任意コマンド文字列を受付けない。

**状態。** 設計上のadapter能力は`unsupported / not_configured / ready / unavailable`を区別する。`ready`は接続準備の表示で、Tool成功や本番受入ではない。jobは既存workflowを正本とし、VM終了・応答断では結果不明として同じjob IDを照合する。取消要求と停止確認を分け、結果不明時に再実行・cloud切替・二重課金をしない。これらの能力名は設計案で、現行Capability APIへ追加実装済みではない。

**保存。** Android／cloudの既存owner別job・revision・承認・予算記録を正本とする。guest内には選択された入力と作業ファイルだけを置き、完了または取消後の入力削除、成果の明示保存、VM削除前のexportを用意する。永続成果の場所と保持期限をUIへ示す。guest diskを唯一のbackupにせず、秘密鍵・API credential・原稿をGitや診断ログへ保存しない。AndroidKeyStoreの秘密をguestへ渡さない。

**更新と復旧。** host、guest image、adapter protocol、Tool、保存schemaの版を組で記録する。VM再起動と端末再起動、disk削除と端末全損、OTA slot復旧とデータ復元はそれぞれ別試験にする。更新で接続が切れた場合は書込みを停止し、互換確認後に同じjobを照合して復帰する。

### 実装順と合格条件

1. 最新mainと実在する対象branch、ローカル差分と引継ぎを同期する。既存`os/physical/rockstaros.mk`、Android Broker／Shell、`systems/rock-star-os/`のユーザー空間処理を再利用候補として読む。既存QEMU imageそのものをAVFへ入れれば動くとは仮定しない。
2. Pixel 10の現行host版、Terminal有無、AVF、guestのarchitecture／版、port転送、保存領域を確認する。起動時間、停止・再開、画面off時の動作、CPU／RAM／熱／電池を測る。未確認の常駐やGPU／NPU利用を保証しない。
3. 非金融の決定的Tool一件で合成入力→Linux処理→同じjobへの成果返却を実装・検証する案を第一候補にする。対象Toolとtransportは次の能力調査後に選ぶ。入力改ざん、別owner／session、古いrevision、期限切れ承認、上限超過を拒否する。
4. Android側の再接続、VM終了、再起動、重複要求、取消と結果不明、保存・再取得・削除を同じ候補で試験する。機能ごとの実測を基に最適化し、速度目的だけで保護機構を無検証で外さない。
5. VM連携の受入とは独立して、RockstarOS imageのbuild／正式署名／flash／OTA／純正復旧をRLS02のgateで進める。他Androidへの移植とiOS／PC clientも個別に受け入れる。

検証入口は`npm run baseline:check`、`npm run design:check`、`npm run device-support:check`、`npm run android:first-flash:check`、`npm run verify`。これらは文書・契約・既存回帰であり、AVF接続試験の代替にはならない。実機検証コマンドは能力調査後に対象版へ固定し、host／guest／adapter／Toolのhashと期待結果を既存Android workstreamへ記録する。

**未決定。** VMの実ライフサイクル、transport、guest配布・更新元、resource上限と保持期限、最初のToolはROCKが実測・互換・license確認で案を決め、データ利用・費用の選択をOWNERへ提示する。現時点は設計のみで、Linux adapter実装・AVF実機接続・性能改善・full OS受入は未完了。

根拠（2026-10-10確認）: [GrapheneOSの保護機能](https://grapheneos.org/features)、[独自署名と更新のbuild手順](https://grapheneos.org/build)、[Android AVF Linux開発環境](https://source.android.com/docs/core/virtualization/usecases)、[GrapheneOSのTerminal導入・port forwarding履歴](https://grapheneos.org/releases#2025031300)。履歴の機能追加を現在の所有端末の動作証拠にはしない。

## 一つの製品、四つの提供区分

| 区分               | 意味                                                                  | 現在の例                               |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------- |
| `native_os`        | RockstarOSのOS imageを対象環境で起動する。物理端末は機種別受入が必要  | QEMUは内部限定受入、Pixelは候補のみ    |
| `gsi_experimental` | Trebleとunlock条件を満たすAndroidへ機種別に試験する                   | 汎用Androidは計画段階                  |
| `client_only`      | 既存OSを置換せず、最小権限clientからSky・Wallet・remote jobを利用する | iOS/iPadOS、現時点のBlackBerry Android |
| `unsupported`      | 安全な導入・更新・復旧経路がないため製品対応を表示しない              | BBOS／BlackBerry 10の旧端末            |

仮想環境の`native_os`合格を、物理スマホの合格へ移さない。`client_only`はRockstarOSのサービス体験を提供できるが、root、OS更新、端末全体の隔離やハードウェア制御を提供できるとは表示しない。

## 分離する構造

```text
RockstarOS Core
├── Sky / Wallet / Game / SDK
├── owner・同意・料金・台帳・取消・復旧契約
├── 安定したDevice Capability API
├── 版付きデータ移行とbackup/restore
└── OTA policy・監査・release metadata

Device Support Package（DSP、機種／SKUごと）
├── bootloader・partition・AVB・rollback設定
├── kernel／GKI・device tree・vendor module
├── VINTF・HAL・firmware・vendor blob
├── display／input／storage／USB／radio／camera／audio
├── power／thermal／suspend／charging
└── factory restore・実機受入・license記録

Client Adapter
└── iOS／既存Android／Webから許可されたremote実行へ接続
```

Coreは機種名を条件分岐に埋め込まず、版付きCapability APIから利用可能な機能を読む。DSPにない能力は閉じ、疑似成功や別端末の証拠で代替しない。商品、Wallet、Gameの業務契約はCoreに保持し、ドライバやvendor実装から資金操作権限を切り離す。

## 後から改善できるようにする仕組み

1. **GKI/KMIとvendor module**: 同じ対応KMI内では共通kernelと機種固有moduleを分離する。KMIを跨ぐ更新はmodule再buildと実機回帰を要求する。
2. **Treble/VINTF**: frameworkとvendor実装の対応版をmanifest/matrixで検査し、build、OTA、boot、VTSの各段階で不一致を拒否する。
3. **Virtual A/B OTA**: 使用中とは別のsnapshotへ署名済み更新を配置し、起動失敗時に以前の版へ戻す。rollbackをデータ移行の巻戻しと混同しない。
4. **Dynamic Partitions**: 対応端末では`super`内を更新可能にする。bootloaderが読む`boot`、`dtbo`、`vbmeta`等は物理partitionとして機種別に固定する。
5. **鍵の階層化**: オフラインroot、release、OTA、AVB、APK/APEX、開発鍵を用途別に分離する。鍵の交代は旧鍵と新鍵の信頼期間、失効、復旧を先に試験する。
6. **データ契約**: 保存schemaへ版を付け、`N → N+1` migration、旧版read、backup/restore、失敗時の再実行を用意する。OS slot rollbackだけで新schemaのデータが自動的に戻るとは仮定しない。
7. **再現buildと証拠**: source、toolchain、DSP、鍵ID、成果物hash、試験結果をrelease単位で固定する。秘密鍵と大きいimageはGitへ置かない。

参考となるAndroid公式構造: [GKI](https://source.android.com/docs/core/architecture/kernel/generic-kernel-image)、[VINTF](https://source.android.com/docs/core/architecture/vintf)、[Virtual A/B](https://source.android.com/docs/core/ota/virtual_ab)、[Dynamic Partitions](https://source.android.com/docs/core/ota/dynamic_partitions)、[Verified Boot device state](https://source.android.com/docs/security/features/verifiedboot/device-state)。

## 物理端末を対応済みにするゲート

物理端末は型番だけでなく地域SKUまで一つに固定し、次を同じ端末・同じrelease候補で完走した場合だけ`native_os`対応と表示する。

1. 読取り専用診断でmodel、SKU、現在OS、OEM unlock可否を確認。
2. メーカーが許可するunlock/relock、factory image、復旧手順を固定。
3. source・vendor・firmware・kernel・DSPの版と再配布条件を固定。
4. 開発署名imageをbuildし、hashとbuild logを保存。
5. boot、画面、入力、保存、USB、通信、radio、camera、audio、充電、suspend、thermalを実測。
6. Sky／Wallet／Gameのowner・同意・費用・台帳・停止・復旧を実測。
7. 署名OTA、更新失敗、旧slot rollback、データmigrationを実測。
8. 純正状態へ戻し、端末が起動できることを確認。
9. production鍵、license、配布、サポート期間を別途承認。

unlockやflashに伴うデータ消去は、対象端末と実行直前に利用者へ明示する。端末購入、初期化、書込み、鍵生成、クラウド課金は本方針の承認から自動実行しない。

## 現在の順序

1. QEMUの既存受入を保持し、Android共通CoreのCuttlefish入口を作る。
2. 所有済みPixel 10／`frankel`を最初の物理対象とし、読取り専用診断でproduct、現在OS、OEM unlocking可否を確認する。Pixel 7／`panther`はPixel 10受入後まで保留する。
3. 予算承認後に専用LinuxでPixel 10の全source buildを行う。
4. 選択端末の実機受入後、Treble端末を`gsi_experimental`として一機種ずつ追加する。
5. BlackBerry Androidは正確なモデルにsupported unlock・vendor・recovery経路がある場合だけ実験候補へ上げる。旧BlackBerryは非対応を維持する。
6. iPhone/iPadはOS置換ではなくclientとして共通Coreへ接続する。

この順序により、Coreの改善をすべての提供形態へ反映しながら、機種固有の失敗を他端末やWallet契約へ波及させない。
