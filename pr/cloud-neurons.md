## 何をしたか

本人（2026-11-24）「クラウドのシステム作って」「100人とかいったら黒字化するよね？」「cloudflareでいいから最初は」。答え: 払い方は「Agentの利益から差し引く」、Cloudflare の Workers Paid は「まだ申し込まない」。

Workers Paid が無いと、容れ物（Containers）も Dynamic Workers も使えないので、今できるのは無料のクラウド（公式の 6 つ）を、100 人が使える形にする事。今は全体で 1 日 10 件・本人 3 件の件数で止めていて、Workers AI の無料割当（1 日 10,000 neuron）の多くを使い残していた。

- **受付（`NoahCloudBudget`）**: 件数の代わりに、使ったモデルの量（neuron）で数える。全体 8,000/UTC日（Worker の `NOAH_CLOUD_DAILY_NEURONS` で下げられる。上げる事はできない）、本人 2,400、受付時に 1 件 1,200 を取り置く（取り置きと使った量の合計が、1 日の上限を超えない）。件数の上限は安全の柵として全体 60・本人 12。使い切った日は「日本時間の朝 9 時に戻ります」を返す。
- **実行（`NoahFreeCloudJob.runModel`）**: モデルを呼ぶ前に、入力のバイト数を上限のトークン数として、1 件の上限を超えないかを確かめる。応答の `usage` で使った量を数え（無い時は上限で数える）、依頼と全体の枠に足す。止めた・時間切れの時も、その 1 回の上限で数える。
- **見つけて直した事**: 断る理由を `blockConcurrencyWhile` の中で投げていたので、Durable Object が作り直され、失敗の結果を Noah に返せなかった（モデル呼出・入力の上限でも同じ）。区間の外で投げるようにした。
- **保存と画面**: 使った量（入力・出力のトークン・neuron）を Work の `noahRemote.cloud.usage` に残し、クラウドの画面に「使った量: モデル N 回・M neuron（無料の枠の中。有料プランの値段なら 約 X 円）」を出す。おかしい値は捨て、結果は残す。5 か国語の訳を足した。
- **文書**: `docs/services/noah-cloud-agents.md`・`docs/noah/illustrated-specifications.md`・`services/noah-cloud-agents/README.md`・`docs/structure/07`（2026-11-24 の決め）・task 125。

費用の見積り（$1=¥150）: ふつうの依頼 1 件 約 ¥0.5。100 人×月 30 件で月 約 ¥1,700（Workers Paid の $5 を含む）。

## 配る順

1. この PR をマージする。
2. `services/noah-cloud-agents` で `npm ci`、続けて `npx wrangler deploy --config ./wrangler.free.jsonc`（旧 account に固定。Python の 3 Worker は変えていないので配り直さない）。ここで受付の数え方が変わる。Sites の公開とは別で、今の Sites（usage を知らない版）にもそのまま結果が届く。
3. Sites は、次に main から公開する時に、使った量の保存と表示が入る。D1 の migration は無い。

## 確かめた事

- 足した試験 `tests/noah-free-cloud-neurons.test.mjs`（6 本: 数え方・結果の usage・全体の断り・本人の断り・1 件の上限・Work への保存）。main では落ち、この枝で通る。
- 既存のクラウド・利用量・画面の試験と合わせて 84 本が通る。
- `npm run typecheck`・oxlint・`project/repository/release/design/version` の check が通る。`node build-free.mjs` で Worker を梱包できる（gzip 263,722 バイト）。
- 全体の `npm test`（手元。Node 22・root）: 5,319 本のうち 5,281 本が通った（4 本は skip）。落ちた 34 本（名前は 33）は、手を入れていない main でも落ちる 32 の名前と、新しく作った作業場所に `sites/avocado-mini` の依存を入れていないために落ちる 1 本（Mini unifont。手元の別の作業場所では通る）。この枝で新しく落ちた物は 0。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
