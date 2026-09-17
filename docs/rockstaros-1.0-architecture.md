# RockstarOS 1.0 — ベース構成と進化方針

2026-09-16現行設計: RQ48に基づく中核は交換可能な端末内LLM＋offline agentを持つAIネイティブOS。層別責任、model/runtime更新、記憶、仕事、外部作用の照合、Sky app/OS能力交渉、Zema共通契約、便利機能とGame/IPの縦断、Core/応用別受入は [AIネイティブOS共通設計](ai-native-os-architecture.md) を正本とする。本書のLinux/QEMU資産一覧は再利用対象であり、スマホ版の全機能実装済みを意味しない。

RockstarOS 1.0は、現在の検証済み範囲を最初の製品ベースとして発表し、互換性を保ちながら改善するための名称である。現在のスマホOS開発主軸はPixel 10／GL066／`frankel`で、QEMU Developer Previewは独立した配布候補として維持する。1.0という製品版番号を、実機対応・本番金融・一般公開の合格証明に使わない。

利用者の8原則に基づく対象仮説、代表商品、system間の利用体験、開発優先順位、販売と検証は [製品・事業・開発設計](rockstaros-1.0-strategy.md) を参照する。本書は技術基盤を維持し、新しい設計を実装済みと扱わない。

## 全体構造

2026-09-16更新: 本文のnative構成はLinux/QEMU版のもの。スマホ版は所有Pixel 10／GL066／`frankel`を最初の物理対象へ確定し、機種構成・Android接続層へ移植する。端末OS build／起動は未実施で、Linux版の受入を流用しない。[全体構成監査](system-composition.md)／[現在の区分](current-state-20260911.md)／[スマホ版](phone-preview-20260911.md)。

以下はLinux/QEMU資産の構造である。利用者はnative UIからHub、Wallet、Game、端末操作を行い、Platformが認証、権限、実行、保存、外部接続を仲介する。OS本体は読取専用、利用者データは別diskへ保存し、A/B slotとbackupで復旧する。Androidの現行到達設計は共通設計のCore→Sky/Zema→応用の責任分離に従う。Game契約のhost実装と、個々の配布imageに搭載された範囲を混同しない。

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

## 1.0で発表する範囲

1.0 Coreは端末内LLM、offline agent、権限・仕事・成果・停止・保存・復旧を持つOS基盤として受入する。Sky/Zemaを最初の利用経路とし、便利Tool、Game/IP、実収益/Wallet、Fundは独立した応用受入に分ける。Gameの制作・試遊をFund完成まで一律延期しない。Linux/QEMUの署名Tool・合成Wallet・Game SDK等は既存資産として維持するが、GL066 OS搭載済みと表示しない。最初の配布ラベルはDeveloper Previewとし、同一環境で合格した機能だけを実演する。
