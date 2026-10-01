# RockstarOS 1.0 Developer Preview — ライセンスと NOTICE

製品の新しい利用条件・許諾・保証をこの作業で作成していません。正本 repository に RockstarOS 製品全体を許諾する LICENSE は見つかっていません。公開 source の存在や Developer Preview という名前を、OSS・再配布許可・本番利用許可の代わりにしません。package manifest の `legal.status` は `NOT_CLEARED` のままです。

## 同梱 source にある権利表示

- native source の `os/tools/NOTICE-Mr.txt`: 再利用する Mr. の表示。商品・原本・版を保持します。
- `os/desktop/browser/novnc/LICENSE.txt` と `AUTHORS` および各 source header: noVNC の権利表示。`vendor/pako/LICENSE` も保持します。
- `os/desktop/browser-intake/LICENSE.txt`: browser intake 部品の既存条件。
- `os/assets/NotoSansCJK-LICENSE.txt`: OS に使用する Noto Sans CJK font の既存条件。
- native 全追跡 source と既存の NOTICE/LICENSE は package の `native/` 内へそのまま格納します。実行のための必要な source を同梱することと、製品全体の許諾を創作することは別です。

Linux kernel、Buildroot を通じて入る BusyBox・Python・OpenSSL・Cairo などは、それぞれの license 条件に従います。binary を配布する前に、同じ build の Buildroot `legal-info`、license texts、対応 source、変更箇所、build/config/toolchain の情報を収集し、必要な source 提供条件を確認してください。`legal/buildroot-legal-info.tar.gz` があれば、その入力と hash は release manifest に記録されます。入っていない場合や提供条件が整っていない場合は、公開配布の完了としません。

Mac 用 Lima / Debian base VM / apt packages は RockstarOS archive に再同梱しません。利用者の host の Lima と、manifest に固定した Debian URL/SHA-512、guest の署名付き package repository から取得します。実際に取得した版は installation の診断情報へ記録します。

## 試験鍵・合成環境

OS の RFC8032 Ed25519 key、公開 development CA/認証器/fixture は **試験用公開データ** です。秘密情報を保護する production identity として信頼してはいけません。OS fixture の試験 seed と release の署名 key の役割を混同しません。外部管理の release key で package を署名しても、OS 内の公開試験鍵を production key に変換したことにはなりません。

合成 Wallet、合成 Game、USD cents の試験値は実資金ではありません。月額 888 USD cents の既存契約と ATM で Rock が徴収する手数料 0 の既存要望を変更せず、未同意の実課金・新しい Game 料金・実送金を開始しません。
