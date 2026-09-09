# Rock — 現設計を稼働可能なOSへ進め、ゲーム通貨交換を独立して実装するプロンプト

2026-09-09実行追記: 設計v1.1の実装は承認済み。現在の範囲と条件付き公開/実機/MetaMask了承は [承認記録](../execution-approval-20260909.md)。以下の実行前ゲートは受領前の原指示を保持した履歴。専用branch `codex/operational-base-20260909` で実装を進める。

改訂: 2026-09-09 / 確認用設計v1.1対応。以下は次の実行担当へ渡す指示。保存しただけではOS build、ゲーム接続、実資金提供を完了扱いにしない。

## 実行前の承認ゲート

**現在は設計承認待ち。まだ実装を開始しないでください。** `docs/os-hub-wallet-game-design.md` を利用者へ提示し、その版に対する明示承認を確認してから以下を実行します。承認前は設計・プロンプトの修正と提示まで。承認日時・設計版・対象範囲を記録し、承認後に必要なら現状との差を再監査します。部分承認ならその範囲だけ実行。未決の実ゲーム・交換方向・本番条件は承認済みと推測しません。

設計承認は使い捨て環境/合成通貨による開発の許可であり、実資金・実機書込み・本番公開等の別承認を代替しません。設計書のGame入口・達成演出案は、承認した項目だけ採用してください。

https://github.com/k999ln/rock を確認し、現在のHub＋Wallet設計を最低限の製品ベースとして維持したまま、実際にbuild・起動・操作・保存・再起動・復旧を検証できるnative OSへ進めてください。最初の完成点を「合成データで受入試験を通したQEMU開発用OS雛形」とし、別枠でWalletとゲーム内通貨の交換、および自作ゲーム作者が容易に組み込めるAPI/SDK・sandboxを実装・試験してください。ATM設置/現金払出しは独立した経路です。手数料0の指示はATMでRockが徴収する手数料に対するもので、ゲーム料金やOS月額の変更ではありません。

計画だけで終えず、利用可能で許可された環境内でコード修正、実行、失敗原因の解消、再試験、Git保存まで行ってください。不足環境や新たな権限が必要な箇所だけ停止し、独立した安全な作業を進めます。実機や実サービスの未準備を、実行済みという表現で埋めないでください。

## 0. 正本・開始点・現在地

最初に `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`docs/prompt-playbook.md` を全文読み、RQ01〜RQ15を維持してください。`README.md`、`project.md`、進捗JSON、対象branchの `CHECKPOINT.md`、`docs/native-os-integration.md`、`docs/native-os-validation.md`、`systems/rock-star-os/README.md` と対象コード/テストも読んでください。既存の詳細作業は `docs/prompts/hub-wallet-next.md` の段階1〜4を再利用し、順番と新要望は本書を優先します。

今回のGitHub再確認は2026-09-09 16:51 UTC（改訂前の入力snapshot）:

- main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、verify成功。
- native `codex/integrate-native-os-20260909` / `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、PR #1 OPEN・未マージ。同SHAのWeb/Android/native source-tests成功。
- 設計 `codex/os-game-design-review-20260909` / `de5b102d3525daccf604efd5685bdf8c14ad5d50`。新要望/設計/本プロンプトはこのbranchにありmain/native未反映。監査時check-runは0でCI成功とはしません。この改訂の保存先も同じreview branchです。開始時にはその最新SHAと承認対象版を再取得してください。
- nativeにはLinux/Buildroot/ARM64 QEMU、専用UID、native Hub、Tool隔離、Wallet simulator、A/B更新の試作と旧第9の起動実績があります。しかしこのRock配置からの新image build/bootはNOT RUN。通常source回帰1,031件は最新OSの起動証明ではありません。
- startup-healthの21files WIPは未適用。通常gate外のATM observerは認証fixture不適合1error、power6/Wallet5skip、別UID C試験も通常host対象外です。
- 対象main/nativeでゲーム本体・交換契約は未発見。ATM simulatorは存在します。実ATM設置・実現金払出しの実績をこのコードから保証しません。
- 既存Walletは単一owner/Aliceの複数端末試作で、一般の複数プレイヤー台帳ではありません。最新backup形式と復元試験入口に差、台帳移行と旧OS rollbackに未設計部分があります。下記GX00/B/Dで修正し、コード修正済みと扱わないでください。

`npm run prompt:context` または同等の読み取りでmain・全branch・open/関連closed PR・各対象SHAのCIを再取得し、fetchして40桁SHAを固定してください。特にmain/native/設計reviewの3入力を確認し、PRのないbranchも除外しない。checksなしは未報告であり成功ではありません。取得失敗や取得途中のbranch変更を最新確認済みとしない。すでに解消した問題は対象証拠を確認して重複実装しないでください。詳細は `docs/os-readiness-audit-20260909.md` と `docs/design-implementation-alignment-20260909.md`。

## 1. 維持するベースと安全境界

- 製品の目的は、自動化で生まれる時間/収入の余地を本人の創作・学習・ゲーム・現実の挑戦につなげること。削減時間・実費後の確定収支・利用者の選択肢を測り、売上や値上がりを保証しません。GTA VI等の未確認の外部Wallet機能を前提にせず、ゲームの正式なAPI/権利/対応能力が確認できた範囲だけを接続します。自動化収益を本人の別承認なしにゲーム/市場へ投入しません。
- tob側が商品を開発・保守し、RockはHub、adapter/SDK、認証、資格、実行先、費用、成果、収益照合、Walletの共通基盤を作ります。既存ツールも独立商品。業務ロジックやWalletを新規に作り直しません。
- OS標準の中心はHub＋Wallet。ゲームは追加連携であり、ゲーム中心OSや汎用エコシステムへ転換しません。開発用Web管理画面は補助であり、native OSの代わりにWebだけ作って完了にしません。
- 端末/PC/cloud/self-host、運用者、接続方式、料金、ライセンス、資格、BYOK、実行費は別軸。未対応や不明は具体的に表示し、全商品MCP化や無料扱いを強制しません。
- 同一契約の月888 USD cents固定、複数端末の重複防止、旧Webの試算、既存売上/返金/ATM履歴を保持。新しいレート・手数料・契約を創作しません。
- ATM自社手数料は0。別名目・換算マージンで上乗せしない。外部provider実費は存在・負担者・金額・同意を別に確認し、不明なら「総額無料」としません。ゲーム側の料金は未決定で、ゲーム手数料0の要望へ読み替えません。既存ATM fixtureの0手数料契約を保持し、quote/receipt/台帳に隠れた自社徴収がないことを回帰検証します。
- BlackBerry優先・機種/variant未定。Linux QEMUと旧Android/AOSPを区別。QEMU imageを実機へ書き込まず、実機ゲートを合成テストで代用しません。
- SSDは直前に安全に取り外してあります。再接続・正しいvolume/VM・保存先・空き容量を確認するまでその環境を起動しません。内蔵の旧Limaやユーザーの既存OSディスクを勝手に再利用・初期化しない。既存固定export、秘密値、復旧控えを上書き・公開しません。
- 公開試験鍵は開発用。合成データで隔離検証し、開発imageに実秘密・個人情報・実資金を入れない。本番鍵生成/保管、端末購入/解除/書込み、サービス契約、課金/送金、本番公開は別の明示承認が必要です。
- 追加相談の予測市場/ゲーム資産売買は検討のみで、本プロンプトの実行対象ではありません。非換金の模擬案も別の承認を受けてから実装し、交換対応Walletがあることを市場運営・賭け・投資機能の許可としないでください。

## 2. 作業順と依存関係

### A — ベースとnativeを分離作業branchへ統合（B04 / GAP01）

最新nativeが未マージならそのsourceを出発点にし、マージ済みなら最新mainを使います。ユーザーのdirty checkoutを切り替えず、分離作業branchを作ってmainの既存変更に加え、設計review branchの最新ベース・承認対象設計・本プロンプト・受入雛形・検査を取り込みます。mainだけから文書を取って新要望を落とさない。AGENTS、README、project、status、CHECKPOINT、native設計を同期し、旧Nタスク・Android/Web・IMPORT-MANIFESTの取得基準を保持してください。

作業順は「A統合→BのOS起動/安全基礎→Cの選定済み既存native商品1件と合成Wallet基礎→Bの縦断受入完了」。PC adapter/有料/BYOKなどC全体や実providerの完成をV01の前提にしませんが、未完事項は残します。Dのゲーム交換は共通Wallet基礎とGX00のowner分離/認証接続を先行し、Eの設計は並行可能、動くSDKはDの契約/fixtureに依存します。進捗JSONのphaseGatesでもこの順番を保持します。ゲーム/ATM/provider/実機の条件待ちをQEMU OS雛形の合格条件にしません。GAP02〜04の実商品多様化・実売上・携帯価値は別の未完了事項として残します。

合格証拠: main/native/設計reviewの3入力SHA、承認版、統合commit/差分、競合解消、全入口の次作業一致、baseline/project検査。review保存、nativeへの反映、mainへのmergeは別状態です。mainへの直接push/mergeは含めません。

### B — OSとして稼働する受入候補を作る（V01 / OS-GAP01〜05）

既存のbuild/検証入口を再利用し、試験対象source・image・profileを固定して以下を通してください。必要な修正は試験を追加してから行い、過去ログを新imageへ付け替えないでください。

| ゲート | 実装・試験と合格条件 |
| --- | --- |
| D0 対象固定 | A統合とsource回帰、依存lock/出所、秘密/公開fixtureの分離。テスト入力の前後hashを照合 |
| D1 build/boot | 新しい空のLinux build領域でImage/rootfs/stage0を実生成。同じ候補で実QEMUのkernel/init起動、専用UID、root read-only、data分離、乱数、IPCを観測 |
| D2 利用 | native画面からHub商品を導入・同意・実行・結果保存/再表示・停止・更新/戻す・削除。Walletはavailable/pending/hold/費用・月額の合成取引を照合。診断hashだけで業務用途を代替しない |
| D3 境界 | 別UID/owner、改ざん/失効署名、許可外path/通信/操作、入力上限、CPU/RAM/時間/容量、worker crash、接続切れ、二重要求を試験。不明な外部結果は照合待ち。無断送信/二重実行なし |
| D4 起動健康・更新復旧 | startup-health WIPをレビューし追加C/Python試験から採否決定。fresh nonce、PID/UID/exe/socketと実描画後loop応答を確認し、freeze/未準備をmark-goodしない。同候補のA/B改ざん、部分書込、中断、容量不足、data ABI不整合、起動失敗から回復 |
| D5 保存/終了/復元 | OS画面から通常reboot/poweroff。initのサービス停止・unmount・guest power eventを照合。同じdataで仕事/同意/receipt/模擬Walletが保持される。OS A/B/dataに加えbackend/runner保存範囲を明示し、別の新規復元先で起動/照合、元データ不変を確認 |
| D6 継続稼働・引継ぎ | 初期の開発受入案として正常起動/終了5サイクルと60分の制限内反復jobを行い、無断副作用・消失・二重計上0、deadlockなしを確認。環境に応じた時間/資源閾値は試験前に記録し、失敗後に緩めて合格にしない。起動/停止/復旧手順と利用範囲を保存 |

OS基本操作・保存済み成果物・復旧は契約切れやgame/cloud停止でも利用可能にします。offlineで未導入AIが動くとは表示しません。

通常gate外の旧ATM fixtureは現在のenroll/認証/規約/quoteに合わせ、初期化途中のcleanupも修正。root必須のpower/Wallet/別UIDは使い捨てLinux/guest内で実行し、認証緩和・skip/mock化で合格にしません。ATMの物理接続は不要ですが、既存共通Walletの回帰をゲームと無関係だからと削除しないでください。

`os/desktop/backup.py` のOS backupはbackendを含みません。backend/runner/game authorityの正本と整合時点を別々に記録し、未照合の外部取引を巻戻し/再実行しない復元手順にします。同じauthorityの元台帳と復元台帳を同時に支出可能にしない。単一writerと世代/切替の排他を維持し、復元試験は外部通信のない合成環境で行うか、元writer停止と正本切替を検証してから支出許可します。復元後は正本との照合前に支出を有効化しません。休止・単なるsync・電源受付receipt・強制終了を通常終了成功に換算しません。

先行修正（ALIGN03 / D5）: device schema5のbackupは `rock-desktop-backup/2` の `disks` にhashを持ちますが、現行 `verify-backup.py` は旧schema1の `userdata_sha256` を必須参照し、44固定local表だけを照合します。backup/restore本体の既存A/B/data対応は再利用し、試験入口を旧schema1/新schema2・A/B/data・対象profileの正本DB/追加表/外部backendへ対応させてください。新形式fixtureと旧互換の試験を先に追加し、schemaを偽装したり必要表を省略/skipして成功にしないでください。静的確認の不整合であり、この改訂時点で再現・修正実行済みとはしません。

既存入口（native root内）: `os/build-os.sh`、`os/verify-boot.py`、`os/verify-system.py`、`os/verify-platform.py`、`os/update/verify-qemu.py`、`os/update/verify-faults.py`、`os/ui/verify-*.py`、`os/desktop/verify-backup.py`。各help/実装を読んで引数・破壊範囲・対応profileを確認し、存在する全scriptを盲目的に一括実行しない。rootfs/stage0を省く軽量boot試験だけではD4完了にしません。

`docs/templates/os-acceptance-report.md` を用い、機械可読JSONと人向け報告を作成。必須D0〜D6にFAIL/NOT_RUN/SKIPがあれば「QEMU OS雛形合格」としない。対象範囲の重大な未解決脆弱性も合格を妨げます。公開試験鍵等の本番不適合は隠さず、隔離開発専用という制限として明示します。ビルド手順の再実行可能性と別環境でのbit-identical再現性は区別してください。

### C — 既存商品を実際に使い、Hub/Walletの不足を直す（B02/B03/B05 / GAP02〜04）

旧プロンプト段階1〜4を維持。`os/tools/packages/` の提案下書き、引用整理と、root `toolkits/mr/` の案件チェック等をsource/ref/hash・権利付きで棚卸し。少なくとも1件の提案/記事/納品用途を合成入力でnative Hubから実処理し、PC商品1件は範囲限定adapterで実プロセスに接続します。ゲーム機能で既存ツール実利用を置き換えません。

利用前準備→接続/資格/料金→実行→結果→再起動後の履歴→停止/復旧→費用/売上状態まで操作し、改善前・改善後・既存PC手順の時間/操作数/切替/復旧を測ります。無料、有料API併用、外部契約、BYOK、self-host、複数工程をschemaだけでなくadapter・receipt・費用まで結び、非対応は明示します。

既存Walletの整数台帳、認証、同意、重複排除、月888 cents、remote正本を再利用。実行成功を売上へ変換せず、合成売上と認証済み実取引を分けます。B03のfixture/台帳基礎が通ればB05を実行できますが、実収益や携帯実機の未検証はGAP03/GAP04に残します。QEMU開発OSの限定合格と、商品カタログ全対応/実売上/実機価値の合格は同じではありません。

### D — ATMから独立したゲーム通貨交換（GX00/GX01/GX02 / GAME-GAP01〜04）

**先行GX00（ALIGN02 / GAME-GAP04）**: `os/wallet_backend/server.py` のAlice固定、`os/entitlement/wallet_bridge.py` の1DB1account、`os/wallet_auth/service.py` の単一account bindingを前提として読みます。同ownerの認証付き多端末はありますが、複数ownerの正当系は未実装です。制約の単純除去で同一AVAILABLE/同意/月period/冪等キーを共有しない。1契約1DBを分離維持するか版付きmulti-owner台帳へ移すかを、設計判断記録（ADR）で比較・選定します。

Wallet owner、購入端末、作者、game ID、game内player IDを別IDにし、本人認証/同意から両authority・owner/account・developer/game/player・scope・期限・失効を固定した接続を作ります。server側で認証済み接続から台帳を選び、requestやgame作者の自己申告でownerを選ばせない。ゲームへWallet全残高/自動化収入/他ゲーム履歴を既定公開しない。Rock端末のない一般playerの本番利用資格は未決なので、既存購入資格を黙って撤廃せず、作者sandboxへ端末購入も強制せず、提供対象を別判断に残します。ゲーム利用だけで未同意のOS月額を開始しません。

GX00合格は2作者・2ゲーム・2owner/player（1ownerは2端末）を認証有効の同一統合経路へ接続し、正当な分離と越境拒否を両方通すこと。同じplayer文字列/交換ID/冪等キーの誤衝突防止、同owner月額1回/別owner独立、他ownerのquote/receipt/同意参照拒否、失効/残高不足の非波及、同時処理/worker再利用/再起動でscope非漏洩を検証。旧単一owner台帳・ATM hold・月額・credential・receiptを保持した移行/復旧を含めます。GX00はOS単一ownerのV01受入の前提にはしません。

ゲーム名/repository、所有者の権限、正式server API、交換方向、対象資産、レート/手数料/上限/端数/返金/地域/年齢等の提供条件を確認します。未確定なら質問を記録し、独立した合成game authorityで安全契約を実装・試験します。ゲーム本編を勝手に開発せず、実ゲーム接続済みとも表示しません。本番の両方向とも未承認のまま有効化しません。

1. `src/blackberryrock/wallet.py` のtransaction、append-only記帳、冪等性、`os/wallet_backend/`、`os/wallet_auth/protocol.py`、entitlementを再利用。現行台帳はUSD cents、holdはwithdrawalsと対応し、認証quoteはATM専用です。ATM払出しをゲーム交換と偽装せず、専用namespace/権限/quote/取引種別と、既存DBを保持する版付き移行を追加します。
   - ALIGN04: 現行更新は固定 `data_abi=rock-data-v1`、台帳migration engine/userdata rollbackなし。旧台帳・旧client・直前OSとの互換表、移行途中停止、更新後A/B戻し、未確定交換保持の復元を試験してください。互換不能なら署名data ABIと移行/復旧方針を先に設計し、同じABIだから旧slotへ安全に戻せると仮定しない。Game入口の採否に関係なくGX00/GX01台帳変更後はBのD4/D5を再実行。既存台帳再作成・保留消去で通さない。
2. Wallet authorityとgame authorityをそれぞれ正本とし、OS/ゲーム画面は表示・承認の入口にします。asset IDは発行者/ゲーム/単位を含め、金額は整数最小単位。USDとゲーム通貨を合算しない。購入/獲得/bonus等を区別し、交換可能条件を満たす資産だけ扱います。
3. quoteにはexchange ID、owner/device、両authority、game/account、方向、source/destination assetと量、rate版・端数規則、手数料/総引落し、期限、規約版を固定。本人承認を全内容に結び、改ざん/期限切れ/失効/別ownerは拒否。レートはfixtureのテスト値と明記し実条件を創作しません。
4. 予約・指示・outbox・provider取引ID・結果receipt・照合履歴を永続化。同じ交換IDに別キーで要求しても重複させず、同じキーのpayload変更は拒否します。serverを跨ぐ処理を単一SQLite transactionで原子的とは称さず、認証された相手の冪等処理と照会で確定させます。相手の冪等保持期限後に不明取引を盲目的に再送しません。
5. Wallet→ゲームは利用可能額の予約後に付与し、game serverの確定結果に基づき一度だけ記帳。状態は見積/承認/予約/処理中/結果不明・照合待ち/完了/取消確定等を分けます。付与されたか不明なtimeoutで保留解除・返金をしません。
6. 逆方向は別capabilityで既定無効。合成fixtureで試す場合も、ゲーム側の確定debit/burnと最終receiptを要求するか、Wallet確定後に自動解除されない永続予約→確定消費を検証します。期限付きholdだけでWalletを確定しません。換金原資はWalletまたは承認された清算authorityの確認済み残高/留保/入金証憑で上限化し、作者game serverの「原資あり」申告を信用しません。作者APIにAVAILABLE増額/mint権限を与えず、任意発行のポイント/bonusは換金資格と裏付けがない限り実資金へ移しません。クライアントのスコア・自己申告・画面残高でお金を増やさず、取消不能/消費済み/不明は要照合、補償は権限と事実に基づき一度だけ行います。
7. ATM actor、払出コード、月額同意はゲームへ流用しません。ATM停止中でもゲームの独立処理/状態照会は可能、ゲーム停止でATMは停止させない。ただし共通Walletが停止したら両方とも残高変更を確定せず待機。同じAVAILABLEへのATM予約/月額/交換の競合は単一の権威ある台帳で直列化します。
8. OSからゲームaccount接続→見積→承認→交換→両側残高/履歴→再起動/照合→解除を試験します。保留中の解除で履歴や照会能力を消さず、新しい交換だけ停止します。秘密値/個人情報はログやGitへ出しません。

異常系の合格条件: 二重引落し・二重付与0、available非負、資産別保存則、同一quoteの往復/端数/bonusによる価値の無断増殖なし。金額のbool/float/負数/overflow/未知単位、rateや口座差替え、期限切れ、別owner/失効credential、sandbox/prod混用、改ざん/重複/逆順通知、各境界の通信断/再起動、game凍結、保留期限切れ/解除と補償の競合、原資不足/作者による偽原資、ATM/月額との同時競合、元/復元writerの同時書込拒否を試験してください。

GX01合格は合成serverと模擬Walletのコード・移行・両台帳・UI・異常系まで。GX02は指定されたゲームの正式sandboxを別途接続して同じ契約を検証する段階です。GX01の成功を実ゲームや現金交換の成功へ換算しません。実交換には提供者の許可/規約、原資・清算、金融provider、提供地域に応じた専門確認と運用承認が必要です。

### E — 自作ゲーム作者が組み込みやすい共通Wallet基盤（DX01 / RQ14）

個別のゲーム1件だけに直結して終わらず、同じ接続契約で複数作者が使える入口を作ってください。全ゲームエンジン対応を一度に目指さず、既存実装と利用者の対象環境に合うreference SDKを1つ選び、理由と未対応環境を記録します。対象未指定なら汎用HTTP契約と最小の試験用SDKから始め、特定engine採用を確定要望にしません。

- API契約、version、権限scope、エラーコード、再送/照合手順、sandbox/prod境界を明示。playerのaccount接続/同意と、作者のgame登録/鍵を分離します。
- 合成通貨sandbox、copyして動く最小サンプル、導入手順、取引照会/接続診断を用意。作者にOS再buildや金融台帳の自作を求めません。管理用Webを必要とするなら限定的な開発者画面として作り、現金mintや万能root操作の入口にしません。
- 開発者向け秘密鍵はserver専用でゲームクライアントへ埋め込まない。game単位のcredential発行/失効、allowed scope、利用上限を扱い、他game/playerの残高や履歴を見られないことを確認。
- 同じSDKでGX00の2作者・2game・2owner/player・複数端末を接続し、Game AのID/receipt/credentialをGame Bに流用できないこと、異なるownerの正当な交換成功と相互アクセス拒否、同じplayer文字列でも資産・同意が混ざらないことを試験。SDKの便利関数が結果不明を自動返金・新しい取引IDの再送へ変換しない。
- 新しい作業領域で手順通り導入し、設定数/コード量/最初の交換までの時間/成功率/エラー復旧時間を測定。作者の操作は「game登録→sandbox設定→サンプル起動→player接続/同意→合成交換→履歴/照合確認」まで通す。
- 初見の外部作者による評価は許可と協力者がある場合に別pilotで実施。内部のやり直し試験を市場の使いやすさ実証へ換算しない。「一番使いやすい」は目標であり、比較していなければ主張しません。

合格証拠: 動くSDK/サンプル、GX00の複数owner/game分離・権限/鍵失効・再送異常系、fresh環境導入記録、測定結果、つまずき→修正→再試験、未対応と次のpilot条件。DX01はDのGX00/GX01基礎に依存するが、実ゲームsandbox GX02、実資金や実ATMを一律の前提にしません。

### F — OS内のGame体験（設計承認された場合のみ）

設計書の提案範囲で、native OSから接続済みゲーム・資産・交換履歴を確認できる任意のGame入口を作ります。WalletやHubの通常操作をゲーム画面で置き換えません。対応実行先を表示し、現OSで動くことを検証していないゲームを直接プレイ可能と表示しません。

成果の軽い演出が承認された場合は、許可された最小の集計イベントだけをread-onlyで渡します。演出やレベルに現金価値を持たせず、仕事本文・金額・個人情報をゲームへ自動送信しません。遊ばない利用者にもHub/Walletの全基本操作を提供し、演出をOFFにできます。ゲームの失敗/負荷/更新/未導入で自動化・Wallet・OS更新/復旧が止まらないよう隔離・資源制限・退避導線を試験してください。

新規の大規模ゲーム本編、全engine対応、賭け・ガチャ、通知連打、連続ログインや支出への強制報酬はこの提案に含めません。Game体験の追加はD0〜D6のOS合格を代替せず、追加後は関連ゲートを同一候補imageで再試験します。

## 3. 検証・保存・完了報告

- rootで `npm run baseline:check`、`npm run project:update`、`npm run verify`。nativeはREADMEに従いLinuxの `python3 scripts/test-native.py --output <新しい専用フォルダー>` とBのguest/UI/失敗注入を実行。Androidに変更した場合は追加のAndroid検証も行います。
- `docs/evidence/os-base/`、`docs/evidence/game-exchange/` に公開可能な合成証拠とhash付きmanifestを保存し、既存同等資料があれば再利用。OSディスクや秘密付きruntimeを公開Gitへ入れません。
- 受入報告、起動/停止/復旧手順、ゲーム連携契約、GAP01〜04・OS-GAP01〜05・GAME-GAP01〜04・ALIGN01〜05の解消表を残し、AGENTS/README/project/status/CHECKPOINTを同期。文書の訂正完了とruntimeの問題解消を別に記録し、旧Nタスクを消さず関連付けます。
- 許可範囲の実装を分離branchへcommit/pushし、変更SHA・同じ版の試験結果・次の入口を報告。既存PRのmain merge、force push、元のdirty tree上書き、本番公開・実課金・送金・ATM操作・実機書込みはこの指示に含めません。
- 最後にRQ01〜RQ15を自己点検し、「QEMU OSの合格範囲」「ゲーム連携/作者向けSDKの合格範囲」「ATM独立・自社手数料0の回帰証拠」「未検証の実機/実資金」「減った不便」「残課題と次の条件」を日本語で分けて報告してください。

安全確認は試験範囲付きの報告です。雛形の完成を無条件の安全認証や製品全体完成と呼ばないでください。
