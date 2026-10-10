<div align="center">

<img src="docs/brand/avokado/avokado-motion-v2.gif" alt="avokado product concept: one slim silver avocadoMini R5 stands beside the words PLAY, MAKE, and LIVE with subtle animated lines" width="100%">

# avokado

### From playing to making. Spend less time thinking and more time creating.

A product concept that begins with games and connects creation, learning, and everyday action to enrich life as a whole.

[What this is](#what-this-is) · [The parts](#the-parts) · [Where it stands](#where-it-stands) · [Find anything](#find-anything) · [Start developing](#start-developing) · [Full details](docs/readme-details.md)

</div>

> **About the image** — The R5 visual above is concept art based on the intended industrial design. The animated lines are a brand treatment, not a photograph of working hardware or proof of a spatial display.

## What this is

**avokado** is one business with three layers. This repository (`k999ln/rock`) is the single source of truth for all of them: requirements, designs, source code, and test evidence.

| Layer | What it is | Where it stands |
| --- | --- | --- |
| **1. The service** | Buy a physical SIM or an eSIM and get access to RockstarOS, Sky, Zema, and built-in AI agents. Cloud AI work is billed by usage, and the price is shown before anything runs. **This is the current main product direction, decided on 2026-10-02.** | Source code and local tests exist. There is no carrier contract, real purchase, or live billing yet. |
| **2. RockstarOS** | The shared operating layer for AI and agents: identity, permissions, work, storage, and recovery. **Sky** finds and connects tools, **Zema** runs and tracks work, and **Wallet** shows costs and confirmed earnings. | A web app, a Linux/QEMU Developer Preview, and a test-signed app on a Pixel 10. No full OS image has been flashed to a phone. |
| **3. The hardware** | **avocadoMini R5**, a 200 mm stand-alone spatial-input, display, and game device, and **avokadoPro**, a compact NVIDIA desktop for AI and PC games. **rocketstar**, a reusable small-satellite launch vehicle, is a separate design program. | Design documents only. Nothing has been built, approved for manufacturing, or put on sale. |

**How the service works.** A SIM or eSIM purchase includes access to the services. The OS itself is not stored on the SIM: a supported device installs it through an approved path, and any other device uses an app or a browser. Before paid AI work starts, you see an estimate and approve a budget; while it runs you can see what it has spent; afterwards you get an itemized record. [SIM/eSIM-led product architecture](docs/sim-led-product-architecture.md)

Most design documents are written in Japanese; this README is the English entry point. Everything that used to be on this page is kept, word for word, in **[README details](docs/readme-details.md)**.

## The parts

| Part | In one line | Read more |
| --- | --- | --- |
| RockstarOS v1.0 | Identity, permissions, work, storage, and recovery shared by every device and service. The on-device LLM only proposes plans; it never decides whether a Tool may run. | [Complete OS design](docs/rockstaros-complete-design.md) |
| Sky | Find Tools and AI teams and compare their author, version, permissions, where they run, and cost before connecting. 36 Tools are listed; 14 can run today. | [Sky](docs/sky.md) · [Agents and tools](docs/agents-and-tools.md) |
| Zema | Takes a request and keeps its plan, progress, stopping, approvals, results, and history together as one piece of work. | [Complete Tool design](docs/sky-tools-complete-design.md) |
| Wallet | Cost estimates, reservations, confirmed earnings, refunds, and reconciliation. No live billing or payouts have started. | [Wallet workstream](docs/workstreams/03-wallet-billing-providers.md) |
| avocadoMini R5 | A 200 mm stand-alone device for playing, making, and everyday help. R5 is the current design baseline. It is a design only: zero physical-device tests have been completed, and manufacturing approval is **on hold**. | [R5 design](docs/avocado-mini-r5/README.md) |
| avokadoPro | A compact NVIDIA desktop for AI development and PC games. Two price figures are on record and the price is not final. Nothing has been bought or assembled. | [Pro PC design](docs/avokado-pro-pc-design.md) |
| Material Invention | Reproducible digital candidates for new materials, with evidence. Only a sandbox core exists. The Material Invention interface and Sky connection are not implemented. | [Core design](docs/material-invention-core.md) |
| rocketstar R1.0 | A reusable small-satellite launch vehicle; a separate design program with no manufacturing or flight. | [Design archive](docs/rocketstar-design/README.md) |

## Where it stands

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
Updated: 2026-10-09 / 378 task records (32 parents, 192 children, 154 standalone; 346 execution units excluding parents): 107 done, 34 in progress, 236 planned, 1 blocked
<!-- project-overview:end -->

[All task progress](project.md#%E5%85%A8task%E3%81%AE%E4%BD%9C%E6%A5%AD%E9%80%B2%E6%8D%97) · [Mission Control](docs/mission-control.md) · [Security](SECURITY.md)

### How the direction changed

The center of the product moved five times in about a month. Older documents describe older centers, so check the date before relying on one.

| Period (2026) | Center of the product |
| --- | --- |
| Sep 4 – 8 | **LOOP / Rock star** — a web hub for AI automation tools |
| Sep 9 – 11 | **RockstarOS 1.0** — an OS for automation tools; requirements RQ01–RQ17 fixed |
| Sep 12 – 16 | **Sky / Zema / Wallet** — an OS for owning an AI automation team; Pixel 10 becomes the first phone |
| Sep 17 – 26 | **avocadoMini** — hardware as the public face; the device settles on R5 |
| Sep 27 – now | **A SIM/eSIM-led service** — on Oct 2, buying a SIM/eSIM becomes the way into the services |

Day by day, with what is in force today and what was withdrawn: [specification history](docs/spec-history.md) (Japanese).

## Find anything

| I want to… | Open |
| --- | --- |
| understand the current product direction | [What is in force today](docs/spec-history.md#2-いま有効な仕様2026-10-06時点) / [SIM/eSIM-led architecture](docs/sim-led-product-architecture.md) |
| read the confirmed requirements, RQ01–RQ49 | [Product baseline](docs/product-baseline.md) |
| see what changed, and on which day | [Specification history](docs/spec-history.md) |
| see every tool and agent and what each one does | [Agent and tool overview](docs/agents-and-tools.md) |
| read a design | [Design portal](docs/rockstaros-design-portal.md) / [Design library](docs/readme-details.md#design-library) |
| find any document in `docs/` | [Document map](docs/README.md) — all 186 documents, classified |
| find the source code for a product | [Project guide](PROJECTS.md) |
| see progress and who owns what | [All tasks](project.md) / [Mission Control](docs/mission-control.md) |
| see what a merge on 2026-10-05 dropped and what still needs a decision | [Merge-loss audit](docs/merge-loss-audit-20261007.md) |
| read every feature, payment, security, and design detail that used to be here | [README details](docs/readme-details.md) |
| visit the public homepage | [avocadomini.si](https://avocadomini.si) |
| try Sky in a browser (public version) | [Sky](https://rockstaros-kaiya.noellesugar1.chatgpt.site/sky) |
| start developing | [Start developing](#start-developing) / [Rules for AI coding agents](AGENTS.md) |

## Start developing

Use Node.js 22.13 or later and npm. This starts the web app locally:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

After changing documents or progress, run:

    npm run project:update
    npm run verify

Pixel, QEMU, Workers, and the product site have their own instructions and gates: [Linux/QEMU](docs/workstreams/06-native-qemu-release.md) · [Android/Pixel](docs/workstreams/07-android-device-local-ai.md) · [avocadoMini](docs/workstreams/11-material-invention-avocado-mini.md) · [all commands and checks](docs/readme-details.md#start-developing).

## Safety, rights, and images

Recording, external publication, appliance operation, purchasing, and payment each need their own permission. RockstarOS 1.0 is a Developer Preview, and the reuse license for proprietary code has not been selected. Bundled open-source software, models, and external services keep their own terms. Images and GIFs are concept material, not product photographs or evidence of a working spatial display, manufacturing approval, or safety performance. [Distribution requirements](docs/release-minimum-gates.md) · [Sources and licenses](docs/mr-integration.md)
