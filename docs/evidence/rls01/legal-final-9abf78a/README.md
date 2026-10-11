# 最終 9abf78a — 配布前の権利資料 inventory

対象 RQ09/12/16/17・RLS01 / 原則: 明確な楽観主義・べき乗則 / 不便: 資料収集と公開許諾の混同 / 再利用: 同じ候補の Buildroot legal-info と独立 readback / 最小変更: 読取専用の資料一覧 / 指標: 警告の原文・資料の所在・未確定条件 / 証拠: [inventory.json](inventory.json)、[読取工具](read-materials.py)。

**結論は `MATERIAL_INVENTORY_ONLY_NOT_LICENSE_CLEARANCE`。製品 license は `UNSET`、配布条件は `NOT_CLEARED` のまま。** この文書は保存物の技術的確認であり、許諾の選択、法的適合の判定、公開承認を行わない。

対象 source は `9abf78a80d27aa9f847c4051d20e4c552e407276`。原 legal archive は 934,132,130 bytes、SHA-256 `7c9cdc0d32faf4006b8693d5d8dc85efd8259ae937c90274888da3f943920a0c`。今回の前後 hash が一致し、配布 9 file を変更していない。[既存の全件 readback](../final-9abf78a/legal-inspection.json) は 298 regular member と完全 Git source 1,364 file の対応を確認済み。今回の追加確認は原 README・CSV・log・freeze と、nested source 20 file、Buildroot の `support/libtool` 4 file の選択読取であり、全件再試験とは呼ばない。

## 原文の警告と対象

次の 4 行は `provenance/make-legal-info.log` と `buildroot-legal-info/README` の双方にあり、収集コマンドの終了コードは 0 だった。

```text
WARNING: the Buildroot source code has not been saved
WARNING: rock-core-0.1.0: cannot save license (ROCK_CORE_LICENSE_FILES not defined)
WARNING: rock-platform-0.3.0: cannot save license (ROCK_PLATFORM_LICENSE_FILES not defined)
WARNING: rock-ui-0.3.0: cannot save license (ROCK_UI_LICENSE_FILES not defined)
```

| 対象 | 保存物から確認できる状態 |
| --- | --- |
| Buildroot 2026.08 本体 | 自動収集では未保存。`corresponding-source/buildroot-2026.08.tar.xz` に手動補完済み。SHA-256 は `87aaca4164ea9d5c8085854953018263f7963f07c22e73a2a2185cc98c581c34`。README が別途注意する `support/libtool` の追加 patch もこの tar に存在する。原警告は消していない。 |
| rock-core 0.1.0 / rock-platform 0.3.0 / rock-ui 0.3.0 | 3 package の `.mk` は `LICENSE = Proprietary (project license not yet selected)`、`REDISTRIBUTE = NO`、`LICENSE_FILES` 未定義。これは未選択を示す既存 metadata で、今回 proprietary license を選んだ意味ではない。自動 `sources/` に 3 package の tar は存在せず、完全 Git archive に source・recipe を手動補完している。license text 不在は補完していない。 |

## 収集済みの材料

| 材料 | 原 archive 内の所在・確認範囲 |
| --- | --- |
| Package metadata | `buildroot-legal-info/manifest.csv` に target 24 行、`host-manifest.csv` に host 37 行。名前・版・宣言 license・license file 名・source archive 名・依存の metadata。実配布 file ごとの最終 license 判定表ではない。 |
| License texts | `buildroot-legal-info/licenses/` に 30 file、`host-licenses/` に 66 file。たとえば Linux 6.18.50、BusyBox 1.38.0、musl 1.2.6、Python 3.14.7、OpenSSL 3.6.4、Cairo 1.18.4 の材料を含む。Rock 3 package の新 license text はない。 |
| Source と変更資料 | `sources/` 62 file、`host-sources/` 93 file。内訳は source archive 21 / 36、適用 patch は両方で計 75、適用順 `series` は計 23 file。別途上記 Buildroot tar と `corresponding-source/rock-source.tar` を同梱。完全 Git source は Rock package source、custom build/overlay、Python patch、stage0/profile 生成工具を含む。 |
| Build/config/toolchain 情報 | `provenance/buildroot.config`、`linux.config`、`source-lock.json`、`SHA256SUMS`、base/final freeze、`profile.json`。元 freeze には ARM64 Debian build host、`aarch64-buildroot-linux-musl-gcc.br_real (Buildroot 2026.08) 15.3.0`、QEMU 10.0.11、cache 再利用を記録。GCC/binutils 等の source は host 側材料にある。toolchain binary 一式や別 host での再 build 成功を証明する資料ではない。 |
| Base → Game profile の変更対応 | `provenance/base-freeze-manifest.json` と final `freeze-manifest.json`、`profile.json` が元 build と派生 triple を区別。完全 Git archive 内の `scripts/freeze-native-profile.py`、`os/game_exchange/profile.py`、`os/update/build-initramfs.py` などを exact source SHA と照合した。 |
| Buildroot 管理外の既存表示 | 完全 Git source に Mr の LICENSE / NOTICE、noVNC LICENSE / AUTHORS、pako LICENSE、browser-intake LICENSE、Noto Sans CJK LICENSE が存在し、選択読取で凍結 SHA と一致。配布 native 内の表示方針は [候補の既存 legal notice](../../../preview-legal-notice.md) に記載。 |
| 元回帰の証拠 | `provenance/native-source-report.json` と 14 log は同 source の x86_64 CI PASS。元 arm64 full-native FAIL と 14 log も残る。技術試験の結果を license 許諾の証拠にしない。 |

## 資料収集だけでは未確定の事項

1. **Rock 製品・3 local package の提供条件と権利根拠。** `UNSET` のため、製品について誰がどの利用・変更・再配布を認めるかを示す正本がない。完全 source の存在、自動収集の終了コード、公開 repository の存在は、その代わりにならない。権利者による条件の確定と既存 metadata・文書への対応付けが必要な未処理事項として残る。
2. **実配布内容に対する第三者条件の確認結果。** 各 source の license text と Buildroot の宣言は収集したが、実際に同梱する binary/library/font/browser/vendor file と各条件・例外・必要表示・変更内容との対応を承認済みとする記録はない。target と build-only host の区別、複数 license/例外のある部品、Buildroot 管理外の部品を含めた配布単位の確認が未完了。ここでは適用条件を新たに解釈・決定しない。
3. **受領者向け source 提供方法の確定。** 対応 source・patch・config・生成工具は候補にあるが、選ぶ配布方法でどの材料をどの経路・条件・期間で受領者へ提供するかの確定記録はない。現在の取得実証は認証を要する GitHub draft と loopback。一般公開 URL での source 提供が完了した証拠にはしない。
4. **不足材料がないことの最終確認。** Buildroot README 自体が自動収集の制限、非再配布 package、toolchain、Libtool の追加 patch を挙げる。本体・Libtool・Rock source の所在は今回具体化したが、別 host での完全再 build、全配布 file の材料充足を今回実施したとはしない。追加資料が必要かどうかを配布内容・確定条件に照らして判断する作業が残る。

Lima / Debian base / apt package はこの archive に再同梱せず、導入時に別取得するという候補の既存範囲を維持する。この一覧はそれら外部配布物の条件確認を代行しない。

## 読取の再現

```sh
python3 -B docs/evidence/rls01/legal-final-9abf78a/read-materials.py \
  --archive work/installer-inputs-final1/final-9abf78a-legal-info-v2.tar.gz \
  --inspection docs/evidence/rls01/final-9abf78a/legal-inspection.json \
  --output /path/to/new-inventory.json
```

新しい output だけを作る。今回の inventory SHA-256 は `4339b7afcfb88677a5600475747b6aefb7f8832c1b6b83df0b11d98d05768f4a`。初回補助工具名 `inspect.py` が Python 3.14 標準 module と衝突し、引数 parser 初期化前に `AttributeError: module 'inspect' has no attribute 'signature'` で終了した。原 archive を読む前の補助工具名の不具合として区別し、`read-materials.py` へ改名後の独立実行で exit 0・選択読取と原 archive 前後 hash 一致を得た。製品 runtime・原資料は変更していない。
