

Custom domain: **avocadomini.si** is registered for the [deployed GitHub homepage](https://avocadomini.noellesugar1.chatgpt.site); DNS/TLS validation is pending. See the [deployment and DNS record](docs/workstreams/05-web-pwa-sites.md#avocadominisi2026-10-05web13).
<!-- sky-access-recovery:start -->
Skyが接続を確認している間や、通信失敗・サインイン切れの間は実行を停止します。画面を開いたまま別タブでサインインし、戻って「接続を確認」してから改めて実行してください。再確認だけでは再実行や課金をしません。未保存入力は開いている画面に保持されますが、再読み込みでは消える場合があります。接続設定の復旧時も編集した入力を保持し、保存済み設定を読み直せない間は保存できません。
<!-- sky-access-recovery:end -->
## Skyの公開判定

`npm run sky:launch:check`で不足を確認できます。`node scripts/check-sky-launch.mjs --require-stage focused`は、既存の本人隔離・復旧条件に加え、実クラウドAI、公開版の両端末試験、全Tool分類、Apple Payが未受入なら失敗します。CSVの既存50円決済成功は、これら全部の合格を意味しません。

## Skyの回答取得・会話引継ぎ（v28配備、実AIは準備中）

OpenAIを選んだ会話で「この依頼文を仕事へ引き継ぐ」を押し、仕事を選んで見積を確認します。この操作だけではAI送信や課金は始まりません。保存した回答にはMarkdown取得と本文削除の確認画面を用意しました。未送信の依頼文はreloadで消えるため、必要な内容は手元に保持してください。実AIの接続は準備中です。

<!-- sky-cloud-text-preview:start -->
Zemaの「仕事」からクラウドAIの依頼準備・見積履歴を確認できます。仕事は再読込後も同じURLへ戻り、認証期限切れは同じ仕事へのサインインを案内します。回答のクラウド保存は初期offです。現在、実Provider資格情報・信頼済み料金・請求照合は未受入のため、AI実行は準備中です。入力してもAIへの送信や課金は始まりません。料金未設定時は見積もりも保存できません。
<!-- sky-cloud-text-preview:end -->

PAPER市場は検証用です。提案後に同じ画面で内容を承認し、実行したレシートは「PAPER実行履歴」から再読込後も確認できます。サンプル価格は実売買の実績ではありません。
ココナラの案件管理では、サインイン切れ時も開いている入力画面を保持します。ダイアログの別タブでサインインし、「サインイン後に接続を確認」してから保存します。再確認だけで案件を再送しません。
<!-- sky-service-recovery:start -->
CSV受付の完了結果・検査・ダウンロードは `/csv` の同じ画面で確認できます。認証が切れた場合はサインイン表示から `/csv` へ戻り、保存済み受付を再取得してください。Stripe診断はHTTP status・許可済みerror code・request IDのみを記録し、秘密値・入力本文・Provider messageを記録しません。50円本番CSV試験は支払い照合・成果物保存・再取得まで確認済みです。クラウドAIの実接続は未受入です。
法務・特許の端末内処理は、任意チェックで本文を含まない実行履歴を保存できます。未ログインや履歴保存失敗でもローカル結果を保持し、別タブのサインインから復旧します。
履歴保存の失敗時は固定の診断コードと、完了通知の場合は受付IDを表示します。本文や元例外の内容を診断へ送らず、ローカル計算の例外を自動再実行しません。
IP StudioはPCで起動してから専用画面を開きます。スマートフォンからPCへの接続は準備中のため、PC内アドレスへのボタンは表示しません。
ココナラの案件管理は、17項目の案件内容と変更履歴を本人別にサーバーへ保存します。実機で下書きの作成・編集・再読込を確認済みですが、ココナラへの契約送信や送金を代行しません。
発注前の案件は「下書きを削除」で対象を確認してから削除できます。担当開始後の案件は削除せず、通信失敗時は一覧を再読込して結果を確認します。
クラウドAIは料金見積・支出上限・利用明細の接続まで実行を停止します。オンライン法務・特許には20秒の通信上限を用意し、結果不明時に自動再送しません。実Providerの応答・使用額は未受入です。
接続状態は一般商品の購入・販売とCSV専用50円試験を分けて表示します。CSV決済の設定を、一般商品の販売開始とみなしません。
クラウド文章生成の料金表v2は通常入力・キャッシュ読込・キャッシュ作成・出力を分けます。見積は最高入力単価を使い、実使用量やtierが不明なら費用確定を止めます。本文を含まないrequest-bound quote、親jobで共有する予算予約、一度だけの送信claim、利用明細と任意成果保存は正本ローカルで接続しました。会話UI・公開環境への接続と実Provider受入は残り、クラウド実送信は無効です。内部予算は入金済みWallet残高ではありません。
Toolのサインイン切れでは、元の画面を開いたまま別タブでサインインし、「サインイン後に接続を確認」を押してください。接続確認だけでは実行せず、未保存の入力を保持します。
掲載候補の下書きは、入力を添えた定型テンプレートです。AI分析や外部サービスの実行ではありません。顧客インタビューと予定調整は、根拠・テーマ・日時などを本人が確認して記入します。候補の本文・結果はサーバーへ保存しないため、必要な内容はMarkdownで手元へ保存してください。
<!-- sky-service-recovery:end -->

<div align="center">

<img src="docs/brand/avokado/avokado-motion-v2.gif" alt="avokado product concept: one slim silver avocadoMini R5 stands beside the words PLAY, MAKE, and LIVE with subtle animated lines" width="100%">

# avokado

### One SIM/eSIM. One Rockstar account. Cloud AI and agents with clear usage costs.

Our primary service is SIM/eSIM-led access to **RockstarOS**, **Sky**, **Zema**, and integrated agents. A SIM purchase is intended to include service access; the OS binary itself is installed only through a supported device path and is not stored on the SIM.<br>
The dedicated **avocadoMini R5** and small-satellite launch vehicle **rocketstar** are separate design programs, not prerequisites for using RockstarOS services.

[Start RockstarOS service access](app/connect/page.tsx) · [Product experience](#product-experience) · [Feature details](#feature-details) · [Current status](#current-status) · [Design library](#design-library) · [Still image](docs/brand/avokado/avokado-r5-editorial-hero.png)

</div>

> **About the image** — The R5 visual above is concept art based on the intended industrial design. The animated lines are a brand treatment, not a photograph of working hardware or proof of a spatial display.

**Open the design documents:** [avocadoMini R5 PDF](docs/avocado-mini-r5/package/avocadoMini_RockstarOS_R5_Integrated_Design.pdf) · [RockstarOS v1.0 PDF](docs/rockstaros-complete-design-v1.0.pdf) · [rocketstar R1.0 PDF](docs/rocketstar-design/outputs/rocketstar_Complete_Design_R1_0/rocketstar_Complete_Design_R1_0.pdf) · [Complete design index](#design-library)

## The RockstarOS service avokado is building

The lead product is **SIM/eSIM-led access to RockstarOS services**: a physical SIM or eSIM purchase is intended to include access to RockstarOS, Sky, Zema, and integrated agents. The OS image does not have to live on the SIM. Supported devices can use an approved RockstarOS installation path; other devices use a compatible app or browser client. This service is the primary customer entry. avocadoMini R5 and other hardware concepts remain separate device programs, not prerequisites for using the service.

The product promise is fast access to cloud LLMs and agents, clear usage-based prices, and a short path to Sky/Zema. A single Rockstar identity should carry across these services. Users see a price estimate and approve a budget before paid work, follow current spend while it runs, and receive itemized usage after. The software already contains local workflow, recovery, identity, capability, and synthetic usage-ledger parts, but carrier service, production billing and supported-device installation are not accepted yet.

![Intended relationship between avocadoMini R5, RockstarOS v1.0, Sky, and Zema](docs/brand/avokado/avokado-system-map.svg)

| Audience | Intended value | Product or system |
| --- | --- | --- |
| SIM/eSIM customers | Start using cloud LLMs, agents, Sky and Zema with one account and transparent costs | RockstarOS SIM/eSIM service access |
| Players and families | Play in a way that fits them—using body movement, hands, Japanese voice input, and other methods—and resume later | avocadoMini game experiences and RockstarOS |
| Creators and learners | Change rules and works, compare conditions, sources, and versions, and preserve invention candidates with evidence | Game creation, learning, Material Invention, and the Asset Registry |
| People getting work done | Find tools, ask AI teams for help, and keep track of results, costs, and failures | Sky, Zema, Tools, and Wallet |
| Tool developers and businesses | Deliver capabilities with explicit versions, permissions, execution locations, and outcomes | Sky catalog, SDK, and MCP/provider connections |

**Delivery is staged.** The web app, Linux/QEMU Developer Preview, and test-signed Pixel APK running on an existing OS are separate validation tracks. The dedicated R5 device remains at the basic-design stage and has not been approved for manufacturing, sale, or general distribution. The business goals and validation order are documented in the [product north star](docs/product-north-star-20260915.md) and [product and business strategy](docs/rockstaros-1.0-strategy.md).

### Revenue and participation

- First, we measure whether useful games, creation tasks, and work actually complete. Tool completion, delivery, revenue, and provider-confirmed payment are separate events.
- Sky keeps registration, connection, publication, and base usage free for developers and businesses. When a verified Tool sale occurs, Sky's marketplace commission is 10%; external payment, model, cloud, and other pass-through costs are shown separately.
- **The proposed USD 8.88 user revenue fee is on hold.** No new fee will be accrued or billed until the revenue path, fee basis, calculation, cap, collection method, and consent are defined. Earlier USD 8.88 calculations are historical design and test records, not current pricing. Live billing and live payouts have not started.
- The R5 hardware price, release date, and reservation terms are undecided. Pricing from the older Tower20 E3 design does not carry over to R5.

See [Sky Tool teams and economy design](docs/sky-network-economy.md) and [Wallet/provider responsibility boundaries](docs/external-wallet-fund-provider-boundary-20260913.md).

## Product experience

The primary service flow is **choose a supported SIM/eSIM offer → activate the carrier service → sign in once and claim RockstarOS access → install the signed OS only on a validated device or use its compatible client/browser → open Sky and Zema → submit an agent task with a visible estimate and spend limit → reconnect to review progress, results and itemized use**. Purchases from the proposed carrier, device-retail and online channels will include RockstarOS service access. Those fulfillment, activation and billing connections remain unaccepted.

| 01 — PLAY | 02 — MAKE | 03 — LIVE |
| --- | --- | --- |
| Select, move, collide, combine, and separate particles. Undo recognition errors, save, and continue later. | Edit game rules and creative work. Compare scientific-model conditions and preserve versioned invention candidates and evidence. | Extend the same interaction model to lower-risk everyday assistance such as procedures, timers, interruption and resumption, and the last observed time and location of an object. |

This is the **planned order of experience development**. It does not mean that all three stages already work on physical R5 hardware. The product is not designed to release physical particles or manufacture physical compounds.

### avocadoMini R5 — separate hardware-program requirements

The PLAY / MAKE / LIVE flow below describes the separate R5 hardware experience program. It is not the entry requirement for the SIM/eSIM-led RockstarOS services product described above.

**R5 is the current design baseline.** It begins with a single unit capable of the basic functions.

![R5 envelope comparison; dimensions and component placement are not final manufacturing drawings](docs/avocado-mini-r5/package/drawings/R5-M01-envelope.png)

| Area | R5 design baseline |
| --- | --- |
| Appearance | No more than 200 mm tall in use; a slim silver cylinder with a black camera band and low circular base. Final dimensions, mechanisms, and hole locations are undecided. |
| Stand-alone operation | One unit handles input, local compute, game state, storage, voice, and stopping. A separate Edge Hub, PC, or continuous internet connection is not a basic-function requirement. |
| Expansion | Additional identical minis may collaborate after owner approval, device authentication, and clock and coordinate calibration. Performance will be measured separately with one, two, and four units. |
| Power | External power is required. The current design does not use a battery. The connector, rating, and thermal design will be finalized together with the display method. |
| Display | The requirement is to show particles in the surrounding real space without glasses, but the method and safety remain research topics. Infrared sensing light, a television, AR glasses, or wall projection do not count as proof that this requirement is met. |

The [51-page integrated R5 basic design](docs/avocado-mini-r5/README.md) ([PDF](docs/avocado-mini-r5/package/avocadoMini_RockstarOS_R5_Integrated_Design.pdf) · [Word](docs/avocado-mini-r5/package/avocadoMini_RockstarOS_R5_Integrated_Design.docx) · [complete ZIP](docs/avocado-mini-r5/avocadoMini_R5_Integrated_Design_Package.zip)) contains requirements, candidate components, comparative calculations, drawings, and assembly and acceptance plans. Fourteen automated checks reproduce arithmetic and decision conditions; **zero physical-device tests have been completed, and manufacturing approval is on hold**. The “four units plus a separate hub” Tower20 E3 material still visible on the public product site is classified as a [historical design](docs/avocado-mini-tower20-e3/README.md).

## Feature details

### 1. Input, Japanese voice, and accessibility

The design translates hand and body position, short Japanese commands, and physical input into semantic operations: select, move, confirm, cancel, and stop. Nearby targets use hand position; distant targets use direction. Multiple candidates are never confirmed automatically. If tracking is lost, the system does not misinterpret the loss as a release; it cancels the hold or pauses instead.

- From first-run setup, users can choose seated operation, one-handed operation, small movements, or non-voice input. Body calibration is not a condition of participation.
- Voice validation begins with short local commands. Recognition and execution approval remain separate; an ambiguous “yes” never authorizes billing or an external action.
- Camera and microphone indicators, a physical stop control, and guest settings are part of the design. Raw image and audio storage and external transmission are off by default.

[Interaction states and error prevention](docs/avocado-mini-r5/package/integrated_design.md#17a-%E7%A9%BA%E9%96%93%E3%81%AE%E4%B8%AD%E3%81%A7%E9%81%B8%E3%82%93%E3%81%A7%E5%8B%95%E3%81%8B%E3%81%99%E6%93%8D%E4%BD%9C) / [Startup and input-selection diagram](docs/avocado-mini-r5/package/drawings/R5-U01-startup.png)

### 2. Games

The default particle sandbox uses the smallest loop of “select → move → release → collide/combine/separate → undo → save/resume.” It preserves rules, random seeds, and work versions so a state can be reproduced. Shared use accounts for clock and coordinate drift, disconnection, and one participant stopping. The author SDK receives semantic operations so a game does not automatically gain raw-image or payment authority.

**Commercial-game support is evaluated title by title.** This input design alone does not mean that games such as GTA run, can be modified, or have official integration. [Game features and acceptance conditions](docs/avocado-mini-r5/package/integrated_design.md#03-%E3%82%B2%E3%83%BC%E3%83%A0%E3%81%A8%E5%88%B6%E4%BD%9C%E3%81%AE%E5%9F%BA%E6%9C%AC%E6%A9%9F%E8%83%BD) / [Game and Wallet workstream](docs/workstreams/08-game-market-fund.md)

### 3. Creation, learning, and asset management

The concept supports editing a game's appearance, rules, and stages and saving the result as a versioned work that can be rolled back. Learning use distinguishes an interesting result from a scientifically correct one and shows the model, units, initial conditions, and limits. Before a work leaves the system, the Asset Registry records its author, source material, generation and edit history, version, license basis, cost, and publication scope. Generation completion and publication success are separate states.

### 4. Material Invention

This application track creates reproducible digital candidates from two or more materials, ratios, and processes; checks hazardous conditions and evidence; and hands candidates to simulation or Patent AI. Material Invention Core manages the candidate graph, versions, and provenance. What exists today is an **equipment-disconnected sandbox Core and an integrated design**. **The Material Invention interface and Sky connection are not implemented**; R5 physical sensors, the spatial interface, simulation providers, and external laboratories are not connected. A candidate is not proof of a material's physical performance or patentability.

[Material Invention system design](docs/rockstaros-avocado-mini-complete-design.md) / [Core design](docs/material-invention-core.md) / [Ownership and acceptance](docs/workstreams/11-material-invention-avocado-mini.md)

### 5. Everyday assistance

Short interactions learned through games are extended gradually to next/back steps, timers, interruption and resumption, and the last observed time and location of an object. Compatible device actions such as lighting are accepted individually only after checking the target device, effect, authority, and result. The product does not promise the current location of an unseen object, physical completion of household chores, medical judgment, or unattended operation of locks or heating devices.

### 6. RockstarOS / Local AI

![R5 functional stack; this is a logical design, not a claim of implementation](docs/avocado-mini-r5/package/drawings/R5-M02-functional-stack.png)

RockstarOS centralizes user and component authentication, capabilities, approvals, work, receipts, storage, and recovery in the Platform Core and Broker. The on-device LLM is an **untrusted planner that returns plan candidates**; it does not decide whether a Tool may run. An Agent advances only through finite procedures allowed by the Broker and handles stopping, awaiting confirmation, and safe recovery after a restart. Models and runtimes are designed to be replaceable in the future, but general replacement is not complete.

[Current OS v1.0 source and appendices](#rockstaros-v10--current-os-design) / [Complete OS design](docs/rockstaros-complete-design.md) / [Shared AI-native OS architecture](docs/ai-native-os-architecture.md) / [LLM implementation and open work](docs/llm-evaluation-architecture.md)

### 7. Sky, Zema, and Tools

**Sky** is the entry point for discovering Tools and AI teams and comparing their author, version, permissions, execution location, and cost before connecting. **Zema** takes a request and manages input confirmation, planning, progress, stopping, user approval, deliverables, and history as one unit of work. Chat text and AI answers are not themselves approvals.

[Sky Market](/sky/marketplace) is the searchable AI and automation Tool storefront, including LLM entries. It separates the 12 built-in catalog entries, 22 integration candidates, and externally reviewed Registry packages, and links built-in entries to their individual Sky pages. A listing is not proof of connection or production operation. Third-party packages appear only after a valid `verified` review. Eligible reviewed packages can now use the Stripe Checkout integration described below; one-click external installation remains a separate integration.

Sky home and Market use the same Tool cards and keep search visible. Select a Tool's icon or “機能・利用条件” to see its purpose, connection state, supported environment, and cost. On Sky home, the action for a built-in browser Tool opens its dedicated app or input page without a separate Sky registration step; required sign-in and execution checks remain in that page. PC-only Tools retain their PC connection step, while integration candidates distinguish Sky registration from a working external runtime. Market actions open the individual Sky page. The icon there opens the same overview, and “使い方・ライセンス” expands the full instructions. Opening an overview does not install or run the Tool.

Sky home and the market hide only tools that are clearly incompatible with the browser's device class by default; in the market, expand the environment details to review the filter and reveal excluded tools with reasons. This does not verify installed software or external accounts. In particular, Jev Router remains a PC CLI candidate, not a Sky one-click connection.

Tool providers can open [Sky registration](/sky/register) directly from the market. Previous provider name and support URL can be reused from their own submissions, and remote MCP inspection can fill the server name for review. Pricing must be selected and described explicitly; the market shows the pricing model before opening a package. [Rock Studio](/sky/publish) remains the separate SDK setup flow. No checkout or developer payout is activated by registration.

**Sky Market payments:** providers use [Sell](/sky/sell) to register a Stripe Express receiving account, then set a JPY price, sale terms and refund policy for their own reviewed `external_contract` package. Buyers select the package, check its terms, pay on Stripe, and return to [Purchased tools](/sky/purchases). Sky verifies Stripe's payment before showing purchased access and connection information. This supports one-time purchases of eligible automation or LLM packages; listing a built-in Tool or model provider does not automatically make it purchasable. Sky takes a 10% application fee; payment-provider costs are separate, so that fee is not Sky's net profit. Card and bank details stay with Stripe. Providers can refund the remaining unrefunded amount from their sales page.

The implementation and local mocked-provider tests are present. Stripe credentials, provider sandbox acceptance, live payments and deployment have not been completed. Configure the four server-only `SKY_PAYMENTS_MODE`, `SKY_STRIPE_SECRET_KEY`, `SKY_STRIPE_WEBHOOK_SECRET` and `SKY_PAYMENT_ORIGIN` settings and apply Web D1 migration `0018_sky_commerce.sql` following the [payment setup and acceptance guide](docs/sky-billing.md#sky-market決済2026-09-27実装). Test and live data are isolated. Purchase access is a Sky record; a third-party paid MCP service must enforce its own access and revocation. The live Web server relies on the trusted Sites identity gateway, while Stripe's signed webhook path must be publicly reachable. This purchase flow does not enable the retired USD 8.88 revenue fee or prove bank payout completion.

Zema lists the 22 catalog candidates as separate, searchable Bots with distinct icons. The sidebar shows a short selection first; use search or “すべて表示” to open the full list. The selected Tool's actual connection state and next action appear before sending a message. The 11 former Mr. candidates can produce local drafts; 10 external research candidates produce only tool-specific connection plans; IP Studio opens its local app when available. These entries are not evidence that an external runtime or provider is connected.

**Managed local runtime — first local milestone verified; overall work in progress.** The goal covers usable Tools across Sky, Zema, and the OS without users starting each server separately, with local inference preferred. The local Web runtime now starts the bundled MCP Connector and Fashion service when needed. Browser checks confirmed a synthetic Fashion Producer plan saved to the database and matched by readback, plus a Zema delivery sample automatically connecting and returning a real verification `PASS`; nothing was delivered externally. The 34-entry source inventory contains 6 browser-deterministic base functions, 3 Web API/database applications, 2 separate-PC-service Tools, 1 external-AI Tool, and 22 candidates (11 template drafts, 10 connection guides, and 1 separate-app launch). An LLM does not implement their missing adapters. Fashion's four providers remain mock/unconnected, and restoring its result after a page reload is not implemented. No local model was installed; installation awaits the owner's response. Ledger, IP Studio, individual adapters, real providers, hosted-Web-to-PC relay, and native OS acceptance remain open. Focused runtime tests passed 35/35 and isolated API regression passed 172 assertions; the full suite remains 378/389 passing and full verification stops at the existing visual baseline. [Executor inventory, evidence, and remaining scope](docs/sky-tools-complete-design.md#13-%E5%85%A8tool%E3%81%AE%E5%AE%9F%E8%A1%8C%E5%99%A8%E6%A3%9A%E5%8D%B8%E3%81%97%E3%81%A8%E7%AE%A1%E7%90%86runtime%E9%80%B2%E8%A1%8C%E4%B8%AD)

The Web Preview uses avokado's graphite, silver, and pale-blue appearance across Home, Sky, Zema, Studio, Wallet, Market, Settings, and CSV. Home's former default lime accent is migrated to pale blue; other colors chosen in Home settings remain yours. This visual update does not change Tool availability, native OS builds, or the published product site.

| Representative Tool or team | Function | Boundary |
| --- | --- | --- |
| CSV Operations | Clean CSV data, run an independent review, and generate delivery artifacts | Sales, customer sharing, and payment are separate |
| Mercari Revenue Starter | Draft listings for owned items and organize costs and expected net proceeds | The owner lists, communicates, and ships; revenue is real only after provider confirmation |
| Fashion Brand Ops | Prepare campaigns, DM and quote drafts, post-order production, and analysis | Posting, advertising, sending DMs, billing, and refunds require action-specific approval |
| Citation Organizer / Free Article | Organize URLs and produce a free introduction from the user's draft | Does not perform fact-checking, autonomous writing, or external posting |
| Legal Intake / Patent Assistant | Organize information and prepare drafts based on official sources for experts or filings | Does not make legal determinations, determine patentability, or file automatically |
| Market Scanner / Fund | Estimate prices and demand, record PAPER activity, and compare configurations against evidence | Live orders, returns, and live-fund operation require separate acceptance |

CSV inputs stay intact when a request is retried or submitted concurrently. Requests older than seven days cannot be processed or retried; start a new request.

The catalog also includes Tools for checking Coconala opportunities, reconciling delivery records, and subscription advisory work. A candidate Tool is not considered operational merely because it is listed. [Complete Tool inputs, outputs, storage, and failure behavior](docs/sky-tools-complete-design.md) / [Project guide](PROJECTS.md)

[Coconala in Sky](/sky/tools/coconala) combines the pre-application check with an owner-scoped record for prime-contractor orders and separately agreed worker compensation. Its 3% helper is an estimate; it neither contracts on Coconala nor verifies receipts or sends payments.

### 8. External AI, IP, games, and destinations

The design does not lock creation or game destinations to a single service. Providers are selected by capability, destination, commercial terms, cost, region, and quality. Image, video, 3D, and audio generation; social publication; game submission; and reward assignment are separate effects. External transmission, publication, and purchases require owner approval that fixes the target, content, and spending limit. If the result is unknown, the system queries and stops.

Higgsfield, Roblox, YouTube, and GTA are examples of possible destinations. **This is not a list of supported products, official partnerships, or guaranteed compatibility.** [IP Studio connection contract](docs/sky-tools-complete-design.md#85-ip-studio--%E4%BA%A4%E6%8F%9B%E5%8F%AF%E8%83%BD%E3%81%AA%E5%88%B6%E4%BD%9C%E9%85%8D%E4%BF%A1%E3%82%B2%E3%83%BC%E3%83%A0%E5%B1%95%E9%96%8B)

### 9. Wallet, costs, and verified earnings

Wallet treats cost estimation, reservation, and finalization; signed Earning Receipts; and refunds and reconciliation as separate concerns. Finishing work alone does not create displayed earnings. Owner assets and external-provider payment, custody, and identity verification remain external responsibilities under the shared contract. Game-currency exchange, ATM, Fund, and live payouts each have their own gates; PAPER or fixture success is never treated as live-money acceptance.

[Wallet, billing, and provider workstream](docs/workstreams/03-wallet-billing-providers.md) / [Game-exchange boundary](docs/game-wallet-release-checkpoint-20260910.md)

## Current status

| Track | Verified | Incomplete |
| --- | --- | --- |
| avocadoMini R5 | Integrated basic design, 51 pages, eight design-study diagrams, and 14 calculation checks | Zero physical-device tests; unaided full-space display, precise 3D input, final enclosure, thermal and power design, manufacturing drawings, and safety acceptance |
| RockstarOS v1.0 | Current 41-page, 32-chapter OS/system-software design; five deployment profiles, 13 logical services, 60 requirements; 43/43 appendix structure and DDL checks | New OS image, R5 Device Profile and adapter, and physical-device, onboard, and field acceptance. Document checks are not operational tests. |
| rocketstar R1.0 | Current 44-page, 35-chapter integrated rocket design with 60 requirements and 18 system interfaces | Manufacturing drawings, physical performance, and flight certification. Comparative calculations are not final performance. |
| Web / Sky / Zema | Source for screens, catalog, work, approvals, history, and the Tool foundation | Current-version readback for each deployment, external providers, and production commercial acceptance |
| Pixel 10 GL066 | Pre-tests on an existing OS with a test-signed APK for offline planning, limited Tools, storage, and restart | Full RockstarOS image build, production signing, first flash and boot, OTA, and total-loss recovery |
| Linux / QEMU | Independent Developer Preview implementation and acceptance records | Release gates for the current artifact; not transferable to Pixel physical-device acceptance |
| Material Invention | Reproducible sandbox Core and integrated design | R5 input/display adapter, interface, physical sensors, and simulation/Patent AI connections |

R5 manufacturing approval is **on hold**, and **all four Pixel first-flash gates are failing**. Task counts are not a measure of product completion.

<!-- project-overview:start -->
Updated: 2026-10-02 / 160 tasks: 104 done, 38 in progress, 17 planned, 1 blocked
