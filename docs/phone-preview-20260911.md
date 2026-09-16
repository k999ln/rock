# スマホへ書き込むRockstarOSの開発

## 多機種対応の境界

実装方式は[共通Core＋機種別Device Support Package](device-support-architecture.md)。端末ごとにboot chain、kernel、vendor、firmware、partition、AVB／OTA／復旧が異なるため、一つのimageをBlackBerry、Pixel、iPhoneへ共通に書き込む方式にはしない。Android GSIは互換性調査用で、電話・カメラ・暗号化・更新・復旧が通るまで完全対応とは表示しない。iPhone／iPadはOS置換対象ではなく、App Store等で動くclient側を設計対象とする。現在の機械可読状態は[対応台帳](../data/device-support-matrix.json)を正本とする。

2026-09-16実機確認: 読取り専用ADBで所有端末をPixel 10／`frankel`／日本向けSKU `GL066`へ確定した。現在はGrapheneOS `2026091000`／Android 17、bootloader locked、alternate verified-boot rootのyellow状態。端末serialは保存していない。これは対象固定だけの合格で、avocadoOSのbuild、flash、boot、復旧合格ではない。初回full buildは下記の事前gate完了まで開始しない。初回の安全側候補はDigitalOcean 48 vCPU／96GiB／600GiB、計画枠20〜30 USD（未承認）。GPUは不要。

ソース準備はlaunch-candidateへ統合済み。[現在の全体状態](current-state-20260911.md)と[再開指示](prompts/rock-current-next-20260911.md)を優先する。前回のクラウド初回サーバー代税別10 USD案は未承認で、今回のGit統合指示は支払い承認ではない。

2026-09-11の利用者指示「スマホ本体にOSを書き込める版を作成して」を受領し、実機版の開発を開始した。利用できるLinux PC／サーバーはないとの回答を受領。対象機種・地域SKUは後続の実機readbackでPixel 10／GL066へ確定した。BlackBerry優先という以前の方針を、Pixel対応完了へ読み替えない。

**現在はソース統合の準備段階。書込み可能なOSイメージはまだ生成していない。** 既存QEMU版はそのまま保持する。アプリ単体やWebサイトを実機OSの完成物にしない。

## 有料full buildへ進む前の必須gate

OS full buildを先に試して後からappやLLMの不具合を直す順序にはしない。次を上から完了し、同じsourceとartifactをfreezeできるまで、クラウドbuild環境を契約せずfull buildを開始しない。

1. 所有するPixel 10から型番、地域SKU、codename、OEM unlocking可否、bootloader状態を読取り専用で確認する。
2. product baseline、source lock、Platform Core、backup／migration、更新／rollback契約のhost試験を完走する。
3. Core、Tool SDK、Automation、記事Toolを単体Android buildし、unit testとlintを通す。
4. Android emulatorでBinder、SQLite、承認、再起動、重複防止、失敗時復旧を結合試験する。
5. Local Action Assistantをarm64 APKとして生成し、package、version、permission、署名、SHA-256をartifact lockへ固定する。
6. OSを書き換える前の純正Pixel 10へ単体APKを入れ、GGUF読込み、機内モード推論、変更操作の別確認、保存／再起動、RAM、30分温度を確認する。
7. SkyでToolを選ぶ→Zemaで依頼・承認・進捗・結果を見る→Walletのreceiptへ反映する流れを、実機clientで可能な範囲まで通す。
8. 合格したcommit、manifest、APK／model hash、Platform API、DB schema、署名・更新・復旧計画をfreezeする。

2026-09-15の追加検証では、Core／Tool SDK／Automation／記事ToolのAndroid build・unit test・lint、Local Action Assistantのunsigned arm64 release APK build、Android 15 arm64 Pixel 10 device-profile emulatorでの5 instrumentation testまで合格した。ここでは別APKの署名検査、Binder、Android SQLite、Tool 2工程、review必須、Headless JS、GGUF未導入時の`NO_MODEL` fail-closedを確認した。

2026-09-16にはOSを書き換えていない所有Pixel 10で、Broker／Tool／Local AI／Wallet 11件、権限を絞ったShell 5件、試験署名Operator Agent 5件、実再起動のseed／recover 2段階の計23件が合格した。Skyで選んだTool、途中の仕事、結果、review、履歴を再起動後に回収し、v2 backupはhardware-backedな2経路の鍵で実ファイルへ同期完了した。これは純正OS上の試験署名APK受入であり、Keystore消去後の24単語復元、production credential／StrongBox attestation、Device Owner実行、SELinux enforcingの最終domain、Soong image、flash／bootの合格ではない。[実機証拠](evidence/android-pixel-10-prefull-physical-20260916.json)。

同日、本番Operator公開設定をrepo外JSONから静的product RROへstageする入口を追加した。exact HTTPS origin／RP、P-256公開鍵、32-byte端末challenge、StrongBox必須、factory reset無効を検証し、stage後も再検証する。端末identity aliasはchallengeへ結び、Python 9/9、Android build／lint、emulator 6/6に合格した。実際のproduction credential／公開値は未投入で、最初の単一Pixel preview以外にはruntimeの一回限りchallenge enrollmentが必要である。[証拠](evidence/android-operator-overlay-stager-20260916.json)。

Sky→Zemaの一回限りhandoff、Zemaのjob進捗、Tool実行、Wallet／収益精算の単体試験に加え、Tool完了をProvider署名Earning ReceiptとしてWalletへ一度だけ転記するbridgeを実装した。2026-09-16には同じ合成実行IDと証拠hashでPixelのTool／端末Wallet区間6/6と署名済みBilling Wallet区間7/7を相関し、`skyZemaToolWalletPath`は`rock_ready_physical_correlated_split_boundary_provider_sandbox_pending`。これはRock所有fixtureの二区間で、配備済み外部Provider一本通し、実売上、返金／chargeback、実払出しは未実証である。

所有Pixel 10の端末readbackと単体APKによるGGUF機内モード推論、再起動、33分22秒の温度試験は完了した。外部Providerは初回OS full buildへ焼き込まず、更新可能なアプリ／サーバー側へ分離する。Provider sandboxは実収益を表示するavocadoOS 1.0公開前の必須gateとして残し、未合格中はlive収益表示を禁止する。GL066は署名source tagとpartition／AVB構成まで固定済みだが、Google純正factory／full OTAの実ファイルSHA、vendor生成inventory、production署名／復旧計画が残る。このgateは**進行中**で、full build開始条件をまだ満たしていない。

初回flashについては、さらに[4項目の専用gate](android-first-flash-gate-20260916.md)を正本化した。正式署名鍵のidentityと紛失・rotation・失効、rollback index運用、Google純正factory image／full OTAの実byte SHA-256、Keystore喪失後も復元できるbackupの4/4が必要である。現在は0/4。backup v2の非破壊export／再起動までは実機合格したが、dataとKeystoreを消去した後に24単語だけで復元する破壊試験が残るため、backup gateも未合格である。full buildの成功だけでは初回flashを許可しない。

Sky、Zema、Wallet、Tool、LLMは原則として更新可能なAPK境界に置く。これらだけの修正なら単体APKを再buildして純正Android上で再試験する。framework、SELinux、privapp/product設定、boot/vendor/partition/AVBを変更した場合はOS imageの再buildが必要になる。

事前gate合格後に初回full buildを一度行い、同じ作業環境でtarget-files、factory image、OTAを生成する。サーバーや永続volumeは成果物hashを退避しただけで直ちに破棄せず、最初の実機flash／bootと修正要否を確認するまで保持する。full build自体でしか見つからないSoong、SELinux、device統合不具合は残り得るため、1回で必ず完了するとは表示しない。

## 実装した入口

- `os/physical/frankel-source-lock.json`：Pixel 10／frankel／GL066、manifest、adevtool、端末hook、kernel参照を固定。対象確認は完了し、OS build・boot・flashは未完了のまま。
- `data/android-first-flash-gate.json`：初回flash前に固定する署名鍵life-cycle、rollback index、Google純正復旧2ファイル、Keystore喪失backupの4項目を機械可読化。秘密鍵とrecovery secretは保存せず、現在は0/4合格でfail closed。
- `os/physical/rockstaros.mk`：既存のRock自動化／記事Toolを端末OSのproductへ組み込む。UID・SELinux・AVB・端末ドライバーは上流を維持。公式GrapheneOSの更新サービスを使う`OFFICIAL_BUILD=true`を拒否。
- `scripts/prepare-phone-build.py`：容量診断、cleanなRock commit固定のRepo manifest出力、上流署名タグ・adevtool参照・端末hookの一致検証、1か所だけの再実行可能なsource変更。既存のローカル変更を上書きしない。
- `scripts/build-phone-bringup.sh`：lockのdevice／SKU確認が完了した準備済みLinux環境で、lock由来の`userdebug` lunch／build targetを実行する入口。未確認lockはフルbuildを拒否し、source一覧とRock commit、端末hook差分を保存する。クラウド作成・正式署名・端末操作は含まない。
- `scripts/inspect-phone.py`：選択した1端末の機種・SKU・build・起動状態を必要なプロパティだけ読み取る。serialを出力せず、初期化／再起動／root／書込みを実行しない。空の値を適合と判定しない。

この最初の組込みは、既存Android P1の2工程が入った**端末起動のための試作**。Linux nativeのHub・Wallet・Gameは未移植。最終的には商品導入／同意／実行／取消、本人認証・台帳・費用／入金、保存・復旧をAndroidの接続層へ移植し、既存の業務契約と照合する。QEMUのframebuffer、Unix socket、固定UIDをそのままAndroidへ持ち込まない。

## 確認した上流と端末layout

Pixel 10の安定版`2026091000`を固定した。manifest tag objectは`6c939d124f3ea8dd545c1e4045f26359f501d80e`、manifest commitは`ac9f2fdf0badebea2f6ac6c3e93b125aba02116a`。公式`allowed_signers`の固定byteで、`contact@grapheneos.org`／`SHA256:AhgHif0mei+9aNyKLfMZBh2yptHdw/aN7Tlh/j2eFwM`のtag署名を検証した。AOSP基底は`android-17.0.0_r1`。全project取得やbuildは未実行。[公式リリース](https://grapheneos.org/releases#frankel)／[公式build手順](https://grapheneos.org/build)。

固定adevtoolは`117ef1de94510854f3fc25154c8246819e56f049`。生成された大きなproduct makefileを直接編集せず、[端末別の小さいhook](https://github.com/GrapheneOS/adevtool/blob/117ef1de94510854f3fc25154c8246819e56f049/config/mk/google_devices/device/frankel/device.mk)へRock共通productのinheritを追加する。実機kernel prebuiltは`e10186c8b757f4658dc38973a37c0034b05fc0b6`のlaguna／muzel／6.6で、muzel treeは`1c1a65e54c92adb11979a73fcc9acea9cc8183b1`。QEMUのvirt向けimageは使用しない。

実機は書込みなしでDynamic Partition、Virtual A/B、A/B update、AVB 1.4、locked vbmetaを確認した。`boot`、`dtbo`、`init_boot`、`vbmeta`、`vbmeta_system`、`vbmeta_vendor`、`vendor_boot`、`vendor_kernel_boot`はA/B、`super`、`metadata`、`userdata`も存在する。端末serialは保存していない。[source／layout監査](evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json)。

純正復旧はGoogleのfrankel用factory imageと対応full OTAを両方必要入力にする。factory imageはdata消去を伴い、full OTAは通常unlock／wipeなしで復元できる。Pixel 10は2026年5月bootloaderのanti-rollback対象なので、古いAndroid 16 bootloaderをflashせず、危険な書込み前に対応full OTAで両slotを起動可能にする。利用条件の本人確認と実ファイル取得／SHA-256が未完了のため、復旧artifactはまだfreeze済みと表示しない。[Google factory image](https://developers.google.com/android/images)／[Google full OTA](https://developers.google.com/android/ota)。

再開時は上流の更新・セキュリティ修正を再確認し、必要ならlockを更新して改めて検証する。`prepare`単独はmanifest・adevtool・kernel・hookの確認。local manifestはこのRock project1件の追加だけを許可し、上流projectのoverrideを拒否する。build入口はさらに`repo forall`で全取得projectの固定commitと作業木を確認し、指定hook以外の変更・未追跡ファイルを拒否する。実出力は専用`out`へ固定し、その容量を調べる。全projectの確認処理自体は、まだ実際の1108project上で実行していない。準備確認を再現buildの成功と表示しない。

## ビルド環境の具体案

現在のMacはmacOS／ARM64、RAM16GiB、内蔵空き約4.6GiB。既存のARM64 Limaも公式のx86_64 Linux条件を満たさない。外付SSDの空きだけではCPU・RAMの問題を解消できない。公式GrapheneOS条件はRAM32GiB以上、軽量source取得90GiB以上＋build100GiB以上。初回はRAM64GiB／空き400GB程度のLinuxを用意する。[GrapheneOS要件](https://grapheneos.org/build#build-dependencies)／[AOSP要件](https://source.android.com/docs/setup/start/requirements)。

公開repoの標準GitHub runnerは無料だが、LinuxはRAM16GB／SSD14GBで今回の全OS buildには不足する。[GitHub公式仕様](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

候補はDigitalOceanのCPU-Optimized Regular、32vCPU／64GiB RAM／400GiB SSD、Ubuntu 24.04 x86_64。公式表示は**1.00 USD/時**。8時間使用の計算例は8 USD、24時間なら24 USDで、これは作業完了時間の見積りではない。税・追加サービス・追加転送・成果物保存費は別。利用可能な地域・台数枠・実際の注文料金は作成時に確認する。[公式料金](https://www.digitalocean.com/pricing/droplets)。

有料環境はまだ契約・作成していない。利用者のアカウントと予算枠が決まったら、専用環境1台でsource取得→build→成果物保存まで進める。電源OFFだけでは課金が続くため、終了時は必要な成果物の保存・hash読戻し後に、この用途のサーバーを削除して課金終了を確認する。自動削除や費用上限の制御はまだ実装していない。[課金の扱い](https://docs.digitalocean.com/products/droplets/details/pricing/)。

## 事前gate合格後の準備済みLinuxでの実行順

以下は未実行の全OS手順。上の事前gateが全て合格し、初回対象がPixel 10の正確なSKUまで確定してから専用環境を用意して実施する。

1. 上流build手順に従い依存物を入れ、空のOS作業ディレクトリで`repo init -u https://github.com/GrapheneOS/platform_manifest.git -b refs/tags/2026091000`を実行する。
2. 公式の`https://grapheneos.org/allowed_signers`をその環境の専用公開鍵ファイルへ取得し、manifestのタグ署名と固定commitを検証する。ユーザー全体のGit設定は変更しない。
3. cleanなRock checkoutから`python3 scripts/prepare-phone-build.py manifest`でXMLを生成し、OS作業ディレクトリの`.repo/local_manifests/rock-phone.xml`へ保存する。Rockは`external/rockstaros`へ取得され、既存Cuttlefish専用設定と混ぜない。
4. `repo sync -c -j8`を完了する。公式手順の`source build/envsetup.sh`、`yarn --cwd vendor/adevtool/ install`、`adevtool generate-all -d <lockのdevice>`を実施し、vendor取得・照合結果を保存する。
5. Google factory／full OTAのhash、vendor inventory、production署名／復旧計画に加え、production Operator AgentのWebAuthn公開trust overlay、端末別attestation challenge、StrongBox登録手順を揃える。`fullBuildInputGatePassed=true`へ進められる根拠をレビューしてから、repo外のreview済み公開JSONを`ROCK_OPERATOR_AGENT_CONFIG`、review済みLocal AI APKを`ROCK_LOCAL_AI_APK`、信頼するaapt2を`ROCK_ANDROID_AAPT2`として指定し、OS作業ディレクトリで`bash external/rockstaros/scripts/build-phone-bringup.sh "$PWD" /absolute/path/to/grapheneos_allowed_signers`を実行する。現在の入口は入力不足や検証失敗ならSoong前に拒否する。入口はRAM 64 GiB以上・空き400 GiB以上を検査し、prepare後とrepo全体検査後にlock指定hook、Local AI APK、Operator RROを再検証する。初回Soong/OS buildの実エラーを解消し、成功した同一sourceと出力hashを記録する。対象機種の`userdebug`出力は開発試験用で、productionは`user`を別に受け入れる。
6. Hub／Wallet／Gameの移植、Rock独自の表示、Android正式署名、OTA・復旧を整える。初回flash gate 4/4、機種・SKU・現在build・backupを確認して、書込み手順を別途確定する。

端末の読み取り診断は、adb導入済み・USB接続承認済みの環境で`python3 scripts/inspect-phone.py --serial <本人が選んだ端末ID>`。2026-09-16に実行し、端末serialを除いた必要最小限の結果だけを[端末inventory](evidence/android-pixel-10-gl066-device-inventory-20260916.json)と[boot状態](evidence/android-pixel-10-gl066-boot-state-20260916.json)へ保存した。

## 配布・署名・実機受入

改変版はRockstarOSという別OSとして表示し、GrapheneOSの公式製品を名乗らない。[商標方針](https://grapheneos.org/faq#trademark)。Googleのfactory／vendor／firmwareは個別の利用・再配布条件を確認する。取得可能という理由で独自配布の許諾済みにしない。[Google配布条件](https://developers.google.com/android/images)。

現在のBroker／Shell／Tool 3 APKは公開testkey設定。既存のMac配布用Ed25519署名をAndroidのAVB／APK／APEX／OTA署名に転用できない。端末の信頼鍵、継続更新、失効・復旧、独自更新先の設計が必要。[Android署名](https://source.android.com/docs/core/ota/sign_builds)／[AVB](https://source.android.com/docs/security/features/verifiedboot/avb)。

最終合格は対象実機での起動、画面／入力／通信／充電／省電力／熱、Hub／Walletの利用、保存・再起動、更新失敗・純正状態への復旧を含む。実機書込み前には現在のOSとデータを失う範囲を具体的に確認する。ソース設定・署名fixture・エミュレーター成功だけでこの合格を付けない。

## この変更の検証

Mac上で、実Gitの署名タグ・source変更保護・異なるrevision拒否、lock整合、full-build gate、hook再検証、host容量境界と端末診断の制限を対象に10件PASS。shell構文と既存`os:check`もPASS。`npm run verify`は型・lint・93 tests・build・143 API assertionsを含めPASS。初回fixtureの一時pathがmacOSの`/var` symlinkを正規化していなかった失敗を修正した。実Soong、全source同期、クラウド実行、端末接続は未実行。[証拠要約](evidence/launch/phone-source-preparation-20260911.json)。
