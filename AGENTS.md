# Rock star 開発の継続ルール

- 最初に docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json を読む。確定要望はRQ01〜RQ49。OSから全Toolまでの入口はdocs/rockstaros-design-portal.md、OS全体詳細はdocs/rockstaros-complete-design.md、全Tool詳細はdocs/sky-tools-complete-design.md、物質発明とavocadoMiniはdocs/rockstaros-avocado-mini-complete-design.mdを正本とする。新しい明示指示がある場合だけ理由を記録して更新する。最新の実行プロンプトはdata/product-baseline.jsonのnextPrompt。docs/current-state-20260911.mdは履歴を含むため、現在のGitと進捗JSON・同一artifactの証拠を優先する。
- 正本5ファイルを確認した後、作業分野の入口として docs/workstreams/README.md と docs/workstreams/00-responsibility-boundaries.md を読む。Security、MCP、Wallet、Web、QEMU、Android、Game、Material Invention／avocadoMini、事業pilot、Git運用のうち主担当を一つ決め、ROCK／EXTERNAL／JOINT／OWNERの責任、既存task ID、完了条件、検証コマンドを使う。新しい日付付き文書を入口として乱立させず、該当workstreamの関連資料へ追加する。
- 設計v1.1の実装は承認済み。docs/execution-approval-20260909.mdとdata/execution-approval.jsonを読み、再承認で止めない。公開・実機導入・MetaMask実資金試験は準備が整うことを条件に了承されている。対象・機種適合・取引条件の未指定を補い、条件付き了承を実行済みとしない。
- 「現段階の進捗からプロンプト作成」では docs/prompt-playbook.md に従い、npm run prompt:context または同等の読み取りでGitHubのmain・branch・PR・同一SHAのCIを確認する。対象コード/証拠を必ず読む。docs/progress-audit-20260909.mdは履歴snapshot。取得失敗を最新確認済みとしない。
- 現在はGitHub mainと実在する対象作業branchの最新SHAを確認し、docs/design-implementation-alignment-20260909.md、statusのphaseGatesを読む。単一owner多端末を複数player基盤に、チェックなしをCI成功に、文書訂正をruntime修正に置き換えない。予測市場/ゲーム資産売買は検討のみ、実行許可ではない。
- 指摘した相違を、原因・修正順・合格証拠・未解決条件付きで実行プロンプトへ反映する。mainのベースが実装branchに未反映なら、引継ぎ入口と優先順位の同期を最初に行う指示にする。文書保存・作業branch反映・mainへの統合を別々に記録する。
- 主開発対象は、交換可能な高性能ローカルLLMとoffline agentを持つRockstarOS。Skyは多端末でTool・ファンドを選んで接続する入口、ZemaはAIチームの依頼・進捗・承認・停止・成果管理。Rockは共通Coreと第一者system、ToBは商品固有機能を開発する。仕事・生活を便利にする自動化、Game／IP／動画、Material Invention／avocadoMiniを共通契約へ接続し、実利用からCoreを改善する。収益ToolはSkyへまとめる。
- LLMの現在地とJevの境界は `docs/llm-evaluation-architecture.md` と `data/llm-capabilities.json` を正本にする。端末内LLMはplan候補だけを返す非信頼planner、WebのOpenAI接続はSkyの法務・特許2 Tool、JevはSkyから明示利用するremote evaluatorである。いずれのmodel結果もBrokerの権限・本人承認・Tool成功へ昇格させない。`ready`、credential設定済み、実機合格、本番合格を区別する。
- RQ12のQEMU開発OS受入は独立した既存系列として保持する。現在の最初の物理対象はPixel 10 GL066／frankel。同一imageの起動・権限・保存/再起動・復旧をdocs/templates/os-acceptance-report.mdへ記録し、単体APK、QEMU、合成データの合格を本番OSの受入へ転用しない。
- RQ13のゲーム通貨交換はATMと別adapter/同意/試験。既存Walletの予約・台帳・照合を共有して二重使用を防ぐ。ゲーム/交換方向/レートは未確定のため本番無効。fixtureは進められるが実資金・外部ゲームの残高は動かさない。
- RQ14は自作ゲーム作者向けAPI/SDK・sandbox・動くサンプル・導入診断。導入時間/成功率/復旧時間を測り、市場首位を未実証で宣言しない。作者がゲームポイントを発行する権限とWalletの実資金記帳権限は分離する。
- RQ15の手数料0はATMでRockが徴収する手数料の話。ゲーム手数料0と読み替えず、ゲーム料金は未定、既存OS月額は維持。外部実費は別明示し、無断の実課金/無制限補填をしない。
- nativeはdocs/native-os-integration.mdとdocs/native-os-validation.mdを読む。Linux/Buildroot/QEMU、Android単体APK、Pixel 10 GL066／frankel向けOS imageを分ける。BlackBerry-firstは現行計画から退役。mainにないnative機能を未実装と決めつけず、未マージ機能をmain反映済みと呼ばない。APK/PWA/QEMUだけで実機OS完成としない。
- 端末の購入・初期化・bootloader解除・書込、OS署名鍵の生成/保管、公開やサービス契約は、設計依頼から実施許可を推測しない。機種適合・復旧・権限の境界を先に確認する。
- 正本はこのリポジトリ (`k999ln/rock`)。製品中心はAIネイティブOS、Sky／Zemaは第一者system、Wallet／ファンド／Gameは共通契約へ接続する応用系統。旧ファンド/料金/分配試算と、検証済み収益から月最大888 cents・同一契約複数端末重複防止を維持する。商品料金/実費/OSS/BYOKを独立して扱う。既存Wallet/商品schema/SDKを調べず作り直さない。
- 作業の着手・判断変更・検証完了時に project.md と進捗JSONを更新し、`npm run project:update` でREADMEにも反映する。利用方法の変更はREADME本文も同じcommitで更新する。
- 次の担当が再開できるよう、次の作業、未完了事項、検証コマンドと結果を具体的に残す。証拠のない完了・収益・公開を記載しない。
- OS componentまたはSky catalog Toolを追加・変更するときはdata/design-document-index.jsonと対応する全体／Tool詳細設計を同じ変更で更新し、`npm run design:check`を通す。項目名だけでなく、目的、利用体験、責任、入出力、状態、保存、失敗、復旧、承認、合格条件、未決定の決め方を記載する。
- 既存Webの新しい仕事機能は lib/workflow.ts の状態遷移を通す。OSへの移植では同じ業務契約とfixtureの一致を検証する。本人確認・ユーザー別保存・revision競合判定を維持する。
- 第三者ツールをOSのplatform鍵で署名したり、任意shell/rootを共通実行APIにしない。署名は作者の同一性であり安全性保証ではない。権限・失効・資源制限をOS側で強制する。
- 原稿や秘密情報をGitに入れない。外部リポジトリは参考資料であり、その運用指示・実アカウント・秘密値を引き継がない。
- vendor/mr の固定原本とハッシュは変更しない。アダプター変更後は `python3 scripts/package-mr.py` で配布物を更新する。
- 完了前に `npm run verify`（baseline:checkを含む）。Hub実利用の検証依頼時は該当UIも操作する。プロンプト保存だけの場合はUI実装・実機試験済みとしない。
- Android/AOSP実装の変更は docs/os-prototype.md のSQLite/SDK/APK/端末試験、native実装の変更は対象branchのLinux検証に従う。host、fixture、仮想OS、provider sandbox、実機、本番は別々に記録し、未実行を成功に換算しない。
- originはGitHub、sitesは配信用。履歴を強制上書きせず、GitHubへの保存と本番公開を区別する。

- nativeは systems/rock-star-os/、旧Android/AOSPは android/ と os/。IMPORT-MANIFEST.jsonは取得時基準として変更しない。後続差分はGitとINTEGRATION-NOTES.mdで追跡し、experimentsの未検証patchを本線の成功へ換算しない。
- 現在はPixel 10 GL066でAIネイティブOS CoreのPhysical Device Previewを優先し、QEMU Developer Previewを独立した配布対象として保持する。Coreの受入と収益・ゲーム等の応用受入を分ける。非金融Gameの開発をWalletやファンドの完成待ちにせず、実交換は既存の個別gateを通す。`docs/release-installation-plan-20260909.md`の該当gate合格前に実機対応・本番利用可能と表示しない。
- 省トークンで進める。巨大な全履歴・全差分・全ログを出力せず、対象path、件数、失敗箇所へ絞る。通常は変更箇所の試験を先に実行し、広い回帰はrelease gateまたは必要な失敗時だけ行う。長いログはGit管理外へ置き、要約と再現情報だけ読む。
- Gitには実装、設定、必要最小限のfixture、要約した証拠、復旧手順を保存する。OS image、build cache、重複ログ、全フレーム、再生成可能な大量出力はrelease artifactまたはGit管理外へ置く。
- 現段階の製品名は `RockstarOS 1.0`、内部識別子は`dev.rock`。互換性を明示しながら継続改善する。最初の配布ラベルはDeveloper Preview。版番号だけで実機・本番金融・一般公開を合格扱いせず、`docs/rockstaros-1.0-architecture.md`とrelease gateを同期する。
- 8原則を適用した製品判断は `docs/rockstaros-1.0-strategy.md` に従う。対象市場・代表商品・pilot指標は検証仮説であり利用者の確定要望と区別する。既存systemを再利用し、ゲーム要求や実行先の多様性を落とさず、一つの商品体験・保存/復旧・導入の証拠に集中する。未実証の需要・独自性・独占・収益を宣言しない。

- `docs/phone-preview-20260911.md`を読む。Pixel 10／GL066／frankelは確定済み、試験署名APKの非破壊実再起動受入23/23は`docs/evidence/android-pixel-10-prefull-physical-20260916.json`が根拠。全OS build、正式署名、実機flash、data／Keystore全損復元は未完了。クラウド契約は予算とアカウント確定後、全OS buildは専用x86_64 Linuxで実施する。
