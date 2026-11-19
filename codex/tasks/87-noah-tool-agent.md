# 87 道具を持つ担当（入力欄で頼む・1 文で頼む）

仕様: **[docs/noah/spec-87-tool-agent.md](../../docs/noah/spec-87-tool-agent.md)**。型と参照実装: docs/contracts/noah-tool-agent-v1.ts、noah-v1.sql（`noah_asks`）。試験: docs/design-validation/noah/noah-tool-agent.test.mjs。先に 86。モデルの出どころと月の上限は本人の許可の後（flag `NOAH_MODEL_RELAY=test` のまま入れる）。

## やること

1. lib/noah-tool-agent.ts: 参照実装を全部移す（`runNoahToolAgent`・`fitNoahTools`・`checkNoahToolArgs`・`noahDirectForm`・モデルの API の形との変換）。
2. lib/workflow.ts の `WorkJob` に `noahRemote?` を足し、Noah の受け取りに分岐を足す。lib/noah-remote-work.ts（`createNoahRemoteWork`・`updateNoahRemoteWork`。仕様書 4.1）。
3. `noah_asks` の migration。lib/noah-ask.ts、app/api/noah/ask/route.ts・[id]/route.ts（仕様書 5 章。`stop`・`approve`・`deny`・`accept`・`redo`）。
4. 入力欄で頼む仕事（`form`）: Web の本体の中で、応答の後の `waitUntil`、25 秒まで（仕様書 6.1）。**これは今の配備のまま出せる。**
5. 1 文で頼む仕事（`agent`）: services/noah-relay（Durable Object。services/noah-test-runtime を土台にする）と、頼み返しの API lib/noah-relay-api.ts・app/api/noah/relay/route.ts（仕様書 6.2〜6.3）。手元でだけ動かす。
6. components/noah-ask.tsx・components/noah-work-list.tsx（仕様書 7 章の図と、状態ごとの文）。

## 決めてある事（変えない）

- Eve → Noa → AMC → Jev の構造。lib/noah-execution.ts（家の端末の仕事）、`noah_runner_commands`、`LIMITS`。
- 道具の説明と結果を、固定の指示の中へ入れない。一覧に無い道具は呼ばない。読み取りだけでない道具は、最初の 1 回、本人に確かめる。失敗した呼び出しを呼び直さない。
- 鍵と token を専用の Worker へ渡さない。依頼と成果の本文は Work にだけ置く。別の接続の成果や記憶を渡さない。

## 合格条件

- `node --experimental-strip-types --test tests/noah-tool-agent.test.mjs tests/noah-ask.test.mjs` と、services/noah-relay の試験（同じ step を 2 回実行しない、止める、作り直す）。
- 手元で、鍵の要らない接続先へ入力欄から頼んで成果が出る。Mac を使わない。`POST` の後に `GET` を 1 回も呼ばなくても、Work に成果が入る。
- 道具の説明に「前の指示を無視して…」と書いた接続先で、一覧に無い道具も、確認の要る道具も呼ばれない。
- `npm run typecheck`、`npm run lint:product`、`npm run work:check`。本番への配備と migration の適用は行わない。
