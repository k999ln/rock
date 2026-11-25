#!/usr/bin/env bash
# task 130（Eve / eve.si のエージェントエンジニアリング）を手元で起動し、試験を回す手順。
# 使い方: bash codex/progress/130-eve-si/init.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# 1. 依存を入れる（無い時だけ）。
[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund

# 2. task 130 の試験（外へは通信しない。相手のエージェントは合成の物）。
node --experimental-strip-types --test tests/eve-combination*.test.mjs tests/eve-demand*.test.mjs tests/eve-discover*.test.mjs tests/eve-score*.test.mjs tests/eve-run*.test.mjs

# 3. 元からある試験のうち、task 130 が使う部品の物。
node --experimental-strip-types --test tests/noah-business.test.mjs tests/sky-recipe-planner.test.mjs

# 4. 型の検査と、設計の検査。
npm run typecheck
node --experimental-strip-types scripts/check-design-document-index.mjs
node scripts/project-status.mjs --check

# 5. 本番の 1 回（手で動かす時だけ。手元の Qwen が要る。公開・登録・申請はしない。本人の番で止まる）:
#   python3 scripts/eve-local-llm.py <qwen2.5-3b-instruct-q4_k_m.gguf> &
#   node --experimental-strip-types scripts/eve-run.mjs start --combination affiliate:ai-agent-cloud:blog:a8 --theme "AIエージェントを動かすクラウド" --run-id <回の id>
