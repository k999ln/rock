## Sky共通入口の最新仕様同期（2026-10-12）

最初に`docs/sim-led-product-architecture.md#sky-shared-entry`と`data/project-status.json`の`skyEntrySpecificationSync`を読む。利用者指定チャット「大学別NFCでSkyに接続」の最新指示で、単独Skyの既存Agentフィード・役割・Market・接続・Sky内Zemaを大学NFCと任意eSIMから共用する。旧専用Hubを新しい別サービスとして復活させない。briefは補助Tool。iOSはbrowser/PWAから開始し、App Clip/native/Siri連携は未実装の後続候補。eSIM/OS完成をWeb利用の前提に戻さない。

観測main `8c5891fcb5e04f69618837f52e1ae64afba34399`のColumbia入口と、root HEAD `37c06cec` + 5大学未commit差分は異なる。同一main SHAのcheck-run 8/8 successをdirty sourceへ流用しない。最優先は先行変更を保全してmainの入口/引継ぎとDB履歴を同期すること。`[campusId]`/`[campus]`、0059〜0063の番号とjournal/schemaを照合する。指定`rockstaros-kaiya...`の公開Skyと旧大学監査の`sky-marketplace...` v39は別Siteで、version/DB/受入を混同しない。

合格証拠は共通Skyの5大学表示/遷移、本人A/Bと無料枠、代表Agent一件の購入権/接続/見積/承認/Provider/成果/usage/停止/復旧、同じartifactのiPhone/Android実NFC/PWAとする。Cloud料金gateはfalseのsourceを確認済みで、単に解除して使える表示にしない。大学UIは別チャットで並行更新中だったため、再開時は最新source hashと検証記録を読む。公開/実機/課金が未受入なら、その条件を維持する。以下は履歴と詳細引継ぎとして読む。

## 大学別NFC Skyの追加引継ぎ（2026-10-12）

利用者の公開前調査依頼により、`docs/evidence/campus-sky-entry.json` のlaunchResearchに40作業の原因/修正/担当/合格条件・公式24資料・15受入シナリオを保存。先行差分を保全しmainとDB履歴を同期後、大学別Web/本人保存/学生証明、サーバー側remote MCP、AIの実料金/承認/予約/成果、有料枠、実NFC/QR/設置許可の順に進める。主要不足はPC依存のMCP実行、学生自己申告と在学証明の差、PC token由来の枠identity、false固定のAI料金gate、未確定の有料条件である。Figma/Slack等のclient登録制限を満たさず接続可能と表示しない。一般5/対象5大学学生6枠を保持し、1枠の定義・学生確認水準・追加枠価格・AI予算・採用MCP・初期配布対象を未確定のまま契約/課金しない。機能案や調査完了をruntime/公開合格に昇格させない。

最優先で先行dirty差分を保持しmainの引継ぎとmigration衝突を同期する。大学Skyは5大学URL・brief・Zema引継ぎ・一般5/学生6枠のlocal実装とverify済み。証拠は `docs/evidence/campus-sky-entry.json`。未公開。スマホ単独のcloud MCP実行とserver側の課金境界は未実装、有料追加価格は未定。既存public Sky v39のsourceへ今回の変更を反映済みと扱わず、同一候補の本人A/B・所属証明・実NFC/QR・iPhone/Android・復旧を受入してから学生向け利用可能と案内する。

## 2026-10-07 Git監査後の最優先引継ぎ

最初に `docs/workstreams/10-git-ci-operations.md` の「Git全体監査」と `docs/evidence/git-organization-audit-20261007.json` を読み、現在のGitHub main・作業branch・CIを再取得する。観測mainは `0fbf688b`、root HEADは `37c06cec`。全8 worktree中3か所に監査記録前127変更fileがあるため、全てを保全してから最新mainと引継ぎ入口を同期する。root全体をそのまま上書き・一括採用しない。

原因: rootの基準がmainより古く、PR #85へ回収済みのeSIM変更、mainのAMC/Web/cleanup更新、後続の署名・決済・仕事compositionが混在する。PR #85には8 file競合、root snapshotには31 file競合。mainの `0059_sky_library` とPR #85の `0060_esim_cloud_access_keys` を基準に既適用DBを確認し、未統合usage/proof migrationの番号・journal・schema・snapshot・試験を整合させる。手元160件/main378件のtask台帳はIDと後継契約・証拠で統合し、同じbaseline v1.96でも内容が違うことを扱う。

修正順: dirty tree保全と入口同期→CI成功済み依存/security PRの同一候補統合→PR #85競合解消と後続差分の選択→migration/進捗/設計証拠の同期→統合候補の `npm run verify` と同一SHA GitHub CI→main反映→重複branch/worktreeの整理。portable worktreeの25 file中20 fileはmainと同一、残りはmain側の修正・記録が新しい。Pro PC未commit5 file、PRのない `codex/os-completion-prompts` と `fix/readme-english-ci` の差分は回収判断まで残す。削除済みremote tracking38件の整理で未回収ソースを消さない。

合格証拠: migration union/既存DB保持・本人/署名/費用/二重実行の回帰、全体verify、same-SHA CI、必要変更のGitHub保存とmain読戻し、clean tree。今回のlocal verifyはNode897/API1178/CSV113でexit0だが、統合候補の合格ではない。文書保存・作業branch push・main統合・公開は別イベントで記録する。Claude文書は提案であり、アカウント主導への方針転換・新料金・実請求・契約・実機書込みをこの監査から推測しない。

## 2026-10-07 eSIMアクセスキー実装の引継ぎ

最初に最新mainと作業branchの入口・優先順位を同期し、既存未commit差分を保全する。main観測0fbf688b、local37c06cec/codex/esim-cloud-accessには対応remote refなし。この作業木へ登録済みeSIM gateway鍵のCloud API要求署名を追加。0061 migrationを含む候補のverifyはexit0（API1178/CSV113）。次はmain/先行変更を同期した候補で実端末signerとUIをprovider/OEM仕様へ接続する。eUICC保管の未確認を隠さず、cookie・端末署名・実eSIM認証の証拠を分ける。署名clientは`lib/esim-cloud-proof.ts`、既存API試験は`scripts/check-work-api.mjs`。GitHub保存・main統合・公開は別作業として記録する。

# RockstarOS SIM/eSIM-led service: current implementation prompt (2026-10-02)

## Main-SIM cloud service — 2026-10-07 steering

Read `docs/sim-led-product-architecture.md#main-sim-cloud-service` first. The user requests one reusable service template using the existing main SIM/Wi-Fi transport, with Sky agents running and metered in the cloud. A new carrier line is not a universal prerequisite. Preserve optional native/local/Web/app modes. Do not interpret a service-only claim/QR as an installed eSIM or run RockstarOS inside the eUICC.

First preserve pending edits and synchronize the latest main and this handoff into the implementation branch. Observed main `0fbf688b4585b829f9e34d37799d446cb5a66b32` has six completed/success check-runs; local HEAD `37c06cecc0dad6ebd59aa64a2900413df0ba2d68` on `codex/esim-cloud-access` is different and its matching remote ref was absent. Recheck before integrating. Main CI does not validate this dirty working tree.

Cause of the product gap: `esim-cloud-grant/access` requires a paid carrier order and exact profile/install/gateway evidence. Keep that contracted route intact; reuse the existing `service_only` claim/account route for the shared cloud experience, then define a separate accepted eSIM onboarding adapter. Never remove proof checks to simulate a non-carrier eSIM. Reuse workflow, owner/revision isolation, Package registry, shared reservations, metering and payment reconciliation. Direct LLM collection remains test-only; A2A Wallet settlement is not an additional card charge.

Acceptance order: same-owner claim → Sky quote/cap/approval → durable job → usage/result; cross-owner/tamper/duplicate/cap denial; main-SIM/Wi-Fi/offline recovery with one job and charge; contracted profile handoff on the exact device/OS; real Provider meter/invoice/payment reconciliation. Remaining conditions: provider/device permission to deliver a real profile, lifecycle/revocation terms, rates, funding, bounded provider execution and live collection. Keep AWS zero-owner-funding terms. Record local design save, branch save, main integration and publication separately. This section supersedes the mandatory carrier-activation journey below only for the new service-only/main-SIM mode.

## AWS partnership preparation — 2026-10-05 steering

Latest cost constraint: the owner explicitly refuses paying for this AWS initiative. avokado out-of-pocket/payment liability is zero. Seek substantial sponsored capacity and technical collaboration, with development compensation as a separate proposed negotiation item. Credits alone do not prove zero liability: resolve excluded usage, overages, expiry, taxes and wind-down with the sponsor before any billable resource. Do not ask again for a self-funded monthly budget or enable paid conversion. No sponsorship or compensation has been agreed.

The user wants AWS cloud adoption and a partnership aligned with the existing design; the supplied company name/country is avokado llc, United States. Read `docs/provider-contract-readiness-20260930.md#aws-partnership-preparation`. First, before runtime implementation, synchronize current GitHub main and these handoff priorities into the implementation branch while preserving concurrent edits: observed main is `592daeea322cd47aa189b67dd689e323662c0c67`, local HEAD is `37c06cecc0dad6ebd59aa64a2900413df0ba2d68`, and `codex/esim-cloud-access` had no matching remote ref. Recheck these values; no same-SHA CI was verified for this preparation.

Prepare the US AWS Startups/GenAIIC architecture-review and pilot request. Outreach text stays outside Git; contact details, funding history, account, region/model and budget remain open. Do not represent a prepared request as sent, approved or partnered. Begin with a proposed existing-controller/AWS-runtime pilot, then evaluate moving the controller/API/DB to AWS. Resolve A2A 1.0 versus sample wire-format differences, scoped service auth/owner binding, ephemeral session recovery and quote/usage/invoice boundaries with a pinned adapter. Preserve all existing local/native/Web/eSIM modes, gates and 12 cloud-continuity tests. Validate local fixtures first, then contracted AWS sandbox on the same artifact, then production and billing separately. Save preparation, GitHub push, main integration and deployment as separate states.

Treat `docs/product-baseline.md`'s 2026-10-02 product direction and this prompt as authoritative over older OS-first or eSIM-store copy. The product is physical-SIM/eSIM-led access to RockstarOS services, not an eSIM store inside an OS. A purchased SIM/eSIM offer includes RockstarOS, Sky, Zema, and integrated-agent access; the OS binary is delivered separately through an accepted device route.

Historical audit anchors retained by `data/product-baseline.json` (not claims about this checkout's current HEAD): main `7cdbb5fedc86ee3978ed329d9312147d137c9199`, native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`, design `de5b102d3525daccf604efd5685bdf8c14ad5d50`. Confirm current refs independently before a merge or release.

## Required user journey

1. A physical SIM or eSIM is purchased through a carrier, Rockstar, device retailer, or online channel. Purchase distribution and carrier activation may be separate systems.
2. The user activates the carrier line through the carrier's supported flow. Display line activation independently from Rockstar service entitlement.
3. The user signs into one Rockstar account and claims a one-time, seller-issued service entitlement. Do not infer service access from a SIM profile or network registration.
4. Route using exact device/SKU evidence: accepted signed RockstarOS install only when image, OEM permissions, boot/recovery, and rollback are accepted; otherwise use an existing-OS app/client or browser. SIM/eUICC capability alone never proves OS compatibility.
5. Home opens Sky, Zema, and Agents directly using one identity. A submitted cloud job persists and runs while the client is offline; reconnect retrieves the same job's progress/result without automatic duplicate submission.
6. Before paid execution, show provider price/rate and estimate, obtain explicit user approval for a task budget cap, and reject work that would exceed it. During execution distinguish the reserved ceiling from provider-reported spend. Afterward show itemized provider usage and separately identify invoice/payment reconciliation status.

## Reuse and implementation order

Preserve channel-neutral signed entitlement claims, owner-scoped identity/device authorization, device capability/attestation, durable A2A/Cloudflare jobs and recovery, quote/rate-card verification, shared atomic budget reservations, signed cumulative meter snapshots, receipts, and result artifacts. Do not replace these with a new billing/job framework.

Current local coverage: channel-neutral signed entitlement claims, owner binding, claim-code redaction, seller handoff fragment/file parsing, refund/revocation events and `/connect` claim registration are implemented and locally tested; these do not represent a connected seller or real SIM sale. The Android Shell now also has a source-level native claim import through its owner-scoped device session (Shell API v18), with explicit account binding and no automatic retry. Local Worker/D1 API tests pass 960 assertions, including claim first redemption, same-owner retry, cross-owner/tamper rejection, and device-home redemption availability. Android Shell exposes service scopes and same-job task detail; API v17 added cancellation, and task detail now performs same-delegation Cloud/Wallet readback after app restart. The Broker compares exact owner/job/agent/quote/approval terms to its persistent Wallet reservation and does not replay work; confirmed pre-dispatch terminal jobs have a separate explicit release action.

Offer-specific initial agent packs now have a shared, optional `ROCKSTAR_SERVICE_OFFER_PROFILES` mapping from signed `issuerId + offerId` to a versioned set of exact Sky package keys and manifest hashes. Only currently verified packages are listed as ready, and installation/execution remains an owner choice. Keep Lifeline/Healthcare/Developer packages unset until real package review and product contracts exist; the local fixture package is not a healthcare product or evidence of automatic installation.

Next independent work: run the existing Android CI workflow to compile the AIDL/APKs and execute Shell/Broker instrumentation; test same-job process restart, exact local reservation recovery, owner/terms mismatch, pre-dispatch-only reservation release, and native purchase-claim submission. This checkout has no usable JDK/Gradle/Android SDK and no attached test device, so the workflow/device result is still absent. Continue auditing stale/missing meter and invoice-state presentation without opening the paid execution gate. The authenticated channel-neutral seller delivery API and encrypted idempotent store are now locally implemented; actual checkout/refund/webhook adapters remain contract- and sandbox-dependent. Keep carrier activation separate from Rockstar entitlement and retain the capability-based native OS/app/browser route. Do not claim local usage or test claims are production bills or purchases.

## Evidence labels

Record behavior in three separate categories: implemented in source; locally verified by named tests/fixtures; accepted in a provider/carrier/device/production environment. Local usage rows and synthetic receipts are not production bills. A source build is not an Android APK/device acceptance. A signed claim fixture is not a real purchase. Do not claim carrier activation, production billing, or OS installation without matching external readback and exact-SKU acceptance.

## Completion checks

Run focused tests first, then `npm run project:check`, `npm run baseline:check`, `git diff --check`, and `npm run verify` when feasible. Preserve all existing user changes and unrelated dirty files. Keep `SIM01` in progress until purchase distribution, carrier activation, production billing, and at least one supported client/OS route have their required acceptance evidence.
