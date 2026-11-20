# 仕様書 88 — 大量の接続試験と見回り（見本まで確かめる・印を保つ・つながると確かめた数）

task: [codex/tasks/88-noah-mass-probe.md](../../codex/tasks/88-noah-mass-probe.md)。先に要る物: 86（握手）、87（道具の呼び出し）。
型契約: [noah-intake-v1.ts](../contracts/noah-intake-v1.ts) の `noahSampleCalls`・`nextNoahCheck`・`noahListing`、[noah-listing-v1.sql](../contracts/noah-listing-v1.sql)。試験: [noah-intake.test.mjs](../design-validation/noah/noah-intake.test.mjs) の「見本の入力」「見回りの間隔」「ローンチの一覧に載せる条件」、[validate-noah-v1.py](../design-validation/noah/validate-noah-v1.py) の「見回り・タイムライン」「ローンチの一覧と上限」。

**ローンチまでに作る範囲は 9 章。** 一覧は「動いた」と「まだ誰も動かしていない」の 2 段。Noah が自動で道具を呼ぶ見本（4.1）は、本人が決めるまで作らない。9 章と食い違う所は、ローンチまでは 9 章が勝つ。

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
| 1 回目の失敗の後 | 6 時間 |
| 2 回以上続けて失敗 | 上の間隔 × 2 の（失敗の回数 − 1）乗。最長 30 日 |

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
| 取り下げ | 作者か提供者から申し出があれば、その系列に `withdrawn_at` を入れる（運営の操作。`POST /api/noah/intake` の `withdraw`。系列の ID は本文で渡す）。一覧・検索・公開のページから消し、見回りを止める。台帳から消えた記録は、85 の巡回が `withdrawn` にする |
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

## 9. ローンチの範囲（[ローンチの最小限](mvp-launch.md) の L7。一覧の出し方は L3〜L6 も使う）

ローンチまでに作るのは、この章に書いた範囲だけ。Noah が自動で道具を呼ぶ見本（4.1）は、本人が決めるまで作らない。

### 9.1 入れる物・後にする物

| 章 | ローンチまで | 後 |
| --- | --- | --- |
| 1 完成の姿 | 一覧は 2 段: 「動いた」（L2）と「まだ誰も動かしていない」（L1）。握手が 2 回続けて通らない物は外れる | 「この 7 日の間に動いた物だけ」に絞る（「動いた」が十分に増えてから） |
| 3 変える所 | `lib/noah-probe.ts`（失敗の扱い）、`lib/noah-intake-store.ts`（後始末・並びの引き直し・対象から外す物）、`lib/noah-ask.ts`（「動いた」を付ける）、`components/noah-review.tsx`（数）。`lib/noah-feed.ts`・`lib/noah-public-catalog-api.ts` は触らない | `probeL2`、`noahSampleCalls` |
| 4.1 自動の L2 | 無し（`NOAH_PROBE_L2` は閉） | 本人の決定の後 |
| 4.2 本人の実行 | 入れる（9.2 に変える） | — |
| 4.3 見回り | 入れる。間隔は `nextNoahCheck`。失敗の扱いは 9.3 に変える | — |
| 4.4 定義が変わった時 | 9.4 に変える（接続を止めない） | 「1 文で頼む」を入れる時に、4.4 の作りへ |
| 4.5 礼儀 | 全部 | — |
| 5 見せる | 9.6 に変える | 公開の頁の検索向けの項目（title・description・正規の URL） |

### 9.2 本人の実行で「動いた」を付ける

87 の依頼が `succeeded` で終わった時（道具が `isError` を返した依頼は数えない）、その接続の系列の、代表の候補について:

1. 握手の表を、今の握手で見た値にする: `UPDATE noah_intake_checks SET l2_at = CASE WHEN level = 2 THEN l2_at ELSE ? END, level=2, result='ok', tools_sha256=?, tool_count=?, read_only=?, form_tools=?, one_tap_tools=?, l1_at=COALESCE(l1_at, ?), failures=0, first_failure_at=NULL WHERE candidate_id=?`。**`l2_at` は、「動いた」になった時にだけ入れる。** すでに「動いた」の物を、もう一度動かしても、時刻は進めない（「動いた」の段は `l2_at` の新しい順に並ぶ。動かすたびに進めると、自分で何度も動かして、上に居続けられる）。 `checked_at` と `next_check_at` は書き換えない（巡回が最後に握手した時刻と、巡回の予定のまま。巡回の間隔を数える問い合わせに、利用者の操作を混ぜない。[97](spec-97-launch-ops.md) の 6 章）。`l1_at` は、空の時だけ入れる。
2. 系列へ写す: [noah-listing-v1.sql](../contracts/noah-listing-v1.sql) の `touch`（`level=2`・`l2_at` は握手の表の値・`badge_hint='one_click'`・`listed` と `one_tap` は `noahListing` から）。

見本（`sample_json`）は書かない。誰の実行かも、依頼の中身も、ここには書かない。審査者の実行も同じに数える（出す前に運営が動かす 100 件は、これで「動いた」になる）。

### 9.3 握手の失敗の扱い（ローンチ版。4.3 の表を置き換える）

**この表は、L4（握手）で入れた**（`lib/noah-probe.ts` の `planNoahProbeWrite`。握手の結果を書く所と、失敗を数える所が同じなので）。L7 で足す物は無い。「つないでいる人が居れば 24 時間後」は、接続の表が入った L5 で入れた（`lib/noah-intake-probe.ts` の `NOAH_PROBE_FAMILY`。候補と系列を読む文の中で、`EXISTS(SELECT 1 FROM noah_connections …)` を見る。D1 への往復は増えない）。

| 続けて失敗した回数（応答しない） | する事 | 次に確かめる時 |
| --- | --- | --- |
| 1 回 | `failures=1`、`first_failure_at=now`。`level` はそのまま（一覧に残る） | 6 時間後 |
| 2 回（`NOAH_FAILURES_TO_UNLIST`） | `level=0`。系列へ写す（`listed=0`）。**一覧・検索から外れる。** つないでいる人の接続は、そのまま（頼んだ時に「相手のサーバーが応答しません。」が出る） | 14 日後。その後は 2 倍ずつ（最長 30 日） |
| 最初の失敗から 30 日 | 系列を隠す（`hidden_at`） | 30 日ごと |
| 握手が通った | `failures=0`、`level=1`。隠していた系列を戻す。「動いた」は、人が動かすまで戻らない | 7 日後（つないでいる人が居れば 24 時間後。居るかどうかは、その時に `SELECT 1 FROM noah_connections WHERE family_key = ? AND state = 'connected' LIMIT 1` で見る。索引 `noah_connections_family`） |

相手が「混んでいる」（429）を返した時は、失敗に数えない（`Retry-After` の後に確かめ直す）。401・402・形が合わない は、86 の 4.2 の表のとおり、その場で `level=0`。

`hidden_at` を書く所は 2 つある。ここ（握手の失敗が 30 日続いた代表の系列）と、名寄せ（候補が 1 件も無くなった系列。[noah-regroup-v1.sql](../contracts/noah-regroup-v1.sql)）。名寄せは、候補が戻った系列の `hidden_at` を NULL に戻すが、代表の `first_failure_at` がある系列は戻さない。だから、失敗で隠している間は `first_failure_at` を消さない（消すのは、握手が通った時だけ）。

### 9.4 道具の定義が変わった時（ローンチ版。4.4 を置き換える）

握手で得た道具の定義の hash（接続先の全部の道具）が前と違う時、**握手の表の hash と数を新しくするだけ**にする。`level` は変えない。つないでいる人の接続も止めない。

理由: ローンチで道具を呼ぶのは、入力欄で頼む道だけ。その道は、呼ぶたびに「本人が見た、その道具 1 つの定義」と「今の定義」が同じ事を確かめる（87 の 11.4 の 3）。確かめの記録も、道具 1 つの定義の hash と組で持つ。だから、関係の無い道具の説明が変わっただけで、全員の接続を止めて聞き直す必要が無い。

実測（2026-11-20。握手が通った接続先を、1 時間あけて 2 回握手した）: 仕様書 86 の 10.2 の表。

「1 文で頼む」を入れる時は、道具の説明の全部がモデルへ渡るので、4.4 の作り（全部の道具の hash が変わったら、聞き直すまで止める）へ戻す。

### 9.5 後始末（巡回の合図が、毎回の終わりに行う）

実行の途中で落ちた依頼と接続を、放っておかない。どれも、相手へは何も送らない。

| 対象 | 文 | 結果 |
| --- | --- | --- |
| `running` のまま `lease_until` を過ぎた依頼 | `UPDATE noah_asks SET state='unknown', finished_at=?, error='結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。', revision=revision+1 WHERE finished_at IS NULL AND state='running' AND lease_until > 0 AND lease_until < ? RETURNING id, owner_id, work_id` | Work も `unknown` にする。**取り直して呼び直さない** |
| `queued` のまま 60 秒たった依頼（応答の後の実行が始まらなかった） | 同じ形で `state='failed'`、`error='始められませんでした。もう一度頼んでください。'` | 相手へは送っていないので、`failed` |
| `planned`・`entitling`・`preparing`・`probing` のまま 30 秒たった、置き場所が `provider` の接続 | `disconnect` を当てる（`error='つなぐ途中で止まりました。もう一度試してください。'`） | 本人には「接続」がもう一度出る |

1 回の合図で、それぞれ 50 件まで。

### 9.6 見せる（ローンチ版。5 章を置き換える）

| 所 | 出す物 | 並び |
| --- | --- | --- |
| 「動いた」 | `noah-listing-v1.sql` の `ran`（L2 で、載せる条件を満たし、取り下げても隠してもいない） | `l2_at`（「動いた」になった時刻）の新しい順。使われた数での並びは、出した後（利用の記録が貯まってから） |
| 「まだ誰も動かしていない」 | `new`（L1 で、同じ条件）。`oneTap=1` で、押すだけで頼める道具がある物だけ | `shuffle` の大きい順。`shuffle` は 1 日 1 回引き直す（`reshuffle`） |
| 検索 | `search`（名前と説明の部分一致。載せている系列だけ） | L2 を先に |
| 詳細 | 載せている系列。審査者は、載せていない系列も見られる | — |

並びを `shuffle` にする理由: 握手だけの物には、良し悪しの手がかりが無い。握手した順は、台帳を読んだ順（名前の順）に寄る。台帳での更新が新しい順にすると、更新の多さ（直前の 1 時間に 109 件）で上に居続けられる。1 日 1 回引き直す並びなら、名前でも更新の多さでも上に来られず、全部の系列に、同じだけ上に出る機会がある。人が動かせば「動いた」へ移る。

載せる条件は `noahListing`（[noah-intake-v1.ts](../contracts/noah-intake-v1.ts)）。系列の行の `listed`・`one_tap` は、名寄せ（1 日 1 回）と、握手・実行の直後の `touch` が書く。

つながると確かめた数（運営の画面）: 「動いた」の数（`SELECT COUNT(*) FROM noah_intake_families WHERE level = 2 AND listed = 1 AND withdrawn_at IS NULL AND hidden_at IS NULL`）と、握手まで確かめた数（同じ文で `level = 1`）を、台帳の件数とは別の行に出す。固定 adapter の 13 件は、別の行。

### 9.7 握手の対象と、最初の 1 巡

- 巡回が握手するのは、口が「相手のサーバー」で、本人の鍵の入力が要らない候補だけ（86 の 10.3）。
- （L4 で入れた。`lib/noah-intake-sync.ts` の `regroupStatements`。期限が 1 日以内の物だけを送り、毎日は書き直さない）量産の系列（`family_id LIKE 'bulk:%'`）は、ローンチでは載せないので、握手もしない: 名寄せの直後に `UPDATE noah_intake_checks SET next_check_at = ? WHERE level = 0 AND candidate_id IN (SELECT id FROM noah_intake_candidates WHERE family_id LIKE 'bulk:%')` で 30 日後へ送る（9,070 件。標本では 24 host のうち 5 host しか応答しない）。
- 最初の 1 巡は、量産でない約 31,400 件。同じ接続先へは 1 時間に 1 回までなので、1 つの接続先に候補が多い物（最大は 428 件）は、1 巡に日数が掛かる。それ以外は、1 回の合図で 16 件なら約 1.5 日、8 件なら約 3 日。
- 1 巡の後は、7 日ごとの確かめ直しで、1 日に約 5,000 件（1 回の合図で 8 件あれば足りる）。

### 9.8 取り下げと戻し

4.5 の「取り下げ」のとおり。入口は 85 の 11.5 の `POST /api/noah/intake`（`withdraw`・`restore`。審査者だけ）。取り下げた系列は、一覧・検索・詳細から消え、巡回が握手しない（`next_check_at` を 30 日後へ送り、巡回が取る時に `withdrawn_at IS NULL` を確かめる）。つないでいる人の接続は、次に使おうとした時に `blocked` になる（74 の 11.3）。戻すと、次の握手から元に戻る。

### 9.9 試験（6 章に足す。`tests/noah-patrol.test.mjs`）

| 試験 | 前提 | 期待 |
| --- | --- | --- |
| 見回りの間隔（移す） | — | 1 回目の失敗は 6 時間後。2 回目からは 2 倍ずつ |
| 一覧の条件（移す） | [fixtures/listing-cases.json](../design-validation/noah/fixtures/listing-cases.json) の 24 行 | 純関数と SQL が同じ結果 |
| 動いたを付ける | L1 の系列で、依頼が成功 | 握手の表が `level=2`。系列が、名寄せを待たずに「動いた」の先頭に出る。本人の ID がどこにも書かれない |
| 動かし直しても上がらない | 「動いた」の系列で、もう一度成功 | `l2_at` が変わらない。「動いた」の中の順が変わらない |
| 相手のエラーは数えない | 道具が `isError` | `level` は 1 のまま |
| 1 回の失敗 | 握手が 1 回応答しない | 一覧に残る。次は 6 時間後 |
| 2 回続けて失敗 | — | 一覧と検索から消える。握手が通ると「まだ誰も動かしていない」に戻る |
| 混んでいる | 429 と `Retry-After: 120` | 失敗に数えない。120 秒は、その接続先へ送らない |
| 定義が変わった | 握手の hash が変わる | `level` が変わらない。接続が `connected` のまま |
| 量産 | 同じ名前空間・同じ host の候補 20 件 | 握手しない |
| 並びの引き直し | 同じ UTC の日に合図を 3 回／日付が変わって 1 回 | 引き直しは 1 回ずつ |
| 後始末 | `running` で lease 切れ／`queued` で 60 秒／`probing` で 30 秒 | `unknown`／`failed`／切れている。相手への要求は 0 回 |
| host の間隔 | 同じ host の候補が 5 件 | 1 時間に握手するのは 1 件 |
| 取り下げ | `withdraw` | 一覧・検索・詳細・握手から外れる。行は残る。`restore` で戻る |

### 9.10 完了の定義（L7）

- `node --experimental-strip-types --test tests/noah-patrol.test.mjs tests/noah-intake-store.test.mjs` が通る。`python3 docs/design-validation/noah/validate-noah-v1.py` が 10/10。
- 手元で合図を回し、握手が通った 50 件のうち、相手を止めた 1 件が、2 回の握手の後に一覧から消える。
- 同じ接続先への握手が、1 時間に 1 回を越えない事を、`noah_probe_hosts` の記録で確かめる。
- `probeL2` と `noahSampleCalls` を作っていない。
