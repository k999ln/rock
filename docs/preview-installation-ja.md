# RockstarOS 1.0 Developer Preview — 最初の導入と復旧

このガイドは `macos-arm64` 配布候補の操作手順です。配布候補の作成と受入合格は別です。公開前に、取得先の受入記録が **自分の archive の SHA-256** と一致し、D0〜D6・Game/SDK・fresh 導入の結果を示すことを確認してください。未合格の候補を完成版と呼びません。

Hub の仕事、保存した成果、合成 Wallet の費用を一つの仮想端末で確認します。初めての導入では既存 VM の名前・保存先・秘密値を用意する必要はありません。インストーラーがこの導入専用の Linux VM を作ります。

## 対応環境と準備

- 受入対象: **macOS 15.7.4 / Apple Silicon arm64 / Lima 2.2.0**。Python 3.11 以降、OpenSSL 3 が必要です。Mac そのものは初期化しません。
- 作成する中間 VM: Debian 13 arm64、Lima VZ、2 CPU、3 GiB RAM、16 GiB の仮想ディスク。その中で ARM64 QEMU `virt-10.0` を実行します。
- 初回には空き容量 10 GiB 以上とインターネット接続が必要です。中間 VM の base image は URL と SHA-512 を配布 manifest に固定しています。Debian の署名付き apt repository から依存を導入し、実際の版を診断記録へ保存します。
- 別の macOS / Intel Mac / Windows / Linux host、BlackBerry、Pixel への native OS 導入は、この package の受入範囲に含みません。端末へ image を書き込まないでください。
- この配布のローカル表示には署名 manifest に固定した `127.0.0.1:8900` と `127.0.0.1:5910` を使います。使用中なら他のアプリを勝手に止めず、理由を表示して終了します。既存の launcher v1/v2 が使う `8899/5909` は変更しません。

既に Homebrew を導入済みなら Python と OpenSSL は `brew install python openssl@3` で準備できます。Lima は 2.2.0 の導入を確認してください。異なる版は自動的に「対応済み」にしません。

## 配布物を検証する

取得するファイルは、版付き `rockstaros-<版>-macos-arm64.tar.gz`、`release-manifest.json`、`release-key.der`、`SHA256SUMS`、`preview.py`、このガイドとリリースノートです。

**信頼の起点:** 実行する `preview.py` は、正本 `k999ln/rock` の受入済み source commit から信頼できる経路で取得してください。署名鍵の fingerprint と manifest の SHA-256 は、配布物とは独立した、その commit に結び付く公開記録から照合します。未検証 archive から取り出したプログラムを先に実行してはいけません。archive に鍵が入っているだけでは配布元を認証できません。

この開発候補の OS 署名は **公開 RFC8032 試験鍵** です。その秘密 seed も公開されているため、本番配布元の真正性は保証しません。試験用 release-key.der の SHA-256 は次の値です。

```text
06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9
```

`MANIFEST_SHA256` は受入記録の値、`ARCHIVE` は実際のファイル名へ置き換えます。manifest の値を同じ未検証 archive からコピーして「信頼済み」としないでください。

```sh
python3 preview.py verify \
  --manifest release-manifest.json --archive "$ARCHIVE" \
  --trusted-key release-key.der \
  --trusted-key-sha256 06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9 \
  --manifest-sha256 "$MANIFEST_SHA256" --allow-public-test-key
```

`VERIFIED` は署名と配布ファイルの一致です。OS の受入や製品ライセンスの確認済みを意味しません。既存の非公開 Ed25519 release key で別途署名した配布物は、発行者が独立して提示する fingerprint を使い、`--allow-public-test-key` を付けません。インストーラーは署名鍵を生成しません。

HTTPS の実際の配布 URL と独立して得た archive hash がある場合は、次の取得入口も利用できます。署名検証はその後に実施します。

```sh
python3 preview.py fetch --url "$RELEASE_ARCHIVE_URL" \
  --sha256 "$ARCHIVE_SHA256" --output "$ARCHIVE"
```

## 新規 VM を作成し、初回起動する

既存の保存先は指定しません。例の親ディレクトリを作成してから、新しい短い名前を使います。Lima の Unix socket 制限のため深すぎる保存先は受け付けません。

```sh
mkdir -p "$HOME/Library/RockstarOS"
ROCK_PREVIEW_ROOT="$HOME/Library/RockstarOS/preview-1"
python3 preview.py install --directory "$ROCK_PREVIEW_ROOT" \
  --manifest release-manifest.json --archive "$ARCHIVE" \
  --trusted-key release-key.der \
  --trusted-key-sha256 06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9 \
  --manifest-sha256 "$MANIFEST_SHA256" --allow-public-test-key
python3 preview.py start --directory "$ROCK_PREVIEW_ROOT"
```

署名と hash の検証が終わってから、専用 `lima/`、VM `os`、初期端末 `preview` を作成します。ユーザーの通常の `LIMA_HOME`、既存 VM、home directory を guest へ共有しません。配布物だけを読み取り専用で渡し、保護された guest path へコピーします。image triple、stage0 factory の署名、組込み source と公開試験認証器の一致を確認してから起動入口を保存します。

画面は実 OS の framebuffer です。QEMU の起動には待ち時間があります。VNC の一時 password は URL fragment を経由して画面へ渡し、診断出力に保存しません。

## Hub の引用整理を使う

Hub で「引用整理」を開き、用途・作者・版・権利・実行先・費用と許可を確認します。商品が必要とする準備を満たしてから、次の公開／合成テキストで実行します。

```text
資料 A https://example.com/a
資料 B https://example.com/b
資料 A https://example.com/a
```

結果画面の出力を確認し、Hub の履歴から同じ保存結果を再表示します。引用整理は入力の整理です。記事生成、出典の真偽確認、自動納品、売上発生とは扱いません。Wallet で見積・予約・確定費用・保留・入金の区別と「合成」「未接続」の表示を確認してください。実行成功から実売上や実資金を作りません。

Game 接続・交換はその配布候補に対応する SDK/OS 受入記録と同梱サンプルの範囲だけを試します。独立した game server の DB は、このオフライン端末 backup に含まれません。逆方向交換、実資金、実ゲームを有効化する手順ではありません。

## 正常終了と再開

**画面を閉じるだけでは OS は終了しません。** OS 右上の端末操作から「電源を切る」→「確認して実行」を選びます。次のコマンドはその操作を案内し、所有する QEMU が停止するのを待ちます。強制電源断は行いません。

```sh
python3 preview.py stop --directory "$ROCK_PREVIEW_ROOT"
python3 preview.py status --directory "$ROCK_PREVIEW_ROOT"
python3 preview.py start --directory "$ROCK_PREVIEW_ROOT"
```

再開後に Hub の保存結果と Wallet 履歴を確認します。設定や VM の identity が違えば、別の端末として黙って扱わず停止します。

## 停止済み backup と別の復元先

OS 内から正常終了してから実行します。A/B slot と userdata の全体、署名済み update state、clean filesystem と各 SHA-256 を検証します。稼働中、変更された image、不完全な backup、既存の復元先は拒否します。

```sh
python3 preview.py backup --directory "$ROCK_PREVIEW_ROOT" \
  --output "$HOME/Library/RockstarOS/backup-1"
python3 preview.py restore --directory "$ROCK_PREVIEW_ROOT" --name recovered-1
python3 preview.py start --directory "$ROCK_PREVIEW_ROOT"
```

`--output` は新しい保存先です。guest 内の検証済み backup に加え、別の host directory へコピーし、disk hash を再照合します。backup は暗号化されていません。許可された合成入力だけを試してください。

復元は **同じ所有 VM の新しい offline 端末名** へ行います。元端末は保持し、この launcher からの起動対象から外してから復元先を active にします。元と復元を同時に動かす手順はありません。復元先で保存結果・Wallet 履歴・通常終了を確認してください。任意の過去 backup や別 host、外部 game 台帳まで整合する一般的な災害復旧機能とは違います。現在の `restore` 入口は同じ VM 内の直近 backup を使用し、host export の別 VM への再投入は未対応です。

## 削除と残るもの

必要なら停止済み backup を別 host directory へ export してから、すべての端末を正常終了します。

```sh
python3 preview.py remove --directory "$ROCK_PREVIEW_ROOT" --delete-data
```

この導入が作成し、identity を記録した VM のみを削除します。その VM 内の OS、A/B slot、userdata、内部 backup は削除されます。host 側の package・診断・所有権記録と、別先へ export した backup は残ります。表示 server は、この導入の instance・build・process・loopback socket 所有をすべて確認できたものだけ終了します。別のアプリへ PID が再利用されていたら停止しません。Lima の `--force` は使いません。所有権記録が一致しない VM は止めません。

## 失敗時の診断

```sh
python3 preview.py diagnose --directory "$ROCK_PREVIEW_ROOT"
```

導入時の Linux/依存版、source、active/retired device、VM の状態を確認できます。生の成果・Wallet DB・表示 password を診断出力に含めません。

- 署名・hash 不一致: 入手経路と独立 pin を照合して再取得します。検証を解除しないでください。
- download / apt / VM 作成の失敗: `provision.log` と `installation.json` を読みます。元の環境は変更せず、作成途中の専用資源を保持します。identity が確認できる失敗 VM の削除入口は `python3 preview.py cleanup-failed --directory "$ROCK_PREVIEW_ROOT" --delete-data` です。再導入は新しい保存先を使います。
- VM socket path が長い: `Library/RockstarOS/` の直下に短い新規名を選びます。
- 表示 port が使用中: 先に開いた RockstarOS を通常終了します。他アプリの listener は自動停止しません。
- userdata が clean でない: 自動修復や初期化を行いません。元データを保持し、直前の正常終了・backup の記録を確認します。
- source / VM identity が違う: 保存先を転用せず、既存データを保全します。新しい image の移行は別候補の受入と復旧手順が必要です。

公開・ライセンス条件と確認済みの範囲は、同梱の `preview-legal-notice.md` と `preview-release-notes.md` を参照してください。
