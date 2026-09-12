# RockstarOS 多機種対応アーキテクチャ

決定日: 2026-09-12。利用者は、共通のRockstarOS体験を維持しながら、Pixel、対応可能なAndroid、BlackBerry、iPhone/iPad、PC・仮想端末へ提供形態を分ける方針を選択した。本書は設計決定であり、新しいOS image、実機対応、クラウド契約、端末書込み、production署名の完了記録ではない。

機械可読の正本は [`data/device-support-matrix.json`](../data/device-support-matrix.json)。`npm run device-support:check`は、未確認端末を対応済みまたはflash可能へ変更する誤りを拒否する。

## 一つの製品、四つの提供区分

| 区分 | 意味 | 現在の例 |
| --- | --- | --- |
| `native_os` | RockstarOSのOS imageを対象環境で起動する。物理端末は機種別受入が必要 | QEMUは内部限定受入、Pixelは候補のみ |
| `gsi_experimental` | Trebleとunlock条件を満たすAndroidへ機種別に試験する | 汎用Androidは計画段階 |
| `client_only` | 既存OSを置換せず、最小権限clientからSky・Wallet・remote jobを利用する | iOS/iPadOS、現時点のBlackBerry Android |
| `unsupported` | 安全な導入・更新・復旧経路がないため製品対応を表示しない | BBOS／BlackBerry 10の旧端末 |

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
2. Pixel 7／`panther`とPixel 10／`frankel`を候補のまま保持し、所有端末を読取り専用で確認して最初のDSPを一つ選ぶ。
3. 予算承認後に専用Linuxで選択端末の全source buildを行う。
4. 選択端末の実機受入後、Treble端末を`gsi_experimental`として一機種ずつ追加する。
5. BlackBerry Androidは正確なモデルにsupported unlock・vendor・recovery経路がある場合だけ実験候補へ上げる。旧BlackBerryは非対応を維持する。
6. iPhone/iPadはOS置換ではなくclientとして共通Coreへ接続する。

この順序により、Coreの改善をすべての提供形態へ反映しながら、機種固有の失敗を他端末やWallet契約へ波及させない。
