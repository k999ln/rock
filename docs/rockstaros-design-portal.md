## Noahの接続と共有を設計する

v0.4の[Noahストア・端末管理](noah-agent-model-store-design.md)を主導線にする。Eveは共通知能、NoahはAgent構成とストア、AMC/Broker/Work/Jevは工程・権限・実行・評価を担い、独立したSkyは置かない。Agent/LLMの検索→端末へ追加→Eveで仕事・編集→更新/削除を既存モデル管理へ接続する。旧sky系識別子とv0.3の3機能DB/APIを保持。計62件の受入設計で、新runtime・導入・配備は未実行。

[Noah — 接続と共有の設計](noah-connection-sharing-design.md)を、発見→選択→Eveの担当作成→接続/実行→成果→共有の入口とする。現表示Noahと旧Sky/smis/Smithの互換識別子を対応づけ、11設計項目、62受入ケース（実装後の合格条件）、未決定事項と担当を整理した。main・PR305・Root・配備版は別候補として扱う。v0.2で限定投稿の外部送信・未送信下書き・期限/撤回付き招待の3契約を具体化した。今回は文書整理で、新しいruntime・公開・実機の受入ではない。[検証記録](evidence/noah-connection-sharing-design.json)。

## smis（旧Sky）の現行名と接続目標

2026-10-22の本人指示で製品名は **smis**。Eveで担当を作り、無機物・有機物を問わず、実際に確認した機能と許可に基づいて対象へつなぐことを目指します。[接続の詳細](sky-tools-complete-design.md#sky-object-attachment)。旧名の記載・`/sky`の経路・SDK等の識別子は同じ製品を指し、互換性を保ちます。物理部品・生体接続・一般ローンチは未受入です。

## 全体の詳細開発入口（2026-10-22）

本人の「全体の詳細まで網羅した開発プロンプト」依頼により、[共通Coreの既存プロンプト](prompts/rockstaros-common-core-development.md)を全体版へ改訂しました。製品/料金/動作環境、Coreと全応用、実行SI、計量/作者、データ/機微情報、端末/更新復旧、Home、ニュース、World/ゲーム、Mini/物質発明、運用をまとめ、各責任・状態・失敗/復旧・合格を記載しています。公開v110と未公開source、実機/本番を区別し、正本のRQ01〜49と87件照合を保持します。これは入口/実行指示の更新であり、新しいruntime受入ではありません。

## Eveの現行定義（2026-10-21本人訂正）

EveはRockstarOS内の**LLMの製品名**。Eve画面はその会話/仕事の入口であり、AMCのjob管理、SkyのTool接続、OSの権限/費用/実行と組み合わさる。旧記述の「Eveは窓口のみ」は画面の役割を説明したもので、モデルの製品同一性ではない。自社Eve重みと汎用実行SIの受入は未完了。[詳細](rockstaros-complete-design.md#eve-llm-product-identity)。

## Homeの最新frontend

画像による本人指示で、Home全体をnative投稿型へ拡大。[ニュース/能力/任意機能の投稿→Add→設定→Eveの設計](rockstaros-complete-design.md#homeを投稿そのものにするhome-native-post-frontend)を現行とする。以前のtimeline限定試作は履歴。

## 料金・契約・請求

月額16 USDの版付き枠付き契約、契約前見積、支払い方法登録、環境準備後の起算、実行予算予約、meter別計量、月次Invoice、Provider照合、未払い制限とデータ保持・復帰は[共通請求契約](sky-billing.md#rockstar-monthly-billing-contract)を正本とする。実装・Provider受入は[Wallet / Billing workstream](workstreams/03-wallet-billing-providers.md)のBIL02へ進める。未確定の料金版やlocal fixtureを本番販売・請求の証拠にしない。

## Wallet・収益・外部金融接続

自動化の実収益から入金照合、二重分配防止、作者・利用者・Rock・Provider別の内訳、返金/chargeback/出金失敗の追記訂正、実資金の個別承認までの共通設計は[OS全体設計 §18](rockstaros-complete-design.md#wallet-revenue-external-finance)を正本とし、[Wallet workstream](workstreams/03-wallet-billing-providers.md#wallet-revenue-finance-20261020)から実装・受入へ進める。現行の合成台帳と外部Provider/実資金受入を区別する。

## Eve：仕事の窓口

実行SI向け自社LLMの構想は[LLM・評価モデル設計](llm-evaluation-architecture.md#execution-si-owned-model)を入口とする。Eveの依頼からSky Toolの実resultへ進む際も、Brokerの権限・本人承認・予算判定を通す。現段階は設計のみ。

会話から同じ本人の仕事を作り、Skyの能力、複数Agent/Toolの計画、見積と承認、長時間継続、停止照合、検収、成果の別アプリ読戻しまで扱う[詳細設計](rockstaros-complete-design.md#eve-work-desk)。主担当は[Product / UX](workstreams/01-product-ux.md)。設計記録と各runtime/Provider/端末の受入を区別する。

## 通信・ネットワーク

RockstarOS共通runtimeの通信要件、端末と管理Linuxの別観測、経路切替、再接続・差分取得、通話、費用、VPN、DNS／TLS／時刻の受入は[共通通信設計](network-transport-design.md)を入口とする。現段階は設計であり、衛星・通話・実機・公開ドメイン監視の成功を意味しない。

## 最新再設計と端末・ブランドの統一（2026-10-20）

Pixel、avocadoMini、avocadoPro、相棒端末、iPhone/一般PC、時計/TV/ロボット等の個別能力・権限・安全・保存/復旧の合格条件は[端末別受入](device-support-architecture.md#device-specific-acceptance)から参照する。能力の宣言は機種別の実装や実機合格を意味しない。

本人の明示訂正により、今のRockstarOS再設計を最新版とし、旧Buildroot OSは良い実装の選択再利用元とする。旧OS完成や旧QEMU合格を現商品の完成条件/証拠へ置き換えない。表示名RockstarOSと既存avokado会社ロゴを統一し、Pixel・avocadoMini・avocadoPro・吊り下げ相棒を共通owner/job/権限/契約/料金へ接続する。端末差は能力と入出力adapterで扱い、同一契約の端末追加による基本料重複を防ぐ。相棒のSOS/独立警報は通信/LLM/課金と分離する。[詳細正本](device-support-architecture.md#current-device-adaptation)。現段階の各実装・実機・請求受入は独立して記録する。

PixelのeSIM追加・料金/契約・支払い方法・専用Linux・Sky/Eveの利用開始は、[OS完成後に組み込むmodule](sim-led-product-architecture.md#pixel-service-setup)としてsource開発中。初回setupは引落0、既存月末請求へ接続し、実eSIM/実機/Provider/OS受入前は既定無効。

## 最新の標準提供：既存OSへ共通RockstarOS環境を接続する

商品の意味は、通信容量を売るeSIMではなく、自分用のcloud Linux・LLM・Agentが追加されるservice profile。携帯の圏外/電源OFF後も、executorが受領済みの仕事を本人承認済みの権限・予算・期限内で進める。LLMがlocalなのは配置先Linuxに対してで、全iPhone内へのmodel搭載を意味しない。PCの前に立たない制作、携帯を持たないやり取り、実利用/検収/収納に基づくRun to Earnを同じ仕事/成果へつなぐ。実行Linuxまで外部通信断なら、導入済みmodelの自己完結処理と、外部作用の待機/再照合を区別する。

2026-10-20の本人追加指示「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」により、標準商品は、eSIM導入から本人専用の共通RockstarOS環境を準備し、既存OSの端末へ接続する方式とする。RockstarOSの中のSky・Eve・管理Linux・OS Coreを共用し、端末ごとの差は能力契約と薄い入出力adapterで扱う。eSIM非対応機器は本人承認した子接続で同じ契約へ追加する。GrapheneOS forkや機種別OS imageは追加のnative系列であり、標準利用開始の前提にはしない。

[発明する起動・接続protocol、アルゴリズム、状態、責任と受入条件](sim-led-product-architecture.md#esim-service-attachment)と[機械可読案](../contracts/rockstar-service-attachment.json)を現在の詳細とする。eSIM側アプレットは対応発行元と端末での研究対象。iPhoneの完全無操作起動、同意なしのapp導入、全hardwareの全機能は未実装・未受入であり、手動Web起動へ希望を縮小して完成扱いにしない。従来のnative優先説明はその追加系列に限って読む。RQ01〜RQ49、月16ドルの枠付き契約、本人権限/費用上限/持出しを保持する。

## 現行の大元：RockstarOSの中にSky・Eve・Linux

2026-10-20の本人指示「osが大元」「osの中にskyもeveも」「osの中にlinux」に従い、製品全体の大元は**RockstarOS**とする。OSの中に、能力の登録・追加・接続を担う**Sky**、LLM製品であり会話・依頼・計画確認・承認・進捗/停止・成果・利用額のSI画面を持つ**Eve**、対応するmodel/Agent/Toolを処理する**Linux実行環境**を置く。本人・eSIMサービス利用権・権限・予算・保存/復旧・利用量/請求はOSの共通管理へ結び、Sky/Eve/modelへOS権限を移さない。

利用の流れは、Eveへの依頼→Skyで登録/追加した能力の選択→OSによる本人/利用権/権限/予算の確認→対応Linuxで実行→共通の仕事/成果/使用量→Eveで確認。Skyから機能を選んでEveへ渡す入口も同じOS内にある。TerminalはLinuxを直接扱う任意の操作口で、日常の依頼はEveから行える体験を目指す。管理Linuxをcloudに置く場合はRockstarOS内部の実行環境として扱い、外部LLM/providerだけを対応adapter先として区別する。全model本体を端末内へ格納する意味ではない。

Pixel版はGrapheneOS/Android上の対応Linux guestを使う方針、Mini/Proは機種別のLinux/runtime適合で決め、Pixel用binaryを転用しない。既存のLinux計量・LLM・権限・保存コードを再利用する。これは前の「Skyを全体の大元」とする説明を利用者が訂正した設計階層の修正であり、全OS image・全機種・全Cloud/使用量統合の完成宣言ではない。月額16ドルの枠付き共通契約、Eveへの呼称統合、保存済みデータと既存IDを引き継ぐ。

## 正式名称：Eve（イヴ、旧称Zema）

2026-10-20、利用者の明示指示「zemaじゃなくてeveにしよadamとeveのeve」により、仕事・会話・進捗・承認・停止・成果・使用額を扱う製品の表示名を **Eve** に変更する。名前の由来はAdamとEveのEve。既存のSky、Jennifer、月額16ドルと利用枠、本人承認・保存・復旧の業務契約を引き継ぐ。文中の旧称Zemaは同じ製品の過去名として読む。

既存の`/chat`、`zema`利用権scope、保存キー、`sky-zema-core` package、公開済みの関数/schema/ファイル識別子は互換性のため保持する。名称変更で既存の会話/仕事/成果を消したり、新規サービス契約/追加課金を開始しない。過去の受入証拠・配布物の名称とhashは当時の記録として保持する。Web sourceの表示・名乗りと、Android APK/OS image・公開環境への反映は別に受け入れる。

[Pixelで複数のAIと担当を追加して使う](sky-tools-complete-design.md#sky-multi-model-pixel) — 本人用Linuxの共通追加/準備/実行/持出し/停止。一般公開保留。

## 本人用LinuxのSkyモデル・担当（2026-10-18）

利用者は追加→環境準備→実行→料金確認→成果持出し→停止を同じSky仕事契約にそろえ、2026-10-19に実行先をPixel本体のLinuxと指定した。画面・仕事の管理・private store・固定GGUF推論を既存Terminal Debian guestへ配置する。先行のPixel画面→PC Linux受入は別証拠。同一Pixelで固定model/文章担当3つの追加、実依頼、費用表示、Download保存、実process停止、Sky終了後の読戻しを限定受入済み。現在は停止済みで、汎用model/任意code/全OSの受入ではない。[11項目の正本](sky-tools-complete-design.md#sky-private-linux-deployment)。一般公開・Cloud課金・全OS受入は保留。

Zoomでの日本語発話を相手の言語へ届ける導線は、[Zoom標準の翻訳字幕・音声の設定契約](sky-tools-complete-design.md#sky-zoom-interpretation)を入口とする。自作字幕bridgeは利用者の修正に従って撤去。利用権・対応言語・相手側の実会議受信は別に確認する。

## Sky全体の表示と持出しの共通ルール（2026-10-18）

利用者の明示指示により、Skyの全機能で画面・進捗・成果・エラー・保存ファイルを普通の言葉にそろえる。最初に「何ができたか・何が残るか・次にすること」を示し、処理番号や専門的な記録は必要な人が開ける詳細へ置く。権限・費用・未確認・省略・停止の実態は隠さず、元の入力と成果は保持する。[共通の入出力・状態・保存・復旧・安全・合格条件](sky-tools-complete-design.md#sky-plain-language)。Zoom以外の接続や仕事、今後の端末表示にも適用する。一般公開は保留。 追加の[依頼を中心にする構造](sky-tools-complete-design.md#sky-user-first-flow)に従い、設定と以前の全文を必要時に開く。Pixelの入口/依頼画面から適用し、全画面移行と実行受入は別に記録する。

<a id="sky-foundation"></a>
## 現行の製品階層：RockstarOS → Sky・Eve・Linux実行環境

2026-10-20の本人訂正により、RockstarOSを製品全体の大元とし、Sky・Eve・Linux実行環境をその内側へ配置する。Skyは能力の登録/追加/接続、EveはLLM製品で、その画面がSIの依頼/仕事/成果/利用額の窓口、Linuxは対応する処理の実行環境。OSの本人/権限/利用権/予算/保存/復旧を共通に使う。2026-10-18にSkyを全体の大元と記した説明は、この現行方針で訂正する。Web/clientによる利用経路と本人の退出/移行は維持する。

既存Platform Core/Brokerと本人承認、利用権/予算、型付き成果、DB/復旧を再利用する。この階層訂正はOS権限をmodelへ委ねる変更でも、全hardwareへの搭載済み宣言でもない。SIM/eSIMの導入/利用権、RQ01〜RQ49、料金、Provider/Pixel/QEMU/Mini/Proの受入は維持する。[共通契約の11項目とZoom/Planner実装](sky-tools-complete-design.md#sky-foundation)。一般公開は保留。

# RockstarOS 全設計ポータル

本人確認・端末鍵・仕事別権限・個別承認・短期lease・監査と緊急停止の共通入口は[Security / Identity / Complianceの受入契約](workstreams/04-security-identity-compliance.md#owner-identity-permission-safety-20261020)。現行sourceの部分実装と実環境の未受入を区別する。

2026-10-20追加の[AI・モデル管理](ai-native-os-architecture.md#ai-model-management)は、登録・適合・安全な取得、実測比較、端末/Linux/Cloud選択、資料と生成文の出所、Broker再検査、更新後の履歴互換を一続きの契約で扱う。現在地は[LLMと評価モデル](llm-evaluation-architecture.md)と[AI02・AI05](../data/project-status.json)で確認する。

本人別データ、仕事/操作/成果/使用量ID、冪等性、revision、lease/checkpoint、結果不明、offline同期、backup復元と退出は[OS Coreのデータ・同期・復旧アルゴリズム](rockstaros-complete-design.md#data-sync-recovery-algorithms)を入口とする。設計保存とWeb/端末/Provider/本番の受入は分ける。

avocadoProの[内部構成一次候補](device-support-architecture.md#pro-internals): 価格重視のRTX 5060 Ti 16GB、筐体拡大が必要なRTX 5090 32GB、別方式のGB10小型研究。公開仕様に基づく比較で、GPU/PC部品供給、価格、熱、OS/driver、実機受入は未確定。

2026-10-18の製品目的: [PCから離れた制作と携帯を持たない連絡](device-support-architecture.md#shared-si-device-profiles)を、Miniの入力/連絡、Proの承認済み計算、Sky／Zemaの同じ仕事と成果でつなぐ。[Mini OI07](avocado-mini-r5/product-invention-r1.md#試作と停止条件)は同一機の受入条件。設計反映と実機合格を区別する。

2026-10-18追加: avocadoMini R5の最低機能は、センサー、生体認識、RockstarOS／Sky／Zema、対応機器連動、Mini内蔵の衛星WAN→Wi-Fi、dock外ポケットWi-Fi、空間着信表示とタップ応答。[携帯代替・空間UI詳細設計](avocado-mini-r5/phone-spatial-interface.md)を現行R5の入口として参照し、MP01〜06の実機受入を別に追う。提示動画は見え方の参考であり実装証拠ではない。


2026-10-18最新指示: [Skyの主軸・ユーザー作成Agentと国への共有準備・一般ローンチ保留](sky-launch-design.md#sky-private-review)。[本人jobの持出し・Skyなしの閲覧](sky-tools-complete-design.md#sky-user-freedom)を最初に実装する。ユーザー作成→sandbox→対応hostへのAdd、実Zoom接続、人への接続研究、国への送付をそれぞれ独立した段階で扱う。

2026-10-18追加: 利用者の明示指示により、Skyは本人の選択・拒否・データ回収・乗換え・退出する力を増やし、Sky自体にも閉じ込めない方針とする。[本人主導・退出可能性の全体契約とSF01〜SF08](sky-tools-complete-design.md#sky-user-freedom)をSky Add、OS/Broker、SDK、独立Sky、契約終了へ適用する。設計保存とruntime受入は別で、汎用持出し・移行・退会後回収は未受入。

2026-10-18追加: Zoom等のアプリを操作中に欲しい機能をSky Agentで見つけ、Addし、同じ場所で成果を受け取るSky Add Momentを検討。[公式Zoom経路、試作、10時間調査、未受入条件](sky-tools-complete-design.md#sky-add-agent-ecosystem)を参照。ローカルパネル試作は実Zoom接続ではない。

2026-10-18利用者訂正: Zoom Appが未導入でも、Sky端末側AgentがOSの正式な画面操作権限を得てZoom UIへ入る経路を優先する。[Sky Add端末Agent経路](sky-tools-complete-design.md#sky-add-agent-ecosystem)が実行・承認・成果返却の正本。Zoom App内拡張は任意の深い連携経路であり、端末側実行部／OS許可なしの無導入介入は主張しない。

2026-10-18補足: Sky Add Pluginは、対象アプリで欲しい機能から対応Agentを探し、権限と出力先を確認してAddする体験を含む。Zoomの会議後処理は例で、実接続やアプリ内表示の受入ではない。[Sky Add設計](sky-tools-complete-design.md#sky-add-agent-ecosystem)。

2026-10-18訂正: avocadoProはAI専用PC。RockstarOSのSI Core／Sky／Zemaの仕事契約をPixel、avocadoMini、avocadoProで共通にし、機種別の確認済み能力で出力とlocal処理を変える。[共通CoreとPro AI専用PCのDevice Profile](device-support-architecture.md#shared-si-device-profiles)を入口とする。Pixel用GrapheneOS binaryの流用やPro hardware仕様・性能の確定を意味しない。

avocadoProの[外観モック20案](avocado-pro-mocks/README.md)は、NVIDIA GPUを意識した初回10案と、利用者が好む低い角丸アルミ筐体のStudio系10案。画像は部品選定、熱・電力・価格、NVIDIA供給、製造の合格ではない。

2026-10-18追加: Terminal/Linux・本人が選ぶローカルLLMの成果を型付きでSkyへ戻し、Skyを対応先にAgentをAddする共通層へ育てる。具体的なユーザーの悩みから作成・試験・審査・販売・収益照合までを[Sky全Tool設計](sky-tools-complete-design.md#sky-add-agent-ecosystem)、model導入と権限境界を[LLM設計](llm-evaluation-architecture.md#user-selectable-local-models)に記録。外部app・任意model・作者払出しは未受入。

2026-10-18更新: Pixel 10向けGrapheneOSベースの初期RockstarOSはCloud LLM、Sky Marketplace／Agent、Zema、任意Terminal/Linux、browserを中心にする。安全な起動・通信・権限・更新・復旧は残し、Game／Wallet収益面等は初期画面・初期imageの必須構成から外す。[残す／外す機能、速度の測り方、受入条件](device-support-architecture.md#graphene-si-minimal)。

版: 1.6 / 2026-10-18

2026-10-14追加: [avocado Companion（仮称）P0](avocado-schoolbag-safety-device.md)は、利用者が指定した吊り下げ・着脱・会話・SOSの小型RockstarOS hardware profile。二つの目、明示操作の音声session、保護者スマホ／Wi-Fi中継、取り外す本体の独立local alarmを設計する。R5の縮小版ではない。実機、安全規格、製造、販売は未受入。

avocadoMiniの現行製品要求は[R5統合基本設計](avocado-mini-r5/README.md)。使用時200mm以内・1本自律・別Hub不要を目指す基本設計で、全空間裸眼表示・最終ハードウェアは未成立/未確定。以下のE1/E2/E3、四方向発明台の資料は履歴または別研究profileとして読み、既存OS実装の受入と混同しない。

このページは、RockstarOS本体、画面、AI、Tool、Wallet、運用、avocadoMiniまで、全設計へ入る唯一の入口である。設計書が多いことを完成とは呼ばない。各systemについて、目的、利用者の操作、責任、入力、出力、状態、権限、保存、失敗、復旧、受入、現在地を説明できることを設計記載の最低条件とする。

## rocketstar 設計書完全版 R1.0と全履歴の保存

[rocketstar設計アーカイブ](rocketstar-design/README.md)を、ロケット、衛星搭載、帰還・回収、地上設備、整備・再使用の設計入口とする。[原本PDF](rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf)は44ページ・35章、60要求、18システムinterfaceを収録する。継承するC3の40設計項目・13衛星interface、旧版、A-LINK受信試作、コロニー運用、端末ボタン、生成元、計算、QA画像も[全ファイル台帳](rocketstar-design/inventory.json)から追跡できる。

利用者の「漏れなく更新保存」という明示依頼に基づく設計アーカイブであり、現行runtime、Tool catalog、サイトへ自動適用しない。ロケットの製造図面・実機性能・飛行認定は未完了。端末のE3／別Hub前提と電源ボタンモデルは当時の設計として保持し、R5の1本自律・別Hub不要という現行要求を変更しない。

## 2026-09-24 完全版 v1.0

[RockstarOS 設計書完全版 v1.0（原本PDF）](rockstaros-complete-design-v1.0.pdf)を、rocketstar、A-LINK、avokado、colonyをまたぐ最新の統合設計基準として保存した。GitHub上で全文検索できる[抽出テキスト](rockstaros-complete-design-v1.0.txt)と、原本SHA-256・ページ数・被覆件数を固定する[完全性記録](../data/rockstaros-complete-design-v1.0.json)を同じ変更で管理する。

完全版は32章、5配備profile、13論理service、OSR-001〜060、43/43の構造・DDL検査を収録する。ただし「完全」は設計の記載範囲を意味し、runtime実装、実機受入、飛行認定、量産承認を意味しない。PDFに記載された旧repo SHAの読取監査も、今回のGitHub最新状態確認へ読み替えない。

今回、[付録を含むOS package](rocketstar-design/outputs/RockstarOS_Complete_Design_v1_0/README.md)も受領した。既存PDFとpackage内PDFのSHA-256は一致し、原本を変更していない。7 schema、SQLite DDL、例、要求台帳、構造検査・再現記録、C0.1参照モデルを保存した。当初PDF単独では未受領だった付属原本の不足は、この受領記録で更新する。付録の検査証拠は運用/実機の完成証拠ではない。

原本PDF p4・17・30のavokado E3は4本＋別Hubを前提とする。OS共通運用・他profileの設計として原本を保持し、このE3配置をR5へ適用しない。R5単独mini用Device Profile・adapterとの統合は未完了。

## 最初に読む8冊

1. [RockstarOS 設計書完全版 v1.0](rockstaros-complete-design-v1.0.pdf) — rocketstar、A-LINK、avokado、colonyを含む2026-09-24統合基準。
2. [製品・サービス・システム関係図](rockstaros-product-system-map.md) — 製品、サービス、内部システム、`Mr.`、MR、収益の関係を一枚で確認する。
3. [RockstarOS全体詳細設計](rockstaros-complete-design.md) — repository実装と既存詳細資料への入口。
4. [Sky／Zema／全Tool詳細設計](sky-tools-complete-design.md) — Toolをどう追加し、12件をどう使い、どこで止めるか。
5. [avocadoMini R5 ハードウェア・OS統合基本設計](avocado-mini-r5/README.md) — 現行製品要求、51ページ、図面、計算、受入計画。既存[Material Invention研究仕様](rockstaros-avocado-mini-complete-design.md)は別profileとして保持する。
6. [製品ベース](product-baseline.md) — 利用者が確定したRQ01〜RQ49と、その後のTool追加判断。
7. [Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md) — code、Jev、Local Qwen、Cloud LLM、Codex、RAG、Market、Walletを一つの安全境界へ統合する設計。

8. [rocketstar 設計書完全版 R1.0と全付録](rocketstar-design/README.md) — 両段再使用ロケット、A-LINK、OS、コロニー、ボタンの設計原本と計算・検証履歴。

機械可読の被覆台帳は[`data/design-document-index.json`](../data/design-document-index.json)。`npm run design:check`は、利用可能・候補の全Toolが台帳と詳細設計に存在すること、正本へのlinkが存在すること、未決定を完成表示していないことを検査する。

2026-09-21追加: [avocadoMini Mini200 E1](avocado-mini-mini200-e1/README.md)は、使用時20cm・本体内ゲーム処理・日本語音声の新しい基本設計profile。本文、SVG図7枚、算術と入力許可モデルを保存した。従来の四方向研究契約、Pixel/QEMU、Web公開とは別で、実機・実ASR・OS統合は未受入。

同日の最新製品方針は[ゲームを入口に生活全体を豊かにするOS](avocado-mini-mini200-e1/game-first-life-connectivity.md)。ローカル自律動作、生活機器の同意、衛星を含む通信経路と切断復旧を分離し、既存Coreへ接続する設計案として保存する。衛星網の所有や直接受信、生活機器接続は未実装・未受入。

[Jev／TypeSafe + Local Qwen引き継ぎ原文](prompts/jev-typesafe-local-qwen-handoff-20260918.md)を要求の正本として保存し、その内容を[Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md)へ落とした。DecisionProvider契約と安全policyも機械可読化したが、Router／Harness、TypeSafe接続、Cloud接続、RAG runtimeが実装済みになったわけではない。

製品・サービス・システムの関係、`Mr.` 由来Toolの取り込み境界、MR（Mixed Reality）とMaterial Invention Coreの接続は、[製品・サービス・システム関係図](rockstaros-product-system-map.md)を正本補助設計として参照する。ここでいう`Mr.` は外部repository由来Tool、MRはavocadoMiniのMixed Reality操作を指し、同じものではない。

## 2026-10-18 RockstarOSサービスOS再設計

製品体験からruntimeまでの共通設計基準は[RockstarOS 1.0再設計](rockstaros-1.0-architecture.md#rockstaros-再設計一つの仕事を端末間で完了するサービスos)。SI（スーパーインテリジェンス）向けOSのHomeからクラウドLLM、Sky Marketplace、Zemaを直接使い、RQ01〜RQ49と既存の承認・安全境界を維持する。SIM/eSIM利用開始、Wallet/Usage、端末別client/native OSを一件の仕事の流れとして接続する。これは設計の統合であり、UI/runtime/実機/provider/公開の完了証拠ではない。

## 設計の全体地図

詳細な関係図は[製品・サービス・システム関係図](rockstaros-product-system-map.md)に分離している。以下は全体の責任方向だけを示す要約である。

```text
利用者
  ├─ Home ─ SkyでToolを探す ─ Zemaで仕事を進める
  ├─ Wallet / Market / Settings / Operations
  └─ avocadoMini / Material Invention
            │
            ▼
RockstarOS Platform Core
  ├─ ownerとcomponentのidentity
  ├─ capability・権限・本人承認
  ├─ work・step・event・artifact・receipt
  ├─ Local AI・Agent runtime
  ├─ Tool / MCP / Provider実行境界
  ├─ 保存・backup・復旧
  └─ update・rollback・監査・緊急保護
            │
            ▼
実行先
  ├─ 端末内
  ├─ 接続した本人PC
  ├─ Sky Cloud
  └─ 外部Provider
```

## 実装環境を混ぜない

| 環境              | 役割                                                          | 現在の到達点                               | 完成と呼ばないもの                         |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Web / PC          | 現在の製品画面、D1 API、PC Tool、MCP接続                      | 12 ready Toolと主要画面がある              | スマホOS、native sandbox、本番Provider     |
| Linux / QEMU      | native OS契約、署名Tool、更新・復旧、Wallet／Game fixture     | Developer Preview候補の限定受入            | Pixel対応、一般配布、本番鍵                |
| Android APK       | Broker、Shell、固定Tool、Local AI、backup、Operatorの事前検証 | emulatorと所有Pixelの試験署名APKで限定合格 | RockstarOS image、SELinux最終形、正式署名  |
| Pixel 10 OS image | 最初の物理RockstarOS対象                                      | sourceとbuild gateを設計・準備             | full build、flash、CTS/VTS、OTA、純正復旧  |
| avocadoMini       | Material Inventionの標準操作端末                              | 統合設計とsandbox Core                     | XR runtime、四方向実機、新材料、特許、量産 |

## 詳細設計の正本

| 領域                       | 説明の入口                                                                                                                                                         | 契約・機械可読正本                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 製品目的・要求             | [製品ベース](product-baseline.md)                                                                                                                                  | [`data/product-baseline.json`](../data/product-baseline.json)                                                                                      |
| 全体構成                   | [全体詳細設計](rockstaros-complete-design.md)                                                                                                                      | [`data/system-composition-audit.json`](../data/system-composition-audit.json)                                                                      |
| AIネイティブCore           | [AIネイティブOS共通設計](ai-native-os-architecture.md)・[Decision Fabric完成設計](jev-local-qwen-decision-fabric-design.md)                                        | [`contracts/local-ai-runtime.json`](../contracts/local-ai-runtime.json)・[`contracts/decision-provider.json`](../contracts/decision-provider.json) |
| Android / Pixel            | [Android production architecture](android-production-architecture.md)                                                                                              | [`data/android-release-architecture-policy.json`](../data/android-release-architecture-policy.json)                                                |
| Linux / QEMU               | [native OS統合](native-os-integration.md)                                                                                                                          | [`data/qemu-release-audit.json`](../data/qemu-release-audit.json)                                                                                  |
| Platform API               | [Platform Core](platform-core.md)                                                                                                                                  | [`contracts/platform-api.json`](../contracts/platform-api.json)                                                                                    |
| Sky / Zema / Tool          | [全Tool詳細設計](sky-tools-complete-design.md)・[Jev ecosystem設計](jev-ecosystem-integration-design.md)・[Jev Ultrafast設計](jev-ultrafast-integration-design.md) | `lib/catalog.ts`とTool Package契約                                                                                                                 |
| MCP                        | [MCP Connector](sky-mcp-connector.md)                                                                                                                              | `toolkits/sky-mcp-connector/registry.schema.json`                                                                                                  |
| 保存・DB                   | [保存境界](data-storage-boundaries.md)                                                                                                                             | `db/schema.ts`と各migration                                                                                                                        |
| Wallet / Provider          | [外部Provider境界](external-wallet-fund-provider-boundary-20260913.md)                                                                                             | Earning Receipt、Financial Provider実装                                                                                                            |
| Security / Operator        | [インシデント対応](security-incident-response.md)                                                                                                                  | [`data/device-emergency-access-policy.json`](../data/device-emergency-access-policy.json)                                                          |
| Update / Backup / Recovery | [backup・復旧](android-backup-recovery.md)                                                                                                                         | 各Android release policy JSON                                                                                                                      |
| Game / IP                  | [Game API](game-api-contract-draft.md)                                                                                                                             | GX00／GX01契約とSDK                                                                                                                                |
| Material Invention         | [見て分かる完成設計](rockstaros-avocado-mini-complete-design.md)・[Full-scaleハードウェア詳細設計](avocado-mini-hardware-design.md)                                  | 3つのMaterial JSON SchemaとXR policy                                                                                                               |
| 検証・release              | [release minimum gates](release-minimum-gates.md)                                                                                                                  | [`data/release-readiness.json`](../data/release-readiness.json)                                                                                    |

## 「詳細設計済み」の意味

次の11項目が書かれて初めて、その領域を詳細設計済みとする。

1. 誰の何の問題を解くか。
2. 利用者が最初から最後まで何をするか。
3. componentごとの責任と、持ってはいけない権限。
4. 入力・出力・識別子・版・上限。
5. 正常状態と異常状態の遷移。
6. 保存場所、保存しないもの、削除・保持・backup。
7. offline、通信断、再送、重複、結果不明の扱い。
8. 更新、互換、rollback、復旧。
9. 安全、privacy、security、外部作用の承認。
10. 合格条件と証拠環境。
11. 未決定事項、決定者、決定に必要な試験。

未決定があること自体は設計漏れではない。未決定を隠すこと、または決定方法がないことを設計漏れとする。

## 変更規則

- 新しいOS componentまたはToolを追加するときは、機械可読台帳と対応詳細設計を同じ変更で追加する。
- Web、QEMU、APK、OS image、実機、sandbox、本番を別の状態で記録する。
- 「動く」「対応」「安全」「完成」は、環境と証拠を併記しない限り使用しない。
- 日付付き調査資料を新しい入口にせず、このポータルの正本表から辿れるようにする。
- 実装と文書が違う場合は、実装を完成扱いせず差分を進捗taskへ登録する。

## 現実とGTAの橋渡し

2026-10-09の明示製品要件は[現実とGTAをつなぐ出力仕様](gta-reality-bridge.md)。既存Game/IP・Sky adapter・Zemaの詳細化として、双方向の成果、承認、保存・復旧、段階受入を定義。設計保存のみで、GTA adapter実装・提携・実ゲーム受入は未完了。

2026-10-19の追加指示: PixelのSkyから既存Linuxを起動し、依頼・下書き確認・Android標準保存・停止を行う[本人用入口](sky-tools-complete-design.md#sky-private-linux-deployment)。固定localhost契約と公開Launcherを使い、一般公開は保留。[実機証拠](evidence/sky-pixel-linux-entry.json)で旧ブラウザ経路と分けて受け入れる。

## 独立調査からの開発入口

[現要件との照合・不足・実装順](rockstaros-research-integration.md)。RQ49件＋追加38件を機械可読台帳で追跡する。840分草稿の研究仮説、現在のsource、local受入、実機/Provider/本番を区別する。
## 人が増えるほど、使える解決方法が増える仕組み

Eveで作成→本人が共有→smisからAdd→別本人が実用→改善版の共有、という[ネットワーク効果の共通設計](rockstaros-complete-design.md#smis-network-effects)を追加。既存共有を再利用し、個人Agent配布/由来/成果との接続を次に開発する。現在は設計で、実成長/作者支払いは未受入。


## Miniの範囲全体を操作するOS

[空間コンピュータOS実現設計書](avocado-mini-r5/spatial-computer-use-design.md)から、範囲・物理構成・光学・OS/app操作・計算・工場引渡しへ進める。
