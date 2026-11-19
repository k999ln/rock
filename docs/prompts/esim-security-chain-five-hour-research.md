# eSIMから専用クラウドまでのセキュリティチェーン — 5時間調査プロンプト

作成: 2026-10-18、追記: 2026-10-20（America/New_York）。利用者の最新意図は、eSIMを本人専用RockstarOSサービス環境を準備する入口とし、既存OS端末からSky・Eve・Linuxの仕事を使うこと。その**サービス利用権と本人・端末・クラウド実行を結ぶ信頼**を調べる。この文書は**調査の実行指示**であり、単独では300分の調査、実eSIM連携、専用クラウド配備、実機または本番の安全性合格を示さない。実行経過と証拠は[別の調査記録](../esim-cloud-security-chain-research.md)に残す。

## 実行する担当への指示

あなたは`k999ln/rock`のSecurity / Identity / Compliance担当（SIM01、ROCK主担当、実carrier/eUICC/端末接続はEXTERNAL/JOINT）。開始・中断・再開・終了を時刻付きで記録し、**正味300分**を一次資料の確認、既存source監査、脅威分析、方式比較、検証計画、自己反証に使う。待機時間やツール待ちを調査時間へ加えない。300分前に「5時間完了」と報告しない。調査だけで危険な実操作を始めない。途中経過は要点のみ伝え、根拠のない安全保証をしない。

### 調査する問い

「eSIM購入に紐づくサービス利用権を信頼の起点とし、RockstarOS/Sky/Eveの仕事を本人別Linux環境と仕事別sandboxで処理すると、**何の脅威に対して、どの条件で、どれだけ**安全性が上がるのか。反対に、何は改善せず、どの新しい攻撃面・運用負担が増えるのか」を答える。旧設計・現行sourceの`Zema`名と、最新方針の`Eve`名は時点を明記して照合する。

対象は、新標準案の`サービスissuer/契約 → 本人/account → 一回だけのworkspace準備 → 端末鍵/親epoch付きattachment → Cloud API → 本人別Linux/仕事別sandbox → Broker/外部LLM・Tool → 成果/usage → 失効・復旧`と、旧native SI高保証案の追加部分`carrier/eUICC → profile導入/現在状態 → 正確な端末/boot`の端から端まで。各矢印について**誰が誰を、どの証拠で認証するか**を記す。サービスissuer、通信eSIM、電話番号、EID/ICCID、通信回線、端末、本人、OS image、Cloud権限、仕事ごとの本人承認を同一視しない。eSIMにOS binaryを入れる前提を置かない。

Rockサービス用eSIMの購入は、端末からCloudへの全通信がその回線やprivate APNを通る証拠ではない。AndroidのWi-Fi/別SIM/VPN/default network切替、carrier→Cloudの専用接続、公開URLへのfallbackを別の候補として扱う。閉域網を構成する場合も、TLS/要求署名、本人・仕事認可、外部LLMへの再送信は独立に検査する。

製品方針のRQ01〜RQ49、SIM/eSIMからのサービス利用開始、Pixel 10 GL066／`frankel`の別native候補、既存OS client/browser、Sky共通契約、Eve（現行source名Zema）のjob、透明な見積・上限承認・itemized usageを維持する。eSIMがない既存Web/PWA入口と物理SIM offerを勝手に廃止しない。一般ローンチ保留を維持する。今回の比較は端末内Linux Terminal/AVF、OS全体をbuildする一時的な専用x86_64 Linux、**製品の仕事を実行する本人別Linuxクラウド**を別物として扱う。

### 並行するRockstarOS再設計調査との接続

**2026-10-20の明示方針を優先して再読する。** 指定チャットの最新決定と[SIM主導の製品設計](../sim-led-product-architecture.md#esim-service-attachment)、[提案中の接続契約](../../contracts/rockstar-service-attachment.json)を確認する。eSIMの主商品は通信量ではなく、ownerに隔離されたRockstarOS環境、Sky、Eve、Linux、LLM/Agentへのサービス権利。既存iPhone/Pixel/PCのOSを交換せず、共通clientから同じworkspace/job/成果へ接続する標準案である。端末ごとのnative OS buildをこのサービスの前提にしない。以前のnative SI版の「通信profile現在active」を**新サービスの全jobへ一律に適用しない**。新サービスissuerの契約状態、通信profile/network、端末接続、本人承認、Cloud実行を独立stateとして扱う。旧native SIのeUICC/carrier保証は現行実装監査として保持し、新しい`rockstar.service-attachment/1`は提案中でruntime実装済みと扱わない。

「専用」はまずowner別の永続workspace・保存・権限・費用台帳と、非信頼Agentごとのsandboxを意味する。物理host、GPU、Cloud accountをownerごとに専有するかは別の脅威・契約・費用で比較する。端末が圏外/電源offでも、事前に承認・記録された`autonomyGrant`内の仕事はCloudで続き得る。Cloud executor自体が外部と通信不能な場合は、外部作用を成功扱いせず待機/照合する。親契約epochと子端末接続の失効、新規dispatch、受理済みjobの停止/精算を別々に検証する。URLやapplet起動は公開の案内参照に留め、credentialや本人権利にしない。eUICC搭載appletとiPhoneの自動前面起動は未受入として試験項目にする。

指定チャットの最新UX修正も追う。端末側の**専用アプリは必須にしない**方針で、iPhone/Android/PCの既存ブラウザを第一候補とし、Mini・時計・TVなどは能力に応じた別の入出力adapterを検討する。本人に見える入口は一つでも、Eveの依頼/承認/成果とSkyの探索/作者管理は役割を分け、仕事ID・予算・権限は同じ権威契約へ結ぶ。画面が開くこと、eSIMが導入されたこと、本人が仕事を承認したことを同一状態にしない。2026-10-20のチャットではPixelの限定local model実行は報告されたが、新eSIM接続、iPhone自動起動、全端末対応の実証ではない。ブラウザ非対応端末や端末内LLMの可否を個別gateにする。

同チャットで後から明示された「まずPixelでeSIM追加からSky/Eve利用開始まで」「料金提示→契約→支払い準備/照合→利用開始」「OSのsystemが完成したら組み込む」も追う。[Pixel後付け設計](../sim-led-product-architecture.md#pixel-service-setup)と[既定無効の組込記録](../../data/service-setup-integration.json)を読み、後付け用の状態機械と実OSへの組込時期を区別する。料金見積を見せること、継続請求への同意、決済手段の登録、実際の入金、真正なeSIM/サービス利用権、Linux実行環境の受入を別receiptにする。準備中の実装を完成済みのPixel縦断受入や実課金へ読み替えない。後付けモジュールがnative OS gateを要求しても、既存browser標準案を暗黙に廃止しない。両経路の対象商品・保証級・導入時期を明記する。

利用者が指定した[「RockstarOSを再設計」チャット](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)を、調査開始時に最新まで読む。同チャットは15時間の独立調査を進めており、現時点の[OS構造比較メモ](/Users/kaiya/.codex-work/visualizations/2026/10/18/01a14d54-daee-7c30-87a8-faea84641a40/rockstaros-independent-os-abstractions-matrix.md)のO1「仕事台帳」、O2「権限マイクロカーネル」、O3「続き・外部作用」、O4「成果物グラフ」は**競合する発明仮説**である。比較メモの結論や作業時間は更新され得る。現在のGit/sourceで合格した設計として引用しない。

今回の安全調査では、同じeSIM発行・端末紛失・悪意ある作者Agent・Cloud管理者侵害・仕事の結果不明・別端末復旧を、既存OS client＋Cloudの強い対照（B0）とO1〜O4の各案に当てる。各案について、どこで端末鍵を検証するか、誰がCloud workerへ縮小権限を渡すか、Linuxのfile/network/GPU/secret到達をどう遮断するか、失効後にどの成果と復号鍵が残るか、B0より改善する**測定可能な条件と棄却条件**を一行ずつ記す。特にO2の「全経路を仲介する」主張を、作者codeの直接socket、共有mount、ambient credential、Cloud API、外部Providerで反証する。O1/O3は再送・課金の一回性、O4は原本の取得・復号鍵・形式を読む手段・実行環境・外部サービスの利用権・成果検収を分けて別端末復旧を調べる。保存データの存在だけで復旧合格としない。

旧native SI/Pixel条件の比較とは別に、新標準サービスの同一契約/iPhone・Pixel/Cloud条件で、盗難URL・偽販売receipt、親/子失効、悪性Agentの他owner到達、携帯offとexecutor通信断、Sky追加とEveの仕事承認混同、別端末からの原本/鍵/費用回復、料金見積・契約・決済手段・OS/Cloud準備の混同の**七trace**をB0+とO1〜O4へ同一入力で当てる。B0+にはWebAuthn再認証、鍵結合token、durable仕事、job別sandbox、Broker送信/費用gateを与え、OS案の差を弱いWeb対照に見せかけない。詳細なN1〜N7の判定表は[実調査](../esim-cloud-security-chain-research.md)へ残す。

再設計チャットの「Linux」はPixelの隔離VM、Proの候補host、Cloud workerで意味が違う。同じbinaryを全端末へ要求せず、ゲームや任意Terminalのroot/shellをAgentの共通権限にしない。より良い構成が見つかれば現行案との差分・必要な方針判断として提案できるが、この5時間調査だけでO1〜O4の一つを製品の確定方針へ昇格させたり、並行する15時間調査を終了扱いにしたりしない。

同チャットが後から追加した強い既存対照も追う。Macaroons/Biscuitの権限縮小と失効、Zanzibarの因果版、Nexus等の跨端末Run、DevicesWorldの全端末postcondition検収、端末通信profileは、B0を意図的に弱くしないための材料である。発見・転送・TLS接続や端末一台の部分成功を、eSIM利用権・本人の外部送信同意・最終Tool請求・別端末成果回復の合格へ換算しない。元チャットの未採用案や研究著者の限定結果をRockの製品実績として引用しない。

### 着手時に確認する正本と現在地

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/04-security-identity-compliance.md`、`docs/prompt-playbook.md`を読む。設計入口は`docs/rockstaros-design-portal.md`、OS/Sky詳細は`docs/rockstaros-complete-design.md`と`docs/sky-tools-complete-design.md`。`docs/execution-approval-20260909.md`と`data/execution-approval.json`の実装承認と、配備・端末操作の個別gateを分ける。
2. `docs/sim-led-product-architecture.md#esim-service-attachment`と`contracts/rockstar-service-attachment.json`の**新標準サービス案**を先に読み、同文書の旧「eSIMに結び付く端末鍵でのCloud APIアクセス」とnative SI subscriptionは別経路として読む。`docs/security-incident-response.md`、`docs/rockstaros-1.0-architecture.md`、`docs/phone-preview-20260911.md`、`docs/llm-evaluation-architecture.md`、`data/llm-capabilities.json`、隣接する`docs/evidence/sky-linux-service.json`を読む。`data/project-status.json`のSIM01/SYS13と`phaseGates`を照合する。古い監査や別branchの成功を現在のmain・実機・本番の証拠へ転用しない。
3. `git status --short --branch`で既存dirty差分を保護する。`npm run prompt:context`またはGitHub connectorで、その時点のmainと実在する対象branchの40桁SHA、関連PR、**各SHAのCI**を再取得する。取得に失敗した項目は「最新確認未了」とする。mainが対象branchに未反映なら引継ぎ入口・優先順位の同期を最初の実装課題とする。調査のためにdirty checkoutをreset/mergeしない。
4. 現行sourceの`lib/esim-cloud-proof.ts`、`lib/esim-cloud-access.ts`、`lib/esim-cloud-grant.ts`、`lib/esim-install-proof.ts`、`lib/request-auth.ts`、`lib/rockstar-service-access.ts`、`app/api/esim/orders/[orderId]/cloud-access/route.ts`に加え、`lib/sky-linux-service.ts`、`lib/sky-linux-service-store.ts`、`toolkits/sky-linux-service/`、関連migration/route/test/evidenceを読む。必要なreceipt/端末adapterも追う。まず**旧eSIM grantと隣接Sky Linux sourceの実装あり・host/fixture合格、新service-attachment runtime未実装、実eUICC/実Cloud/本番未受入**をpathと証拠で示す。現在の`RockEsimProof`は登録gateway鍵の署名であり、eUICC内秘密鍵の保持や現在のprofile有効状態を毎回直接証明しない。cookie/Bearer経路も存在するので、適用先・fallback・越境条件を別に調べる。

作成時のGitHub読み取り: `npm run prompt:context`は失敗。GitHub connectorでmain `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、作業branch `codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`を確認した。mainの同一SHAの`verify`はsuccess。作業branchの同一SHAは`source-preparation`一件successであり、全体CI合格ではない。open [PR #130](https://github.com/k999ln/rock/pull/130)のheadは`codex/main-catchup-20261014`であり、eSIM作業branchのPRではない。これらは作成時snapshotで、調査開始時に取り直す。`data/product-baseline.json#auditInputs`の旧main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、旧native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、旧design `de5b102d3525daccf604efd5685bdf8c14ad5d50`は履歴照合だけに使う。

### 5時間の進め方

**0〜35分 — 主張と脅威を固定。** 「eSIMで固くなる」「専用クラウドで固くなる」を、他人のprofile流用、偽販売receipt、service issuer鍵侵害、端末盗難、鍵抽出、SIM再発行、API再送、権限越境、悪意あるAgent、運用者侵害、Cloudホスト侵害、外部LLMへの漏えい、結果不明時の二重作用、圏外失効の各脅威へ分解する。保護対象は本人データ、秘密鍵、Tool権限、費用上限、成果、可用性。攻撃者の能力と信頼境界を明記する。

**35〜95分 — 一次資料を調べる。** GSMAの現行consumer eSIM RSP/SGP.21・22・25、carrier/eUICC認証・証明書・profile再発行の条件、AndroidのKey Attestation/StrongBox/Verified Boot、NISTの電話番号・SIM変更に関する認証上の注意、候補クラウドの分離と責任分界を調べる。開始点は[GSMA eSIM compliance](https://www.gsma.com/solutions-and-impact/technologies/esim/compliance/)、[GSMA SGP.25](https://www.gsma.com/solutions-and-impact/technologies/esim/gsma_resources/sgp-25-euicc-for-consumer-and-iot-devices-protection-profile-v2-1/)、[Android key attestation](https://developer.android.com/privacy-and-security/security-key-attestation)、[Android Verified Boot](https://source.android.com/docs/security/features/verifiedboot/verified-boot)、[Apple CTCellularPlanProvisioning](https://developer.apple.com/documentation/CoreTelephony/CTCellularPlanProvisioning)、[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)、[AWS責任分界](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/shared-responsibility.html)。実行時の版・適用条件・発行日/取得日を確認し、規格の保証範囲をRockstarOSの実装済み範囲に置き換えない。各重要主張に一次資料のURLと節を付ける。

**95〜155分 — 既存実装を監査。** 発行元証拠、profile binding、install receipt、gateway鍵、要求署名のURL/method/body/期限、replay拒否、scope、owner、rotation/revoke、返金・契約終了、Cookie/Bearer、管理APIの拒否、仕事ID/予算/receiptの結合を一行ずつ追う。対照表を`要求・source path/行・host/fixture証拠・未確認・攻撃時の影響`で作る。まず既存の限定試験を実行し、失敗は再現条件と環境を残す。コードの存在、試験成功、実carrier、実端末、本番配備を分ける。

**155〜220分 — 三方式以上を同条件で比較。** A: 共用cloudの本人別論理隔離＋仕事別sandbox、B: Rockstar専用account/VPC上のLinux worker、C: 単一tenantの専用hostまたはprivate cloudを必須比較とする。必要ならconfidential computing/HSMを独立した追加策として評価する。「専用」の物理host、account、network、鍵、運用者、データの意味を分ける。同じ本人job・機密データ・外部LLM/Tool・攻撃モデルで、侵害時の到達範囲、管理者権限、パッチ/監視/復旧、可用性、費用、運用可能性を比較する。さらに再設計チャットのB0とO1〜O4をこの同一traceに当て、OSの抽象を変えた場合でもeSIM→Cloudのチェーンが閉じるか調べる。**Linuxであること自体を安全性証明にしない。** 端末内処理とクラウド送信なしの経路も対照に入れる。

eSIMの増分も、通常Cookie/Bearerだけの経路に対してではなく、WebAuthn等の本人再認証と短命の鍵結合tokenを備えた強いWeb対照へ同じ端末/仕事/Cloud条件で追加して測る。仕事の意味・送信先・費用については認可flowの署名と最終外部作用receiptを分ける。比較可能な同一vendor/computeを用意できない場合、Cloud account/hostの単独効果は測定不能と記録する。

物理SIMでも同じcarrier状態照会、本人/端末鍵、Broker、Cloudを使った対照を置く。eSIMの遠隔導入・profile変更/再発行が不正利用や復旧時間へ与える差を測り、「eSIM」という形式だけで物理SIMより安全と結論しない。

**220〜270分 — 鎖の候補と失敗試験を設計。** 新標準サービスは`service issuerと契約 → ownerと一回だけのworkspace準備 → 端末鍵・親epoch・scope付きattachment → 本人の仕事承認/autonomyGrant → Cloud workload identity・本人別環境・仕事別sandbox → Brokerの外部作用 → job/usage/receipt → 失効・復旧`を主鎖とする。旧native SIの高保証経路は別に`carrier/eUICC profile・portの現在証拠 → 受入済み端末/boot`を追加する。各矢印の検証者、鍵、期限、監査証跡を定義し、eUICC署名やcarrier privilegeを利用できない場合の保証級を示す。SIM swap/profile再発行、盗難URL/QR、重複activation、別owner workspace混線、悪性Agent、Cloud管理者、親/子端末失効、携帯offlineでも継続する承認済みjob、executor通信断と結果不明、費用の二重計上、本人回復を負例にする。失効後の既存成果回収を維持する。

**270〜300分 — 反証と実行順。** 最も強い反例を五つ以上挙げ、採用案でも残るリスクを明記する。保護が増える脅威/増えない脅威/新たに増える負担を表にする。新標準サービスの`source/契約 → issuer・既存OS sandbox → 本人別Linux pilot → iPhone/Pixel縦断受入 → production判断`と、旧native SIの`carrier/Pixel/全OS`を**別gate**で提案する。どのgateで「対象契約・端末・仕事についてサービス鎖合格」と表示できるか、同一artifactのreceipt、復旧証拠、独立レビューを定める。価格、月額利用枠、クラウド契約、アプレット/自動起動の未指定は事実として残す。

### 納品と合格条件

- `docs/workstreams/04-security-identity-compliance.md`の既存SIM01節へ結論を追記し、詳細は同節から参照できる関連資料に置く。新しい日付付き入口を乱立させない。採用/不採用/保留と理由、信頼境界図、方式比較、脅威・対策・残余リスク表、実装差分と修正順、担当ROCK/EXTERNAL/JOINT/OWNER、試験手順と停止条件を残す。
- 指定チャットのB0/O1/O2/O3/O4を**同じ五つ以上の攻撃・復旧trace**で比較した表を納品し、現行方式の改善で足りる点とOS構造変更が必要と立証できた点を分ける。チャットの研究メモを参照した箇所は版/取得時刻を示し、実機・製品採用証拠へ昇格させない。
- `docs/sim-led-product-architecture.md`の現契約と矛盾させず、設計変更を提案する場合は旧仕様、変更理由、後方互換、本人向け説明を明示する。OS componentまたはSky Toolの変更を確定する場合だけ、`data/design-document-index.json`と対応する全体/Tool詳細設計を同期し、`npm run design:check`を通す。研究だけで本番鍵・秘密・eSIM発行/端末書込み・Cloud契約・公開を操作しない。
- `project.md`、`data/project-status.json`へ開始・中断・終了、正味時間、読んだsource/branch/SHA/CI、試験結果とログのGit外保存先、未解決、次の担当の具体的な一手を残し、`npm run project:update`でREADMEへ反映する。製品方針への新しい明示変更が実際に必要な場合のみ`docs/product-baseline.md`と`data/product-baseline.json`を理由付きで更新する。Git保存、作業branch反映、main統合、配備を別々に記録する。
- 既存の限定検査 `node --experimental-strip-types --test tests/esim-cloud-proof.test.mjs tests/esim-cloud-access.test.mjs`、適切なAPI/端末試験、`npm run baseline:check`、`npm run design:check`、`npm run project:check`、`git diff --check`を使う。最終的にAGENTS.md所定の`npm run verify`を実行し、失敗なら失敗箇所と未合格範囲を残す。長いログ・実秘密・原文はGitに入れない。

終了報告は、**正味300分の記録**、最重要の答え、選んだ方式と棄却条件、実装済み/未受入の境界、次のgate、保存先を短く示す。eSIMの規格適合や専用クラウドの名称から、本人確認・OS完全性・Cloud安全性・仕事の承認・商用運用の合格を推定しない。
