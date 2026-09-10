# RockstarOS 1.0 — ベース構成と進化方針

RockstarOS 1.0は、現在の検証済み範囲を最初の製品ベースとして発表し、互換性を保ちながら改善するための名称である。最初の配布段階はQEMU Developer Preview。1.0という製品版番号を、実機対応・本番金融・一般公開の合格証明に使わない。

利用者の8原則に基づく対象仮説、代表商品、system間の利用体験、開発優先順位、販売と検証は [製品・事業・開発設計](rockstaros-1.0-strategy.md) を参照する。本書は技術基盤を維持し、新しい設計を実装済みと扱わない。

## 全体構造

到達設計では利用者はnative UIからHub、Wallet、Game、端末操作を行う。Game交換/SDKは開発要求であり、現imageで利用できる機能とは分ける。UIはlocal Platform APIだけを信頼し、Platformが認証、権限、実行、保存、外部接続を仲介する。OS本体は読取専用、利用者データは別diskへ保存する。更新・復旧はA/B slotとbackupで扱う。

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

整数USD centsのSQLite台帳でAVAILABLE、hold、費用、請求、売上、settlement、receiptを管理する。本人確認済み購入者、同意、月888 cents、同一ownerの複数端末で1回の請求を扱う。GX00 runtimeはowner契約ごとに台帳を分離し、認証principalからだけ対象contractを選ぶ。

進化余地は、本番identity/passkey、暗号化、複数通貨、provider照合、実売上、出金、返金・dispute、監査statement、custodyを持たない構成の確定である。

## 8. ATM

現在はcardless ATM simulator。短時間code、Wallet hold、別ATM actor、redeem、partial/final reconciliation、不明状態を扱い、RockのATM手数料は0。現金払出し、実ATM、KYC、provider settlementは行わない。

進化余地は、正式ATM/provider adapter、端末attestation、現金単位、KYC/AML、地域別規制、provider実費表示、障害時の資金解放手順である。

## 9. Service Access・MCP

所有するRegistry、Runner、Wallet、MCP serviceを一つのauthorityとして起動し、端末資格と同意に結び付ける。MCP brokerはHTTP接続、tools/list、tools/call、期限、再送、receipt、再起動後の状態を管理する。現在はowned fixture中心である。

進化余地は、一般MCP server、OAuth、SSE/Streamable HTTP相互運用、provider別scope、rate limit、資格失効、複数組織、public endpointの防御である。

## 10. AI Routes

local、cloud、PCを別の処理先として扱い、許可、送信データ、予算、実行結果を分離する。現在はpolicyと合成accounting fixtureが中心で、実AI modelの品質や料金を検証していない。

進化余地は、実model adapter、品質・費用・遅延測定、privacy routing、budget上限、fallback、offline model、利用者ごとの選択説明である。

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

Wallet owner、端末、作者、game、playerを別IDにし、署名契約と本人同意で接続する。現在は認証TLSの接続client、複数owner/gameのrouting、既存接続のcurrent-copy引継ぎまで。実際の通貨交換GX01、正式ゲームGX02、作者SDK DX01は未完成である。

進化余地は、交換quote、予約、両台帳commit、返金・照合、正式sandbox、reference SDK、複数engine adapter、公式ゲーム接続である。

## 15. Desktop導入

現在のMac launcherは既存Lima VM、固定image、private VNC/noVNC、SSH tunnelを厳密なmanifestで結ぶ。別VMやlistenerを停止せず、秘密をURL fragmentだけで渡す。ただしVM作成やimage配布を行う一般installerではない。

進化余地は、fresh Mac/PC向けinstaller、仮想化backend選択、署名release artifact、容量確認、自動update、安全な削除、診断bundleである。

## 16. Web・Android補助トラック

Webには既存の仕事作成・実行・確認・Wallet address接続がある。Android P1は記事処理の試作APKで、RockstarOS本体ではない。これらはOSの管理・導入・通知を補助できるが、QEMUや実機OSの合格を代替しない。

進化余地は、companion app、device enrollment、通知、遠隔確認、Web管理、正式AOSP device portである。

## 1.0で発表する範囲

1.0はHub、署名Tool、local実行、合成Wallet、native UI、A/B更新・復旧、backup、開発用remote接続を持つOSベースとして発表する。Game、実機、実資金、実ATM、一般cloud/USBは進行中または将来機能として明示する。最初の配布ラベルはDeveloper Previewとし、合格した機能だけを実演する。
