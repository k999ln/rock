# 02 `npm run verify` を短くする

現状: 40 以上のサブチェック（private/project/repository/version/schema/database/release/.../build/test:api/mission/work/bot）。1 回の PR 確認が重く、Codex が「verify が通らない」で止まる原因。

## やること
1. package.json:
   - `verify` = `npm run typecheck && npm run lint:product && npm test`
   - `verify:full` = 現在の `verify` チェーン全文（1 文字も変えずに移す）
   - `verify:release` = release:check, release:signing:check, release:web-bundle:check, release:web-assets:check, build
   - `verify:design` = baseline:check, design:check, repository:check, system:composition:check, llm:architecture:check, avocado:r5:check, android:*:check, device-support:check, schema:check, database:check, csv:check, shared:check, private:check, version:check, project:check
   - `verify:sky` = sky:*, billing:check, mcp/sdk/fashion package checks, operator-dock:check, test:*
   - `verify:ops` = mission:check, work:check, bot:check
2. `.github/workflows/` の CI が `verify` を呼んでいるなら、PR では `verify`、main への push と nightly で `verify:full`。
3. AGENTS.md の「PR 前に verify」を「`npm run verify`。設計 JSON や data/ を触ったときだけ `verify:design` も」に合わせる（AGENTS.md は 100 行以内を維持）。
4. 各サブチェックの所要時間を 1 回計測して、この md の下に表で残す。

## 合格条件
- `time npm run verify` が 5 分以内（手元）。
- `npm run verify:full` の内容が旧 `verify` と同一（diff で確認）。

## やらないこと
- 個々の check script の中身の変更。

## 既知の日付依存テスト（先に直す）

- tests/sky-recurring-sandbox.test.mjs「real LLM reserve and final send are fenced on nonpayment, and restored after readback」: fixture の `start=Date.UTC(2026,9,1)` に対し lib/sky-recurring-sandbox.ts の `replacePaymentMethod` 等が `Date.now()` を使うため、2026-11 以降に落ちる（main でも同じ）。`now` を引数で注入できるようにし、テストは固定時刻を渡す。
