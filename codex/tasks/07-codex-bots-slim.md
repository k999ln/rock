# 07 .codex/agents の bot を役割に合わせる

現状 13 bot: amc, amc-reviewer, amc-worker, avocado-mini-bot, avokado-pro-bot, game-bot, operations-bot, rocketstar-bot, rockstaros-bot, security-bot, sky-bot, wallet-bot, zema-bot。

## やること
1. 06-naming.md に合わせ改名: zema-bot → eve-bot、avocado-mini-bot → mii-bot、rocketstar-bot は旧設計資料向けなので `archive/codex-agents/` へ。security-bot は Spider の役割なので spider-bot に。
2. 各 bot の toml に「読むフォルダ」を docs/structure/09-repo-layout.md の表の 1 行に限定する指示を書く（全体 grep 禁止、`.ignore` を尊重）。
3. amc / amc-reviewer / amc-worker の 3 本は AMC の内部役割（分解・評価・実行）。重複する system prompt を `.codex/skills/amc/` に 1 本化し、toml からは参照だけにする。
4. avokado-pro-bot は今回の範囲外。触らない。
5. `npm run bot:check` を通す。

## 合格条件
- bot 名と 06-naming.md の内側の名前が一致。
- 各 toml の読取範囲が 1 フォルダ群に限定されている。
