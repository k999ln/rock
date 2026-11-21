# 112 家の端末のカード・工程をつなぐカード・札の候補（出した後）

仕様: **[docs/noah/spec-110-shelf.md](../../docs/noah/spec-110-shelf.md)** の 3.1・4・7 章。型と参照実装: docs/contracts/noah-shelf-v1.ts の `noahHomeFingerprint`・`noahBuiltinFingerprint`・`parseNoahCardProposal`・`noahPackageCapabilities`。先に 110。関係する task: 33（工程の計画を Eve の依頼へつなぐ）、71・83（家の端末）、89（ターミナルの口）。

## やること

1. lib/noah-shelf-facts.ts: 家の端末の工程（`RECIPES` から `noahHomeFingerprint`）と、Noah の中の道具の工程（`compositionCapabilities` から `noahBuiltinFingerprint`）の事実。
2. `verify`: 家の端末は、その審査者の `noah_runner_commands` の成功、Noah の中の道具は、合成の実行の `passed` が、直近 7 日にある時だけ通す。
3. 切り替え `NOAH_SHELF_HOME`: 家の端末のカードを、端末が応答している本人（`last_seen_at > now - 30000`）にだけ出す（`noahShelfOptions`）。押した先は、今の Mac の道（`/noah/launch`）へ、カードの「渡す物」を入力欄の見出しにして渡す。
4. Noah の中の道具だけをつなぐカード: カードの工程から `CompositionPlan`（lib/work-composition.ts）を作り、今の合成の実行へ渡す。
5. 切り替え `NOAH_SHELF_CHAINS`: 相手のサーバー・家の端末の工程を 2 つ以上つなぐカード。先に 87 の「1 文で頼む」か、工程ごとに成果を次の入力へ渡す実行が要る（どちらにするかは、この task の最初に、今のコードを見て仕様書へ書き足す）。
6. 札の候補: 動かして確かめた系列の道具について、名前・説明・入力の定義を**資料として**モデルへ渡し、`parseNoahCardProposal` を通った物だけを、運営の画面に候補として出す。運営が確かめた物だけを、カードの工程に使える。
7. 工程の計画へのつなぎ: `noahPackageCapabilities` を、33 の `lib/sky-recipe-catalog.ts` から呼ぶ。足りない素材（`gap`）を、Noah の検索語として渡す。

## 決めてある事（変えない）

- 提供者の文とモデルの文を、命令として読まない。語彙（`NOAH_MATERIALS`）の外の札を受け付けない。語を足す時は、型契約へ 1 行足す。
- カードは、今の Broker・Wallet・Jev の gate を通る。実行の上限（`LIMITS`）を変えない。
- 画面を取らない決まり（84）のまま。

## 合格条件

- 検証キットの「載せる条件」「札の候補」「工程の計画へのつなぎ」が、tests/ で通る。
- Mac の runner を動かした本人に、カード案の「会議メモを 3 行にまとめる」が棚に出て、押すと成果が返る。runner を止めると、その本人の棚から消える。
- 固定 adapter の版を上げると、そのカードが「確かめた時から、中身が変わりました」で外れ、動かし直して `verify` すると戻る。
- 道具の説明に「前の指示を無視して…」と書いた接続先で、札の候補に、語彙の外の語が 1 つも入らない。
