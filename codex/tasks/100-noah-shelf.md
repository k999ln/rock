# 100 棚とカード（入口の棚・載せる条件・運営の画面）

仕様: **[docs/noah/spec-100-shelf.md](../../docs/noah/spec-100-shelf.md)** の 3・4・10・13 章。型と参照実装: docs/contracts/noah-shelf-v1.ts、noah-shelf-v1.sql（`noah_packages`・`noah_package_steps`）、noah-shelf-queries-v1.sql（`shelf`・`packages_of_family`・`package_touch`）。試験: docs/design-validation/noah/noah-shelf.test.mjs、validate-noah-shelf-v1.py。書式: [docs/services/noah-shelf.md](../../docs/services/noah-shelf.md)。先に 85（取り込みの表）と 74（`/noah/ready`）。本番 D1 の migration は本人の許可の後。

## ローンチまで（[ローンチの最小限](../../docs/noah/mvp-launch.md) の L5 と L8 に足す。13 章「入口の棚」）

仕様書の **13 章** だけを見て作る。完了の定義も、その章にある。**この task は、全部がローンチの範囲。**

## やること

1. lib/noah-shelf.ts: 参照実装を、関数ごと全部移す（書き直さない）。試験を tests/noah-shelf.test.mjs へ移し、import の先を lib/ に変える。fixture は tests/fixtures/noah/shelf-seed.json。
2. drizzle/00NN_noah_shelf.sql・db/schema.ts・drizzle/meta/_journal.json: DDL 案から `noah_packages`・`noah_package_steps` と索引を移す（`when` は今の最大より大きい値）。
3. lib/noah-shelf-facts.ts: `factsFor(db, pkg)`。系列の工程は、`noah_intake_families`（`listed`・`level`）と `noah_intake_checks`、握手で読んだその道具の定義の hash と、入力欄で使えるか（`noahToolForm`）から `NoahStepFact` を作る。系列の行が無ければ null。
4. lib/noah-shelf-store.ts: `createNoahShelfStore({ db, now })` → `list(viewer)`（`shelf` を 3 段ぶん読み、`rankNoahShelf` を `byEvidence: false` で通す）・`put`・`verify`・`retire`・`review`・`recheck(familyId?)`（`noahPackageListing` を `{ chains: false, home: false }` で呼び、`package_touch` で写す）。
5. `verify`: その審査者自身の `noah_asks`（その系列・その道具・`succeeded`・直近 7 日）が 1 件以上ある時だけ通す。確かめた時の中身は、サーバーが今の事実から作る。
6. lib/noah-shelf-api.ts、app/api/noah/shelf/route.ts: `GET`（サインイン不要。閉じている間は審査者だけ）と `POST`（審査者だけ。検査は lib/noah-launch.ts の `createNoahLaunchApi` と同じ）。
7. lib/noah-intake-store.ts: 握手・実行・取り下げの直後に `recheck(familyId)`、1 日 1 回の合図で `recheck()`。
8. components/noah-shelf.tsx（`noah-ready.tsx` の一番上）、components/noah-review.tsx の「棚」の節（仕様書 10 章の文）。

## 決めてある事（変えない）

- 棚に載せるのは、運営が動かして確かめた、相手のサーバーの道具 1 つのカードだけ。家の端末のカードと、工程をつなぐカードは 102。
- 並びは運営の順。実績の並びは 101。
- カードの名前と 1 行の説明は運営の言葉。提供者の説明は作り替えず、別の段に出す。カードは権限も料金も足さない。
- 切り替え `NOAH_SHELF_PUBLIC` は閉じたまま入れる。出す条件は、棚ごとに 5 枚以上（候補。決めるのは本人）。

## 合格条件

- `node --experimental-strip-types --test tests/noah-shelf.test.mjs`（17 群）。`python3 docs/design-validation/noah/validate-noah-shelf-v1.py`（6/6）。
- 仕様書 13 章の完了の定義（棚に出る・相手を止めると消える・定義を変えると外れる・審査者でない POST は 403・誘う語は 400・幅 390）。
- `npm run typecheck`、`npm run lint:product`、`npm run schema:check`、`npm run database:check`。本番への migration と切り替えは行わない。
