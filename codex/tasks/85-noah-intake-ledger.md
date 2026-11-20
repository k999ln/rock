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

## 実装の引き継ぎ（2026-11-20、PR #332）

- ブランチ `codex/noah-intake-l3-20261120`。L2 #330 の上に積んだ PR。main への直接 push・マージはしていない。
- ローンチ範囲の公式台帳だけを実装。Space/ACP の取り込み、Agent への握手・実行は入れない。既存の発見の表は変えない。
- `0044_noah_intake.sql` は root と canonical main の両系譜に同じ内容で追加。**本番へは適用していない。**
- `lib/noah-intake-sync.ts` が巡回、`-store.ts` が一覧と運営、`-db.ts` が参照 SQL の引数を D1 に渡す。環境変数は `-server.ts` だけで読む。
- 製品試験: `node --experimental-strip-types --test tests/noah-intake-*.test.mjs tests/noah-discovery-daemon.test.mjs`。
- 型契約: `node --experimental-strip-types --test docs/design-validation/noah/noah-*.test.mjs`（61/61）、`python3 docs/design-validation/noah/validate-noah-v1.py`（10/10）。移設済み表も元の DDL と一致するか検査する。
- 大量受入: `node --experimental-strip-types scripts/check-noah-intake.mjs` は合成65,000件、`--live` は公式台帳だけを読む。どちらも一時的なローカルD1。論理時計を1分ずつ進めた署名付き合図71回で、最後に差分巡回を検査する。Agentの接続先には通信しない。
- `WRANGLER_WRITE_LOGS=false npx wrangler deploy --dry-run --config services/noah-patrol-wake/wrangler.jsonc --outdir work/noah-patrol-wake-dry-run` 成功。配備はしていない。
- 検証結果: `npm run verify` 成功（ルート4,466成功・4 skip、仕事API 1,918、CSV 385）。最新差分の製品23群、typecheck、lint:productも成功。migration追加で変わる表数・末尾番号を既存回帰試験へ反映した。
- 実台帳の受入: 70回で68,964件を保存し、71回目は `updated_since` 付き1頁・36件を取得、合計68,967件。初回完了時のローカルD1を読み取り専用で保存し、最終コードで集計を照合した。対象67,861件の内訳は、相手のサーバーが入力なし41,039／準備あり4,149、端末配布が14,810／4,035、下書き不可3,828。仕様85 §8との差は最大0.6074ポイント（全分類が1ポイント以内）。系列51,187、握手未実施なので公開対象0。
- 最終コードでの合成65,000件もローカルD1受入成功。65回で全件完了、66回目に差分1頁、次の毎時枠までは追加取得しない。保存バッチの時間予算中断はバックオフせず、次の合図で再開する。
- 完了した範囲はL3の実装とローカル受入。残るのはPRレビュー・依存L2のマージ、後続L4以降。本番migration・配備・切り替えは未実施。
- CIの既知の残件: SPIDER / secretsが既存mainの試験用文字列の履歴3件（`docs/design-validation/noah/noah-connect.test.mjs:85`、51df5ce・80b3810・5b7cde3）を検出する。今回の追加ファイルによる検出ではない。検査の例外化・履歴の書き換えはしていない。
