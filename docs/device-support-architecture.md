# RockstarOS 多機種対応アーキテクチャ

決定日: 2026-09-12。利用者は、共通のRockstarOS体験を維持しながら、Pixel、対応可能なAndroid、BlackBerry、iPhone/iPad、PC・仮想端末へ提供形態を分ける方針を選択した。本書は設計決定であり、新しいOS image、実機対応、クラウド契約、端末書込み、production署名の完了記録ではない。

機械可読の正本は [`data/device-support-matrix.json`](../data/device-support-matrix.json)。`npm run device-support:check`は、未確認端末を対応済みまたはflash可能へ変更する誤りを拒否する。

## Pixel先行とiOSへの機能追加

2026-10-15の本人指示で、**最初の専用端末はPixel 10 GL066 / frankel、到達形はGrapheneOSベースの独自RockstarOS**とする。先にPixelでsi Home、Jenniferへの依頼、Sky/Zema、Broker、保存/再起動/復旧を一周させる。既存OS上の非破壊APKはその準備・比較の段階で、最終商品をAPKだけへ縮小しない。独自imageを導入できる経路と、実際にbuild/署名/flash/boot/OTA/復旧が合格した状態は分ける。OEM署名firmware等の機種制約は残り、「完全にOSを入れる」を全hardwareの自由な書換えや全機能完成とは表示しない。

**iOS/iPadOSはeSIM商品を入口とする機能追加型client**。本書でいう「機能プラグイン」は、通信＋si利用権を本人accountへ結び、Skyの利用可能な能力をアプリ/Webから選び、対応するnative機能だけApp Intents等へ公開する構成とする。iOSのOS image置換や、eSIMに実行codeを入れてOSへ注入する方式は採らない。以下はApple一次資料を踏まえたRock側の設計判断で、Appleの承認取得やiOS client実装の記録ではない。

### 購入から利用まで

1. 通信＋si利用権商品を購入し、検証済みorderを本人accountへclaimする。`order / carrier profile / service grant / client導入・版 / device session`を別々に保存する。回線profileや電話番号だけを本人性・支出承認へ使わない。
2. 対応する機種/地域/carrierの手順でeSIMを追加する。QR/link/設定画面等はpartnerが提供する経路を使う。app内の直接発行・追加APIはcarrier app向けentitlement等の条件を満たした場合だけ選び、未取得なら案内経路を使う。profile追加だけでclientや機能の導入完了にしない（I01/I02）。
3. 対応Web、将来のiOS clientへ本人認証で入り、利用権・送信範囲・料金・上限を読む。Skyのremote Tool利用とnative権限を別承認する。既存のpreview bypassを本番利用権の照合として転用しない。
4. client導入後、対応するApp IntentsからSiri/Shortcuts/Spotlight等へ明示した仕事操作を公開する案を試す（I03）。最初の候補は依頼の下書き、仕事を開く、進捗確認。有料開始/外部送信/停止の作用は既存の本人・権限・予算・冪等契約を通す。呼び出せたことを承認済みにしない。native連携はbrowserだけでは提供済みにならず、対応OS/機種/署名appの受入が必要。
5. cloud側のZema/Agentが許可済み仕事を継続し、clientは同じJobとArtifact revisionを再取得する。iPhoneのappが閉じた状態で端末processが無期限に動く前提にはしない（I05）。cloudで完結する経路ではPixelをiOSの中継serverや常時onlineの必須機器にしない。本人が別端末のlocal modelを工程に明示選択した場合は、その端末/bridgeの到達性を必要条件として表示し、切断時は保留する。Pixel専用Broker/Binder権限はiOSへ渡らず、各clientの能力とserver側gateで照合する。

### プラグインの配布・保存・失敗境界

初期scopeは既存Skyのremote capabilityと型付き入出力、Web経路、署名clientに含めたnative adapter。第三者native codeの自由なdownload/実行は前提にしない。HTML/JavaScript等のmini app/chatbot/plugin提供はApp Reviewの4.7等に従う別候補で、無条件禁止とも承認済みとも扱わない。native API公開、データ共有の本人同意、catalog/リンク、年齢/内容、販売地域ごとの配布・課金条件を設計・審査で確認する（I04）。通信bundleであることだけをdigital service販売規則の例外根拠にしない。

本人別Job/Artifact/receiptは既存server正本を使い、clientは必要最小限のcacheと保護されたsessionを持つ。再開時は認証・権限・revisionを再照合する。通信断/期限切れ/権限拒否で勝手に別回線・model・Toolへ送信しない。profile削除/再発行とservice期限/失効は契約上の関係を照合し、それだけで作品やaccountを削除しない。device失効はそのsessionを止め、古い応答や同じ購入からの重複grant/課金/仕事開始を防ぐ。client未導入、native能力非対応、cloud停止、保存未取得を明示し、Webへ戻る場合も機能差を表示する。

### 担当・受入・未決定

主担当はAndroid / Device OS11/O6/ROCK。Pixelのnative受入を先行し、DOC04が方針同期、WEB04が将来client体験、SIM01が商品/profile/service binding、SKY07/SKY21が能力接続、RLS02が署名/配布/復旧を担当する。iOSは設計候補で、Swift/Xcode app、App Intents、carrier entitlementの実装/取得/実機受入を確認できていない。QEMU、Mini、Pro、Gameは独立した既存系列を維持し、iOSの完成待ちにしない。

合格条件はbaselineのIP01〜IP04（全て未実行）。IP01は購入/profile導入/利用権/client状態の独立性と失敗再開、IP02は同owner/Job/版の継続とiOS権限拒否/別owner遮断、IP03はapp停止/再起動中のcloud予算/停止/照合と二重dispatch拒否、IP04は回線切替/期限/失効/紛失時の保存と分離。Pixelは既存DT01〜06および同imageの物理OS gateを別に通す。

ROCKはPixelの最初の一仕事とHome復帰を先に試作する。OWNER/JOINTと後続で対象iPhone/iOS版・地域・通信商品・回線と利用権の解約関係・配布/課金経路を定め、最小iOS機能を選ぶ。現段階で機種対応、Store審査、carrier契約、有料サービス、flashの合格を宣言しない。

### 確認した一次資料（2026-10-15）

- **I01** [Apple: iPhoneのeSIM設定](https://support.apple.com/en-us/118669) — carrier対応に応じたQR/link/app/手動設定。
- **I02** [Apple: CTCellularPlanProvisioning](https://developer.apple.com/documentation/coretelephony/ctcellularplanprovisioning) — carrier appとentitlementの条件。
- **I03** [Apple: App Intents](https://developer.apple.com/documentation/appintents) — アプリの明示したaction/dataをsystemの対応面へ接続。
- **I04** [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 2.5の公開API/code/背景動作、3.1の販売条件、4.7のplugin等の条件。地域/配布経路の詳細はリリース時に再確認。
- **I05** [Apple: Background strategies](https://developer.apple.com/documentation/backgroundtasks/choosing-background-strategies-for-your-app) — backgroundは用途・時間・system schedulingの制約付き。

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

1. 物理商品の優先はPixel 10の専用si端末。QEMUの既存受入とCuttlefishの共通Core検証は独立系列として維持し、Pixelの実機合格へ転用しない。
2. 所有済みPixel 10／`frankel`を最初の物理対象とし、読取り専用診断でproduct、現在OS、OEM unlocking可否を確認する。Pixel 7／`panther`はPixel 10受入後まで保留する。
3. 予算承認後に専用LinuxでPixel 10の全source buildを行う。
4. 選択端末の実機受入後、Treble端末を`gsi_experimental`として一機種ずつ追加する。
5. BlackBerry Androidは正確なモデルにsupported unlock・vendor・recovery経路がある場合だけ実験候補へ上げる。旧BlackBerryは非対応を維持する。
6. Pixel先行の後続経路として、iPhone/iPadはeSIM商品＋client/Web/対応native連携で共通serviceへ接続する。利用権はaccount正本、端末OSの置換やPixel常時onlineは前提にしない。

この順序により、Coreの改善をすべての提供形態へ反映しながら、機種固有の失敗を他端末やWallet契約へ波及させない。
