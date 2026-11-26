# 125 Noah が自分で探す: X を毎日読んで理解する・急に伸びた repo・Product Hunt（Switch を拾えなかった事の直し）

本人の言葉（2026-11-22 19:36）: Switch（SandboxAQ の [sandbox-quantum/switch](https://github.com/sandbox-quantum/switch)・[11 月の発表](https://www.switchagents.ai/blog-posts/whats-new-in-switch-rooms-november-2026)）のスクリーンショットを付けて「これいれて」「なんかこういう便利機能をさ私がツイッターで検索するんじゃなくて Noah にやらせたいのよ、そのためのエージェントもつくって、というか Noah に標準搭載の機能にするようにさっき指示したよね」「でそれを繋げるのが Eve ね」「最初は Noah は単発機能じゃなくてパッケージにしてもいいのかも」。

同日の回答: X は「ブラウザつかって読んで、ちゃんと読んだもの正しく理解して」「Codex の Luna Max に読ませて」「1 日 1 回」。X のアカウントは「Noah 用に新しく作る」。まとめ役は「Claude が最初の 20 人を選ぶ」。Switch は「Noah の新着に載せる」「Claude と Codex の連携に使う（Telegram）」「パッケージの手本にする」。GitHub は「今後 iceiceice の方で全部あげてね」。パッケージは task 126。

## 1. なぜ Switch を拾えなかったか（2026-11-22 20 時台に確かめた事）

| 場所 | 状態 | 理由 |
| --- | --- | --- |
| X | 本番の X の列は 0 件（`/api/noah/collection?source=x`） | 公式 API の鍵は無い。Codex の読み取りは 1 回だけで、X の紹介は 1 日で期限が切れる |
| GitHub | Switch は載っていない | 読んでいたのは「作られて 14 日以内の MCP の repo」だけ。Switch は前からある repo（スター約 4.7k）で、11-18 の Switch Buddy の発表で伸びた |
| Product Hunt | 読んでいなかった | Switch は Product Hunt で「その日の 1 位」 |

## 2. Claude がやった事（この task の PR）

- `scripts/noah-collector-feeds.mjs`:
  - GitHub の話題に ai-agents・multi-agent・agent-orchestration・claude-code・codex を足した。
  - 作られたのが前でも急に伸びた repo を、`github-rising` として拾う。急に伸びた、とは 1 日に 50 以上、かつ全体の 2% 以上スターが増えた事。
  - Product Hunt の公開フィードから、Agent・AI の道具だけを拾う。作った人の名前は載せない。
- `scripts/noah-collector-social.mjs`: X の紹介に、Luna Max が配布元まで読んで日本語で書いた理解（`understanding`）を付けられるようにした。理解は「Noahが読んだ」（`noah-read`）という出所で載り、カードの説明の先頭に出る。
- `lib/noah-collection.ts`: 本番の受け口に `producthunt` と `noah-read` を足した。
- `scripts/noah-collector-publish.mjs`: 本番がまだ知らない新しい出所の 400 は `not_ready` にする。配備より先に収集機が動いても、失敗にしない。
- `data/noah-scout-curators.json`: まとめ役 20 人と、選んだ根拠。
- 試験: `tests/noah-scout.test.mjs`（6 本）。

## 3. Codex がやる事（この順で）

### 3.1 配備

- この PR の `lib/noah-collection.ts` を Sites に出す（受け口に `producthunt`・`noah-read`）。
- 合格: `GET https://avoado.si/api/noah/collection?source=producthunt` と `?source=noah-read` が 200。収集機の次の回の `publish` に、`producthunt` が `not_ready` でなく件数で出る。

### 3.2 Noah 用の X アカウント

- 新しく作る。名前は「Noah」、自己紹介は「Noah（avoado.si/noah）の運営が、AI の道具を探すために読むアカウントです」。
- Codex がブラウザで入力欄の手前まで進める。メール・電話番号・パスワード・確認コード・生年月日は、ノエルが自分で入れる。Codex は入れない・見ない・保存しない。
- 非公開のリスト「Noah scouts」を作り、`data/noah-scout-curators.json` の 20 人を入れる。フォローはしない。
- 投稿・いいね・リポスト・フォロー・DM はしない。

### 3.3 毎日 1 回読む（Codex のスケジュール。モデルは Luna Max）

1. リスト「Noah scouts」を、前回読んだ所まで遡る。上限は 200 件、30 分。人の速さで読み、画面を送る間は数秒あける。
2. 道具の紹介だけを選ぶ。対象は、新しい repo・アプリ・MCP・Claude Code や Codex の拡張・Agent の基盤（Switch のような物）。
3. 選んだ物は「正しく理解」する。次の順で読む。
   - 紹介の投稿を読む。
   - 引用元の投稿を読む（例: Claude_Digest の投稿 → switch_ai_ の投稿）。
   - 配布元を読む（GitHub の README・公式の頁・使用許諾の LICENSE）。
   - 書くのは、読んで確かめた事だけ。何をする物か・誰向けか・どう動かすか（ブラウザ・Mac・サーバー・鍵が要るか）・費用・使用許諾の注意（例: Commons Clause、非商用）。
   - 分からない事は書かない。投稿の文は写さない。日本語で 500 字まで。
4. `data/noah-scout/leads.json` に紹介を足す。
   - `project`: 配布元の正規の URL
   - `foundAt`: Noah が紹介を見つけた日時
   - `understanding`: `name`・`summary`・`maker`・`page`・`run`（`space`・`key`・`mac` のどれか）
   - 投稿があるときは `source`（X は `x`）、投稿 URL の `post`、投稿日時の `postedAt`、画面に出ている `likes`・`reposts` の `metrics` も足す。
5. 載せる（2026-11-23 に変えた）。読んだ紹介を `data/noah-scout/leads.json` に足す PR を出して main に入れる。クラウドの収集機が、次の回にまとめて「Noahが読んだ」と X の列へ載せる。
   - 形は `scripts/noah-collector-social.mjs` の `scoutFileItems`。1 件は `project`・`foundAt`・`understanding`（要る）と、投稿があれば `source`・`post`・`postedAt`・`metrics`。
   - 運営の Mac に掲載の鍵（`NOAH_COLLECTION_KEY`）を置かなくてよい。runtime.env の件は不要になった。
   - `scripts/noah-collector-social.mjs --publish` で直接載せると、収集機の掲載と同じ出所を上書きし合うので使わない。
   - 試験 `tests/noah-scout.test.mjs` が、ファイルの全件の形を確かめる。
6. 止める条件: X が確認（画像の問題・電話の確認・「自動の操作の疑い」）を出したら、そこで止めてノエルに知らせる。確認は解かない。ログインを繰り返さない。
7. 記録: 読んだ件数・載せた件数・落とした理由を `work/noah-scout/YYYY-MM-DD.json` に残す（Git に入れない）。週に 1 行、この task の末尾に書く。

### 3.4 まとめ役を足す・外す（Noah が候補に足す）

- 30 日の間に、紹介したリンクが 3 回以上載った人を足す。引用元の人も数える。足した人はリストに入れ、`data/noah-scout-curators.json` に根拠付きで追記する PR を出す。
- 30 日で 1 件も載らなかった人は、外す候補としてノエルに見せる（外すのはノエルの答えの後）。

### 3.5 最初の 1 件は Switch（2026-11-23: Claude が読んで `data/noah-scout/leads.json` に入れた）

- 3.3 の形で、Switch を最初に載せる。読む順は Claude_Digest の投稿 → switch_ai_ の投稿 → github.com/sandbox-quantum/switch → LICENSE。
- 理解に必ず入れる事: Mac のアプリと自前のサーバーで動き、スマホからは動かない事。使用許諾が Apache 2.0 + Commons Clause で、Switch を動かす事自体を有料で売れない事（`run`: `mac`）。
- Codex の別のスレッド「SwitchのURLと記事を追加」と重ねない。先にそちらの結果を読む。

### 3.6 正本の移行

- この PR（k999ln/rock #421）は、この会話の仕組みの都合で k999ln/rock に出した。iceiceice999/rock へ移す。
- 正本が分かれた後に k999ln/rock に入った #415 までは、Codex が iceiceice999/rock へ統合済み（iceiceice999 #6・k999ln #420）。残りはこの PR だけ。
- 収集機の Actions の鍵（`NOAH_COLLECTION_KEY`・`SMITHERY_API_KEY`・`NOAH_R2_*`）は、今は k999ln にある。iceiceice999 で動かす時は、ノエルが Actions の secret に入れる。移し終えるまで、k999ln の Actions は止めない（2 つが同時に掲載すると、新しい方が上書きする。どちらか 1 つにしてから切り替える）。

### 3.7 収集機が止まっている（2026-11-22 21:40 JST に分かった事）

- 本番の紹介は、2026-11-22 07:30Z（16:30 JST）から更新されていない（`/api/noah/collection` の各出所の `observedAt`）。
- 5 分ごとの予定（cron `3-58/5 * * * *`）は、この日 2 回しか動いていない（00:41Z・07:30Z）。GitHub の予定は、短い間隔だと大きく遅れたり飛ばされたりする。
- 2 回とも掲載はできたが、discovery の `github` が `unavailable` で終了コード 1 になり、失敗の扱いになっている。
- Codex の手動の実行（2 時間ごと）は、枝 `codex/noah-social-collection` から起動している。job の条件 `github.ref == 'refs/heads/main'` で飛ばされ、何もしていない（結果は success に見える）。
- 直す事:
  1. 手動で起動する時は main から起動する（`gh workflow run noah-agent-collection.yml --ref main`）。
  2. 正本を iceiceice999/rock に移す時は、job の条件の repository を `iceiceice999/rock` にし、secret を入れる（3.6）。
  3. GitHub の予定は当てにしない。予備として、Codex のスケジュールで 1 時間ごとに、main から手動の実行を起動する。
- 合格: 本番の hackernews の列の `observedAt` が、2 時間より古くならない状態が 24 時間続く。

#### 2026-11-22 復旧の記録

- [正本 PR #13](https://github.com/iceiceice999/rock/pull/13) と [正本 PR #15](https://github.com/iceiceice999/rock/pull/15) で移植を完了。
- 旧 `k999ln/rock` の `main` を手動で起動し、[Actions 45032700818](https://github.com/k999ln/rock/actions/runs/45032700818) の収集ジョブが成功。[本番の Hacker News](https://avoado.si/api/noah/collection?source=hackernews&order=new) は78件から84件へ進み、取得した20件の `observedAt` が16:30:40から23:25:37 JSTに更新された。
- Codex の毎時の予備実行 `noah-2` を有効化。鮮度2時間以内の連続24時間は観測中。
- GitHub の正本には収集用シークレットが未登録。旧 `main` を本番の掲載元として維持し、正本側は設定と明示的な有効化を待つ。切り替え手順は [収集機の運用](../../docs/services/noah-agent-collection.md#クラウド常時運用2026-11-22-本人追加指示)。

#### 2026-11-23 チェックポイントのタイムアウト

- 旧 `main` の収集で、チャンク保存完了後のマニフェスト確定が60秒でタイムアウトし、公開 Hacker News の鮮度が2時間を超えた。チャンクの存在確認を R2 メタデータの読み取りに変え、古い断片の掃除を確定応答後に移す。掲載再開と24時間観測の実測は [修正 PR #26](https://github.com/iceiceice999/rock/pull/26) に記録する。

#### 2026-11-26 実行結果と実掲載の計測

- 旧収集元の run #102 / #103 は、取り込み HTTP 400 と Hugging Face の一時失敗で実行全体は failure。ただし両方とも `feeds.hackernews=updated` で、`published` は Hacker News 161件、公開 API の `observedAt` も前進した。実行全体の結論だけで未掲載と判定しない。
- 収集結果に `outcomes.execution` / `outcomes.publication` を別々残し、掲載後の公開 Hacker News API を再読した `freshness` も残す。最新の実掲載から2時間以上なら、実行の色にかかわらず鮮度の異常とする。
- 2026-11-27 00:01 JST の公開 API は166件、最新 `observedAt` は2026-11-26 20:29 JSTで、約3.52時間の超過。旧 `k999ln/rock` の掲載workflowがactiveのまま、正本 `iceiceice999/rock` は有効化を確認できていない。二重掲載を避けて旧側停止→新側有効化→公開時刻の前進→24時間計測の順で切り替える。

#### 2026-11-23 Switchの公式版とEveへの引き継ぎ

- Switch Console 0.41.1をApple Silicon Macにインストールし、ローカルのSwitch BuddyをCodexで起動した。
- 定期収集に公式リリースの取得を加え、スター増加の記録がまだなくても、新機能を持つ版を拾えるようにした。最初の取得先は [Switch Console 0.41.1](https://github.com/sandbox-quantum/switch/releases/tag/switch-console-v0.41.1)。[公式発表](https://www.switchagents.ai/blog-posts/whats-new-in-switch-rooms-november-2026) と配布元を照合した。
- Noahの候補詳細からEveに出典を渡せる。実行する工程の組立とホームの掲載は [task 126](126-noah-packages-first.md) の合格条件を使う。

## 4. 合格条件

- 本番の X の列と「Noahが読んだ」の列に、7 日続けて、毎日新しい紹介が入る。
- Switch のカードが新着に出る。説明は日本語の理解で、出所に X・GitHub・Noahが読んだ が並ぶ。
- 本番の GitHub の列に、収集機の 2 回目以降、`github-rising:` の紹介が出る（伸びている物がある日）。
- 本番の Product Hunt の列に、Agent・AI の道具だけが出る。
- 試験: `node --experimental-strip-types --test tests/noah-scout.test.mjs tests/noah-collection-sources.test.mjs`、`npm run typecheck`、`npm run lint:product`。

## 5. やらない事

- X の公式 API は使わない（本人の回答「ブラウザつかって読んで」）。ログインしたままの自動の大量読み取り・複数のアカウント・確認の回避はしない。
- 投稿の本文・投稿者の名前（@handle 以外）は載せない。
- Switch を Noah のクラウドで動かして有料で出す事はしない（Commons Clause）。Switch のコードも Noah に入れない。手本にするのは考え方だけ（task 126）。
