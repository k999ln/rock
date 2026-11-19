# 89 ターミナルの口（ACP・MCP の package）

設計: docs/noah-agent-market-design.md §4.3・§5、docs/services/noah-agent-intake.md、docs/services/noah-own-device.md。先に 84・85。動かす所は専用の端末（今は本人の Mac の隔離環境。雲は 75 の後）。

## やること

1. lib/noah-mouth-acp.ts: ACP の台帳の配布（npx・uvx・binary の URL と hash）を、固定の型紙へ入れて専用の端末の PTY で起動し、標準入出力の JSON-RPC で話す。依頼・進行・成果・停止を `noah-terminal/1` と同じ受け渡しへ載せる。
2. lib/noah-mouth-mcp-package.ts: 公式台帳の package（npm・PyPI・OCI・MCPB）を、種類ごとの固定の型紙で起動し、標準入出力で MCP を話す。87 の道具を持つ担当から使う。
3. 型紙は口ごとに 1 つ。使えるのは台帳の型の付いた項目（識別子・版・引数・環境変数の名前）だけ。値の形を検査し、README と説明文は使わない。版と hash を固定する。
4. 依存の層。導入は外向きの通信を registry だけに開けて 1 回行い、層を保存する（Mac では固定 hash の image。雲では 75 の backup）。実行の時は接続要件の `egress` だけ。
5. モデル。OpenAI 互換の呼び出しは中継で受ける。提供元のモデルに固定の Agent（本人の契約か鍵が要る）は place=`home` だけにする。
6. 今の 13 件のうち ACP に対応する物（Goose・Cline・OpenHands・Codex）を、この口でも動かして、今の実行器と同じ成果になることを確かめる。実行器は消さない。

## 変えないもの

- `lib/noah-execution-contract.mjs` の決まり（台帳の文章を実行コードにしない）。`LIMITS`。隔離の条件。
- 本人の月額契約のログインを雲へ運ばない。今の 13 件の実行器と受入を壊さない。

## 合格条件

- ACP の台帳から選んだ 3 件と、鍵の要らない package 20 件が、Agent ごとのコードを足さずに、本人の Mac の隔離環境で 1 往復する。
- 識別子に空白や記号を混ぜた記録、型紙に無い引数を持つ記録が拒否される。
- 導入の後、registry への通信が閉じている。宣言外の host への通信が拒否される。
- 84 の検査が通る。tests/noah-mouth-terminal.test.mjs、`npm run typecheck`。
