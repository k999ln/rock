# 87 道具を持つ担当（入力欄で頼む・1 文で頼む）

仕様: **[docs/noah/spec-87-tool-agent.md](../../docs/noah/spec-87-tool-agent.md)**。型と参照実装: docs/contracts/noah-tool-agent-v1.ts、noah-form-v1.ts、noah-v1.sql（`noah_asks`）。試験: docs/design-validation/noah/noah-tool-agent.test.mjs、noah-form.test.mjs。先に 86。モデルの出どころと月の上限は本人の許可の後（flag `NOAH_MODEL_RELAY=test` のまま入れる）。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L6）

仕様書の **11 章** だけを見て作る。完了の定義も、その章にある。

- 先に要る PR: L5（74 のローンチ分。`noah_connections` と「接続」）
- やる: 入力欄で頼む（道具を選ぶ画面を含む）。下の「やること」の 2・3・4・6 を、11 章の形で
- やる: API: `GET /api/noah/connect/[id]/tools`、`POST /api/noah/ask`（`form` だけ）、`stop`（11.3）。成果を受け取る操作は作らない（Work に入った時点で「結果を受け取りました」）。実行は 11.4 の 12 段
- やる: 頼む前の上限（`noahAskGate`）、道具の一覧と依頼の握手の前に接続先の枠を取る事（`host_take`。74 と同じ枠）、相手が 429 を返した時の `host_wait`、本人の実行で「動いた」を付ける所（88 の 9.2）
- やらない（出した後）: 1（`lib/noah-tool-agent.ts`）と 5（`services/noah-relay`、頼み返しの API）。「1 文で頼む」「あなたの番」「直してもらう」

## やること（全部。ローンチの後に、残りをやる）

1. lib/noah-tool-agent.ts: 参照実装を全部移す（`runNoahToolAgent`・`fitNoahTools`・モデルの API の形との変換。入力の検査 `checkNoahToolArgs` は lib/noah-form.ts の物を使う）。
2. lib/workflow.ts の `WorkJob` に `noahRemote?` を足し、Noah の受け取りに分岐を足す。lib/noah-remote-work.ts（`createNoahRemoteWork`・`updateNoahRemoteWork`。仕様書 4.1）。
3. `noah_asks` の migration。lib/noah-ask.ts、app/api/noah/ask/route.ts・[id]/route.ts（仕様書 5 章。`stop`・`approve`・`deny`・`redo`）。
4. 入力欄で頼む仕事（`form`）: Web の本体の中で、応答の後の `waitUntil`、握手 8 秒・呼び出し 20 秒まで（仕様書 11.4）。**これは今の配備のまま出せる。**
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

## 開発進捗

- 2026-11-21 03:00 JST: **L6（入力欄で頼む。仕様書 11 章）は Claude が作業中。** 枝は `claude/noah-ask-l6-20261121`（L5 の枝 `claude/noah-connect-l5-20261121` = [PR #342](https://github.com/k999ln/rock/pull/342) の上。[PR #344](https://github.com/k999ln/rock/pull/344)）。同じ範囲を、別の枝で作り始めない。
- 入れる物（仕様書 11.1 のローンチまでの列）: migration `noah_asks`（番号は 0048 の予定。0045・0046 は Codex、0047 は接続の表）、`lib/workflow.ts`（`noahRemote`）、`lib/noah-remote-work.ts`、`lib/noah-ask.ts` と入口 2 つ（`/api/noah/ask`・`/api/noah/ask/[id]`）、画面（`components/noah-ask.tsx` に、道具を選ぶ・入力欄・確かめ。`components/noah-work-list.tsx`）、`tests/noah-ask.test.mjs`、手元の D1 での受入の script。
- 入れない物: 1 文で頼む（モデル・`services/noah-relay`・`lib/noah-tool-agent.ts`・「あなたの番」）。本番への migration・配備・切り替え。
- 順: 先に、画面に依らない所（表・Work・API・実行・試験）。次に画面。
- 2026-11-21 03:40 JST: **L6 を入れた**（[PR #344](https://github.com/k999ln/rock/pull/344)。未マージ）。
  - 入れた物: migration `0048_noah_asks`（`drizzle/`・`drizzle-main/`・`db/schema.ts`）、`lib/workflow.ts`（`noahRemote`）、`lib/noah-remote-work.ts`、`lib/noah-ask-store.ts`、`lib/noah-ask.ts`、入口 2 つ（`app/api/noah/ask/route.ts`・`[id]/route.ts`）、画面（`lib/noah-ask-view.ts`・`components/noah-ask.tsx`・`components/noah-work-list.tsx`）。接続を切ると、終わっていない依頼を止める（`lib/noah-connect.ts`）。
  - 決めた事と理由・手元の実物での確かめ・出す時に気を付ける事は、[仕様書 87](../../docs/noah/spec-87-tool-agent.md) の 11.8。
  - 確かめ方: `node --experimental-strip-types --test tests/noah-form.test.mjs tests/noah-ask.test.mjs tests/noah-ask-ui.test.mjs`。`npm run typecheck`、`npm run lint:product`、`npm run work:check`、`npm run test:api`、`npm run release:check`。
  - **完了の定義のうち、通していない物:** 「確かめが要る道具へ、実在の相手で頼んで成果が出る」。手元の系列で見つかった、読み取りだけと宣言されていない使える道具は 1 個で、相手の事業者へ問い合わせを送る物だった。本人の許可なく送らない。送る手前の確かめの画面までを、実物で見た。呼ぶ所は、試験の中の相手で確かめた。
  - 残り: 成果を「成果データ」（`/noah/data`）と「実行中」（`/noah/activity`）に出す所（Codex の `lib/noah-result-data.ts` は `noahExecution` だけを読む）。「利用人数」に依頼を数える所。受入の script（Miniflare の D1）。`running` のまま残った依頼の後始末は L7。
  - 本番への migration・配備・切り替えは行っていない。
- 2026-11-21 03:55 JST: **受入の script を足した**（上の「残り」のうちの 1 つ。`node --experimental-strip-types scripts/check-noah-ask.mjs`。表は Miniflare の D1、相手は合成の 17。外へは通信しない）。依頼 63 件（成果 42・失敗 14・結果不明 2・止めた 5）で、依頼と Work は 1 対 1・終わっていない物は 0・道具の呼び出しは 1 件につき 1 回まで。止める・切る・上限の SQL を、D1 の上で通した。D1 への往復は、受け付け 6・実行 15〜16（数え方と内訳は、仕様書 87 の 11.8）。
  - GitHub のコード検査（CodeQL）が、試験の 2 か所（先頭だけに `^` が掛かる正規表現・URL を文字の先頭で比べる所）を指摘したので、書き直した（検査している中身は同じ）。自動検査は `verify`・`CodeQL` とも成功（`0fee854`）。`SPIDER / secrets` は、過去の commit 3 件の分で赤のまま（この PR の変更ではない）。

- 2026-11-21 18:00 JST: **「実行中」と「成果データ」に、頼んだ仕事を出した**（本人の回答「#349 にしか無い所は、後から上に小さく足す」。[PR #352](https://github.com/k999ln/rock/pull/352)。仕様書 11.9）。`GET /api/noah/ask` の行に `agentId`、`components/noah-work-list.tsx` の Agent をまたぐ形、頁から Codex の画面へ渡す `phoneWork`・`phoneResults`。残り: 成果データの書き出し・運営への提供に載せるか、「利用人数」に数えるか（本人）。
