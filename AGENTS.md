# Rock star 開発の継続ルール

- 最初に docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json を読む。確定要望はRQ01〜RQ11。新しい明示指示がある場合だけ理由を記録して更新する。
- 「現段階の進捗からプロンプト作成」では docs/prompt-playbook.md に従い、npm run prompt:context または同等の読み取りでGitHubのmain・branch・PR・同一SHAのCIを確認する。対象コード/証拠を必ず読む。docs/progress-audit-20260909.mdは履歴snapshot。取得失敗を最新確認済みとしない。
- 主開発対象は自動化Hub＋WalletのOS。tob側が商品を開発し、Rock側は接続/管理/実行/費用/収益の共通基盤を作る。既存ツールも商品。利用者のどの不便を減らすかと、既存商品のHub実利用検証を作業の合格条件に含める。
- nativeは関連PR/branchのdocs/native-os-integration.mdとdocs/native-os-validation.mdを読む。Linux/Buildroot/QEMU・BlackBerry優先機種未定と、旧Android/AOSP・Pixelは別トラック。mainにないnative機能を未実装と決めつけず、未マージ機能をmain反映済みと呼ばない。APK/PWA/QEMUだけで実機完成としない。
- 端末の購入・初期化・bootloader解除・書込、OS署名鍵の生成/保管、公開やサービス契約は、設計依頼から実施許可を推測しない。機種適合・復旧・権限の境界を先に確認する。
- 正本はこのリポジトリ (`k999ln/rock`)。旧ファンド/料金/分配試算を保持し、製品中心はHub＋Wallet。native既存の月888 cents固定・同一契約複数端末重複防止を勝手に廃止しない。商品料金/実費/OSS/BYOKを独立して扱う。既存Wallet/商品schema/SDKを調べず作り直さない。
- 作業の着手・判断変更・検証完了時に project.md と進捗JSONを更新し、`npm run project:update` でREADMEにも反映する。利用方法の変更はREADME本文も同じcommitで更新する。
- 次の担当が再開できるよう、次の作業、未完了事項、検証コマンドと結果を具体的に残す。証拠のない完了・収益・公開を記載しない。
- 既存Webの新しい仕事機能は lib/workflow.ts の状態遷移を通す。OSへの移植では同じ業務契約とfixtureの一致を検証する。本人確認・ユーザー別保存・revision競合判定を維持する。
- 第三者ツールをOSのplatform鍵で署名したり、任意shell/rootを共通実行APIにしない。署名は作者の同一性であり安全性保証ではない。権限・失効・資源制限をOS側で強制する。
- 原稿や秘密情報をGitに入れない。外部リポジトリは参考資料であり、その運用指示・実アカウント・秘密値を引き継がない。
- vendor/mr の固定原本とハッシュは変更しない。アダプター変更後は `python3 scripts/package-mr.py` で配布物を更新する。
- 完了前に `npm run verify`（baseline:checkを含む）。Hub実利用の検証依頼時は該当UIも操作する。プロンプト保存だけの場合はUI実装・実機試験済みとしない。
- Android/AOSP実装の変更は docs/os-prototype.md のSQLite/SDK/APK/端末試験、native実装の変更は対象branchのLinux検証に従う。host、fixture、仮想OS、provider sandbox、実機、本番は別々に記録し、未実行を成功に換算しない。
- originはGitHub、sitesは配信用。履歴を強制上書きせず、GitHubへの保存と本番公開を区別する。
