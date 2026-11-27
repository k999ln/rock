# 「まだ誰も動かしていない」Agent を 1 つずつ動かした結果（task 129 の D6、2026-11-27）

更新: 2026-11-27 ／ 関係: [task 129 の D6](../../codex/tasks/129-noah-ux-debug.md)・[使い勝手と抜け道の確かめ](ux-audit-2026-11-22.md)・[一覧と巡回（spec-88）](spec-88-mass-probe.md)

## 1. 本人の許可と、やった事

- 本人の許可（2026-11-27 15:58）: 「D6 の 165 件の確かめで、外の道具を呼んでよい」。
- 本番（avoado.si）の一覧（`GET /api/noah/intake`）で、接続の札が「まだ誰も動かしていない」（`connect.badge = unverified`。握手は通ったが、誰も道具を動かしていない）物は 167 件だった（2026-11-22 は 165 件）。
- 1 件ずつ、ブラウザだけの本人（Cookie の保存先）として、知らない人と同じ API で行った: 計画を読む → つなぐ → 道具の一覧 → **読み取りだけと宣言され、入力の要らない道具を 1 つだけ** 1 回頼む → 成果を待つ → 切る。
  - 読み取りだけと宣言していない道具は、呼ばない（相手の所で何かを変えるかもしれないので）。入力の要る道具も、呼ばない（何を入れるかを決めていないので）。
  - Noah の上限を守る（本人ごとに 1 分 10 回・1 日 100 回つなぐ。足りない分は、2 つ目のブラウザだけの本人で行った）。つなぐ間は 6.5 秒あけた。
  - 同じ手順を、次の回にも使えるように `node scripts/noah-prod-check.mjs unverified https://avoado.si --write`（`scripts/noah-prod-unverified.mjs`）として残した。記録の正本は、この文書の 3 章の表。
- 頼んで成果が返った物は、Noah の決まりどおり、その場で「動いた」（L2）になる（`lib/noah-ask.ts` の `markRan`）。一覧の札も、次に読んだ時から「動いた」に変わる。

## 2. 結果

| 結果 | 件数 |
| --- | ---: |
| 動く | 73 |
| 鍵・相手のアカウントが要る | 23 |
| 入力が要る（入力は要らないと宣言していたが、相手が求めた） | 7 |
| 一時的に失敗（相手の混雑） | 1 |
| 入力が要る（呼んでいない） | 17 |
| 読み取りだけの道具が無い（呼んでいない） | 37 |
| 壊れている（相手のサーバーが応答しない） | 9 |
| 合計 | 167 |

- **動く**（73）: 道具が成果を返した。一覧では「動いた」になった。
- **鍵・相手のアカウントが要る**（23）: 道具が「許可が要る」「API key が要る」「アカウントをつないで」と返した（相手が後から許可を求めるようになった物を含む）。
- **入力が要る（宣言と違う）**（7）: 入力は要らないと宣言している道具を呼んだら、相手のサーバーが入力を求めた。サーバーは動いている。
- **一時的に失敗**（1）: 相手の先のデータが混んでいた（「60 秒後に」）。後でもう一度。
- **入力が要る・読み取りだけの道具が無い**（17・37）: 呼んでいない（上の決まり）。動くかどうかは、まだ分からない。
- **壊れている**（9）: 握手が通らない（相手のサーバーが応答しない）。道具だけが壊れている物は 0。2026-11-28 05:26 の 2 回目でも、9 件とも通らなかった（4.1）。9 件のうち 6 件は同じ相手（`ai.agentlookups`）なので、その相手のサーバーが 1 つ止まっていただけかもしれない。巡回の決まり（spec-88: 1 回目の失敗の後、6 時間あけて確かめ直し、2 回続けて失敗したら外す）に合わせて、6 時間あけて確かめ直す（`--ids` で、この 9 件だけ）。

## 3. 1 件ずつ

| Agent | 結果 | 呼んだ道具 | 返った字数・理由 |
| --- | --- | --- | --- |
| Mizan（`ac.mizan/registry`） | 動く | `list_sources` | 5669 字 |
| ac.tandem/docs-mcp（`ac.tandem/docs-mcp`） | 動く | `get_docs_cache_status` | 3957 字 |
| Apex AI Academy（`academy.apexai/apex-ai-academy`） | 動く | `list_courses` | 2926 字 |
| BeachClubs.ae（`ae.beachclubs/mcp`） | 動く | `search_beach_clubs` | 18994 字 |
| Dubai Data — Dubai real estate statistic（`ae.datadubai/dubai-real-estate`） | 動く | `get_market_summary` | 22691 字 |
| Discond（`ae.discond/discond`） | 動く | `discond_find_discounts` | 3100 字 |
| Moha: hire in the UAE（`ae.employerofrecord/moha`） | 動く | `how_to_hire_in_the_uae` | 3251 字 |
| GENOSYS UAE（`ae.genosys/genosys`） | 動く | `search_products` | 5859 字 |
| groTAX by Grovisor（`ae.grovisor/grotax`） | 動く | `grotax_list_health_questions` | 2109 字 |
| MRK Dubai Property（`ae.mrk/dubai-property`） | 動く | `search_projects` | 3762 字 |
| Plant Guide: Dubai gardening research（`ae.plantguide/dubai-gardening`） | 動く | `what_to_plant` | 15704 字 |
| Projectory（`ae.projectory/mcp`） | 動く | `search` | 7772 字 |
| Events.Aero（`aero.events/events`） | 動く | `search-events` | 3833 字 |
| Almost Impossible（`agency.almostimpossible/site`） | 動く | `get_agency_overview` | 1442 字 |
| JustIdea Agency（`agency.justidea/justidea-agency`） | 動く | `list_services` | 37906 字 |
| Bureau public reader（`agency.thebureauoflostcontext/bureau-public`） | 動く | `bureau_discover` | 4496 字 |
| Third Hemisphere AI Authority Index（`agency.thirdhemisphere/ai-authority-index`） | 動く | `list_index_editions` | 2733 字 |
| 1Court Directory（`ai.1court.state/court-directory`） | 動く | `list_rule_sets` | 8147 字 |
| 4ai – premium .ai domains for sale（`ai.4ai/domains`） | 動く | `search_domains` | 4020 字 |
| A2UI Atomic Catalog（`ai.a2uicatalog/catalog`） | 動く | `list_catalogs` | 4727 字 |
| aChurch.ai（`ai.achurch/church`） | 動く | `observe` | 8804 字 |
| Acubic（`ai.acubic/acubic`） | 動く | `acubic_list_strategy_templates` | 308 字 |
| Advisors AI — Route a Store Need to a Se（`ai.advisorsai/service-navigator`） | 動く | `advisors_catalog_list_services` | 5226 字 |
| AFG: agents hire agents (test money)（`ai.afg/afg`） | 動く | `afg_about` | 2777 字 |
| AFMR Discovery（`ai.afmr/discovery`） | 動く | `discover_afmr` | 178 字 |
| Agenlify AI Agent Directory（`ai.agenlify/catalog`） | 動く | `search_agents` | 7671 字 |
| agent-bev（`ai.agent-bev/bev-door`） | 動く | `list_nodes` | 25947 字 |
| Agent Blueprint（`ai.agentblueprint/agent-blueprint`） | 動く | `list_benchmark_jobs` | 9584 字 |
| AgentCV（`ai.agentcv/registry`） | 動く | `search_teams` | 5361 字 |
| Agentgates Compute（`ai.agentgates/compute`） | 動く | `compute_plans` | 29647 字 |
| Agentic Fabrication Network (AFN)（`ai.agenticfabricationnetwork/ufp`） | 動く | `get_material_guide` | 581 字 |
| Agent Ready Report（`ai.agenticplug/agent-ready-report`） | 動く | `explain_check` | 7205 字 |
| AgentRoam（`ai.agentroam/agentroam`） | 動く | `get_currencies` | 149 字 |
| AgentsIndex（`ai.agentsindex/mcp`） | 動く | `list_categories` | 1338 字 |
| AgentsRank（`ai.agentsrank/agentsrank`） | 動く | `find_workers` | 3897 字 |
| AGILEX Docs（`ai.agilex.service/docs`） | 動く | `list_docs` | 19521 字 |
| AirShelf Catalog（`ai.airshelf/catalog`） | 動く | `list_merchants` | 5018 字 |
| Alcock Arena（`ai.alcock/arena`） | 動く | `open_questions` | 131043 字 |
| Alpha Bazaar Arena（`ai.alphabazaar/arena`） | 動く | `get_daily_brief` | 9015 字 |
| AlpiX（`ai.alpic.alpix/Alpix`） | 動く | `canvas` | 69 字 |
| amigurumi.ai（`ai.amigurumi/patterns`） | 動く | `search_toys` | 1325 字 |
| Analytics Legends — SAP AI & Analytics M（`ai.analyticslegends/sap-analytics`） | 動く | `search_firms` | 8610 字 |
| APIR Agent Verification（`ai.apir/verify`） | 動く | `get_verification_keys` | 504 字 |
| ai.aqta/seal（`ai.aqta/seal`） | 動く | `get_public_key` | 146 字 |
| ARC (arcreport.ai): can an agent reach c（`ai.arcreport/ask`） | 動く | `find_stores` | 1826 字 |
| ARVX（`ai.arvx/arvx`） | 動く | `arvx_get_access` | 632 字 |
| ASRM (AI Search Rank Monitor)（`ai.asrm/asrm`） | 動く | `search_guides` | 2131 字 |
| ai.atdev/supershopping（`ai.atdev/supershopping`） | 動く | `recommend_outfit` | 44 字 |
| AthenaHQ（`ai.athenahq/mcp`） | 動く | `open_ai_access` | 9 字 |
| Atmy air quality（`ai.atmy/air-quality`） | 動く | `search_cities` | 9847 字 |
| Autoblogging.ai（`ai.autoblogging/autoblogging`） | 動く | `get_brand_facts` | 29174 字 |
| ai.autonomad/travel（`ai.autonomad/travel`） | 動く | `get_capabilities` | 992 字 |
| ai.bizmoon/regulatory（`ai.bizmoon/regulatory`） | 動く | `search_regulatory_changes` | 15429 字 |
| Clearvoyance（`ai.clearvoyance/clearvoyance`） | 動く | `get_pricing` | 6071 字 |
| DABYTE AI Visibility Index（`ai.dabyte/visibility-index`） | 動く | `get_visibility_index` | 6109 字 |
| DeployIt Product Expert（`ai.deployit/product-expert`） | 動く | `server_info` | 362 字 |
| Dream Interpreter AI（`ai.dreaminterpreter/dictionary`） | 動く | `dreams_by_country` | 21223 字 |
| Dreamlit（`ai.dreamlit/mcp`） | 動く | `get_status` | 6458 字 |
| DripMetrics（`ai.dripmetrics/mcp`） | 動く | `list_metrics` | 12918 字 |
| ai.dsght/public（`ai.dsght/public`） | 動く | `list_public_spaces` | 3348 字 |
| DualSoft AAS & PLC (DS Studio)（`ai.dualsoft/aas`） | 動く | `dsdx.start` | 4458 字 |
| Duskly（`ai.duskly/duskly`） | 動く | `duskly_list_prohibited_alterations` | 952 字 |
| e/acc（`ai.e-acc/eacc`） | 動く | `eacc_get_latest` | 3874 字 |
| ai.echoloc/company-technographics（`ai.echoloc/company-technographics`） | 動く | `list_technologies` | 1393 字 |
| Echoo public catalog（`ai.echoo.www/public-catalog`） | 動く | `get_echoo_product_facts` | 818 字 |
| ai.echoteka/mastering（`ai.echoteka/mastering`） | 動く | `get_service_info` | 172 字 |
| EcoCheck（`ai.ecocheck/ecocheck`） | 動く | `get_ghg_regulations` | 4715 字 |
| ai.edge-agents/intelligence（`ai.edge-agents/intelligence`） | 動く | `edge_list_families` | 11898 字 |
| Emergent Technologies（`ai.emergenttechnologies/emergent`） | 動く | `about_emergent` | 8488 字 |
| Entervista（`ai.entervista/entervista`） | 動く | `search_businesses` | 119 字 |
| entityindex.ai（`ai.entityindex/entityindex`） | 動く | `search_hotels` | 28464 字 |
| Enzo's（`ai.enzos/enzos`） | 動く | `video_tours` | 3448 字 |
| EOSL.ai — Hardware End-of-Life Database（`ai.eosl/eosl`） | 動く | `list_vendors` | 2313 字 |
| Getlead（`ad.getle/leads`） | 鍵・相手のアカウントが要る | `get_account` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Pantheon（`ad.pantheon/mcp`） | 鍵・相手のアカウントが要る | `list_projects` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| tide（`ad.tide/mcp`） | 鍵・相手のアカウントが要る | `sql` | unauthorized: sql needs an API key. Get a free one in a minute at https://tide.ad/develope |
| AgentAPIHub — Walmart, Shopee, TikTok Sh（`ai.agentapigate/amazon-product-walmart-shopify-ecommerce-mcp`） | 鍵・相手のアカウントが要る | `search_endpoints` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Ahel（`ai.ahel/ahel`） | 鍵・相手のアカウントが要る | `capability_search` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Bot Office（`ai.aibotoffice/bot-office`） | 鍵・相手のアカウントが要る | `verify_connection` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| AI Photo Animator（`ai.aiphotoanimator/photo-animator`） | 鍵・相手のアカウントが要る | `list_effects` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| AiVikings.ai（`ai.aivikings/registrar`） | 鍵・相手のアカウントが要る | `get_domain_audit_log` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| AppGoat（`ai.appgoat/mcp`） | 鍵・相手のアカウントが要る | `get_charts` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Arcangel Trademark Search（`ai.arcangel/trademark-search`） | 鍵・相手のアカウントが要る | `list_companies` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| asms（`ai.asms/asms`） | 鍵・相手のアカウントが要る | `get_balance` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| AutoPoster AI（`ai.autoposter/autoposter`） | 鍵・相手のアカウントが要る | `autoposter_list_accounts` | Authentication required: Please connect your Auto Poster account at https://app.autoposter |
| BetSlip Doctor（`ai.betslipdoctor/mcp`） | 鍵・相手のアカウントが要る | `get_game_file` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| BetterPost（`ai.betterpost/server`） | 鍵・相手のアカウントが要る | `betterpost_list_projects` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Bordet AI（`ai.bordet/bordet`） | 鍵・相手のアカウントが要る | `list_members` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Brainz（`ai.brownmatter/brainz`） | 鍵・相手のアカウントが要る | `get_context` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| BumbleBox（`ai.bumblebox/mail`） | 鍵・相手のアカウントが要る | `list_to_answer` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Cactal（`ai.cactal/cactal`） | 鍵・相手のアカウントが要る | `websites_list` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| CallMCP — Phone Call MCP Server（`ai.callmcp/server`） | 鍵・相手のアカウントが要る | `get_agent_connection` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Campaign Pack（`ai.campaignpack/campaignpack`） | 鍵・相手のアカウントが要る | `check_campaign` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Capital Company（`ai.capitalcompany/capital-company`） | 鍵・相手のアカウントが要る | `capital_company_conversation` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Entity Enricher（`ai.entityenricher/enricher`） | 鍵・相手のアカウントが要る | `list_benchmark_scenarios` | Authentication required: connect your Entity Enricher account. |
| ENYAL by Greenland AI（`ai.enyal/enyal`） | 鍵・相手のアカウントが要る | `get_entity` | この Agent は、相手の許可が要るようになりました。まだ対応していません。 |
| Brainy Prices — UAE Cost of Living（`ae.brainy/grocery-prices`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `commute_cost` | Provide at least one of from_area, to_area, to_hub_id, emirate_id. |
| Divisi（`africa.divisi/divisi`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `find_crops` | 相手のサーバーが、この入力を受け付けませんでした。 Say where: a town or district name, or a lat/lng. |
| AIM SHIELD（`ai.aim-shield/mcp`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `comprobar_comercio` | Da la dirección del comercio en «url» (https://…) o su dominio en «dominio» (sin https://) |
| Assistable（`ai.assistable/assistable`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `calls_get` | { "error": { "code": "validation_error", "message": "call_id is required." } } |
| Augmap（`ai.augmap/maps`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `map_get_state` | MCP error -32602: Input validation error: Invalid arguments for tool map_get_state: Give e |
| CompanyProof（`ai.companyproof/companyproof`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `search_companies` | Input validation error: Invalid arguments for tool search_companies: Invalid input |
| Egonex（`ai.egonex/marketplace`） | 入力が要る（入力は要らないと宣言していたが、相手が求めた） | `quote_order` | Arguments are not valid: offer_id is required (or request_id for an order already sent to  |
| CoinFactory（`ai.coinfactory/coinfactory`） | 一時的に失敗（相手の混雑） | `get_market_data` | {"error":"Upstream data provider is rate limited. Retry in ~60 seconds; cached results may |
| zoll.agency（`agency.zoll/ausfuhr`） | 入力が要る（呼んでいない） | — | — |
| 28/28 Agent Service Desk: Fix & Verify（`ai.28in28/agent-service-desk`） | 入力が要る（呼んでいない） | — | — |
| ai.adoraads/beauty（`ai.adoraads/beauty`） | 入力が要る（呼んでいない） | — | — |
| Best AI Search Agency AEO Report（`ai.aeoengine/best-ai-search-agency-aeo-report`） | 入力が要る（呼んでいない） | — | — |
| bevGTIN（`ai.agent-bev/bevgtin`） | 入力が要る（呼んでいない） | — | — |
| agent-cronjob（`ai.agentasy/cronjob`） | 入力が要る（呼んでいない） | — | — |
| AgenticCart: AI readiness checks for onl（`ai.agenticcart/agenticcart`） | 入力が要る（呼んでいない） | — | — |
| AirboxShip Shipping (public)（`ai.airboxship/shipping-public`） | 入力が要る（呼んでいない） | — | — |
| Aldro: small-business tax（`ai.aldro/tax`） | 入力が要る（呼んでいない） | — | — |
| AQL PropertyCheck — check one exact addr（`ai.alphaquantlabs/propertycheck`） | 入力が要る（呼んでいない） | — | — |
| Ankra Docs（`ai.ankra/docs`） | 入力が要る（呼んでいない） | — | — |
| Augenix（`ai.augenix/build`） | 入力が要る（呼んでいない） | — | — |
| Aviado AI（`ai.aviado/health`） | 入力が要る（呼んでいない） | — | — |
| BaziChart（`ai.bazichart/bazichart-mcp`） | 入力が要る（呼んでいない） | — | — |
| BUMIT（`ai.bumit/verify-business`） | 入力が要る（呼んでいない） | — | — |
| CyberNative public PDF accessibility che（`ai.cybernative/pdf-check`） | 入力が要る（呼んでいない） | — | — |
| Edgepedia（`ai.edgechat/edgepedia`） | 入力が要る（呼んでいない） | — | — |
| Agentic Engineering Periodic System（`academy.ase/periodic-system`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Inside Ads（`ad.inside/inside-ads`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Alexey Sound — sound recordist, Dubai（`ae.alexeysound/alexey-sound`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| hood. — .hood name service（`ag.hood/name-service`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| agency.goji/goji（`agency.goji/goji`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Business Contact Finder（`agency.ottobot/business-contact-finder`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Contractor Licence Changes（`agency.ottobot/contractor-license-changes`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| agent-bev Library（`ai.agent-bev/library`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.agentberg/agentberg（`ai.agentberg/agentberg`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Agentic Terminal Directory（`ai.agenticterminal/directory`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| AI-Portal Enterprise GenAI Briefing（`ai.ai-portal/ai-portal`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| AIS CVE Priorities — daily exploit-ranke（`ai.aislabs/cve`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.aivonic/mcp（`ai.aivonic/mcp`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| APEX Runner Crypto Signals（`ai.apexrunner/signals`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Arclan MCP Registry（`ai.arclan/registry`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.artemisgtm/gtm-engineer（`ai.artemisgtm/gtm-engineer`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.artidrop/artidrop（`ai.artidrop/artidrop`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.askmiles/catalog（`ai.askmiles/catalog`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| AutEng Docs — Agent Document Workspace &（`ai.auteng/docs`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| AwardCast Federal Contracts（`ai.awardcast/federal-contracts`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.bidclub/bidclub（`ai.bidclub/bidclub`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.blast-radius/blast-radius（`ai.blast-radius/blast-radius`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Singapore new launches（`ai.bluebed.property/new-launches`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| BorealHost（`ai.borealhost/mcp`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Agent Puzzle Bounty — cooperative k-of-n（`ai.brevium/agent-puzzle-bounty`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Bring Your AI（`ai.bringyour/bringyour`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Orbit（`ai.buildwithorbit/orbit`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.byteask/embedded-docs（`ai.byteask/embedded-docs`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Can I Vibe? — AI coding provider status（`ai.canivibe/status`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ClawFC（`ai.clawfc/clawfc`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Corey James portfolio（`ai.coreyjames/portfolio`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.creationloop/creationloop（`ai.creationloop/creationloop`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Drone Intelligence（`ai.droneintelligence/drone-intelligence`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Duami（`ai.duami/intent-exchange`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.duvera/gateway（`ai.duvera/gateway`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| ai.emberverse/emberverse（`ai.emberverse/emberverse`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Epinu（`ai.epinu/epinu`） | 読み取りだけの道具が無い（呼んでいない） | — | — |
| Licensed House Painters（`agency.ottobot/licensed-house-painters`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| CounterScript - Drug Price Benchmarks（`ai.agentlookups/counterscript`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| GroundRules - US Law Text（`ai.agentlookups/groundrules`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| GroundTruth - Environmental Records（`ai.agentlookups/groundtruth`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| ai.agentlookups/overassessed（`ai.agentlookups/overassessed`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| Plumbline - Contractor License Checks（`ai.agentlookups/plumbline`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| Spoon Scout - Food Contaminant Lookup（`ai.agentlookups/spoon-scout`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| Avasis Agent Platform（`ai.avasis.agents/avasis`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |
| ai.corduroy-labs/updates（`ai.corduroy-labs/updates`） | 壊れている（相手のサーバーが応答しない） | — | 相手のサーバーが応答しません。時間をおいて試してください。 |

## 4. 壊れている物を一覧から外す事

- 今の決まり（spec-88 の巡回）は、**握手が続けて失敗した物**を一覧から外す。ユーザーの依頼の失敗は、この数に入らない（`lib/noah-ask.ts` は成功の時だけ記録する）。
- だから、この確かめで「壊れている」と分かった物は、巡回が開いていれば、握手の失敗が続いた時に自然に外れる。道具だけが失敗する物は、巡回では外れない。
- すぐ外すには、審査者（本人のアカウント）が運営の画面（`/noah/review/intake`）で 1 件ずつ取り下げる。Claude は審査者ではないので、外していない。外す候補は、6 時間あけた 2 回目でも応答しなかった物だけ（下の 4.1）。

### 4.1 6 時間あけた 2 回目

- 2026-11-28 05:26（JST。1 回目の約 6 時間 10 分後）に、`node scripts/noah-prod-check.mjs unverified https://avoado.si --write --ids=<3 章の「壊れている」の 9 件>` で確かめ直した。**9 件とも、また握手が通らなかった**（どれも「相手のサーバーが応答しません。」）。9 件とも、まだ一覧に載っている（一覧は 212 件）。
- だから、9 件とも、巡回の決まり（2 回続けて失敗したら外す）に当たる。外す候補は次の 9 件（審査者が `/noah/review/intake` で取り下げる）:

| Agent | 1 回目（2026-11-27 23 時台） | 2 回目（2026-11-28 05:26） |
| --- | --- | --- |
| Licensed House Painters（`agency.ottobot/licensed-house-painters`） | 応答しない | 応答しない |
| CounterScript - Drug Price Benchmarks（`ai.agentlookups/counterscript`） | 応答しない | 応答しない |
| GroundRules - US Law Text（`ai.agentlookups/groundrules`） | 応答しない | 応答しない |
| GroundTruth - Environmental Records（`ai.agentlookups/groundtruth`） | 応答しない | 応答しない |
| ai.agentlookups/overassessed（`ai.agentlookups/overassessed`） | 応答しない | 応答しない |
| Plumbline - Contractor License Checks（`ai.agentlookups/plumbline`） | 応答しない | 応答しない |
| Spoon Scout - Food Contaminant Lookup（`ai.agentlookups/spoon-scout`） | 応答しない | 応答しない |
| Avasis Agent Platform（`ai.avasis.agents/avasis`） | 応答しない | 応答しない |
| ai.corduroy-labs/updates（`ai.corduroy-labs/updates`） | 応答しない | 応答しない |

## 5. 次の事

- 「入力が要る」物: 見本の入力（例: 検索の言葉）を決めてから、1 回ずつ頼む（本人の許可の範囲に入るかは、本人に聞く）。
- 「鍵が要る」物: 鍵を Noah で預かる形（spec-74）が出来るまで、一覧で「鍵が要る」と分かるようにする。
- 「壊れている」物: 9 件とも 2 回続けて応答しなかった（4.1）。審査者が取り下げるか、巡回に任せるかを、本人が決める。
