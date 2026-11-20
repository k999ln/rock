# 85 取り込みと名寄せ（外の台帳 → 候補 → 系列 → 接続要件の下書き）

仕様: **[docs/noah/spec-85-intake.md](../../docs/noah/spec-85-intake.md)**。型と参照実装: docs/contracts/noah-intake-v1.ts、noah-v1.sql（`noah_intake_*`・`noah_probe_hosts`）、noah-regroup-v1.sql。試験: docs/design-validation/noah/noah-intake.test.mjs、validate-noah-v1.py。先に 84。本番 D1 の migration は本人の許可の後。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L3）

仕様書の **11 章** だけを見て作る。完了の定義も、その章にある。

- 先に要る PR: L2（96 の純関数）だけ
- やる: 公式台帳だけを取り込む。最初は全件、その後は毎時「更新された物だけ」（11.2）
- やる: 足すファイル: `lib/noah-flags.ts`、`lib/noah-intake-server.ts`、`lib/noah-intake-wake.ts`、`app/api/noah/intake/tick/route.ts`、`services/noah-patrol-wake/`（11.3）
- やる: 一覧・詳細・検索・集計・取り下げの API（11.5）。問い合わせは docs/contracts/noah-listing-v1.sql を文字列のまま使う
- やる: D1 の書き方（11.4）: 名寄せは 1 日 1 回。変わらない行を書かない
- やらない（出した後）: Hugging Face の Space と ACP の台帳（`draftFromSpace`・`draftFromAcp` は移さない）
- やらない（出した後）: 日本語の 1 行説明

## やること（全部。ローンチの後に、残りをやる）

1. drizzle/0044_noah_intake.sql・db/schema.ts・drizzle/meta/_journal.json: DDL 案から取り込みの 5 表と索引を移す（`when` は今の最大より大きい値）。
2. lib/noah-intake-draft.ts: 参照実装の `draftFromRegistry`・`draftFromSpace`・`draftFromAcp`・`noahCandidateId`・`NOAH_INTAKE_REASONS` を移す。
3. lib/noah-intake-family.ts: `groupNoahFamilies`・`noahRepositoryKey`・`NOAH_BULK_THRESHOLD` を移し、noah-regroup-v1.sql の 8 文を同じファイルに置く。
4. lib/noah-intake-store.ts: `createIntakeStore({ db, now, fetcher })` → `sync`・`regroup`・`list`・`detail`・`status`。巡回の順は仕様書 5.1（lease → 上限つきで頁を読む → `ON CONFLICT` で書く → 最後の頁で取り下げと名寄せ）。1 件がどの列になるかは 4 章。
5. lib/noah-intake-api.ts、app/api/noah/intake/route.ts・[id]/route.ts: 検査は lib/noah-discovery-api.ts と同じ（本文は `{}` だけ）。flag `NOAH_INTAKE_PUBLIC` が閉じている間、一覧は審査者だけ。
6. scripts/noah-discovery-daemon.mjs: `POST /api/noah/intake` も 60 秒ごとに呼ぶ。components/noah-review.tsx に「取り込み」の節（仕様書 6 章）。

## 決めてある事（変えない）

- 今の発見（`noah_discovery_*`、lib/noah-discovery-*.ts）は変えない。取り込みは別の表（今の表は出どころを 2 つに固定する CHECK を持つ）。
- この task は何も実行しない。握手もしない。台帳の説明文から命令を作らない。台帳に公開された鍵を運ばない。
- 取り下げは、前回の 9 割以上が見えた巡回でだけ行う。寝ている Space は候補の行だけを持ち、握手の対象にしない。

## 合格条件

- `node --experimental-strip-types --test tests/noah-intake-draft.test.mjs tests/noah-intake-family.test.mjs tests/noah-intake-store.test.mjs`（仕様書 7 章の 13 行）。
- `python3 docs/design-validation/noah/validate-noah-v1.py`。名寄せの SQL が、純関数と同じ系列と代表を作る。
- 手元の D1 で `POST /api/noah/intake` を 70 回呼び、候補が 6 万件以上入る。口ごと・理由ごとの件数が、仕様書 8 章（入力なし 82%・準備が必要 12%・つなげない 6%）と 1% 以内で合う。
- `npm run typecheck`、`npm run lint:product`、`npm run schema:check`、`npm run database:check`。
