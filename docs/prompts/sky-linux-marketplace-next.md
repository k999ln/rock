2026-10-20本人訂正：現在のRockstarOS再設計が最新版。旧Buildroot/QEMUは選択再利用元であり、その完成を標準商品の前提へ戻さない。Pixel/ Mini/Pro/相棒の能力別適応と会社ロゴはdocs/device-support-architecture.md#current-device-adaptationとdata/rockstaros-device-adaptation.jsonを参照。Pixel試験は非破壊の明示許可あり、実eSIM/決済の受入は別gate。

最新実装指示：PixelのeSIM→請求内容→契約/継続同意→支払い方法setup→Linux準備→Sky/Eve利用開始は後付けmoduleとして開発し、OSシステム完成後に組み込む。docs/sim-led-product-architecture.md#pixel-service-setup、data/service-setup-integration.json、lib/rockstar-service-setup*.tsを最初に読む。現在は既定無効・Pixel未適用。初回の登録で料金を徴収せず、実月末請求と入金を別に照合する。OS受入記録の捏造、fixtureの実機転用、強いeSIM導入証拠の省略、有効化や実課金の先行をしない。

最優先の本人補足：本商品eSIMは通信容量でなくcloud Linux/LLM/Agentのservice profile。端末の接続や前面画面へcloud executorの生存を結びつけない。保存したautonomyGrantとdurable acceptance後に承認済み仕事を継続する。実行Linuxもofflineならlocal自己完結処理と外部作用待機を分ける。手ぶら入力/成果受取と実利用・検収・収納に基づくRun to Earnを同一jobへ接続する。接続権だけで実行/支払/送信承認を作らず、既存device-install gateは維持し、新証拠kindの版付きadapterで実装する。

最新の発明課題（2026-10-20本人追加指示）：端末ごとの専用OSを作ることを標準利用の前提から外す。最初にdocs/sim-led-product-architecture.md#esim-service-attachmentとcontracts/rockstar-service-attachment.jsonを読む。RockstarOSの中にSky・Eve・管理Linux・OS Coreを置いた共通サービス環境へ、既存OS client/能力adapterを接続する。管理Linuxのcloud配置はOS内部、外部LLMだけadapter先。eSIM内applet/起動案内、真正なissuer証拠、本人契約、一回のworkspace準備、子端末接続を発明・実装する。完全無操作起動は別の達成条件であり、手動URL成功で完成扱いしない。既存強い端末導入証拠をiOS用の偽receiptへ弱めず、必要なissuer adapterを作る。native/QEMU/Pixelの限定受入は追加系列として保持する。

現行階層（2026-10-20本人訂正）：RockstarOSが大元で、その中にSky・Eve・対応Linux実行環境がある。SkyをOSの上位製品へ置かず、EveのSI窓口とLinux実行、OSの権限/利用権/予算/保存・使用量を一つの仕事へつなぐ。管理Linuxのcloud配置はOS内部で、第三者LLM/providerが外部adapter先。

# Sky Linux 16を実環境で受け入れる

最新明示方針は月額16 USDの一プランに一定のAI・Linux利用枠を含め、対象枠の超過分だけを事前合意の単価/上限で課金する（方式のみ確定、数量/対象/単価/繰越は未確定）、eSIMによる専用LinuxへのAdd、未払い時は新規実行を制限しデータ保持、支払と利用権復旧で同じworkspaceへ戻る、電子契約＋salt付きチェーン証明。最初に正本5ファイルとSky/MCP/Billing責任分界、docs/sky-tools-complete-design.md#sky-linux-marketplace、docs/evidence/sky-linux-service.json、対象sourceを読む。

GitHubでmainとcodex/esim-cloud-accessの最新SHA、同一SHAのCIを再取得する。今回の読戻しはmain 70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a、branch 951d82d5a491a284aed4e0d4d280171d835d4b43。branchにmainの新しいAndroid実装が未統合であり、既存dirty差分を保全し、引継ぎ/優先順位を同期する。CI0件を成功にしない。

まずsource/local fixtureの検証結果を確認する。次に運用者管理Linuxを一workspace一OS userで準備し、bubblewrap必須の既存固定モデルworker、CPU実測、lease失効/停止、成果持出し、restart/unknown復旧を同一jobで検証する。端末内の本人Linuxの成功を有料managed Linuxの計測証明にしない。issuerの現在の契約状態は導入証拠から推定せず、署名されたorder/device/sequence/expiryと現grantでつなぐ。eSIM issuer契約・Linux選定・従量単価/無料量/上限/猶予/保持/税/地域・Stripe Customer/受取口座/資格とsandboxが未確定なら本番gateを閉じる。

Stripeは同一Invoice→InvoicePayment/Intent/Charge→作者Transfer→失効/未払い→支払復帰、返金/異議→送金取消まで同一契約で受入。外部応答消失を再課金/再送金へ換算しない。クラウドLLMのLinux実行adapterは既存provider/見積/本人承認/予算/最終usageを再利用して実装し、pricing gateを無条件に解除しない。一般公開は保留。

チェーンと本人Walletが決まった後だけproofをanchorする。contract本文や個人情報をchainへ載せず、transaction受入まで未公開と記録する。既存Terminal/電話/設定/本人exportを停止しない。任意作者code、HF規模Hub、全モデル/機種対応は個別受入。

履歴snapshot参照（現在の完了根拠にしない）：
- 7cdbb5fedc86ee3978ed329d9312147d137c9199
- codex/integrate-native-os-20260909
- fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5
- codex/os-game-design-review-20260909
- de5b102d3525daccf604efd5685bdf8c14ad5d50
- OPEN
