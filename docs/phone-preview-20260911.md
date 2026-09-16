# スマホへ書き込むRockstarOSの開発

## 多機種対応の境界

実装方式は[共通Core＋機種別Device Support Package](device-support-architecture.md)。端末ごとにboot chain、kernel、vendor、firmware、partition、AVB／OTA／復旧が異なるため、一つのimageをBlackBerry、Pixel、iPhoneへ共通に書き込む方式にはしない。Android GSIは互換性調査用で、電話・カメラ・暗号化・更新・復旧が通るまで完全対応とは表示しない。iPhone／iPadはOS置換対象ではなく、App Store等で動くclient側を設計対象とする。現在の機械可読状態は[対応台帳](../data/device-support-matrix.json)を正本とする。

2026-09-12再監査: 直近相談ではPixel 7が対象として挙がったが、この文書と現在のsource lockはPixel 10／`frankel`用。Pixel 7なら`panther`へ固定し直す必要があるため、実機の型番／SKUを読取り専用で確認するまで全OS buildを開始しない。32 vCPU／64GiB／400GiBはAOSPの400GB空き要件に対する余裕が小さい。初回の安全側候補をDigitalOcean 48 vCPU／96GiB／600GiB、1.50 USD/時、計画枠20〜30 USD（未承認）とし、Google Cloud 16〜32 vCPU／64〜128GB／600GB〜1TBを反復build向け代替とする。GPUは不要。契約・課金・端末操作は未実施。[全体の再監査](current-state-20260911.md#2026-09-12--github実装実機版ビルド環境の再監査)。

ソース準備はlaunch-candidateへ統合済み。[現在の全体状態](current-state-20260911.md)と[再開指示](prompts/rock-current-next-20260911.md)を優先する。前回のクラウド初回サーバー代税別10 USD案は未承認で、今回のGit統合指示は支払い承認ではない。

2026-09-11の利用者指示「スマホ本体にOSを書き込める版を作成して」を受領し、実機版の開発を開始した。利用できるLinux PC／サーバーはないとの回答を受領。以前のPixel 10／GrapheneOSを候補にソース統合を準備したが、今回の対象機種・地域SKUの再確認は未回答。BlackBerry優先という以前の方針を、Pixel対応完了へ読み替えない。

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

2026-09-15の追加検証では、Core／Tool SDK／Automation／記事ToolのAndroid build・unit test・lint、Local Action Assistantのunsigned arm64 release APK build、Android 15 arm64 Pixel 10 device-profile emulatorでの5 instrumentation testまで合格した。ここでは別APKの署名検査、Binder、Android SQLite、Tool 2工程、review必須、Headless JS、GGUF未導入時の`NO_MODEL` fail-closedを確認した。物理Pixelではなく、device credential承認、再起動復元、最終SELinux domainは未確認なのでemulator gate全体は部分合格に留める。

Sky→Zemaの一回限りhandoff、Zemaのjob進捗、Tool実行、Wallet／収益精算の各単体テスト20件は合格した。ただし現在のproduction経路ではTool完了jobがWallet receiptを自動生成せず、Web Walletは手動book record、Sky Billingは別のprovider receipt入口になっている。このため「Skyで選ぶ→Zemaで追う→Tool成果→Wallet receipt」の1本の縦断は不合格で、`skyZemaToolWalletPath`を`failed_missing_automatic_tool_wallet_receipt_bridge`として固定した。

純正Pixel 10上のGGUF推論・機内モード・温度、端末readback、実機client縦断、正式署名と最終freezeは未実行である。このgateは**進行中**で、full build開始条件を満たしていない。

Sky、Zema、Wallet、Tool、LLMは原則として更新可能なAPK境界に置く。これらだけの修正なら単体APKを再buildして純正Android上で再試験する。framework、SELinux、privapp/product設定、boot/vendor/partition/AVBを変更した場合はOS imageの再buildが必要になる。

事前gate合格後に初回full buildを一度行い、同じ作業環境でtarget-files、factory image、OTAを生成する。サーバーや永続volumeは成果物hashを退避しただけで直ちに破棄せず、最初の実機flash／bootと修正要否を確認するまで保持する。full build自体でしか見つからないSoong、SELinux、device統合不具合は残り得るため、1回で必ず完了するとは表示しない。

## 実装した入口

- `os/physical/frankel-source-lock.json`：Pixel 10／frankelの候補版、manifest、adevtool、端末hook、kernel参照を固定。対象確認・OS build・boot・flashは未完了のまま。
- `os/physical/rockstaros.mk`：既存のRock自動化／記事Toolを端末OSのproductへ組み込む。UID・SELinux・AVB・端末ドライバーは上流を維持。公式GrapheneOSの更新サービスを使う`OFFICIAL_BUILD=true`を拒否。
- `scripts/prepare-phone-build.py`：容量診断、cleanなRock commit固定のRepo manifest出力、上流署名タグ・adevtool参照・端末hookの一致検証、1か所だけの再実行可能なsource変更。既存のローカル変更を上書きしない。
- `scripts/build-phone-bringup.sh`：lockのdevice／SKU確認が完了した準備済みLinux環境で、lock由来の`userdebug` lunch／build targetを実行する入口。未確認lockはフルbuildを拒否し、source一覧とRock commit、端末hook差分を保存する。クラウド作成・正式署名・端末操作は含まない。
- `scripts/inspect-phone.py`：選択した1端末の機種・SKU・build・起動状態を必要なプロパティだけ読み取る。serialを出力せず、初期化／再起動／root／書込みを実行しない。空の値を適合と判定しない。

この最初の組込みは、既存Android P1の2工程が入った**端末起動のための試作**。Linux nativeのHub・Wallet・Gameは未移植。最終的には商品導入／同意／実行／取消、本人認証・台帳・費用／入金、保存・復旧をAndroidの接続層へ移植し、既存の業務契約と照合する。QEMUのframebuffer、Unix socket、固定UIDをそのままAndroidへ持ち込まない。

## 確認した上流

調査時の安定版`2026090700`のmanifest commitは`726237f979e7a36cc644f0a784f62ee27fee419b`。公式公開鍵でタグ署名を検証済み。AOSP基底は`android-17.0.0_r1`。1108 projectの全取得やbuildは未実行。[公式リリース](https://grapheneos.org/releases#frankel)／[公式build手順](https://grapheneos.org/build)。

固定adevtoolは`144f004cc484d7e7234cdd167cee48e5f240288f`。生成された大きなproduct makefileを直接編集せず、[端末別の小さいhook](https://github.com/GrapheneOS/adevtool/blob/144f004cc484d7e7234cdd167cee48e5f240288f/config/mk/google_devices/device/frankel/device.mk)へRock共通productのinheritを追加する。実機kernelはlaguna／muzel／6.6。QEMUのvirt向けimageは使用しない。

再開時は上流の更新・セキュリティ修正を再確認し、必要ならlockを更新して改めて検証する。`prepare`単独はmanifest・adevtool・kernel・hookの確認。local manifestはこのRock project1件の追加だけを許可し、上流projectのoverrideを拒否する。build入口はさらに`repo forall`で全取得projectの固定commitと作業木を確認し、指定hook以外の変更・未追跡ファイルを拒否する。実出力は専用`out`へ固定し、その容量を調べる。全projectの確認処理自体は、まだ実際の1108project上で実行していない。準備確認を再現buildの成功と表示しない。

## ビルド環境の具体案

現在のMacはmacOS／ARM64、RAM16GiB、内蔵空き約4.6GiB。既存のARM64 Limaも公式のx86_64 Linux条件を満たさない。外付SSDの空きだけではCPU・RAMの問題を解消できない。公式GrapheneOS条件はRAM32GiB以上、軽量source取得90GiB以上＋build100GiB以上。初回はRAM64GiB／空き400GB程度のLinuxを用意する。[GrapheneOS要件](https://grapheneos.org/build#build-dependencies)／[AOSP要件](https://source.android.com/docs/setup/start/requirements)。

公開repoの標準GitHub runnerは無料だが、LinuxはRAM16GB／SSD14GBで今回の全OS buildには不足する。[GitHub公式仕様](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

候補はDigitalOceanのCPU-Optimized Regular、32vCPU／64GiB RAM／400GiB SSD、Ubuntu 24.04 x86_64。公式表示は**1.00 USD/時**。8時間使用の計算例は8 USD、24時間なら24 USDで、これは作業完了時間の見積りではない。税・追加サービス・追加転送・成果物保存費は別。利用可能な地域・台数枠・実際の注文料金は作成時に確認する。[公式料金](https://www.digitalocean.com/pricing/droplets)。

有料環境はまだ契約・作成していない。利用者のアカウントと予算枠が決まったら、専用環境1台でsource取得→build→成果物保存まで進める。電源OFFだけでは課金が続くため、終了時は必要な成果物の保存・hash読戻し後に、この用途のサーバーを削除して課金終了を確認する。自動削除や費用上限の制御はまだ実装していない。[課金の扱い](https://docs.digitalocean.com/products/droplets/details/pricing/)。

## 事前gate合格後の準備済みLinuxでの実行順

以下は未実行の全OS手順。上の事前gateが全て合格し、初回対象がPixel 10の正確なSKUまで確定してから専用環境を用意して実施する。

1. 上流build手順に従い依存物を入れ、空のOS作業ディレクトリで`repo init -u https://github.com/GrapheneOS/platform_manifest.git -b refs/tags/2026090700`を実行する。
2. 公式の`https://grapheneos.org/allowed_signers`をその環境の専用公開鍵ファイルへ取得し、manifestのタグ署名と固定commitを検証する。ユーザー全体のGit設定は変更しない。
3. cleanなRock checkoutから`python3 scripts/prepare-phone-build.py manifest`でXMLを生成し、OS作業ディレクトリの`.repo/local_manifests/rock-phone.xml`へ保存する。Rockは`external/rockstaros`へ取得され、既存Cuttlefish専用設定と混ぜない。
4. `repo sync -c -j8`を完了する。公式手順の`source build/envsetup.sh`、`yarn --cwd vendor/adevtool/ install`、`adevtool generate-all -d <lockのdevice>`を実施し、vendor取得・照合結果を保存する。
5. lockへ所有者が正確な機種と既知SKUを確認済みとして記録してから、OS作業ディレクトリで`bash external/rockstaros/scripts/build-phone-bringup.sh "$PWD" /absolute/path/to/grapheneos_allowed_signers`を実行する。入口はRAM 64 GiB以上・空き400 GiB以上を検査し、prepare後とrepo全体検査後にlock指定hookのバイト列を再検証する。初回Soong/OS buildの実エラーを解消し、成功した同一sourceと出力hashを記録する。対象機種の`userdebug`出力は開発試験用。
6. Hub／Wallet／Gameの移植、Rock独自の表示、Android正式署名、OTA・復旧を整える。機種・SKU・現在build・backupを確認して、書込み手順を別途確定する。

端末の読み取り診断は、adb導入済み・USB接続承認済みの環境で`python3 scripts/inspect-phone.py --serial <本人が選んだ端末ID>`。実行出力を公開Gitへ自動保存しない。今回この診断を実機には実行していない。

## 配布・署名・実機受入

改変版はRockstarOSという別OSとして表示し、GrapheneOSの公式製品を名乗らない。[商標方針](https://grapheneos.org/faq#trademark)。Googleのfactory／vendor／firmwareは個別の利用・再配布条件を確認する。取得可能という理由で独自配布の許諾済みにしない。[Google配布条件](https://developers.google.com/android/images)。

今の2APKは公開testkey設定。既存のMac配布用Ed25519署名をAndroidのAVB／APK／APEX／OTA署名に転用できない。端末の信頼鍵、継続更新、失効・復旧、独自更新先の設計が必要。[Android署名](https://source.android.com/docs/core/ota/sign_builds)／[AVB](https://source.android.com/docs/security/features/verifiedboot/avb)。

最終合格は対象実機での起動、画面／入力／通信／充電／省電力／熱、Hub／Walletの利用、保存・再起動、更新失敗・純正状態への復旧を含む。実機書込み前には現在のOSとデータを失う範囲を具体的に確認する。ソース設定・署名fixture・エミュレーター成功だけでこの合格を付けない。

## この変更の検証

Mac上で、実Gitの署名タグ・source変更保護・異なるrevision拒否、lock整合、full-build gate、hook再検証、host容量境界と端末診断の制限を対象に10件PASS。shell構文と既存`os:check`もPASS。`npm run verify`は型・lint・93 tests・build・143 API assertionsを含めPASS。初回fixtureの一時pathがmacOSの`/var` symlinkを正規化していなかった失敗を修正した。実Soong、全source同期、クラウド実行、端末接続は未実行。[証拠要約](evidence/launch/phone-source-preparation-20260911.json)。
