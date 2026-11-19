## 2026-10-22 — eMudhra中間CAのTLS信頼修正（SYS01・ROCK／OWNER）

Mozillaが中間CA鍵8件の脆弱性を確認したため、Mac本人開発機で検査用TLS chainを実測した。ブラウザは12/12を拒否したが、旧Mac標準`curl`/Git/PythonとHomebrew Node 26.0.0/Python 3.15.0は受け入れた。HomebrewのNodeを26.12.1、CA bundleを2026-10-20へ更新し、同じchainの拒否を確認。Mac標準`/etc/ssl/cert.pem`は管理者認証待ちで未変更、標準`curl`/Pythonは現在も受け入れる。本人は管理者パスワードをTerminalへだけ入力する。Rock側はpatched Node floor、CI固定版、`verify`のruntime gateを追加。OS/Pixel/QEMU/本番Sitesのtrust storeと実配備SHAは別受入とし、このMacの結果を転用しない。[検査と復旧証拠](../evidence/emudhra-tls-remediation-20261022.json)。

## 2026-10-21 — 独立登録の公開と本人認証待ち（WEB04/OS10/SKY21・ROCK）

公開v98で `/account` と本人別APIを配備。実装・失敗/復旧・承認の正本は [独立登録契約](../rockstaros-complete-design.md#independent-rockstar-account)、証拠は `../evidence/rockstar-independent-account.json`。実署名10件/local Worker31 assertionsと、本人認証器/実Pixel/独立security reviewを分ける。OWNERは新credentialの作成と復旧コード保管、JOINTは同一ownerのWeb/Pixel一周。次は既存22件を保全して独立ログインを受け入れる。

# Security / Identity / Compliance

## 目的

認証、権限、秘密情報、署名、更新、依存ライセンス、個人情報、規制対象機能をfail-closedにし、コード完成と公開・本番許可を分離する。

## 現在地

- Web security header、PWA更新確認、暗号化された端末設定backup、sanitized診断を実装済み。
- QEMU候補のSBOM、Android物理端末gate、マイナンバーgate、署名拒否境界を機械可読化済み。
- マイナンバーは1/7 gateで無効。番号・カード画像を取得しない。
- QEMUと物理端末のproduction鍵、製品license、地域別販売条件は未完了。
- 運営1名で開始できる緊急保護policy、利用者OSと分離したOperator Dock、Access JWT／WebAuthn検証、専用D1命令キュー、署名付き端末channel、launcher非表示のAndroid Agent、端末側独立検証、Keystore identity、HMAC追記監査はsource実装済み。Android 15 emulator 6/6と試験署名Pixel 10の5/5は合格した。本番公開trust入力をrepo外から検査してproduct RROへstageする入口、StrongBox必須、factory reset無効、challengeごとの別端末鍵も固定済み。専用配備、production credential、実StrongBox attestation／Device Owner登録、remote Provider session失効、管理側侵害試験は未完了。
- npm依存には追加review対象があり、inventory完成を法的clearanceと扱わない。

主なtask: `SYS01`〜`SYS13`, `LCH02`, `LCH03`, `OS05`。

<a id="owner-identity-permission-safety-20261020"></a>
## 本人確認・権限・安全の共通受入契約（2026-10-20）

本人の追加要件を、最新版の共通RockstarOS環境と既存OS端末の接続へ適用する。主担当はSecurity / Identity / Compliance、ROCK、既存`SIM01`・`SYS13`。Web・Sky・Eve・管理Linux・Pixel/Mini/Proの各adapterは同じBroker判断を使う。RQ01〜RQ49、既存利用権・仕事・請求の意味を変更しない。以下は要求と受入基準であり、表に記した未完了を実装済みと扱わない。

| 領域 | 強制する契約 | 現在の根拠と残る差 |
| --- | --- | --- |
| アカウント・再認証・session | accountの本人認証、重要操作前の新しい本人再認証、端末/session一覧・個別/全件失効を分ける。sessionの発行者、保証級、最終使用、期限、失効時刻を権威側で照合する。 | `request-auth.ts`と`rockstar-device-link.ts`に通常認証・90日端末sessionと個別失効がある。全session・Cloud鍵・Broker鍵・Provider sessionの連動失効と高保証操作のstep-upは未受入。 |
| 端末とリプレイ | 本人が登録を承認した端末公開鍵へ、serverの一回限りchallengeを紐付ける。署名対象にowner、端末鍵、nonce、期限、method、正規化した宛先、本文digest、利用権epochを含め、署名/時刻/nonce消費を権威DBで検証する。再送/順序逆転/鍵rotation/再起動を負例にする。 | eSIM gatewayの署名付き要求とAndroid側nonce鍵準備は一部sourceにある。eUICC所有、本人関与、全clientの端末登録、issuerの現在状態を示すものではない。 |
| 簡単な強いログイン | 対応端末ではpasskey/WebAuthnを選べるようにし、RP ID、origin、challenge、user verification、credential失効をserverで検証する。非対応端末には同等の本人確認と回復導線を別定義する。認証器の成功を操作内容への同意へ昇格させない。 | Operator DockのWebAuthnは運営用の限定保守操作。一般利用者のpasskey登録・login・回復は未受入。 |
| principalと仕事権限 | 本人、家族/保護者、作者、運営者、外部Providerを別principal/roleとし、代理権と範囲を本人別に保存する。jobごとに読める資料、Tool/版、送信先、操作、実行先、期限、費用上限、改訂を固定し、毎回のclaimで最小権限を再計算する。家族という関係だけで本人の秘密・支払権を与えない。 | `workflow.ts`、A2A Broker、Sky capability envelopeは部分契約。全principal・全route・全executorで同一判定する実装は未受入。 |
| 個別承認・更新差分 | 支払、公開、外部送信、設定変更は対象・金額/宛先・内容digest・有効期限を見せ、操作ごとに新しい承認を取る。Agent/Toolの版更新で権限・資料・送信先・料金が増えたら旧grantを継承せず差分を示して再承認する。 | Broker承認とPackage/Tool審査を再利用。全更新経路の差分検出・実画面読戻しは未受入。 |
| 短期lease・失効 | 親利用権epoch、session、端末、Tool、job grant、予算を短期leaseへ束ねる。新dispatch/更新/有料または不可逆effectの直前に権威版を再読し、失効後は新規作用を拒否する。受領済み仕事は停止/精算条件に従い、offline残存上限と停止受領時刻を明示する。時計不明・rollback・旧workerは停止し、fencing世代と冪等effect claimで二重作用を防ぐ。 | 一部の鍵・grant失効とworker heartbeatは存在。eSIM/親子端末/Provider/進行中jobを横断する短期leaseと有限停止時間の実測は未受入。 |
| 信頼できる結果と他人の隔離 | 未確認の署名、時刻、利用権、料金は拒否。model/Agentの文章は提案で、本人承認、Tool成功、Provider入金receiptへ変換しない。ownerをbodyから採らず、仕事/ファイル/請求の読取・変更の双方で認証ownerと保存ownerを照合する。 | `request-auth.ts`、Broker、owner別storeに部分実装。全route inventoryと二owner/二workerの侵入試験は未受入。 |
| 秘密・監査・緊急停止 | 秘密鍵、API鍵、支払情報は用途別の保護場所に置き、rotation後の旧鍵・session拒否を検証する。監査はactor/role、対象、操作、承認、結果、時刻、改訂を改ざん検知付きで残し、本文・secretは残さない。運営保守は限定scope/期限/本人可視の追跡を必須にする。悪意あるTool、偽更新、紛失端末は対象だけを隔離し、全資格情報・実行中仕事・外部Providerの停止/結果不明を照合する。 | `SYS13`のOperator Dock/端末側制限・監査はsource/試験署名Pixelの限定証拠。production鍵、実StrongBox/Device Owner、Provider失効、侵害演習は未完了。 |

**受入順。** (1) 現在の全route/鍵/session/job/effect inventoryとowner越境の負例を固定、(2) passkey/再認証と端末challengeのserver検証、(3) job grant・更新差分・短期lease・失効/fencingを同一Brokerへ接続、(4) 紛失/悪意Tool/偽更新の封じ込めと監査読戻し、(5) 同一Pixel・実issuer/Cloud/Providerで停止時間、復旧、他owner拒否を別々に受け入れる。実eSIM・端末・本番の未確認を合格に換算しない。

**責任と証拠。** ROCKは契約、UI、Broker強制、owner別保存、試験、監査/復旧を実装。EXTERNALはIdP/WebAuthn authenticator、issuer、Cloud/Provider側の失効と鍵保護を提供。JOINTは同じowner/job/端末/利用権/請求で正常・紛失・失効を往復検証。OWNERは端末登録、重要操作、復旧、料金/公開を承認する。合格には正当系に加え、別owner、盗難session、replay、期限切れ、失効競合、更新の権限増分、旧worker、偽receiptを拒否した同一候補のcommand・artifact hash・読戻し記録を要する。

## 次に進める順番

1. 自作部分の製品license、適用範囲、第三者NOTICE/source提供条件を確定する。
2. owner管理下でproduction key ceremony、backup、rotation、revocationを実施する。
3. 同じ候補を正式署名後に再受入し、開発鍵の証拠を転用しない。
4. 外部OAuth／Providerごとにscope、audience、失効、監査証跡を受け入れる。
5. マイナンバーや地域規制は専門家確認と本人有効化までdisabledを維持する。
6. `SYS13`で本番WebAuthn公開値を外部入力としてstageし、StrongBox attestationとDevice Ownerを登録して、管理側侵害を含む閉鎖試験とproduction条件のPixel 10実機演習を行う。

## 完了条件

- 権限境界をコード、UI、監査証拠の三つで一致させる。
- 秘密値をGit、診断、成果物、クライアントログへ含めない。
- 開発鍵、合成データ、fixtureの成功を本番認証へ昇格させない。
- license、署名、個人情報、地域規制を別gateで判定する。

## 関連資料

- [Release minimum gates](../release-minimum-gates.md)
- [Signing operations](../release-signing-operations.md)
- [Owner manual signing](../owner-manual-signing.md)
- [Android and personal number gates](../android-and-personal-number-gates-20260913.md)
- [CSV security](../csv-business-security.ja.md)
- [Release readiness](../../data/release-readiness.json)
- [緊急アクセスとインシデント対応](../security-incident-response.md)
- [緊急アクセスpolicy](../../data/device-emergency-access-policy.json)

## 検証

- `npm run release:check`
- `npm run release:signing:check`
- `npm run web:security:check`

## SIM01 — eSIM gateway鍵によるCloud API認証

ROCK担当。本人が有効化したeSIM利用権へ登録済み端末鍵の要求署名を結合し、署名再使用、scope越境、鍵失効後のアクセスを拒否する。[詳細と導入条件](../sim-led-product-architecture.md#esimに結び付く端末鍵でのcloud-apiアクセス2026-10-07)。実eUICC/端末adapterはEXTERNAL/JOINT受入が残る。`node --experimental-strip-types --test tests/esim-cloud-proof.test.mjs tests/esim-cloud-access.test.mjs`、build後の`node scripts/check-work-api.mjs`、`npm run verify`を用いる。

共通サービス接続証明の純粋検証はSIM01・OS10/ROCKとして`lib/rockstar-service-attachment.ts`へ追加。合成Ed25519鍵で本人・契約版・親epoch・端末鍵・現在状態・scope・短期期限を照合する。EXTERNALは署名済みprofile状態と発行元鍵、JOINTは実issuerと二端末の同一契約・失効・復帰、OWNERは端末追加と契約同意を担う。`node --experimental-strip-types --test tests/rockstar-service-attachment.test.mjs`で局所検証する。現在段階は純粋logicのROCK実装であり、API統合・実provider・実機は未受入。

利用者が意図するeSIM→端末→本人別Linuxクラウドの安全性について、[正味5時間の調査プロンプト](../prompts/esim-security-chain-five-hour-research.md)に基づく[資料・source実調査](../esim-cloud-security-chain-research.md)を2026-10-20 11:53:27 UTCに正味300/300分で完了した。前日06:51:40〜本日10:55:40と、本日11:09:42〜11:11:43の未確認期間、tool待ちと端数は除外。旧native SI/eUICC経路の要求別source監査28行/F01〜F29、A/B/C/Dと指定チャットB0/O1〜O4の比較を保持する。指定チャットの最新明示方針は、eSIMを通信量でなく**本人別RockstarOSサービス環境の入口**とし、専用appを必須にせず既存OSのiPhone/Pixel/PCのbrowserからSky/Eve/Linuxを使うもの。新しいservice issuer/attachment、owner別workspace・仕事別sandbox、親/子端末失効、携帯off時のbounded autonomy、executor通信断、Sky追加とEve承認、販売者とissuer、署名鍵侵害を別の鎖としてS1〜S7/F30〜F44とS0〜S4 gateへ追加した。Sky Linux 16は隣接するsource/local fixtureだが新attachmentと実Cloud隔離の受入ではない。11:14 UTCの`npm run verify`はOpenSSL 3とlocalhost利用可能な条件でexit 0だが、並行作業のSky Linux sourceが11:28 UTCまでに変化したため、11:30 UTCの現source再試験はNodeのstrip-only modeが追加moduleを読めず0/2、全体verifyもmigration/journal不一致で停止した。並行実装の修正後11:38 UTCのSky Linux限定試験は14/14に復帰し、新Pixel後付け設定の8 host caseもpass。一方、全体verifyはNode 1029 pass/2 fail/1 skipでdatabase inventoryとAndroid Soong/Gradle manifestが未同期。11:44 UTCには修正後の`npm run verify`がexit 0（Node 1032 pass/1 skip、Worker/D1 1330、CSV 113）で、主要source SHAも前後一致。11:49 UTCのPixel後付け設定とSky Linuxの対象試験は23/23 pass。共有checkoutはなお編集中で、対象source SHAとGitHub refs/CIを11:50 UTCまで再読した。A2Aの送信直前の利用権照合/全egress仲介、実eUICC/applet/iPhone自動起動、専用Cloud、production安全性は未受入。

[セキュリティチェーン実調査](../esim-cloud-security-chain-research.md)を利用者の追加指示により2026-10-19 02:27:47 UTCから開始した。先行する事前確認4分は正味300分へ含めない。GitHub refs/CI、指定された再設計チャット、初期脅威、一次資料と現行sourceの照合を進める。正味300分の調査は完了したが、実issuer/eUICC・Cloud・端末・本番の最終受入は未達であり、採用方式・Cloud契約・実端末適合を確定しない。文書はローカル保存、作業branch反映・main統合・Cloud配備は未実施。

## 未検証early-access offerとcredential theftの比較資料（2026-10-17 / Rockstar account security参照）

[GTA VI調査§43](../gta-reality-bridge.md#43-追加調査fake-early-accessqrcode-downloadを公式security-guidanceで解く2026-10-17--security-ai06)ではRockstar公式のpassword/2FA/QR/PIN秘匿・domain/link確認・未知software禁止と、Kasperskyが観測したGTA VI fake-beta/preorder/download baitを分けて記録。Avocado既存Security/SIM flowに対しverified seller/domain、handoff field disclosure、credential/codes/seedsをchatへ貼らせない、urgency/rooted offer claimsのsource、report/recovery pathを受入観点にできる。噂や見た目のブランドはverified purchase/entitlementにならない。調査メモであり実装、allowlist、contract、warning UI、payment/Wallet authorityの変更ではない。

[GTA VI追加調査§46](../gta-reality-bridge.md#46-追加調査ugcのreport対象privacy-controlblock機能の限界を分解2026-10-17--securityrq14)はGTA Onlineのreport category/context、privacy-limited profile data、常時可視の情報、block後も残るUGC visibility/commentを比較し、Avocadoのreport receiptをenforcement outcomeと混同せず、block/mute/hide/report/appealとobject visibilityを個別に示す候補を記録。Rockstar settingを当社policyや安全保証に転用しない。

[GTA VI調査§123](../gta-reality-bridge.md#123-追加調査privacy-setting名blockugc閲覧権限は同じ範囲を制御しない2026-10-18--security-rq14-ugc) records Rockstar's specific “Me Only” and block limits: visibility, comments, direct contact and reporting are distinct controls. The candidate is to document exact object/action scope and reversible state; no Rockstar setting or Avocado privacy behavior changed.

[GTA VI調査§128](../gta-reality-bridge.md#128-追加調査age-ratingは国issuer対象mediaversionを結合し古いstore-copyと混同しない2026-10-18--rq14-security-regional-catalog) records rating-source conflicts across ESRB, PlayStation retailer copy and the Australian self-selected demonstration. Use issuing body, jurisdiction, exact product/version/media type, applicant/date and descriptors when reporting age suitability; a title string or stale storefront field is insufficient. No Avocado age gate or policy changed.

[GTA VI調査§137](../gta-reality-bridge.md#137-追加調査platform-account-linkはsource-identity-consent-unlink-active-userを通して検証する2026-10-18--security-ai06-identity-lifecycle) compares Xbox-specific publisher-account linking and user-change certification checks with the current Avocado device-link design. Preserve existing owner approval, protected session and revoke behavior; validate current owner after resume/device switch and show linked data purpose. These are QA analogies, not Xbox requirements applied to Avocado or GTA VI integration evidence.

Microsoft's privacy statement supplies Xbox data-sharing examples while treating game publishers as separate data controllers/relationships. Avocado consent copy should name data source/categories and explain unlink versus deletion of already-held provider data; no Xbox data permission or policy was transferred.

[GTA VI調査§153](../gta-reality-bridge.md#153-追加調査take-two特許やai報道はgta-viへの搭載証拠と分離する2026-10-18--rockstar-source-claims-llm-boundary) compares a Take-Two navigation patent with a reported CEO statement on generative AI. Keep the AI mechanism, evidence type, product/version and accepted runtime distinct; a patent or press statement cannot authorize an Avocado model, action or integration.

The official PEGI criteria update in [§145](../gta-reality-bridge.md#145-追加調査年齢区分購入表示任意性地域別表示を別々のclaimにする2026-10-18--rq14-catalog-trust-sim-e-sim) says an online game submission includes a privacy policy, standards that expressly prohibit illegal/harmful content, and reporting mechanisms that enable removal; entirely unrestricted communications with no disable/mute is a distinct rating criterion. Avocado candidate: if an already approved future UGC/community scope is considered, distinguish policy submitted, report received, case reviewed, content actually hidden/removed, appeal/reinstatement and tool state. A checkbox or a receipt alone is not proof of moderated/safe operation. No moderation workflow, developer requirement or feature was implemented or approved here.

[GTA VI調査§142](../gta-reality-bridge.md#142-追加調査公開範囲account-unlink-personal-data-request-retentionは別のprivacy-action2026-10-18--security-rq14-account-lifecycle) cross-checks Rockstar-wide linking/privacy support paths: public visibility is confirmed before link, unlink is available later, and personal-data review/deletion/retention are separate account-privacy and policy routes. Avocado candidate: distinguish privacy visibility, unlink/revoke, data access request, account deletion and provider-held data deletion with owner, path, status and policy-grounded retention. Rockstar's global policy is not GTA VI's data inventory or an Avocado legal requirement; no account/privacy setting changed.

[GTA VI調査§143](../gta-reality-bridge.md#143-追加調査account-unlinkの可逆性とデータ影響は接続先platformごとに確認する2026-10-18--security-ai06-identity-recovery) compares Rockstar's platform-specific unlink routes: Xbox/PS are self-serve, PC unlink is support-mediated and status-dependent, and GTA V/RDR2 console progress is tied to platform IDs. This does not establish GTA VI progress behavior. Avocado candidate: show exact connector route, relink limits, affected state and recovery before owner confirms disconnect; no account was linked/unlinked.

[GTA VI調査§146](../gta-reality-bridge.md#146-追加調査family-permission-feature-exception支出上限は異なるprincipalaction2026-10-18--securityrq14consent-model) compares platform family controls with Xbox per-feature privilege checks. For any separately approved managed-user product scope, keep the requesting user's identity, guardian authority, provider-data consent, feature permission, publish/share authority and task-specific spend approval as distinct decisions; refresh access after account/session/settings changes. Platform family permissions are not GTA VI/Avocado authorization. No child mode, policy, permission or financial behavior changed.

[GTA VI調査§152](../gta-reality-bridge.md#152-追加調査ゲーム予約の詐欺はtransaction-intentと永続permissionを混同させる2026-10-18--security-rq15-wallet-consent) adds the October 2026 Kaspersky fake-verification lure and Malwarebytes' observed wallet drainer alongside Ethereum/MetaMask guidance. For any separately approved Wallet action, compare the user-visible price with the exact payee, asset, amount and whether the signature grants one-time transfer or ongoing authority; explain that disconnecting differs from revocation and that revocation cannot reverse completed transfers. No wallet behavior or external connection changed.


[GTA VI調査§158–159](../gta-reality-bridge.md#158-追加調査公式creator-platform支援第三者rp運営gta-vi対応は別のclaim-2026-10-18-rq14-creator-ecosystem-trustsupport) adds a primary creator-service rulebook that puts `/report` and `/bug` at the incident surface, while its Terms and Privacy Notice last show a 2023 update date and describe legacy GTAV scope. For any approved creator/user-facing service, bind every policy copy to covered service and effective/update date; keep identity, age, approximate routing location, moderation evidence and transaction records purpose-scoped, and provide the actual support/report route. This reveals a source-freshness/review item only; no Avocado age/identity/privacy/moderation rule changed.


[GTA VI調査§162](../gta-reality-bridge.md#162-追加調査fivemのseller-listingはlive-auctionplayer-ownershipphone-tabletをつなぐがgta-vi機能証拠ではない-2026-10-18-rq14-rq13-boundary-workflow-analogy) notes a FiveM marketplace listing advertises fictional facial-recognition capture, wanted flags and locally cached images. This third-party RP asset is not a recommendation or Rockstar/Avocado capability claim. Security candidate: local storage does not on its own establish consent, purpose limitation, accuracy, retention or deletion; treat any real identity/media feature under the exact approved data scope and provide human-readable correction/report routes. No biometrics, retention or permissions changed.
[GTA VI調査§163](../gta-reality-bridge.md#163-追加調査ai-assistantの製品ラベルと実際のモデル権限を分ける-2026-10-18-rq14-ai06-security-boundary) records that Rockstar describes a GTA Online feature as “AI Assistant” while documenting a bounded list of actions/personas and no underlying model details. For Avocado, disclose actual planner/model location, inputs sent, network/dependency status and action set separately from persona; model output remains an untrusted proposal subject to Broker identity, policy and approval. A community FiveM voice-line matching example is unverified and has separate Rockstar voice-IP restrictions (§158); it is not an implementation or content source.

[GTA VI調査§164](../gta-reality-bridge.md#164-追加調査公式mission-creatorの学習試作推薦執行は独立した段階-2026-10-18-rq14-creator-lifecycle) records a GTA Online-specific Creator restriction and appeal path. Any authorized Avocado enforcement design should distinguish temporary access restriction from item takedown and permanent account sanctions, identify affected capability/scope, show expiry/review status, and offer an appeal route. This does not set Avocado moderation thresholds or policy.

[GTA VI調査§166](../gta-reality-bridge.md#166-追加調査購入者レビュー不正通報返金サポートは別の窓口と証拠-2026-10-18-rq14-trustsupport) notes that PlayStation's US review policy uses a dedicated report reason/details route and distinct support/refund help, and can remove ratings/reviews or take account action on violations. Candidate: scope identity/authenticity evidence narrowly, disclose public identity and incentives, separate the review complaint from safety/security incident and seller support, and make the moderation owner/status visible. Platform-specific policy only.

[GTA VI調査§167](../gta-reality-bridge.md#167-追加調査contextual-aiは送信元ごとの選択と状態表示を測る-2026-10-18-ai06-mat18-privacy-boundary) describes ContextCam's informed-consent research around several sensitive contextual inputs and user-controlled source toggles. Apply only as a review prompt: a future, separately authorized data source must have task-specific purpose, source-specific notice, confirm/disable path and minimal payload; context presence cannot serve as identity, approval or authority. No sensors or data collection were enabled.


[GTA VI調査§168](../gta-reality-bridge.md#168-gta-vi%E9%A2%A8fivem%E5%95%86%E5%93%81%E3%81%AF%E5%85%AC%E5%BC%8F%E4%BB%95%E6%A7%98%E3%81%A7%E3%81%AA%E3%81%8F%E8%B2%A9%E5%A3%B2%E8%80%85%E8%87%AA%E8%BA%AB%E3%81%AE%E6%83%B3%E5%83%8F%E3%81%A8%E6%98%8E%E7%A4%BA-2026-10-18-rq14-catalog-claim-provenance) provides an adjacent marketplace claim-provenance case: a paid FiveM “GTA VI-inspired” HUD was described by its seller as their vision, not known GTA VI design. Preserve the claim owner, source, scope and verification status; a seller badge/title is not a rights, safety or compatibility guarantee. No Rockstar content was copied and no policy changed.


[GTA VI調査§170](../gta-reality-bridge.md#170-gta-online%E3%81%AEcontent-rating%E3%81%AB%E3%82%B2%E3%83%BC%E3%83%A0%E5%86%85%E5%A0%B1%E9%85%AC%E3%81%8C%E4%BB%98%E3%81%8F) identifies a game-specific reward attached to a rating action. If Avocado ever rewards feedback, disclose benefit, eligibility and source and keep the reward record separate from evidence of install/use/compatibility; no Avocado payment or review rule changed.


[GTA VI調査§172](../gta-reality-bridge.md#172-escrow-protected-vs-visible-files-customer-version-drift) distinguishes a platform escrow claim from actual protected-file scope, NUI visibility and seller/customer update state. Future Avocado catalog reviews must not treat encryption as safety, rights or compatibility review, nor platform signing as a substitute for permission enforcement. This is a Cfx-specific example; no Avocado security policy changed.


[GTA VI調査§173](../gta-reality-bridge.md#173-generative-ai-source-material-and-rockstar-agreement-scope) notes the separate Rockstar ToS (last updated 2025-02-28), Creator PLA (specific Covered Games/platform scope) and 2026 mod guideline. The ToS says its limited license does not authorize using Services/Content, Virtual Items or Account to develop/train/enhance/provide source material for/promote generative AI; exact scope for each source and use needs review. Avocado candidate: source-owner/category/agreement/version/purpose/permission record and no-source fallback before ingestion; unresolved uses go to legal review. No Avocado training/data collection changed.


[GTA VI調査§174](../gta-reality-bridge.md#174-2026-mod-guidelines-multiplayer-ip-and-voice-boundaries) records Rockstar’s September 2026 guidance on voice/likeness permissions, multiplayer mod channel and monetization restrictions. Prior to any approved integration or creator catalog, verify exact game, platform, license channel, rights basis for voice/image/asset and unambiguous non-endorsement; keep “Covered Games” and live compatibility evidence explicit. It does not confer GTA VI access or modify Avocado policy.


[GTA VI調査§177](../gta-reality-bridge.md#177-client-input-is-untrusted-and-authoritative-server-checks) cites Cfx guidance that client event arguments and client-side checks are untrusted and that authoritative server-side identity, permissions, inventory/money, position and state must be revalidated. Cross-check against existing Broker/Wallet authority and idempotency; GTA Online virtual currency remains separate from RQ13 real-money Wallet. This describes FiveM, not GTA VI network protocol; no Avocado control changed.


[GTA VI調査§178](../gta-reality-bridge.md#178-remote-game-access-and-automation-boundary) records Rockstar ToS §6.4 limits on remote-server/virtual-PC service use, scripted automation and service/user-data interference absent express authorization. Distinguish ordinary authorized RockstarOS/Sky cloud inference from automation, remote access or data capture of Rockstar Services. Gate any future game-client, remote-play, account-linking or game-data integration on exact endpoint/data/terms/legal review; otherwise keep it non-connected. No integration or access was added.


[GTA VI調査§174](../gta-reality-bridge.md#174-2026-mod-guidelines-multiplayer-ip-and-voice-boundaries) also lists MOD-specific bans on real-money gambling/lootboxes/gacha, real-money virtual-currency sale, crypto/NFT promotion, third-party ads/sponsorship, and paid access to Rockstar-created assets/missions/DLC. Keep these Rockstar MOD restrictions separate from Avocado product contracts, but use as a hard screening reference before any licensed-game creator flow; no Avocado wallet/payment rule changed.


[GTA VI調査§180](../gta-reality-bridge.md#180-creator-community-moderation-and-ideation) cites a CHI PLAY study analyzing 2,900 Roblox creator-community threads/61,510 comments; it found boundary-negotiation and moderation-evasion discussions alongside design ideation. Candidate if an Avocado creator community is separately authorized: assess community docs/forums/templates as surfaces, with scoped guidance, reporting/appeal and checks for harmful exposure and false removals. Single Roblox subreddit, not GTA VI/Cfx evidence; no channel or policy added.


### Eveの記憶とMiniの管理SI（2026-10-20 / OS10・SKY21）

本人が会話の永続保存・端末変更後の引継ぎ・過去発言の再利用とMiniの管理SI方向を明示。Webのowner別AES-GCM保存とHMAC索引、出典付きrecallは[共通詳細](../rockstaros-complete-design.md#eveの永続記憶とskyコミュニティーos10--sky212026-10-20)へ接続する。fingerprint/face原本は収集せず、WebAuthn/OS認証のtemplateと会話/健康データを分離。心拍等のsensor種・同意・保持・保護者権限は未指定/未実装。Web実装をMiniのsensor実在能力、臨床判断、本番復旧や物理合格へ換算しない。Sky community加入は個人会話・健康データ・支払/実行権を自動共有しない。


### Community専用鍵（OS10/SKY21）

本人の最新指定で、accountとcommunity別アクセス鍵を両方必要とする。招待鍵・本人アクセス鍵・管理者復旧鍵を256bit乱数で分離しserverはhashだけを保存、鍵headerは同一originへだけ送る。失効/解除は新規入室/API/Addを拒否し、再招待には管理者許可を要する。clientのprofile別localStorageと鍵ファイルはWeb Previewの保管で、hardware key/E2EEではない。構成schemaは鍵/credential/script/権限追加を拒否する。既に本人へ渡った設定は遠隔消去せず、本番鍵保管/盗難・全損復旧/独立審査は別受入。[詳細](../rockstaros-complete-design.md#keyed-community-os)。

## 2026-10-21 — 生体認証・生体情報の本番利用条件

本人が「生体認証とか入るぐらいのレベル」を明示。現状はDeveloper Previewで、生体情報を本番保存できる受入は未合格。GrapheneOS上のAPK/AVFと、独自の署名済み全OS受入を区別する。

- 指紋/顔の認証原本はOSのTEE/Secure Element内で処理し、Eve/LLM/Linux/クラウドへ原本を送らない。認証済みという自己申告booleanを権限へ昇格させず、認証で利用可能になった鍵の署名・challengeを検証する。
- 今回のEve同期tokenはKeystore AES-GCMと端末unlockで保護しているが、BiometricPromptによる鍵の都度解錠は未実装。暗号化しているだけで生体認証済みとはしない。
- 会話履歴はowner別AES-GCM/HKDF、運営管理鍵で復号可能。E2EE未受入。未知の生体認証フィールドはAPI schemaで拒否するが、自由文内の生体情報を完全検出/除去するものではない。
- コミュニティーアクセス/復旧鍵のブラウザlocalStorage保管は残る弱点。専用vault/鍵解錠/失効/回復の受入前に高機密情報の保管庫と表示しない。
- 心拍/睡眠等のsensor streamは別のsensitive vault、目的別権限、保持期限、本人の解除/削除、監査を要する。SIの自動実行用低権限鍵と、高機密vaultの認証必須鍵を分ける。
- 端末紛失/悪性Agent/盗難session/管理側侵害/復旧を負例にした独立検収が未受入。Mini/Proの安全な鍵保管能力は機種別に受け入れ、Pixelの合格を移さない。eSIM利用権を本人認証やデータ暗号化の代用にしない。

一次資料: https://source.android.com/docs/security/features/biometric 、 https://developer.android.com/identity/sign-in/biometric-auth 、 https://grapheneos.org/features 。観測はsource照合であり侵入試験ではない。

### ChatGPT不要の本人登録（2026-10-21）

本人の明示要望で独立したRockstarOS会員登録と既存ownerへの独立ログイン追加を開発する。ROCK Web主担当の[実行プロンプトCORE01/CORE05](../prompts/rockstaros-common-core-development.md)と[OS契約](../rockstaros-complete-design.md#independent-rockstar-account)へ接続する。既存gateway確認の単純削除、client指定userIdへのcredential追加、メール一致による自動統合を認めず、新規server採番・認証済みownerへの結付け・復旧/失効を分ける。現状は準備のみ。新パスキー実登録・独立accountでの実機継続・生体vaultは未受入。
