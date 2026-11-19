# Noah — 専用の端末（雲・家・手元）

提案を含む。Cloudflare の有料契約、月の上限額、モデルの出どころ、無料枠の回数は本人の許可が要る。許可の前は、ローカルの Workers 試験と合成の負荷までにする。

- 本人が言う一言: 「みんながこの noah を使って agent を当たり前に自分の専用の端末に繋げて利用できるようにしたい」「pc の前じゃダメ」（11-20）「携帯は『リモコン感覚』。メインの動きは違うハードウェアで済ます」（10-10）
- Goal（Eveが作る）: 目的＝Agent を、本人専用の、画面の無い端末で動かす。本人の手元は頼む所と受け取る所にする / 入力＝固定版（hash）、依頼文、承認済みの上限 / 期待成果＝既存 Work の成果と使用量 / 予算上限＝無料枠、または本人の月の上限 / 要る権限＝その版が宣言した権限
- Noaがつなぐもの: `noah-terminal/1`、`noah-isolation/1`、`/api/noah/runner`（取りに来る・lease・heartbeat・finish）、`noah_runner_devices`、`noah_runner_commands`、モデルの中継、既存 Work、Wallet の予約、接続計画（[noah-one-click-connect.md](noah-one-click-connect.md)）
- AMCの工程:
  1. 受付（担当: Broker）— 合格条件: 利用権・上限・版の固定を確かめた。
  2. 端末の用意（担当: Work）— 合格条件: 雲は本人ごとに 1 台。家と手元は本人が承認した端末。
  3. 隔離環境の用意（担当: Work）— 合格条件: 仕事ごと・Agent ごとに別。画面・入力装置・本人のファイルが無い。
  4. 配置（担当: Work）— 合格条件: 配布物と依存の層の hash が固定版と一致。
  5. 実行（担当: Work）— 合格条件: 上限の内側で終わる、または理由付きで止まる。
  6. 回収（担当: Work）— 合格条件: 成果と使用量が Work に残り、隔離環境が消えている。状態を持つ Agent は、その Agent の分だけ保存した。
  7. 精算（担当: Wallet）— 合格条件: 無料枠の消費、または従量の明細に 1 回だけ載る。
- Jevの合格条件: 別 owner との隔離環境の共有 0 件。同じ owner の別の Agent のファイルの読取 0 件。宣言外の host への通信 0 件。隔離環境の中の鍵 0 件。上限を超えた継続 0 件。停止後に残る隔離環境 0 件。同じ要求 ID の実行 1 回以下。結果不明の自動再実行 0 件。hash が合わない配布物の実行 0 件。置き場所の無断変更 0 件。PC が要る手順 0（雲）。[noah-screenless.md](noah-screenless.md) の検査の違反 0 件。
- 出力先: Noah の端末の一覧（雲・家・手元を同じ並びで）、「頼む」と仕事の一覧。phone でも可。
- Wallet: 雲は無料枠（候補: 1 人 1 日 10 回）。超えた分は si 使用料（実費＋30%、しきい値 1,000 円の後払い。[product-baseline.md](../product-baseline.md) の既存方針）。本人の月の上限と運営全体の月の上限で止める。家と手元は雲の使用料 0（電力と端末の実費は未計測と表示する）。新しい課金型は作らない。
- hardware profile 依存: 雲は全部。家は mii（Hub）・Pro・Mac。手元は pixel-native。**契約に機種の名前を書かない。** 置き場所の値は `cloud`・`home`・`pocket`。機種の差は profile と、端末の行の platform に置く。
- 失敗時: 準備の失敗・時間切れ・上限到達・通信の拒否を分けて見せる。lease を越えた仕事は結果不明にし、再配送しない。家の端末が応答しない時は待つ。本人が端末ごとに選んだ時だけ雲へ回す。
- 記録: owner、端末、版 hash、隔離環境の種類、開始と終了、CPU 秒、メモリ、モデルの入出力トークン、通信した host、停止の理由。依頼と成果の本文は既存 Work にだけ置く。

## 置き場所

| 値 | 何か | 本人の準備 | 向く Agent |
| --- | --- | --- | --- |
| `cloud` | 本人専用の、画面の無い Linux。使う時だけ起きる | 無し | ターミナルで動く Agent、載せたコード |
| `home` | 家で動き続ける端末。今は Mac の runner。次に mii の Hub、Pro | 端末を 1 回つなぐ | 常駐、本人の契約で動く Agent、手元のデータ、画面を操作する Agent |
| `pocket` | Pixel の中 | 無し | スマホ内版（[noah-mobile-variant.md](noah-mobile-variant.md)） |

- つないだ Agent（Passport）は account が正本。端末は cache。端末を足した時・替えた時は、置き場所の変更（`change_place`）をまとめて 1 回の確認で行う。
- 提供者のサーバーで動く Agent は、この契約の外（[noah-agent-intake.md](noah-agent-intake.md)）。

## 雲の作り

- 専用 Worker から Cloudflare Sandbox を起動する（[noah-cloud-operation.md](noah-cloud-operation.md) の専用 Worker と同じ置き方）。Web の本体とは別の配備にし、runner と同じ認証付き API だけで話す。Sandbox は 1 つが 1 つの VM。認証と回数制限は用意されないので、こちらで持つ。
- 本人ごとの端末は `noah_runner_devices` に platform=`cloud` の行として持ち、端末の一覧に出す。初めて必要になった接続の時に作る。
- `noah_runner_commands` は「端末 1 台につき実行中 1 件」の一意制約（`noah_runner_one_claim`）を持つ。雲の端末は同時 3 件（候補）まで動かすので、同じ形の受け渡しを別の表で持つか、制約を platform 別にするかを実装で決める。既存の行の意味は変えない。
- 共通の image は 1 つ（Node・Python）。Agent ごとの image は作らない（保存の上限が account 全体で 50GB）。依存を入れ終えた層は、Sandbox の backup（R2 の読み取り専用の層）として 1 回作り、同じ版の実行で使い回す。Agent の状態も、owner と Agent の組ごとに同じ仕組みで保存する。
- 外向きの通信は全閉から始め、接続要件の `egress` だけ許可する。モデル提供元の host は中継へ向ける。鍵は中継が付ける。
- 上限の初期値は今の `LIMITS`（240 秒、モデル呼び出し 8 回、出力 2,048 トークン、入力 12,000 bytes、ファイル 12 個）。常駐は雲では受けない（1 体あたり月 約 $8。設計書 6 章）。

## 家の作り

- 今の Mac の runner（`scripts/noah-mac-runner.mjs`、常駐は `scripts/noah-mac-service.mjs`）が最初の実装。足すのは、スマホの QR での承認、導入を 1 つにまとめること、[noah-screenless.md](noah-screenless.md) の重さの上限。
- mii の Hub と Pro は、同じ runner を Linux で動かす。機種ごとの受入は別の task にする（この契約は変えない）。
- 本人の月額契約で動く Agent（Codex 等）は、`home` でだけ動かす。本人のログインを雲へ運ばない。

## 費用の式（雲）

1 回 ＝ vCPU × 動いた秒 × $0.000020 ＋ GiB × 秒 × $0.0000025 ＋ GB × 秒 × $0.00000007 ＋ モデル（入力・出力トークン × 単価）。定価は 2026-11-20 取得。ふつうの仕事で約 $0.001、上限いっぱいで約 $0.011。Worker・Durable Object・R2・ログ・通信量は別。

## 最初に測るもの

固定 adapter 13 件のうち、モデル無しか中継で動く物を使う。準備の秒数、最初の成果までの秒数、1 回の費用、同時 10 件での失敗数、依存の層を戻す秒数。結果をこの文書へ足す。
