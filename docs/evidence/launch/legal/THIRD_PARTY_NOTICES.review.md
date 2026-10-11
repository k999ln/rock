# RockstarOS Developer Preview — third-party material index (unapproved)

この一覧は読み取った材料の所在です。全条件を満たしたことを示すNOTICE完成版ではありません。対象sourceは9abf78a80d27aa9f847c4051d20e4c552e407276、候補archive SHA-256は121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2です。

| 実際の同梱物 | 読み取った宣言と材料の所在 | 確認状態 |
| --- | --- | --- |
| Linux 6.18.50 / BusyBox 1.38.0 | legal/buildroot-legal-info.tar.gz内 manifest.csv、licenses/linux-6.18.50、licenses/busybox-1.38.0、sources/ | 対応source container・patch・license textをhash照合。個別ファイルの条件確認は未完了 |
| Python 3.14.7 / OpenSSL 3.6.4 / Cairo 1.18.4 | 同legal archive内の対象packageのLICENSE/COPYING、source、patch | Python-2.0/others、Apache-2.0、LGPL-2.1 or MPL-1.1と宣言。複数条件の適用確認を残す |
| その他Buildroot対象package | target manifest 24行、host manifest 37行 | host sourceも資料として同梱。host package全てがOS runtime内にあるとは扱わない |
| noVNC snapshot 63107bd06d9e1f6136ff21aeda8cd62cbf0d433e | native/os/desktop/browser/novnc/LICENSE.txt、AUTHORS、各header | 60個の展開ファイルをretained upstream tarと比較。59個一致、README.mdのみRock説明に変更。default MPL-2.0、例外は原表示を参照 |
| pako | native/os/desktop/browser/novnc/vendor/pako/LICENSE、各header | Copyright (C) 2014–2016 by Vitaly Puzrin。MITと宣言。内部zlib由来の表示も保持 |
| browser-intake | native/os/desktop/browser-intake/noVNC-63107bd.tar.gz と LICENSE.txt | noVNCの取得原本。別ライセンスの独立製品とは判定しない |
| Noto Sans CJK | native/os/assets/NotoSansCJK-LICENSE.txt、NotoSansCJKjp-Regular.otf。rootfs /usr/share/fonts/rock/ に実ファイルあり | OFL-1.1。font内のcopyright/Reserved Font Name、変更有無の最終確認を残す |
| Mr固定原本 | 対応Git source内 vendor/mr/LICENSE、native/os/tools/NOTICE-Mr.txt | MIT、Copyright (c) Anicca contributors。既存reference ref/hashを保持。Rock全体へ許諾を拡張しない |
| dash 0.5.13.5 | native/os/security/dash/COPYING と原tar、legal archive内source | Buildroot宣言はBSD-3-Clause及びmksignames.cのGPL-2.0+。component全体を単一条件へ単純化しない |

詳細はorigin-license-review-inventory.json。全706個の外側archive file、legal 298 file、対応Git source 1,364 file、rootfs内1,981 pathを読取り証拠へ結び付けています。各源のヘッダー記録は先頭16KiBの選択抽出で、copyright不存在の宣言ではありません。

実際の材料不足/判定残: Rock3 packageのlicense text、第三者source tar内部及びstage0の全file分類、rootfs生成物の由来、最終表示/ソース提供条件の確認。原legal-infoの4警告は履歴として保持しています。Buildroot本体の自動収集漏れは同じbundle中のBuildroot2026.08 source tarで補完済みです。[Buildroot公式manual](https://buildroot.org/downloads/manual/manual.html)もlegal-info出力と適合判断を区別しています。
