# RockstarOS — 確定した製品ベース

2026-09-19 製品の三つの入口とavocadoMiniの訴求（v1.87）: 利用者は、製品紹介とOS導入サイトを兼ねるホームページ、作業するアプリ、OS本体を最上位の三つの入口として指定した。Sky、ZemaなどはアプリとOSの内側にあるサービスとする。現行ルートは製品・導入ホーム`/rockstaros`、WebアプリHome`/`、Developer Preview導入案内`/rockstaros/guide`であり、完成OSの一般配布は未実施。クラウドファンディング企画案は`/rockstaros/crowdfunding`に表示するが、支援募集と決済は未開始。avocadoMiniは「考える時間を、つくる時間に」を製品メッセージとし、希望参考価格41万円のハードウェア構想として示す。高性能LLMを搭載するRockstarOSで仕事と発明の作業をスムーズにすることが目標。41万円は確定販売価格、予約金額、OS従量料金ではない。高性能LLMの製品搭載・性能、製造原価、発売日は未検証・未確定。

2026-09-19 Web公開とバックエンド方針（v1.86）: 利用者は既存の `rockstaros-kaiya.noellesugar1.chatgpt.site` を本人限定から一般公開へ変更するよう明示した。公開ページと公開カタログは匿名閲覧を認め、仕事・Wallet・開発者操作など本人別データはChatGPTサインイン後だけ処理する。バックエンドはWorkerとD1の稼働および主要schemaを匿名のread-only healthで確認し、実操作は本人別のAPI受入を要する。一般公開の意思は確認済みだが、対象Sites所有アカウントが現在の接続から見つからず、配備・公開設定変更・本番DB readbackは未実施。自作部分の製品license条件も未確定で、Webの公開意思をOS imageやソースの再配布許諾へ拡張しない。

2026-09-19 利用者価値を先に伝える方針（v1.85）: 対外的な売りはRock側の収益方法から始めず、利用者が何をしたいか、そのためにどんなAIの役割や道具を見つけられるか、何を前へ進められるかから説明する。avocadoMiniは発明案を手で選び比べる主役のハードウェア構想、Skyは役に合うToolを探す入口、Zemaは依頼・確認・成果の入口として示す。Web版Previewと設計中の実機を明確に分け、現在できない体験を完成済みと表示しない。無料配布とOS従量課金の理念は維持し、料金条件の説明を製品価値の後段に置く。

2026-09-19 配布と料金の理念（v1.84）: 利用者は無料配布を理念とし、OSは従量課金制と明示した。配布時の価格と利用時の料金を区別する。無料配布の対象にavocadoMini本体を含むか、OS利用量の計量単位、単価、上限、外部実費の負担は未確定。既存のSky収益連動・月最大888 USD centsのruntimeと請求状態は、この新方針のOS従量課金と同一視せず、所有者が条件を確定し受入を終えるまで変更しない。配布や課金の実施済み宣言にはしない。

2026-09-19 対外的な事業の見せ方（v1.83）: 利用者の明示指示により、表に出す主役をハードウェア製品、最初の製品構想をavocadoMiniとする。RockstarOS、交換可能なLLM、Sky／Zemaは製品を支える技術基盤として説明する。これは技術開発の優先順位やOS Coreの契約を変える指示ではない。avocadoMiniは設計段階であり、実機試作、量産、販売、税務上の取扱いを完了・確定したとは表示しない。`/rockstaros`は製品構想を先に示し、Developer Preview導入とSky開発者入口を後段に置く。OS Home `/` は利用者の作業画面として維持する。

2026-09-18 avocadoMini Full-scale設計追記（v1.82）: 利用者の明示指示により、最終製品目標をビリヤード台規模へ具体化した。本体約3.0 m × 1.7 m × 高さ0.9 m、有効操作領域約2.4 m × 1.2 m × 高さ1.3 mを初期budgetとし、四方向podへ複数の光学viewpointをまとめる。小型Benchで誤commitと安全停止を受け入れた後にFull-scaleへ進む。二枚のconcept画像は人物scale、配置、演算rack、serviceabilityを共有する設計資料であり、実機、裸眼3D、触覚、追跡精度の完成証拠ではない。[端末設計](avocado-mini-spatial-invention.md)。

2026-09-18 Decision Fabric詳細設計（v1.81）: Jev／TypeSafe、Local Qwen、Cloud LLM、Codex、RAG、Market、Wallet、MCPを、deterministic codeが制御する一つの判断基盤へ統合する[完成設計書](jev-local-qwen-decision-fabric-design.md)を追加した。TypeSafe公式のChoice／Score／Noulとconfidenceの性質を照合し、Jevは小さな意味判断、Local Qwenは秘密・offline、Cloud LLMは明示同意済みの複雑推論、Policy Engineは唯一の実行権限判定者とする。共通contractと安全policyは追加したが、DecisionProvider、Router／Harness、TypeSafe／Cloud／RAG接続は未実装である。

2026-09-18 Jev ecosystem 10件の統合（v1.80）: 利用者指定URLの重複を除き、Jev Ultrafast、OpenJev、Jevlike、Jev Trader、Awesome Jev by TypeSafe、TypeSafe Computer Use、Jev Review、Jev Router、Jev Browser、Mobile Jevを役割別にSkyへ登録した。Skyは現在ready 11、candidate 13、合計24 Tool。判断model、browser、Mac、Android、review、routing、市場、referenceを別権限にし、TraderはPAPER限定、Mobileは隔離試験端末限定とする。[Jev ecosystem全体詳細設計](jev-ecosystem-integration-design.md)。source取得、依存導入、API／model／外部service接続、実行は未実施であり、ready数へ含めない。

2026-09-18 Jev Ultrafast候補の追加（v1.79）: `browser-use/jev-ultrafast`をSkyの4件目の導入候補へ追加した。AIが構造化された操作候補から一手を選ぶ方式を、専用Chrome profile、許可origin、`observe`／`prepare`／`act`、秘密入力拒否、外部作用直前の別承認、独立した完了検証へ収める。[詳細設計](jev-ultrafast-integration-design.md)は追加済みだが、source取得、依存導入、API key接続、browser操作は未実施であり、ready数には含めない。

2026-09-18 OS／全Tool詳細設計の正本化（v1.78）: avocadoMiniだけでなく、RockstarOS Core、Web／PC、Linux／QEMU、Android／Pixel、Local AI、仕事、権限、保存、更新・復旧、Wallet、運用と、当時のSkyの11 ready Tool、3 candidate Tool、native 6 Tool familyを同じ設計体系へ統合した。[全設計ポータル](rockstaros-design-portal.md)から[OS全体詳細設計](rockstaros-complete-design.md)、[全Tool詳細設計](sky-tools-complete-design.md)、[Material Invention詳細](rockstaros-avocado-mini-complete-design.md)へ進む。`npm run design:check`はcatalog Toolや正本の欠落を拒否する。これは現在scopeの説明被覆であり、未決定値や未実装の完成を意味しない。

2026-09-18 見て分かる設計への再構成（v1.77）: 共有用完成設計を、抽象的な部品説明から「目の前に何があり、手をどう動かし、画面がどう変わるか」が先に分かる構成へ全面改訂した。四方向配置図、8場面の利用例、画面wireframe、できる／できない、三つの世界の境界、処理順、実装phase、役割別の最初の仕事を追加し、専門仕様を後半へ分離した。

2026-09-18 共有用統合設計の正本化（v1.76）: RQ49の目的、avocadoMini四方向sensor、VR／AR／2D操作、安全境界、再計算、発明履歴、Patent AI、役割別の参加入口、実装順、受入条件を[共有用完成設計書](rockstaros-avocado-mini-complete-design.md)へ統合した。「設計完成」は実装、実機、材料性能、特許性、量産の完成を意味しない。担当作業の入口は[Material Invention / avocadoMini workstream](workstreams/11-material-invention-avocado-mini.md)とする。

2026-09-18 Material Invention標準体験の統合（v1.75）: `avocadoMini Spatial Invention Studio`を別のVR／AR拡張ではなく、RQ49 Material Invention Coreそのものを人が扱う標準製品体験へ固定した。Coreが物質・候補・安全・証拠の正本、avocadoMiniが四方向sensorとhand interaction、Simulation Orchestratorが再計算、Invention Event LedgerとPatent AIが発明化支援を担当する。headsetがなくても2D fallbackで同じloopを利用できる。

2026-09-18 Spatial Invention／avocadoMini設計（v1.74）: RQ48のVR応用とRQ49を接続し、四方向sensor／cameraで手を追跡して物質digital twinを接続・分離し、候補graphとsimulationを再計算する`Spatial Invention Studio`とRockstarOS reference device concept `avocadoMini`を設計した。操作履歴を既存Patent AIの発明開示・先行技術差分へ引き継ぐが、cameraによる物理物質操作、gestureでの物理実験承認、特許性・発明者の自動決定、自動出願は行わない。[XR設計](material-invention-xr.md)／[端末設計](avocado-mini-spatial-invention.md)。

2026-09-17発明sandbox Core実装（v1.73）: RQ49の最初の実装として、二物質・複数比率・工程条件から再現可能な候補graphを作る装置非接続sandboxを追加した。SDS不足、危険性不明、禁止物質、単位不一致、許可外設備、温度・圧力上限超過をfail closedにし、全出力の物理実行許可をfalseへ固定する。化学simulation、外部ラボ、実験設備、Zemaの仕事／限定記憶との接続は未実装。[契約と実装](material-invention-core.md)。

2026-09-17名称・発明Core追記（v1.72）: 利用者向け正式製品名を **RockstarOS** へ戻し、`RockstarOS 1.0 Developer Preview`を現在表示とする。AvocadoOSは2026-09-15〜16の旧表示名として履歴・署名済み証拠・既存データ内だけに残し、暗号domain、保存schema、artifact hashを表示名変更だけで破壊しない。同時に、物質、配合比、工程条件、安全性、シミュレーション、実験receiptを版管理し、新しい材料・用途の候補を作るMaterial Invention CoreをRQ49として追加する。OSは危険な物理実験を無人実行せず、安全審査、本人承認、資格を持つ外部ラボ、測定証拠を独立gateにする。[詳細設計](material-invention-core.md)。

2026-09-19 LLM分類訂正（v1.72）: 現行の端末内Qwen / llama.rnは固定profileの非信頼plannerであり、Tool実行・再試行・成果保存・権限判定の主体ではない。WebのOpenAI接続はSkyの法務受付・特許アシスタント2 Tool内部だけ。Jev (`typesafe-ai/jev`) はSkyから明示利用するremote evaluatorとして追加設計し、local modelや汎用generatorに数えず、結果を権限・承認・成功へ昇格させない。正本は[LLM・評価モデル設計](llm-evaluation-architecture.md)と`data/llm-capabilities.json`。Jev runtime、credential、同意UI、provider受入はAI07として未完了。

2026-09-17料金方針の訂正（条件確認中・未実装）: 所有者はシステムを公開し、Sky経由で利益が出た分に対する割合の成功報酬でマネタイズする意向を明示した。Walletはその支払いを円滑にする入口で、外部サービスから本人銀行口座への入金を自動的に徴収する権限ではない。開発者還元は実回収済み成功報酬の一部からとし、別途の還元負担を追加しない。率、対象利益の定義、従来の月888 cents上限との関係、回収方法は未確定。以下の月上限等は現行実装の説明であり、新料金の承認・実装済みを意味しない。正本JSONの`commercialPolicyRevision`と[Sky経済設計](sky-network-economy.md)に区別を記録する。

2026-09-16詳細設計追記（v1.71）: RQ48を[AIネイティブOS詳細設計](ai-native-os-architecture.md)へ具体化する。Astraが設計、Solが[独立監査](ai-native-os-design-audit.md)を担当。モデル・記憶・仕事・外部作用・端末能力の契約と、1.0 Core／便利機能／Game・IP／収益の独立受入を定義する。現在の固定runtimeと純粋な2工程Toolの実機受入から、汎用モデル交換・共有記憶・外部作用・多端末の完成は推測しない。詳細設計の保存はruntime実装や製品公開の完了ではない。

2026-09-16全体方針追記（v1.70）: 製品中核を、高性能で交換可能なローカルLLMとoffline agent runtimeを持つAIネイティブOSへ明確化した。Sky／Zemaを最初の第一者system、仕事・生活を便利にする自動化を継続開発系統、ゲーム・IP／動画・VRを関心に基づく優先的な応用系統とする。個別systemはOS imageへ密結合せず、共通の権限・記憶・仕事・Tool・receipt・更新・復旧契約で接続して独立改善できるようにする。RQ48を追加する。

2026-09-16 full build入力freeze追記（v1.69）: Pixel 10 GL066のGoogle factory image／full OTAについて、repo外のowner同意記録、公式download URL／掲載SHA-256、実byte SHA-256、ZIP安全性、frankel、A/B、同一build IDを検査する。固定adevtool revisionから生成した`vendor/google_devices`全file／内部symlinkを決定的inventoryへし、build直前に再検証する。正式署名は承認済みpolicyと手順のhashだけをfreezeし、HSM調達、秘密鍵、署名bridge、target-files由来の正確な鍵inventoryは未完了のまま保持する。合成fixture 9/9は合格し、build入口へ三検査を接続した。Google利用条件への代理同意、実ファイル取得、全source／vendor生成、HSM、full build、flashは行っていない。[証拠](evidence/android-prefull-input-freeze-20260916.json)。

2026-09-16 Operator公開設定stager追記（v1.68）: Pixel 10 GL066の単一端末preview用に、Operator Dockの正確なHTTPS origin、WebAuthn P-256公開情報、外部connector隔離対象、32-byte端末attestation challengeだけをrepo外JSONから静的product RROへ生成する。未知field、secret混入、symlink、改変、非P-256、origin／RP不一致、製品package隔離、StrongBox無効、factory reset有効をbuild前に拒否する。StrongBox鍵aliasはchallengeのSHA-256へ結び、以前のchallengeで作った端末identityを再利用しない。Python 9/9、Android build／lint、Android 15 emulator 6/6は合格。本番WebAuthn値、実RRO、StrongBox attestation、Device Owner、Dock配備は未実施で、複数端末版にはruntimeの一回限りchallenge enrollmentを別途実装する。[証拠](evidence/android-operator-overlay-stager-20260916.json)。

2026-09-16 Operator Agent実装追記（v1.67）: OS外のOperator Dockに署名付きdevice poll／ack／resultを追加し、登録済みP-256端末鍵、±120秒timestamp、nonce、body digestを検証する。launcher非表示・別UIDの`dev.rock.operator.agent`はWebAuthn commandを対象端末、RP／origin、UP／UV、署名、期限、scope、単調増加counterまで独立検証し、verify→永続化→ack→Device Owner allowlist実行→local result永続化→remote resultの順で処理する。端末監査はAndroid Keystore HMAC chainで、任意shell・私的内容・Wallet・鍵への経路は作らない。Node 14 test、Worker dry-run、Android build／lint、Android 15 emulator 5/5は合格。production credential、StrongBox attestation、Device Owner実行、remote session失効、Pixel 10実機は未完了で、factory reset gateは無効のままとする。[証拠](evidence/android-operator-agent-emulator-20260916.json)。

2026-09-16 backup v2実装追記（v1.66）: 所有者専用256-bit recovery secretをRockstarOS専用checksum付き24単語で提示し、指定4単語の再入力後だけ有効化する。Shell API v4からdual-wrapped v2 backupをexportし、空のowner領域へtransactional importした後、新しいAndroid Keystore鍵へ再bindingする。復元後は自動化を停止し、Sky tokenをrotateし、active承認と実行中leaseを無効化し、導入component authority、Wallet秘密鍵、session、operator credential、provider secretを復元しない。Core 37/37、Android 15 emulatorのBroker 11 non-skipped／Shell 5/5、source build／lint 207 taskは合格。Pixel 10の物理wipe／復元／再起動は未実施なので初回flash gateは未合格のまま維持する。[証拠](evidence/android-backup-v2-emulator-20260916.json)。

2026-09-16 native Sky永続handoff追記（v1.65）: Shell API v3へ`selectSkyTool`と`skySelection`を追加し、Skyで選んだ`article-preparation@1`をShellの一時状態ではなくBroker SQLite schema v2へ保存する。Zemaは保存済みselection tokenが一致する場合だけLocal AI計画を開始し、不一致は仕事0件で拒否する。schema v1→v2 migration、DB再open、Android 15 emulatorのBroker 9/9・Shell 4/4、全Android 378 taskは合格した。Pixelを実際に再起動して実行中leaseを復旧する二段階試験は端末再接続待ちで、まだ合格扱いにしない。

2026-09-16計画専用AI結合追記（v1.64）: Local AI Binder API v2へ`article-preparation@1/input-v1`の計画専用callを追加し、JSON Schema constrained decoding、Tool call禁止、Broker側のclosed field／選択Tool／実行可能性の再検証を固定した。Android 15 emulatorはBroker 8/8・Shell 3/3でモデルなし0件停止、所有Pixel 10 GL066は同じ試験数でZema plan、`citations@1`、`free-article@1`、結果、5履歴event、本人確認待ちまで合格した。native Skyの永続handoff、全経路の再起動／失敗復旧、AOSP image、production署名は未完了である。[実機証拠](evidence/android-local-ai-plan-v2-20260916.json)。

2026-09-16全体構成追記（v1.63）: RQ47の製品目的に対して、OS、Sky、Zema、Android Shell／Broker、Local AI、Tool、検証済み収益、Wallet／Fund、Operator、更新・復旧、Gameの選択と接続状態を全体構成監査へ固定した。現在の選択は整合するが、全component実装、全必須経路の統合、production準備はいずれも未完了とする。旧BlackBerry-firstの現行task表現とQEMU-firstのスマホ優先順位を退役し、Pixel 10 GL066上のoffline AI team loopをfull build前の最優先とする。[全体構成監査](system-composition.md)。

2026-09-16端末基盤追記（v1.62）: 外部Providerは初回OS full buildへ焼き込まず、更新可能なアプリ／サーバー側へ分離する。ただし外部Provider sandbox、返金／chargeback、払出し、再照合はRockstarOS 1.0で実収益を表示・公開する前の必須gateとし、未合格中はlive収益を表示しない。Pixel 10 GL066はGrapheneOS `2026091000`のmanifest tag署名、manifest／adevtool／laguna-muzel 6.6入力と、読取り専用ADBによるDynamic Partition／Virtual A/B／AVB 1.4構成まで固定した。Google純正factory image／full OTAの利用条件確認、実ファイル取得とSHA-256、vendor生成inventory、production署名／復旧計画が未完了なので、有料full build、unlock、flashはまだ開始しない。[source／layout監査](evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json)／[source lock](../os/physical/frankel-source-lock.json)。

2026-09-16結合試験追記（v1.61）: 同じ合成実行IDと証拠hashをPixel 10 GL066のTool／端末Wallet区間と、Provider署名／Sky bridge／Billing Wallet区間へ渡した。物理instrumentation 6/6、署名精算7/7、Sky→Zema job回帰19/19に合格し、端末側はTool二段実行、review、Provider登録、Wallet一度だけ記録、重複拒否まで確認した。これはRock所有fixtureによる相関済み二区間であり、端末から外部Providerまでの配備済み一本通し、実売上、sandbox、実払出しではない。外部Provider受入とGL066のBSP／vendor／partition／boot／純正復旧、source／artifact／production署名計画のfreezeが残るため、有料full buildはまだ開始しない。[相関試験証拠](evidence/pixel-tool-wallet-correlation-20260916.json)／[事前試験](evidence/android-pre-full-build-tests-20260915.json)。

2026-09-16実機試験追記（v1.60）: 所有Pixel 10 GL066の既存OS上へ試験専用同一署名のLocal Action Assistant、Automation、instrumentation、記事Toolを導入し、物理端末instrumentation 5/5、Qwen3-0.6B Q8_0の機内モード推論、再起動後の会話／model metadata保持と手動reload、33分22秒・15推論の熱試験を合格した。最大電池温度34.4℃、Android thermal status 0、process restart 0。Sky→Zema→Tool→WalletはRock所有fixtureの自動receipt bridgeまで合格したが、この時点では物理Pixel上のWallet Provider縦断は未実証だった。GL066のBSP／vendor／partition／boot／純正復旧とsource／artifact／署名計画のfreezeが残るため、有料full buildはまだ開始しない。[実機証拠](evidence/android-pixel-10-gl066-local-ai-20260916.json)／[事前試験](evidence/android-pre-full-build-tests-20260915.json)。

2026-09-16実機追記（v1.59）: 所有端末を読取り専用ADBで確認し、最初の物理対象を日本向けGoogle Pixel 10、型番／SKU `GL066`、codename `frankel`へ確定した。現在はGrapheneOS `2026091000`／Android 17で、bootloaderはlocked、別Verified Boot鍵のyellow状態。端末識別番号は保存しない。これによりAndroid物理端末の「正確な機種／SKU」gateだけを1/5合格とする。RockstarOSのfull build、flash、boot、BSP／復旧、CTS、production署名、販売準備は未合格で、有料full buildは開始しない。[端末inventory](evidence/android-pixel-10-gl066-device-inventory-20260916.json)／[boot状態](evidence/android-pixel-10-gl066-boot-state-20260916.json)。

2026-09-15検証追記（v1.58）: v1.56で不合格だった試験2のうち、Tool完了→Provider署名付きEarning Receipt→Wallet一度だけ反映をROCK_READY fixtureで実装・合格した。Provider署名、完了済み・非サンプルjob、本人、Tool、時刻をSky bridgeで照合し、収益Provider鍵、Billing転送鍵、払出し鍵を分離する。同一Receipt再送は冪等、同じ実行への異なるReceiptは拒否する。実販売・決済Provider sandbox、返金、chargeback、実払出しは未接続であり、試験2全体や1.0の合格、実収益実績にはしない。試験1の所有Pixel 10、実GGUF、機内モード、保存／再起動、30分温度、正確なSKU readbackも未実行のため、有料full buildは引き続き開始しない。[bridge受入証拠](evidence/tool-earning-wallet-bridge-20260915.json)。

2026-09-15追記（v1.57）: 最上位目的を、利用者が自分専用のAI自動化チームを所有し、その効率を継続改善して、便利さと検証可能な収益機会を増やし、利用者全体の豊かさへつなげることに固定する。OS、Pixel、Wallet、ファンド、ゲームはこの目的のための層であり、OSやスマートフォン開発自体を目的にしない。Pixelは最初のreference hardware、カメラ品質は1.0完成条件外、専用端末は価値実証後の配布形態とする。月50万円規模は長期の実測到達指標であり、収益・利回り・達成時期の保証ではない。offline-first実行、Tool→署名済みEarning Receipt→Wallet、ファンド改善、合法的な税務準備、同意可能な改善データ収集、ゲーム派生の順に逆算する。RQ47と[製品目的から逆算した開発軸](product-north-star-20260915.md)を追加する。

2026-09-15検証追記（v1.56）: 有料Linux環境でのAndroid OS full buildと実機flash／bootは最後に行う。Android単体build／lint、emulator上のBinder／SQLite、Local Action Assistant arm64 APK生成・hash固定・署名限定Binder・GGUFなしの安全な拒否は合格した。純正OSの所有Pixel 10上でのGGUF機内モード推論・保存／再起動・30分温度試験は未実行のため試験1は部分合格。Sky→Zema、job、Android Tool、Wallet／認証済み収益の個別試験は合格したが、Tool完了を署名済みEarning ReceiptとしてWalletへ自動転記する経路が未実装のため試験2は不合格である。正確なSKU readbackと最終freezeを含め、全て合格するまで有料full buildを開始しない。Sky、Zema、Wallet、Tool、LLMのapp-only修正は単体APK更新で反復できる境界を維持し、framework、SELinux、privapp/product設定、boot/vendor/partition/AVB変更だけをOS image再build対象とする。初回build環境はfactory／OTA／target-filesを保存し、最初の実機bootと修正要否の確認まで保持する。[事前試験証拠](evidence/android-pre-full-build-tests-20260915.json)を判定正本とする。

2026-09-15追記（v1.55）: RQ46の「運営専用」を利用者向けRockstarOS内の隠しrouteではなく、配備先、認証、asset、API、D1を分けた **RockstarOS Operator Dock** として訂正する。利用者向けWeb/PWA・OSホームには管理画面、管理API、入口を含めない。Dockの全requestは静的assetを含めCloudflare Accessの署名JWTをissuer、専用audience、有効期限、単一operator subjectまで検証してから処理する。端末側service未実装の境界は維持する。

2026-09-15記録（v1.54、v1.55で廃止）: 当初は利用者向けWeb内の`/operator`管理画面として実装したが、運営側Dockという要件に反するためv1.55で削除・分離した。ここに記したrouteとWeb D1構成は現行仕様ではない。

2026-09-15追記（v1.53）: 紛失・侵害・悪意あるTool等の緊急時は、事前登録された端末に対して認定運営担当者1名が本人のその場の承認なしで保護を開始できる。操作は端末ロック、紛失mode、Sky／Zema停止、session失効、OTA停止、通信隔離、sanitized診断、最大15分の限定保守sessionへ限定する。常設root／任意shell、私的内容閲覧、Wallet操作、秘密鍵取得、マイク／カメラ起動は禁止し、端末側の署名・scope・期限検査、hardware operator credential、追記監査、事後通知を必須にする。設計承認とAndroid service／実機受入を分離し、RQ45を追加する。

2026-09-15追記（v1.52）: 現在の共通製品版を`RockstarOS 1.0`、公開前の段階表示を`RockstarOS 1.0 Developer Preview`で固定する。製品版は一つの正本から表示し、互換性を維持する機能改善は`1.5`のようなminor更新、Platform APIや保存形式の非互換変更はmigration・rollback受入を必須にして`2.0`のようなmajor更新とする。機種別Device Support Packageは対応Core版の範囲を宣言し、版番号だけで完成・公開可能とは扱わない。RQ44を追加する。

2026-09-15履歴（v1.51、v1.72で表示名を復元）: 利用者向けの正式製品名を当時`avocadoOS`へ変更した。内部識別子`dev.rock`、Android package／permission、署名境界、保存schema、`rockstaros-*`識別子、`@rockstaros` package scope、URL `/rockstaros`、既存artifact名は互換名として維持した。2026-09-17のv1.72以降、現在表示は再び`RockstarOS`とするが、この期間の署名済み証拠と配布物は改変しない。

2026-09-15追記（v1.50）: Skyで選んだToolと自然文の依頼をZemaへ一回だけ引き継ぎ、Zemaで入力確認、実行、ライブ状態、結果、履歴を連続して扱う。依頼本文はURL、D1、server logへ新規保存せず、同一tabのsession storageへ最大2,000文字・10分だけ保持し、対象Toolが受け取ると削除する。jobの受付、開始、完了、失敗は同一画面ではbrowser eventで即時反映し、本人別D1 jobを3秒／15秒の再照合で補完する。専用画面を持つCSV、Mercari、Market等もZemaに担当カードを表示してから実行面へ進み、既存のreceiptと安全gateを迂回しない。

2026-09-15追記（v1.50）: Skyで選んだToolと自然文の依頼をZemaへ一回だけ引き継ぎ、Zemaで入力確認、実行、ライブ状態、結果、履歴を連続して扱う。依頼本文はURL、D1、server logへ新規保存せず、同一tabのsession storageへ最大2,000文字・10分だけ保持し、対象Toolが受け取ると削除する。jobの受付、開始、完了、失敗は同一画面ではbrowser eventで即時反映し、本人別D1 jobを3秒／15秒の再照合で補完する。専用画面を持つCSV、Mercari、Market等もZemaに担当カードを表示してから実行面へ進み、既存のreceiptと安全gateを迂回しない。

2026-09-15追記（v1.49）: 仕事の依頼、実行、進捗、確認、結果、履歴を扱う標準アプリの正式表示名を`Chat`から`Zema`へ変更する。既存データ、ブックマーク、外部連携を壊さないため、アプリID`chat`、URL`/chat`、内部の`chatInteraction`および`sky-chat-*`識別子は互換名として維持する。本書の過去記録にある`Chat`は、現在の`Zema`を指す旧表示名として読む。

2026-09-15追記（v1.48）: SkyはToolと自動化ファンドを選ぶ場所、Chatは選択後の進捗を動的に確認する場所とする。ChatはGrok型のライブ活動表示として、受付、開始、実行、確認待ち、完了、保存と、ファンド内Toolの状態を自動更新する。ただしモデルの内部思考は公開せず、本人所有のjob記録、ファンド参加状態、検証済み受領記録だけを表示する。未確認の進捗・収益・利回りを生成しない。ファンド参加後は`/chat?fund={fundId}`、CSV Tool開始後は`/chat?tool=rockstar-csv-cleanup`へ引き継ぐ。

2026-09-15追記（v1.47）: CSV整形・検査・納品は「仕事管理機能」ではなく、Skyの自動化Tool商品として収録する。Skyの自動化ツール群に`CSV自動化役`として表示し、通常のToolと同じく目的から検索・選択できる。Chatは仕事の管理面であり、CSVの商品所属をChatへ変更しない。

2026-09-15追記（v1.46）: 仕事の作成、指示、手順実行、確認、停止、再試行、結果、履歴をChatの仕事管理画面へ集約する。SkyはToolを探して接続する場、Chatは接続済みToolと仕事を動かして管理する場とする。既存の`/work`と`/activity`は`/chat?view=work`へ案内する互換入口とし、保存済みデータは削除・変換しない。CSVはSky内のToolとして維持する。

2026-09-15追記（v1.45）: Webフロントはスマートフォン幅320〜767pxを正式なresponsive範囲として扱う。device-width、初期scale 1、notch／home indicatorのsafe area、主要操作44px以上、入力時のiOS自動拡大防止、画面全体の横はみ出し禁止を共通契約にする。ホーム、Sky、Chat、Wallet、Market、設定、仕事・履歴、CSVをこの契約に合わせる。

2026-09-15追記（v1.44）: ワークスペースの常設サイドバーを廃止する。ホームへの復帰は上部の直接導線を維持し、Sky内の仕事・CSVなど画面固有の移動は必要な場所にだけ表示する。折りたたみ式サイドメニューも標準表示へ戻さない。

2026-09-15追記（v1.43）: 仕事・実行履歴とCSV仕事は独立したホームアプリではなく、収益Toolを収録するSky内の画面として扱う。ホームと共通メニューの独立入口を廃止し、Sky内から開く。既存の`/work`、`/activity`、`/csv`は保存済みリンクとデータの互換入口として維持し、Sky選択中として表示する。

2026-09-15追記（v1.42）: OS本体へ、Tool／MCP／Providerの共通登録API、Platform API version契約、APK署名・UID・SELinux境界、本人確認付き一回承認、費用上限、停止・失効、追記型Wallet台帳、receipt重複防止、Android Keystore暗号化backup、schema migration、署名・互換性付き更新／rollback gateを追加する。source実装とAndroid/AOSP build、SELinux enforcing boot、production署名、OTA rollback実証は分離し、未実行のrelease gateを合格表示しない。RQ42を追加する。

2026-09-15追記（v1.41）: Local Action AssistantをRockstarOSの物理Android版へ、オフラインのローカルLLM runtimeとして導入する。固定sourceとoverlay、署名限定Binder API、変更系toolの別確認、APK hash・permission・ABI検査を必須にする。source実装とAPK/native build・OS image・実機合格を分離し、未生成artifactを搭載済みと表示しない。RQ41を追加する。

2026-09-15追記（v1.40）: RockstarOS本体、Developer Preview紹介、Rock Studioを同じvisual systemへ広げ、主要導線、状態表示、キーボード・タッチ操作、mobile表示の機能性を監査して改善する。既存の業務機能、金融安全境界、CSV販売実証を維持する。RQ40を追加する。

2026-09-15追記（v1.39）: Developer Preview紹介とRock Studioを、一つのRockstarOS visual systemへ統一する。黒背景、黄緑アクセント、太い英字見出し、monospaceの補助表示、丸い主操作を共有し、Studioはコード入力を第一画面の主役にする。機能・安全境界・Home導線は維持する。RQ39を追加する。

2026-09-15追記（v1.38）: Developer Preview紹介ページを、OSインストールを主操作にした一画面へ簡素化する。Sky開発者には同じページで最小SDKコードを示し、本人限定Siteの`/studio`へ直接進めるようにする。配布前候補を導入可能と誤表示せず、現在の対応環境と公開前状態は短く明示する。RQ38を追加する。

2026-09-15実装追記（RQ01〜RQ36不変）: 最初の販売実証をCSV整形に絞り、`rockstar-csv-cleanup`を追加する。市場補助型で、本人が外部市場の受注・連絡・入金を扱い、RockstarOSは私有ファイルの受付、決定的変換、独立検査、成果物、7日削除を担う。購入者試験価格は税込3,000円。CSV販売者向けの限定policyはJST月のProvider確認済み純入金30 USD相当以上の月だけ8.88 USD、未達月0、債務繰越なしとする。これは既存RQ20の「月最大888 cents、先払い・債務化なし」を狭める商品別条件であり、他商品の契約を変更しない。正本は [CSV仕事 v1](csv-business-v1.ja.md) とする。

2026-09-15追記（v1.38）: Rock Studioの開発者入力を、Sky SDKコードを既存ツールへ追加する方式へ変更した。ソース本文をSkyへ渡さず、ツール起動時にPackage生成、所有者登録、宣言公開、MCP公開、匿名利用記録を行う。RQ37を更新する。

2026-09-13追記（v1.36）: 利用者は、既存フロントへWallet backendを接続し、本番環境で実際に使えるところまで進めるよう明示。RQ36を追加する。最初の実受取レールはBase MainnetのUSDCとし、外部EIP-1193 WalletでRockの受取アドレスを所有署名する。RockstarOSは秘密鍵、seed phrase、包括的送金権限、利用者資産を保管しない。署名済みEarning Receiptから既存ルールで確定した `SKY_SERVICE_FEE` の回収指図だけを作り、Base上の公式USDC contract、exactな受取先・金額、finalized blockを照合して着金確定する。本番配備は実施対象だが、owner Walletの登録と最初の実transferは本人署名・本人確認が完了するまで実施済みにしない。本人限定Siteを一般公開する前にowner受取先を登録する。

2026-09-13追記（v1.35）: 利用者は、外部Wallet会社待ちではRock自身の回収ができないため、最初は自社側のWalletで進める方針を明示。RQ35を追加する。最初のProviderを `org.rockstar.settlement-wallet` とし、署名検証済み収益から既存ルールで確定したRock利用料の受取・報告を担う。共通Provider Adapterを迂回せず、外部事業者の追加・差替え余地を維持する。初期capabilityは `collect_platform_fee` と `reporting` のsandboxだけで、利用者資産の包括保管、任意送金、交換、ファンド運用、LIVE回収は有効化しない。

2026-09-13追記（v1.34）: 利用者は、Wallet会社とファンド会社の固有機能をRockstarOS自身が抱えず、外部事業者を交換可能なProviderとして接続する受け身設計を明示。RQ34を追加する。Rockはcapability discovery、本人同意、実行指図、状態・receipt・照合の共通契約を提供し、保管、運用、約定、払出し、税務判断は各Providerの契約・許認可・対象地域に従う。Provider固有機能は拡張manifestから提示し、未対応機能をOSが擬似実装しない。これによりWallet／ファンドの二次事業者がOSを再buildせず参入・差替えできる余地を残す。現在の外部Provider、実資金、LIVE運用は未接続のまま維持する。

2026-09-13追記（v1.33）: 利用者は、Polymarketを掲載・再販売するのではなく、同種の見通しの良い市場UIを参考に、あらゆる価値を型付き取引対象として扱う独自市場と、複数自動化ツールの組合せを実績から更新する自律型ファンドを明示。RQ33を追加する。MarketはPAPER限定で、提案、risk判定、exact digestへの本人承認、予約、実行receipt、position、append-only eventをD1へ保存する。ファンドは本人の検証済み帳簿と実行receiptを30秒ごとに再集計し、構成・配分・観測利回りを更新するが、証拠がなければ利回りを表示せず、資金移動も行わない。Polymarket、外部市場、実Wallet、LIVE注文、清算は有効化しない。

2026-09-13追記（v1.32）: 利用者は、RockstarOSの全画面からHomeへ直接戻れる仕様を明示。RQ26へ追加する。共通WorkspaceShellの上部に常設のHome導線を置き、設定、システム、自動化ファンド、旧試算、Developer Preview案内の独自レイアウトにもHome導線を持たせる。ブラウザの戻る操作やロゴの意味を知らないことを前提にせず、今後追加する非Home routeも同じ契約へ従う。

2026-09-13追記（v1.31）: 利用者は、個別branchや過去の公開版に散在した良い実装を、現行設計と安全条件へ矛盾しない形で正本へ統合し、崩れた画面を完成版へ上書き保存するよう明示。RQ32を追加する。Chatは接続済みready商品と任意MCPをbotとして扱い、方向修正、1回承認、実行、停止、結果を同じスレッドへ集約する。Walletは本人別の残高・売上・経費・取消履歴を永続化する。主要画面のCSS契約とbuild asset closureを全体verifyへ追加し、GitHubと本人限定Sitesを同一source commitへ固定する。一般公開、実資金、マイナンバー、production鍵のgateは変更しない。

2026-09-13追記（v1.30）: Android物理端末を型番/SKU、BSP/boot/recovery、同一buildのCDD/CTS、production署名、販売地域の5必須gateへ固定する。現在0/5で、Android互換・GMS許諾・物理flash・販売可能を表示しない。マイナンバーは無効化、目的、主体/provider、data flowと保存/削除、安全管理、事故/委託先、最終有効化の7必須gateへ分ける。現在1/7で、番号・カード画像・通常profile項目を取得しない。

2026-09-12追記（v1.29）: 利用者は、OS公開の最低条件を満たすまで作業を継続するよう明示。RQ31を維持する。QEMU rc2の1GB配布archiveをSHA-256照合後に取得し、同梱legal bundle、target 24＋host build 37 componentのmanifestを同じarchiveへ固定した。current native CycloneDXを生成し、10要件中6件の合格と4件の未達を機械判定する。さらに候補準備・法務承認・保護署名・本人署名の計62公開fixture回帰を全体verifyへ必須化するが、実鍵・owner承認・署名後受入の代用にはしない。

2026-09-12追記（v1.26）: RQ30を追加する。公開状態を本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android物理端末、iPhone/iPad client、マイナンバー連携へ分け、必須gateから機械判定する。製品ライセンスの所有者選択とtop-level LICENSE、正式鍵の実施記録、同一候補の受入がない状態を合格にできない検査を追加し、Web/npm依存のCycloneDX SBOMはignored領域へ生成する。

2026-09-12追記（v1.25）: 利用者は、OSを運用するための必要最低限の機能を設定へ入れることと、OS公開時の審査規定の有無を確認するよう明示。RQ29を追加する。端末実測診断に安全な接続、通知許可、永続保存、アプリ表示を加え、通知テスト、保存保護、個人情報を除外した診断レポート、確認付きのホーム設定初期化を実装する。日常運用と公開条件は分離し、Web/PWA、QEMU、Android CDD/CTS、GMS、実機/BSP、正式署名、OSS配布、販売地域の無線規制、マイナンバー取扱いを同じ「合格済み」にしない。

2026-09-12追記（v1.24）: 利用者は、Skyの標準自動化ツールが利用者へ一定の収益機会を作り、その検証済み収益から8.88 USDを回収する具体的な入口として、メルカリ自動化をベースにする方針を明示。RQ28を追加する。個人メルカリでは出品原稿・実費後利益・進捗の支援に限定して本人が公式画面で操作し、公式APIのあるメルカリShopsは契約済みの日本国内固定IP Connectorから接続する。売上や利益を保証せず、自己申告・出品完了・支払いだけを検証済み収益にせず、Providerで取引完了と金額を照合してからRQ20の精算へ渡す。

2026-09-12追記（v1.23）: 利用者は、RockstarOSの標準入口をiPhoneに着想を得たホーム画面とし、フロントの外観を利用者が変更できること、さらに設定アプリへOS稼働に必要な確認・操作をまとめることを明示。RQ26を維持し、RQ27として端末上で実行できる診断、暗号化バックアップ、改ざん検知付き復元、Web/PWA更新確認を追加する。物理端末のドライバ、bootloader解除、正式署名鍵、外部Provider資格情報は画面だけでは生成できないため、準備条件として明示する。

2026-09-12追記（v1.22）: 利用者は、RockstarOSの標準入口をiPhoneに着想を得たホーム画面とし、フロントの外観を利用者が変更できること、さらに設定アプリへOS稼働に必要な確認・操作をまとめることを明示。RQ26を追加する。`/`はホーム、Sky本体は`/sky`とし、基本4アプリの責任境界は維持する。設定はOS標準utilityとして、外観、本人アカウント状態、PC Connector、MCP権限、Web更新、導入・復旧案内をまとめる。外観設定はこの端末内だけに保存し、OS権限や本人情報を変更した扱いにしない。

2026-09-12追記（v1.21）: 利用者は、MCPごとの個別実装ではなく、Skyから多種類のMCPへワンタップ接続でき、n8n・Make・Zapier等を含む自動化ツールからも再利用できる共通systemを明示。RQ25を追加する。審査済みregistryからstdio / Streamable HTTPを起動・接続し、protocol交渉、機能取得、Connection Passport、引数に結び付いた一回承認、結果不明時の再送禁止を共通契約にする。UIから任意shellを登録せず、秘密情報はPC側の環境変数に残す。OAuth 2.1 browser flowと公開remote MCP相互運用は未受入として接続済みにしない。

2026-09-12追記（v1.20）: 利用者は、Skyから複数のMCPへワンタップ接続できることと、実行先をどこにするか選べることを明示。RQ24を追加し、接続先を「このPC」「Sky Cloud」「提供者のMCP」の3系統に固定する。SkyはMCPごとの対応先と推奨先を表示し、未実装先は選択不能にする。現時点で実接続可能なのはローカルPCだけで、Sky Cloudと提供者MCPのワンタップ接続はOAuth、権限差分、接続証跡、失効まで揃うまで準備中と表示する。

2026-09-12追記（v1.19）: 利用者は、8.88 USDを利用者へ先払い請求するのではなく、Skyの自動化ツールが実収益を生み、その検証済み収益からだけ回収できるsystemにするよう明示。RQ20をStripe定期購読から成果連動精算へ訂正する。売上・入金0なら回収0、実費後の残額が888 cents未満ならその範囲だけ、未達分の債務化・翌月繰越・カード請求はしない。ToB利用料・売上手数料0は維持する。

2026-09-12追記（v1.18）: 利用者は、MCPが完全に使えるか、既存自動化ツールを問題なく導入・利用できるかを実測し、導入方法の画面も整えるよう明示。Sky内のMCP表示を合成URL確認から実在するPC接続へ結び直し、配布パック、接続アプリ起動、MCP初期化、4機能検出、Skyからの実行、履歴保存を一つの導線にするRQ23を追加する。ローカルMCPの実装済み範囲と、任意の外部MCP URL、実Provider、Native/スマホ組込み等の未実装範囲を混同しない。

2026-09-12追記（v1.17）: 利用者は、MCP機能がSkyの外にある構成では不十分であり、Sky本体の中に必要と明示。独立したSky Networkナビゲーションを標準入口にせず、Skyの最初の画面でMCP接続状態を確認し、接続・管理、Connection Passport、実行契約、料金境界、分配receiptへ進めることをRQ22へ追加する。ツール掲載もSky内で開き、Sky画面では常設sidebarを表示しない。旧`/sky/network`と`/sky/publish`はSky本体を開いて対象機能を表示する互換入口とする。実MCP接続、実課金、実送金の有効化条件は変更しない。

2026-09-12追記（v1.16）: 利用者は、外部tobがSkyへ入る際の登録・接続・公開・Sky売上手数料を0円とし、tobからSky利用料を徴収しない方針を明示。ToC向け月額8.88 USD、外部provider/決済実費、tob自身が設定する商品価格とは分離する。Connection Passport、実行契約、検証済み貢献receipt、取消・不明状態を含む精算を一つの導線で見せるSky NetworkフロントをRQ21へ追加する。現在はフロント設計と合成表示であり、実MCP接続、実報酬分配、実送金を開始したとは扱わない。

2026-09-12追記（v1.15）: 利用者が事業収益のため、Skyで月額8.88 USDを実際に回収できるsystemを必須と明示。Stripe Checkout、署名Webhook、契約・請求台帳、二重申込み防止、支払い・解約管理をRQ20へ追加する。本番コードの準備と実売上の開始は分け、Stripe事業者確認、入金口座、販売表示、live鍵、sandbox受入と本人の最終確認が揃うまで実課金は有効化しない。

2026-09-12追記（v1.14）: 利用者がFashion Brand Opsをより自律的なブランド経営systemへ進める方針を明示。売上・数量・粗利・期限・広告上限から計画するCampaign Autopilot、会話履歴と購入意向から次の一手を作るAI Sales Concierge、署名検証済み入金後の原価・資材・能力・納期を扱うProduction CockpitをRQ19へ追加する。計画と下書きは自動化できるが、投稿、広告、DM、請求、返金等の外部作用は既存approval gateを迂回しない。

2026-09-12追記（v1.13）: RockstarOS 1.0の基本アプリを **Sky / Chat / Wallet / Polymarket** の4つとして整理する。Skyは自動化アプリを探して接続するエコシステム、Chatは接続済みアプリへの依頼・確認・処理状況・結果の受取、Walletは収支と資金管理、Polymarketは他3アプリから権限と資金を分離した外部市場アプリとする。Polymarketのアプリ枠採用は実取引の開始許可ではなく、提供地域・年齢・本人確認・規制・外部契約を満たすまで市場取得、注文、入出金を無効にする。

2026-09-12追記（v1.12）: 利用者向けの自動化ツール入口を **Sky** と命名し、画面・現行設計・案内をこの名称へ統一する。Skyは商品を並べるだけでなく、目的からの選択、作者・版・権限・料金・実行先の確認、本人同意、端末/PC/Cloudへの実行、停止、結果・実行記録までを一つの制御面にする。[Skyの役割と収録ツール](sky.md)を正本に追加した。保存済み履歴、SQLite table、JSON/APIの `hub` は互換性のため内部名として維持し、製品名として新規表示しない。

2026-09-12追記（v1.11）: 利用者は、共通Core、機種別Device Support Package、`native_os`／`gsi_experimental`／`client_only`／`unsupported`の提供区分で多機種対応を進める方針を選択。Pixel候補は未確定、BlackBerryは正確なモデルのunlock・vendor・復旧証拠がある場合だけ実験対象、iPhone/iPadはOS置換ではなくclientとする。[多機種対応設計](device-support-architecture.md)と[対応台帳](../data/device-support-matrix.json)を正本に追加した。この決定はクラウド課金、端末書込み、production鍵、実機対応完了の承認ではない。

2026-09-11追記（v1.10）: 利用者がスマホ本体へ書き込めるOS版の作成を明示。実機版の開発を進める。Pixel 10は以前の記録からの候補で、現在の対象機種/SKUは未確認。Linux環境は利用者にもない。クラウドbuildとAndroid系機種対応の再利用を準備するが、QEMUや2APKを実機完成と表示しない。[実行記録](phone-preview-20260911.md)。以下はRQ01〜RQ20と以前の方針を保持する。

2026-09-09追記: 設計v1.1の実装承認を受領。公開・実機・MetaMask実資金は準備が整うことを条件に了承。現在の承認範囲は [承認記録](execution-approval-20260909.md)。以下の「承認待ち」は作成時の履歴であり、現在の実装を停止させない。RQ01〜RQ15と料金は変更しない。

版: 1.62 / 更新日: 2026-09-16（確定要望の初回決定日: 2026-09-09） / 正本: `k999ln/rock`。

この文書は利用者がこの日に明示した製品要望を固定する。実装状況は [OS稼働・ゲーム連携監査](os-readiness-audit-20260909.md)（過去の追補・初回監査は履歴）、次の指示は [現在の再開指示](prompts/rock-current-next-20260911.md)、毎回の確認方法は [プロンプト作成規約](prompt-playbook.md) を参照する。決定と実装実績を同じものとして扱わない。

優先順位は、新しい利用者の明示指示 → 本書の確定要望 → 対象branchの現行設計と検証済み契約 → 日付付きの過去設計。提案は承認済み要望へ自動昇格させない。矛盾があれば変更理由と根拠を記録し、既存の課金契約や保存データを黙って変更しない。

## RQ01 製品の中心

Rock star OSは、AI自動化ツールに特化した端末OS。標準の入口は **Sky、Zema、Wallet**。利用者はSkyで商品を選び導入・接続し、Zemaで仕事の指示・実行・停止・確認・結果・履歴を管理し、Walletで自動化によって得たお金と関連費用を管理する。

利用者が示した目的は、自動化により時間や収入の余地を作り、より多くの人が創作・学習・ゲームや現実の新しい挑戦へ進めるようにすること。世界がより良くなるという志向は保持するが、自動化の利益・ゲーム通貨の値上がり・社会的効果を保証しない。取引回数や賭け金を製品成功の指標にせず、削減できた負担、実費後の確定収支、本人が選べる行動の増加で検証する。

日常生活の汎用アシスタント、SNS、一般アプリの品揃え、エコシステムの規模を主目的にしない。ファンドの旧試算や既存資産は履歴として保持するが、新しい標準体験の中心に戻さない。

## RQ02 ツール供給とOSの責任

利用者のいう **tob側** が自動化ツールを開発・更新・保守し、商品として供給する。Rock側は接続仕様、必要なSDK/adapter、認証、権限、互換性、実行管理、料金/利用資格、成果物、収支照合の共通基盤を開発する。

「tob」は供給側の役割を指す。特定の一企業への独占、法人名、販売主体、契約先をこの語から推測しない。SDKと署名配布は商品の接続に必要な既存基盤として活用する。商品内部のAIや個別業務ロジックをOSチームの開発義務にしない。

## RQ03 現在開発しているツールも商品

既存・開発中ツールはSky内の独立した商品として扱う。CSV仕事はSky内のToolとして扱い、仕事の作成・実行・確認・停止・結果・履歴はZemaへ集約する。どちらもホーム上の独立アプリにはしない。既存原本・所有者・ライセンス・版を保持し、掲載、接続、許可、実行、更新、停止、削除を商品単位で管理する。通常の商品追加・更新にOS再buildを要求しない。

既存のMr.ユーティリティ、記事APK、native recipeの同名・類似機能を同じ商品実体と決めつけない。source/ref/hash、契約とfixtureを照合してから対応付ける。全商品がAI推論を行う、全商品が収益を生む、全商品が完成済み、と表示しない。

## RQ04 実行方式の違いを吸収する

商品には端末内、ユーザーのPC、提供者クラウド、自分でホストするサーバー/PC、複数工程でそれらを組み合わせる方式がある。Skyは対応方式と接続状態を理解し、必要な実行先を管理する。PCやクラウドを一律に後回しにしない。Mac miniは接続候補であり必須機材ではない。

実行場所、ホスト運用者、接続方式、工程の組合せは独立した項目とする。MCP、HTTPS API、非同期job、native package等は対応能力に応じたadapterで接続する。MCPだけへの統一や全サービスへの同一OAuth仕様の強制は要望ではない。

端末がofflineでも開始済みのクラウドjobが継続するか、PCのsleepで何が止まるか、再接続でどこまで回復するかを商品ごとに示す。実行先の変更は事前に許可したデータ送信・費用・実行範囲内でのみ行う。

## RQ05 料金・権利・資格を混同しない

料金方式、ソース公開/ライセンス、契約・利用資格、APIキーの所有者、実行費用を別軸にする。例として、OSS＋有料クラウド、PC＋有料API、無料枠＋従量、買い切り＋外部契約が成立する。BYOKは利用者のキーを使う方式で、無料という料金区分ではない。

商品本体、モデル、依存物、再配布の条件を確認する。公開sourceだけでOSSや再配布可と判断しない。利用前に、動く場所、必要な契約、支払先、料金の構成、送信データ、停止能力を分かるようにする。未契約・期限切れ・非対応には具体的な理由と再開手順を出す。

既存native branchには同一購入契約で月888 cents固定・複数端末重複防止の方針と試作がある。今回の要望はこの料金の廃止/変更を指示していない。旧Webの月上限8.88 USD相当試算とも区別し、商品料金・外部API費と自動的に混ぜない。新料金や販売手数料は確定事項に足さない。

## RQ06 Walletで得たお金を管理する

Walletは利用者の自動化由来の売上、確定/保留、入金先、利用可能額、実行費用、手数料、返金、出金と照合状態を確認・管理する標準機能。tobの商品の販売収益、利用者の仕事の収益、Rock利用料は所有者と資金の流れが異なる。

既存native Wallet、本人/購入者資格、同意、月額、重複防止、結果不明時の照合を再利用する。旧WebのEthereumアドレス接続は別機能であり、Wallet全体の実装状況を代表しない。

実行成功を売上確定に変換しない。外部販売先/決済providerの認証済み情報と照合する。手入力は未照合、未接続は未接続と表示する。資金をRockが保管するか外部providerへ置くか、暗号資産・銀行・通貨・払出経路は、証拠と提供条件に応じて確定する。現在の試作を理由に実資金を扱えるとはしない。

## RQ07 OS標準機能は自動化の周辺へ集中する

標準サービスとして、商品/資格管理、認証情報保護、実行先接続、永続job、停止/照合、費用管理、成果物/履歴、Wallet、重要通知、端末紛失時の接続失効、OS更新/復旧を提供する。

持ち歩く価値は、外出中に「動いているか」「何が止まったか」「どの費用が発生したか」「成果とお金はどうなったか」を短時間で把握し、必要な操作を済ませられること。毎日何回も開かせるための無関係な機能・通知を増やさない。通知は完了、停止、契約/予算の問題、照合差異、必要な確認に結び付ける。

## RQ08 接続・費用・停止の保証範囲

第三者商品にOSのrootやWalletの送金権限を包括的に渡さない。事前同意の範囲は商品版、入力/送信先、操作、利用額に紐付ける。更新で条件が増えれば差分を扱う。共通基盤がすべての工程で同じ確認を強要することも、無制限の無人送信を許可することも確定要望ではない。

遠隔jobは「取消要求」と「停止確認」を区別する。停止APIのない商品や外部直契約の請求について、OSが即時停止/厳密費用上限を保証できるとは表示しない。応答不明は照合を優先し、重複実行・二重請求を避ける。予約できない最大費用は不明として扱い、対応能力を明示する。

## RQ09 進捗はbranchと証拠を伴う

mainだけで開発全体を判断しない。毎回GitHubのmain、関連branch、PR状態、SHA、CI、対応コードと証拠を読む。mainにない機能も開発branchに存在する可能性がある。逆にopen PRの実装をmain反映済みと呼ばない。

実装あり、hostテスト、fixture接続、仮想OS、実サービスsandbox、実機、本番を区別する。テスト件数を完成率へ換算しない。接続先の実サービスが未検証なら、その範囲は未検証として残す。

## RQ10 ベースを繰り返し聞き直さず改善する

「現段階の進捗からプロンプト作成」と依頼されたら [作成規約](prompt-playbook.md) に従う。本書の要望を再質問せず、最新の実装との差だけを調べる。新たな本質的選択が必要な場合も、判定できる範囲と具体案を先に固める。

改善提案は必ず「対象RQ → 再利用する実装 → 不足 → 組合せによる効果 → 検証指標 → 導入条件」を持つ。提案、実装予定、完了を区別し、プロンプト生成だけで実装タスクを完了にしない。

現在の進捗との相違を指摘したら、その問題を解消する作業・順序・合格証拠・残る条件まで次の実行プロンプトに含める。ベースを保存したbranchと開発本体が分かれている場合は、開発側の引継ぎ入口と優先順位の同期を最初の段階にする。未解決問題は次回も引き継ぎ、文書保存だけで実装修正まで完了したことにしない。

## RQ11 端末を持つことで減る不便を実商品の利用で検証する

「このOS/端末を持つと何が楽になるか」を開発理由にする。以下は検証する価値仮説で、需要や改善の実証済み宣言ではない。

| 解決する不便                                | Sky/Walletで試すこと                              | 比較する指標                                     |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| 何を契約/起動/設定すれば使えるか分からない  | 商品要件と接続/資格を確認し、不足する準備だけ案内 | 最初の有効な結果までの時間、操作数、手動設定数   |
| PCやcloudを別々に開かないと状況が分からない | 稼働先・進捗・停止理由・再開操作をまとめる        | 画面切替数、原因特定/復旧時間、状態不明件数      |
| 出先で停止・確認できず放置する              | 携帯端末から結果/失敗を把握し取消や必要確認を行う | 通知から対処までの時間、遠隔操作成否、PC側手作業 |
| 成果が散らばり再実行すると重複する          | 仕事/商品/入力版と結果・receiptを結ぶ             | 探索時間、再起動後の消失/重複数、手動コピー数    |
| 費用と入金先/受取額が分からない             | 実行費・確認済み売上・未照合をWalletで追跡        | 不明/二重計上、照合操作数/時間、説明できる受取額 |

PC単体や各サービスの既存手順と比べ、端末を追加する手間以上の利便性を検証する。外出利用、通信断復元、個人の認証/停止操作を含め、専用OSで改善する部分と管理Webで足りる部分を証拠で評価する。

Git内のツールを必ず調べ、未登録ならSkyへ登録・接続し、登録済みなら既存商品を実際に使って改善する。nativeの提案下書き/引用整理/UTF-8 SHA-256と、Web/PCの案件チェック/無料版作成/出典整理/納品記録照合を棚卸しする。hash確認だけで事業用途を代替せず、少なくとも1件の提案/記事/納品用途を通す。

「探す→必要準備→導入/接続→権限/料金→入力→実行→結果保存/再表示→失敗/停止/復旧→費用とWalletの状態」を利用者画面から試す。公開可能な合成案件/原稿を既存の商品ロジックで処理し、固定出力のデモで代用しない。不便、原因、修正、再試験、残課題を記録し利用手順を残す。

この日の追加指示は、この実利用開発を次のプロンプトに含めること。ベース保存の時点でSky導入・端末比較試験を実施済みと扱わない。

## RQ12 現設計をOSとして稼働・検証できる最低限のベースにする

現在のSky＋Wallet設計を最低限のベースとして維持し、設計や画面の提案だけでなく、native OSとしてbuild・起動・操作・保存・再起動・更新失敗時の復旧を検証できる形へ進める。検証結果の雛形を用意し、対象版・実行環境・試験範囲・結果・証拠・残るリスクを毎回保存する。

最初の実行目標はQEMU上の開発用OS雛形。これは実機対応を放棄する決定ではなく、実機/BSPや金融provider待ちでも進められる段階分けである。公開試験鍵・模擬Wallet・合成データを使う開発検証と、実機・本番・実資金の合格は分離する。ソース試験や過去imageの成功だけで最新OSの安全性を宣言せず、試験した範囲を明記する。未実行やskipをPASSにしない。

OS基本操作、保存済み成果物、復旧手段を外部サービスの契約切れで失わせない。開発用Web管理画面は補助案であり、OS本体のbuild/boot検証の代替や一律の前提ではない。

今回の進行条件は「プロンプト作成→設計書を提示→利用者が確認・承認→実行」。[確認用設計書](os-sky-wallet-game-design.md)は承認待ち。承認前に新しいruntime/SDK/OS imageの実装・起動を開始しない。ゲーム要素の具体的な見た目・任意の達成演出等は提案として確認し、会話上の検討を確定仕様へ自動昇格させない。

## RQ13 OSとゲームを連動しWalletとゲーム内通貨を交換する

ゲームのアカウント・通貨とRock Walletを正式な接続境界で結び、利用者が交換条件を確認して操作できる機能を追加する。ゲーム内通貨はWalletの現金残高そのものではなく、発行元・ゲーム・資産種別が異なる残高として扱う。既存Walletの認証・同意・台帳・保留・冪等性・照合を再利用し、ゲームクライアントの自己申告だけで実残高を増減しない。

対象ゲーム/所有者/公式API、片方向か双方向か、現金化可否、交換率・手数料・上限・端数・返金・交換可能な通貨種別は未確定。手数料0の指示はRQ15のATMに対するもので、ゲーム側の料金条件を確定した指示ではない。レート、無条件の換金権、ゲーム報酬の現金価値を創作しない。未確定の方向を本番で有効にせず、まず隔離した合成通貨・模擬ゲームサーバーで交換契約と異常系を検証できる構造を作る。ゲーム本編を新規開発する依頼に拡張しない。

ATM設置/現金払出とは別の機能・adapter・同意・試験・進捗とし、ATMをゲーム交換の必須経路や前提にしない。既存ATMの動作・契約を保持し、ゲームの障害で停止させない。ただし同じWalletの利用可能額を消費する場合の予約/二重使用防止は共有する。「ATMは独立して動く」という要望と、Git内の実ATM検証実績は区別する。

## RQ14 自作ゲーム作者が組み込みやすいWallet基盤

対象はゲームを自分で作る開発者とその利用者。単一ゲームへの個別対応で終えず、作者が自身のゲームへ共通Walletを容易に接続できるAPI/SDK、合成通貨のsandbox、動く最小サンプル、導入手順、接続診断、取引/照合履歴を用意する。作者のゲーム運営権限とプレイヤーのWallet操作権限を分け、API鍵をゲームクライアントへ埋め込まない。

「一番使いやすく利便性がよい」は目指す価値であり、市場首位や比較実証済みの宣言ではない。初見作者の導入時間、手動設定/コード量、最初の合成交換までの成功率、エラー原因特定/回復の時間を測り、改善する。実ユーザー募集・外部調整が未実施なら内部検証と区別する。

ゲーム作者が発行したポイント/報酬を、作者の自己申告だけで実資金へ換えられる設計にしない。換金原資はWallet側または承認された清算先で確認・留保し、作者APIにWallet利用可能額のmint権限を与えない。複数ゲームの資産・player・権限を分離する。

これはゲームWallet基盤の追加方針であり、Sky＋WalletというOSの中心を置換しない。作者にOS本体の再build・金融台帳の自作・本番契約をsandbox開始の前提として要求しない。SDK対象環境・継続運用原資・ゲーム向け料金は未決定で、新しい契約や実請求を自動導入しない。

## RQ15 ATMでRockが徴収する手数料は0

利用者の補足「atm手数料の話」により、手数料を取らない対象はATMと確定した。**Rockが徴収するATM利用/払出手数料は0。** 別名目や換算マージンで同じATM手数料を上乗せしない。

外部ATM/決済/送金provider等の実費は、自社手数料と分け、存在・負担者・金額・事前同意を確認する。外部費用が不明なまま総額無料と表示せず、Rockが無制限に補填する契約も作らない。ゲーム連携/交換の料金や既存OS月888 centsの変更指示へ読み替えない。既存ATMの独立性と月額契約を維持し、この要望保存だけで物理ATMや実資金の検証を開始しない。

## RQ16 CM発表に向けて導入可能なOSにする

CM発表に向け、利用者が再現可能な手順でRock star OSを導入・起動・終了・再開・復旧できる配布単位を作る。最初は既存のLinux / Buildroot / ARM64 QEMUをfreshなMac/PCへ導入できるDeveloper Previewとし、個別開発者の既存VM・秘密値・固定private pathへ依存させない。

物理端末は正確な1機種・地域variantを固定し、bootloader、BSP、vendor firmware、driver、partition、署名、rollback、純正復旧を確認したPhysical Device Previewとして別に合格させる。QEMU imageやAPKを物理端末用OSと表示しない。実機合格前のCMでは、仮想端末向けDeveloper Previewとスマートフォン対応予定を区別する。

配布物には版、対応環境、hash/署名検証、導入、backup、削除、失敗時の復旧、既知制限を含める。本番利用、実資金、ATM、BlackBerry対応は各ゲートの合格後だけ表示する。詳細は [導入・リリース計画](release-installation-plan-20260909.md) を参照する。

## RQ17 現段階をRockstarOS 1.0のベースとして発表し継続改善する

現在のSky、署名Tool、local実行、合成Wallet、native UI、A/B更新・復旧、backup、開発用remote接続を **RockstarOS 1.0** の製品ベースとする。最初の配布段階はDeveloper Previewであり、1.0という版番号を実機・本番金融・一般公開の合格証明にしない。

1.0以後は、保存データ、商品manifest、receipt、台帳、更新・復旧の互換性を明示しながら段階的に改善する。未完成のGame交換、実機、実USB、外部provider、実資金、実ATMは進行中または将来機能として表示し、合格した範囲だけをCMで実演する。各systemの現在地と進化方針は [1.0構成](rockstaros-1.0-architecture.md) を正本とする。

## RQ18 基本アプリをSky / Zema / Wallet / Polymarketに分離する

RockstarOSの基本アプリはSky、Zema、Wallet、Polymarketの4つ。Skyはアプリの発見・掲載・接続・権限確認に集中し、会話欄を置かない。接続後の依頼、追加確認、処理状況、完了通知、結果の受取はZemaへ集約する。Walletは自動化の収支・費用・入出金を管理し、ZemaやPolymarketへ包括的な送金権限を渡さない。

ZemaはSky Autoを既定とし、利用者へ事前のアプリ選択を強制しない。依頼内容から接続済みの役割を選び、選択結果を会話に表示する。特定アプリへの直接指定は任意で残す。判別不能、対象アプリ未接続、入力不足では勝手に実行せず、必要な追加情報またはSkyでの接続を案内する。実際のjob状態だけをreceiptとして表示し、Zema上の受付メッセージを実行完了の証拠にしない。

Polymarketは独自市場ではなく外部サービス用adapterとして別アプリに置く。アプリ枠と安全な未接続画面は実装対象とするが、実市場データ、注文、清算、Walletからの資金移動は別の接続審査と明示同意が必要。所在地・提供地域・年齢・本人確認・利用規約・規制・資金経路が確認できるまで無効とし、AIによる自動取引や自動再投資は行わない。

## RQ19 目標駆動のブランド経営エージェントへ拡張する

Fashion Brand Opsは単発操作だけでなく、商品ごとの販売数量、売上、粗利率、期間、広告予算上限を保存し、市場仮説、広告実験、投稿ペース、営業、制作の次アクションを優先順位付きで提示するCampaign Autopilotを持つ。Autopilotのtickは現在のcampaign、承認、DM、署名検証済み売上、制作状態を照合するが、外部作用を直接実行しない。

AI Sales Conciergeは顧客ごとのDM履歴、購入意向、既存注文、確認済みプロフィールをtenant内に保存し、営業stage、segment、欠けている注文情報、人間への引継ぎ、返信下書きを生成する。返信送信は既存の`instagram.dm.reply.prepare`と個別approvalを通し、無差別DM、自動follow、自動送信を追加しない。

Production Cockpitは署名検証済み決済eventでpaidになった注文だけを制作計画へ入れ、資材、見積原価、日次能力、納期、blocker、制作・品質・発送工程を追跡する。手動toolからpaid/refundedへ変更できない状態遷移を強制し、金額・通貨が注文と一致しない入金eventを拒否する。実工場発注、資材購入、配送契約、実通知は各Providerと別の承認条件が揃うまで行わない。

## RQ20 Skyの自動化収益から最大8.88 USDを回収する

Skyは利用開始時に8.88 USDを請求しない。自動化商品が有償の注文、販売、納品等を成立させ、外部Providerで実入金まで確認できた場合だけ、そのExecution Receiptと入金参照を結んだ署名済みEarning Receiptを精算対象にする。ツール実行成功、成果物作成、手入力、未確定決済を売上へ変換しない。

精算は利用者ごと・UTC月ごとに、検証済み売上から直接実費を先に回収し、その残額からSky利用料を最大888 USD centsまで回収し、残りを利用者への払出し指図へ入れる。売上0なら利用料0、残額が888 cents未満なら残額だけ、未達分の債務化、翌月繰越、カード請求は行わない。同じReceipt、実行、Provider入金の再送を二重計上せず、本人別の月次台帳と追記型明細を残す。ToBのSky利用料とSky売上手数料は0であり、ToB分のReceiptからSky利用料を控除しない。

本番利用に耐える精算核とProvider adapter境界の実装は進める。ただし、自動化が実際に収益を生むには需要側の販売経路、納品・承認、決済Provider、払出しProviderが必要である。販売主体、資金保管、本人確認、提供地域、利用規約、税、返金、chargeback、最低払出額、live資格情報、sandbox受入と本人の最終確認が揃うまで実入金・実回収・実払出しを有効化しない。設計と運用手順は [Sky自動化収益の精算](sky-billing.md)を正本とする。

## RQ21 tob無料と接続・貢献・分配を一体化したSky Network

tobがSkyへ商品を登録、接続、公開し、基本的な検査・利用分析を受けるためのSky利用料は0円とする。tob商品の利用者向け価格はtob自身の収益であり、Skyの売上手数料は0%。決済provider、外部API、モデル、cloud等の第三者実費はSky手数料と混ぜず、発生主体と控除条件を表示する。tob無料は、無制限のRock負担、外部実費の肩代わり、無審査公開を意味しない。

Sky Networkは、MCP URL・registry/package等の入力から、接続方式、作者/版、schema、OAuth audience、権限、実行場所、価格、受取人を確認するConnection Passportの導線を持つ。公開前検査、利用時の実行契約、PC/端末/cloudへの権限を増やさない子lease、実行receipt、取消・不明状態、ToB/ToCの貢献と分配を一つの画面で説明する。

ToC向け8.88 USDはRQ20の月間回収上限であり、先払い基本料金やtob課金へ転用しない。ToC/ToBの分配率、対象となる貢献、最低払出額、本人確認、税、返金負担はProviderごとに確定する。検証済みreceiptに基づく精算台帳は実装するが、販売・決済・払出しProviderの受入前に実売上、現金保管、実送金、本番報酬を有効にしない。

## RQ22 MCP接続・管理をSky本体の機能にする

MCPは別製品や別の標準ナビゲーションではなく、Skyの中核機能として扱う。Skyを開いた最初の画面で外部MCPと内蔵MCPの状態を区別して表示し、同じ画面からMCP URL・registry・packageの入力、安全確認、Connection Passport、実行範囲、料金、受取人、分配receiptの確認へ進めるようにする。ToB向け掲載フォームもSky内で開く。

独立した説明ページや常設sidebarを通らなければMCP・掲載へ到達できない構成にしない。既存の`/sky/network`と`/sky/publish`はリンク切れを防ぐ互換入口としてSky本体を表示し、対象機能を最初から開く。外部MCPの実接続数と内蔵商品の状態を混同せず、合成Passportを実接続済みと表示しない。

## RQ23 実在するローカルMCPと導入・利用導線を一致させる

SkyのMCP状態は、`127.0.0.1`の接続アプリとの実際のsession状態から表示する。配布ZIPのダウンロード、展開、macOS/Linuxでの接続アプリ起動、Skyからの接続確認を3ステップで案内し、接続時にMCP initialize、initialized通知、tools/listによる4機能の検出を完了する。接続後は案件チェック、出典整理、無料版記事、納品照合をSkyから呼び出し、既存の実行状態・処理量・履歴保存経路を使う。

ダミーURLの安全確認を実接続のように表示しない。任意の外部MCP URL/registry/packageの直接接続、Fashion Brand Opsの実Provider、Rockstar Ledgerの常駐統合、Native/Android/実機OSへの組込みは、各受入が終わるまで利用可能と表示しない。ブラウザ内で動く既存機能と、PC接続が必要な機能は区別する。

## RQ24 MCPごとの接続先を選び、対応先へ最短で接続する

Skyの接続先は「このPC」「Sky Cloud」「提供者のMCP」の3系統にする。このPCは秘密性と追加費用なしを優先するローカル実行、Sky Cloudは常時実行するSky管理環境、提供者のMCPはStreamable HTTPとOAuthを使う直接接続である。MCP商品ごとに対応可能な接続先を登録し、Skyは推奨先、動作条件、停止条件、外部実費を表示する。利用者が選べない接続先を自動選択しない。

ワンタップ接続は、審査済みMCPの公開metadataから接続方式を決め、必要な場合だけ外部OAuthへ移動し、復帰後にinitialize、能力一覧、権限・料金差分、接続証跡を確認して初めて接続済みにする。認証情報をSkyの入力欄へ貼らせない。能力や権限が変わった場合は再同意を求め、失効・停止・結果不明を追跡できるようにする。現在利用可能なのはこのPCだけとし、Sky Cloudと提供者MCPはこれらの受入が終わるまで無効表示にする。

## RQ25 MCP接続を自動化ツール共通のConnectorにする

Skyと各MCPを個別に直結せず、審査済みregistryを読むPC内Connectorへ統一する。stdioとStreamable HTTPを共通のserver IDで扱い、MCP initialize、initialized通知、protocol/capability交渉、paginationを含むtools/list、tool schema digest、接続時刻をConnection Passportとして返す。機能数を固定せず、同じConnectorで4機能と40機能の異なるMCPを扱えることを実接続で検証する。

自動化ツールからの操作契約は`servers → connect → prepare → execute`に固定する。tool annotationsは未信頼とし、既定では全操作に内容と引数へ結び付いた一回限りの承認を要求する。承認後の引数変更、券の再利用、`tools/call`への直接迂回を拒否する。送信後timeoutは自動再実行せず`outcome_unknown`にする。UIから任意commandやsecretを登録させず、stdioはshellを介さず起動し、遠隔MCPはHTTPS・redirect拒否・private network拒否・PC環境変数の認証参照を守る。

配布ZIPとSky内の動的MCP一覧・ワンタップ接続は実装済み。公開remote MCPとの相互運用、OAuth 2.1 browser flow、失効通知、Sky Cloud常駐は別の受入が必要であり、未検証の外部MCPを接続済みとは表示しない。

## RQ26 ホーム画面と設定アプリをOSの標準入口にする

RockstarOSを開いた最初の`/`は、iPhoneに着想を得たタッチ向けホーム画面とする。Sky、Zema、Wallet、Polymarketの基本4アプリはアイコンから直接開き、Sky本体は`/sky`へ分離する。設定は業務上の5つ目の基本アプリではなく、OSを整える標準utilityとしてホームへ置く。

Home以外の全画面には、現在の作業を保存契約どおり保持したまま`/`へ直接移動できる、見つけやすくキーボード・タッチで操作可能なHome導線を置く。共通WorkspaceShellを使わない独自画面も例外にしない。

利用者は壁紙、アクセント色、アイコンサイズ、アプリ名表示、アイコン順をフロントから変更できる。設定値は端末内localStorageへ保存し、本人アカウント、MCP権限、Wallet、実行receiptへ影響させない。設定アプリは、ホーム外観、PWA追加、ブラウザ接続、本人アカウント状態、PC Connector、MCPごとの権限・実行先、Web UI再読込、Developer Previewの導入・バックアップ・復旧案内を一か所へまとめる。

Web版、QEMU Developer Preview、物理端末版を設定画面でも区別する。設定画面の表示だけで端末書換え、秘密情報登録、外部MCP接続、本番更新、実資金移動を完了扱いにしない。

## RQ27 OS保全機能を設定へ実装する

設定の「システム」から、通信、端末内保存、Web Crypto、Service Worker更新、RockstarOS API、PC Connectorの実状態を診断できるようにする。現形式で許可した端末内ホーム設定だけを、PBKDF2-SHA256（310,000回）で導出した鍵とAES-GCM-256で暗号化し、改ざんまたは誤ったパスフレーズを検知してから復元する。ログイン状態、PC接続token、Wallet残高、server上のreceipt、将来追加される未許可keyはこの端末設定バックアップへ含めない。

更新確認はService Workerへ問い合わせるWeb/PWA用の操作とし、native OS imageや実機firmwareを書き換えた扱いにしない。QEMU Developer Previewの内部受入、対象機種/BSP/bootloader/recovery、正式署名鍵の鍵管理、外部MCP・販売・決済・払出しProviderの資格情報を個別gateとして表示する。対象機種未決、鍵未作成、外部契約未完了をUIだけで解消済みにしない。

## RQ28 メルカリを最初の収益経路にする

Skyへ「メルカリ収益スターター」を標準搭載し、利用者が保有する在庫について、商品事実、状態、価格、販売手数料、送料、原価、その他実費から出品原稿と実費後の見込み利益を作る。出品前に在庫保有、説明の正確性、禁止出品物を本人が確認し、原稿を承認する。販売成立や利益額は保証せず、在庫のない商品、虚偽表示、検索上位目的の大量再出品、外部決済誘導を自動化しない。

個人メルカリは公式の公開出品APIを前提にせず、Skyは認証情報を取得しない。出品、購入者対応、発送、取引完了、出金は本人が公式画面で行い、Skyはコピー可能な原稿、利益計算、状態記録、公式画面への引継ぎを提供する。手入力の取引完了は未照合として保存できるが、検証済み収益や8.88 USD精算には使わない。

メルカリShopsは公式GraphQL APIと新しい`order_transaction_*` webhook topicを使用する。ただしAPI利用契約、Personal API Access Token、指定User-Agent、日本国内の専用固定IPを持つConnector、Sandbox受入、取消・一部取消・返金・結果不明の照合が揃うまで外部作用と収益検証を有効にしない。Providerで取引完了と金額を照合し、Execution Receiptと一意に結べた売上だけをRQ20のEarning Receiptへ変換する。Sitesから固定IP要件を迂回して直接APIを呼ばない。詳細は[メルカリ収益ループ](mercari-revenue-loop.md)を正本とする。

## RQ29 最低限のOS運用と公開条件を設定へまとめる

設定の「システム」は、単なる説明画面ではなく、この端末でRockstarOSを維持する操作面とする。RQ27の診断・暗号化保全・更新に、安全な接続、通知許可、永続保存、PWA表示状態を追加し、通知の明示許可とテスト、保存保護要求、個人情報・token・Wallet・マイナンバー・利用者contentを含まない診断JSON、確認付きのホーム設定初期化を提供する。初期化は許可済みの外観と並び順だけを削除し、アカウント、Wallet、実行履歴、将来追加される未許可データを消さない。

公開条件は日常操作から折り畳み、Web/PWA Developer Preview、QEMU内部受入、Android互換のCDD/CTS、Google Play/GMS契約、対象機種/BSP/復旧、production署名・更新鍵、SBOM/OSS再配布義務、販売地域と無線機器の適合、特定個人情報の取扱いを別gateで記録する。RockstarOS全体へ単一の審査があるとは表示せず、該当する配布方式の証拠がない項目は未実施のままにする。iPhone/iPadは置換OSの一般配布対象ではなく、Web/PWAまたは審査対象のclientアプリとして扱う。

## RQ30 公開最低条件を機械判定し、完了まで追跡する

公開形態をWeb/PWA本人限定Preview、Web/PWA一般公開Preview、QEMU Developer Preview配布、Android系物理端末Preview、iPhone/iPad client、マイナンバー連携に分離する。各形態は、必須gateがすべて証拠付きで合格した場合だけreadyとする。過去のQEMU候補の起動、Web画面の動作、source inventoryの存在を、正式署名または同一最終候補の導入・更新・復旧の代わりにしない。

`data/release-readiness.json`を機械可読な正本とし、宣言状態とgate算出結果の不一致、根拠fileの欠落、未決定の製品ライセンス、未実施のproduction署名、license metadataのないnpm依存、未審査のマイナンバー有効化を自動検査で拒否する。Web/npmのCycloneDX SBOMは生成できるようにするが、generated artifactはGitへ入れず、native Buildrootのinventoryと別のscopeであることを明示する。

所有者に代わる製品ライセンスの選択、production鍵の生成・保管、Sitesの一般公開、機種/SKUの確定、実機flash、外部審査・契約、マイナンバー取扱いの法務判断は自動完了しない。それ以外の実装・検証・証拠保存を先に完了し、必要な所有者行動を具体的に一つずつ提示する。[最低公開条件](release-minimum-gates.md)を運用正本とする。

## RQ31 QEMU配布候補を同一byte列の証拠へ固定する

QEMU Developer Previewは、候補のversion、native source commit、archive名・size・SHA-256を、導入・復旧受入、構成inventory、Webの公開表示へ同時に固定する。安全基礎、更新・rollback、backup・復旧、診断・反復bootは証拠が示す範囲だけ合格とし、D2全体、別host全損復旧、未観測の取消操作を広く合格扱いにしない。

native SBOMはtarget runtime componentとhost build dependencyを区別したCycloneDX 1.6として生成する。現在のrc2は、配布archive、同梱legal bundle、target/host manifestのSHA-256とcomponent数を機械照合し、同じ候補へ結合する。自作componentのlicense未選択はそのまま表示し、部品一覧の完成を製品license clearanceとしない。旧9ab legal-infoから生成する61 componentのSBOMは変換方法の比較だけに限定し、metadataに旧sourceと「current rc2ではない・license clearanceではない」を固定する。

QEMUの公開準備は10 gateを同じID・状態で `data/qemu-release-audit.json` と `data/release-readiness.json` に保持し、不一致を自動検査で拒否する。製品license、production鍵、署名後の同一候補受入、一般公開承認は所有者の明示決定前に合格にしない。[QEMU完了監査](qemu-release-completion-audit-20260912.md)を詳細正本とする。

## RQ32 完成版を正本と本人限定Webへ同一commitで収束する

main、現在の開発branch、機能branch、Sites公開履歴を比較し、完成度の高い実装を現在の製品ベースへ統合する。履歴が新しいだけ、画面だけ、説明だけを理由に採用せず、保存互換、approval、実行receipt、外部接続・実資金・公開gateを維持できる版を選ぶ。Skyは発見・接続、Zemaは接続後の操作、Walletは本人別の永続収支という責任を崩さない。

Skyで接続が成立したMCP serverとready商品はZemaへbotとして自動表示し、同じスレッドで依頼、方向修正、公開機能と引数、1回承認、実行結果、失敗、停止を扱う。方向修正は、MCPがlive steeringを明示対応しない限り次の実行へ適用する。停止はsessionと未使用承認を失効させ、送信後timeoutや結果不明を自動再実行しない。Walletは本人別D1を正本とし、残高、売上、経費、取消を追記履歴として保持するが、手入力を検証済み収益へ昇格させない。

SkyからZemaへの依頼引き継ぎは同一tabの一回券とし、Tool IDだけを互換URLへ含める。依頼本文はURLやserverへ載せず、10分以内に対象Toolが受け取った場合だけZemaの現在threadへ展開して削除する。実行状態は本人所有のjob recordを正本とし、browser eventは即時表示のためだけに使い、D1再照合なしで完了や収益を確定しない。

Home、Sky、Zema、Wallet、Market、設定は、画面componentだけでなく必要なstylesheetがbuildへ含まれることを自動検査する。server/manifest/HTMLが参照する`_next/static` assetは公開archive内に全て存在しなければならない。GitHubの対象branchと本人限定Sitesへ同じsource commitを保存し、公開後に主要routeとassetの実responseを再確認する。一般公開、main merge、production鍵、実取引・送金、物理端末合格、マイナンバー有効化は、それぞれの既存gateなしにこの統合作業から許可へ変えない。

## RQ33 汎用PAPER市場と実績更新型の自律ファンド

独自のRockstar MarketをMarketアプリとして提供し、自動化、デジタル成果物、サービス、商品、稼働枠を共通の型付きasset registryへ登録できるようにする。取引操作は `PAPER` だけを許可し、proposal ID、exact digest、24時間以内の期限、注文上限、総exposure上限を固定する。本人が同一digestを明示承認した後にのみ予約・実行し、simulation-onlyのimmutable receipt、position、`spend.* / trade.*` eventを本人別D1へ保存する。未知field、失効提案、二重実行、LIVE指定はfail closedとする。

自動化ファンドの数と構成ツール数は固定しない。readyなツールについて、署名検証済みEarning Receiptの売上・実費と、本人所有のtool run receiptから、純収益、失敗数、観測return、推奨構成、配分を30秒ごとに再計算する。Walletの手入力帳簿は自己申告なので利回りの証拠に使わない。観測returnは実費を分母とする過去実績で、将来利回りではない。分母または検証receiptがなければ `null / 算定待ち` と表示し、合成値や市場PAPER結果を検証済み収益へ昇格させない。自律処理は構成提案までとし、外部取引、実Wallet移動、再投資、8.88 USDの先取りを行わない。

native Developer Previewでも同じ安全境界を維持し、local SQLiteの複式台帳へsimulation/PAPERの予約・実行・再照合を記録する。exact proposal digestに対する本人承認を必須とし、送信結果が不明な場合はholdを維持して明示的なreconciliationを要求する。秘密値、外部注文、LIVE経路、実資金は実装・有効化しない。

Polymarketは画面密度、検索、カテゴリ、カード、価格ticketのデザイン参考に限る。名称、コンテンツ、外部注文経路、CLOB、口座、資金、結果判定・清算を取り込まず、独自市場と既存の自動化ファンドを別機能として維持する。LIVE提供にはprovider、本人確認、保管・清算、対象国、契約、法務・規制、異議・取消、監視、owner承認の別gateが必要である。

## RQ34 外部Wallet／ファンドProviderを受け入れるOS境界

RockstarOSはWallet会社またはファンド会社そのものにならず、各社の許認可、契約、保管方式、運用商品、対象地域、料金、本人確認とAPI能力を共通のProvider Adapterへ接続する。OSの責任は、Providerの同一性と接続状態を示し、利用可能なcapabilityを発見し、本人へ条件を提示し、exactな操作への同意を取得し、指図、状態取得、署名済みreceipt、取消・不明状態、照合を一貫して扱うところまでとする。

Providerは `custody`、`receive`、`payout`、`exchange`、`fund_catalog`、`subscribe`、`redeem`、`reporting` など、自社が実際に提供できるcapabilityだけをversion付きmanifestで宣言する。RockstarOSは宣言されていない機能を補完・代行せず、未接続、sandbox、live eligible、停止、失効を区別する。Provider固有の追加画面や情報は権限・送信先・費用を明示した拡張として読み込み、任意shell、秘密鍵、Wallet台帳の直接書込み、包括的送金権限を渡さない。

資金の保管、運用判断、注文執行、約定、基準価額、払出し、KYC/AML、地域制限、税務上の判定と法定帳票は、契約上その役割を負うProviderが正本を持つ。RockstarOSの内部Walletと自律型ファンドは、Provider receiptを参照する表示・指図・照合層として残し、Providerの記録を推測値や自己申告で上書きしない。これにより複数の二次事業者がOS再buildなしで参入・差替えでき、利用者は対応機能、費用、地域、保管主体を比較して選べる。

最初の外付け受入は合成Providerとsandboxで、capability交渉、schema version、本人同意、idempotency、timeout後の照合、失効、exportを検証する。実資金またはLIVE運用は、対象Provider、本人・受益者、契約、許認可、対象国、custody、秘密情報、税務表示、sandbox受入、owner承認が揃うまで無効のままとする。詳細は [外部Wallet／ファンドProvider境界](external-wallet-fund-provider-boundary-20260913.md) を正本補助資料とする。

## RQ35 Rock First-party Settlement Walletを最初のProviderにする

外部Wallet会社との契約を待たずにRockの回収経路を作れるよう、共通Financial Provider契約の最初の実装をRock自身の `org.rockstar.settlement-wallet` とする。対象は、外部Providerの署名済みEarning Receiptから既存の成果連動精算ルールで確定したRock利用料だけである。収益0なら回収0、実費を先に扱い、ToCはUTC月あたり最大888 USD cents、未達分の債務化・翌月繰越・カード先払いなし、ToB利用料0を維持する。

最初のcapabilityは `collect_platform_fee` と `reporting` に限定する。Rock Settlement WalletはRockの債権と回収状態を記録するが、利用者の全資産を保管するWallet正本にはしない。`custody`、任意の `receive / payout`、`exchange`、`fund_catalog / subscribe / redeem / valuation` は宣言せず、秘密鍵や外部transferも持たない。利用者への払出し、外部Wallet保管、ファンド運用は別Providerへ分離する。

RockのProviderもRQ34のversion付きmanifest、idempotentな指図、状態、receipt、照合、失効を必ず通り、内製専用の迂回路を作らない。最初はsandbox fixtureでcapabilityと月額上限を検証する。LIVE回収は、Rockの販売・受取主体、実口座または実Wallet、Provider契約、本人・受益者、表示・税務・会計、資格情報、sandbox受入、owner承認が揃うまで無効とする。詳細は [Rock First-party Settlement Wallet](rock-first-party-settlement-wallet-20260913.md) を参照する。

## RQ36 Base Mainnet USDCの本番受取レールを接続する

RockstarOSのWallet画面から外部EIP-1193 Walletを接続し、Base Mainnetへ切り替え、5分で失効するorigin-bound messageへ署名してRockのUSDC受取先を登録できるようにする。署名はアドレスの所有確認だけであり、transfer、token approval、秘密鍵の開示を要求しない。最初のoperatorは本人限定Siteへ認証済みのownerだけがclaimし、登録後は別利用者が上書きできない。一般公開へ変更する場合は、その前にowner登録済みであることを必須gateにする。

Billing Workerは、署名検証済みEarning Receiptへ配分済みの `SKY_SERVICE_FEE` ごとにidempotentな回収指図をD1へ作る。指図額は1件・月累計とも既存の最大888 USD centsを越えない。受取先未登録、着金待ち、finalized待ち、着金済み、結果不明を分離し、timeoutやRPC障害時に自動再送しない。同じtransaction hashを複数指図へ使用できず、Baseの公式USDC contractがemitした `Transfer` の受取先と6桁decimal換算額がexactに一致し、receipt成功かつfinalized blockに入った場合だけ着金済みとする。

このレールはRockに帰属する利用料の受取に限定し、利用者資産のcustody、利用者へのpayout、任意入金、交換、運用、税務判定を追加しない。外部Wallet／ファンド会社はRQ34のProvider Adapterとして別途接続できる。実装と本番配備が合格しても、owner自身のWallet署名と最初の実transferが未実施なら、実Wallet登録・実着金の実績とは表示しない。詳細は [Rock Wallet本番受取レール](rock-wallet-production-rail-20260913.md) を参照する。

### CSV販売実証の限定追加（RQ01〜RQ36は変更しない）

`rockstar-csv-cleanup`は、1ファイル10 MiB・50,000行・100列までのUTF-8/BOM/CP932 CSVを、列名、列順、前後空白、重複、並び順、出力文字コードの明示指定だけで変換する。値を文字列として保ち、先頭0、長い数字、引用内改行、引用符を失わず、指定外の推測・補完・計算をしない。成果物はowner付き私有objectへ保存し、受付から7日または本人の即時削除で消す。buyerへの直接共有はbuyer認証と期限付き権限が実装されるまで有効化しない。

CSV販売者向け`csv-seller-fee/1`は、billing account・contract・policy version単位、JST月、Provider確認済みの返金・市場手数料・税・取引実費控除後純入金を基準とする。30.00 USD未満は0、以上は8.88 USD、同月一回、未達債務・翌月繰越・手入力による課金なしとする。本番Provider未接続の間は判定とschemaだけを実装し、実請求・実回収を開始しない。既存RQ20の月最大888 cents、先払いなし、実費優先より利用者に不利な条件へ広げない。

## RQ37 Rock StudioはSkyコードを既存ツールへ付けてTool化する

PCのRock Studioは、配布されたSky SDKコードを開発者自身の既存ツールへ追加する画面にする。開発者キーを環境変数へ保存し、SDKと短い組込みコードを追加してツールを起動すれば、Tool Packageの生成、所有者登録、宣言公開、MCP公開、Fund候補化、匿名利用記録までを同じ定義から行う。Skyへソースコードやファイルを貼ることを必須にしない。

Registry APIにはSDKが生成した`sky-tool-package/1`だけを送り、handlerの入力、出力、会話、APIキー、ソース本文は送信・保存しない。危険な外部変更・金融操作は`sideEffects`と`authorize` callbackを必須にして実行ごとの確認と再試行禁止を設定する。宣言公開はSandbox検証や作者署名の代替ではなく、登録不能時に登録完了と表示しない。

## RQ38 製品紹介を主役にし、Developer Preview導入を案内する

`/rockstaros`はハードウェア製品構想avocadoMiniを最初に見せ、その体験を支えるRockstarOSとLLMを次に説明する。デスクトップとモバイルの主操作は製品構想への導線とし、設計画像は実機写真と誤認されないよう明示する。Developer Preview導入案内は同じページに残す。公開配布URLがない間は検証済み導入手順へ接続し、未署名候補を直接インストール可能とは表示しない。OSの作業画面であるHome `/` は紹介ページへ置き換えない。

同じページにSky Tool SDKの最小Node.jsコード例を置き、`https://rockstaros-kaiya.noellesugar1.chatgpt.site/studio`へ直接進める。Studioのコード貼付・ファイル添付、コード本文非送信、宣言公開と検証済み公開の境界はRQ37を維持する。紹介ページの簡素化でHome、Sky、Wallet、設定、導入・復旧ガイドの実機能や既存routeを削除しない。

## RQ39 紹介ページとRock Studioのvisual systemを統一する

`/rockstaros`と`/studio`は、黒を基調に酸味のある黄緑を主アクセントとする同一のRockstarOS visual systemを使う。ワードマーク、太い英字見出し、monospaceの補助表示、細い境界線、丸い主操作を共有する。Studioは説明を短くし、SDK導入コマンド、組込みコード、開発者キー発行を第一画面の主役にする。desktopとmobileの双方で、コードcopy、キー発行、MCP導入確認が読みやすく操作できる状態を維持する。

外観統一のためにStudioのソース本文非送信、Packageだけの登録、失敗時の表示、宣言公開と検証済み公開の区別を変更しない。紹介ページのDeveloper Preview導入案内、StudioからSkyへ直接戻る導線、Skyや導入案内への経路も保持する。

## RQ40 RockstarOS全体のvisual systemとフロント機能性を改善する

Home、共通workspace shell、Developer Preview紹介、Rock Studioを、黒いOS chrome、酸味のある黄緑、明瞭なfocus ring、丸い主要操作の同一visual systemへ統一する。作業内容を読む領域は可読性を優先して明るいsurfaceを維持し、装飾だけのために既存機能や状態を隠さない。HomeからSky、Zema、仕事、CSV、Wallet、Market、設定へ直接進めるようにし、Web版が取得できない通信・電池状態を実端末状態として表示しない。

端末内設定の保存失敗でHome全体を壊さず、編集dialogはEscape、外側click、明示的な閉じる操作に対応する。nested routeでもsidebarの現在地を正しく表示し、処理中に移動を止める場合は視覚・accessibilityの両方でdisabled状態を示す。mobileではheader、app grid、主要buttonを横にはみ出さず、通常ラベルを13px未満へ縮めない。金融・実行・CSVの業務契約、安全境界、保存先、公開状態はこの外観・操作改善で変更しない。

## RQ41 Local Action Assistantを物理Android OSのローカルLLMにする

Local Action Assistantを、RockstarOSの物理Android版で端末内推論を担当する固定runtimeとして導入する。上流repository、完全なcommit、MIT license、`llama.rn`版、主要source hashをlockし、レビュー済みoverlayだけで署名限定Binder serviceとHeadless JS推論を追加する。OS側は固定package、同一署名、API version、明示componentを検証し、未知event、過大payload、timeout、複数tool callをfail closedにする。

読み取りtoolは許可リスト内だけを実行し、メモ・リマインダー作成はproposalを端末内へ一時保存して、OSの別確認呼出しで本人が許可するまで実行しない。release APKは通信権限なし、arm64 native library、固定SHA-256とsizeを検査してからSoongへstageし、AOSPのrelease署名工程へ渡す。GGUFはsourceやAPKへ同梱せず、配布元、license、hash、端末RAM・速度・温度を確認後にimportする。

client/server source、AIDL API v2契約、base＋plan overlay、APK staging gate、固定sourceからのarm64 release APK build、artifact hash固定、emulatorの署名Binder接続とモデルなし0件停止に加え、2026-09-16に所有Pixel 10 GL066上で物理端末instrumentation、Qwen GGUF機内モード推論、保存／再起動、33分22秒連続試験、Zema計画から最初の2段階Tool、結果、履歴まで完了した。Shell API v3ではnative Skyの選択をBroker SQLiteへ永続化し、不正selection tokenを0件拒否するemulator受入まで合格した。使用した署名は試験専用で、新しいSky経路の物理再起動復旧、Soong／OS image、production署名、SELinux enforcing、OTA／rollback／復旧は未完了である。詳細は [Local Action AssistantのRockstarOS導入](local-ai-os-integration-20260915.md)、[plan v2実機証拠](evidence/android-local-ai-plan-v2-20260916.json)、[物理端末推論証拠](evidence/android-pixel-10-gl066-local-ai-20260916.json)を正本補助記録とする。

## RQ42 OS Platform Coreへ登録・承認・Wallet・更新の安全境界を入れる

Tool／MCP／Providerを同じversioned Binder APIで登録する。OS brokerは入力された自己申告を信用せず、導入済みAPKからpackage version、application UID、署名証明書digestを取得して照合する。component種別ごとのcapability allowlistを適用し、runtime登録からSELinux domainを付与しない。第一者packageのdomain割当てはOS image build時の明示allowlistに限定する。

費用や変更を伴う操作は、アプリが作れるのを提案までとする。非公開のOS画面が対象、操作、payload digest、費用上限、有効期限を表示し、端末credentialで本人確認した後だけ一回承認へ進める。承認はowner、component generation、action、payload、費用上限、有効期限へ固定し、停止、更新、失効で無効化する。承認消費とWallet receiptは同じSQLite transactionで記録する。

Wallet基本台帳はowner別の追記型とし、既存行の書換えではなく相殺receiptで訂正する。owner＋request key、owner＋Provider reference、owner＋取消対象をuniqueにして重複を防ぐ。保存schemaはversionを持ち、対応外versionを初期化せずfail closedにする。backupはowner範囲のsnapshotをAES-256-GCMで暗号化し、Android Keystoreの非export keyを使う。

更新は同じcomponent identity、同じ署名、Platform API互換、保存schema互換、新しいversionを必須にする。rollbackはcache済みの古い互換versionだけを許す。2026-09-15時点はcore、AIDL、Android broker／本人確認画面、source SELinux policy、契約とhost testを実装した段階で、Android/AOSP native build、SELinux enforcing boot、production key署名、OTA rollbackと実機受入は未実行である。詳細は [OS Platform Core v1](platform-core.md) を参照する。

## RQ43 正式製品名をRockstarOSへ戻し、内部識別子をdev.rockで固定する

利用者向けの正式製品名と新規表示は **RockstarOS** とし、共通release名は **RockstarOS 1.0** とする。`avocadoOS`は2026-09-15〜16に使われた旧表示名であり、新しい画面、PWA manifest、metadata、Android表示ラベル、通知、診断出力には使わない。

変更しにくい内部識別子は **`dev.rock`** で固定する。既存アプリ、署名、権限、保存済みデータ、外部連携、ブックマーク、配布証拠を壊さないため、Android package／permission、`org.rockstar` component ID、`rockstaros-*` schema／storage key、`@rockstaros` package scope、URL `/rockstaros`、既存artifact名は互換識別子として維持する。これらを新しい表示名へ一括renameしない。

過去の文書、hash、署名済みmanifest、配布archive、受入証拠に記録された`avocadoOS`と、既存バックアップの暗号domain／format識別子は互換性のため改変しない。名称復元は新しい署名鍵、production release、実機対応、OTA受入の完了を意味しない。

## RQ44 共通製品版を一元管理しminor・major更新を可能にする

現在の共通製品版を **`1.0`**、公開前の段階を **`Developer Preview`** とし、利用者向け表示を **`RockstarOS 1.0 Developer Preview`** に固定する。現在版と段階表示は`data/product-identity.json`を正本とし、Web画面はその値を参照して、将来の更新時に複数画面を個別修正しない。

版は`major.minor`形式とする。既存Platform API、保存データ、Tool、Provider、Device Support Packageとの互換性を維持する機能追加・改善は、`1.1`から`1.5`のようなminor更新にできる。非互換なPlatform API、権限モデル、保存schema、署名trust rootの変更は、migration、backup／restore、rollback、対応端末、Tool／Provider互換性を同一候補で合格させた場合だけ`2.0`のようなmajor更新にできる。

各機種のDevice Support Packageは対応するRockstarOS Coreの版範囲を宣言する。版番号の変更だけでDeveloper Preview、実機対応、production署名、本番金融、一般公開のgateを合格扱いにしない。

## RQ45 運営1名による緊急保護と限定保守アクセスを設ける

紛失、盗難、侵害、悪意あるTool、偽更新等が疑われる緊急時は、事前登録された対象端末に対し、認定された運営担当者1名が本人のその場の承認を待たず保護を開始できる。操作は端末ロック、紛失mode、Sky／Zemaの実行停止、session失効、OTA停止、外部接続隔離、個人内容を除く診断、最大15分の限定保守sessionに絞る。

運営serverだけを信用せず、端末側serviceがhardware-backed operator credentialによる署名、対象端末、nonce、scope、発行時刻、失効時刻を検証する。期限切れ、再送、別端末宛、未登録端末、許可外commandは拒否する。offline端末への即時実行は保証しない。

緊急modeでも任意shell／root、写真・会話・原稿等の私的内容閲覧、Wallet送金・承認、秘密鍵・credential抽出、マイク／カメラ起動、未署名code導入、Verified Boot／SELinux無効化を許可しない。LLM、Sky Tool、MCP、外部Providerも緊急modeを開始できない。操作は端末側と運営側へ追記記録し、端末へ実行中表示、終了後に利用者へ通知する。初期化要求には最低30分の取消猶予を設ける。

正本は[緊急アクセスとインシデント対応](security-incident-response.md)および`data/device-emergency-access-policy.json`とする。分離された運営Dock、Access JWT検証、WebAuthn hardware credentialで各命令を固定する署名、単調増加counter、専用命令キュー、署名付き端末channel、端末側独立検証、replay store、追記監査はsource実装済みである。production operator credential、StrongBox attestation登録、Device Owner実行、remote Provider session失効、Pixel 10実機、侵入試験、復旧演習は未完了であり、現段階では管理画面の命令をproduction端末へ配信・実行しない。

## RQ46 運営専用の端末管理画面と永続命令キューを実装する

運営担当者は利用者向けRockstarOSとは別配備の **RockstarOS Operator Dock** から、登録端末のモデル、OS版、hardware identity確認、接続状態、最終接続、命令・監査履歴を確認する。操作時は事故IDと理由を必須にし、RQ45の許可済みcommandだけを選択できる。Dockは運営PCとスマートフォン幅へ対応するが、利用者向けOSのHome、アプリ一覧、route、API、PWA assetへ入口や管理画面を含めない。

Dockの全requestは静的HTML、CSS、JavaScriptを含めて専用Workerを先に通す。WorkerはCloudflare Accessの`Cf-Access-Jwt-Assertion`を公開JWKで検証し、issuer、専用application audience、有効期限、事前登録された単一operator subjectが一致する場合だけassetとAPIを返す。命令時はさらに登録済みP-256 WebAuthn credentialのID、RP ID、origin、challenge、利用者確認flag、署名、増加counterを検査し、端末が再検証できるassertionを保存する。未設定、別利用者、別audience、別origin、未登録端末、未検証hardware identity、期限切れ、同じcommand IDの異内容、署名counter再利用、許可外commandを拒否する。命令と事故記録は利用者Web D1ではなくOperator Dock専用D1へ保存し、監査eventの更新・削除をdatabase triggerで拒否する。

Operator Dock、命令キュー、device channel、Android Agentのsource実装は、配備済みまたは端末への実到達を意味しない。専用hostname、Cloudflare Access application、operator subject、専用D1、production WebAuthn公開情報、StrongBox端末登録はowner設定待ちである。現在は`deviceAgent=source_emulator_verified_production_enrollment_pending`とし、production credential、Device Owner provisioning、attestation、実機受入が完了するまでUIは命令をproduction端末へ送信済みと表示しない。

## RQ47 AI自動化チームの効率化から収益・Wallet・ファンド・ゲームへ逆算する

RockstarOSの最上位の社会的目的は、利用者が自分専用のAI自動化チームを所有し、その効率を改善することで、仕事と生活を便利にし、検証可能な収益機会を増やし、利用者全体の豊かさへつなげることである。AIネイティブOSはそのための製品中核、Pixelは最初のreference hardware、Wallet、ファンド、ゲーム、将来の専用端末は実現・配布・拡張する接続層として扱う。スマートフォン市場の一般機能やカメラ品質でiPhoneと競うことを1.0の完成条件にしない。

通信がない間もAgent runtime / Broker / Engineは仕事分解のplan検証、有限Tool実行、再試行、確認待ち、成果保存を続ける。端末内LLMは閉じたschemaのplan候補だけを返す非信頼plannerで、Tool実行、許可発行、仕事・台帳の書込み主体ではない。接続時だけ外部案件取得、外部作用、納品、署名済み収益、Wallet照合を重複なく同期する。最初に一つのToolでこの経済loopを完走し、次に複数Toolファンドを一押しで開始・管理・改善できるようにする。月50万円規模はProvider確認済み収益と全実行費用を持つ長期の到達指標であり、未検証値、PAPER結果、単発売上、将来利回り、全利用者の収入保証として表示しない。

Walletは収益・費用・receipt・払出し状態に加え、合法的な税務準備の記録、分類候補、期間集計、export、専門家確認を支援する。脱税、架空経費、法域未確認の自動申告を行わない。改善データはcategoryごとに目的、送信先、保存期間、第三者提供、削除、同意撤回を示し、仕事本文、私的会話、写真、秘密鍵、seed phrase、認証情報、正確な位置を既定収集しない。ゲームは公式に許可された接続先へ同じ権限・receipt・Wallet基盤を派生させ、1.0の中核収益loopを止める依存にしない。詳細は [製品目的から逆算した開発軸](product-north-star-20260915.md)を正本補助資料とする。

## RQ48 AIネイティブOSを中核にSky・便利機能・ゲームを接続して発展させる

共通Core、Sky appとOSの能力差、Zema仕事契約、モデル・記憶更新、通信断時の外部作用照合、便利機能とGame／IPの実装順は[AIネイティブOS詳細設計](ai-native-os-architecture.md)を正本とする。[Sol設計監査](ai-native-os-design-audit.md)で設計上の解消と実装・受入待ちを分ける。

RockstarOSの製品中核は、高性能で交換可能なローカルLLM、offline agent runtime、権限、記憶、仕事、停止・再開、Tool、receipt、更新、rollback、復旧を共通化したAIネイティブOSである。社会的目的はこのCoreを所有する利用者の仕事と生活を便利にし、成果と検証可能な収益機会を広げ、より豊かにすることである。「OSが製品中核であること」と「OSを作る作業自体を社会的目的にしないこと」を両立させる。

SkyはTool・ファンド・接続先を選ぶ第一者system、ZemaはAIチームへの依頼、役割、進捗、承認、停止、結果、履歴を管理する第一者systemとし、最初の実用経路としてCoreを継続検証する。仕事や生活を便利にするsystemを優先して追加し、ゲーム、IP／動画生成、VRは利用者の関心に基づく優先的な応用開発系統として関連付ける。特定のTool、ゲーム、生成Provider、金融ProviderをOS imageへ直書きせず、署名、version、capability、本人同意、費用、停止、receiptを持つadapterとして独立更新できるようにする。

Pixel 10は最初のreference hardwareであり、Googleサービス、カメラ、一般向けブラウザ、ATM、特定ゲームはCoreの起動条件にしない。1.0の到達条件は、所有Pixel上でOS、交換可能な端末内LLM、agent、Sky、Zema、一つの実用Toolのoffline実行・再開・安全な接続を証明すること。現行は固定runtime/modelの試験署名APK実証であり、交換可能な端末内LLMやOS image搭載を達成済みと表示しない。Wallet、ファンド、ゲーム等の進捗を過大表示せず、各systemは個別gateに合格した範囲だけ利用可能とする。Jevは[LLM・評価モデル設計](llm-evaluation-architecture.md)に従うSkyの任意remote evaluatorで、local planner、Broker authority、OpenAI接続2件と区別する。

## RQ49 物質同士を組み合わせて発明候補を作るMaterial Invention Coreを設ける

RockstarOSは、物質、配合比、混合順序、温度、圧力、雰囲気、加工、保持時間などを型付きデータとして組み合わせ、目的特性に対する新しい材料・用途・工程の候補を作れるようにする。候補は、入力物質の由来、単位、不確かさ、根拠、生成モデル、版、作成者を保持し、単なるAI文章を実証済み発明として表示しない。

標準の流れは、目的定義 → 物質選択 → 配合・工程候補生成 → 危険性・法規・設備制約のscreening → simulation／既知データとの比較 → 本人承認 → 資格・設備を持つ外部ラボでの実験 → 署名付き測定receiptの取込み → 候補の順位付け・版更新とする。SDS、反応性、毒性、可燃性、圧力、温度、廃棄、輸送、規制情報が不足する候補は物理実行へ進めない。

OS Coreは材料記録、候補graph、権限、provenance、approval、receipt、再現性、rollbackを共通化する。化学計算、物性予測、データベース、ロボット、測定器、外部ラボは交換可能なTool／ProviderとしてSkyから接続し、Zemaで計画・確認・停止・結果を管理する。危険な合成の無人実行、simulation結果だけでの安全・性能断定、専門家確認の代替、秘密の実験条件や知的財産の無断共有は行わない。詳細は [Material Invention Core設計](material-invention-core.md) を参照する。

VR／ARでは同じ候補graphを派生sceneへ投影し、候補、物質lot、工程、安全状態、証拠種別とのbindingを維持する。RockstarOSを搭載する端末concept`avocadoMini`はnorth／east／south／westの四方向sensorで手の動きを捉え、中央のInvention Volumeにある物質digital twinを触る、接続する、離す操作から新しい仮説branchを作る。操作ごとに安全制約を先に検査し、対応simulationを差分再計算して、結果と失敗を版管理する。

製品目標はビリヤード台規模とし、本体約3.0 m × 1.7 m、有効操作領域約2.4 m × 1.2 m × 高さ1.3 mを初期budgetにする。四方向はcamera四台だけを意味せず、各pod内に複数viewpointを持たせて遮蔽と端部精度を評価する。小型Bench prototypeで追跡、安全停止、誤commitを検証してからFull-scaleへ進み、AR headset／2Dを先に受け入れ、裸眼3Dと強い力覚は独立した研究・安全gateにする。

avocadoMiniの操作履歴は、人の直接操作、AI提案、simulation、文献、実験receiptを分けたまま既存Sky Patent AIへ渡し、発明開示、先行技術候補、構成要件差分、専門家向けpacketを作る。gestureは物理実験・外部共有・出願の最終承認に使わず、cameraは物理物質や装置を直接制御しない。Patent AIは特許性、登録、侵害回避、法的発明者、権利帰属を確定せず、電子署名、料金支払、出願を自動実行しない。詳細は[Spatial Invention Studio](material-invention-xr.md)と[avocadoMini端末設計](avocado-mini-spatial-invention.md)を正本とする。

## 1.0への8原則の適用（RQ01〜RQ49を維持）

利用者の「その上で設計を組んで」により、0→1、小市場からの拡大、逆張りの問い、秘密の探索、べき乗則、明確な楽観主義、販売、チームの整合を [製品・事業・開発設計](rockstaros-1.0-strategy.md)へ具体化する。現ベースの機能・料金・ハード方針を置換せず、一つの商品で実行・成果・費用・復旧までの体験を検証する。

初期対象を文章系の個人事業主、代表商品を既存引用整理とするのは検証候補であり、確定した市場や需要ではない。pilotの数値は提案目標。ゲーム交換/作者SDKを任意要求に格下げせず、PC/cloud/self-hostを一律に先送りしない。独占を供給元の排他契約や移行妨害と読み替えない。設計の保存だけで公開・実機・課金・送金を開始しない。

## 現時点の未決事項と維持する前提

- 設計とnativeの統合後の実装は `codex/rockstaros-launch-candidate-20260910` にある。mainへの製品統合は未実施。複数owner/gameの合成契約・台帳分離、GX01/DX01のSDKと限定OS受入は記録済み。実ゲーム・実資金・Androidへの移植は別の未完了条件。[現在の状態](current-state-20260911.md)を参照し、過去の[設計照合](design-implementation-alignment-20260909.md)の未着手状態へ戻さない。
- Rock端末を持たないプレイヤーの本番Wallet利用資格は未決。作者sandboxの参加条件と購入者のOS月額契約を混ぜず、ゲーム利用だけで未同意の月額を開始しない。
- PolymarketはRQ18で基本アプリ枠として採用した。ただし外部市場の接続・注文・清算・実資金移動は未承認。Sky/Chat/Walletを置換せず、提供地域・対象・許認可等が未決のまま実資金市場を開始しない。ゲーム資産売買は引き続き検討案。
- GTAのゲーム内経済は将来像の例。新作GTAの現実経済/外部Wallet連携を確定仕様とせず、特定ゲームの未発表機能へ依存しない。公式に許されたAPI/利用条件/資産権利が確認できたゲームへ接続できる共通基盤を設計し、未対応ゲームを対応済みと表示しない。
- Linux/Buildroot/ARM64 QEMU版を独立候補として維持し、スマホ実機版はPixel 10／GL066／`frankel`を最初の物理対象へ確定して開発する。BlackBerry-firstは現行計画から退役し、正確な対応証拠がない端末をOS対応と表示しない。Android P1・機種構成へのsource組込み・実機合格は別に判定する。
- tob側の具体的な商品・提供組織・外部API契約・ライセンス・価格は商品ごとに確認する。7種類の仮想fixtureだけでは実商品の統合完了にならない。
- 金融provider、資金保管方式、通貨/チェーン、販売/精算主体、返金・出金条件の実接続を確定する。利用者の所在地や事業国を作業フォルダから推測しない。
- ゲーム名/repository・提供者の権限と公式接続、交換方向、対象資産と原資、交換条件・利用規約・提供地域の確認は未了。実交換を自動開始しない。
- ATM自社手数料0は確定。ゲーム向け料金、外部実費の扱い、継続運用原資、対象SDK/ゲーム環境は未決定。OS月額は既存契約を維持。
- 先払いStripe定期購読APIは停止し、署名済みEarning Receipt、月888 cents上限、追記型台帳、払出し指図の収益精算経路へ置換した。main merge、実機書込み、一般公開、販売・決済・払出しProvider接続、実入金・実回収・実送金は、必要な外部設定と受入が終わるまで未実施とする。

## 変更記録

2026-09-16 v1.71: Astra設計・Sol監査によりRQ48の共通Core契約と各応用の独立受入を具体化。現行入口のHub＋Wallet中心、BlackBerry-first、GameのFund完成待ちを同期し、Pixel非破壊23/23受入を現在の構成状態へ反映する。新しい汎用機能は設計段階として追跡する。

2026-09-16 v1.70: 高性能で交換可能なローカルLLMを持つAIネイティブOSを製品中核へ明確化。Sky／Zemaを最初の第一者system、社会に役立つ便利機能を継続開発系統、ゲーム・IP／動画・VRを関心に基づく優先的な応用系統とし、すべてを独立更新可能な共通契約でCoreへ接続するRQ48を追加した。

2026-09-16 v1.65: native Sky選択をBroker SQLite schema v2へ永続化し、Shell API v3のselection tokenが一致する場合だけZema計画を開始するよう固定した。host 35件、Android全378 task、emulatorのBroker 9/9・Shell 4/4は合格。新経路のPixel実再起動受入は端末再接続待ちで未合格を維持する。

2026-09-16 v1.62: 外部Providerを初回OS full buildから分離し、アプリ／サーバー側の公開前必須gateへ固定した。Pixel 10 GL066の署名検証済み`2026091000` source tag、adevtool、laguna／muzel 6.6、Dynamic Partition／Virtual A/B／AVB構成を固定したが、Google純正factory／full OTAの実ファイルSHA、vendor inventory、production署名／復旧計画が残るためfull build入力gateは未合格とした。

2026-09-16 v1.59: 所有Pixel 10の読取り専用ADB確認で日本向け`GL066`／`frankel`を最初の物理対象へ確定し、Android物理端末の機種／SKU gateを1/5合格にした。端末serialは保存せず、full build、flash、boot、BSP／復旧、CTS、production署名、販売準備は未合格のまま維持する。

2026-09-15 v1.58: Tool完了とProvider確認済み収益を分離したまま、Provider署名、job照合、鍵分離、Billing D1への一度だけ反映をROCK_READY fixtureで縦断合格した。実Provider sandbox、実収益、払出し、所有Pixel上のAI実行は未完了のまま維持する。

2026-09-16 v1.63: 当時の全11層の選択と6本のend-to-end flowを一つの構成監査へ固定。2026-09-18 v1.76でMaterial Invention／avocadoMiniを加え、12層・7経路へ更新した。設計選択は適合、全component実装・全必須経路統合・productionは未完了と判定する。

2026-09-16 v1.64: Local AI plan-only API v2とBrokerの二重検証を追加し、emulatorの0件停止、PixelのZema→2 Tool→結果・履歴を合格。native Sky永続handoffと全経路の再起動／失敗復旧は未完了として維持する。

2026-09-15 v1.57: AI自動化チームの効率化を最上位目的に固定し、offline-first実行、検証済み収益、Wallet、ファンド改善、税務準備、ゲーム、専用端末へ逆算するRQ47を追加。Pixelは最初のreference hardware、月50万円規模は長期の実測目標で収益保証ではなく、改善データ収集はcategory別同意と削除可能性を必須にした。

2026-09-15 v1.56: 有料full buildと実機flash／bootを最後に固定し、正確な端末readback、Android単体APK、emulator、純正Pixel上のoffline AI／温度、Sky→Zema→Tool→Wallet、source／artifact freezeを事前必須gateにした。app-only修正とOS image再build対象を分離し、初回build環境を最初の実機boot確認まで保持する。

2026-09-16 v1.60: Pixel 10 GL066上の単体APK offline AI、再起動復元、33分22秒の熱試験を合格。Rock所有fixtureのTool→署名Earning Receipt→Wallet bridgeも合格済みとして同期した。外部Provider sandbox、物理PixelのWallet Provider縦断、BSP／復旧入力、source／artifact／署名計画freezeは未完了のため有料full buildを許可しない。

2026-09-16 v1.61: 同一の合成実行IDと証拠hashでPixelのTool／端末Walletと署名済みBilling Walletを相関し、物理6/6・署名精算7/7・Sky→Zema回帰19/19を合格した。配備済み外部Provider一本通しや実収益ではない境界を維持し、Provider sandboxとOS build入力のfreezeが終わるまで有料full buildを許可しない。

2026-09-15 v1.42: 利用者指定のOS共通登録、API version、UID／SELinux分離、本人承認・費用上限・停止・失効、Wallet台帳・receipt重複防止、暗号化backup・schema migration、署名更新・rollback・互換性検査をRQ42へ追加。source実装とnative／実機release gateを分離する。

2026-09-15 v1.41: 利用者の「OSのシステムに入れる」「どんどん進めて」によりRQ41を追加。Local Action Assistantの固定source、オフラインLLM契約、署名限定Binder client/server source、Headless JS、別確認、APK staging gateを実装し、native build・署名・image・実機試験の未完了境界を維持する。

2026-09-15 v1.40: 利用者の「OSのデザインも統一し、フロントデザインの機能性の問題を洗い出して改善」によりRQ40を追加。OS本体へ共通visual systemを適用し、主要routeの操作性、状態表示、keyboard focus、mobile overflowを監査して修正する。既存機能と安全境界を保持した同一sourceをSites本番へ配備する。

2026-09-15 v1.39: 利用者の「デザインを整えて統一して」によりRQ39を追加。Developer Preview紹介とRock Studioへ黒・黄緑・太い英字・monospace補助・丸い主操作を共通適用し、Studioは入力面を主役に整理する。既存のコード解析、Package登録、安全境界、Home導線は変更しない。

2026-09-15 v1.38: 利用者の「紹介ページをもっとカッコよく、シンプルにし、OSをインストールするボタンとSky開発者コードを置く」と、指定された本人限定Siteの`/studio`に基づきRQ38を追加。`/rockstaros`をインストール中心の一画面へ整理し、Sky SDKの最小コードとStudio導線を統合する。公開前・対応環境の境界は短く保持する。

2026-09-15 v1.38: 利用者の「やっぱコードがあってそれをつける方が楽」によりRQ37を更新。Rock StudioをSDKコードのコピー、開発者キー発行、既存ツールへの組込みに一本化し、起動時のPackage生成、登録、MCP公開、匿名利用記録をSDKへ移した。ソース本文はSkyへ送らず、検証済み公開との境界を維持する。

2026-09-15 v1.37: 利用者の「フロントはチャット形式でコードかファイルを貼ったら、あとはSky側でコードを追加して登録する」「サイト作成」によりRQ37を追加。Rock Studioをコード貼付・単一ファイル添付だけの画面にし、端末内解析からSDK組込み例、Package、安全契約、Fund分類、所有者登録までを自動化する。コード本文はRegistryへ送らず、登録失敗を成功表示せず、検証済み公開との境界を維持する。

2026-09-13 v1.36: 本番Wallet利用の明示指示をRQ36へ追加。Base Mainnet USDC、外部Walletの所有署名、D1回収指図、exact transferとfinalized blockの照合を採用する。秘密鍵・利用者資産・包括的送金権限は保管せず、owner署名と最初の実transferは未実施のまま先取りしない。

2026-09-13 v1.35: 自社回収のため、Rock Settlement Walletを共通Provider契約の第1号としてRQ35へ追加。検証済み収益から確定したRock利用料の受取・報告だけをsandbox実装し、利用者資産の包括保管、任意送金、交換、ファンド運用、LIVE回収は追加していない。外部Providerも同じadapterで後から追加できる。

2026-09-13 v1.34: Wallet／ファンドをRockの内製金融機能ではなく、交換可能な外部Providerとして受け入れる方針をRQ34へ追加。OSはcapability、同意、指図、状態、receipt、照合の共通面を担い、保管・運用・約定・払出し・法定判断はProviderへ残す。二次事業者の参入余地を確保し、外部実接続と実資金は既存gateを維持する。

2026-09-13 v1.31: Chatの接続bot管理、本人別永続Wallet、主要画面のstyle契約、配備asset closure、GitHubと本人限定Sitesの同一commit収束をRQ32へ追加。分散branchの無条件mergeではなく、現行の安全契約と検証を満たす完成版だけを採用する。

2026-09-12 v1.27: QEMU rc2を10要件へ分解し、候補identityと範囲付き受入5件を合格、native SBOM・製品license・production署名・署名後受入・公開承認5件を未達として機械判定した。旧9abのtarget 24＋host 37 componentをCycloneDXへ変換するが、rc2へ転用できない検査を追加した。

2026-09-12 v1.28: rc2配布archiveと同梱legal bundleのSHA-256を照合し、target 24＋host build 37 componentのcurrent native CycloneDXを同じ候補へ結合。native SBOMを合格へ更新して6/10とし、製品license未許諾は独立gateへ保持した。manifest改ざんと旧9ab差替えを拒否する試験を追加した。

2026-09-13 v1.30: Android物理端末5gateとマイナンバー7gateの機械可読監査を追加。対象端末・build・BSP・CTS・署名・地域・取扱主体の証拠がない現状をblockedに固定し、GMSなしと番号取得なしの境界を自動検査する。

2026-09-12 v1.29: 署名機構の4 suite・計62公開fixture試験を単一commandへ集約し、通常の全体verifyへ必須化した。試験数減少も失敗させ、production鍵・owner承認・実署名・署名後受入は未達のまま分離した。

2026-09-12 v1.26: 配布方法ごとの公開最低条件を機械判定する台帳と検査を追加。本人限定Web/PWAだけをreadyとし、一般公開、QEMU配布、物理端末、iPhone/iPad client、マイナンバーは証拠が揃うまでblockedを維持する。Web/npmのCycloneDX SBOM生成を追加した。

2026-09-12 v1.25: 設定の「システム」を最低限の運用センターへ拡張。通知、永続保存、個人情報を除く診断共有、確認付きホーム設定初期化を追加し、日常の稼働状態とAndroid互換、GMS、実機、署名、OSS、無線規制、マイナンバーの公開gateを分離した。

2026-09-12 v1.24: Skyの最初の具体的な収益経路としてメルカリ収益スターターを追加。個人版は規約に沿う出品支援、Shopsは公式API Connector、自動精算はProvider確認済み取引完了だけに限定した。自己申告、売上保証、個人アカウントの無人操作は採用しない。

2026-09-12 v1.23: 設定へ実状態診断、PBKDF2/AES-GCM暗号化バックアップ、改ざん検知付き復元、Service Worker更新確認を追加した。物理端末、正式署名、外部Providerは必要条件が揃うまで未完了gateとして維持する。

2026-09-12 v1.22: 標準入口をカスタマイズ可能なホーム画面へ変更し、Skyを`/sky`へ分離。基本4アプリに加え、外観・接続・権限・保存・更新・導入復旧の入口を持つ設定utilityを追加した。外観は端末内設定であり、OS権限や本人確認を変更しない。

2026-09-12 v1.13: 利用者の明示確認により基本アプリをSky / Chat / Wallet / Polymarketへ固定。Sky内の依頼欄をChatへ分離し、Polymarketは安全な未接続app shellのみを採用した。実市場データ・注文・清算・資金移動は許可していない。

2026-09-12 v1.12: 利用者の命名により自動化ツールの入口をSkyへ全面改称。Skyの固有価値を、選択、条件確認、許可、実行先の吸収、実行・停止、結果・記録の一体管理として明文化した。Web/PCの使用可能4件、導入候補3件、native OS内蔵6種類・9バージョンを区別して棚卸しした。既存データ/APIの内部 `hub` 識別子は互換維持のため変更しない。

2026-09-09 v1.0: 利用者の「tobの商品をSkyで管理」「現在のツールも商品」「SkyとWalletで十分」「実行場所/課金/OSS等への対応」「Gitから最新進捗を調べ正確なプロンプトを作る」を固定。「持つとどんな不を解決するか」「Gitの既存ツールをSkyに入れて使い方を試し開発する」をRQ11へ追加。Pixel優先への巻戻し、Wallet未実装という全体断定、既存月額の廃止示唆、MCP/OAuth一律強制は採用しない。

2026-09-09 v1.1: 利用者の「指摘した問題を解決する内容を含めて作業を進めるプロンプトを作成」に対応し、RQ10へ問題解消の順序・合格証拠・開発側引継ぎ同期を明記。製品機能、料金、ハード方針は変更しない。

2026-09-09 v1.2: 利用者の「現設計を最低限のベースとしてOS稼働まで進めるプロンプト」「安全にテストされ動くことの雛形」をRQ12、「OS/ゲームとWallet/ゲーム通貨交換、ATMとは独立」をRQ13に追加。QEMU開発雛形→実機/実サービス/本番の別ゲートを明示。交換方向・レートは未決定であり実装済みではない。RQ01〜RQ11、料金、tobの担当、BlackBerry方針は保持。

2026-09-09 v1.3（作成途中）: 作者向け共通接続・sandbox・SDK・導入体験をRQ14へ追加。手数料0をゲーム向けと解釈した初稿は、続く利用者の補足により訂正。ゲーム手数料0を確定要望として継承しない。

2026-09-09 v1.4: 利用者の「atm手数料の話」を反映。RQ15にATM自社手数料0を固定し、ゲーム料金は未定、OS月額は既存契約維持とする。作者向けWallet方針は保持。ゲーム側の手数料を取ると決めたわけでも、実ATM・実資金を動かしたわけでもない。

2026-09-09 v1.5: 利用者の「プロンプト作成、その後設計書を確認、確認したら進める」により実装を設計承認待ちにする。OS内のGame入口・成果の軽い演出は確認用の提案として設計書へ分離し、runtime実装は開始しない。

2026-09-09 v1.6: 現進捗と設計の再照合で、設計branchの参照漏れ、単一ownerから複数playerへの設計不足、最新backup形式と試験入口の差、台帳移行とA/B互換、段階依存を訂正。RQ01〜RQ15・料金・ハード方針は不変。市場案は未承認の検討事項として保存し、実装は引き続き設計承認待ち。

2026-09-09 v1.7: 利用者の「CM発表に向けてOSを入れられるようにする」をRQ16へ追加。fresh環境向けQEMU Developer Previewと、1機種限定のPhysical Device Previewを分離し、導入・署名検証・復旧・CM表現の合格条件を固定。必要な実装と要約証拠だけをGitへ保存する運用も追加した。

2026-09-09 v1.8: 利用者の「まずRockstarOS 1.0で発表し、現段階をベースに継続改善する」をRQ17へ追加。1.0のsystem構成、現在の実装、進化余地、CMでの表示境界を文書化した。

同版の利用者補足: GTAのようなゲーム経済と現実の接点に備えたい、自動化で多くの人の挑戦を増やしたいという目的をRQ01へ明記。特定ゲーム対応、市場運営、自動投機、収益/価格上昇の保証は追加しない。

2026-09-09 v1.9: 利用者の8原則に基づく設計依頼を反映。対象仮説、代表商品候補、既存systemとの接続、配布/実用の優先順位、pilot指標、CM導線、担当責任を文書化。RQ01〜RQ17・料金・ハード方針は維持し、文書更新をruntime進捗に換算しない。

2026-09-11 v1.10整合追記: スマホ準備をlaunch-candidateへ統合。CM制作途中・新Sites本人限定公開・MIT/鍵/クラウド税別10 USD案の未回答を同期し、N03を実際に選ぶ1機種の適合確認として明確化。RQ01〜RQ17と料金、実機未合格を保持。

2026-09-12 v1.11: `k999ln/rock`のRockstarOS Automation Hubへ、Instagram運用・受注型ファッションブランド管理を商品として追加する要望をRQ18へ固定。Provider差替、MCP tool群、受注/顧客/制作/発送DB、Stripe等の決済照合、分析feedback、危険操作の個別approvalを要求する。Mr. One Hubや古いAutomation Hub archiveを正本にせず、実Provider接続を実装完了へ換算しない。

2026-09-12 v1.14: 利用者の「もっとできる」「そうしよ」を、Campaign Autopilot、AI Sales Concierge、Production Cockpit、経営ダッシュボードへの拡張としてRQ19へ固定。目標駆動の計画と内部下書きは進めるが、既存approval、Provider、入金Webhook境界は維持する。

2026-09-12 v1.15: 利用者がSkyで月額8.88 USDを実際に回収できるsystemを事業上の必須条件としたため、Stripe Checkout、署名Webhook、D1契約・請求台帳、二重申込み防止、Customer PortalをRQ20へ追加。本番コードの準備を許可したが、Stripe事業者・入金口座・販売表示・sandbox受入なしにlive課金を開始したことにはしない。

2026-09-12 v1.16: tobからSky利用料とSky売上手数料を取らない方針をRQ21へ固定。ToC月額、tob商品価格、外部実費を分離し、Connection Passport、実行契約、貢献receipt、取消・精算を一画面で説明するSky Networkフロントを追加する。分配条件と実providerは未確定で、合成表示を実送金実績にしない。

2026-09-12 v1.17: 利用者の「Skyの中にMCPの機能がないとダメ」「Skyの機能はSkyに全部入れ、sidebarをやめる」によりRQ22を追加。Sky画面の常設sidebarと独立したSky Networkナビゲーションを外し、Sky本体へMCP状態、接続・管理、ToB掲載を統合。旧URLはSky内の対象機能を開く互換入口として維持し、実接続・実送金OFFの境界は変えない。

2026-09-12 v1.18: 利用者の「MCPは完全に使えるか」「既存自動化をスムーズに導入・利用できるか確認し、導入画面も整える」によりRQ23を追加。Sky MCPを実在するPC接続sessionと4機能へ接続し、3ステップ導入画面へ置換する。任意外部MCPや実Providerまで完成したとは扱わない。

2026-09-12 v1.19: 利用者の訂正によりRQ20を先払い月額から成果連動精算へ変更。自動化の実入金をExecution ReceiptとProvider参照で検証し、実費後の残額からだけ月最大888 centsを回収する。売上0時の請求、債務化、翌月繰越、カード定期請求を禁止し、ToB無料を維持する。

2026-09-12 v1.20: 利用者の「SkyからいろんなMCPへワンタップ接続」「接続先をどこにするか決める」によりRQ24を追加。接続先をこのPC、Sky Cloud、提供者MCPの3系統に固定し、Sky内で推奨先と利用可否を選ぶ画面を追加。ローカル以外はOAuth・権限差分・接続証跡・失効が未実装のため準備中として無効化する。
