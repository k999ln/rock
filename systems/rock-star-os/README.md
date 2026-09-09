# Rock star OS — Linux native開発

標準HubからToolを取得するOSの試作。Linux / Buildroot / ARM64 QEMU virtで、kernel・root filesystem・専用サービス・native画面を開発する。

**このイメージはBlackBerryへ書き込めない。** 初期製品はBlackBerry優先だが機種・variant・BSPは未定。製品方針と既存Android/Webとの関係は [現行方針](../../docs/native-os-integration.md)を参照する。

## 配置と入口

このディレクトリをnative開発の作業rootとする。親の `os/` は既存AOSPであり、取り違えない。

| 内容 | 入口 |
| --- | --- |
| kernel/rootfs | `os/build-os.sh`, `os/source-lock.json`, `os/buildroot/` |
| OSサービス・native画面 | `os/core/`, `os/platform/`, `os/ui/`, `os/system/` |
| Hub・Tool/recipe SDK | `src/blackberryrock/`, `schemas/`, `examples/`, `docs/TOOL-SDK.md` |
| 署名配布・実行・更新 | `os/registry/`, `os/runner/`, `os/update/` |
| 購入者・Wallet・MCP | `os/entitlement/`, `os/wallet_auth/`, `os/wallet_backend/`, `os/service_access/`, `os/mcp_broker/` |
| AI処理先と予算・運営 | `os/ai_routes/`, `os/operations/` |
| 取得時のhashと移植差分 | `IMPORT-MANIFEST.json`, `INTEGRATION-NOTES.md` |

Python package名 `blackberryrock` は互換名として維持する。これとは別の製品・運用正本を作る意味ではない。

## 検証

Linux、Python 3.13、C compiler/make/pkg-config、OpenSSL、e2fsprogs、libseccomp/cairo/freetype/json-cの開発用ライブラリを用意する。OSのイメージがなくてもsource回帰は実行できる。

```sh
# Rockリポジトリrootで実行。出力先はまだ存在しないフォルダーを指定。
python3 scripts/test-native.py --output work/native-tests
```

Pythonの6suite、Cのcompile・UI/IPC、画面検証用observerの否定試験を実行する。公開された合成fixtureだけを使用する。C coreの別UID試験はrootを要するためこの通常host検証には含めず、使い捨てguestの起動受入で扱う。結果は `report.json` と各logに保存し、入力hashの前後一致も確認する。

```sh
# このnativeディレクトリへ移動してSDKを使う。
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -e .
rock-sdk --help
```

Tool作成・署名・配布の詳細は `docs/TOOL-SDK.md`。同梱の開発鍵は公知の試験fixtureで、本番の作者・端末・TLS認証へ使用しない。

## OSのbuildと起動

空白を含まないLinuxパスへこのnativeディレクトリを配置し、[build手順](os/README.md)を使う。新しい空のbuild領域を指定し、成果物はこの下の `artifacts/os/` へ生成する。公開GitにはOSディスクを入れない。

```sh
cd systems/rock-star-os
ROCK_BUILD_DIR=/var/tmp/rock-native-build bash os/build-os.sh
python3 os/verify-boot.py
```

Buildroot本体と依存ソースの取得・compileが必要。ソースを追加しただけで今回のcheckoutのOSを再build/bootしたとは扱わない。第9のQEMU証拠と、今回の配置のsource試験は別記録とする。

`os/desktop/launcher.py` は従来のMac/Lima開発環境用で、VM名 `rock` とguestパス `/mnt/rock-source` を前提とする。個別環境のmanifest・鍵・ディスクは含めていない。このcheckoutを開くだけでその環境やBlackBerryの利用準備が完了するわけではない。

## ライセンスと未完了項目

独自コードの一般再利用ライセンスは未選定。第三者のfont・noVNC・Tool由来コードのLICENSE/NOTICEと固定出所を維持する。ソース閲覧と製品の安全性・本番配布許諾は別である。

実機のdriver/省電力/更新、実USB、外部MCP/AIの相互運用、金融provider・ATM・ToB精算、本番運営は未完了。Walletと売上fixtureを実資金として使わない。起動応答確認の追加案は `experiments/startup-health/` に未検証patchとして保存し、通常のbuildには適用していない。
