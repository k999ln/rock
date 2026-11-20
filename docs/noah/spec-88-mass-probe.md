# 仕様書 88 — 大量の接続試験と見回り（見本まで確かめる・印を保つ・つながると確かめた数）

task: [codex/tasks/88-noah-mass-probe.md](../../codex/tasks/88-noah-mass-probe.md)。先に要る物: 86（握手）、87（道具の呼び出し）。
型契約: [noah-intake-v1.ts](../contracts/noah-intake-v1.ts) の `noahSampleCalls`・`nextNoahCheck`。試験: [noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs) の「見本の入力」「見回りの間隔」、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py) の「見回り・タイムライン」。

## 1. 完成の姿

- タイムラインに流れるのは、**見本の 1 往復が、この 7 日の間に通った Agent だけ。** 止まった物は、次の見回りで印が外れて消える。戻れば戻る。
- 運営の画面に「つながると確かめた数」が、口ごとに出る。台帳の行数（6 万）とは別の数として並べる。
- 見回りが、相手の迷惑にならない。

## 2. この仕様で決めた事

| 決めた事 | 理由（握手の標本 500 host） |
| --- | --- |
| 自動で道具を呼ぶのは、**全部の道具が読み取りだけと宣言され、必須の入力が定義から埋まる道具がある接続先だけ** | 標本で、全部が読み取りだけの接続先は 122（応答した 273 の 44.7%）。そのうち、必須の入力が無い道具を持つ物が 99。標本全体の 19.8% |
| 入力の文字列を、Noah が勝手に作らない（`const`・`default`・`examples`・`enum` からだけ埋める） | 「テスト」のような作った値は、相手に意味の無い検索や記録を残す |
| 見本は、候補を上から最大 3 つ試し、最初に成功した物を採る | 実測の写し（mizan.ac）では、必須の入力が無い道具が 3 つあり、名前の順で最初の `list_my_communities` は本人の情報を求める物かもしれない |
| それ以外の接続先（約 8 割）は、**最初に使った本人の実行の成否**を L2 として数える | 自動では確かめられない。本文は残さず、成否と秒数だけ |
| 道具の定義が変わったら、つないでいる本人へ聞き直し、確かめるまで実行を止める | 承認した後に、説明や動きを差し替える攻撃を止める |

この割合から、鍵の宣言が無い 31,144 host のうち、自動で見本まで確かめられるのは約 6,200（標本の幅で 5,100〜7,300）。「つながると確かめた数」の最初の目標は 100、その先の天井がこの数。

## 3. 今あるコードと、変える所

| ファイル | 今（86 までで） | 変える事 |
| --- | --- | --- |
| `lib/noah-probe.ts` | `probeL1` | `probeL2(candidate, handshake)` を足す。`noahSampleCalls`・`nextNoahCheck` を型契約から移す |
| `lib/noah-intake-store.ts` | `sync()` が、出どころの巡回と握手を行う | 握手が通った候補に、条件が合えば L2 を続けて行う。失敗の数え方と、隠す処理（4.3） |
| `lib/noah-ask.ts`（87） | 依頼の完了で利用の記録を書く | 完了の時に、その系列の checks を L2 にする（4.2） |
| `lib/noah-connect.ts`（74） | — | 「内容が変わった」の聞き直し（4.4） |
| `lib/noah-feed.ts`、`lib/noah-public-catalog-api.ts` | 公開版と発見の候補を返す | 取り込んだ系列を足す（5 章）。flag `NOAH_INTAKE_PUBLIC` が開いている時だけ |
| `components/noah-review.tsx` | 「取り込み」の節（85） | 「つながると確かめた数」の行を足す |
| `app/noah/help` | 使い方 | 見回りの説明と、取り下げの申し出の窓口（`#bot`） |

## 4. 規則

### 4.1 自動の L2（flag `NOAH_PROBE_L2` が開いている時だけ。既定は閉）

握手（L1）が通った直後に、同じセッションで行う。条件を全部満たす時だけ。

| # | 条件 |
| --- | --- |
| 1 | `auth='none'`（鍵も許可も無しで握手が通った） |
| 2 | 全部の道具が `readOnly`（`annotations.readOnlyHint === true`） |
| 3 | `noahSampleCalls(tools)` が 1 つ以上を返す |
| 4 | その host への今回の接続が、まだ 1 回目（握手と同じ接続の続き） |

手順: 候補を上から順に呼ぶ（最大 3 つ、1 つ 25 秒まで）。最初に `ok` が返った物で止める。`sample_json = { "tool", "input", "output": <成果の先頭 500 文字>, "ms" }`、`level=2`、`l2_at=now`。3 つとも失敗なら `level=1` のまま（失敗には数えない）。成果の先頭に秘密値らしい値（`looksLikeNoahSecret`）があれば、見本を保存しない。

候補の順（`noahSampleCalls`）: 必須の入力が少ない → 入力の項目が少ない → 名前の順。入力は、必須の項目だけを、`const` → `default` → `examples` の先頭 → `enum` の先頭 で埋める。埋まらない項目が 1 つでもある道具は候補にしない。

### 4.2 本人の実行で付ける L2

87 の依頼が `succeeded` で終わった時: その接続の系列の代表の候補について、`UPDATE noah_intake_checks SET level=2, l2_at=?, failures=0, first_failure_at=NULL WHERE candidate_id=? AND tools_sha256=?`（道具の定義が、その本人がつないだ時と同じ時だけ）。見本は書かない。誰の実行かも書かない。

### 4.3 見回り

次に確かめる時刻（`nextNoahCheck`。数値は候補）:

| 系列の状態 | 間隔 |
| --- | --- |
| つないでいる本人がいる（`noah_intake_families.connections > 0`） | 24 時間 |
| L2 だが、つないでいる本人はいない | 3 日 |
| L1 以下 | 7 日 |
| 失敗が続いている | 上の間隔 × 2 の（失敗の回数）乗。最長 30 日 |

失敗（`unreachable`）の扱い:

| 続けて失敗した回数 | する事 |
| --- | --- |
| 1 回 | 何も変えない（`failures=1`、`first_failure_at=now`） |
| 2 回 | `level` を 1 に下げる（タイムラインから消える）。つないでいる本人の接続は、そのまま（頼んだ時に失敗が分かる） |
| 最初の失敗から 30 日 | 系列の代表なら、系列を隠す（`hidden_at`）。検索にも出さない |
| 握手が通った | `failures=0`。隠していた系列を戻す。L2 は、付け直すまで 1 のまま |

### 4.4 道具の定義が変わった時

握手で得た `tools_sha256` が、前の値と違う時:

1. checks を新しい hash にし、`level=1`、`sample_json=NULL` に戻す（見本まで確かめ直す）。
2. その系列につないでいる接続（`noah_connections` の `state='connected'` で、`tools_sha256` が古い値の物）を、`tools_changed` で `needs_action` にする。`needs_json = { "kind": "consent", "label": "内容が変わりました。もう一度確かめてください。" }`。
3. 本人がシートで「確かめて続ける」を押すと、今の握手の hash を保存し、`confirmed_tools_json` を空に戻し（書き込みの道具は、もう一度確かめる）、`connected` に戻す。
4. 確かめるまで、その接続の新しい依頼は 409「内容が変わりました。もう一度確かめてください。」。

### 4.5 礼儀

| 決まり | 値 |
| --- | --- |
| 名乗り | `user-agent: NoahBot/1 (+https://<origin>/noah/help#bot)` |
| 同じ host へ | 1 時間に 1 回まで（`noah_probe_hosts`）。握手・一覧・見本・閉じる を 1 回の接続として数える |
| 同時 | 1 回の呼び出しで 8 件まで。巡回は 60 秒ごと |
| 429 | `Retry-After` を守る（無ければ 60 秒。最長 1 日）。その host の `not_before` に入れる |
| 寝ている Space・止まっている Space | 接続しない。出どころの一覧が「動いている」と言う物だけ |
| 自動で呼ぶ道具 | 4.1 の条件の物だけ。1 回の見回りで最大 3 回 |
| 取り下げ | 作者か提供者から申し出があれば、その系列に `withdrawn_at` を入れる（運営の操作。`POST /api/noah/intake/[id]` の `withdraw`）。一覧・検索・公開のページから消し、見回りを止める。台帳から消えた記録は、85 の巡回が `withdrawn` にする |
| 書かない物 | 道具の定義の本文、依頼、成果（見本の先頭 500 文字を除く）、相手の応答の header |

## 5. 見せる

| 所 | 出す条件 | 印 |
| --- | --- | --- |
| タイムライン | 系列の `level=2`、`l2_at` が 7 日以内、取り下げても隠してもいない。`blocked` でない | 96 の計画のとおり |
| 検索・一覧 | `level>=1`。または、台帳にあるだけの物（`level=0`）も、語が一致すれば出す | L2 でなければ「まだ誰も動かしていない」 |
| 公開のページ（サインインなし） | 上と同じ。1 系列に 1 頁（今の `components/noah-public-detail.tsx` を使う） | 名前、1 行説明、見本、印、動く所、料金、最後に確かめた日。`<title>`・`<meta name="description">`・正規の URL を付ける |

タイムラインの問い合わせ: `SELECT id FROM noah_intake_families WHERE level = 2 AND withdrawn_at IS NULL AND hidden_at IS NULL AND l2_at >= ? ORDER BY l2_at DESC, id LIMIT 21`（21 件目があれば次の頁。索引 `noah_intake_families_timeline` を使う事は、検証キットが確かめている）。量産の系列（`bulk:…`）は、カードの名前を「<提供者> の道具 <members> 個」にする。

つながると確かめた数: `SELECT k.mouth, COUNT(DISTINCT c.family_id) FROM noah_intake_candidates c JOIN noah_intake_checks k ON k.candidate_id = c.id WHERE c.state = 'active' AND k.level = 2 AND k.l2_at >= ? GROUP BY k.mouth`（`?` は 7 日前）。固定 adapter の 13 件は、別の行として足す（合計の見出しは「つながると確かめた数」1 つ）。

## 6. 試験

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 見本の入力（移す） | 実測の写しの道具 5 個 | 必須の入力が無い 3 つを、決めた順で。文字列が必須の 2 つは選ばない |
| 同上 | 書き込みの道具を 1 つ足す | 候補は空（自動で呼ばない） |
| 同上 | `enum`・`default` で埋まる必須の入力 | その値で埋める。埋まらなければ候補にしない |
| 見回りの間隔（移す） | 24 時間・3 日・7 日、失敗で 2 倍、最長 30 日、30 日で隠す | 表のとおり |
| 取り合いとタイムライン（移す） | — | DDL の検証で通過 |
| 自動の L2（足す）`tests/noah-probe-l2.test.mjs` | 全部が読み取りだけの試験用の接続先 | `level=2`、見本が保存される。道具の呼び出しは 1 回 |
| 同上 | 1 つ目と 2 つ目の道具がエラーを返す | 3 つ目で成功。呼び出しは 3 回で止まる |
| 同上 | flag が閉 | 握手だけ。道具を呼ばない |
| 本人の実行（足す） | L1 の系列で、87 の依頼が成功 | `level=2`。見本は無い。本人の ID がどこにも書かれない |
| 止まった接続先（足す） | 2 回続けて応答しない | `level=1`。タイムラインの問い合わせから消える。握手が通ると `failures=0` |
| 内容が変わった（足す） | 握手の hash が変わる | 接続が `needs_action`。新しい依頼は 409。確かめた後、`connected` に戻り、書き込みの道具は聞き直される |
| host の間隔（足す） | 同じ host の候補が 5 件 | 1 時間に握手するのは 1 件。残りは 1 時間後へ回る |
| 取り下げ（足す） | `withdraw` | 一覧・検索・公開のページ・見回りから外れる。行は残る |

## 7. 決めていない事

- flag `NOAH_PROBE_L2` を開けること（外の接続先の道具を、Noah が自動で呼ぶ事になる。本人が決める）。閉じている間、L2 は本人の実行だけで増える。
- flag `NOAH_INTAKE_PUBLIC` を開けること（取り込んだ道具を、Agent のカードとして並べるか）。
- 見回りを Cloudflare の cron へ移す時機。今は手元の巡回（60 秒に 8 件）。3 万 host を 1 巡するのに約 3 日。
- 並び順に、接続の手数と見回りの結果を使うこと（flag `NOAH_RANK_BY_CONNECT`）。

## 8. 完了の定義

- `node --experimental-strip-types --test tests/noah-probe-l2.test.mjs tests/noah-intake-store.test.mjs` が通る。
- 手元で flag を開け、鍵なしで握手が通った 50 件を回して、L2 が付いた数と、付かなかった理由（書き込みの道具がある／必須の入力が埋まらない／3 つとも失敗）を PR 本文に書く。標本の割合（握手が通った物の 36%）から大きく外れたら、原因を書く。
- 同じ host への握手が、1 時間に 1 回を越えない事を、`noah_probe_hosts` の記録で確かめる。
- `npm run typecheck`、`npm run lint:product`。
