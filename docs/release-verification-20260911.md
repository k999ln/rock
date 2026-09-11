# RockstarOS 1.0 — 新候補の導入・サイト復旧

2026-09-11の利用者指示: 公開サイトの接続・ダウンロード導線を復旧し、最新配布物で導入・起動・保存・再起動・復旧を最終確認する。一般公開・製品main mergeは、既存の最終承認ゲートを保持する。

## 権利者と署名

利用者から「署名するわ、権利者はおれ」と申告を受領した。利用者自身の著作部分の権利者申告と、配布署名を行う意思として記録する。Linux・Buildroot・React等の同梱または依存ソフトウェアは、それぞれの出所・条件を保持する。製品のライセンス方式・権利者表記・最終候補の許諾内容は、この申告だけから補わない。

正式署名の2026-09-11実API確認: PR #5は未merge、署名workflowは未登録、controlは旧ca73565のまま保護、署名Environment・管理鍵・独立reviewer・trust bundleは未設定。申告を電子署名済み・配布許諾済みとは記録しない。

## 今回の固定入力

- Source / host tools: `b7d819cd291b653d165aa124f25a52b9898bfb2e`
- 新版候補: `1.0.0-preview.20260911-rc2`
- Freeze SHA256: `918ecd2c3e98fbc9f585f2b2f8795ea0ef4752fe684365d2b155ba298a11fcfd`
- Buildroot 2026.08 / Linux 6.18.50、専用Lima VMでビルド完了。
- 対応source資料の同一bytes再生成確認済み。legal-info archive SHA256: `ad6453366b752e91d4ae1cf0b6384b1534e53e13643ed6b1f426e674d9ec3d94`。

旧9abの配布物・受入証拠・利用者VMを保持し、新候補の二回生成・全8資産のGitHub実取得・host/guest各716member照合を完了。新規導入、3回の実起動、保存、再起動、中断復旧と停止後の独立読戻しは内部PASS。[実測と範囲](os-acceptance-b7d819c-20260911.md)。公開試験鍵の別置きmanifestを使用した動作試験であり、正式な配布者認証・ライセンス許諾の合格ではない。

## サイト

元project `appgprj_6a9b70d966fc8191a1ec30efce14582d` は公式Sites getでNOT_FOUND。管理可能一覧の全ページにも該当なし。元アカウントでの再接続を依頼し、同じproject IDと既存D1/PWA/APIを保持する。代替Siteの作成、元DBの初期化、公開先の変更は行っていない。

PC接続画面のPython要件を配布ZIPのREADMEと一致させた。macOS 3.13以上・Linux 3.10以上、Windowsの出典整理MCPは未対応。ZIPと固定vendor原本のbytesは変更しない。OS候補の導線は管理者向けのGitHub Releases一覧へ接続し、新rc2を選ぶよう案内。Draft本文の更新でuntagged URLが変わることを実測したため、変動するURLを固定リンクとして使わない。未署名・一般配布前を表示。旧9abの動画・記録は版を明記した。localhostの案内→導入ガイドを実ブラウザで確認し、HTML2ページ・ZIP/動画/画像/字幕はHTTP200、全asset bytes一致。最終npm run verifyもPASS。既存Sites上での表示・認証・配布は接続待ちで未確認。

## 再開位置

1. 元サイトを作成したChatGPTアカウントでSitesへ再接続し、同じprojectの公開範囲・既存DBを取得する。
2. 本人限定previewで認証・既存履歴・実際の公開先からのダウンロード導線を確認する。
3. 実際の署名設定と製品配布条件の確定後、同じ対象bytesに対して正式署名・許諾・残る最終受入を照合する。
4. 一般公開前に最終内容を提示し、承認後に公開する。

実行ログとOS imageはGitへ追加せず、今回専用の作業領域と配布artifactへ保持する。
