# 89 ターミナルの口（端末で動かす配布: MCP の package・ACP）

仕様: **[docs/noah/spec-89-terminal-mouth.md](../../docs/noah/spec-89-terminal-mouth.md)**。型と参照実装: docs/contracts/noah-intake-v1.ts（台帳の読み方）、noah-mouth-v1.ts の `noahLaunchPlan`。先に 84・85。動かす所は専用の端末（今は本人の Mac の隔離環境。雲は 75 の後）。

**最初にやる事: 仕様書 6 章の「確かめていない事」6 つを、Mac の隔離環境で確かめる。** 設計の検証では、外の配布を実際に動かしていない。結果で型紙を直してよい（何を直したかを PR 本文に書く）。

## やること

1. lib/noah-intake-pin.ts: 中身の固定（npm の `dist.integrity`、PyPI の配布の sha256、OCI の tag → hash、binary は台帳の sha256）。85 の `sync()` から 1 回に 8 件。固定したら接続要件の `integrity` を書き換える（仕様書 4.1）。
2. lib/noah-launch-plan.ts: 参照実装の `noahLaunchPlan` を移す（導入の時だけ開ける host、導入の argv、確かめ方、実行の argv。4.3）。
3. scripts/noah-package-runtime.mjs（端末の側）: 導入 → 確かめ → 起動 → 標準入出力で握手 → 止める。`run` は `payload.call` の道具を 1 回呼ぶ。ACP は `session/new` → `session/prompt`（仕様書 5 章）。隔離の引数は scripts/noah-terminal-runtime.mjs と同じ。
4. `NoahAgentPin.kind` に `'package'` を足し、lib/noah-launch.ts の `binding()` と scripts/noah-mac-runner.mjs に分岐を足す。`noah_runner_commands` の表は変えない。
5. 通信先: 最初は全部閉じる。求めた host を記録して、接続の画面で 1 回確かめる（`egress_granted_json`）。
6. 今の 13 件のうち ACP に対応する 4 件（Goose・Cline・OpenHands・Codex）を、この口でも動かして比べる。今の実行器は消さない。

## 決めてある事（変えない）

- 台帳の説明文や README から命令を作らない（lib/noah-execution-contract.mjs）。使うのは、型の付いた項目だけ。固定していない配布は動かさない。
- 台帳の「実行器への引数」（`docker` の `-v`・`--network` など）は、そのまま渡さない。読み替えるのは 5 つの書き方だけ。本人の端末のファイルが必須の配布は、つなげない。
- `LIMITS`。隔離の条件。本人の月額契約のログインを雲へ運ばない。今の 13 件の実行器と受入。

## 合格条件

- 仕様書 6 章の表の全部に結果が書いてある。
- ACP の台帳の 3 件と、鍵の要らない package 20 件が、Agent ごとのコードを足さずに、本人の Mac の隔離環境で握手まで通る。通った数と落ちた理由を PR 本文に書く。
- 導入の後、registry への通信が閉じている。宣言していない host への通信が拒否される。`node scripts/check-noah-screenless.mjs` が通る。
- `node --experimental-strip-types --test tests/noah-intake-pin.test.mjs tests/noah-package-runtime.test.mjs`、`npm run typecheck`。今の 13 件の受入が変わらず通る。
