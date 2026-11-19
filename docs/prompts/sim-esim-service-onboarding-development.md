# SIM/eSIMからRockstarOSを利用開始する開発実行プロンプト

作成日: 2026-10-21（America/New_York）。主担当: Web / PWA / Sites、`SIM01`・`WEB06` / `ROCK`。連携: Security / Identity / Compliance、`OS10`、`BIL02`、`SKY21`、`DSP01`。これは実装と検証の指示書である。文書や画面だけを追加して完了とせず、既存OS上の標準サービス接続を、実在する発行元・契約・本人・端末・Linux・請求の証拠へ段階的に接続する。このeSIMは通信容量ではなくCloud Linux/LLM/Agentのservice profileを追加する入口であり、端末接続と実行先の生存を同一状態にしない。RQ01〜RQ49、特に本人別サービス、権限、保存/復旧、透明なusageと同一契約の基本料一回計上を維持する。

## 0. 最新入力と作業木を固定する

最初に`AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、主担当のWeb workstreamと横断のSecurity/Wallet workstream、`docs/prompt-playbook.md`、実装承認、`phaseGates`を読む。正本は`docs/rockstaros-design-portal.md`、`docs/rockstaros-complete-design.md`、`docs/sim-led-product-architecture.md#esim-service-attachment`、`contracts/rockstar-service-attachment.json`。旧QEMU/Buildrootの受入を現在のサービスやPixel全OSの受入へ転用しない。

GitHubのmain・全branch・対象branch・PR・同一SHAのCIを作業直前に再取得する。2026-10-21の読戻しでは、GitHub mainは`01b6aecd8b4d8bd2385665232dfb4b57029f991f`で、同一SHAのpush workflow 4件（Rock star verification、SPIDER repair regressions、SPIDER repository security、SPIDER CodeQL security）は成功。`codex/esim-cloud-access`は`951d82d5a491a284aed4e0d4d280171d835d4b43`で、同一SHAの「Phone source preparation (not OS boot)」1件だけ成功し、対象branchのPRは0件。mainのPR #181は統合済み、PR #105（仕事の二重保存・競合修正）はopen。現checkoutの`origin/main`は古い`70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`であり、ローカルは547項目のdirty差分（未追跡331件）を持つ。`npm run prompt:context`はGitHub文脈を確定できず失敗したため、上記値はGitHub接続から同等に読んだもの。mainには下記の新しいservice setup/attachmentファイルが存在しない。次の担当は値と差分を再取得し、取得失敗を最新確認済みとしない。

製品baselineに残る2026-09-09の監査起点main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50` は履歴であり、現在のheadやCIへ転用しない。

**実装の第一手はmainとの差と引継ぎ入口の同期。** 現作業木をreset/clean/強制上書きせず、必要なら分離checkoutへ正確なrefと必要なdirty変更を保全して統合する。mainの新しい基盤を古いbranchの欠落から「未実装」と判断せず、既存PRもmain反映済みと呼ばない。ソースSHA、採用/保留理由、文書保存・branch commit・main統合・配備を別々に記録する。現local baselineはRQ01〜RQ49/mainはRQ50とアカウント単独利用を含むため、mainの後続方針を消してSIMを全アカウントの必須条件へ戻さない。Sky単独月額140 USDのSandboxと、共通契約月額16 USD案を別商品・別検証として照合する。

監査上の歴史的SHAはmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native head `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、design head `de5b102d3525daccf604efd5685bdf8c14ad5d50`。この3件は`data/product-baseline.json#auditInputs`との対応だけに使い、現在の作業head/CIとしない。

## 1. 現在あるものを実際に読む

| 能力 | 読むコード・証拠 | 現段階の限界 |
| --- | --- | --- |
| 購入・発行・導入 | `lib/rockstar-entitlement-claim.ts`、`lib/rockstar-entitlement-event.ts`、`lib/esim-cloud-grant.ts`、`lib/esim-cloud-proof.ts`、`lib/esimgo-provider.ts`、`lib/esim-device-entitlement*.ts`と対応route/試験、`toolkits/esim-bootstrap/` | 署名済み購入claim、refund/revoke、限定端末導入・Cloud鍵の局所処理はある。サービスprofileの発行/追加/停止/復帰の全生命周期と実発行元の導入証拠は未受入。 |
| 契約・Linux準備 | `lib/rockstar-service-setup.ts`、`lib/rockstar-service-setup-store.ts`、`lib/rockstar-service-setup-billing.ts`、`lib/sky-linux-service*.ts`、`drizzle/0064_sky_linux_service.sql`、`drizzle/0065_rockstar_service_setup.sql`、`tests/rockstar-service-setup.test.mjs`、`docs/evidence/pixel-service-setup.json` | Pixel向けsource/local fixtureはあるが既定無効。実issuer、Stripe sandbox、管理Linux、同一Pixelの開始/失効/復帰は未受入。`provision()`はLinux `accept()`の後でsetup側の`runtime.requestedAt`を保存する。 |
| 接続証明 | `lib/rockstar-service-attachment.ts`、`tests/rockstar-service-attachment.test.mjs`、`contracts/rockstar-service-attachment.json` | 署名対象18項目のcanonical bytes、Ed25519と現行事実の純粋検証だけを合成鍵で3/3試験。issuer lifecycle、本人/端末鍵の要求証明、API/DB/dispatch、子端末、実機には未接続。2026-10-20の全`verify`は空き容量不足で停止した。 |
| 画面・端末 | `/connect/service`、`components/rockstar-service-setup.tsx`、Android `ServiceSetupActivity`、`data/service-setup-integration.json`、`docs/phone-preview-20260911.md` | OS受入を要するPixel向けgateで既定無効。iPhone、eSIM非対応端末、既存OS browser/clientの標準接続と実際の起動は未受入。 |

着手時に各行を`要望ID / repository / branch / 40桁SHAまたはdirty source hash / 実装状態 / host・fixture・sandbox・実機・本番の証拠 / 未検証`へ更新する。古い証拠JSON内のmain SHAを今日のmainと混同しない。既存のWallet、商品schema、SDK、仕事状態を作り直さない。

## 2. 原因から修正する問題表

| ID | 原因・対象 | 修正順とROCKの成果 | 合格証拠と未解決条件 |
| --- | --- | --- | --- |
| SIM-G01 | 発行元からの購入/発行/追加/停止/失効/復帰が、現在のservice-profile利用権と端末導入を一周で結ばない。既存eventは主にrefund/revoke。 | 許可されたissuerごとの版付きadapterを作り、署名、鍵失効、audience、owner/order、時刻、sequenceと現在状態の再取得を検証する。通信回線、SIM profile、本人、サービス利用権、端末導入を別表/別revisionで保存する。古いactive通知で失効を戻さない。 | 合成fixtureで正常、重複、逆順、欠落、鍵交換、別owner、期限切れを試す。実issuerの契約、鍵、sandbox/実profileはEXTERNAL/JOINT待ちで、fixtureを実発行へ換算しない。 |
| SIM-G02 | 現行Pixel setupは単一owner/単一deviceRefに強く結び、`draft()`は別端末を拒否する。標準既存OS利用はPixel OS受入gateで進められない。 | 本人認証、版付き契約と料金/保存/停止への明示同意を権威側で保存し、owner+契約の一つのservice account/workspaceと複数device attachmentを区別する。標準service gateとnative Pixel OS gateを別にし、既存native gateを弱めない。旧ID、`zema` scope、保存データを移行互換にする。 | 同一契約へ2端末追加してもservice accountと基本料が各1件。別契約/別owner/未同意/旧版同意を拒否。料金枠・単価・地域・保持/猶予はOWNERの版付き決定前に実販売しない。 |
| SIM-G03 | `serviceSetupStore.provision()`はsetupの準備要求を保存する前に`linux.accept()`へ進むため、応答消失時に操作IDと結果を一意に照合する契約が弱い。 | owner+contractの安定operation ID、入力digest、expected revision、fencing世代を先に永続化する。外部準備は同じID/参照で一回だけ送る。timeout/503後は照会し、結果不明を自動再作成しない。Linux workspaceを一回だけ作成/再利用し、端末増加で複製しない。 | DB確定前/送信直後/実行先確定後の停止・再起動、同時二要求、異内容同一ID、同一内容再送でLinux割当と請求を二重化しない。providerが照会/冪等性を保証しない場合は`uncertain`で停止。 |
| SIM-G04 | 準備完了はworker通知とsetup状態で扱うが、実行先の独立読戻しを同一operation/build/workspaceへ縛る縦断証拠がない。 | 署名付きworker receiptを既存key registryで検証し、実行先へread-only照会してowner、workspace、operation、manifest/model hash、保存/復旧、隔離、起動可能性を照合する。ready、credential設定済み、実機合格、本番合格を別状態にする。 | 偽receipt/旧worker/別workspace/ネットワーク断/部分準備はreadyにしない。実managed Linuxの隔離・実推論・usageはJOINTの別受入。 |
| SIM-G05 | `rockstar-service-attachment.ts`は純粋検証だけで、信頼済みissuer証拠・本人同意・端末鍵署名・親epochの権威読取とdispatchに接続していない。 | 信頼済み署名鍵resolver、現行service entitlement、端末session/challenge、scope/期限/失効と短期attachment発行・更新・検証をAPI/DBへ接続。URLやQRはrouting referenceだけとし、Bearer、SIM秘密、本人データを入れない。新規dispatch/有料・不可逆作用前に再照合する。 | 盗まれたURL、他owner、署名replay、親epoch変更、端末失効、scope越境、期限切れ、失効直前競合を拒否。attachment単独からJob/支払/外部送信の承認を作らない。 |
| SIM-G06 | eSIM非対応端末とSIM/端末交換、紛失、未払い時の親子失効・復帰が接続されていない。 | 本人のstep-upと相手端末の公開鍵所持を確認して子接続を発行。SIM交換時は親利用権を再照合してepochを更新、紛失端末だけを個別失効、未払いは新規管理実行を制限して仕事/成果を保持。復旧は同じworkspace/artifactへ戻す。 | iPhone+PC/Pixelの同一job/revision/hash、子端末個別失効、親停止で全子新規実行拒否、支払/利用権回復後の同一workspace読戻し。offline端末の即時失効は保証せずlease上限を測る。 |
| SIM-G07 | 端末ごとの導入・起動方式の適合とiPhoneの本人操作導線が未接続。 | capabilityと公開API/配布条件からWeb、既存OS client、端末専用adapter、正確な機種/署名済みimage/boot/復旧が受入済みのnativeを選ぶ。iPhoneは自動起動可否を実測し、不可なら本人が開くURL/App Clip/clientの必要操作・権限を表示。`avoado.si`を総合/Sky入口に使う。 | Web手動起動と無操作起動を別結果にする。未対応hardware/OSへ導入済みと表示しない。Pixel 10 GL066/frankelのAPK/QEMUと全OS image/flashは別gate。 |
| SIM-G08 | 同じ契約への端末追加、月次請求、usage、外部実費の照合を縦断で未検証。 | 既存の契約/usage/Invoice/決済adapterを使い、contract IDに基本料を一回だけ計上。商品料金、通信料、AI usage、外部実費、BYOK/OSSを別明細にし、事前単価/見積・上限承認を強制。未払い/返金/異議/復帰を一意の請求参照で照合する。 | 2端末/2再送/2月境界でも基本料・usage・請求各1件、超過cap拒否、Stripe sandboxの実request/応答/読戻し。支払方法登録は入金証明でない。実請求は料金/地域/税・外部契約のgate後だけ。 |
| SIM-G09 | 端末の前面画面や通信状態からLinux上の仕事継続・成果受取を推定すると、本人が端末を離れた途端に仕事を失う。 | 既存`lib/workflow.ts`、Cloud queue/checkpoint、保存済みautonomy grant、Brokerの予算/権限を同じjobへ接続する。durable acceptance後、承認済み範囲だけ管理Linuxが自律継続し、Cloud executor自身がofflineならlocalで完結する処理と外部作用待ちを分ける。成果はowner別inboxへ原本hash/revision/usage付きで保存し、別端末から読戻す。Run to Earnは実利用・成果の検収・収納済み収益に結び、接続権だけで報酬を発生させない。 | 端末電源断/通信断/再起動後も同じjob ID・checkpoint・成果/usageへ復帰。承認期限/停止/上限到達/失効後の新規外部作用0。未検収・未収納・単なる接続で報酬0。外部LLMは許可済みadapter先として別計測。 |
| SIM-G10 | 本人が求めた版付き電子契約とチェーン証明は、契約同意・秘密情報・実際のanchorを分けて受け入れる必要がある。 | 本文、契約版、料金/上限、owner同意時刻と署名を権威側に保存し、検証用のsalt付き証明digestを作る。chain/Wallet/地域と手数料が決まった後だけdigestをanchorし、transactionの確定を読み戻す。個人情報・契約本文・SIM識別子はchainへ載せない。 | 契約改ざん/旧版同意/別owner digestを拒否。未anchorは「chain証明済み」と表示しない。実chain送信・費用はOWNER/EXTERNALの条件と別gateが揃うまで行わない。 |

## 3. 実装順と責任

1. **ROCKの局所契約:** G01・G02の独立状態と版付きissuer adapter、既存DBの移行/旧reader/rollback、本人同意のrevisionと署名検査を作る。強いAndroid/eUICC導入証拠をiOS browser用の偽receiptへ置き換えない。`service_only`は商品契約上の区分で、実eUICC導入の証明ではない。
2. **ROCKの永続準備:** G03・G04を既存`sky-linux-service`に接続し、要求を先に保存、結果不明の照会、実行先からのreadbackを実装する。端末にLinuxを毎回作らず、owner+contractの保存先とjobを再利用する。
3. **ROCKの本人/端末と自律仕事:** G05・G06・G09を既存request auth、device link、Broker、`lib/workflow.ts`へ接続する。新規Web仕事は既存状態遷移を通し、owner条件、revision競合、費用/権限、停止を維持する。OS/Cloud間は同じ業務契約とfixtureを使い、端末を離れた後の成果を同じownerが別端末から受け取る。
4. **ROCKの体験と請求:** G07・G08・G10を画面/APIへ反映する。回線状態、profile、本人、利用権、端末導入、Linux準備、支払状態を普通の言葉で別々に表示。入力や開始の前に契約版、上限、承認を示し、失効/復旧/exportへ進める。電子契約とchain anchorの確定も別表示にする。一般公開や実課金を先行しない。
5. **JOINTの縦断:** EXTERNALのissuer、決済、managed computeの契約・資格が整ってから、同じprofile、本人、契約、iPhoneとPixel/PC、同じLinux/job/成果/明細で開通→準備→利用→端末追加→失効→復帰をsandboxから限定実機へ進める。OWNERは実端末の登録・本人同意・料金/地域条件を決定する。端末購入/初期化/bootloader解除/flash、署名鍵生成、サービス契約は設計指示から推測して実施しない。

`ROCK`は正確な状態と権限・失効・重複防止を実装する。`EXTERNAL`はissuerの真正な発行/導入/現在状態、host API、決済、computeを提供する。`JOINT`は同一profile/契約/端末/実行先の実証拠を突き合わせる。`OWNER`は契約同意、端末追加、料金/地域/保持、公開/実機操作を担う。相手未確定でもROCKのfixture、schema、失敗復旧は進め、外部未受入をROCK完了や本番合格へ昇格させない。

## 4. 検証、引継ぎ、完了判定

まず局所試験を実行する: `node --experimental-strip-types --test tests/rockstar-service-attachment.test.mjs tests/rockstar-service-setup.test.mjs tests/rockstar-entitlement-claim.test.mjs tests/esim-cloud-proof.test.mjs tests/esim-cloud-access.test.mjs`。変更したDB migration、issuer event、device-link、Linux、請求の意味ある負例を追加し、`npm run typecheck`、`npm run billing:check`、`npm run database:check`を適用する。UIを変更したら本人が使う該当画面を実操作する。Androidを変更したら`docs/os-prototype.md`のSQLite/SDK/APK/端末試験と対象branchのAndroid gate、nativeを変更したら対象Linux検証を別に実施する。統合前に`npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。容量・権限・ネットワークで失敗した検証は未合格とし、原因を直して再実行する。

最小の合格は、**ROCK側**では発行元署名fixture→本人/契約版→保存済みoperation→一回のworkspace準備/読戻し→二端末のscope限定接続→端末を離れても続く承認済みjob/成果/usage→別端末から成果読戻し→親子失効/復帰→基本料一回を、再送/逆順/応答消失/別owner/旧worker/時計ずれで壊さず、実DBとAPIから読み戻せること。電子契約の版付き同意とchain証明の未実施/確定も別状態にする。**提供者・実機**では同じ一周を許可済みtest profile、iPhone、Pixel 10 GL066/frankelまたはeSIM非対応PC、Stripe sandbox、管理Linuxで別々に記録すること。Web手動開始、Pixel試験署名APK、QEMU、全OS image、productionは各自のgateを守る。一般ローンチは保留。

`docs/templates/os-acceptance-report.md`および対象workstreamへ、対象commit/source hash、command、環境（host/fixture/provider sandbox/実機/本番）、操作数と時間、同じ契約/job/成果/usage/請求参照、正常/否定試験、未解決条件を記録する。長いlog、OS image、secret、原稿はGit外に置く。OS component/Sky Toolを変えたら`data/design-document-index.json`と全体/Tool詳細設計も同時更新する。`project.md`・`data/project-status.json`を着手/判断変更/検証完了で同期し、`npm run project:update`でREADMEへ反映。文書保存、作業branchへのcommit、GitHub保存、main統合、配備を別々に報告する。

最後にlocal RQ01〜RQ49とmain RQ50/アカウント単独利用、共通契約の月16 USD案と未確定の利用枠/超過単価、Sky単独Sandboxとの商品分離、同一契約の基本料重複防止、月最大888 centsの既存条件、ATM自社手数料0、Game交換の別gate、予測市場/実資金未許可、Pixel全OS未受入、iPhone無操作起動未受入を自己点検する。完了と呼べない段階はその原因・次の操作ID/参照・再現コマンドを残し、次担当が同じ証拠から再開できるようにする。
