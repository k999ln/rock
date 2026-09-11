# RockstarOS 自作部分 MIT 採用案 — kaiya 確認用

**草案。ライセンス採用・権利処理の完了・配布承認ではありません。** 2026-09-11。受領済みの意向は、権利者の公開名「kaiya」と、自作部分の改変・再配布を許可したいというものです。MITという具体的な条文の選択は未確認です。既存 LICENSE、Buildroot recipe、配布物は変更していません。`legal.status = NOT_CLEARED`、rc2 の固定 bytes、正式署名・最終公開の別承認を維持します。

## 推奨と選択内容

**自作部分のみ MIT を推奨します。** 改変・再配布に加え、商用利用・販売・再許諾も可能になり、配布時には著作権表示とMIT本文の維持が必要です。改変ソースの公開を一律に義務付ける方式ではありません。原文には無保証・責任制限があります。この追加範囲も含めて、下記全文と適用境界を採用するかを確認できる状態にしました。[MIT公式条文（OSI）](https://opensource.org/license/mit)

Apache-2.0 は明示的な特許許諾を重視する場合の第2候補です。変更表示やNOTICE等の条件があり、GPLv2との互換性上の制約もあるため、今回の簡潔な許諾にはMITを先に提案します。ただし「Linuxと同じOSに含むだけでApache不適合」とは判断しません。kernel の通常の syscall 境界は GPL 対象をユーザー空間へ拡張しないと公式に説明されています。MIT選択によって第三者GPL/LGPL/MPL等の義務が消えることもありません。[Apache条文](https://www.apache.org/licenses/LICENSE-2.0)、[ASFのGPL互換性説明](https://www.apache.org/licenses/GPL-compatibility.html)、[Linuxの公式ライセンス境界](https://docs.kernel.org/process/license-rules.html)

過去の `LICENSE.review.md` の Apache 優先案は未承認の検討資料です。今回の意向に合わせ、このMIT優先案を新しい確認資料とします。旧証拠や過去の判断履歴自体は改変しません。

## 適用境界案（LICENSE-SCOPE.md として使う文章）

> RockstarOS の MIT License は、kaiya が著作権を保有し、許諾する権限を持つ本リポジトリ内の自作コードと自作文書にのみ適用します。第三者が権利を持つコード、文書、フォント、画像、依存ライブラリ、取得アーカイブ、およびそれらの変更・派生部分には、該当する既存のライセンスと著作権表示が引き続き適用されます。kaiya の著作権表示は、これら第三者部分の所有権を主張するものではありません。
>
> 自作部分の対象には、権利を保有する RockstarOS の Hub、Wallet、Game API/SDK、desktop/bootstrap、core/platform/UI、試験・build・運用スクリプト、Web/Androidアダプターおよび関連する自作文書を含みます。個別ファイルの既存表示、第三者由来の表示、NOTICE による適用区分を優先します。第三者コードを組み込んだファイル全体を、自作部分という理由だけでMITへ変更しません。出所・権利が未確定の部分について新しい許諾を主張しません。
>
> 特に `vendor/mr/`、Mr由来の表示対象、noVNC/pako と browser-intake 原本、Noto等のフォント、`os/security/dash/`、Buildroot本体・取得package・そのpatch、npm等の依存物、取り込まれたUI部品や画像の既存条件を維持します。自作コードのMITを、OS image全体や全同梱sourceの単一ライセンスとは表示しません。サービス利用条件・課金・サポート・別途の商標許諾は、このコードの許諾と別です。

`IMPORT-MANIFEST.json` は native の取得元を `noellesugar99/blackberryrock` と記録しています。このGitHub名やcommit履歴だけで権利者を推定しません。今回の本人申告を自作部分の根拠として扱いつつ、第三者由来の範囲を上記境界から除外する必要があります。core/platform/ui 配下の88追跡ファイルと3 recipeには今回の限定検索で明示的な第三者許諾ヘッダーを見つけていませんが、ヘッダー不在を所有権の証明とはしません。

## LICENSE 全文案

次の枠内は、**MIT採用が確認された後**の `LICENSE` 内容案です。本文は標準MIT条文です。上記の適用境界を同時に添え、第三者ファイルの元表示を残します。2026 は今回の自作部分の表示年であり、第三者の元年を置き換えるものではありません。

```text
MIT License

Copyright (c) 2026 kaiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## NOTICE 最小案

```text
RockstarOS
Original code and documentation within the scope of LICENSE-SCOPE.md:
Copyright (c) 2026 kaiya
License: MIT

Third-party components retain their own copyright notices and licenses.
This notice does not relicense them or change their terms.
Paths below are relative to systems/rock-star-os/ in the repository,
or native/ in the preview archive, except the repository-level vendor/mr/.

Mr: retain os/tools/NOTICE-Mr.txt, the original vendor/mr/LICENSE,
and each actual distribution's existing Mr notice.
noVNC/pako: retain os/desktop/browser/novnc/LICENSE.txt, AUTHORS,
all applicable source headers and vendor/pako/LICENSE, together with
the original license texts in the pinned noVNC source archive.
Noto Sans CJK JP Regular 2.004:
Copyright 2014-2021 Adobe (http://www.adobe.com/).
Noto is a trademark of Google Inc.
Retain os/assets/NotoSansCJK-LICENSE.txt (SIL OFL 1.1).
dash: retain os/security/dash/COPYING and the original per-file notices.
Linux, Buildroot and all other target/host dependencies: retain their
individual license texts, source, patches, build/configuration materials,
and the same-build legal-info manifest. See the distribution's legal index.
```

上記は表示の入口であり、全第三者条件を代替する全文NOTICEではありません。noVNCの宣言はMPLだけでなくBSD/OFL/画像のCC BY-SA等に分かれます。現在の縮小vendorディレクトリには `docs/LICENSE.*` がありませんが、保存済み727,128-byte原tar（SHA256 `06dac239be3973ed79a00e357a68aab996e6ed2fd496ee2cc6e6a34020344ac9`）にはMPL-2.0/BSD-2-Clause/BSD-3-Clause/OFL-1.1の4本文が実在します。承認後の新候補では、この固定原本から本文を既存NOTICE索引の読める位置へ置く案が妥当です。vendor原本や権利者表示を上書きしません。fontの既存OFLと上記copyright表示も配布先から読める形で保持します。

## MIT確認後の最小差分案

1. root `LICENSE`（上記MIT）、`LICENSE-SCOPE.md`（上記境界）、`NOTICE`（上記入口＋現在の第三者索引）を追加する。nativeの取り出し配布にも全文が入るよう `systems/rock-star-os/{LICENSE,LICENSE-SCOPE.md,NOTICE}` に同じ内容を保持する。外側rootだけの追加では、現在のpackagerが自動収集する `native/` には入りません。
2. local SITEである `systems/rock-star-os/os/{core,platform,ui}/LICENSE` にMIT全文の実ファイルを置く。rootへのsymlinkや相対参照だけにはしない。対象packageの自作範囲が上記境界と一致することを確認してから次の3 recipe差分を適用する。
3. `os/platform/install-target.sh` で native側のLICENSE/SCOPE/NOTICEを `/usr/share/licenses/rockstaros/` に通常ファイルとして配置する。fontの元OFL配置は維持し、確認済みfont copyright表示も同じfont license directoryへ添える。下のrecipeは各package自身のMIT本文もtargetへ配置する。

```diff
--- a/systems/rock-star-os/os/buildroot/package/rock-core/rock-core.mk
+++ b/systems/rock-star-os/os/buildroot/package/rock-core/rock-core.mk
@@ -1,8 +1,9 @@
 ROCK_CORE_VERSION = 0.1.0
 ROCK_CORE_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../core
 ROCK_CORE_SITE_METHOD = local
-ROCK_CORE_LICENSE = Proprietary (project license not yet selected)
-ROCK_CORE_REDISTRIBUTE = NO
+ROCK_CORE_LICENSE = MIT
+ROCK_CORE_LICENSE_FILES = LICENSE
+ROCK_CORE_REDISTRIBUTE = YES
 
 define ROCK_CORE_BUILD_CMDS
 	# A host-built executable copied by local rsync is not a target build.
@@ -14,6 +15,7 @@
 	$(INSTALL) -D -m 0755 $(@D)/rockd $(TARGET_DIR)/usr/sbin/rockd
 	$(INSTALL) -D -m 0755 $(@D)/rockctl $(TARGET_DIR)/usr/bin/rockctl
 	$(INSTALL) -D -m 0755 $(@D)/rocktest $(TARGET_DIR)/usr/libexec/rocktest
+	$(INSTALL) -D -m 0644 $(@D)/LICENSE $(TARGET_DIR)/usr/share/licenses/rock-core/LICENSE
 endef
 
 $(eval $(generic-package))
--- a/systems/rock-star-os/os/buildroot/package/rock-platform/rock-platform.mk
+++ b/systems/rock-star-os/os/buildroot/package/rock-platform/rock-platform.mk
@@ -1,8 +1,9 @@
 ROCK_PLATFORM_VERSION = 0.3.0
 ROCK_PLATFORM_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../platform
 ROCK_PLATFORM_SITE_METHOD = local
-ROCK_PLATFORM_LICENSE = Proprietary (project license not yet selected)
-ROCK_PLATFORM_REDISTRIBUTE = NO
+ROCK_PLATFORM_LICENSE = MIT
+ROCK_PLATFORM_LICENSE_FILES = LICENSE
+ROCK_PLATFORM_REDISTRIBUTE = YES
 ROCK_PLATFORM_DEPENDENCIES = python3 sqlite libopenssl bubblewrap libseccomp
 
 define ROCK_PLATFORM_BUILD_CMDS
@@ -11,6 +12,7 @@
 
 define ROCK_PLATFORM_INSTALL_TARGET_CMDS
 	$(INSTALL) -D -m 0755 $(@D)/rock-sandbox-exec $(TARGET_DIR)/usr/libexec/rock-sandbox-exec
+	$(INSTALL) -D -m 0644 $(@D)/LICENSE $(TARGET_DIR)/usr/share/licenses/rock-platform/LICENSE
 endef
 
 $(eval $(generic-package))
--- a/systems/rock-star-os/os/buildroot/package/rock-ui/rock-ui.mk
+++ b/systems/rock-star-os/os/buildroot/package/rock-ui/rock-ui.mk
@@ -1,8 +1,9 @@
 ROCK_UI_VERSION = 0.3.0
 ROCK_UI_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../ui
 ROCK_UI_SITE_METHOD = local
-ROCK_UI_LICENSE = Proprietary (project license not yet selected)
-ROCK_UI_REDISTRIBUTE = NO
+ROCK_UI_LICENSE = MIT
+ROCK_UI_LICENSE_FILES = LICENSE
+ROCK_UI_REDISTRIBUTE = YES
 ROCK_UI_DEPENDENCIES = cairo freetype json-c host-pkgconf
 
 define ROCK_UI_BUILD_CMDS
@@ -14,6 +15,7 @@
 
 define ROCK_UI_INSTALL_TARGET_CMDS
 	$(INSTALL) -D -m 0755 $(@D)/rock-ui $(TARGET_DIR)/usr/bin/rock-ui
+	$(INSTALL) -D -m 0644 $(@D)/LICENSE $(TARGET_DIR)/usr/share/licenses/rock-ui/LICENSE
 endef
 
 $(eval $(generic-package))
```

Buildroot 2026.08 の公式実装では local/override package にも `LICENSE_FILES` を保存し、`REDISTRIBUTE=YES` のときは元local sourceをコピーしてarchiveします。したがって `SITE_METHOD=local` をtar/gitへ変える必要はありません。3 recipeのroot外参照も必要ありません。実収集後にはlicense filesとsources 3 packageの存在・hashを確認します。Buildroot全体の条件や各依存の `LICENSE` をMITへ変えません。[Buildroot manual 13・18.6](https://buildroot.org/downloads/manual/manual.html)、[2026.08 pkg-generic.mk（legal-info処理）](https://raw.githubusercontent.com/buildroot/buildroot/2026.08/package/pkg-generic.mk)

4. `os/desktop/package_preview.py` の `legal.product_license` は、採用確認後に `MIT (kaiya-owned original code only; see native/LICENSE-SCOPE.md); third-party components retain their licenses` などの事実に合わせる。**`legal.status` は引き続き `NOT_CLEARED`。** `docs/preview-legal-notice.md` の「LICENSEなし」は、新しい適用境界と配布物内の全文所在へ更新する。`source_tree()` が新たなnativeのLICENSE/SCOPE/NOTICEを含むこと、3package licenseとfont noticeのrootfs配置を実測する。
5. これらはsource/freeze/rootfs/legal-bundleの新しいbytesになる。既存b7/rc2を追記・relabel・差替えせず、承認された新sourceで新候補を作り、対応source/NOTICE/inventoryを同じ固定bytesへ結合する。既存rc2の7-stage inventoryは434,523 recordsの技術読戻しであって許諾完了ではない。10個のkernel生成metadataと18個の境界付きsource-container例外も新しい権利判断で黙って消さない。
6. その新候補に対する明示的なowner decision/current policyを、既存 `verify_owner_legal_approval.py` の7材料（license/license_scope/notices/inventory/corresponding_source/redistribution_instructions/exceptions）へ正確に結合する。agentがAPPROVED recordやauthorityを作らない。正式署名・fresh導入/受入・CM・Sites/一般公開・main mergeの条件は別途維持する。

## この案の確認対象

確認文の例：**「上記の適用境界に限り、Copyright (c) 2026 kaiya のMIT License全文を採用する。改変・再配布に加え、商用利用・販売・再許諾も認める」**。

この返答を、第三者の全権利保有、特定archiveの法的clearance、最終一般公開の承認とは読み替えません。今回は文書草案の保存のみで、repo・Buildroot・既存配布物を変更していません。添付3 recipe差分は `git apply --check` で適用可能な構文を読取り検証しましたが、実適用・Buildroot実行はしていません。

## 読取り基準と主要入力pin

読取りHEAD: `98ead9689a7021afc63b57b53f8611229a4b20f3`。受入済みnative/candidate sourceは `b7d819cd291b653d165aa124f25a52b9898bfb2e` と区別します。主要な読取りファイル SHA256:

```json
{
  "docs/evidence/launch/legal/LICENSE.review.md": "d7ba50f5f0aeeb0e9063b3e6d697d1ee9ff12688db674f82d4000c568ec5a0ed",
  "docs/preview-legal-notice.md": "11401fa9e337b282a65f552e9354c41591ebaa0b2a6c2c78c75bdf2e207387c0",
  "docs/owner-legal-approval.md": "338e16563d4532f953e10b896a2b970a8b57239bf66529917920d0b60941d415",
  "docs/evidence/rls01/remaining-b7-rc2/inventory.json": "2e80615d3073f08875b4ddf510c69c82ae2443777f7a51f3b6f33bb5127d90d9",
  "systems/rock-star-os/IMPORT-MANIFEST.json": "fa802dbd370a069bb5489748ce78945b6825598d4b1c4e9d554e17af5daf4438",
  "systems/rock-star-os/os/desktop/package_preview.py": "0d33668df5d0675a4d865bff72064adc93f303a7371a21f9076c361decb1bcc0",
  "systems/rock-star-os/os/platform/install-target.sh": "0c9be32fcceecca4fc6ba2a11ab650eb022542a236be91769e9b1e68d4c5f357",
  "systems/rock-star-os/os/desktop/browser/novnc/LICENSE.txt": "3ccd2242d7f5b6c5ae831a486f63cce1f18d8cd11c511f6a7a7251673763b2d1",
  "systems/rock-star-os/os/desktop/browser/novnc/AUTHORS": "16ee0ef356d5107a4bc039f91abc99a341dc62b9aa8dd47547a2baed38507509",
  "systems/rock-star-os/os/assets/NotoSansCJK-LICENSE.txt": "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2",
  "systems/rock-star-os/os/tools/NOTICE-Mr.txt": "24f25b385f9ec3fe79e66305c15126e6bb36abad170063bc1e1e8610103c4a66",
  "systems/rock-star-os/os/buildroot/package/rock-core/rock-core.mk": "4cd426d89752b01099cdf92b9391c195136a50c3af98ef6d1d5dd8d0685a9add",
  "systems/rock-star-os/os/buildroot/package/rock-platform/rock-platform.mk": "8419ccc28ab779d84715cd57b917e3d260b5cb30bc4ebea28fab803dc5e3f05d",
  "systems/rock-star-os/os/buildroot/package/rock-ui/rock-ui.mk": "1305e0f014b67cc302734ee99065cb845d4237b1aa4f735d2a610c526732d343"
}
```
