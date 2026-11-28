#!/usr/bin/env bash
# Set up and test the Noah work from 2026-11-22.
# Development moved to iceiceice999/rock (AGENTS.md section 8). The four changes below sit on its main 94d2c762, local only until Noelle approves a push.
set -euo pipefail
repo=/home/claude/k999ln/rock-ice
cd "$repo"
git remote get-url ice >/dev/null 2>&1 || git remote add ice https://github.com/iceiceice999/rock.git
git fetch -q ice
# Same installs as CI (.github/workflows/ci.yml). CI runs Node 26.12.1 as a normal user.
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix sites/avocado-mini --ignore-scripts --no-audit --no-fund
npm ci --prefix toolkits/noah-coconala --ignore-scripts --no-audit --no-fund
node scripts/generate-private-modules.mjs
# 1. Security: React 19.2.9 (CVE-2026-126187). Build, then check the built site locally.
git switch -q ice/security-rsc-19-2-9
npm run build
npm run -s release:web-bundle:check
npm run -s release:web-assets:check
bash /tmp/claude-0/-home-claude/8d22356e-890d-54f1-af85-60300df05be9/scratchpad/websec/smoke.sh /tmp/claude-0/-home-claude/8d22356e-890d-54f1-af85-60300df05be9/scratchpad/websec
# 2. Collector: one-off source failures stay warnings.
git switch -q ice/collector-steady
node --experimental-strip-types --test tests/noah-cloud-collector.test.mjs tests/noah-agent-collector.test.mjs
# 3. Board picks.
git switch -q ice/board-picks
node --experimental-strip-types --test --test-concurrency=2 tests/noah-pins.test.mjs $(grep -l "fixtures/noah/screen" tests/*.test.mjs)
# 4. Design references.
git switch -q ice/design-references
npm run -s repository:check
npm run -s project:check
npm run -s design:check
# All four together (local branch tmp/all-four). Locally (root, Node 22) 33 tests also fail on untouched main; compare names, not totals.
git switch -q tmp/all-four
npm test || true
npm run -s typecheck
npm run -s lint:product
# 5. UX audit (branch ux/audit; docs/noah/ux-audit-2026-11-22.md, codex/tasks/127-noah-ux-debug.md).
git switch -q ux/audit
node --experimental-strip-types --test tests/noah-search-terms.test.mjs tests/noah-upload-account-ui.test.mjs tests/noah-library-public-sections.test.mjs tests/noah-usage-operator-tab.test.mjs tests/noah-revenue-catalog-cache.test.mjs tests/noah-agent-directory.test.mjs
# Read-only checks of production (no writes):
node scripts/noah-public-walk.mjs https://avoado.si || true
node scripts/noah-public-probe.mjs https://avoado.si /tmp/claude-0/-home-claude/8d22356e-890d-54f1-af85-60300df05be9/scratchpad/ux/probe-prod.json
# Local production build for write flows: build, put test-only values in dist/server/.dev.vars, run wrangler.
npm run build
printf '%s\n' 'ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID=""' "NOAH_PROFILE_KEYS={\"active\":\"t1\",\"keys\":{\"t1\":\"$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")\"}}" 'NOAH_INTAKE_PUBLIC=true' 'NOAH_ASK_FORM=true' > dist/server/.dev.vars
bash /tmp/claude-0/-home-claude/8d22356e-890d-54f1-af85-60300df05be9/scratchpad/ux/serve.sh /tmp/claude-0/-home-claude/8d22356e-890d-54f1-af85-60300df05be9/scratchpad/ux/local &
until curl -s --max-time 2 http://127.0.0.1:8787/api/health -o /dev/null; do sleep 2; done
node scripts/noah-public-walk.mjs http://127.0.0.1:8787 /noah,/noah/profile,/noah/saved?tab=agents,/noah/usage || true

# ---- 2026-11-23 (ice2 branches; latest instruction 「好きにしていいよ／だから早く完成品世に出したい」) ----
# Security fix is already on main (PR #36, 35afadfc, Sites v220). The six ice2 branches are local and in k999ln/rock claude/ice2/*.
git fetch -q ice
for b in ice2/noah-collector-steady:ice2/collector-steady ice2/noah-board-picks:ice2/board-picks ice2/design-references:ice2/design-references ice2/noah-ux-audit:ice2/ux-audit ice2/noah-launch:ice2/noah-launch ice2/noah-quota:ice2/noah-quota; do
  git rev-parse -q --verify "${b#*:}" >/dev/null || git fetch -q origin "refs/heads/claude/${b%%:*}:refs/heads/${b#*:}"
done
# Launch decisions (Q1-Q5, D3) and the daily cap (D1):
git switch -q ice2/noah-quota
node --experimental-strip-types --test tests/noah-card-origin.test.mjs tests/noah-mac-menu.test.mjs tests/noah-upload-runs-on.test.mjs tests/noah-profile-signed-in-only.test.mjs tests/rockstar-entitlement-delivery-unconfigured.test.mjs tests/noah-browser-quota.test.mjs tests/noah-browser-quota-flows.test.mjs tests/noah-route-unification.test.mjs
npm run -s release:check   # needs data/web-security-response-current.json measured on this source (done on ice2/noah-launch)
# All six on main: merge them on a detached main checkout (CHANGELOG with tools/merge-changelog.py from claude/ice2/handoff), then npm test; compare failure names with untouched main.

# ---- 2026-11-24 (all 9 ice2 branches are on iceiceice999/rock main 5631fa7c; publish waits for PR #41) ----
git fetch -q ice main
# Free cloud counted by Workers AI neurons (branch claude/ice2/noah-cloud-neurons, cadd58b1). Fresh worktree needs its own npm ci.
git worktree add -q -b ice2/noah-cloud-neurons ../cloudwt origin/claude/ice2/noah-cloud-neurons 2>/dev/null || true
( cd ../cloudwt && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && \
  node --experimental-strip-types --test tests/noah-free-cloud-neurons.test.mjs tests/noah-free-cloud.test.mjs tests/noah-cloud-api.test.mjs tests/noah-cloud-runtime.test.mjs && \
  (cd services/noah-cloud-agents && node build-free.mjs) )
# Production checks after a publish (writes only synthetic data; scripts live in the scratchpad):
#   node prod/published.mjs; node prod/accept.mjs https://avoado.si; node prod/walk90.cjs https://avoado.si; node prod/screens.cjs https://avoado.si

# ---- 2026-11-27 final release (Noelle 15:58; plan in HANDOFF.md) ----
git fetch -q ice main
git fetch -q origin claude/ice2/noah-final-fixes
# D2 (per-person share of a host), D7 (/noah/help 44px), D8 (sign-in destination). Branch d2b2eb55 on ice/main 7337b003.
git worktree add -q --detach ../finalwt origin/claude/ice2/noah-final-fixes 2>/dev/null || true
( cd ../finalwt && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && \
  node --experimental-strip-types --test tests/noah-ask-host-share.test.mjs tests/noah-help-tap.test.mjs tests/noah-signin-destination.test.mjs \
    tests/noah-form.test.mjs tests/noah-ask.test.mjs tests/noah-launch-ops.test.mjs tests/noah-probe.test.mjs tests/noah-first-earning.test.mjs && \
  npm run -s typecheck && npm run -s lint:product )
# Full suite: compare failure names with untouched main (locally Node 22 fails the same 34 on both; CI uses Node 26.12.1).
# Production checks, from the repository once merged: node scripts/noah-prod-check.mjs all https://avoado.si [--write] [--out=<dir outside git>]
# Part 2 (D6 results + 体調ノート): branch claude/ice2/noah-final-d6 3121b434 on 0572070e.
git fetch -q origin claude/ice2/noah-final-d6
git worktree add -q --detach ../d6wt origin/claude/ice2/noah-final-d6 2>/dev/null || true
( cd ../d6wt && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && \
  node --experimental-strip-types --test tests/noah-goal-health.test.mjs tests/noah-goal-health-ui.test.mjs tests/noah-goal-health-store.test.mjs \
    tests/noah-menu-served.test.mjs tests/main-page-policy.test.mjs tests/noah-prod-unverified.test.mjs tests/noah-prod-check.test.mjs tests/noah-tap-floor.test.mjs && \
  npm run -s typecheck && npm run -s lint:product && npm run -s build && npm run -s release:check )
# Local production build with the repo's production Wrangler (4.147, supports the 2026-10-01 compatibility date; no D1 migrations needed for these routes):
#   node scripts/local-wrangler.mjs --config dist/server/wrangler.json --port 8811 --ip 127.0.0.1 --persist-to <dir outside git>
#   curl -H 'Host: avoado.si' http://127.0.0.1:8811/noah/goals/health   # 200 (public page list)
#   node scripts/check-web-security-response.mjs http://127.0.0.1:8811 --record-local-production   # only when noah-shell.tsx / main-page-policy.mjs etc. changed
# D6 re-check of the 9 handshake failures (6 h after the first run): node scripts/noah-prod-check.mjs unverified https://avoado.si --write --ids=<ids from the D6 doc section 3>

# Codex 2026-11-28: https://github.com/iceiceice999/rock/pull/127 https://github.com/iceiceice999/rock/pull/126
# Sites v268; main 1bf5d961; restore point v267.
# Sites v268: 75 routes checked at 390px and 1280px, signed out.
# Detail redesign + tool catalog refresh: branch claude/ice2/noah-detail-plain 27833c6f (4 commits on ice/main 1bf5d961).
git fetch -q origin claude/ice2/noah-detail-plain
git worktree add -q --detach ../plainwt origin/claude/ice2/noah-detail-plain 2>/dev/null || true
( cd ../plainwt && npm ci --ignore-scripts --no-audit --no-fund >/dev/null && \
  node --experimental-strip-types --test tests/noah-tool-catalog-refresh.test.mjs tests/noah-tool-list-explanation.test.mjs tests/noah-agent-explanation.test.mjs \
    tests/noah-detail-plain.test.mjs tests/noah-detail-open.test.mjs tests/noah-ready-ui.test.mjs && \
  npm run -s typecheck && npm run -s lint:product )
# Refresh the bundled tool catalog (reads production's public API and the official registry; handshakes only, no tool calls):
#   node --experimental-strip-types scripts/noah-tool-catalog-refresh.mjs            # dry run: agents with no tool list in production
#   node --experimental-strip-types scripts/noah-tool-catalog-refresh.mjs --write    # writes data/noah-tool-catalog.json
