## 2026-11-22

- Noah: Pixel実機で会員登録なしの外部登録→認証付きAgent実行→成果保存/再表示と、本番100ブラウザ・400要求の所有者分離を確認。100人向け配布文を現行導線へ訂正し、eSIM・専用クラウド候補の費用/未送信質問票を記録（task100、docs/noah、docs/esim、PR #377）。

- Pixel 10の画面保持・消灯後30分の自動ロック猶予を設定し、公開Noahを会員登録なしで接続→依頼→成果5件受取→保存から再表示まで実機確認（[PR #377](https://github.com/k999ln/rock/pull/377)）。


- Noahのカードと掲載Agent詳細から利用人数・王冠・コメント列を外し、元サイト評価へ一本化。公開186・390px/590pxを確認。全体verifyは別の共有機能の既存lintで停止（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noahの評価元で付いたGitHubスター/Hugging Faceいいね等をカードに常時表示。元APIの実数と公開184の表示・390pxレイアウトを確認（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noahの既存Agentと収集Agentを共通カード・王冠/コメントへ統合し公開182へ反映。390px/590pxの表示、絞り込み間の評価引継ぎと取り消しを確認（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noahの収集欄をUX操作試験し、全件表示での検索条件引継ぎ・条件クリア・通信失敗時の再試行を修正（task120、[PR #384](https://github.com/k999ln/rock/pull/384)）。
- 農家検索を削除し、運営Dockで指定した配給を本人の模擬専用回線で受領する流れに変更。朝9時までの[英語の開発プロンプト](docs/prompts/noah-esim-free-device-trial-20261122.md)を並行開発と照合し、入荷・在庫割当・定期配給の合格条件を記載。eSIM用クラウド入口、Agent別の実行先選択、画面を閉じた後の結果照会と成果内訳を追加（[PR #382](https://github.com/k999ln/rock/pull/382)）。

- Noah公開トップにAgent収集・外部評価を表示し、公開版177へ反映。Mac常駐を停止し、クラウド2回の継続収集・掲載更新を確認。5分ごとのActions定期実行を有効化（[PR #380](https://github.com/k999ln/rock/pull/380)、task120。Xはキー待ち）。

- Noahの継続Agent収集・出典別カード・外部評価同期を公開版171へ反映し、運営Macの常駐収集から署名付き自動掲載を確認。XはAPIキー待ち（task120、[PR #380](https://github.com/k999ln/rock/pull/380)）。
- 配給担当者が地域・品目から全国の生産者を探し、6農園の公式窓口を開いて運営予算での買取を直接相談できるMac用ツールを追加（[PR #381](https://github.com/k999ln/rock/pull/381)）。

- Noahの0円申込・模擬専用回線・食料と日用品の案内をローカルWorkersで接続し、停止、成果受取、0円の使用記録を検証する試験を追加（PR #378）。

- Noah のホームをピンタレスト風にした（task 115。Opus / Noelle。本人指示「Noahもっとピンタレストっぽく。redditとかgithubでUIとアルゴリズム取ってきて」と回答）。今動かせる Agent のグリッド（Gestalt の Masonry の決まりを書き写した・2〜6 列・分野の色の面と頭文字）、ボードへ保存（公開も選べる・フォロー）、「表示しない」、詳細の「これも使われています」、上の帯の検索とメニュー。並びは学習なし・乱数なし（X の For You の作りの形・Reddit の hot・Pinterest の Pixie を決まった値で。票 = 保存した人 + 2 × 成果が返った人 − 5 × 表示しない人）。表 6 つ（migration 0054）、`GET /api/noah/pins`・`GET`/`POST /api/noah/boards`。一般公開までは審査者だけ（一般の人は今のタイムライン）。試験 9 本（`tests/noah-pins.test.mjs`）。[PR #375](https://github.com/k999ln/rock/pull/375)。設計は `docs/noah/spec-115-pin-grid.md`、決定は docs/structure/07 の 2026-11-22。本番の migration・配備はしていない。
