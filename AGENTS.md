# Rock star 開発の継続ルール

- 最初に docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json を読む。確定要望はRQ01〜RQ17。新しい明示指示がある場合だけ理由を記録して更新する。最新の実行プロンプトはdata/product-baseline.jsonのnextPrompt。
- 設計v1.1の実装は承認済み。docs/execution-approval-20260909.mdとdata/execution-approval.jsonを読み、再承認で止めない。公開・実機導入・MetaMask実資金試験は準備が整うことを条件に了承されている。対象・機種適合・取引条件の未指定を補い、条件付き了承を実行済みとしない。
- 「現段階の進捗からプロンプト作成」では docs/prompt-playbook.md に従い、npm run prompt:context または同等の読み取りでGitHubのmain・branch・PR・同一SHAのCIを確認する。対象コード/証拠を必ず読む。docs/progress-audit-20260909.mdは履歴snapshot。取得失敗を最新確認済みとしない。
- 現在はmain/nativeだけでなく codex/os-game-design-review-20260909 の最新設計も必須入力。docs/design-implementation-alignment-20260909.md、statusのphaseGatesを読む。単一owner多端末を複数player基盤に、チェックなしをCI成功に、文書訂正をruntime修正に置き換えない。予測市場/ゲーム資産売買は検討のみ、実行許可ではない。
- 指摘した相違を、原因・修正順・合格証拠・未解決条件付きで実行プロンプトへ反映する。mainのベースが実装branchに未反映なら、引継ぎ入口と優先順位の同期を最初に行う指示にする。文書保存・作業branch反映・mainへの統合を別々に記録する。
- 主開発対象は自動化Hub＋WalletのOS。tob側が商品を開発し、Rock側は接続/管理/実行/費用/収益の共通基盤を作る。既存ツールも商品。利用者のどの不便を減らすかと、既存商品のHub実利用検証を作業の合格条件に含める。
- RQ12の最初の受入はQEMU開発OS雛形。最新sourceからbuildした同一imageで起動・Hub/Wallet操作・境界・保存/再起動・復旧を実測し、docs/templates/os-acceptance-report.mdへ記録する。公開試験鍵や合成データの合格を本番安全認証にしない。
- RQ13のゲーム通貨交換はATMと別adapter/同意/試験。既存Walletの予約・台帳・照合を共有して二重使用を防ぐ。ゲーム/交換方向/レートは未確定のため本番無効。fixtureは進められるが実資金・外部ゲームの残高は動かさない。
- RQ14は自作ゲーム作者向けAPI/SDK・sandbox・動くサンプル・導入診断。導入時間/成功率/復旧時間を測り、市場首位を未実証で宣言しない。作者がゲームポイントを発行する権限とWalletの実資金記帳権限は分離する。
- RQ15の手数料0はATMでRockが徴収する手数料の話。ゲーム手数料0と読み替えず、ゲーム料金は未定、既存OS月額は維持。外部実費は別明示し、無断の実課金/無制限補填をしない。
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

- nativeは systems/rock-star-os/、旧Android/AOSPは android/ と os/。IMPORT-MANIFEST.jsonは取得時基準として変更しない。後続差分はGitとINTEGRATION-NOTES.mdで追跡し、experimentsの未検証patchを本線の成功へ換算しない。
- 最新の明示指示により、CM発表に向けた導入可能版を進める。最初はfreshなMac/PCへ導入できるQEMU Developer Preview、次に正確な1機種・variantへ限定したPhysical Device Previewとする。`docs/release-installation-plan-20260909.md`の合格前に実機対応・本番利用可能と表示しない。
- 省トークンで進める。巨大な全履歴・全差分・全ログを出力せず、対象path、件数、失敗箇所へ絞る。通常は変更箇所の試験を先に実行し、広い回帰はrelease gateまたは必要な失敗時だけ行う。長いログはGit管理外へ置き、要約と再現情報だけ読む。
- Gitには実装、設定、必要最小限のfixture、要約した証拠、復旧手順を保存する。OS image、build cache、重複ログ、全フレーム、再生成可能な大量出力はrelease artifactまたはGit管理外へ置く。
- 現段階を `RockstarOS 1.0` の製品ベースとして発表し、互換性を明示しながら継続改善する。最初の配布ラベルはDeveloper Preview。版番号だけで実機・本番金融・一般公開を合格扱いせず、`docs/rockstaros-1.0-architecture.md`とrelease gateを同期する。
- 8原則を適用した製品判断は `docs/rockstaros-1.0-strategy.md` に従う。対象市場・代表商品・pilot指標は検証仮説であり利用者の確定要望と区別する。既存systemを再利用し、ゲーム要求や実行先の多様性を落とさず、一つの商品体験・保存/復旧・導入の証拠に集中する。未実証の需要・独自性・独占・収益を宣言しない。

- 2026-09-11の最新指示でスマホ本体へ書き込むOS版の開発を開始。`docs/phone-preview-20260911.md`を読む。Pixel 10/frankelは候補で現在の機種/SKU未確認、利用できるLinux環境なし。source組込み・既存Android P1・Hub/Wallet/Game移植・全OS build・正式Android署名・実機flash/復旧を区別する。クラウド契約は予算とアカウント確定後、全OS buildは専用x86_64 Linuxで実施する。
