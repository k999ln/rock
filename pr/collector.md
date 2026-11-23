## 何をしたか

Noah の Agent 収集（`.github/workflows/noah-agent-collection.yml`）が、1 回きりの出所の失敗で、実行全体を「失敗」にしていたのを直した。

旧リポジトリの k999ln/rock#416 を、この main（b310b319）の上に移した。

**わかった事**: 旧リポジトリでの収集の実行は 10 回。予定（5 分ごと）での起動は 2 回だけで、2 回とも失敗だった。中身を見ると、GitHub の出所が 1 回 `unavailable` を返しただけで、台帳・握手・取り込み・掲載・進み具合の保存は全部できていた。それでも exit 1 で「失敗」になり、本当に直す必要がある失敗と見分けが付かなかった。

- `collectorAlerts`: 失敗を 2 つに分ける。
  - **人が見る失敗**（実行を失敗にする）: 本番の一覧への取り込み・掲載の失敗、形が変わった応答（`invalid_response`）、X の鍵（`needs_credentials`・`quota_required`）、同じ出所が 6 回続けて失敗。
  - **次の回に任せる失敗**（成功のまま）: 1 回きりの `unavailable`・混雑。出所ごとに続きから動き、再開の時刻も保存されている。
- `collectorSummary`: 毎回の実行の要約（Actions の画面の Summary）に、台帳・有効・握手・一覧に載る・まだ確かめていない数、本番の一覧へ入れた数、出所ごとの数と状態、失敗を出す。鍵は書かない。
- 結果の JSON に `alerts`・`warnings` を足した（`errors` は今までどおり）。

## やっていない事

握手の量・取り込みの上限・予定の起動の間隔は、[task 123](../blob/main/codex/tasks/123-noah-all-agents-usable.md) の 2.1 で Codex が直す所なので、触っていない。

## 確かめた事

- `noah-cloud-collector`・`noah-agent-collector` 20 本（足した 2 本: 失敗の分け方・要約に数と失敗が出て鍵が出ない）: 全部通った。
- 4 つの直し（安全・収集・ボードのおすすめ・デザイン参照）を、main 94d2c762 の上に重ねて確かめた。その後 main に入った #10・#11 と重なるのは CHANGELOG だけなので、b310b319 の上に移し直した。
  - `npm test`（手元。Node 22・root）: 5,137 本のうち 5,099 本が通った。落ちた 34 本のうち 33 本は、手を入れていない main（94d2c762）でも同じ名前で落ちる（root で動かすと断る試験と、Node 22 に無い SQLite の API。CI は Node 26.12.1）。残りの 1 本（`undici-dependency-security`）は `sites/avocado-mini` の `npm ci` をしていなかったためで、CI と同じく入れてから流すと通った。
  - `tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。
  - gitleaks（`.github/spider/gitleaks.toml`）: どの commit も 0 件。

- 2026-11-23: main `9cb7f5d1`（#32）を merge した後、4 本（収集・ボード・デザインの参照・一周の確かめ）を重ねて、もう一度流した。`npm test`: 5,222 本のうち 5,182 本が通った（4 本は skip）。落ちた 36 本（名前は 35）は、全部、手を入れていない main `9cb7f5d1` でも同じ名前で落ちる（新しく落ちた物は 0）。`tsc --noEmit`・`lint:product`・`repository:check`・`project:check`・`design:check`・`release:check`・`schema:check`・`database:check`: 通った。gitleaks: 0 件。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
