Agent の詳細の「操作の流れと道具」を最初から開いた状態にする（本人指示 2026-11-28 03:04）と、本番で見つけた小さい 2 つ。commit は 1 つ（`a0a2f90f`、main `1bf5d961` の上）。

## わかった事

- 本人がスマホで Agent の詳細を見て「操作の流れと道具…開かないと使い方の流れでこの Agent でできる事出てこないの嫌だから最初からトグル開いてるようにして」。「この Agent でできる事」（工程の図）は、閉じた「操作の流れと道具」の中にあった。閉じていたのは、接続した時だけ開く指定（`expanded={Boolean(live)}`）のため。
- 体調ノート（PR #126 で公開）を本番で iPhone の幅で使うと、「保存しました」がページの一番上に出て、押したボタンの所からは見えなかった。
- 公開の後の本番の確かめ（`npm run noah:prod:check -- https://avoado.si --write`）: 75 画面 × 390px・1280px × 本人の有無で、はみ出し 0・小さい押す所 0・画面の誤り 0・404 は 0。端末の違い 0（メニュー 11 個）。受入 16 項目が通る。一周の 1 行目と 8 行目の前半が通る。API の probe だけが「落ち」: `/api/sky/commerce/[action]` が 503「決済の接続設定が完了していません。」。本番の決済（Stripe）はまだ設定していない（本番の鍵は本人の許可が要る。AGENTS.md の 6）ので、壊れてはいない。

## やった事

- 雛形（`components/noah-detail-template.tsx`）の `#noah-detail-more` を、最初から `open` にした。どの Agent の詳細（接続できる物・カタログ・自分の物）でも同じ。閉じることはできる。中の「Agentの詳細」（つなぎ方・提供者のページ）は、今までどおり閉じたまま（`tests/noah-ready-ui.test.mjs` が固定）。使われなくなった `expanded` を消した。
- 体調ノート: 保存・全部消す・保存できない時の文を、押したボタンのすぐ下に出す（`components/noah-goal-health.tsx`）。
- 本番の確かめの道具: `scripts/noah-public-probe.mjs` の結果に、応答の `error` の文（120 字まで）を足した。`scripts/noah-prod-check.mjs` の `noahProbeVerdict` は、503 で「設定が完了していません」と答えた物を「設定していない」（`unconfigured`）として別に出し、落ちにしない。ほかの 500 番台・応答なしは今までどおり落ち。
- docs: CHANGELOG（印 `FINALOPEN`）、07、task 128 の 9.6、task 142。

## 確かめた事

- 新しい試験 3 本（どれも直す前は落ち、直した後は通る）: `tests/noah-detail-open.test.mjs`（サインインの有無とも、接続の前から開いている。中の「Agentの詳細」は閉じたまま。開いても相手へは送らない）、`tests/noah-goal-health-notice.test.mjs`（知らせが押したボタンの節の中に出る）、`tests/noah-prod-check-probe.test.mjs`。
- 既存の試験は変えていない。関係する試験（noah-*・sky-*・main-page-policy・web-*、2,460 件）: 2,456 件が通り、1 件は今までどおり飛ばし、3 件が落ちた（手元の Node 22 で main でも落ちる `noah-mac-runner`「Node.js 24 以上が必要」と `noah-operation-packs`）。
- `npm run build`・`typecheck`・`lint:product`・release（release:check・web-bundle・web-assets）・private・project・repository・noah:screenless・version・design・baseline: 通る（web security の入力は変えていない）。
- 本番の 5 つの Agent の詳細で「操作の流れと道具」を開いた形にして測った: 390px・1280px で、はみ出し 0・小さい押す所 0。開くと「この Agent でできる事」（1 接続 → 2 依頼する）が見える。
- 手元の本番の build（iPhone 15 Pro の幅）で、体調ノートの「保存しました」が保存のボタンのすぐ下、画面の中に出る。

## 次の事

- マージした後、main から avoado.si を 1 回出す（D1 の migration は無し）。本番で Agent の詳細が開いて始まる事と、体調ノートの知らせの場所を Claude が確かめる。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
