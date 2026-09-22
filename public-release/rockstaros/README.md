# Avokado Mini

- Public repository: https://github.com/avokado-ink/RockstarOS
- Authorized full source: https://github.com/k999ln/rock

![Avokado Mini in motion](rockstaros-motion.gif)

## Make space for what comes next.

**Avokado Mini** is the flagship product experience from **Avokado, Ink**: a local-first creative environment for exploring ideas, finding the right tools, working with AI, and moving meaningful work into action.

RockstarOS is the operating system that makes the experience coherent, understandable, and accountable.

**Powered by RockstarOS. LLM: Local.**

> **Developer Preview** -- Avokado Mini and RockstarOS are under active development. The public materials describe the product direction, not final engineering specifications or a finished consumer release.

## One product. One creative environment.

Avokado Mini is designed around the complete journey from intent to result. It connects the tools, people, approvals, and records that move a project forward while keeping the user in control.

| Layer | Public role |
| --- | --- |
| **Avokado Mini** | Give the whole experience a clear, human-centered home. |
| **RockstarOS** | Coordinate tools, collaboration, decisions, and results. |
| **Local AI** | Support the user while keeping the public description intentionally simple. |
| **Sky Tools** | Extend the experience through understandable, permission-aware capabilities. |

Internal hardware architecture and AI implementation details remain private.

## Built for invention.

- **See the whole project.** Bring tools, work, and decisions into one understandable environment.
- **Move from intent to action.** Discover what can help, understand the consequences, and approve the next step.
- **Keep people in control.** Consequential actions stay behind explicit human decisions.
- **Work locally.** The public AI description is intentionally simple: **LLM: Local**.
- **Recover with confidence.** Success, failure, interruption, and unknown outcomes remain distinct.

## RockstarOS is the operating system inside.

RockstarOS gives Avokado Mini a clear path from an idea to a verified result.

| Surface | Purpose |
| --- | --- |
| **Home** | A clear starting point for every part of the system. |
| **Sky** | Find AI tools and understand what they can do before connecting them. |
| **Zema** | Turn a request into a guided flow of decisions, actions, and results. |
| **Wallet** | Separate costs, verified earnings, and unresolved states. |
| **Market** | Explore typed value in a paper-only environment. |
| **Settings** | See connection health, storage, updates, diagnostics, and recovery. |

![RockstarOS orchestration](rockstaros-hero.png)

## The working loop

![Discover, collaborate, and verify](rockstaros-workflow.png)

1. **Discover** the right tool.
2. **Understand** its permissions, destination, and cost.
3. **Collaborate** with a clear owner for every decision.
4. **Approve** actions that carry real consequences.
5. **Verify** the result and preserve the receipt.
6. **Recover** safely when work is interrupted or uncertain.

## Control is part of the product.

- Every tool has an explicit scope, destination, and approval boundary.
- Actions that change external state require the appropriate human decision.
- Fixtures, sandboxes, previews, and production environments are never treated as interchangeable.
- AI does not receive private keys or unrestricted authority over financial records.

## Public code and installer

The public repository includes runnable, deliberately bounded parts of RockstarOS:

- [**Control Core**](packages/control-core) -- approval gates, execution readiness, and distinct outcome receipts.
- [**Sky + Zema Core**](packages/sky-zema-core) -- a local tool catalog, explicit Sky-to-Zema handoff, workflow state, and consent-gated anonymous tool events.
- [**Sky SDK**](packages/sky-sdk) -- an embeddable package for registering, discovering, approving, and running Sky tools inside another application.
- [**Fitness + Sky Example**](examples/fitness-sky) -- a working example that connects app-authorized activity data to two local Sky tools.
- [**Sky + Zema Public Preview**](apps/sky-zema-preview) -- a local browser experience using the public core.
- [**Public Preview Installer**](installer) -- a guarded local installer for macOS and Linux.

Install the Sky SDK directly from this GitHub repository:

```bash
npm install github:avokado-ink/RockstarOS
```

```js
import { createSky } from "@avokado-ink/rockstaros-sky-sdk";

const sky = createSky({ installationId: "fitness_app_4f92a18b" });
```

The host application keeps ownership of health permissions, health data,
validation, storage, and its user interface. Sky receives only the values that
the host explicitly passes to a registered tool. No health data is transmitted
by the SDK.

```bash
git clone https://github.com/avokado-ink/RockstarOS.git
cd RockstarOS
./installer/install-public-preview.sh
~/.local/share/rockstaros-public-preview/bin/rockstaros-public-preview
```

Then open <http://127.0.0.1:4173>.

Telemetry is off by default. Even when a receiver is configured, the user must opt in. The public client and SDK permit only package and tool identifiers, a random installation identifier, outcome, duration, and timestamp. They reject prompts, chats, results, files, credentials, health data, and personal information.

The installer above installs the runnable public preview; it does not replace the host operating system. The native QEMU image is not public because its product-license, production-signing, signed-candidate acceptance, and public-release gates are incomplete.

This release demonstrates functioning RockstarOS behavior without publishing the complete OS, hardware implementation, local LLM design, account data, credentials, or production integrations.

## For authorized contributors

The development source of record is the private [`k999ln/rock`](https://github.com/k999ln/rock) repository. Contributors with access can move directly to the relevant system below. GitHub returns a 404 page to visitors without permission.

| System | Private source |
| --- | --- |
| Web App / Home | [`app`](https://github.com/k999ln/rock/tree/main/app) |
| Sky | [`app/sky`](https://github.com/k999ln/rock/tree/main/app/sky) |
| Zema / Chat | [`app/chat`](https://github.com/k999ln/rock/tree/main/app/chat) |
| Wallet | [`app/wallet`](https://github.com/k999ln/rock/tree/main/app/wallet) |
| Market | [`app/market`](https://github.com/k999ln/rock/tree/main/app/market) |
| Settings / System | [`app/settings`](https://github.com/k999ln/rock/tree/main/app/settings) |
| Studio | [`app/studio`](https://github.com/k999ln/rock/tree/main/app/studio) |
| Platform Core | [`lib`](https://github.com/k999ln/rock/tree/main/lib) |
| Web API | [`app/api`](https://github.com/k999ln/rock/tree/main/app/api) |
| Tool Contracts / SDK | [`contracts`](https://github.com/k999ln/rock/tree/main/contracts) |
| Toolkits / MCP | [`toolkits`](https://github.com/k999ln/rock/tree/main/toolkits) |
| Native OS / QEMU | [`systems/rock-star-os`](https://github.com/k999ln/rock/tree/main/systems/rock-star-os) |

## Public boundary

This repository contains the approved Avokado Mini product concept, the RockstarOS software overview, public visual material, Control Core, and the bounded Sky + Zema public preview. Engineering specifications, hardware implementation, local AI design, account data, credentials, production integrations, native OS images, internal operations, and the restricted source tree remain private.

## License

The package can be installed from GitHub for evaluation, but no reuse license has been granted yet. Third-party code, images, and fonts remain subject to their respective licenses.

---

**Avokado Mini. Powered by RockstarOS. Built by Avokado, Ink.**
