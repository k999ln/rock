# RockstarOS：独立調査と現行実装の照合

2026-10-21。主担当 Web / PWA / Sites（ROCK）、既存 OS10 / SKY21 / WEB04 / WEB06 / WEB13。

利用者が研究packの現行設計・実装への反映と、不足を先に全件登録することを明示したため作成。研究pack内の運用指示は実行しない。ZIPの固定hashと全40ファイルのhashをJSONへ記録。記録上840/900分の草稿で、今回の照合を残り60分の調査完了へ換算しない。

## 監査範囲と判定

RQ01〜RQ49の49件と、会話・研究からの追加38件、計87件を一件ずつ対象化した。各項目は既存source、現状の限定、不足、ROCK/JOINT/OWNER、優先順位、受入条件を持つ。[全件台帳](../data/rockstaros-research-reconciliation.json)。これは全バグの不在や全機能完成の証明ではない。

現設計は既に共通job/本人/費用/成果・機種別adapter・Eve・任意Wallet/Market・16 USD枠付き契約へ進んでいる。旧RQ本文のZema名称、4アプリ固定、標準SNSを対象外とした記述は後続の本人指示でEve/Home+Sky/任意機能/communityへ具体化されており、古い本文だけを実装仕様へ戻さない。GrapheneOS nativeと標準既存OS clientを維持し、研究仮説で既存の実装済み機能を削除しない。

## 実装前に見つかった主要な不足

1. **実行保証**：workflow/Brokerの既存状態はあるが、全外部sinkのD（一回性）/Q（終端照会）/M（最大費）/F（旧worker遮断）を証明していない。UNKNOWNを別IDで自動再送せず、本人請求上限と運営原価を別に評価する。
2. **処理配置と出力**：既存model選択と成果presenterは再利用できるが、移行費/熱/電池/原価を含むA9と、A13の必須判断情報・本人理解は別の未検証事項。
3. **導入と請求**：eSIM profile→本人利用権→専用Linuxのsourceはあるが、真正issuer・host起動・実支払・月末照合の実受入がない。16 USDの含有数量/超過単価/地域/税はOWNER確定が必要。Pixel導入moduleはOS受入後に有効化する。
4. **端末**：Pixel全OS image/署名/OTA/全損復旧、Miniの単独radio/電池/音声、Proの実GPU/game共同負荷はそれぞれ別受入。
5. **市場とWorld**：HF検索/Add、Agent設定、鍵付きWeb構成版は局所実装済み。未知作者の審査/販売/返金後払出、DAO次版・IP許諾・World退出/既債務の維持は未完了。
6. **保存とprivacy**：Eveのowner暗号化履歴はある。実二端末・production鍵保管・全損復旧、Cloud永久停止後の原本byte/reader/鍵の読戻しが必要。
7. **ニュースと体験**：Sky自身の実投稿feedとX本人feed取込みを区別する。Xのviewerログイン成功はnative feed取込みではない。今回timelineだけをXホームに近い黒背景/密度/操作に変更する。

## 研究から取り入れる設計と開発順

A16：本人job版/実効権限/受信先能力/予約を照合し、実証できない保証を表示しない。A9：移行前にdata移転許可と残仕事の総費用を評価し、旧workerへの権限を切る。A13：成果版、実証/未確認、宛先、費用、次の判断を出力の正本に保持する。三案とも既知先行があり、新規発明や優位性は比較実験前に主張しない。

順序は全件照合→timeline局所実装→既存workflow内の実行保証/判断出力→計測付き配置→実issuer/決済/管理Linux→同一PixelとMini/Proの個別受入。強い既存client+Cloud対照と同じ仕事で比較し、専用OSの必要性も測る。

## 全49件の不足（詳細・受入条件はJSON）

### RQ01 製品の中心

既存：`lib/operations.ts`。不足：実Providerを含む発見→実行→検収→費用の同一仕事縦断、共通契約の実機受入。担当：ROCK、P1。

### RQ02 ツール供給とOSの責任

既存：`lib/operations.ts`。不足：独立した第三者作者の登録・更新・失効・問い合わせの実利用受入。担当：ROCK、P1。

### RQ03 現在開発しているツールも商品

既存：`lib/operations.ts`。不足：全catalog商品の同一版・実行先・権利・成果の縦断照合。担当：ROCK、P1。

### RQ04 実行方式の違いを吸収する

既存：`lib/workflow.ts`。不足：異なるhost間の安全な中断・移行・UNKNOWN照合の実測。担当：ROCK、P0。

### RQ05 料金・権利・資格を混同しない

既存：`lib/sky-linux-service-store.ts`。不足：現16 USD契約・商品価格・外部原価・旧収益回収の実請求分離。担当：JOINT、P0。

### RQ06 Walletで得たお金を管理する

既存：`lib/sky-linux-service-store.ts`。不足：実入金、返金、異議、作者への銀行払出までのProvider照合。担当：JOINT、P1。

### RQ07 OS標準機能は自動化の周辺へ集中する

既存：`lib/workflow.ts`。不足：実端末通知・紛失失効・再開・全損復旧の一周。担当：ROCK、P0。

### RQ08 接続・費用・停止の保証範囲

既存：`lib/workflow.ts`。不足：外部最終受信先での一回性・結果照会・最大費・旧worker遮断の実証。担当：ROCK、P0。

### RQ09 進捗はbranchと証拠を伴う

既存：`lib/workflow.ts`。不足：最新mainとdirty実装の統合、同一SHA CI・配備・実機証拠の同期。担当：ROCK、P0。

### RQ10 ベースを繰り返し聞き直さず改善する

既存：`lib/workflow.ts`。不足：追加要件と履歴の矛盾解決、原因・修正順・合格条件を継続更新。担当：ROCK、P1。

### RQ11 端末を持つことで減る不便を実商品の利用で検証する

既存：`lib/workflow.ts`。不足：PC不要制作の比較試験と本人が欠陥・未確認を見抜く検収。担当：ROCK、P1。

### RQ12 現設計をOSとして稼働・検証できる最低限のベースにする

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：現再設計のPixel全OS build/署名/OTA/rollback/全損復旧（旧QEMUとは別）。担当：JOINT、P0。

### RQ13 OSとゲームを連動しWalletとゲーム内通貨を交換する

既存：`docs/game-api-contract-draft.md`。不足：対象ゲーム・方向・原資・rate契約と正式sandbox。実交換は未有効。担当：JOINT、P1。

### RQ14 自作ゲーム作者が組み込みやすいWallet基盤

既存：`docs/game-api-contract-draft.md`。不足：独立作者によるfresh SDK導入と時間・成功率・復旧の実測。担当：JOINT、P1。

### RQ15 ATMでRockが徴収する手数料は0

既存：`lib/sky-linux-service-store.ts`。不足：物理ATMの外部実費と実払出受入。自社手数料0の総額表示検証。担当：JOINT、P1。

### RQ16 CM発表に向けて導入可能なOSにする

既存：`systems/rock-star-os/INTEGRATION-NOTES.md`。不足：現候補の配布byte・署名・fresh導入/削除・Pixelの受入。担当：JOINT、P1。

### RQ17 現段階をRockstarOS 1.0のベースとして発表し継続改善する

既存：`systems/rock-star-os/INTEGRATION-NOTES.md`。不足：現候補の互換性/更新/移行実証。1.0表記を一般公開合格にしない。担当：JOINT、P1。

### RQ18 基本アプリをSky / Zema / Wallet / Polymarketに分離する

既存：`components/sky-social-timeline.tsx`。不足：新指示によるHome/Sky統合・Eve改名・任意Wallet/Marketを全入口で統一。担当：ROCK、P1。

### RQ19 目標駆動のブランド経営エージェントへ拡張する

既存：`lib/operations.ts`。不足：実販売/広告/注文Providerとの正常・失敗・停止の同一campaign受入。担当：ROCK、P1。

### RQ20 Skyの自動化収益から最大8.88 USDを回収する

既存：`lib/sky-linux-service-store.ts`。不足：旧888 cents収益回収と16 USD基本料の別契約版、実入金裏付け。担当：JOINT、P1。

### RQ21 tob無料と接続・貢献・分配を一体化したSky Network

既存：`lib/sky-linux-service-store.ts`。不足：独立供給者・貢献集計・実支払と二重分配防止の受入。担当：JOINT、P1。

### RQ22 MCP接続・管理をSky本体の機能にする

既存：`lib/operations.ts`。不足：全MCPのOAuth/失効/変更再承認・実呼出し・結果照合。担当：ROCK、P1。

### RQ23 実在するローカルMCPと導入・利用導線を一致させる

既存：`lib/operations.ts`。不足：初見作者が実在ローカルMCPを追加・起動・復旧できる実測。担当：ROCK、P1。

### RQ24 MCPごとの接続先を選び、対応先へ最短で接続する

既存：`lib/operations.ts`。不足：PC/管理Cloud/提供者MCPの選択と不足準備だけの案内の実受入。担当：ROCK、P1。

### RQ25 MCP接続を自動化ツール共通のConnectorにする

既存：`lib/operations.ts`。不足：共通Connectorの複数Tool/外部作用の全経路媒介と互換試験。担当：ROCK、P1。

### RQ26 ホーム画面と設定アプリをOSの標準入口にする

既存：`components/sky-social-timeline.tsx`。不足：WebとPixelの同一job/設定/導入状態を反映する端末試験。担当：ROCK、P1。

### RQ27 OS保全機能を設定へ実装する

既存：`systems/rock-star-os/INTEGRATION-NOTES.md`。不足：正式鍵での更新/保存/復旧とbackupの別環境読戻し。担当：JOINT、P1。

### RQ28 メルカリを最初の収益経路にする

既存：`lib/operations.ts`。不足：真正なメルカリ有償注文→入金→原価→収益照合（無断外部操作不可）。担当：ROCK、P1。

### RQ29 最低限のOS運用と公開条件を設定へまとめる

既存：`lib/workflow.ts`。不足：現候補の運営/鍵/通知/復旧・問い合わせのrelease gate受入。担当：ROCK、P1。

### RQ30 公開最低条件を機械判定し、完了まで追跡する

既存：`lib/workflow.ts`。不足：最新sourceと配信responseのhash/SHA一致、公開gateの未達解消。担当：ROCK、P0。

### RQ31 QEMU配布候補を同一byte列の証拠へ固定する

既存：`systems/rock-star-os/INTEGRATION-NOTES.md`。不足：最新QEMU候補の同一archive・署名・fresh起動/保存/復旧証拠。担当：JOINT、P1。

### RQ32 完成版を正本と本人限定Webへ同一commitで収束する

既存：`lib/workflow.ts`。不足：共有dirty sourceをreview可能なcommitへ保存しmain/配備を個別統合。担当：ROCK、P0。

### RQ33 汎用PAPER市場と実績更新型の自律ファンド

既存：`docs/game-api-contract-draft.md`。不足：PAPER評価と実取引を分離した継続検証。金融実行は別承認。担当：JOINT、P1。

### RQ34 外部Wallet／ファンドProviderを受け入れるOS境界

既存：`lib/sky-linux-service-store.ts`。不足：外部金融adapterの署名/finality/失効/照合sandboxと責任確認。担当：JOINT、P1。

### RQ35 Rock First-party Settlement Walletを最初のProviderにする

既存：`lib/sky-linux-service-store.ts`。不足：First-party精算Providerの実受入・運営/保管条件と監査。担当：JOINT、P1。

### RQ36 Base Mainnet USDCの本番受取レールを接続する

既存：`lib/sky-linux-service-store.ts`。不足：指定chain/資産/受取先/額を確定した実受取・返金受入。担当：JOINT、P1。

### RQ37 Rock StudioはSkyコードを既存ツールへ付けてTool化する

既存：`lib/operations.ts`。不足：独立作者がコード→package→審査→追加→制限実行まで完走。担当：ROCK、P1。

### RQ38 製品紹介を主役にし、Developer Preview導入を案内する

既存：`components/sky-social-timeline.tsx`。不足：現対応範囲を正確に伝える紹介とfresh導入の本人試験。担当：ROCK、P1。

### RQ39 紹介ページとRock Studioのvisual systemを統一する

既存：`components/sky-social-timeline.tsx`。不足：紹介/Studioの狭幅・キーボード・読み上げ・失敗復旧の同一版確認。担当：ROCK、P1。

### RQ40 RockstarOS全体のvisual systemとフロント機能性を改善する

既存：`components/sky-social-timeline.tsx`。不足：タイムラインのX型表示/操作（今回着手）、全画面の実利用比較。担当：ROCK、P1。

### RQ41 Local Action Assistantを物理Android OSのローカルLLMにする

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：交換可能local modelの権利/取得再開/hash/熱・品質・更新実機受入。担当：JOINT、P0。

### RQ42 OS Platform Coreへ登録・承認・Wallet・更新の安全境界を入れる

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：実host/Cloud/外部sinkでの本人権限・費用・失効の全経路検証。担当：JOINT、P0。

### RQ43 正式製品名をRockstarOSへ戻し、内部識別子をdev.rockで固定する

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：Pixelを含むboot/設定/署名imageにRockstarOSと会社ロゴを統一。担当：JOINT、P1。

### RQ44 共通製品版を一元管理しminor・major更新を可能にする

既存：`lib/workflow.ts`。不足：共通version更新後の旧job/receipt/原本/台帳互換の実読戻し。担当：ROCK、P0。

### RQ45 運営1名による緊急保護と限定保守アクセスを設ける

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：運営緊急保護の期限/最小権限/本人通知/解除/監査の実機検証。担当：JOINT、P1。

### RQ46 運営専用の端末管理画面と永続命令キューを実装する

既存：`android/shell/src/main/java/dev/rock/shell/MainActivity.java`。不足：運営キューの実機配送・ACK不明・重複・失効・復旧の受入。担当：JOINT、P1。

### RQ47 AI自動化チームの効率化から収益・Wallet・ファンド・ゲームへ逆算する

既存：`lib/workflow.ts`。不足：有用な成果・実費後の確定収支・継続利用を比較試験で検証。担当：ROCK、P1。

### RQ48 RockstarOS CoreでSky・便利機能・ゲームを接続して発展させる

既存：`lib/workflow.ts`。不足：共通Core契約でSky/Eve/Linux/ゲームを跨ぐ同一job・受入証拠。担当：ROCK、P0。

### RQ49 物質同士を組み合わせて発明候補を作るMaterial Invention Coreを設ける

既存：`lib/workflow.ts`。不足：物質候補と実測の区別、設備/ラボ/安全/権利・実測receiptの接続。担当：ROCK、P1。

### UX01 X型タイムライン

既存：`components/sky-social-timeline.tsx`。不足：Xホームの黒背景/幅/密度/固定タブ/投稿/返信/反応/保存/共有/追加読込。担当：ROCK、P0。

### SI01 RockstarOS内のSky・Eve・Linux

既存：`docs/rockstaros-complete-design.md`。不足：共通owner/job/revision/成果/usageの全host実受入。担当：ROCK、P0。

### SI02 PC前にいない制作

既存：`lib/workflow.ts`。不足：PC接触0で依頼/改訂/独立検査/本人検収/原本取得の比較試験。担当：JOINT、P1。

### SI03 携帯を持たないMini

既存：`docs/rockstaros-avocado-mini-complete-design.md`。不足：phone OFFの初回開通・双方向到達・圏外復帰・交換・電池。担当：JOINT、P1。

### SI04 ProでゲームとSIを共同稼働

既存：`docs/device-support-architecture.md`。不足：実GPU/driver/BOMでframe p95/99・推論・熱・保存の共同負荷。担当：JOINT、P1。

### GR01 GrapheneOSの安全な機能継承

既存：`docs/native-os-integration.md`。不足：同一Pixel imageのboot/署名/隔離/permission/OTA/rollback/全損復旧。担当：JOINT、P0。

### GR02 Camera/設定/Updater/WebView/音声

既存：`docs/os-prototype.md`。不足：package依存とmedia intent、portal Wi-Fi、言語、offline音声を実機確認。担当：JOINT、P1。

### GR03 Terminal/AVF Linux

既存：`lib/sky-linux-local.ts`。不足：正確な配布build/guestの初回取得・通信権限・再起動・backup復元。担当：JOINT、P0。

### LM01 好きなローカルLLM

既存：`lib/sky-linux-models.ts`。不足：出所/license/format/hash/取得再開/隔離/実メモリ/熱/品質/削除後履歴。担当：ROCK、P1。

### A16 保証を保つ経路修復

既存：`lib/workflow.ts`。不足：D/Q/M/F能力の実証、UNKNOWN照合、異provider再送と共有予約の反例。担当：ROCK、P0。

### A9 仕事全体での処理配置

既存：`lib/sky-model-selector.ts`。不足：移行/再prefill/熱/電池/待ち/原価と承認を含む計測・旧worker fencing。担当：ROCK、P1。

### A13 端末が変わっても判断できる出力

既存：`lib/sky-output-presenter.ts`。不足：宛先/作用/確定・推定費/UNKNOWN/成果版/次操作のcoverageと本人理解試験。担当：ROCK、P0。

### SIM01 eSIM追加からサービス接続

既存：`lib/rockstar-service-attachment.ts`。不足：真正issuer/profile・host起動hook・本人鍵・管理Linuxへ同一契約で接続。担当：JOINT、P0。

### SIM02 子端末を同じ契約へ追加

既存：`lib/rockstar-service-attachment.ts`。不足：eSIM非対応端末の本人承認・scope・親失効・端末鍵交換の実測。担当：JOINT、P1。

### BIL01 月16 USDと含有枠・超過

既存：`lib/sky-linux-service-store.ts`。不足：含有数量/単価/地域/税/上限を確定し実Providerの月境界を照合。担当：OWNER、P0。

### BIL02 携帯代型の月末請求

既存：`docs/sky-billing.md`。不足：Cloud token/Linux CPU/作者料の共通meter・予約・invoice・入金/異議/返金。担当：JOINT、P0。

### BIL03 未払い停止と再契約

既存：`lib/rockstar-service-setup-store.ts`。不足：新規実行制限・成果閲覧/export・同じworkspace復帰の実受入。担当：JOINT、P0。

### BIL04 電子契約とチェーン証明

既存：`lib/sky-linux-service.ts`。不足：契約版/塩付きcommitment/取消/証明のreadbackと費用・chain選定。担当：OWNER、P1。

### SKY01 HF型の登録から収益分配

既存：`lib/sky-hub-store.ts`。不足：独立作者の登録/審査/版/追加/実行/請求/返金後払出の一周。担当：JOINT、P1。

### SKY02 Agent毎のLLM選択

既存：`lib/sky-agent-library-store.ts`。不足：対応model設定と実runtimeの一致・失効・更新時再承認を全providerで検証。担当：ROCK、P1。

### SKY03 作者が簡単にAgentを作る

既存：`docs/sky-tool-sdk.md`。不足：未知作者の問題fixture→package→sandbox→publish→購入者成果を測る。担当：JOINT、P1。

### NEWS01 Xの本人タイムライン取込み

既存：`lib/sky-x-feed.ts`。不足：本人フォロー/推薦の正規接続と取得権・上限・実投稿のnative表示。担当：JOINT、P1。

### NEWS02 配信元を自分でplugin

既存：`lib/sky-hub-store.ts`。不足：追加/解除/更新・原文/出所/訂正/時刻・cacheと失敗復旧の複数source受入。担当：ROCK、P1。

### NEWS03 正確で立場に侵されないニュース

既存：`docs/sky-tools-complete-design.md`。不足：引用/事実/意見/不確かさ/対称的評価/訂正を設計し独立評価。担当：JOINT、P1。

### EVE01 長期会話と記憶・端末変更

既存：`lib/eve-history.ts`。不足：実二端末restore、production鍵backup/全損復旧、削除/同意/競合の受入。担当：JOINT、P0。

### EVE02 Miniの生体/健康data

既存：`docs/rockstaros-avocado-mini-complete-design.md`。不足：測定項目/目的/本人同意/保持/削除/精度/端末適合の確定。担当：OWNER、P1。

### WORLD01 自由なルール・デザイン・LLM

既存：`lib/community-os-store.ts`。不足：実二端末の同一版Add/変更/rollback・互換と作者権利の受入。担当：ROCK、P1。

### WORLD02 専用鍵が必要なコミュニティー

既存：`lib/community-access.ts`。不足：production鍵保管・紛失/交換/漏洩/失効伝播・実二端末復旧。担当：JOINT、P0。

### WORLD03 DAOによる統治

既存：`docs/rockstaros-complete-design.md`。不足：版付き役割/議案/投票/次版効力/退出と管理者の安全停止を実装。担当：ROCK、P1。

### WORLD04 IP×NFT

既存：`docs/rockstaros-complete-design.md`。不足：許諾/権利帰属/派生条件とtoken移転を別の版付き契約で受入。担当：OWNER、P1。

### WORLD05 World・Agentのrun to earn

既存：`docs/sky-billing.md`。不足：本人検収/実入金/返金/債務/作者払出を別時計で照合。担当：JOINT、P1。

### GAME01 自分でゲームを制作

既存：`docs/sky-tools-complete-design.md`。不足：依頼/修正→許諾済builder→source/build→本人検収の両端受入。担当：JOINT、P1。

### GAME02 未知作者ゲームの受け皿

既存：`docs/sky-tools-complete-design.md`。不足：engine/build/入力/描画/audio/play/save/update/rollback/販売権の個別診断。担当：JOINT、P1。

### NET01 通信protocolの役割

既存：`docs/network-transport-design.md`。不足：TCP/UDP/DNS/DHCP/HTTP/TLS/SSH/FTP/SMTP/BGPの利用/提供/運用別実機表。担当：JOINT、P1。

### PERF01 ブラウザ速度とapp互換

既存：`docs/rockstaros-complete-design.md`。不足：入力/受理/初回成果/完遂/復旧p95を同backendでWeb/native比較。担当：JOINT、P1。

### PRIV01 VPN・閲覧privacy

既存：`docs/workstreams/04-security-identity-compliance.md`。不足：VPN出口/ログイン/Cookie/fingerprint/通知のthreat modelと実通信測定。担当：JOINT、P1。

### DATA01 本人所有の原本・終了後可搬

既存：`lib/sky-owner-export.server.ts`。不足：byte/reader/復号鍵/license/履歴/明細を別readerへ読戻し・模擬Cloud永久停止。担当：ROCK、P0。

### RES01 14時間草稿と算法の反証

既存：`docs/rockstaros-research-integration.md`。不足：残60分の実作業記録・引用/件数監査・強い対照との実験を別実施。担当：ROCK、P1。

## 現在のGitと再開条件

main `f98482605803a03522f50b92eeacebd45c2f3b0f`、作業branch `951d82d5a491a284aed4e0d4d280171d835d4b43`を今回読戻した。共有dirty変更を保持。remote mainとの差分・同一SHA CI確認は別欄へ追記する。文書保存、作業branch commit、main統合、配備を別々に扱う。

検証：対象social/community試験、schema/database/design/baseline、type/lint、ブラウザで投稿/反応/返信/保存/共有/切替/読込、最後に `npm run verify`。未実行・失敗・実機待ちは成功にしない。

## 今回の実装と検証結果

X型timelineを既存social APIへ実装し、投稿/返信/like/repost/bookmark/共有/既存Addを保存契約へ接続した。実UIで局所profileの投稿・返信・反応・bookmark一覧・共有・タブ切替を確認。390px幅でdocument390px/timeline374px、横はみ出し0、sticky tabs。全verifyはexit0、Node1102 pass/既存Linux skip1、Worker1559、CSV113、Web asset201/欠損0。証拠は `docs/evidence/timeline-research-integration.json`。これはX本人feed取得・全X機能同等性・Core算法3案・本番・実機の合格ではない。

次の正本入口は[継続開発プロンプト](prompts/rockstaros-research-integration-next.md)。main workflowのfreeCloud（unconfirmed/waiting等）とlocal実装をまず照合して再利用する。mainの6 check成功、branch source-preparation1成功、当branch関連PRなしを今回確認。自動merge/commit/公開は未実施。
