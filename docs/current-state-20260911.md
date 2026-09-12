# RockstarOS — 現在の開発状態と再開条件

## 2026-09-12 — Sky自動化収益からの最大8.88 USD精算

先払いのToC月額課金は利用者意図と異なるため停止した。Wallet画面、認証済み短命token、独立Cloudflare Worker、署名済みEarning Receipt、D1月次精算・追記型台帳・払出し指図を実装した。Workerは自動化のExecution Receipt、Provider入金参照、証拠hashを一意に結び、直接実費を先に回収した残額からだけ、利用者ごと・UTC月ごとにSky利用料を最大888 USD centsまで記帳する。同じReceipt再送は冪等、異なる内容の再利用は拒否する。ToB分は0、売上0時の請求・債務化・翌月繰越・カード請求はない。

これは精算核のコード到達であり、実売上開始の証拠ではない。販売、納品・承認、決済、払出しの実Provider、販売主体、資金保管、本人確認、税、返金、chargeback、live資格情報、sandbox照合が未接続で、実入金・実回収・実送金は無効。旧Checkout、Portal、Stripe subscription webhookは410で停止する。詳細と再開順は[Sky自動化収益の精算](sky-billing.md)。

## 2026-09-12 — 多機種対応の決定

多機種対応を「共通RockstarOS Core＋機種／SKU別Device Support Package」として固定した。一つのimageを無条件に全端末へ書き込むとは扱わず、`native_os`、`gsi_experimental`、`client_only`、`unsupported`の4区分を機械可読台帳で管理する。完全OSを名乗るにはbootloader unlock、kernel／vendor／firmware、partition／AVB、boot／OTA／rollback／stock復旧の機種別証拠が必要。[設計](device-support-architecture.md)／[対応台帳](../data/device-support-matrix.json)。

最初の物理端末はまだ0台で、Pixel 7／`panther`とPixel 10／`frankel`はいずれも候補。BlackBerry Android機は正確な型番と解除経路が判明するまでclient-only、旧BlackBerry OS機は非対応。Apple署名boot chainを置換するiPhone／iPad版は対象外で、既存iOS／iPadOS上のclientとして扱う。この決定はクラウド課金、実機書込み、production鍵、一般公開を許可しない。

## 2026-09-12 — GitHub・実装・実機版・ビルド環境の再監査

この節を現在の進捗差分として追加する。2026-09-12 04:48 JST時点で、mainは`7cdbb5fedc86ee3978ed329d9312147d137c9199`、開発本体は`codex/rockstaros-launch-candidate-20260910`の`c182a5b9c8f5f4da59528a41980eb98750ebd234`。製品全体の確認先である[Draft PR #4](https://github.com/k999ln/rock/pull/4)はOPEN／CLEANで、同HEADの12 checkは全てSUCCESSだった。うちスマホ向けcheckの名称自体が`Phone source preparation (not OS boot)`であり、全OS buildや実機起動の証拠ではない。open PRは#1〜#6の6件で、main mergeと一般公開は未実施。機械可読snapshotは[進捗再監査](evidence/launch/progress-audit-20260912.json)。

進捗表は41 task中19 done、15 in progress、7 planned。段階gateは13件中10 done、3 planned。各taskの大きさが異なるため、19/41を製品完成率やスマホOS完成率へ換算しない。この再監査は実装状態の読み取りと文書同期であり、新しいruntime、OS image、署名、Site配信を作成していない。

| 対象         | 到達している範囲                                                                                | 未完了の決定的条件                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Web / Sites  | Sky中心の画面、仕事・履歴・Wallet・設定、本人限定の新Site                                       | 所有者ログイン後の本番操作確認、一般公開                                                                                     |
| Linux / QEMU | `1.0.0-preview.20260911-rc2`の内部導入、起動、保存、再起動、同一VMの中断復旧、D4/D6等の限定受入 | 正式署名、license clearance、取消の実停止、RSS再確認、別host／VM全損復旧、保存データあり端末の削除                           |
| Android P1   | 通常権限の2APK、SQLite／Binder／JobScheduler、emulator CI                                       | Sky／Wallet／GameのAndroid移植、実機OS統合                                                                                   |
| スマホOS     | 上流版と候補機種のsource lock、product makefile、準備／build／診断script                        | 全source取得、vendor生成、Soongフルbuild、target-files／OTA／factory image、正式Android署名、flash、実機boot／更新／純正復旧 |
| Wallet／Game | 合成台帳、複数owner/gameのfixture、作者SDK、ATM自社手数料0の契約                                | 実provider、KYC／提供地域／資金保管／通貨／返金／出金／照合、指定実ゲームの正式sandbox                                       |
| Release      | PR #4の現HEAD CI成功、本人限定Site、CM制作途中                                                  | license、第三者許諾、production鍵、実署名、公開受入、main統合                                                                |

### スマホ対象の不一致

現在のsource lockはPixel 10の`frankel`、build targetは`frankel-cur-userdebug`。一方、直近の相談ではPixel 7が対象として挙がっている。Pixel 7ならGrapheneOSの機種名は`panther`であり、`frankel`向け設定・vendor生成・kernel／device hook・出力をそのまま使用できない。実際に使う端末の型番、地域SKU、現在OS、OEM unlocking可否を`inspect-phone.py`等の読取り専用診断で確認するまで、`targetConfirmed=false`とし、クラウドの全OS buildや端末書込みを開始しない。

### ビルド環境の再評価

重い資源が必要なのはRockのWebコードではなく、Android／GrapheneOS全sourceの取得とコンパイルである。[AOSP公式要件](https://source.android.com/docs/setup/start/requirements)は64-bit x86、最低64GB RAM、400GB以上の空き容量を示す。[GrapheneOS公式手順](https://grapheneos.org/build)もUbuntu 24.04 LTS x86_64と大容量source／build領域を前提にする。GPUは不要。

最初の一回を短く進める候補はDigitalOcean CPU-Optimized Regular。32 vCPU／64GiB／400GiBの1.00 USD/時案は総容量がAOSPの「400GB空き」に近すぎるため、安全側の候補を48 vCPU／96GiB／600GiB、掲載価格1.50 USD/時とする。[料金表](https://www.digitalocean.com/pricing/droplets)。停止だけでは課金が終わらないため、成果物とhashを退避後に対象Dropletを削除する。[課金仕様](https://docs.digitalocean.com/products/droplets/details/pricing/)。反復buildやディスクの保持・再接続を重視する場合はGoogle Cloud Compute Engineの16〜32 vCPU／64〜128GB RAM／600GB〜1TB persistent diskを代替候補とするが、停止中もディスク代は残る。[Persistent Disk料金](https://cloud.google.com/compute/disks-image-pricing)。

以前の税別10 USD案は未承認のまま保持する。ただし1.50 USD/時では約6.7時間分で、初回のsource取得、build error修正、再試行まで保証できない。初回計画枠は税別20〜30 USDを安全側の提案とし、`approvedBudget=null`、`cloudProvisioned=false`、`spendIncurredByThisWork=false`を維持する。これは価格調査と推奨構成の更新であり、契約・課金の開始ではない。

### 次に進める順番

1. 実際に使うPixelの型番／SKUを読取り専用で確認し、Pixel 7なら`panther`、Pixel 10なら`frankel`へsource lockとbuild入口を一つに固定する。
2. クラウド事業者、アカウント、上限予算、成果物保存先、時間上限と削除手順を確定する。
3. Ubuntu 24.04 x86_64で全source取得、`adevtool generate-all`、Soongフルbuildを行い、同一source・出力hash・失敗ログを保存する。
4. Android P1の2APK同梱とは別に、Sky／Wallet／Gameの接続層をAndroidへ移植し、既存のowner／同意／台帳／取消／復旧契約と照合する。
5. 開発鍵で対象実機の初回bootと基本hardwareを確認した後、AVB／APK／APEX／OTAのproduction鍵、独自更新先、失効、rollback、純正復旧を整える。
6. CTS／VTS／SELinux、保存・再起動・省電力・熱・通信、OTA失敗／rollbackを対象実機で受け入れる。
7. license、第三者許諾、本人限定Site QA、CM、最終署名配布、PR整理を完了してから一般公開とmain mergeを別途判断する。

したがって、現在不足しているのはクラウドサーバーだけではない。スマホ版は「ビルド入口まで」であり、フルbuild、Androidへの製品移植、production署名／更新、実機受入、実provider／公開条件が残る。QEMU Developer Previewの内部到達は保持するが、スマホへ書き込める完成OSや本番金融対応として表示しない。

2026-09-11、利用者の「ここまでのところをrockに矛盾しないように追加して」に従い、スマホ版の準備をローンチ候補の開発本体へ統合した。本書と`data/project-status.json`を現在の入口にする。日付付きの過去の成功・失敗は保持し、古い「次の作業」を現在の指示として実行しない。

## 製品の方針

RQ01〜RQ17、Sky＋Walletを中心とする製品、自作ゲーム交換／作者SDK、tobの商品供給、PC／cloud／self-hostの実行先を保持する。既存の月888 USD cents／同一契約の複数端末重複防止、RockのATM手数料0、未定のゲーム料金を変更しない。実行成功を実売上へ変換しない。

スマホ本体へ書き込めるOSを作るという最新指示を実機版の開発方針へ追加した。現在のPixel 10／GrapheneOS候補は以前の端末記録に基づく。今回の対象機種・SKUは未確認で、BlackBerryの型番も未確認。全機種対応・既存OSとの共存・データ無消去の入替えを約束しない。

## 実装と検証の区分

| 対象                     | 現在確認できること                                                                                            | 残ること                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Linux / Buildroot / QEMU | b7/rc2の内部導入、起動、保存、再起動、同じVMでの中断復旧と追加受入を限定確認                                  | 正式署名後の最終配布受入、キャンセルの実停止、メモリ増加の確認等           |
| Android P1               | 通常権限の2APK、SQLite／Binder／JobScheduler、標準エミュレーターCI                                            | 実機確認、Sky／Wallet／Gameの移植                                          |
| Pixel候補のOS            | GrapheneOS安定版の署名タグ確認、機種構成へのRock組込み設定、source検査、Linux build入口、読取り専用診断を実装 | 全source取得、Soong／OS build、正式Android署名、起動・更新・復旧の実機受入 |
| Web / Sites              | Sky改修、履歴のコード統合、新しい本人限定Siteの公開                                                           | ログイン後の本番Sky操作確認、一般公開                                      |

QEMUの凍結sourceは`b7d819cd291b653d165aa124f25a52b9898bfb2e`、版は`1.0.0-preview.20260911-rc2`。今回の統合で既存image・配布bytesは変更していない。QEMUの合格をスマホへ移さず、スマホ用の書込み可能imageはまだ存在しない。[rc2受入](os-acceptance-b7d819c-20260911.md)／[追加受入と未観測条件](rc2-remaining-acceptance-20260911.md)／[スマホ版の実装](phone-preview-20260911.md)。

スマホ版は既存Android P1を機種構成へ組み込む段階から始める。LinuxのSky／Wallet／Game契約を維持しながら接続層を移植する必要があり、2APKの同梱だけで製品移植完了にはしない。旧Cuttlefish用`os/source-lock.json`、新しい`os/physical/frankel-source-lock.json`、Linux QEMUのimageは別の入力である。

## 所有者の回答と公開設定

- 権利者公開名は**kaiya**。自作部分の改変・再配布を許可する意向を受領済み。具体的なMIT条文の採用は未回答。第三者由来の条件と配布物の許諾確認は別に残る。
- 署名意思は受領済み。第二承認者は未指定で、本人だけの署名経路を実装・試験済み。本番鍵の生成・保管・実署名は未実施。保護GitHub署名経路と本人署名経路は選択肢であり、PR #5の登録や第二承認者を本人経路の共通必須条件にしない。
- [新しいSite](https://rockstaros-kaiya.noellesugar1.chatgpt.site)は本人限定で公開済み。配信sourceは`a750908329d42bbfb78e07243f414b51d1534cf8`。元SiteのNOT_FOUNDと元DB未復元は別の履歴であり、新Siteも接続不能という意味にしない。今回のGit統合はSites再配信ではない。
- **CMは制作途中**。69秒候補を選定・完成・掲載済みにしない。90秒の技術デモとCMを区別する。

[所有者回答](../data/release-owner-intent-20260911.json)／[本人限定公開の証拠](evidence/launch/sites-owner-private-20260911.json)／[MIT草案](license-proposal-20260911.md)／[本人署名経路](owner-manual-signing.md)。Mac配布用署名はAndroidのAVB／APK／APEX／OTA署名を代替しない。

## Linux環境と費用の回答待ち

利用者から「使えるLinux PC／サーバーはない」と回答を受領した。前回、クラウド候補と初回サーバー代**税別10 USDまで**を提案したが、費用の承認はまだ受けていない。今回の「rockに追加して」は記録と開発branch統合の指示であり、契約・支払いの承認に換算しない。

クラウドのアカウント、利用可能枠、予算、保存先、終了・課金停止の手順を揃えてから、専用x86_64 Linuxで取得・buildを進める。サーバー・鍵は未作成、自動削除や費用上限の制御も未実装。前回示した1 USD/時と使用時間の計算例は価格調査の記録であり、OSの完成時間・総費用の保証ではない。[構成と再確認する公式料金](phone-preview-20260911.md#ビルド環境の具体案)。

## Gitへ統合した範囲

スマホ準備のcommit`3eeeeed66ed438f8d543ae88260e072c63bd0132`を、`codex/rockstaros-launch-candidate-20260910`へ履歴を保って取り込んだ。PR #7はその変更単位、製品全体の確認先は[PR #4](https://github.com/k999ln/rock/pull/4)。現在の統合HEADはGit／PRで確認する。

開始時のmainは`7cdbb5fedc86ee3978ed329d9312147d137c9199`。mainへのmerge、一般公開、Sites再配信、クラウド課金、端末書込みは今回実施しない。通常の実装・検証を再承認待ちに戻さず、必要な条件のない操作だけを保留する。

スマホ準備commitのGitHub4check（Web、Android、準備検証のpush／PR）は全て成功。[同一SHAの記録](evidence/launch/ci-phone-3eeeeed.json)。これは全OS buildや実機受入ではない。今回の文書整合後の検証結果は`project.md`、最新HEADのCIはPR #4で別に確認する。

次回の実行入口は[現在の再開指示](prompts/rock-current-next-20260911.md)。ローンチ状態は**BLOCKED_FOR_LAUNCH**を維持する。
