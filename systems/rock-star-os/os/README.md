> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Rock star os — OS本体の開発

このディレクトリは、Linuxカーネルとroot filesystemを生成するOS開発用です。既存のPython Hubとは独立して起動する構成です。最初の対象はQEMU `virt` のARM64仮想端末で、BlackBerry機種は未定です。このイメージをBlackBerryへ書き込むことはできません。

## 最初の成果と範囲

- Buildrootの固定版ソースからLinuxカーネル `Image` とOS本体 `rootfs.ext4` をビルドする。
- 読み取り専用のOS本体と、書込み可能なデータ用ディスクを分ける。
- OSのinitが、一般権限の専用ユーザーで `rockd` を起動する。
- 端末内IPCで状態確認と有限の文章整形を実行し、完了件数をデータ領域へ永続化する。
- 仮想端末をネットワークなしで起動し、再起動・許可されていないユーザー・入力制限を検証する。

0.1起動基盤は2boot・権限・永続化PASSです。0.2ではnative Hub（C/Cairo、直接framebuffer）、UID分離したplatformとWallet simulator、bubblewrap/seccompの有限Tool隔離、署名HTTPS取得、実TLS runner、A/B stage0を実装し、Linux6.18.50のguest統合・native入力・A/B8+13boot・Wallet/ATMを限定条件で実証しています。実行入口は`verify-platform.py`、`update/verify-qemu.py`、`ui/`のGUI検証です。最新PASS/FAILは実reportを参照し、実装済みと実証済みを区別します。BlackBerry用BSP、実Wallet・ATMは未完了。Toolの成功を収益として扱いません。

現在の文章整形は、IPC・入力上限・永続化を検証する診断用処理です。製品のToolをOSへ大量に直接組み込む方針ではありません。製品のToolは独立した配布パッケージとし、標準Hubから導入するという要求を維持します。

## ビルド

Linux環境にBuildrootのホスト依存パッケージとQEMUのARMシステムエミュレーターが必要です。macOSではLinux仮想環境を使用します。ソースを空白のないLinuxパスへ置き、生成中のファイルはLinuxのファイルシステムに保存してください。

```sh
bash os/build-os.sh
```

ソース取得先とSHA-256は `source-lock.json`、製品設定は `buildroot/configs/rock_virt_aarch64_defconfig` に固定しています。ビルド領域は `ROCK_BUILD_DIR` で変更できます。デフォルトはLinux内の `/var/tmp/rock-star-os-build-<uid>`。結果はリポジトリの `artifacts/os/` に保存されます。

出力: `Image`、`rootfs.ext4`（0.2は384MiB）、`stage0.cpio.gz`、ビルド設定、ソース固定情報、SHA-256、実ビルドログ。設定ファイルがあるだけではビルド成功にしません。起動試験も別の記録が必要です。

## 生成したOSを起動して検証する

```sh
python3 os/verify-boot.py
```

QEMU 10.0以降と `mkfs.ext4` のあるLinux環境で実行します。新規の64MiBデータディスクを検証専用フォルダーに作り、同じディスクを使ってOSを2回起動します。既存のデータディスクを初期化する操作は含みません。各起動は180秒で打ち切り、失敗を記録します。

検証は、カーネルのARM64起動、OS本体の読み取り専用マウント、データディスクの制限、専用UIDのサービス、異なるUIDの拒否、入力制限、サービス異常終了後の復旧、OS完全停止後の件数保持を対象にします。`artifacts/os/verify-<時刻>-*/` の `report.json` と `boot-1.log`、`boot-2.log` を確認してください。PASSはこの限定された起動基盤に対する判定で、一般ツール隔離、OS更新復旧、BlackBerry対応のPASSではありません。

生成物のハッシュを記録しますが、別のマシンでビット単位に同じイメージになることは未検証です。

## 保存先とAOSPへの展開

開発時は外付けストレージ内のLinux VMでbuildとQEMU起動を検証しました。個別のボリューム識別子・VM manifest・既存データはGitへ移管していません。新しい環境では保存先と必要容量を明示して準備し、他の開発環境のディスクを流用・初期化しないでください。

AOSPを全面的にビルドする場合、公式の目安は64-bit x86 Linux、64GB RAM、空き400GBです。このMacはARM64・RAM16GiBなので、容量を増やすだけでは公式のホスト条件は満たしません。対応Linux build機は未契約です。exFAT上にAOSPの作業ツリーを直接展開しません。

小規模なBuildrootによる起動基盤は、この準備と並行して検証するためのものです。Android/AOSPの代替対応を達成したとも、Buildroot用ドライバーがBlackBerryへそのまま使えるとも扱いません。最終OS基盤の選択には型番・ドライバー・復旧・更新保守の実測が必要です。

## 出所

- [Buildroot公式マニュアル](https://buildroot.org/downloads/manual/manual.html)
- [AOSP公式の開発環境条件](https://source.android.com/docs/setup/start/requirements)
- [QEMU ARM virt](https://www.qemu.org/docs/master/system/arm/virt.html)

BuildrootとLinux等の第三者ライセンスはそのまま適用されます。一般公開の配布ライセンスと本番の信頼鍵は未決定です。この成果はローカル開発用で、公開リリースではありません。
