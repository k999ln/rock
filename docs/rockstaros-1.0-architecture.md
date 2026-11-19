## OS内の統一を先に行う（2026-10-22本人訂正）

端末ごとの会話/担当/仕事/成果/料金/停止を増やさず、RockstarOS共通Coreと同じ既存store/workflowに統合する。[11項目の正本](rockstaros-complete-design.md#os-unified-interaction)。前段のMini音声は共通Core/画面と旧Pixel接続adapterへ分離し、native/account/runtimeの同じjobへの結合を次に行う。機種別には実入出力/電源/driverを実装し、一般ローンチ保留と既存データ保全を維持する。Core抽出だけで全経路/全実機の統合済みとはしない。

## 現行名smisと接続対象（2026-10-22）

本人の明示指示でSkyの表示名を **smis** に改める。RockstarOSの中にsmis・Eve・Linuxを置く階層を維持し、Eveで皆の困りごとからAgentを作り、smisは無機物・有機物を問わず、対象と実能力を結ぶことを目標とする。既存経路/SDK/schema/保存の`sky`識別子は互換用に保持する。現在の作成/保存/能力照合はソフトウェアの試作であり、実部品/生体接続・全対象への対応・一般公開の合格ではない。[詳細正本](sky-tools-complete-design.md#sky-object-attachment)。

## 最新の標準提供：既存OSへ共通RockstarOS環境を接続する

商品の意味は、通信容量を売るeSIMではなく、自分用のcloud Linux・LLM・Agentが追加されるservice profile。携帯の圏外/電源OFF後も、executorが受領済みの仕事を本人承認済みの権限・予算・期限内で進める。LLMがlocalなのは配置先Linuxに対してで、全iPhone内へのmodel搭載を意味しない。PCの前に立たない制作、携帯を持たないやり取り、実利用/検収/収納に基づくRun to Earnを同じ仕事/成果へつなぐ。実行Linuxまで外部通信断なら、導入済みmodelの自己完結処理と、外部作用の待機/再照合を区別する。

2026-10-20の本人追加指示「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」により、標準商品は、eSIM導入から本人専用の共通RockstarOS環境を準備し、既存OSの端末へ接続する方式とする。RockstarOSの中のSky・Eve・管理Linux・OS Coreを共用し、端末ごとの差は能力契約と薄い入出力adapterで扱う。eSIM非対応機器は本人承認した子接続で同じ契約へ追加する。GrapheneOS forkや機種別OS imageは追加のnative系列であり、標準利用開始の前提にはしない。

[発明する起動・接続protocol、アルゴリズム、状態、責任と受入条件](sim-led-product-architecture.md#esim-service-attachment)と[機械可読案](../contracts/rockstar-service-attachment.json)を現在の詳細とする。eSIM側アプレットは対応発行元と端末での研究対象。iPhoneの完全無操作起動、同意なしのapp導入、全hardwareの全機能は未実装・未受入であり、手動Web起動へ希望を縮小して完成扱いにしない。従来のnative優先説明はその追加系列に限って読む。RQ01〜RQ49、月16ドルの枠付き契約、本人権限/費用上限/持出しを保持する。

## 現行の大元：RockstarOSの中にSky・Eve・Linux

2026-10-20の本人指示「osが大元」「osの中にskyもeveも」「osの中にlinux」に従い、製品全体の大元は**RockstarOS**とする。OSの中に、能力の登録・追加・接続を担う**Sky**、会話・依頼・計画確認・承認・進捗/停止・成果・利用額のSI窓口である**Eve**、対応するmodel/Agent/Toolを処理する**Linux実行環境**を置く。本人・eSIMサービス利用権・権限・予算・保存/復旧・利用量/請求はOSの共通管理へ結び、Sky/Eve/modelへOS権限を移さない。

利用の流れは、Eveへの依頼→Skyで登録/追加した能力の選択→OSによる本人/利用権/権限/予算の確認→対応Linuxで実行→共通の仕事/成果/使用量→Eveで確認。Skyから機能を選んでEveへ渡す入口も同じOS内にある。TerminalはLinuxを直接扱う任意の操作口で、日常の依頼はEveから行える体験を目指す。管理Linuxをcloudに置く場合はRockstarOS内部の実行環境として扱い、外部LLM/providerだけを対応adapter先として区別する。全model本体を端末内へ格納する意味ではない。

Pixel版はGrapheneOS/Android上の対応Linux guestを使う方針、Mini/Proは機種別のLinux/runtime適合で決め、Pixel用binaryを転用しない。既存のLinux計量・LLM・権限・保存コードを再利用する。これは前の「Skyを全体の大元」とする説明を利用者が訂正した設計階層の修正であり、全OS image・全機種・全Cloud/使用量統合の完成宣言ではない。月額16ドルの枠付き共通契約、Eveへの呼称統合、保存済みデータと既存IDを引き継ぐ。

## 正式名称：Eve（イヴ、旧称Zema）

2026-10-20、利用者の明示指示「zemaじゃなくてeveにしよadamとeveのeve」により、仕事・会話・進捗・承認・停止・成果・使用額を扱う製品の表示名を **Eve** に変更する。名前の由来はAdamとEveのEve。既存のSky、Jennifer、月額16ドルと利用枠、本人承認・保存・復旧の業務契約を引き継ぐ。文中の旧称Zemaは同じ製品の過去名として読む。

既存の`/chat`、`zema`利用権scope、保存キー、`sky-zema-core` package、公開済みの関数/schema/ファイル識別子は互換性のため保持する。名称変更で既存の会話/仕事/成果を消したり、新規サービス契約/追加課金を開始しない。過去の受入証拠・配布物の名称とhashは当時の記録として保持する。Web sourceの表示・名乗りと、Android APK/OS image・公開環境への反映は別に受け入れる。

<a id="sky-foundation"></a>
## 現行の製品階層：RockstarOS → Sky・Eve・Linux実行環境

2026-10-20の本人訂正により、RockstarOSを製品全体の大元とし、Sky・Eve・Linux実行環境をその内側へ配置する。Skyは能力の登録/追加/接続、EveはSIの依頼/仕事/成果/利用額の窓口、Linuxは対応する処理の実行環境。OSの本人/権限/利用権/予算/保存/復旧を共通に使う。2026-10-18にSkyを全体の大元と記した説明は、この現行方針で訂正する。Web/clientによる利用経路と本人の退出/移行は維持する。

既存Platform Core/Brokerと本人承認、利用権/予算、型付き成果、DB/復旧を再利用する。この階層訂正はOS権限をmodelへ委ねる変更でも、全hardwareへの搭載済み宣言でもない。SIM/eSIMの導入/利用権、RQ01〜RQ49、料金、Provider/Pixel/QEMU/Mini/Proの受入は維持する。[共通契約の11項目とZoom/Planner実装](sky-tools-complete-design.md#sky-foundation)。一般公開は保留。

# RockstarOS 1.0 — ベース構成と進化方針

2026-10-18訂正: Pixel、avocadoMini、**AI専用PCのavocadoPro**は同じSI Core、Sky／Zema、owner・job・承認・費用・成果・復旧契約を使う製品系列とする。Mini／ProにもRockstarOSのnative実行面を作ることを目標にし、boot・更新・入力／出力・local推論は各hardwareのDSP／runtimeで実装する。PixelのGrapheneOS／AVF imageを流用できる前提にはしない。Mini R5は現行hardware受入待ち、ProはAI専用PCという用途のみ確定し、本体・OS・model仕様と実測は未確定。nativeと表示するのは対象機器で同一imageの起動・更新・復旧を受け入れた後に限る。[詳細契約](device-support-architecture.md#shared-si-device-profiles)。

2026-10-18最新のnative SI版方針: Pixel 10 GL066／`frankel`向けGrapheneOS基盤のRockstarOSは、対応eSIMの申込・導入、本人/端末への利用権結合を標準入口とする。契約で定めたservice activationから基本月額が始まり、対象Cloud LLMの月間規定token枠を含める。追加の有料LLM/Agentは本人が価格・上限を承認した実usageだけ月末請求する。Linux/AVF内の本人選択ローカルLLMは管理launcherから使う候補で、Cloud token請求とは分離する。検証済みeSIM契約終了時はRockstar管理サービスの新規実行を止め、OSの基本電話/緊急機能、請求/再開、成果回収を残す。圏外の即時失効は保証せず、期限付きoffline leaseを設計・試験する。下記の「初回有償利用」起算は旧Managed Service候補の履歴で、このnative SI基本月額には適用しない。Sky単独Web/PWAと物理SIM offerは別提供形態として維持する。[導入/失効](sim-led-product-architecture.md#esim-si-subscription)、[料金](sky-billing.md#esim-si-plan)。実eSIM、正式image、本番請求、Linux adapterは未受入。

2026-10-02現行製品方向: 主商品は複数チャネルで購入する物理SIM/eSIM offerにRockstarOS service accessを含み、cloud LLM/Agent、Sky、Zemaを短い導線で提供するサービスである。通信activation、service claim、account identity、device install、cloud execution、AI billingは独立した状態として扱う。OS binaryをSIM/eUICCへ保存する前提は置かない。端末に適合する署名済みOS導入が正式に受け入れられた機種だけnative OSを案内し、他機種は既存OS上のapp/browser clientを使う。端末内LLM・offline agent・Pixel/QEMU/native OSは対応端末向け能力と独立したengineering acceptance trackとして維持する。cloud AIの選ばれる理由は高速で簡単な利用、透明な利用量課金、Sky/Zema統合である。有料Cloud taskは事前単価・見積・明示budget承認・task capを要求し、上限超過時は再承認まで停止する。Provider実費は運用者管理trust inventoryの署名receiptと照合する。Android trust-key build propertyの空既定はfail-closedで、未契約Providerを有料実行可能にしない。詳細なservice architectureとonboardingは[SIM/eSIM-led product architecture](sim-led-product-architecture.md)、製品要件は[現行製品ベース](product-baseline.md)、claim実装は[SIM/eSIM entitlement設計](sim-service-entitlement-claims.md)、OS共通設計は[AIネイティブOS共通設計](ai-native-os-architecture.md)を正本とする。

本書のLinux/QEMU資産一覧は再利用対象であり、スマートフォンの全機能実装済み、契約済みservice access、物理SIM/eSIMの販売・開通、実機OS導入を意味しない。

RockstarOS 1.0は、現在の検証済み範囲を最初の製品ベースとして発表し、互換性を保ちながら改善するための名称である。現在のスマホOS開発主軸はPixel 10／GL066／`frankel`で、QEMU Developer Previewは独立した配布候補として維持する。1.0という製品版番号を、実機対応・本番金融・一般公開の合格証明に使わない。

2026-10-18の利用者指定による初期Pixel体験は、Cloud LLM、Sky Marketplace／Agent、Zema、任意のTerminal/Linux、汎用browserを中心にする。Homeを依頼・Agent発見・仕事へ絞り、Game／Wallet収益面等は初期画面／初期imageの必須搭載から外す。費用予約・usage等のCore契約と既存応用トラックは維持する。Android／GrapheneOSの起動、通信、権限、Vanadium/WebView、署名更新、backup／復旧は残す。[残す／外す構成と速度・実機受入](device-support-architecture.md#graphene-si-minimal)。

利用者の8原則に基づく対象仮説、代表商品、system間の利用体験、開発優先順位、販売と検証は [製品・事業・開発設計](rockstaros-1.0-strategy.md) を参照する。本書は技術基盤を維持し、新しい設計を実装済みと扱わない。

## 全体構造

2026-09-16更新: 本文のnative構成はLinux/QEMU版のもの。スマホ版は所有Pixel 10／GL066／`frankel`を最初の物理対象へ確定し、機種構成・Android接続層へ移植する。端末OS build／起動は未実施で、Linux版の受入を流用しない。[全体構成監査](system-composition.md)／[現在の区分](current-state-20260911.md)／[スマホ版](phone-preview-20260911.md)。

以下はLinux/QEMU資産の構造である。利用者はnative UIからHub、Wallet、Game、端末操作を行い、Platformが認証、権限、実行、保存、外部接続を仲介する。OS本体は読取専用、利用者データは別diskへ保存し、A/B slotとbackupで復旧する。Androidの現行到達設計は共通設計のCore→Sky/Zema→応用の責任分離に従う。Game契約のhost実装と、個々の配布imageに搭載された範囲を混同しない。

## RockstarOS 再設計：一つの仕事を端末間で完了するサービスOS

これは新しいRQやruntimeの完成宣言ではなく、既存RQ01〜RQ49・承認済みv1.1・2026-10-02のSIM/eSIM主商品方針を一つの利用体験へまとめ直す設計基準である。中心を「OSの機能一覧」から「本人が一つの仕事を始め、費用と権限を確認し、結果を受け取り、別端末から同じ状態へ戻れること」へ置く。SIM/eSIMは利用開始の入口、Skyを共通基盤、Zemaを依頼から成果までの仕事面、RockstarOS CoreをSkyの共通契約を端末の権限・実行・保存・復旧へ一体化するruntimeとする。

2026-10-18の明示補足により、**SIはスーパーインテリジェンス**を意味する。OSの主目的はクラウドLLMとSky Agentを使うことであり、Home内にクラウドLLMの依頼入口、Sky Marketplace、Zemaの仕事面を第一者画面として統合する。SIM/eSIMは利用権を得る経路であってSIの意味ではない。単体Sky Web/PWAも同じ業務契約で提供する。初期画面はこの縦断導線を優先し、Wallet/Game等は必要時に開ける応用面として残す。これは既存RQ18の基本アプリの廃止を意味しない。

同日の請求方針では、月末後払い形態の商材を契約account単位のSI Managed Serviceとして検討する。本人/支払責任者の契約・料金・上限・支払方法への明示同意後、初回有償OS/Sky利用を請求起算にする。毎月の検証済みAgent/LLM usageを別明細でまとめ、既存OS月額を維持する。SIM/eSIM claimと無料閲覧は後払い開始と分離する。cap/与信、Provider invoice、未払い時の有料実行制限は[請求設計](sky-billing.md#rockstaros-siサービス契約と月末請求の商材案2026-10-18)に従う。米国内法人pilotは仮説であり、販売・実請求・端末付きプランの受入ではない。

### 利用者に見える構造

```text
利用開始 → HomeでクラウドLLMへ依頼 → Sky MarketplaceでAgent/Toolを選ぶ
                         → Zemaで見積・承認・実行・停止・成果を管理
                         → Wallet/Usageで予約・使用額・明細を確認
```

- **利用開始**: 購入、通信開通、Rockstar利用権、アカウント、端末適合、OS/client導入を別状態として確認する。SIM/eSIMが有効でも、利用権や端末対応を推定しない。
- **Home**: クラウドLLMへの依頼、Sky Marketplace、Zemaの現在の仕事を主導線として置き、直近の仕事、次に必要な本人操作、接続/端末状態を見せる。会話AIの提案を実行可能な権限として表示せず、空の状態では実行中Agentを装わない。
- **Sky**: OS内MarketplaceでAgent/Toolの発見、購入・利用権、接続、scope、実行先、対応状況を確認する。登録・購入・接続・実行を別操作にし、単体Web/PWA版とも同じcatalogと本人状態を共有する。
- **Zema**: OS内の仕事面で一つのjob IDとrevisionのもと、依頼、入力不足、計画、見積、承認、実行、停止、結果確認、再開を扱う。Web、Android、native OSを移っても同じjobの結果と状態へ戻る。
- **Wallet/Usage**: 通信料金、service access、AI/provider使用、商品購入、実費、検証済み収益を分ける。実行前は単価/見積/予算上限、実行中は予約と報告額、実行後はitemized usageと請求/精算状態を表示する。
- **端末と設定**: 使える能力、保存先、同期時刻、backup/recovery、更新状態、privacy/permissionを実状態に基づいて案内する。正確な機種・署名済みOS・boot/復旧経路が受入済みの時だけnative OS導入を提示し、それ以外はclient/browserへ分岐する。

Pixel向けGrapheneOS基盤ではSIの主操作をnative画面から短く開けるようにし、browser/WebViewは互換性を保って残す。遅さは同じ端末・回線・仕事で起動時間、操作反応、結果表示を計測し、WebView、画面処理、通信、Provider待ちを分けて改善する。Terminal/Linuxは対応端末の任意の開発・隔離Tool環境であり、Android本体のrootや共通Agent実行権限へつながない。

### 共通job lifecycleと表示契約

各画面は個別の「AI実行状態」を作らず、既存のworkflow/job/receiptを読む。同一jobでは `draft → needs_input → estimated → awaiting_approval → queued → running → stop_requested → review → completed` を基本表示とし、`failed`、`unknown`、`cancelled`、`expired` を独立した終端/復旧状態として表す。導入先がこの段階の一部を実装していない場合は、利用可能と見せず、そこで止まる理由と再開条件を示す。

全ての承認画面は対象、送信先、変更、実行場所、使用するAgent/Tool/modelの版、見積と上限、期限を固定する。未確定応答は同じIDで照合し、結果不明の再実行や二重課金を避ける。明示停止後は新規stepを開始せず、provider停止確認が取れるまでは「停止済み」と表示しない。offlineでは保存済み状態・結果を読めるようにし、未送信の下書きと実行中jobを区別する。

### runtime責任と製品境界

RockstarOS Coreはidentity、entitlement、capability/policy、Broker、job/workflow、artifact/receipt、budget/usage、device adapter、backup/update/recoveryを統合する。ただし画面、OS image、SIM/eSIM profile、LLM、Tool、Provider、Walletを単一の信頼主体にはしない。LLMはplan候補、Skyは接続catalog、Zemaはjob orchestration、Walletは金額状態を扱い、Coreだけが許可・本人承認・Tool成功・精算照合を検証する。各device profileは同じ業務契約とfixtureを共有し、実装済み範囲と証拠レベルを個別に報告する。

### 優先順位と受入

設計上の第一縦断シナリオは、同一ownerがservice-only経路またはSIM/eSIM利用権をclaimし、非対応端末ではbrowser/clientを選び、Skyから接続済みAgentを選択、Zemaで見積・上限承認後に一件のjobを開始し、別client/再起動後に同じjobの停止・成果・usageを照合すること。carrier、Provider課金、Pixel全OS build/flash、QEMU配布はそれぞれ独立gateであり、この製品縦断シナリオの合成成功から実受入へ昇格させない。次の実装優先は、既存SIM/eSIM onboardingとSky/Zema/usageの状態連携、再起動・端末間readback、failure/stop/recovery導線、実利用者の操作時間・再試行・完了率の測定とする。

未決定の価格、販売者/キャリア、初期対応端末、Provider契約、保存地域/保持期間、同一jobのclient競合時の操作表示はRQやcontractを確認し、証拠と責任者を揃えて決める。ここで設計を統合しただけではUI変更、端末実装、SIM販売、provider接続、実課金、公開または受入完了とはしない。

## 1. Boot・OS image

現在はBuildrootとLinuxでARM64 QEMU virt向けのkernel、rootfs、stage0 initramfsを作る。OS本体と書込み可能dataを分離し、専用UIDのserviceをinitが起動する。ネットワークなしでも基本操作と保存を維持する。

進化余地は、機種別hardware profile、実driver、secure boot、hardware anti-rollback、disk暗号化、suspend、充電・熱管理、recovery partition、再現可能buildである。

## 2. Native UI

C、Cairo、FreeTypeでframebufferへ直接描画し、evdev入力を読む。既定は720×960。Hubの商品一覧、導入、実行、履歴、Wallet、ATM simulator、remote状態、電源操作をPlatformのsnapshotから表示する。rootではなくUI専用UIDで動く。

進化余地は、touch/keyboard別操作、accessibility、多言語、GPU/compositor、画面サイズ別layout、初回案内、障害復旧画面、利用者テストに基づく操作削減である。

## 3. Platform Core

UIと各serviceの境界となるlocal IPCを持つ。呼出し元UID、入力上限、operation、receipt、状態遷移を検査し、Hub、Wallet、Registry、Runner、電源等を直接UIへ公開しない。状態はSQLiteと保護fileへ保存する。

進化余地は、明示的capability model、serviceごとのversion negotiation、全体quota、監査export、障害serviceの部分再起動、device policyの集中管理である。

## 4. Hub・Tool package

ToolをOSへ直書きせず、署名manifestと有限recipeを持つ独立商品として扱う。install、update、disable、rollback、uninstall、実行、履歴を商品単位で管理する。同じidempotency keyの再送は同じreceiptを返し、内容変更を拒否する。

進化余地は、一般plugin runtime、複数runtime、依存関係、差分更新、publisher審査、権限差分表示、評価・発見、法人配布、長期互換policyである。

## 5. Registry

認証付きTLSで作者のpublish/revokeを受け、端末へ署名catalogとimmutable packageを配る。端末はCA、署名、hash、期限、revision、失効を検査し、失敗時に検証済みcacheを破壊しない。現在の鍵とtokenは公開fixtureである。

進化余地は、本番publisher identity、HSM管理鍵、透明性log、段階配信、mirror、offline失効bundle、緊急停止、package reviewとSBOMである。

## 6. Runner・実行先

端末内Toolはbubblewrap/seccomp、専用UID、入力・CPU・memory・出力制限で隔離する。cloudは固定TLS fixture、pc_usbは認証付きUnix socket fixtureで検証している。requestとresultをreceiptで結び、応答不明時の無条件再実行を避ける。

進化余地は、実USB transport、公開cloud provider、self-host、非同期workflow、WASM等の追加runtime、cgroup quota、offline queue、実行先の費用・遅延・privacy比較である。

## 7. Wallet・本人資格

Linux/QEMU資産は整数USD centsのSQLite台帳でAVAILABLE、hold、費用、請求、売上、settlement、receiptを管理する。本人確認と同一ownerの複数端末重複防止を持つ。月888 cents固定の試作契約は履歴であり、現行RQ20は検証済み収益の実費後残額から月最大888 cents、先払い・未達債務化なしとする。GX00 runtimeはowner契約ごとに台帳を分離し、認証principalからだけ対象contractを選ぶ。

Wallet会社とファンド会社の機能は交換可能な外部Provider Adapterで受ける。RockstarOSはcapability発見、本人同意、指図、状態、receipt、照合を共通化し、資金保管、運用、約定、払出し、KYC/AML、地域・税務判断を代行しない。Providerはversion付きmanifestで対応機能だけを宣言し、OSは未宣言機能を擬似実装しない。Providerの追加・差替えは通常OS再buildを必要とせず、二次事業者が参加できる境界を維持する。[外部Provider境界](external-wallet-fund-provider-boundary-20260913.md)。

最初のProviderは `org.rockstar.settlement-wallet` とし、署名検証済み収益から確定したRock利用料の回収指図と報告だけをsandboxで実装する。Rockの内製Providerも共通adapterを通り、利用者資産の包括保管、任意送金、交換、ファンド運用、LIVE transferは持たない。[First-party Settlement Wallet](rock-first-party-settlement-wallet-20260913.md)。

Web版の最初の本番受取レールはBase Mainnet / USDCとする。本人限定Siteから外部EIP-1193 Walletを接続し、期限付き所有署名でRock受取先を固定する。Billing Workerは署名済みEarning Receiptの `SKY_SERVICE_FEE` だけを回収指図へ変換し、公式USDC contract、exactな受取先・金額、成功receipt、finalized blockをD1へ照合する。秘密鍵、利用者資産、自動送金は保持しない。owner署名と最初の実transferは別の本人操作gateである。[本番受取レール](rock-wallet-production-rail-20260913.md)。

進化余地は、本番identity/passkey、暗号化、複数通貨、Provider sandbox照合、実売上、出金、返金・dispute、監査statement、custodyを持たない構成の受入である。

## 8. ATM

現在はcardless ATM simulator。短時間code、Wallet hold、別ATM actor、redeem、partial/final reconciliation、不明状態を扱い、RockのATM手数料は0。現金払出し、実ATM、KYC、provider settlementは行わない。

進化余地は、正式ATM/provider adapter、端末attestation、現金単位、KYC/AML、地域別規制、provider実費表示、障害時の資金解放手順である。

## 9. Service Access・MCP

所有するRegistry、Runner、Wallet、MCP serviceを一つのauthorityとして起動し、端末資格と同意に結び付ける。MCP brokerはHTTP接続、tools/list、tools/call、期限、再送、receipt、再起動後の状態を管理する。現在はowned fixture中心である。

進化余地は、一般MCP server、OAuth、SSE/Streamable HTTP相互運用、provider別scope、rate limit、資格失効、複数組織、public endpointの防御である。

## 10. AI Routes

local、cloud、PCを別の処理先として扱い、許可、送信データ、予算、実行結果を分離する。Linux/QEMUのAI routeはpolicy/合成accounting fixtureの受入範囲。Androidは固定Local AI API v2と実GGUFによる機内モードplanをPixel単体APKで確認済みだが、汎用runtime交換、model比較benchmark、OS image受入は未完了である。

次はmodel/runtime manifest、旧jobのprofile固定、互換切替とrollback、品質・遅延・電池・熱予算を受け入れる。外部fallbackは独立した本人同意を通す。詳細は共通設計第2節を参照する。

## 11. Update・起動復旧

A/B slot、署名bundle、stage0、起動health、mark-good、失敗rollbackを持つ。UIのfresh challenge、PID/UID/executable、socket、描画loopを確認して起動済みを判断する。固定data ABIを使い、未知の移行を安全と仮定しない。

進化余地は、正式署名chain、hardware rollback index、差分OTA、段階展開、data migration engine、互換reader、自動回復の上限、長期保守channelである。

## 12. Backup・current copy

停止済みのclean filesystemをhash付きでbackupし、復元前後の台帳・結果・receiptを照合する。lifetime lockとcurrent-copy証拠により、元と復元先を同時に支出可能なwriterにしない。GX00では既存game接続状態の管理引継ぎも行う。

進化余地は、暗号化backup、off-device保管、鍵回復、世代管理、選択復元、別host移行、災害復旧、authority側との再照合である。

## 13. Operations・電源

診断、activation、service状態、版、停止、通常shutdown/reboot、異常時の観測を利用者機能から分離する。任意root shellを共通APIにしない。電源requestは永続receiptとat-most-once dispatchを使う。

進化余地は、fleet管理、privacyを守るtelemetry、crash report、段階的失効、remote support、incident response、SLAと保守担当の明確化である。

## 14. Game接続・交換

Wallet owner、端末、作者、game、playerを別IDにし、署名契約と本人同意で接続する。認証TLS、複数owner/game分離、current-copy引継ぎに加え、GX01の合成quote・予約・両台帳・返金／照合、native UI、DX01のSDK・サンプルを実装し、限定受入を記録した。正式ゲームGX02、実資金、Androidへの移植は未完了。[契約／SDKと実OSの確認範囲](rc2-remaining-acceptance-20260911.md)。

進化余地は、正式ゲームのsandbox、複数engine adapter、公式ゲーム接続、スマホでの同じ契約・利用体験の検証である。

## 15. Desktop導入

以前のMac launcherは既存Lima VMと固定imageを使う方式だった。現在は専用VM作成・image検証・起動・保存・再開・backup／復旧・削除のDeveloper Preview導入処理があり、b7/rc2でfresh導入と同一VM中断復旧を内部確認した。受入はmacOS 15.7.4／Apple Silicon／Lima 2.2.0の範囲。正式署名・一般公開と他host対応は未完了。[導入手順](preview-installation-ja.md)／[受入](os-acceptance-b7d819c-20260911.md)。

進化余地は、正式署名release、対応hostの拡大、仮想化backend選択、自動update、保存データのある端末での追加削除受入、診断bundleである。

## 16. Web・Android P1・スマホOS

WebにはSky、Zema、仕事作成・実行・確認、本人別手入力会計、Rock受取Walletの所有署名と着金照合があり、Sitesの公開範囲はowner限定を維持する。AndroidはBroker／Shell／Toolに分離し、Local AIとOperator Agentも別APKにする。GL066向けsource/build入口、native Sky selection、Zema計画、固定2工程、合成Wallet、実再起動、backup非破壊exportは[既存OS上の試験署名APKで受入済み](evidence/android-pixel-10-prefull-physical-20260916.json)。一般Tool registry、多端末Sky、GameのAndroid接続、外部Provider、OS全体build/正式署名/flash/OTA/鍵喪失復旧は未完了。WebやAPKの成功をスマホOSの合格にしない。

進化余地は、companion app、device enrollment、通知、遠隔確認、Web管理、正式AOSP device portである。

## 17. Material Invention／avocadoMini

avocadoMiniは、RockstarOS上で物質digital twinを手で接続・分離し、新しい材料・用途・工程の候補を考える標準製品体験である。north／east／south／westの四方向sensorで中央の操作空間を捉え、Material Invention Coreが候補graph、安全制約、工程、根拠、版を管理する。VR／AR headsetがなくても同じ仕事を2D画面で完了できる。

現在は、二物質・複数比率・工程条件から再現可能な候補を作る装置非接続sandbox Coreと、XR、四方向sensor、Patent AIまでの統合設計がある。決定的なscene projection、合成pose、四方向sensor実機、simulation Provider、Patent AI bridge、外部ラボは未実装または未受入である。cameraやgestureは実物を動かさず、物理実験、外部共有、出願を承認しない。simulationは実測、Patent AIは法律判断の代わりにならない。

全体像、用語、利用体験、安全境界、役割別の参加入口、実装順、合格条件は[共有用完成設計書](rockstaros-avocado-mini-complete-design.md)、担当作業は[Material Invention / avocadoMini workstream](workstreams/11-material-invention-avocado-mini.md)を参照する。

## 1.0で発表する範囲

1.0 Coreは端末内LLM、offline agent、権限・仕事・成果・停止・保存・復旧を持つOS基盤として受入する。Sky/Zemaを最初の利用経路とし、便利Tool、Material Invention／avocadoMini、Game/IP、実収益/Wallet、Fundは独立した応用受入に分ける。Material InventionやGameの開発をFund完成まで一律延期しない一方、それらの未完成をCore bootの失敗にもしない。Linux/QEMUの署名Tool・合成Wallet・Game SDK等は既存資産として維持するが、GL066 OS搭載済みと表示しない。最初の配布ラベルはDeveloper Previewとし、同一環境で合格した機能だけを実演する。
