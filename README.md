<div align="center">

<img src="docs/brand/avokado/avokado-motion-v2.gif" alt="avokado product concept: one slim silver avocadoMini R5 stands beside the words PLAY, MAKE, and LIVE with subtle animated lines" width="100%">

# avokado

### From playing to making. Spend less time thinking and more time creating.

A product concept that begins with games and connects creation, learning, and everyday action to enrich life as a whole.

[What this is](#what-this-is) · [Try it](#try-it) · [What is in this repository](#what-is-in-this-repository) · [Public and encrypted parts](#public-and-encrypted-parts) · [Where it stands](#where-it-stands) · [Start developing](#start-developing)

</div>

> **About the image** — The R5 visual above is concept art based on the intended industrial design. The animated lines are a brand treatment, not a photograph of working hardware or proof of a spatial display.

## What this is

**avokado** is one product with three layers. This repository is where it is built in the open: source code, public designs, and test evidence.

| Layer | What it is | Where it stands |
| --- | --- | --- |
| **The service** | Make one avokado account and use **Sky** (find and connect AI tools and agents), **Zema** (ask for work and follow it to the result) and built-in AI agents from a phone, a PC or a browser. Cloud AI work is billed by usage, and the price is shown before anything runs. A SIM is not required; it is an optional line for devices such as avocadoMini. | Source code and local tests exist. There is no live billing yet. |
| **RockstarOS** | The shared layer underneath: identity, permissions, work, storage and recovery, the same on every device. The on-device LLM only proposes plans; it never decides on its own whether a Tool may run. | A web app, a Linux/QEMU Developer Preview, and a test-signed app on a Pixel 10. No full OS image has been flashed to a phone. |
| **The hardware** | **avocadoMini R5**, a 200 mm stand-alone device for playing, making and everyday help, and **avokadoPro**, a compact NVIDIA desktop for AI and PC games. **rocketstar** is a separate launch-vehicle design program. | Designs only. Nothing has been built, approved for manufacturing, or put on sale. |

Most design documents are written in Japanese; this README is the English entry point.

## Try it

| | |
| --- | --- |
| Product homepage | [avocadomini.si](https://avocadomini.si) |
| Sky in a browser (public preview) | [Sky](https://rockstaros-kaiya.noellesugar1.chatgpt.site/sky) |
| Install the Developer Preview | [Installation guide (Japanese)](docs/preview-installation-ja.md) · [Release notes](docs/preview-release-notes.md) |
| Build a Sky tool | [Sky Tool SDK](docs/sky-tool-sdk.md) · [Public SDK packages](public-release/rockstaros/README.md) |

## What is in this repository

| Folder | What is inside |
| --- | --- |
| [`app/`](app/), [`components/`](components/), [`lib/`](lib/), [`db/`](db/), [`drizzle/`](drizzle/) | The web app: Sky, Zema, Wallet, AMC, the tool runners, the API, and the database schema and migrations |
| [`services/`](services/) | Separate Cloudflare Workers (billing, operator dock, agent runtime, attestation verifier) |
| [`android/`](android/), [`os/`](os/) | The Android app and the AOSP device configuration for Pixel 10 |
| [`systems/rock-star-os/`](systems/rock-star-os/) | The Linux native OS (Buildroot/QEMU) |
| [`sites/avocado-mini/`](sites/avocado-mini/) | The product homepage published at avocadomini.si |
| [`toolkits/`](toolkits/), [`contracts/`](contracts/) | Tool kits that plug into Sky, and the public contracts and fixtures they follow |
| [`public-release/rockstaros/`](public-release/rockstaros/) | The MIT-licensed packages published to [avokado-ink/RockstarOS](https://github.com/avokado-ink/RockstarOS) |
| [`docs/`](docs/) | Designs and guides. Start at the [document map](docs/README.md) |
| [`data/`](data/), [`scripts/`](scripts/), [`tests/`](tests/) | Machine-readable records, the checks that keep them consistent, and the tests |

Looking for the code behind one product or Sky tool? Open the [project guide](PROJECTS.md).

## Public and encrypted parts

Everything in this repository is public **except** a set of files encrypted with [git-crypt](https://github.com/AGWA/git-crypt). Everyone can see their names; only key holders can read them. They cover:

- 🔒 hardware designs, inventions and industrial design (for example `docs/avocado-mini-r5/` and `docs/rocketstar-design/`)
- 🔒 pricing, contracts and business plans (including the requirements baseline `docs/product-baseline.md`)
- 🔒 research, conversation records, and AI instructions used by the app (`private/`)
- 🔒 development internals: the work ledger (`project.md`), work records and logs (`docs/evidence/`, `docs/workstreams/`), and agent settings

The exact list is in [`.gitattributes`](.gitattributes), and the [document map](docs/README.md#encrypted-areas) explains each area. Without the key the app still builds: the encrypted AI instructions and directory data are replaced by public placeholders.

## Where it stands

| Track | Verified | Not done yet |
| --- | --- | --- |
| Web / Sky / Zema | Source for screens, catalog, work, approvals, history and the Tool foundation | Current-version readback for each deployment, external providers and production commercial acceptance |
| Pixel 10 GL066 | Pre-tests on the existing OS with a test-signed app: offline planning, limited Tools, storage and restart | Full RockstarOS image, production signing, first flash and boot (all four first-flash gates are failing), OTA, total-loss recovery |
| Linux / QEMU | Independent Developer Preview and its acceptance records | Release gates for the current artifact |
| avocadoMini R5 | R5 is the current design baseline. Integrated basic design and calculation checks ([R5 design](docs/avocado-mini-r5/README.md) 🔒) | Zero physical-device tests have been completed, and manufacturing approval is **on hold** |
| Material Invention | Sandbox core, candidate comparison in Sky and Zema, private saved work and digest-checked recovery | The R5 input/display adapter and physical sensors. Simulation and laboratory connections are not implemented |

Task counts are not a measure of product completion.

<!-- project-overview:start -->
Updated: 2026-10-11 / 392 task records (32 parents, 192 children, 168 standalone; 360 execution units excluding parents): 114 done, 47 in progress, 230 planned, 1 blocked
<!-- project-overview:end -->

[All task progress](project.md#%E5%85%A8task%E3%81%AE%E4%BD%9C%E6%A5%AD%E9%80%B2%E6%8D%97) 🔒 · [Security](SECURITY.md)

## Start developing

Use Node.js 22.13 or later and npm.

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

To preview the built Worker locally:

    npm run build
    npm start

`npm start` applies local D1 migrations with the same Wrangler dependency as the Cloudflare build plugin and starts the preview only after the migration succeeds. To choose a port, use `npm start -- --port 8788`. It does not deploy the Worker or run remote migrations. `npm run operator-dock:dev` uses the same runtime for the local [Operator Dock](services/operator-dock/README.md).

Before you open a pull request, run the checks that work without the key:

    npm run verify:public

Key holders unlock first (`git-crypt unlock <key>`) and run `npm run verify`. Rules for people and AI coding agents: [AGENTS.md](AGENTS.md).

After unlocking, `npm run metadata:update` synchronizes project, Mission Control, database status, and workspace records. `project:update` and `mission:update` remain aliases; `metadata:check` checks without writing. These commands stop before reading or writing records when private files are locked.

## Safety, rights, and images

Recording, external publication, appliance operation, purchasing and payment each need their own permission. RockstarOS 1.0 is a Developer Preview. The packages in `public-release/rockstaros/` are MIT-licensed; a reuse license for the rest of the proprietary code has not been chosen. Bundled open-source software, models and external services keep their own terms. Images and GIFs are concept material, not product photographs or evidence of a working spatial display, manufacturing approval or safety performance. [Distribution requirements](docs/release-minimum-gates.md) · [Sources and licenses](docs/mr-integration.md)
