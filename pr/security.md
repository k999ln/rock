## 何をしたか（緊急）

今の main（b310b319）と、本番の Sites 206 の元になった 94d2c762 の `react-server-dom-webpack` は、どちらも **19.2.8**。これは **CVE-2026-126187**（React Server Components の、認証なしで外からコードを動かせる穴。critical。2026-11-10 公開）の範囲（19.2.0〜19.2.8・19.3.0）に入る。直った **19.2.9** に上げた。

旧リポジトリの k999ln/rock#417 と同じ直しを、この main の上で作り直した。

- `react`・`react-dom`・`react-server-dom-webpack` を 19.2.9 にそろえた（RSC は react と同じ版が要る）。
  - 11-11 の Dependabot の枝 `dependabot/npm_and_yarn/react-server-dom-webpack-19.3.1` は `react-server-dom-webpack` だけを 19.3.1 にしていて、react 19.2.8 と版が合わない。
- `@vitejs/plugin-rsc` 0.5.34 は 19.2.8 を同梱しているが、根に `react-server-dom-webpack` がある時はそれを使う（`rsc:react-server-dom-webpack-alias`）。
- `shadcn` の CLI が引く物も、範囲の中で直った版に上げた。
  - `body-parser` 2.3.0 → 2.4.0（high）
  - `systeminformation` 5.33.8 → 5.33.23（high）
  - `qs` 6.16.0 → 6.17.1、`hono` 4.13.7 → 4.13.20、`@hono/node-server` 2.1.1 → 2.1.11、`fast-uri` 3.1.8 → 3.1.9、`ip-address` 10.7.3 → 10.7.6
- license の一覧（`data/web-third-party-license-audit.json`）を作り直した。

根の `npm audit`（lockfile だけで数えた）: **18 件（critical 1・high 3）→ 10 件（critical 0・high 1）**。

この PR で、次の Dependabot の枝の中身も入る（枝は Dependabot の物なので、触っていない）: body-parser・systeminformation・qs・hono・hono/node-server・fast-uri・ip-address・react-server-dom-webpack。

## 確かめた事

- `npm run build`: 通った。build の出力（`dist/`）に 19.2.8 は無く、19.2.9 だけがある。
- 手元の本番 build を wrangler local で動かした: `/`・`/noah`・`/noah/explore`・`/noah/teikibin` が 200（`/noah/boards` は 307）。応答ヘッダの検査（`check-web-security-response`）が PASS。
- `release:web-bundle:check`・`release:web-assets:check`: 通った。
- `npm audit --package-lock-only`: main 18 件（critical 1・high 3）→ この枝 10 件（critical 0・high 1）。
- 4 つの直し（安全・収集・ボードのおすすめ・デザイン参照）を、main 94d2c762 の上に重ねて確かめた。その後 main に入った #10・#11 と重なるのは CHANGELOG だけなので、b310b319 の上に移し直した。
  - `npm test`（手元。Node 22・root）: 5,137 本のうち 5,099 本が通った。落ちた 34 本のうち 33 本は、手を入れていない main（94d2c762）でも同じ名前で落ちる（root で動かすと断る試験と、Node 22 に無い SQLite の API。CI は Node 26.12.1）。残りの 1 本（`undici-dependency-security`）は `sites/avocado-mini` の `npm ci` をしていなかったためで、CI と同じく入れてから流すと通った。
  - `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。
  - gitleaks（`.github/spider/gitleaks.toml`）: どの commit も 0 件。

## 本番

main に入ったら、avoado.si を main から公開し直す必要がある（Sites の公開は Codex・ノエル）。AGENTS.md の 8 のとおり、公開の前に main と Sites ソースの `git rev-parse 'HEAD^{tree}'` を照合する。

## 残り（別の PR）

- `vite` 8.2.2（high。開発の server と Windows の launch-editor だけで、本番の応答には関係しない）は、8.3.x への minor の版上げが要る。
- moderate 9 件（`vinext` 1.0.0-beta.9 → 1.4.x、`vitest`、`shadcn` まわり）は、major・beta からの版上げで、build の確かめが要る。
- 根の外（`sites/`・`toolkits/`・`services/` の各 package）の穴は、別に数える。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
