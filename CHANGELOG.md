## 2026-11-22

- task 101 の項目 1・4（Noah の運営向けの月別の従量と移る引き金・runner が止まった時の復旧試験、Codex の #370）を今の main に入れた（Opus / Noelle。本人指示「やるべきこと全部やって」）。利用の画面は main の形（引数で範囲を受け取る）に、クラウドの従量の欄を足した（[PR #414](https://github.com/k999ln/rock/pull/414)）。
- task 105（自社クラウドの費用上限・見張り・復元練習、Codex の #368）を今の main に入れた（Opus / Noelle。本人指示「やるべきこと全部やって」）。migration を 0058 に付け直し、その表・索引・trigger が migrator で全部入る事の試験を足した（[PR #413](https://github.com/k999ln/rock/pull/413)）。
- task 13（iOS の eSIM 導入と Eve のホーム画面、Codex の #372）を今の main に入れた（Opus / Noelle。本人指示「やるべきこと全部やって」）。migration を 0057 に付け直し、接続画面の見出しは main の新しい文にした。手元の本番ビルドで応答ヘッダを測り直した。iPhone 実機の確かめは未実施（[PR #412](https://github.com/k999ln/rock/pull/412)）。
- task 102（SIM の証明、Codex の #365）を今の main に入れた（Opus / Noelle。本人指示「やるべきこと全部やって」）。migration を 0056 に付け直し、会員登録の廃止の後は、このブラウザの本人に SIM を束ねる形にした（[PR #411](https://github.com/k999ln/rock/pull/411)）。
- Noahの定期便の台帳を作った（task124、Opus / Noelle。本人の決定「配給制にする」「現金で渡す」「本人の分から差し引く」）。Agentが実際に稼いだ現金だけを月ごとに締め、作業料（いつも現金）と全員への等分（今は現金、仕入先とつながったら物）に分ける。有料は、等分が値段以上の月だけ等分から差し引く。締めは途中で止まっても続きから動き、振込の一覧はCSVで出す（振込は本人が押す）。口座番号は持たずHMACだけ。切り替えは閉のままで、本番の動きは変わらない。migration 0055の本番適用は本人の許可の後。棚・300人の試行・公開の審査者の操作が本番で使えなかった（IDだけを見ていた）のも直した（[PR #410](https://github.com/k999ln/rock/pull/410)）。
- Noahの推し活のエージェントを、ネットで調べた困り事に合わせて作り直した（task122、Opus / Noelle。本人の問い「推し活遠征アプリですでにできることじゃない？ペインポイントおさえてる？」と回答「ネットで調べて必要なことは」）。今あるアプリ（FanFun・おしきゅん・チケットカレンダー・推し活支出管理）は予定を手で入れて知らせるまで。主役を、①公式の告知・発売の期間を公開の出典から自動で集める、②当落の日・宿の無料取消の期限・交通の早割の締切を突き合わせ、当落の前に押さえ外れたら期限内に取り消し当たったら安い部屋を拾う、③公式のリセールと詐欺の注意、に絞った。困り事6つを出典付きで `NOAH_OSHI_PAINS` に。仕様11.2。
- eSIM と自社クラウドの設計（PR #360）を、11-22 の本人方針に合わせて main に入れた（Opus / Noelle。本人指示「それでやって」）。月額を取らない・会員登録の廃止・スマホの eSIM はクラウドへの鍵、が 11-21 の決めより優先する所に「11-22 で更新」と印を付けた。離脱率の測り方を、解約率から「続けて使う割合」に変えた（`codex/tasks/103-esim-churn-measure.md`、`lib/churn-cohort.ts` の説明）。03-esim の §1・§2・§7 は、main の新しい文（専用eSIM の導入手順・閉じた後の動作）を土台にした。

- Noahの配給（画面では「定期便」）のお金の決まりを記録。本人の取り分はゆくゆく全部物、仕入先とつながるまでは現金。何割かは未定、残りはAgentを作った人と運営の分。利用者全員への等分は物・寄与の分は作業料として現金。箱はおまかせ。eSIMは最初は必須にしない。渡す前に税理士・弁護士に確認。受け取る人が見る「配給」を「定期便」に変えた（04「Noahの配給」、[PR #404](https://github.com/k999ln/rock/pull/404)）。
- Noahの稼ぎ方の設計図に推し活を足した（task122、Opus / Noelle。本人指示「推し活向けのイベント予約とかグッズかう代行自動ボットもいれて」）。推し活の手伝いはNoahのエージェント1つ（公式の告知を見張る・予定に入れる・知らせる・遠征を探す・家計簿。申込と支払いは本人が押す。値段はNoahの料金に従う）として定義し、会社の稼ぎ方は海外向けの購入代行（後回し。人の速さ・数量制限の内・チケットは扱わない・古物の要否は本人が確かめる）、予定まとめ、遠征の紹介、絵柄なしの用品の物販の37件（合計470件）。抽選・先着への自動申込、転売、買い占め、複数アカウント、待機列の回避、版権グッズは作らない（理由と出典付き）。仕様 `docs/noah/spec-122-business-blueprints.md` の11章、試験1本追加。
- Noahの登録先429に対する待機時刻表示・本人別の再送防止と、本番100ブラウザの限定検査スクリプトを追加。公開199/mainのUIを保全して全体verify成功、公開とPixelの新規登録一周は受入中（task100、[PR #400](https://github.com/k999ln/rock/pull/400)）。

- 第198版で公開したホーム・検索・Agentの操作画面・Hugging Face再表示の変更をGitHub mainに取り込み、ココナラの入口を保全（[PR #399](https://github.com/k999ln/rock/pull/399)）。

- avoado.siの公開元をGitHub mainに統一し、Macと本番のGitツリーを照合する手順をAGENTS.mdに追加。公開版のAgent共有に関する記録を取り込んだ（[PR #398](https://github.com/k999ln/rock/pull/398)）。

- 公開Agent詳細に個別共有・URLコピー・X投稿リンク、公開条件を確認する個別OG/Twitter情報とPNG生成を追加（Sites公開ソース、専用PRなし）。
- Noahの公開入口 `/`・`/noah` にOpen Graph・X大型画像カードと公開PNGを追加（Sites公開ソース、専用PRなし）。

- Noah公開195・196を保全して接続位置・用途名を統合し、検索先詳細の操作名が縦に崩れるCSS競合を公開197で修正。全体verify・3幅ブラウザ試験・Pixelの検索→接続→新規成果10件→再読み込みを確認（task100、[PR #394](https://github.com/k999ln/rock/pull/394)）。

- Noahの稼ぎ方の設計図の1段目（task122。Opus / Noelle。本人指示「アフィに登録して案件選んで動画作ってSNS運用させてLPつくって…すべての商売の手段として自動化したい」）。分類表から433件（紹介250・受注48・デジタル商品90・広告収益24・物販16・アプリ5）の設計図を作り、登録から入金の確認までの工程を自動・押すだけ・本人・本人が確かめるに分けて理由を付け、確かめたエージェントだけを工程に当てて並べる。アカウントを作る順、Eveが作る能力の一覧、稼いだ分だけの予算、14日・10件で続けるか止めるかの式。`scripts/noah-business-plan.mjs` で公開の一覧172件・集めた紹介1,000件から計画を書き出す（確かめたエージェントは0、Eveが作る能力20）。試験7本（`tests/noah-business.test.mjs`）。仕様 `docs/noah/spec-122-business-blueprints.md`。[PR #391](https://github.com/k999ln/rock/pull/391)。

- Noahにココナラの返信・応募・正式納品を追加。本人のMacで専用Chromeの画面非占有と、タブを閉じた後の納品照合を確認した（[PR #393](https://github.com/k999ln/rock/pull/393)）。

- Noahの収集カード・外部評価を内部詳細へ統一し、確認済み接続と公開Spaceの利用画面をNoah内へ結線。未対応・API専用・埋込拒否は理由付きで取込設定へ案内。初期ロード表示も調整（PR #390）。

- Noahのロード画面をカード型プレースホルダーと小さなロゴに変更し公開191へ反映。スマホの読み込み・動きを減らす設定・外部評価の実数照合をブラウザ試験へ追加（task120、[PR #390](https://github.com/k999ln/rock/pull/390)）。

- Noahで長い一覧の成果（131,072 bytesで切れたJSON）が画面に1件も並ばなかった不具合を修正。最後まで届いた項目だけを一覧で出し、「成果の一部を表示しています」を1回にした。本番のTipline（一覧413件）で接続→頼む→成功を実測し、届いていた326件を取り出せることを確認（spec-87、[PR #395](https://github.com/k999ln/rock/pull/395)）。
- Noah公開192の接続ロゴ・成功音/振動と個別設定を最新mainへ受入。全体verify成功、Pixelで検索→接続→新規成果10件→再表示を実測し、再生音と振動完了を記録（task100、[PR #392](https://github.com/k999ln/rock/pull/392)）。
- NoahのSPIDER履歴検知を、公開の振動設定名と秘密値拒否テストの2組に限定して分類。固定版ポリシー・別値/別パスの検出20試験と全履歴0候補を確認し、公開190のホーム整理・191の読み込み表示とmainのモバイル修正を保持して統合（[PR #377](https://github.com/k999ln/rock/pull/377)）。
- Noahの購入履歴からeSIM設定を再開し、端末利用権の確認後にAgent一覧へ進める案内と、契約ごとの確定使用料・予約額の明細を追加した（task 11・94、[PR #389](https://github.com/k999ln/rock/pull/389)）。
- Noah検索修正後のWeb security実測/input hash不一致を再実測で解消し、全体verify成功（主要4,922成功・4skip、API1,918、CSV385）。追加収集元・並び替え・外部評価を共通カードへ統合（task120、[PR #388](https://github.com/k999ln/rock/pull/388)）。
- Noahを実Chromeのスマホ表示で確認し、収集Agentが見つからないホーム検索と小さいタップ範囲を修正。再実行用ブラウザ試験を追加（task120、[PR #388](https://github.com/k999ln/rock/pull/388)）。
- Noahのカードと掲載Agent詳細から利用人数・王冠・コメント列を外し、元サイト評価へ一本化。公開186・390px/590pxを確認。全体verifyは別の共有機能の既存lintで停止（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noahの評価元で付いたGitHubスター/Hugging Faceいいね等をカードに常時表示。元APIの実数と公開184の表示・390pxレイアウトを確認（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noahの既存Agentと収集Agentを共通カード・王冠/コメントへ統合し公開182へ反映。390px/590pxの表示、絞り込み間の評価引継ぎと取り消しを確認（task100、[PR #386](https://github.com/k999ln/rock/pull/386)）。
- Noah公開189の最新UI/機能を保持してGitへ統合。GitHub全体verifyは4,931成功・4skip・0失敗、公開側も4,907成功。390/1280pxと主要導線を確認し、SPIDERの履歴検知8件は別残件として記録（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの最新公開188にある共有カード・組み合わせ・法人入口・モバイル表示・出典付き調査候補をGitへ統合。mainの配給/eSIM実装と実機受入記録を保持し、共有部品のlintと画面試験を修正（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noah: Pixel実機で会員登録なしの外部登録→認証付きAgent実行→成果保存/再表示と、本番100ブラウザ・400要求の所有者分離を確認。100人向け配布文を現行導線へ訂正し、eSIM・専用クラウド候補の費用/未送信質問票を記録（task100、docs/noah、docs/esim、PR #377）。

- Pixel 10の画面保持・消灯後30分の自動ロック猶予を設定し、公開Noahを会員登録なしで接続→依頼→成果5件受取→保存から再表示まで実機確認（[PR #377](https://github.com/k999ln/rock/pull/377)）。



- Noahの専用回線に配送先登録を追加。運営Dockで入荷・定期配給・運営負担額を記録し、本人向け通知から受取までを模擬環境で照合した。Dockは台帳の復旧後にエラー表示を解消し、外部Agentの空の成功応答・不正な完了フラグは同じ仕事番号で要確認にする（[PR #387](https://github.com/k999ln/rock/pull/387)）。
- Noahの集める場所を増やした（task121。Opus / Noelle。本人指示「twitterとかredditとか、github repoとか他に考えられる場所探して、常に新しく使いやすいものが上に」）。Hacker News・GitHubのMCPの新着・Hugging FaceのMCP Space・npm・DockerのMCP一覧・awesome一覧・Smithery（鍵がある時）を5分ごとの収集に追加し、CodexがX・Reddit・Blueskyで読んだリンクを受け取る口（`scripts/noah-collector-social.mjs`）を用意。「新しく見つかったAgent」を新しく使いやすい順（学習・乱数なし）に並べ、動かし方（スマホで今すぐ・ブラウザ・Mac・鍵）を表示。握手の済んだ系列を収集機が1日400系列まで一覧へ自動で入れる（署名付き・変わった物だけ）。グリッドのお試しは新しく握手が通った順。試験10本（`tests/noah-collection-sources.test.mjs`）。[PR #385](https://github.com/k999ln/rock/pull/385)。本番の配備はCodex。
- Noahの収集欄をUX操作試験し、全件表示での検索条件引継ぎ・条件クリア・通信失敗時の再試行を修正（task120、[PR #384](https://github.com/k999ln/rock/pull/384)）。
- 農家検索を削除し、運営Dockで指定した配給を本人の模擬専用回線で受領する流れに変更。朝9時までの[英語の開発プロンプト](docs/prompts/noah-esim-free-device-trial-20261122.md)を並行開発と照合し、入荷・在庫割当・定期配給の合格条件を記載。eSIM用クラウド入口、Agent別の実行先選択、画面を閉じた後の結果照会と成果内訳を追加（[PR #382](https://github.com/k999ln/rock/pull/382)）。

- Noah公開トップにAgent収集・外部評価を表示し、公開版177へ反映。Mac常駐を停止し、クラウド2回の継続収集・掲載更新を確認。5分ごとのActions定期実行を有効化（[PR #380](https://github.com/k999ln/rock/pull/380)、task120。Xはキー待ち）。

- Noahの継続Agent収集・出典別カード・外部評価同期を公開版171へ反映し、運営Macの常駐収集から署名付き自動掲載を確認。XはAPIキー待ち（task120、[PR #380](https://github.com/k999ln/rock/pull/380)）。
- 配給担当者が地域・品目から全国の生産者を探し、6農園の公式窓口を開いて運営予算での買取を直接相談できるMac用ツールを追加（[PR #381](https://github.com/k999ln/rock/pull/381)）。

- Noahの0円申込・模擬専用回線・食料と日用品の案内をローカルWorkersで接続し、停止、成果受取、0円の使用記録を検証する試験を追加（PR #378）。

- Noah のホームをピンタレスト風にした（task 115。Opus / Noelle。本人指示「Noahもっとピンタレストっぽく。redditとかgithubでUIとアルゴリズム取ってきて」と回答）。今動かせる Agent のグリッド（Gestalt の Masonry の決まりを書き写した・2〜6 列・分野の色の面と頭文字）、ボードへ保存（公開も選べる・フォロー）、「表示しない」、詳細の「これも使われています」、上の帯の検索とメニュー。並びは学習なし・乱数なし（X の For You の作りの形・Reddit の hot・Pinterest の Pixie を決まった値で。票 = 保存した人 + 2 × 成果が返った人 − 5 × 表示しない人）。表 6 つ（migration 0054）、`GET /api/noah/pins`・`GET`/`POST /api/noah/boards`。一般公開までは審査者だけ（一般の人は今のタイムライン）。試験 9 本（`tests/noah-pins.test.mjs`）。[PR #375](https://github.com/k999ln/rock/pull/375)。設計は `docs/noah/spec-115-pin-grid.md`、決定は docs/structure/07 の 2026-11-22。本番の migration・配備はしていない。

- Noahの画面統合後に全体verify成功（4,856 pass・4 skip）、公開導線12項目を確認。旧URLの正規転送とブラウザ保存権限を検査スクリプトへ反映（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noah会員登録不要化を公開179へ反映。178の画面整理を保持し、公開APIで接続→依頼→成果再表示と別所有者404を実測。Pixel一周は端末解除待ち（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- NoahのREADMEから旧eSIM必須の開始説明を更新。収集・法人入口を保った画面分岐テストの部品境界を補い、4件成功を確認（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの登録なし自動開始とブラウザ専用保存権限を実装。既存データと管理権限を分離し、接続→成果再表示をAPI試験。公開・実機一周は検証中（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの会員制廃止を最新仕様へ記録し実装着手。ADBでPixel操作を復旧、公開175の接続/保存修正を統合。新方式の公開・実機一周は未完了（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noah実機検証の復旧状況を更新。操作ツール未提供とPixelのWi-Fi切断を確認し、設定確認・現在の接続先を依頼（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの実機検証を更新：本人のPixel画面オープン報告とWi-Fi/点灯を確認。現在はMac側画面操作ツールの障害で未完了と記録（[PR #377](https://github.com/k999ln/rock/pull/377)）。
- Noahの検索入口を /noah/explore、保存を /noah/saved に統合し、Mac・コミュニティ系11ページを撤去。公開178で旧URL転送9件と390px表示を確認。保存APIとデータ、収集・法人入口は保全（PR #377）。

- NoahのAgent詳細で接続と保存の間隔を16px確保し、保存を白地の補助ボタンに変更。公開175へ反映し320/390/1280pxで重なりなし、全体verify成功（PR #377）。

- Noah一周検査の4件と選択肢翻訳を公開173へ反映。登録済み/画像未受取/検索から成果保持/ホームと投稿一覧を公開ブラウザで確認。全体verify成功（4,844 pass・4 skip、API1,918、CSV385）。実機Androidの独立確認は別途継続（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noah公開172の4件修正を受入ブランチへ統合・pushし、171収集機能の保全と関連31試験/公開9項目を確認。実機一周は画面ロック解除待ちとして記録（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの一周検査4件を修正：登録済み接続の再利用、画像未受取の明示、6言語の操作名、ホーム/タイムライン分離。公開172へ反映、選択肢の訳語追補と最終検証を継続中（PR #377）。

- Noah公開170の透過faviconの独立確認を受領し、一周検査165/166と公開170の確認範囲を分離。ホーム/タイムラインの同一表示は仕様照合待ちとして記録（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noahの透過タブロゴを公開170へ反映。公開169のピン表示と167のeSIM対応を保持し、公開HTML・SVG実体一致・9項目を確認（[PR #377](https://github.com/k999ln/rock/pull/377)、元変更 PR #376）。

- Noah公開167で利用開始を接続確認へ変更し、専用新規登録を撤去。明示されたNoah権限で同じ本人の登録情報・仕事・成果を使うAPIを追加。公開eSIM設定と実機での本人連携は未完了。成果カード・画像保存は公開165へ反映。最終verify 4,829成功・4skip、公開390pxと元成果への復帰を確認（[PR #377](https://github.com/k999ln/rock/pull/377)）。

- Noah公開版163/164でWorkersの外部登録・認証付き実行を修正し、実登録1件→成果保存と本人の実スマホでの成果表示を確認。失敗の再入力/履歴保持、匿名タイムライン、100人の合成分離試験を追加。全体verify 4,811成功・4skip。100人の段階試用手順を記録（[PR #377](https://github.com/k999ln/rock/pull/377)）。
- Noah のホームをピンタレスト風にした（task 115。Opus / Noelle。本人指示「Noahもっとピンタレストっぽく。redditとかgithubでUIとアルゴリズム取ってきて」と回答）。今動かせる Agent のグリッド（Gestalt の Masonry の決まりを書き写した・2〜6 列・分野の色の面と頭文字）、ボードへ保存（公開も選べる・フォロー）、「表示しない」、詳細の「これも使われています」、上の帯の検索とメニュー。並びは学習なし・乱数なし（X の For You の作りの形・Reddit の hot・Pinterest の Pixie を決まった値で。票 = 保存した人 + 2 × 成果が返った人 − 5 × 表示しない人）。表 6 つ（migration 0054）、`GET /api/noah/pins`・`GET`/`POST /api/noah/boards`。一般公開までは審査者だけ（一般の人は今のタイムライン）。試験 9 本（`tests/noah-pins.test.mjs`）。設計は `docs/noah/spec-115-pin-grid.md`、決定は docs/structure/07 の 2026-11-22。本番の migration・配備はしていない。

- NoahにCowAgentのMac準備ガイド（18秒の操作動画・日本語字幕）と公開3ページのサイトマップを追加し、カタログ・README・YouTube投稿用の導線をつないだ。配備・投稿前（task 71、[PR #369](https://github.com/k999ln/rock/pull/369)）。

- Noahのタブアイコンを白背景PNGから元画像を保持した透過ロゴSVGへ統一（app/noah/layout.tsx、PR #376）。

- Noahの成果を要点・一覧カード・画像プレビューへ整理し、受信画像のWork保持と実画像ファイルの保存を追加（lib/noah-result-*・components/noah-result-content、PR #376）。全体verify・画像保存のbyte一致検証に成功。

- Noahの主要12画面を指定の4タブ/2列デザインへ統一し、登録の保存再利用同意、ロゴ読み込み、振動設定、6言語UIとRTLを統合（app/noah・components/noah-*、[PR #376](https://github.com/k999ln/rock/pull/376)）。全体verify成功、公開反映は未実施。

- Noahの公式API登録・本人別の暗号化キー保管・自作の分離ブラウザとスマホ本人確認を公開版161へ反映。全体verify 4,790成功・4skip、クラウドChromiumの合成手順とスマホ確認画面を検証。Dock入口は公開Noahへ修正。実サービスのブラウザ手順と100人向け容量は未受入（[PR #373](https://github.com/k999ln/rock/pull/373)）。

- Noahを新しい投稿/Agentカードと登録情報の暗号化保存・再利用・操作ごとの委任に更新し、公開版159へ反映。保存/停止と公開Agentの実依頼・成果受取を確認、全体verify成功。外部登録executorは未接続（[PR #371](https://github.com/k999ln/rock/pull/371)）。

- Noahの読み込みを花形ロゴに統一し、タップ・選択・接続成功の短い振動、保存されるOFF設定、動きを減らす表示を追加（task100、[PR #371](https://github.com/k999ln/rock/pull/371)へ統合）。

- Noah公開版156でログイン後の選択保持・登録状態の再確認・進捗/成果への導線を反映。本人承認の掲載担当を設定し172件を取り込み、公開環境のスマホ幅で読み取り専用1件の接続→成果受領→切断後の保持を確認。全体verify 4,759成功・4skip（[PR #358](https://github.com/k999ln/rock/pull/358)）。
- iPhone・iPadのeSIM導入リンクとQR、Eveのホーム画面追加、導入宣言と事業者通知の照合を実装。iPhone実機確認は未実施（[PR #372](https://github.com/k999ln/rock/pull/372)、task 13）。
- task 101 の項目 1・4 として Noah の運営向け月別従量と移行の引き金、runner の同一 ID 再配送防止と合成 Cloudflare 復旧試験を追加（[PR #370](https://github.com/k999ln/rock/pull/370)）。

- task 105 のクラウド新規受付に費用上限を追加し、Noah の日別 SLO、通知の振り分け、D1・R2 のローカル復元練習と運用手順を実装（[PR #368](https://github.com/k999ln/rock/pull/368)）。

## 2026-11-21

- タスク 102 で公式資料に基づく Endorse トークンの署名検証、SIM の account への紐付け・解除・照合 API、D1 migration 0056（main への統合の時に 0054 から付け直し）を追加した。[PR #365](https://github.com/k999ln/rock/pull/365)

- 本人の「規定で進めて」（22:54）で、自社クラウドの K1〜K10 と eSIM の 11〜15 を決めた（Opus / Noelle）。07 に 1 行、03-esim 0 章と compute-placement 0 章を決定に、task 10〜13・101 に決めを反映、task 102〜105 を追加。`lib/cloud-cost.ts`（定価での実費と黒殿へ移す引き金）と `lib/churn-cohort.ts`（eSIM つきとカードだけの解約率と 3 か月の継続、Wilson の幅、判定）を実装し、`tests/cloud-cost.test.mjs`・`tests/churn-cohort.test.mjs`（23 本）を足した。README の eSIM の節を更新。

- 本人の回答（22:31）で eSIM と自社クラウドの設計を直した（Opus / Noelle）。`docs/structure/03-esim.md` 0 章にスマホと自社の端末の eSIM の違い・スマホの型 S/M・離脱率の仮説と測り方、`docs/compute-placement.md` 0 章に自社クラウドの案 A〜D・回線の終端 N1〜N3・本人の鍵 K・運用の設計。07 に 1 行。（[PR #360](https://github.com/k999ln/rock/pull/360)）

- eSIM の載せる先と計算の置き場所を設計した（Opus / Noelle。本人指示「早く設計して」）。`docs/structure/03-esim.md` に 0 章（スマホに売らず Hub・専用端末・車の回線と鍵にする、制度、訂正 3 点）、`docs/compute-placement.md`（従量で始め、引き金の後に黒殿の 1 ノードへ）、07 に 1 行、05・noah-own-device に参照、task 101。（[PR #360](https://github.com/k999ln/rock/pull/360)）
- Noah の取り込みの結果を、本番の書き込みを抑えて入れられるようにした（Opus / Noelle。本人指示「全部やって今つかえる状態にして」）。入れる処理は、変わっていない候補・握手の行・系列を書かない（同じファイルや、1 時間後に握手し直しただけのファイルを入れ直しても 0 行）。1 回ごとに書いた行の数（D1 は索引を含む）を返し、運営の画面に合計を出す。手元の書き出しに `--limit`（数を絞る）と `--first`（棚のカードが使う系列を先に）を足した。本番の D1 の日ごとの上限が確かめられていないので、最初は 2,000 系列（約 2.6 万行）から入れる。新しい系列 1 つで約 13 行（索引を含む。以前の「約 3 行」を直した）。試験 1 本を足し、1 本を広げた（`tests/noah-intake-import.test.mjs`）。`docs/noah/spec-97-launch-ops.md` の 12 章。

- Noah の棚の最初のカード 17 枚（下書き）を用意した（Opus / Noelle。本人の回答「選んで用意して」）。`data/noah-shelf-first-cards.json`（稼ぐ・仕事を省く 7・教育 4・暮らし 6。健康は除く）。手元の巡回が一覧に載せた系列から選び、どれも相手のサーバーの道具 1 つで終わり、道具を 1 回ずつ実際に呼んで成果が返る事と、入力欄にできる事を確かめた（仕訳・インボイス番号・広告文の点検・自動化の仕様書・Web 調査・求人・法令・英語の発音・中国語・クイズ・算数ぬりえ・ふるさと納税・年末調整・手取り・紅葉・コインロッカー・保育園）。運営の画面の「カードを置く」へそのまま貼れる。試験 4 本（`tests/noah-shelf-first-cards.test.mjs`）。一覧と、置いてから載るまでの手順は `docs/noah/spec-110-shelf.md` の 18 章。本番へは、まだ置いていない。

- Noah の取り込みと握手を手元で計算し、本番へ結果だけを入れる道を作った（Opus / Noelle。本人の問い「上手くローカルで計算できないの？」。[PR #359](https://github.com/k999ln/rock/pull/359)）。`scripts/noah-local-patrol.mjs`（本番と同じコードと migration の表を手元の SQLite で動かし、台帳を読み、握手し、一覧に載せる系列だけを書き出す）、`lib/noah-intake-import.ts`・`POST /api/noah/intake/import`（審査者だけ。手元の L2 は 1 に落とし、本番の L2・取り下げ・隠した印は残し、載せるかは本番の決まりで計算し直す）、運営の画面の「取り込みの結果を入れる」。本番の巡回（`NOAH_PATROL_ENABLED`）と有料の枠を開けなくても、一覧が使える。試験 4 本（`tests/noah-intake-import.test.mjs`）。手順は `docs/noah/spec-97-launch-ops.md` の 12 章。

- Noahのログインで選んだ仕事・道具を保持し、依頼受付から進捗/成果へ直結。登録Agentは同じ仕事の状態だけを表示中と本人確認から戻った時に再確認し、背景/完了時は停止する（[PR #358](https://github.com/k999ln/rock/pull/358)）。

- Noah独立版154を本人承認後に avoado.si/noah へ公開。追加DB 10本・20表と一覧/依頼受付を反映し、主要画面とAPIの9項目を確認。接続可能一覧0件のため本番通し受入は未完了。本人指示により共通アカウントの最小パスワードを8文字へ変更し、保存版155で公開。全体verify 4,753成功・4skip（[PR #358](https://github.com/k999ln/rock/pull/358)）。

- NoahをOS運用に依存しないサービスへ変更。`/noah`配下のOSランタイムを停止し、専用ログイン・スマホ向けAgent一覧・依頼/成果の主画面と読込失敗時の再試行を実装（[PR #358](https://github.com/k999ln/rock/pull/358)）。旧Mac導線は専用パスに保持。最新mainの棚・試行・評価・接続上限も取り込み済み。独立版をSites保存版154として保存（未配備、source 6b69d009）。全体verify成功（4,745成功/4skip）、最新main統合後と公開用sourceのNoah 737件も成功。本番migration 0044〜0053・配備は未実施。

- Noah の公開先 `https://avoado.si/noah` に向け、公開originの正規化・ローカル設定拒否・画面とAPIの読み取り確認を追加（[PR #358](https://github.com/k999ln/rock/pull/358)、task97）。本番は旧版で新しい画面/APIが404、接続表なし。公開用のSites保存版152を作成し（未配備）、migration 0044〜0049の適用と配備は本人確認待ち。認証付きAgentの接続は継続実装。

- NoahのMacで実行した仕事を個別URLから開いて停止・成果保存できるようにした。配布Runnerで接続・実行・ファイル照合・停止・切断を確認（[PR #366](https://github.com/k999ln/rock/pull/366)）。

- Noahの限定共有・送信履歴・利用状況を登録Agentの画面から開けるようにし、外部Agentの利用報告を所有者確認付きで既存APIに統合（[PR #362](https://github.com/k999ln/rock/pull/362)、task 73）。

- Noah のつなげる数を、料金ごとのカードの数にした（task 113。Opus / Noelle。本人指示「続き最後までやって」。[PR #357](https://github.com/k999ln/rock/pull/357)、#355 の上の積み上げ）。表 `noah_package_connections`（migration 0053）、`lib/noah-plan.ts`、`lib/noah-connect.ts` のつなぐ前の上限（無料 6・有料 50。数えるのはカードで、同じカードの中の 2 本目は増やさない。7 枚目は 409「無料でつなげるのは 6 個までです。使っていないものを切ると、空きができます。」。もうつないである物は切らない）、`/noah/ready` の見出し「6 個のうち 4 個」。**どの利用権を有料と見るかは本人が決めるまで置いていない（`NOAH_PLAN_SOURCE` は null）ので、切り替え `NOAH_PLAN_LIMITS` を開けても、今は全員 50 のまま。** 試験 5 本（`tests/noah-plan-limits.test.mjs`）。変えた所は `docs/noah/spec-110-shelf.md` の 17 章。本番の migration・配備・切り替えは、していない。

- Noah の棚の実績の並びと見せた記録（task 111）を実装した（Opus / Noelle。本人指示「続き最後までやって」。[PR #355](https://github.com/k999ln/rock/pull/355)、#354 の上の積み上げ）。表 `noah_package_evidence`・`noah_shelf_daily`・`noah_shelf_seen`（migration 0052）。学習なしの並び（4 つの率の控えめな見積りの積・5 人未満は使わない・5 枚に 1 枚の試し・同じ領域を 3 枚続けない。`NOAH_SHELF_RANK` が開いている時だけ）、実績の数え直し（直近 90 日・1 日 1 回・巡回の合図の中）、カードの数（成果が返った割合・また使った人・最初の成果まで）、見せた記録（全員の数と、履歴に同意した本人の分だけ。`NOAH_SHELF_SEEN`）、「表示しない」、履歴を消すと見た記録も消える、タイムライン（`/noah`）に「Noah の棚」のカードを流す。試験 7 本（`tests/noah-shelf-rank.test.mjs` 5・タイムライン 2）。変えた所は `docs/noah/spec-110-shelf.md` の 16 章（本人の関心の点はまだ渡さない）。本番の migration・配備・切り替えは、していない。

- Noah の 300 人の試行（task 114）を実装した（Opus / Noelle。本人指示「続き最後までやって」。[PR #354](https://github.com/k999ln/rock/pull/354)、#353 の上の積み上げ）。表 `noah_trial_channels`・`noah_trial_entries`・`noah_trial_reports`（migration 0051）、`lib/noah-trial.ts`・`GET`/`POST /api/noah/trial`、`?via=<札>` の入口（サインインまで tab に持ち、1 回だけ送る）、カードの詳細の下の本人の報告（任意。4 つの数だけ）、`/noah/review` の「試行」の節（段ごとの 4 つの数と割合・足りない条件・経路ごと・カードごとの合計。5 人未満は出さない。札を足す・閉じる）。金額は約束せず、5 人以上の測った合計だけを出す。試験 7 本（`tests/noah-trial.test.mjs`）。変えた所は `docs/noah/trial-300.md` の 10 章。本番の migration・配備・切り替え（`NOAH_TRIAL_OPEN`）と、投稿・動画・人への連絡は、していない。

- Noah の棚とカード（task 110）を実装した（Opus / Noelle。本人指示「続き最後までやって」。[PR #353](https://github.com/k999ln/rock/pull/353)、#343 の上の積み上げ）。表 `noah_packages`・`noah_package_steps`（migration 0050。DDL 案から字を変えずに移した）、`lib/noah-shelf.ts`（型契約を関数ごと移した）・`lib/noah-shelf-store.ts`・`GET`/`POST /api/noah/shelf`、`/noah/ready` の一番上の棚（「稼ぐ・仕事を省く」「教育」「暮らし」。探している間は出さない）、`/noah/review` の「棚」の節。載るのは、審査者が自分で動かして成果を確かめた、今動く相手のサーバーの道具のカードだけ（読むたびに今の事実で判定。相手が止まる・道具が変わると、次の握手の後に外れ、理由が運営の画面に出る）。巡回の合図の中で 10 分に 1 回まで見直し、載せたカードの系列の握手を 24 時間以内へ早める。カードから開いた詳細は、その道具を最初から選ぶ。試験 28 本（`tests/noah-shelf.test.mjs` 17・`tests/noah-shelf-store.test.mjs` 11）。仕様から変えた所は `docs/noah/spec-110-shelf.md` の 15 章。**最初の 12 枚の案はローンチの範囲の外なので、棚はまだ空。** 本番の migration・配備・切り替え（`NOAH_SHELF_PUBLIC`）は、していない。

- スマホでつなぐ Agent（台帳の Agent）の一覧のカードと詳細に、利用人数（「n 人が利用」。接続して頼み、成果が出た人を 1 人 1 回）を出した（Opus / Noelle。本人の回答「スマホの Agent に利用人数を出す」。[PR #356](https://github.com/k999ln/rock/pull/356)、task74）。Codex の利用人数（Mac の Agent）とは別の集まりなので混ぜない。migration なし、D1 への往復は一覧で増やさない。

- Noah の「実行中」と「成果データ」に、スマホから接続した Agent へ頼んだ仕事と成果を出した（Opus / Noelle。本人の回答「#349 にしか無い所は、後から上に小さく足す」。[PR #352](https://github.com/k999ln/rock/pull/352)、task87）。`GET /api/noah/ask` の行に Agent を添え、`components/noah-work-list.tsx` を Agent をまたげる形にし、頁から Codex の画面へ渡す。成果データの書き出し・運営への提供には、まだ載せていない（本人が決める）。

- Noah MVP L1〜L9 の PR を、今の main と合わせて 1 本にまとめた（Opus / Noelle。本人の回答「Claude の L4〜L9 を残す」「緑になったらマージして」。[PR #350](https://github.com/k999ln/rock/pull/350)）。README・CHANGELOG・task 一覧の衝突を、両側を残して解いた（README は main の作り直した構成を土台に、積み上げの 14 段落を字を変えずに写し、食い違う 4 か所だけ直した）。取り下げ・報告の窓口（D8）を、本人の決めた smash@avoado.si にして、`/noah/help#bot` の節と、一覧・詳細からの道を出した（`lib/noah-bot-notice.ts`）。本番の migration・配備・切り替えは、していない。

- READMEで差し替え済みのmiiの帰宅画像とNoahの検索GIFを `docs/assets/readme/` から削除（[PR #348](https://github.com/k999ln/rock/pull/348)、task 99）。

- Noah MVP L9（受入）を実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #347](https://github.com/k999ln/rock/pull/347)、task90。L8 の #346 の上の積み上げ）。スマホだけの一周の自動試験 `tests/noah-phone-loop.test.mjs`（2 本。画面が呼ぶのと同じ入口と、署名の付いた巡回の合図だけを呼ぶ: 取り込む → 見つける → 計画 → つなぐ → 道具 3 つ → 頼む（押すだけ・入力あり・確かめ）→ 同時 → 動いた → 受け取る → 切る。頼んだ後、読み直しを呼ばずに成果が Work に入る。利用者の操作から始めた握手 8 回・相手が受けた握手 9 回・道具の呼び出し 5 回。本人の端末の表は、読みも書きもしない。相手が受けた要求に、本人の ID は無い。切り替えを閉じると、一覧 404・接続と依頼 503）。画面の決まりを、一周の 9 つの段で見る試験（`tests/noah-ready-ui.test.mjs` に 1 本: 画面を覆う部品が無い・提供者の文は字のまま・画面に出さない言葉が無い・台帳との関係を書いていない・画面が裏の間と、終わった後は、読み直さない）。**実機の確かめの表（`docs/noah/spec-90-phone-only-loop.md` の 5 章）を、手元の開発サーバーと幅 390 の Chromium で通して、通らない所を 1 つ見つけて直した:** 「切る」と、Agent の詳細の「仕事」が一覧ごと消え、「切っても、受け取った成果は残ります。」と書いてある成果を、その画面から読めなかった。仕事の一覧を、接続ではなく、その Agent で読むようにした（`GET /api/noah/ask?agent=<系列の ID>`。切った接続の分も含めて、新しい 50 件。D1 への往復は 1。`lib/noah-ask.ts`・`components/noah-work-list.tsx`・`components/noah-ready-detail.tsx`。試験 1 本と、受入の script `scripts/check-noah-ask.mjs` に確かめを足した）。手元の結果は `spec-90` の 9.4（1〜7・10〜12 は通った。5 は「やめる」まで。8・9・13 は手元では行えない）。**本番と、本物のスマホでは、確かめていない（配備・migration の適用・切り替えは、本人の許可の後）。**

- Noah MVP L8（出すための運用）を実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #346](https://github.com/k999ln/rock/pull/346)、task97。L7 の #345 の上の積み上げ）。運営の画面（`/noah/review` の「取り込み」の節）に「見張る数」を足した（`lib/noah-launch-status.ts`。`GET /api/noah/intake?state=1` の `launch`）: 切り替えの状態、台帳の巡回（この 2 時間、成功も読み取りの開始も無ければ「止まっています」）、まだ握手していない数、握手の結果、同じ接続先へ 1 時間に 2 回以上握手した数、混んでいる接続先、直近 24 時間と 7 日の接続・握手の時間・依頼・つないだ人・成果が出た人・頼んだ画面の幅、戻ってきた人、失敗の多い接続先。16 文を 1 回の batch で数え、5 分の間は同じ値を返す。出すのは数だけ（本人の ID・依頼の中身は無い。接続先の名前は、依頼が 5 件以上あり、失敗か結果不明がある物だけ）。画面は、期間ごとの数を、表でなく 1 行ずつの文で出す（スマホの幅で、はみ出さない）。使い方の頁 `/noah/help` に、外の道具・Agent を提供している方への説明の節 `#bot` を足した（文は `lib/noah-bot-notice.ts`。数は、作りの数と同じである事を試験が見る）。**取り下げ・報告の窓口の宛先（D8）が未定のため、節は `hidden` で置き、一覧と詳細の「報告・取り下げの申し出」の道も、まだ出さない**（宛先を入れる所は `NOAH_REPORT_CONTACT` の 1 行）。巡回を起こす専用の Worker の手順書（`services/noah-patrol-wake/README.md`: 鍵・配備・動いているかの見方・止め方・鍵の替え方）。その Worker は、鍵を置く前に配備した時も、何も送らずに、設定が違うと分かる文で失敗する。試験 18 本を足した（`tests/noah-launch-ops.test.mjs` 17: 切り替え 4 群・合図と専用の Worker・窓口の文・上限の上書き・見張る数（手で数えた値と同じ）・戻し方（一覧 404・接続と依頼 503・進んでいる依頼は最後まで・1 つの接続先だけを止める）・合図の記録・本番へ適用する 4 本の migration の形。`tests/noah-ready-ui.test.mjs` 1）。手元の実物（`npx vinext dev`・手元の D1・実在の台帳から載った系列・幅 390 の Chromium）で、運営の画面の数（まだ握手していない 31,846 が、前からある「載せていない理由」の同じ数と一致）、切り替えを閉じた時の見え方（接続は「今は、新しい接続を受け付けていません。」、一覧は「まだ公開していません。」）、宛先を入れた時の節の見え方を確かめた。専用の Worker は `wrangler deploy --dry-run` を通した（1.84 KiB。配備していない）。**本番への配備・migration の適用・切り替えは、行っていない。**

- Noah MVP L7（見回りを保つ）を実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #345](https://github.com/k999ln/rock/pull/345)、task88。L6 の #344 の上の積み上げ）。巡回の合図の終わりに、後始末を行う（`lib/noah-sweep.ts`）: 実行の場が持つ時間（30 秒）を過ぎて 5 秒たった `running` の依頼を終え、60 秒たった `queued` の依頼を「失敗」に、つなぐ途中のまま 30 秒たった接続を切る。それぞれ 50 件まで・10 秒まで。相手へは、何も送らない。道具を呼ぶ直前に、依頼へ「相手へ送る」の印（`tool_calls=1`）を付けるようにし、落ちた依頼を、印があれば「結果不明」、無ければ「失敗（相手のサーバーへは、送っていません。もう一度頼んでください）」に分ける（取り直して呼び直さない）。本人の「止める」は、実行の場が無くなった依頼を、その場で止める。画面は、「止めています…」が 45 秒より長く続いた依頼に「止める」をもう一度出し、後始末が切った接続には、理由と「接続」を出す。つなぐ途中の接続だけを持つ索引を足す migration 0049（`drizzle/`・`drizzle-main/`・型契約 `docs/contracts/noah-v1.sql`。本番 D1 へは適用していない）。運営の画面に「つながると確かめた数」（動いた・握手まで・本人の Mac で動かす物）。試験 11 本を足した（`tests/noah-patrol.test.mjs` 10・`tests/noah-intake-review.test.mjs` 1）。手元の D1（Miniflare）での受入 `scripts/check-noah-patrol.mjs`: 握手が通った 50 件のうち、止めた 1 件が、2 回続けて失敗した所で一覧から消え、戻すと戻った。同じ接続先への握手は、106 回の全部で 1 時間以上あいた。手元の実物（開発サーバーの実行の場を、途中で止めた）で、落ちた依頼と、つなぐ途中で止まった接続が、合図 1 回で片付く事を確かめた。L5 で接続を断った相手は、名乗りの違いによる物ではなかった（どちらの名乗りでも、握手が通った）。実行の D1 への往復は 15〜16 → 14〜15。自動の見本（`probeL2`）は作っていない。配備・切り替えはしていない。記録は `docs/noah/spec-88-mass-probe.md` の 9.5・9.11。

- Noah MVP L6（入力欄で頼む）を実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #344](https://github.com/k999ln/rock/pull/344)、task87。L5 の #342 の上の積み上げ）。依頼の表 `noah_asks` を足す migration 0048（`drizzle/`・`drizzle-main/`。本番 D1 へは適用していない）。つないだ相手の道具を、入力欄から 1 回呼ぶ `POST /api/noah/ask`（202 を返した後に続ける。握手 8 秒・呼び出し 20 秒。失敗しても呼び直さない）、読む `GET /api/noah/ask`・`/api/noah/ask/[id]`、止める `POST /api/noah/ask/[id]`（`lib/noah-ask.ts`・`lib/noah-ask-store.ts`・`lib/noah-remote-work.ts`）。成果の正本は Work（`noah-agent-remote`。確認待ちのまま・費用 0）で、Work と依頼の行は 1 回の書き込みで一緒に入れ、一緒に終える。本人が入力欄を開いた時と定義が同じ道具だけを呼ぶ。読み取りだけと宣言されていない道具は、最初の 1 回、画面で確かめてから。入力欄に無い項目は渡さない。止めた後に届いた成果は採らない。接続を切ると、終わっていない依頼を止める。成功した依頼で、その系列が「動いた」になる。画面は、詳細の中の、道具を選ぶ・入力欄・確かめ・仕事の一覧と成果（`components/noah-ask.tsx`・`noah-work-list.tsx`）。試験 20 本（`tests/noah-ask.test.mjs` 13・`tests/noah-ask-ui.test.mjs` 7）。手元の D1（Miniflare）での受入 `scripts/check-noah-ask.mjs`（合成の相手 17・依頼 63 件。依頼と Work は 1 対 1。止める・切る・上限を D1 の上で通した。D1 への往復は、受け付け 6・実行 15〜16）。手元の実物（幅 390 のブラウザ・手元の D1・実在の相手）で、押すだけの道具と、入力のある道具を頼んで成果が出て（受け付けてから 0.9〜1.1 秒）、頼んだ直後に画面を閉じても Work に成果が残った。**読み取りだけと宣言されていない実在の道具は、呼んでいない**（見つかった 1 個は、相手の事業者へ問い合わせを送る道具だった。送る手前の確かめの画面までを見た）。成果を「成果データ」「実行中」に出す所と、1 文で頼む機能は、まだ。配備・切り替えはしていない。記録は `docs/noah/spec-87-tool-agent.md` の 11.8。

- Noah MVP L5（つなぐ）の画面を実装し、L5 の完了の定義を手元で通した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #342](https://github.com/k999ln/rock/pull/342)、task74・96）。`/noah/ready`（すぐ使える Agent の一覧）と `/noah/ready/agent`（詳細）を足した（`components/noah-ready.tsx`・`noah-ready-detail.tsx`・`noah-card.tsx`・`noah-connect-button.tsx`・`noah-ask.tsx`、`lib/noah-ready-view.ts`）。カードの「接続」を 1 回押すと「頼む」に変わる。詳細は、送り先（入力が送られる接続先）を接続の前に出し、つないだ後は、道具の一覧と「切る」。未サインインの人が押した時は、サインインから戻った画面が、同じ操作 ID で、押し直さずに続ける。入口は、「Agentを探す」の一番上に 1 つ（`components/noah-ready-entry.tsx`。見せてよい時＝切り替えが開いている・審査者にだけ出る。menu と外枠の file は変えていない）。出す場所（別の画面と、探す画面の入口）と、つなぐ時のサインインは、本人の返事を待ちながら、既定で作った（変える時に直す所は、仕様書 11.5）。Codex の #337 の続き（menu が 4 つに・説明を減らす）を取り込み、画面の文も短くした。試験 13 本（`tests/noah-ready-ui.test.mjs`。L5 の合計 45 本）。手元の実物（幅 390 のブラウザ・手元の D1・実在の台帳から載った 39 件）で、実在の系列 5 つの「接続」を 1 回ずつ押し、4 つが 1 回で「頼む」になった（残りの 1 つは、相手が断り、画面は理由と「もう一度」を出した。送ったのは握手だけ。道具は呼んでいない）。未サインインからの続きは、試験の台だけで確かめた。本番への適用・配備・切り替えはしていない。記録は `docs/noah/spec-74-one-click-connect.md` の 11.9。

- Noah MVP L5（つなぐ）の、画面の前までを実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #342](https://github.com/k999ln/rock/pull/342)、task74・96。握手の L4（#335）と、成果データ（#334）・Noah の画面（#337）を合わせた枝の上の積み上げ）。接続の表 `noah_connections` を足す migration 0047（`drizzle/`・`drizzle-main/`。本番 D1 へは適用していない）。計画を読む `GET /api/noah/connect-plan`、1 回の要求で握手まで終えてつなぐ `POST /api/noah/connect`、やり直す・切る `POST /api/noah/connect/[id]`、つないだ相手の道具の一覧 `GET /api/noah/connect/[id]/tools`（`lib/noah-connect.ts`・`lib/noah-connect-source.ts`・`lib/noah-connect-plan-api.ts`・`lib/noah-user-handshake.ts`）。つなげるのは、一覧に載せている系列だけ。送るのは握手だけで、道具は呼ばない。同じ操作の再送は握手をやり直さない。つなぐ前の上限（切っていない接続 50・60 秒に 10・24 時間に 100）と、接続先の枠（全員合わせて 60 秒に 60 回）を越えた時は、相手へ送らない。相手が 401・402 を返したら、その場で一覧から外す。429 は、相手が言った時刻まで待つ。同意した時から接続先が変わった接続は、黙って新しい相手へ送らず、切ってつなぎ直してもらう。見回りは、つないでいる人が居る系列を 24 時間ごとに確かめる。試験 32 本（`tests/noah-connect.test.mjs`・`tests/noah-connect-plan-api.test.mjs`）、手元の D1 での受入（`scripts/check-noah-connect.mjs`。合成 14 件。実在の接続先 6 件のうち載った 3 件は、3 件とも 1 回でつながり、道具の一覧が開いた）。画面とその場のサインインは、置く場所とサインインの扱いを本人に確かめてから作る。配備・切り替えはしていない。記録は `docs/noah/spec-74-one-click-connect.md` の 11.8。

- Noahに「実行中」タブを追加し、依頼入力・接続・実際の処理状態・成果・停止を一画面へ集約し、旧管理画面を転送に変更。接続手順と選択Agentの復帰を整理し、取得失敗の空表示を修正。実コンテナの隔離・実行・保存・停止を再実行可能な検証へ追加。全体verify成功（4,531成功・4 skip）（[PR #337](https://github.com/k999ln/rock/pull/337)、task100）。

- Noahの継続改善パッケージを smash@avoado.si へのメール受付に変更。Web申込フォーム・履歴・運営一覧を撤去し、旧受付APIは保存/開示を停止。既存記録とmigration履歴を保持（[PR #337](https://github.com/k999ln/rock/pull/337)、task100）。

- Noahの個人の感想を中心にしたタイムライン、利用人数・王冠1人1票・コメント/返信を追加。開発者向け継続改善パッケージと個別見積もりの保存/閲覧を実装。関連40試験・全体verify成功（4,524成功・4 skip）。価格・課金・作業自動実行は未設定、本番変更なし（[PR #337](https://github.com/k999ln/rock/pull/337)、task100）。

- Noah MVP L4（握手までの接続試験）を実装した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #335](https://github.com/k999ln/rock/pull/335)、task86。L3 の点検の修正 #339 の上の積み上げ）。相手のサーバーの口（握手・道具の一覧・呼び出し・接続先の検査）と入力欄の関数を、型契約から `lib/noah-mouth-mcp-remote.ts`・`lib/noah-form.ts` へ移した。巡回の合図のたびに、鍵の要らない候補へ握手し（1 回に 8 件・同時に 4 件・同じ接続先へは 1 時間に 1 回・別の接続先への転送には従わない・道具は呼ばない）、結果を握手の表へ書いて、系列へ写す（`lib/noah-probe.ts`・`lib/noah-intake-probe.ts`）。応答しないのが 2 回続いたら一覧から外し、30 日で隠し、握手が通ると戻す。量産の系列・取り下げた系列は握手しない。試験 37 件を足した（取り込み・握手・入力欄で 76 件）。実在の接続先 100 件の受入: 通った 51・401 が 35・応答しない 11・形が合わない 2・つなげない 1（通った物の 98% に、入力欄で使える道具）。手元の D1 の受入 script は `scripts/check-noah-probe.mjs`。本番 migration・配備・切り替えなし。出す前に確かめる事が 1 つ残る（本番の Worker から、内部向けのアドレスへ届かない事。86 の 10.3）。

- Noahに会社の正式花形ロゴと白・チャコール・紫の配色を適用。スマホ下部5項目を1メニューへ統合し、既定の全件表示からAgent絞り込み/解除に変更。ニュース・コミュニティー・機能一覧の導線を廃止。390px/1360pxの表示・操作と全体verify成功（4,506成功・4 skip）を確認（[PR #337](https://github.com/k999ln/rock/pull/337)、task100）。

- Noah の「棚とパッケージ」と「300 人への出し方」を、設計・参照実装・試験・task まで置いた（Fable / Noelle。本人の決定 11-19〜21「最初はパッケージ化」「1 つの仕事を最後までやる組合せ」「今動かせるもの」「どっちもお願い」「全部あなたに任せるから最後までやって」。[PR #343](https://github.com/k999ln/rock/pull/343)、task 110〜114）。① [docs/noah/spec-110-shelf.md](docs/noah/spec-110-shelf.md): 入口の棚（稼ぐ・仕事を省く／教育／暮らし）、カード `noah-package/1`（1 枚 ＝ 1 つの仕事を最後までやる組合せ）、載せる条件（運営が動かして確かめた、今動かせる物だけ。理由 8 つ）、**学習を使わない並び**（つながる率 × 成果が返る率 × 検収に通る率 × また使う率。5 人未満の実績は使わない。5 枚に 1 枚は新しいカードを試す。同じ領域を 3 枚続けない）、見せた記録、札、つなげる数（無料 6 枚・有料 50 枚）、健康の助言の条件、学習を足す条件。② [docs/noah/trial-300.md](docs/noah/trial-300.md): 30 → 100 → 300 の段と次へ進む条件、出し方の決まり（広告の単位はカード 1 枚。金額を約束しない）、稼げる額の式と測り方、守る決まり、先に要る物。③ docs/contracts/noah-shelf-v1.ts・noah-shelf-v1.sql・noah-shelf-queries-v1.sql（新しい表 9 個・問い合わせ 15 文）。④ 検証キットに noah-shelf.test.mjs（17 群）と validate-noah-shelf-v1.py（6 群）。全体で試験 78/78、DDL 10/10 と 6/6。⑤ 最初のカード案 12 枚（[docs/services/noah-shelf.md](docs/services/noah-shelf.md)。全部が下書きで、**動かした結果はまだ無い**。工程の先は今の main の 13 件と Noah の中の道具を指し、試験が照らす）。⑥ codex/tasks 110〜114。⑦ 決定を 07 に 6 行、00-overview の 0 章・04・noah-design の 8・9・10・12.5 章・mvp-launch の 13 章に反映。実装（`lib/`・画面・migration）と、カードを動かして確かめる事は、まだ。本番の migration・切り替え・投稿は行っていない。

- Noahのスマホでの配布元確認とMacの接続準備をHiggsfieldで縦型CMに編集し、READMEとサロン向け投稿文から案内（[PR #341](https://github.com/k999ln/rock/pull/341)、task 99）。

- READMEにmiiのデザイン映像とNoahの公開画面を使った操作デモを掲載し、オンラインサロン向けの18秒動画と投稿文を追加（[PR #340](https://github.com/k999ln/rock/pull/340)、task 99）。

## 2026-11-20

- Noah MVP L3 の点検で見つけた所を直した（Fable / Noelle。本人指示「そのまま開発して実装して」。[PR #339](https://github.com/k999ln/rock/pull/339)、task85。#332 の上の積み上げ）。握手済みの候補の記録が、版や説明だけ更新されても、握手の記録と一覧を保つ（消すのは、接続先に関わる項目が変わった時だけ）。形の違う記録は 1 件ずつ読み飛ばす（1 頁で 10 件を越えたら止める）。台帳を読めなかった合図は、500 と件数の 1 行。名寄せは、隠した系列を 1 回だけ書き、候補が戻った系列を戻す。取り下げは、持っている有効な候補の 9 割以上が見えた時だけ。続けて 6 回の失敗で、同じ印から読み直す。直す前の実装で落ちる試験 11 件を足し、設計書（85 の 5.1・11.8、88、97、名寄せの SQL）も直した。本番 migration・配備・切り替えなし。

- Noahを白地・紫のX型3カラムタイムラインとスマホ下部ナビへ変更し、外部Agentの必要項目入力・同意・登録Agent実行・状態照会を追加。全体verify成功（4,503成功・4 skip）。実登録先は未接続、本番変更なし（[PR #337](https://github.com/k999ln/rock/pull/337)、task100）。

- NoahのWeb保存済みAgent成果を `/noah/data` で検索・出力し、本人が選択・同意した成果を運営へ提供・撤回できるように実装。元Work削除後の撤回と通信断時の再送を保持。全体verifyと最終21群成功。本番migration・配備・切り替えなし（[PR #334](https://github.com/k999ln/rock/pull/334)、task99）。

- Noah MVP L3の公式台帳取り込み・再開可能な巡回・一覧API・運営画面とローカルD1受入コマンドを実装。全体verify、製品23群、実台帳68,964件＋差分1頁・合成65,000件のローカルD1受入が成功。本番migration・配備・切り替えなし（[PR #332](https://github.com/k999ln/rock/pull/332)、task85）。

- Noah MVP L2の接続要件・計画・状態遷移を `lib/noah-connect-requirements.ts`・`lib/noah-connect-plan.ts` へ移設し、設計側を再exportへ集約。製品9群と全体verify成功。API・画面はL5で接続（[PR #330](https://github.com/k999ln/rock/pull/330)、task96）。

- READMEにmii公式の筐体全景とセンサー部の接写を掲載し、Proの紹介・画像・表の記載を外した（[PR #338](https://github.com/k999ln/rock/pull/338)、task 99）。

- ルートREADMEをmii公式サイトに合わせ、帰宅のビジュアルと5本の短編からEve・Noahの実画面、接続構成、実機の検証状況へ進む構成に更新（[PR #336](https://github.com/k999ln/rock/pull/336)、task 99）。

- READMEを更新日・ハイライト・縦目次・機能別記事の順に改め、Noahの検索デモ、Eveの実画面、Macの停止手順とスマホ版の入出力例を追加（[PR #333](https://github.com/k999ln/rock/pull/333)、task 99）。

- READMEを機能別のハイライト・目次・実画面・検証手順で整理し、設計の入口でもNoahのスマホ向け公開版とMacのRunner開発を区別（[PR #331](https://github.com/k999ln/rock/pull/331)、task99）。

- 目的と、一番重く見る 3 つを、設計の正本に書いた（Fable / Noelle。本人指示「ここまでを git に更新してあげて」）。① docs/structure/00-overview.md の 0 章: 大きな目的（みんなが Agent を使って、生活がより豊かになる）、最初の目的（教育と身の回りの生活が、少しでも便利に・効率よくなる）、重点 3 つ（どんな Agent にも 1 クリックでつながる／登録が要っても離れさせない／画面をジャックしない）。② docs/noah-design.md の 12 章: 3 つへの設計の対応と足りない所、全部の Agent につながるまでの型ごとの数と順、今の Noah の現状（動かせるのは 13 件・調査カタログ 79,643 件は接続を確かめた物が 0・並びは点数の足し算で予測なし）、最初の目的に合わせて変える所（提案）。③ docs/noah/mvp-launch.md の 13 章: 入口を「教育」「暮らし」の棚にする案。④ docs/structure/07 に本人の言葉 4 行。**設計の文書だけ。実装（lib/・app/）と本番は変えていない。**

- Noah MVP L1の隔離起動引数の検査を `lib/noah-screenless-audit.mjs` と通常verifyへ追加。18構成・15通りの緩和拒否・画面を閉じた後のWork保存を検証し、全体verify成功。実機観測は後続（[PR #329](https://github.com/k999ln/rock/pull/329)、task84）。

- Noah の設計を、別の機械から始められるようにした（Fable / Noelle。本人指示「main に入れて、別の PC が git にアクセスして開発が進めれるようにして」）。docs/noah/README.md に「別の機械で始める時」（clone → `npm ci` → 検証キット → 読む順 → 最初の PR は L1 と L2）を足した。main を別の場所へ取り出して確かめた: `npm ci` の後は試験 61/61・DDL 10/10。`npm ci` が無いと `noah-screenless.test.mjs` だけが読めない（今の起動スクリプトが `fflate` を使う）ので、検証キットの README の「`npm install` は要らない」を直した。

- Noah の検証キットの試験で、鍵らしい作り物の文字列を、試験の中で組み立てる形へ直した（docs/design-validation/noah/noah-connect.test.mjs。Fable / Noelle）。main へ上げた後、SPIDER / secrets が、試験に直に書いていた作り物の 1 行（commit 5b7cde3 と、それを含む merge の 80b3810）を鍵の候補として検出したため。本物の鍵ではない。今のファイルからは消えるが、履歴には残るので、検査は、例外（policy と control commit の更新。owner review）が入るまで赤のまま。**この変更では、`.github/spider/` と workflow を触っていない。履歴も書き換えていない。** 検証キットは試験 61/61。PR #328。

- miiの商品案内を4本のTower＋別体Hubに統一し、商品サイトの画像11点を原本から生成。追加機能の表示名、重複索引、未使用の旧画面・CSSを整理（[PR #327](https://github.com/k999ln/rock/pull/327)、task98）。

- Noah の「ローンチの最小限（MVP）」の線を引き、線の内側を実装できる所まで詰めた（Fable / Noelle。本人指示「ローンチするのに最小限って意味の mvp」）。① docs/noah/mvp-launch.md: 出す物（スマホだけで、相手のサーバーで動く Agent を、選ぶ・接続・入力欄から頼む・受け取る・切る）、入れる物と後にする物、作る順 L1〜L9、出す前に確かめる事 G1〜G7、本人が決める事 13 個（既定つき）、危ない所、数える物。② 各実装仕様書（84・85・96・86・87・74・88）の最後に「ローンチの範囲」の章、新しい仕様書 2 本（90 手元だけの一周、97 出すための運用）、task 97。③ 参照実装を足した: 入力欄で頼む（docs/contracts/noah-form-v1.ts。道具を選ぶ画面・入力欄・確かめの記録・結果の文・つなぐ前と頼む前の上限）、切り替え（noah-flags-v1.ts）、一覧・上限・接続先ごとの枠の問い合わせ（noah-listing-v1.sql。1 つの接続先へ、利用者の操作から始める握手は、全員合わせて 60 秒に 60 回まで）、公式台帳の「更新された物だけ」の読み方・一覧に載せる条件・巡回を起こす合図（noah-intake-v1.ts）、別の host への転送に従わない使い方と 410 の扱い（noah-mouth-v1.ts）、表の列と索引（noah-v1.sql）。④ 実データ: 参照実装の握手を、標本の 500 接続先に通した（通った 276）。その道具 3,699 個の 95.5% が入力欄で使える。載る見込みは約 18,000 系列。1 時間あけた 2 回目の握手では、道具 3,563 個の定義は 1 つも変わらず、別の host へ転送する相手は 276 のうち 1。検証キットは試験 61/61、DDL 10/10。**本番の migration・配備・切り替え・契約は行っていない。実装（lib/・app/）も変えていない。**

- Noah の設計の中身を詰めた（Fable / Noelle）。① 作業単位ごとの実装仕様書 8 本（docs/noah/。84・85・96・86・87・74・88・89。今あるコードのどのファイル・関数をどう変えるか、規則の全表、画面と文言、処理の順、試験）。② 動く型契約と参照実装 5 本と DDL 案（docs/contracts/noah-*。接続要件と接続計画、取り込み、口と相手の許可と起動の型紙、道具を持つ担当、画面を取らない検査、新しい表 13 個、名寄せの SQL）。③ 検証キット（docs/design-validation/noah/。公式台帳の実記録と実際の握手の写しを使った試験 41 群、DDL を一時 DB へ流す検証 9 群。`npm run typecheck` エラー 0）。公式台帳の有効な 66,608 件を参照実装に全部通し、今の main の隔離環境の起動引数が検査を通ることを確かめた。実データに通して直した所（取り込みを別の表にする、面を 2 段で決める、配布の中身を Noah が固定する、ほか）を 07 に記録した。task 8 枚を、仕様書を指す形に書き直した。コード（app・lib）は変えていない。

- Noah 全体の設計書を置いた（Fable / Noelle）。主商品 mii・最小構成 Noah・最初は本人の Mac（PR #325 の本人確定方針）に順番を合わせ、行き先（みんなが Agent を自分の専用の端末につないで使う。PC の前に座らない）、具体的なスキーム（お金・つなぐ・動かす・集める・載せる／売る・端末・データ）、進捗報告の 11 項目ごとの設計、要る技術と作り方の表、作る順番、7 つの問い（技術・タイミング・独占・人材・販売・持続性・隠れた真実）への答えを 1 冊にした。実装する Agent がそのまま進められる詳細設計書（機能ごとに UX → フロント → バックエンド → 試験、データ定義、状態遷移、開発の進め方、決定待ちの既定値）を別に置いた。接続・実行・取り込み・市場の背景は別の文書へ分けた。外の台帳を読み取りだけで実測（MCP の公式台帳 66,608 件、鍵なしで応答する host は標本の 54.6%、Hugging Face の「agent」は 0.7% しか動いていない）し、残り 72 件を分類。`docs/noah-design.md`、`docs/noah-detailed-design.md`、`docs/noah-agent-market-design.md`、`docs/noah-agent-census-20261120.md`、`docs/services/`（noah-one-click-connect・noah-own-device・noah-screenless・noah-agent-intake・eve-agent-build・noah-mobile-variant・noah-agent-purchase）、`codex/tasks/73`〜`95`、07 に本人指示と提案、02・04 に 1 か所ずつ。設計まで。コード・migration・契約・公開は変えていない。

- Noah/EveのMac API接続・コード取得・型検査・仕事通信を共通化し、構成/事業/READMEを本人MacのNoah→miiへ同期。本人・招待・審査・停止条件と既存機能を保持し、Git読取り失敗時の子処理回収も修正（[PR #326](https://github.com/k999ln/rock/pull/326)、task73）。

- 本人回答に基づき、主商品mii・最小構成Noah・本人Macの先行受入・SIM/eSIMのOS導入役割を正本へ同期。Codex実行の再送試験を、回数固定の待機から実処理の完了待機へ修正（task72）。

- READMEのNoah案内を現在の動作へ同期（task72）。

- Noah公開登録の未ログイン時停止・無効な再確認、ChatGPTログインへの循環、下書きの公開モード消失を修正。登録/運用/Mac承認を既存accountへ接続し、outbox競合試験の誤った勝者固定も解消。全体verify成功、本番の登録→実行→停止は有効セッション確認待ち（[PR #324](https://github.com/k999ln/rock/pull/324)）。

## 2026-11-19

- 最新のNoah/Eve、仕事計画、mii設計研究、AMC・リセール・全社担当を統合候補へ集約。READMEを現在の利用方法と受入範囲へ整理し、進捗生成を現行project.mdへ移動。探索打切りと競合quorumを修正（[PR #321](https://github.com/k999ln/rock/pull/321)）。

- Noah単体ローンチの登録・独立審査・別利用者実行を開発ブランチへ統合し、認証付きMac Runner・配布ZIP・停止確認を追加。12件の失敗・移行整合性・ファイル読取競合を修正し、全体verifyとローカルAPI/実コンテナの接続→実行→停止を確認。公開はリリース工程、別Mac実機は未確認（[PR #322](https://github.com/k999ln/rock/pull/322)）。

## 2026-11-18

- NoahとEveのヘッダーを共通化し、Eveだけに出るコミュニティータブ・タブ位置のずれを修正。avoado.si版149へ公開し、切替と既存認証の保持を確認（[PR #320](https://github.com/k999ln/rock/pull/320)）。

- 旧Noah/Skyの画面をNoah共通シェルと機能一覧に統合。旧URLの条件保持・誤配信404・AMC循環を修正し、ローカル実験の制限を保持。表示名・配色競合も修正し、avoado.si公開版148を107項目で確認（[PR #320](https://github.com/k999ln/rock/pull/320)）。

- 公開assetの正規URLをWorker経由へ修正し、CIの一時ブラウザーでローカル接続権限と実Tool再確認を明示。v144の公開ヘッダー8ルートと検索→Mac版への移動を実測（[PR #319](https://github.com/k999ln/rock/pull/319)）。
- 統合Noahタイムラインをavoado.siの公開入口に接続。ドメイン直下からNoahを開き、既存の共有URLとMac版への導線を保持（公開v143を実URLで確認、[PR #319](https://github.com/k999ln/rock/pull/319)）。

## 2026-11-18

- Noahをニュース・投稿・コミュニティー・Agentの混合タイムラインへ統一。種別ラベルとMac版への案内を追加（本人指示で未公開、PR未作成）。

## 2026-11-18

- avoado.si/noahに公開カタログ・検索・詳細とMac版への導線を追加。私有データ/本番DBは変更しない（Sites用ソース、本人指示で公開せず準備まで、PR未作成）。

# CHANGELOG — 内側の人向け更新ログ

このファイルは「何日に何を変えたか」を残す場所です。製品の説明はREADME.md、仕組みの説明はdocs/structure/ にあります。Codexは日常作業でこのファイルを読む必要はありません（読むのは「以前どう変えたか」を調べる時だけ）。

書き方: 新しい日付を上に足す。1件1〜3行。PR番号・main SHA・証拠へのリンクはここに残す。

## 2026-11-18 — Sky の収益ループを一つにまとめる（完全自動化の方針）（Fable / Noelle）

- 本人指示で、送信まで自動を初期値に変更（`policy.submission`）。apply lane の snapshot を受けて decisions を返す `decideLanePass` と `scripts/sky-gig-desk.mjs --lane` を追加。上流（Daisuke134/life-manager）の schema と同じ形。
- lib/sky-gig-offers.ts: 受注型 16 と、好きなこと型 4（お絵描き・エッセイ・業界の情報収集・解析）。lib/sky-device-tiers.ts: 携帯・家の計算機・会社・クラウドの置き場所と、一致した結果だけを作業料にする計算。
- 差分の一覧と統合図は [docs/sky-earn-parity.md](docs/sky-earn-parity.md)。Mr. の同期は codex/tasks/36、lane との接続は 37。検証: tests/sky-earn-loop.test.mjs（7件）ほか関連 33 件。[PR #318](https://github.com/k999ln/rock/pull/318)

## 2026-11-18 — Sky の会社の窓口（ココナラ）（Fable / Noelle）

- lib/sky-gig-desk.ts: 本人が渡した募集の文面を読み、応募する・見送るを決め、額と納品日を出し、提案の下書きを作る。受注後の確認を30秒の問いにして参加者へ配り、多数側の答えを作業料の寄与にする。サイトへの接続・送信はしない。
- 実行例 `node --experimental-strip-types scripts/sky-gig-desk.mjs examples/sky/gig-desk/desk.json`。設計 [docs/sky-work-loop.md §7](docs/sky-work-loop.md)、書式 [docs/services/gig-desk.md](docs/services/gig-desk.md)、決定 07（11-18 の 3 行。うち 2 行は本人確認待ちの提案）。画面と保存は codex/tasks/35。検証: tests/sky-gig-desk.test.mjs（10件）。[PR #318](https://github.com/k999ln/rock/pull/318)

## 2026-11-15 — Sky の工程選択と会社受注の計算（Fable / Noelle）

- lib/sky-recipe-planner.ts: 依頼を Tool 1つではなく工程全体として計画し、検収に通る成果1つあたりの期待総額で順位付け。自動化を作るか・本人に何を残すかも同じ式で決める。未接続（接続は codex/tasks/33）。
- lib/sky-company-order.ts: 会社受注の実行先の判定、見積り確認、作業料＋配当の分配計算、配れる月額の逆算。記帳・送金はしない（保存と画面は codex/tasks/34）。
- 設計 [docs/sky-work-loop.md](docs/sky-work-loop.md)、書式 [docs/services/company-order.md](docs/services/company-order.md)、決定 07（11-15 の 5 行。うち 2 行は本人確認待ちの提案）、04 §5。検証: `node --experimental-strip-types --test tests/sky-recipe-planner.test.mjs tests/sky-company-order.test.mjs`（16件）。[PR #318](https://github.com/k999ln/rock/pull/318)
## 2026-11-04 — Goalから役割・実行・検収・再計画へ

- 既存AMC Goalに営業18役・開発21役の逆算計画と有限ローカル実行を追加。成果物の実在・版、別processの検収、差し戻し・上限・停止・不明時の再送禁止、CEOの証拠付き最終受入を保持。
- 入口は `npm run amc:cycle -- demo`。[運用・復旧](docs/amc-goal-orchestrator.md#goalから逆算するローカル実行と再計画)。新しい常駐serviceや外部送信・課金・公開権限は付与しない。main未統合のローカル候補。
## 2026-11-05 — mii V2 設計研究と第 1 形態（Fable / Noelle、PR #313）

- docs/mii/design/v2-study/: 第 2 形態 6 案（00〜20、research 4 本）と第 1 形態（天井 1 枚・火災警報器兼用）5 設計書（30〜37、research 5 本）、および「まだ考えていなかった所」38〜45（ソフト・設置校正・安全寿命・音・法規・製造・検証・事業）。原価 1,000 台: C ¥13,600 / D ¥48,000 / A ¥131,000 / B $662 / E ¥319,000。認証費: 検定 ¥148,100、PSE ¥950,000、技適 ¥240k×2＋60 GHz ¥450k、UL 217 $31k〜45k。
- codex/tasks/23 を追加（V2 反映、本人承認後）。task 22 に ceiling 筐体を追記。

## 2026-11-02 — avoado.si と GitHub main のソース統合（G04 / WEB04）

- 公開v141のEve / Noah導線・会話・本人性runtimeをmainの権限/承認/成果契約と統合。両方のGit履歴を保持し、通常PRで同一sourceの公開へ進める。
- 公開SQLは [固定ハッシュ](data/avoado-published-migration-lineage.json) のまま。旧main SQLは [保全先](drizzle-legacy/github-main-before-avoado-alignment/README.md) へ分離。検証と未完事項は [進捗](project.md)。

## 2026-11-01 — miiの声・指先入力（PR #311）

- MINI01/M1: 同じ仕事の依頼内容を声/2D指先で選択・確認・CAS保存・再読込。料金fixtureの過去日付を修正。検証・未受入範囲は [記録](data/mii-spatial-input-validation.json)。[PR #311](https://github.com/k999ln/rock/pull/311)へ保存。固定sourceは独立検収済み。HEAD CI・main統合後の同一SHA CIは確認中。

## 2026-11-02 — 構造整理（Fable / Noelle）

- docs/mii/design/00〜13: mii 設計書 V1（Tower 4本＋Hub 別体、本数可変 1→4→8、基準部屋 4.5×4.5m、Node 寸法、Gen1 運動視差投影、同期・電源、ソフト構成、校正、受入条件、BOM 構造、試作計画）。

- mainの旧状態をブランチ `archive/pre-restructure-20261102-main-1daf5c3` に保存（復元用）。
- README.md の前半を内側向けの構造地図に書き直し。後半に旧READMEの製品説明（Mini/OS/Eve/Sky/Pro、写真・設計・コードの場所・開発状況）を全文残した。旧README原本は archive/root-snapshot-20261029/README.md。
- AGENTS.md を100行以内に書き直し。旧AGENTSは archive/root-snapshot-20261029/AGENTS.md。
- project.md / PROJECTS.md を archive/root-snapshot-20261029/ へ移動。
- docs/structure/ に正本の設計入口を新設。codex/tasks/ にCodex向け指示書を新設。
- 旧READMEの先頭にあった日付付き更新メモ（下記）をこのファイルへ移動。
- docs/structure/00〜09: 全体像、mii構造（Spatial Core＋表示層、3筐体）、RockstarOS（一つのOS＋hardware profile、account継続）、eSIM再定義（鍵付き回線・GBを売らない）、Eve→Noa→AMC→Jev とサービス書式、収益と1ヶ月/1年計画、名前の正本、議事録決定表、PDF指摘、リポ地図。
- codex/tasks/00〜40: 20件の指示書（archive・verify短縮・名前統一・drizzle統合・bot整理・Sky lib整理・eSIM 4件・mii 3件・account継続・profile・サービス3枚・Jennifer→AMC）。
- ルート `.ignore` を追加（archive/, docs/evidence/, workspaces/ 等を rg/fd の既定検索から外す。gitには残る）。docs/evidence/README.md を追加。
- scripts/check-product-baseline.mjs, check-sky.mjs, project-status.mjs, workspaces.mjs の project.md / PROJECTS.md 参照を archive パスへ。data/archived-paths.json に移動先を記録。
- 名前: Smith→Noa、Jennifer→AMCへ統合、avocadoMini→mii、Zema→Eve/Work（本文はtask 03/04で順次）。

## 2026-10-29 以前 — 旧README先頭の更新メモ（原文のまま、新しい順）

- Local Agent APIの保存済みAgent設定不一致は、既存の拒否を保ち、estimate/textと同じ `AGENT_SETTINGS_CHANGED` と元のstatusで返します。[応答・復旧契約](docs/rockstaros-complete-design.md#smith-local-agent-settings-rejection)。自動再実行や新しい権限は追加しません。
- 開発の全体窓口はRoot、保存・統合はGitへ集約します。次の新規作業はOS（料金・請求、Wallet、Game、eSIMの既存要件を含む）・Eve・Smith・miiを優先し、既存95unitの残件を保持します。着手済みProは検収・保存・統合まで閉じ、OSに含まれる上記要件を一律後回しにせず、専門ownerと共通契約を再利用します。非金融GameはWallet完成待ちにしません。その他の範囲外の独立拡張は後回しです。[現行運用](docs/workstreams/10-git-ci-operations.md#four-lane-priority-20261028)。
- Skyで追加したモデル・データ・アプリは「Eveで使う準備」から出典を確認し、「依頼を入力欄へ読み込む」で編集して送信できます。Eveの回答は「自分の担当を作る」から選び、役割を編集して確認保存します。取込だけでは送信・保存・実行されません。Tool・権限・費用はSmithと既存の実行確認で別に確かめます。
- Proの保存済み仕事は、WorkJob IDを確認して共通の本人画面へ開く[限定再開入口](docs/rockstaros-complete-design.md#pro-existing-job-resume)を用意しています。形式確認は存在・所有・実行同意の確認ではなく、現在の本人一覧外の古い仕事をexact GETで取得する機能は未実装です。
- 共有service accessの開発・検証は[全11lane portfolio](data/development-portfolio.json)と[Git運用](docs/workstreams/10-git-ci-operations.md#portfolio-delivery-20261028)を入口にします。eSIM/Pixelの回線・本人利用権・OS/client状態は独立し、現在のhost検査を実機/本番の合格へ換算しません。
- PR247でmain統合・同SHA CI確認済みの共通テキスト仕事とEve準備仕事では、応答不明時に同じbrowserで開き直して保存済みの同じ仕事・操作IDを確認できます。未保存原稿や同意は復元しません。未確認中は自動再送せず、Web Locksまたは保存機能が使えない環境では新規操作を止めます。[復旧条件](docs/rockstaros-complete-design.md#eve13-pending-recovery)。実認証browser・実機・公開側の受入は別です。
- Pro商品ページから、avoado.siの[既存私有テキスト仕事](https://avoado.si/zema/compose?tool=mr-citations)へ進む限定入口はPR246でmainへ反映済みです。linkはToolだけを選び、notesや私有archiveは送信しません。利用accountを確認して新しいtextを入力し、計画保存と別の素材保存同意を確認します。応答不明は同じ仕事/操作で照合し、手順間で停止しても保存原稿/成果を保持します。この接続済みsource-link処理のbudget0と、service・回線・他AI使用料は別です。[契約・復旧](docs/rockstaros-complete-design.md#pro-private-work-entry)。公開側の修正配備は未実施です。
- [PR245](https://github.com/k999ln/rock/pull/245)のSmith保存参照修正はmain `9cb9d148`へ統合済みで、同SHA全6CI・4workflowが成功しました。[現在の受入証拠](docs/evidence/development-execution/smith-session-main-current.json)を元capture receiptと分けて保存しています。
- Smithの保存会話では、既存UUIDまたはcatalog ToolのAgent参照を同じid/revisionで再保存し、別の会話やhandoffへ持ち越さない限定修正はPR245でmainへ反映済みです。復元だけで実行は再開せず、期限・本人・現在Agent・実行同意は既存の確認を通します。[保存と復旧の契約](docs/rockstaros-complete-design.md#smith-saved-agent-reference)。
- [PR244](https://github.com/k999ln/rock/pull/244)はmain `9f2bf146`へ統合済みで、同SHA全6CI・4workflowが成功しました。検収済み26ファイルとmainの内容一致、Linux全verifyの結果は[別current記録](docs/evidence/development-execution/esim-webops-main-current.json)に保存しています。公開側への配備は未実施です。
- 旧`https://avoado.si/install/`の互換入口は、固定`/connect`の利用開始案内へつなぎます。最終先へquery/fragmentを渡さず、本人確認・利用権・機種適合・費用の既存手順へ進みます。eSIMの初回開始は現在のsetup/利用権を保存時にも照合し、失効/競合時は起算せず同じworkspaceから再開します。[設計・復旧](docs/rockstaros-complete-design.md#esim-runtime-commit-authority)と[今回の限定候補・Git段階](docs/evidence/development-execution/esim-webops-main-adoption.json)を参照してください。公開側の修正配備は未実施です。
- PR242/243はmain `927ac79a`へ統合済みで、同SHA全6CI・4workflowが成功しています。PR242初回main `e7d458f2`の失敗は保持し、[別のcurrent記録](docs/evidence/development-execution/pr242-243-main-current.json)でforward-fix後の状態を確認できます。
- Proの私有原本archiveでは、保存結果が不明な間は新しいfileへ置き換えず「Read back same archive」で同じ保存IDを確認してください。本人確認中にcancelしても照合先だけを保持し、内容は隠します。再開には同じaccountの確認と別の保存同意が必要です。[復旧契約](docs/rockstaros-complete-design.md#pro-archive-unknown-recovery)。[PR242のmain初回verify失敗](docs/evidence/development-execution/billing-eve-os-game-main-current.json)を保持し、[PR243で修正・main統合・同SHA CI成功した現在の記録](docs/evidence/development-execution/pr242-243-main-current.json)を別に保存しています。
- Eveの見積条件を予算0の準備仕事へ渡す限定機能はPR242/243でmain統合・同SHA CI確認済みです。保存済の資料で見積もり、通貨と比較上限、別の準備同意を確認して「この条件で準備仕事を作成」へ進みます。原文は元の仕事へ保持し、新仕事の資料保存は別の保存同意後に行います。期限切れ時は元の仕事で見積もり直します。これは有料生成の承認や予約ではありません。[契約と復旧](docs/rockstaros-complete-design.md#eve-text-handoff)、[4候補の検収・Git段階](docs/evidence/development-execution/billing-eve-os-game-main-adoption.json)を参照してください。
- [PR225](https://github.com/k999ln/rock/pull/225)のzod修正はmain `f4ed492c`へ統合済みです。HEAD `dcf86f99`の全8CI、main統合SHAの全9CI（CodeQLを含む）が成功し、zod警告2件は解消しました。[最終検収・履歴](docs/evidence/development-execution/zod-security-constraint-review.json)をGit保存しています。root・MiniはZod4.6.7、shadcnは上流Zod4対応版4.22.1です。依存・schema互換性試験は `node --test tests/zod-dependency-security.test.mjs`。実機・追加推論・公開の実施は含みません。
- [PR207](https://github.com/k999ln/rock/pull/207)はmain `0d726717`へ通常統合済みで、同一SHAのCI6件成功を確認しました。公開・配備・616件一括公開は保留です。採用済みの[Wallet process復旧fixture](docs/sky-billing.md#wallet-process-recovery-fixture)は `node --experimental-strip-types --test tests/billing-process-recovery.test.mjs` で実行できます。合成local SQLiteの子processを13点で強制終了し、再接続・再送の一意性を検査します。POSIX限定でWindowsはskip。本番金融の受入ではありません。 [PR208](https://github.com/k999ln/rock/pull/208)はmain `2854d069`へ通常統合済みで、同mergeSHAの全6CIとLinux実verify（2911試験・2909pass・0fail・2skip）が成功しました。原本の記録時pendingと現在のGit受入を分けた[統合証拠](docs/evidence/development-execution/wallet-process-recovery-main-merge.json)を保存しています。
- Proの[私有原本archiveへの入口](docs/rockstaros-complete-design.md#pro-original-archive-entry)を限定候補へ追加。Proの「Move private notes safely」でpreview・別のfile export同意・downloadを行い、「Open private archive on avoado.si」から既存`/account/import/pro`へ進みます。sign in後に同fileを手動で選び直し、保存先accountと別の保存同意を確認します。原文は元browserとfileへ保持し、自動転送・仕事化・native移行は行いません。Chromeのlocal1512/390表示とpreview/cancelを限定確認。認証済server保存・公開先実click・配備は別gateです。Wallet DB復旧test-onlyはPR206/mainb1b0で限定統合済み。[11lane/95unit/履歴42成果の引継ぎ要約](docs/evidence/development-execution/all-lanes-main-handoff-summary.json)を参照してください。
- Walletの[DB復旧fixture](docs/sky-billing.md#wallet-legacy-db-recovery-fixture)をtest-only候補へ追加。`node --experimental-strip-types --test tests/billing-worker.test.mjs tests/earning-bridge.test.mjs tests/wallet-deposit-provenance.test.mjs`で、合成receiptのSQL中断/ack喪失後の同file再open・同key再送・上限照合を確認します。実Worker・料金・鍵・888ルール・default ToC holdは変更していません。実収益/認証端末/Cloudflare並行/本番金融は別受入です。Game host fixtureはPR205でmainへ限定統合済みです。
- Game作者向け[host fixture CLI](docs/game-api-contract-draft.md#game-creator-host-fixture)を限定候補へ追加。`node --experimental-strip-types scripts/game-creator-fixture.mjs --help`から、所有するprivate temp directoryで固定粒子sessionのstart/read/resumeを試せます。既存save形式で再開・同一retryを照合し、不明な保存やlockは自動削除しません。合成ownerのhostサンプルで、任意engine・認証owner保存・fullSDK・金融・実機・公開の受入ではありません。Eve見積onlyはPR204でmainへ限定統合済みです。
- 小型画面の[下部ナビ](docs/rockstaros-complete-design.md#smith-mobile-bottom-navigation)を限定候補へ更新。`npm run dev`のHomeや既存WorkspaceShellで、幅700px以下にSmith・Eve・コミュニティーの3入口を表示します。見つける／自分のSkyはHomeの「その他」メニューから開けます。入力中はナビを隠して入力を保ちます。限定local実UIを確認済みですが、実機keyboard・認証後composer・本番公開等は別受入です。Billing service最終claimはPR202でmainへ限定統合済みです。
- Cloud textの[最終service確認](docs/sky-billing.md#billing-required-service-authority)を限定候補へ追加。既存server設定がrequiredの場合は送信直前にも本人の有効な利用権と期限を確認します。previewは既存試験/legacy経路として区別し、結果不明時は予約を保持して自動再送しません。価格・設定値・schemaは変更していません。最終CI/独立採用検収・実Provider/課金/公開は別gateです。eSIM本文開示はPR201でmainへ限定統合済みです。
- Sky Linuxの[保存本文の読取確認](docs/rockstaros-complete-design.md#esim-owner-response-disclosure)を限定候補へ更新。既存の`/sky/linux`で、本人の保存データ読取と新しい実行許可を区別します。保存後に本文を確認できない場合は再実行せず最新状態を読み戻し、APIは既知commitのackと本文なしを区別して返します。独立保存ACL/期限・本番DB/auth・公開の受入は別です。Mini有限cone探索はPR200でmainへ限定統合済みです。
- Miniの[有限cone-aware探索](docs/rockstaros-avocado-mini-complete-design.md#mini02-cone-aware-search)をhost研究候補へ追加。既存の有限joint solverへinside edgeだけを渡し、found・finite impossible・unknown・unavailableを区別します。[研究APIと実行例](docs/avocado-mini-r5/factory-development/mini-02-cone-aware-search.md)からJSON入力で検査できます。物理出力・低眩しさ・眼安全・全域・停止・製造や公開の受入ではありません。Pro原本archiveはPR199でmainへ限定統合済みです。
- Pro原本archive候補はPR199で継続検証中です。既存の本人確認・保存同意・全bytes/SHA読戻し契約を保ち、test登録のlint互換修正を追加しました。新head CIと独立再検収が完了するまでmain採用は保留です。
- Proの[原本私有archive](docs/rockstaros-complete-design.md#pro-account-original-archive)を限定候補へ追加。`npm run dev`のローカルアプリで`/account/import/pro`を開き、Pro exportを選択してpreview・保存先account確認・別の保存同意を行います。保存後は読戻した全bytes/SHAを確認してdownloadします。既存Eve履歴の認証/暗号化keyring準備が必要です。仕事やモデルは実行しません。実account/browser/native・公開の受入は別です。Eve資料準備はPR198でmainへ限定統合済みです。
- Eveの[資料付き依頼保存](docs/rockstaros-complete-design.md#eve-text-preparation)を限定候補へ追加。`npm run dev`で起動したローカルアプリの`/os/eve/remix`から2つの文章を選ぶか入力し、goalを確認して準備・仕事保存・素材保存への同意・保存処理を進めます。同じ仕事から原文と成果を読み戻して確認します。無料の準備jobで、生成した草稿ではありません。未保存入力はtabを閉じると失われます。公開サイト/実browser/モデル生成の受入は別gateです。
- Billingの[最終send claim](docs/sky-billing.md#billing-final-send-claim)はPR196でmainへ限定統合済み。送信直前にcurrent parent/price/owner/held budgetを同じSQLで確認し、不明時は送信せずholdを保持します。既存料金・888c・台帳を変更しません。共通authority/issuer epoch・本番D1/実課金は未受入です。95台帳のGIT08 metadataはPR195でmain反映済み、本番配備/95whole受入とは区別します。
- [95unit再開台帳](data/development-unit-progress.json)と[handoff](data/development-source-handoff.json)をmain向けに同期。fixed9aの分類を保持し、PR194のeSIM限定採用は別overlayです。95全体の完了は0、Root旧80not_startedは現在の未実装数ではありません。次は実装中のBilling finalclaim、eSIM残gate、Eve02 bounded text。runtime/source/testは変更せず、metadata保存と本番公開は区別します。
- eSIM/Linuxの[保存時authority契約](docs/rockstaros-complete-design.md#esim-runtime-commit-authority)を限定採用候補へ更新。依頼の読取後に利用権/setup/reviewが変われば保存を拒否し、同一依頼の重複予約を防ぎます。本人の既存sessionによる保存データ読取と、新しい実行許可を区別します。汎用attachment・独立保存ACL期限・本番D1/実課金は未受入です。PR193はmain9a617fabへ統合済み、最終検証は同83aのLinux CI成功で、追加host全verify待ちではありません。
- Pixel Linuxの[worker診断・親寿命の候補](docs/rockstaros-complete-design.md#pixel-main-worker-diagnostics)と独立r2済み[Mini有限cone検査](docs/rockstaros-avocado-mini-complete-design.md#mini02-finite-cone-inspection)を別scopeで保存。旧jobの512tokens/180秒wall/170秒CPUを維持し、追加期限/token契約を厳密検証。任意私有診断は成功/停止・権限を変えません。新候補のLinux/実機・背景/P02全体/全OS・Mini実光学は別受入です。
- Pixel Linuxの[限定実機証拠要約](docs/evidence/development-execution/pixel-worker-diagnostics-physical-summary.json)を保存。1jobとPC/Pixel exportの一致を確認した範囲で、PC UI reload・背景実行・P02全体・全OSは未受入です。原文/私的state/鍵/モデル/APKは含めません。
- MINI-02の[有限同時光線割当](docs/avocado-mini-r5/factory-development/mini-02-joint-allocation.md)を採用。排他的poseと共有sourceの仮定内で証人/反例を返し、対象33試験と全verifyに合格したhost研究で、実光学・低眩しさ・全域・実viewer・停止・製造の受入ではありません。
- MINI-02の[固定domain光学study](docs/avocado-mini-r5/factory-development/mini-02-candidate-assessment.md)を採用。板膜なし・少ない表示部・上下全範囲・低眩しさを保持した対象20試験と固定候補全verify成功の有限幾何比較で、実光学・人体・同時viewer・PCB/製造は未受入です。
- Miniの場所条件検証、Pro私有ノートpreview/export、保全dialogのkeyboard/focus、保存済みAgent参照、Game静的導入診断の限定subsetを採用しています。対象69+Pro7と固定候補全verifyに合格。実機・実engine・認証server import・一般公開は別gateです。[設計](docs/rockstaros-complete-design.md#reviewed-client-game-subsets)／[main対応の開発引継ぎ](data/development-source-handoff.json)。
- Billing契約snapshot/月次draft binding、service access eligibility、Wallet署名fixture proposalのpure helperを採用しています。対象113試験と固定候補の全verifyに合格。既存画面/APIへは未接続です。新料金・実課金・残高変更・一般公開は有効にしていません。[設計と未受入gate](docs/rockstaros-complete-design.md#reviewed-service-contracts)／[採用証拠](docs/evidence/development-execution/service-contract-adoption.json)。

## 2026-10-29 以前 — 旧READMEの製品節にあった作業メモ（原文のまま。2026-11-02 に README から移動）

### Mini 節の冒頭メモ

Miniの[カメラ手指入力preview](systems/rock-star-os/targets/avocado-mini/gesture/README.md)は端末内追跡から表示の選択・移動・回転・取消だけを提案します。開始は本人操作とbrowserのcamera許可、停止/非表示/期限でtrackとworkerを閉じます。VIEW_ONLYの開発fixtureで、実空間の校正・実行承認・好み推定や実機精度の受入は別です。 model準備は対応するmacOS/LinuxのUID/O_NOFOLLOW/hardlinkを使い、既存対象を上書きしません。Windows等の未対応環境と旧残骸の手動確認条件は技術READMEを参照してください。

Miniの[開発用message service](systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)をPR238でmainへ限定採用。Broker/APの有限local入口・scheduler/停止・保存済み受信の確認を共通adapterへつなぎます。実製品identity、実modem/回線、Job取込み・実機の受入は別gateです。

日米のsi・メッセージ・小ファイル向け[共通message adapter](systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)を追加。有限分割・認証付き再組立・再送・TTL・共通通信量/料金予約をhostで検証する。実transport/常駐scheduler/Job引渡し・実機は未受入。Mini単体、表示4条件と既存料金gateを維持。 最新main同期の製品4/Pixel fixture2は固定検収hash一致、新host全verify3025件失敗0。[採用段階](docs/evidence/development-execution/mini-08-message-main-adoption.json)でheadCI/mainCIを原機能検収と別追跡。 Miniの共通message adapterはPR229/main a58c6ffaへ限定採用し、head全14CI・main全13CI成功。[現行受入](docs/evidence/development-execution/mini-08-message-main-current.json)。

[内蔵衛星modem・電池・回線候補と実機試験準備](docs/avocado-mini-r5/satellite-hardware-trial-plan.md)で比較条件とP0〜P5の記録項目を確認できます。 初期対象は日本・米国のsi／メッセージ／小ファイル通信に確定し、国別に検証します。実機通信・契約・閉箱携帯は未受入です。

衛星回線をWi-Fi共有する[制御prototype](systems/rock-star-os/targets/avocado-mini/tethering/README.md)を追加しました。`python3 -B systems/rock-star-os/targets/avocado-mini/tethering/demo.py` で、架空回線の接続許可・持ち出し・送受信量・料金上限・再起動復旧を試せます。実衛星/APはまだ接続していません。 host制御は[PR211](https://github.com/k999ln/rock/pull/211)でmain統合・同SHA全12CI成功。Linux制御も[PR212](https://github.com/k999ln/rock/pull/212)でmain `41ee45d7`へ統合し、同SHA全13CIの成功を確認しました。

[AP認証・網側上限adapter](systems/rock-star-os/targets/avocado-mini/tethering/ACCESS.md)を追加。 [PR215](https://github.com/k999ln/rock/pull/215)でmain `52b3d1d9`へ統合し、同SHA製品CI全13件成功。端末固有鍵と網側予約の確認後だけ転送を許可し、応答喪失や停止失敗を未確認として残します。事業者・modem未定の共通protocolで、実無線・実衛星・請求には未接続です。

Linux側の[転送制御と試験手順](systems/rock-star-os/targets/avocado-mini/tethering/LINUX.md)を追加。通常hostのcompiler試験と、使い捨てLinux VM上のroot namespace packet試験を分けて実行できます。Linux packet gate候補では、同一grantのIPv4/IPv6・送受信を共有quotaで強制し、停止・離脱・再起動時に旧許可を閉じる。隔離Linuxの実packet20件とcompiler4件に合格し、独立静的/host検収mustFix0。counterは最終確定とせず予約を保持する。実衛星/AP/Broker認証・Provider請求・電池の受入は別途必要。

### OS 節の冒頭メモ

Shellの[local capability観測](docs/rockstaros-complete-design.md#os02-capability-observation-freshness)は未来時刻・期限切れ・30秒超を未評価へ戻す修復をPR237でmainへ限定採用しました。host試験は `OS02_JAVA_HOME=<既存JDK17> python3 -m unittest tests.test_device_capability_freshness -v`。実機・全OSの受入は別gateです。

既存eSIM service setupの[provision再開fixture](docs/evidence/development-execution/esim-provision-recovery-main-adoption.json)は `node --experimental-strip-types --test tests/rockstar-service-setup.test.mjs` で検証します。file SQLiteの制御中断・明示再接続試験であり、実issuer・本番D1・電断・実課金の受入は別gateです。

### Eve 節の冒頭メモ

開発プレビューでは、Eveの「自分の担当を作る」で名前・目的・入力・期待成果を確認して保存し、続いて必要能力・Tool・PC実行先を選びます。Toolの入出力schemaと必須項目を希望と照らして確認します。Toolが追加の必須入力を求める場合は、担当の必要入力に追加してください。同じ担当でTool・実行先・入力・提供者申告の料金を確認してから仕事を作り、その後、別の実行内容の確認と承認を行うと、対応するToolの結果を同じ仕事に保存できます。料金申告は独立検証済みの見積ではなく、作成時の確認は実行許可ではありません。仕事の確認履歴では、作成時と実行直前の条件の違いを確認できます。旧仕事で記録がない場合は未記録と表示します。仕事の「mii連携のソフト試用」で同じ仕事を確認し、合成テキストを入力して「同じ仕事のTool確認へ渡す」を押すと、上のTool確認画面で引数を確認・承認できます。観測期限は30秒で、失効や停止要求時には古い表示を隠します。保存した仕事は残り、再表示には明示的な読直しが必要です。同じ仕事のソフト試用で「委任予算を読み直す」を押すと、既存A2Aの上限・予約・利用量記録を取得時点として確認できます。MCP料金や請求確定額ではなく、観測失効時は非表示になります。保存された応答はEveの仕事とmiiの両方で読み直せます。仕事からのTool実行は、既存`local-preview:` IDを設定した隔離loopback環境に限定され、通常account/eSIM・実mii・有料実行は未受入です。Tool結果は独立未検証として扱います。[契約と試験範囲](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

miiソフト試用の「追加の必要能力」には、例 `{"executor":["model.inference"],"output":["audio.render"]}` のように能力IDを指定できます。空欄なら追加条件なし。観測宣言が不足または未確認なら入力を渡さず、保存済みの仕事は引き続き読めます。宣言は実行承認や実機の証明ではありません。

作者向けSDK 0.1.5の非推論作例は、配布archiveを展開して能力宣言とToolの接続を試せます。通常のpackはdistをbuildし、旧0.1.3・0.1.4 archiveも維持します。[作例と設定手順](toolkits/sky-tool-sdk/README.md#非推論の追加例)。宣言は実行権限ではなく、公開や課金を開始しません。 合成hostではEve・Smithで作成した仕事をmiiで読み戻し、承認済みの別remote委任の停止・使用量を同じ仕事で検証しています。実機・本番の受入は別です。

既存担当に保存された対象物・希望入出力の設定は、Skyの設定画面で名前や役割を編集しても保持されます。これは実機接続や実行許可ではありません。[互換契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

Toolの能力確認では、接続先・Tool・申告版と観測日時・期限を確認できます。接続中の観測が期限切れの場合は「選択した実Toolを再確認」してください。接続先の宣言変更が検出された場合は接続画面で明示的に再接続し、内容を再照合・再承認してください。既存の仕事や結果は残ります。Tool申告は安全性や実行権限を保証しません。[照合契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

担当の能力確認では、項目名に加えて「期待する入力型」「期待する成果型」をJSON object（例 `{"text":"string"}`）で入力し、「必要な処理能力ID」をJSON配列、「許容permissionとscope」を `[{"permission":"network","scopes":["origin:example"]}]` のように明示します。「使用する接続と操作」で実Toolを選び、Toolと実行先を選択して宣言を照合・保存します。空欄は未指定、`{}` と `[]` は明示した空条件です。対象が必要なpermissionのscopeが空なら未確認になります。旧担当は新条件を本人が設定するまで未確認です。これは提供者の宣言の照合であり、権限・安全性・料金の保証ではありません。実行には別の確認と承認が必要です。[照合契約](docs/service-design/02-system-contracts.md#eve-smith-miiの同じ仕事)。

Eveの資料付き依頼はPR232でmainへ限定採用した2〜4資料対応です。「資料を追加」「資料Nを外す」で準備し、合計8,000文字以内で保存・復元・見積比較します。2資料の既存保存は互換維持。3・4資料は新版形式で、生成・課金は開始しません。[契約と残gate](docs/rockstaros-complete-design.md#eve-multi-material)。

Eveの[保存資料の料金見積](docs/rockstaros-complete-design.md#eve-saved-source-estimate)を限定候補へ追加。`npm run dev`の`/os/eve/remix`で2〜4資料と依頼を無料準備・保存・読戻し後、「保存した資料で料金を見積もる」から必要なmodel/通貨/比較上限を選び、別の資料利用同意後に「見積のみ確認」を押します。比較上限は未承認で、生成・費用承認・課金は行いません。信頼できる単価がなければ利用不可を表示します。実local UIの保存/復元・503確認は既存2資料の履歴です。採用前の3・4資料検証はhost/API/VMのみでした。その後、実Reactと合成API/RAMによる3・4資料の保存・復元、見積表示/自然失効、owner切替を追加観測し、独立documentary検収しました。[現行証拠](docs/evidence/development-execution/eve-multi-material-main-current.json)。実認証・本番保存・Provider利用の受入は別gateです。数値正常/期限はfixtureと区別し、最新mainのSmith navとの復元・表示切替・入力保持も限定確認しました。実Provider単価・本番認証/保存・本番見積/課金・公開は別gateです。初回CIが指摘したテスト表現1箇所を修正し、製品動作は維持しています。Smith navはPR203でmainへ限定統合済みです。

### Mini 節の開発状況

### 現在の開発状況

処理中も、同じ画面内の「メインコンテンツへ」から操作欄へ戻れるよう修復中です。別画面への移動抑止は維持し、仕事や料金状態を変更しません。局所試験と合成ブラウザーfixtureで確認し、source/metadata独立検収とhost全体verifyが成功し、Git保存・最終同SHA CIへ引き継いでいます。[検証範囲と残条件](docs/evidence/development-execution/smith-running-skip-link.json)。

[Mini公開サイト](https://avocadomini.si/)にR5と製品目的を掲載。ブラウザゲームとアイデア・ゲーム投稿の受付があります。製造承認は**保留中**で、R5実機試験の完了実績は0件です。

実機の表示・入力・通話・電源・熱・保存/復旧、地域での実証、建築施工は未受入。R5の価格・発売日は未確定で、予約・決済は停止中です。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

Material Inventionは2D候補比較とSky/Zema接続がある段階で、シミュレーション・実験室接続は未実装です。

### OS 節の開発状況（Game 下書き節を含む）

### 現在の開発状況

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。 eSIMサービス管理では、保存ackの後に現在の権限・同じ契約/実行を再読込できるまで操作を保留します。null・読込失敗・権限変更時は以前の私有情報や操作を隠し、「状態を再確認」でGETだけを行います。画面復帰時も再確認し、自動で申込・課金・再送しません。[契約と検収範囲](docs/rockstaros-complete-design.md#esim-ack-reconciliation)。

[PR209](https://github.com/k999ln/rock/pull/209)はmain `8f646ff3`へ通常統合済み。同一mergeSHAの製品CI7件成功、Linux実verify2938試験/2936成功/0失敗/2skipと専用Python cache6/update23を確認しました。8f時点のDependabot自動更新1件失敗は履歴として保持し、同8fの全check成功とは扱いません。後続PR216/main d2222dc5でundici制約修正を採用済みで、当時の別の自動更新失敗はzodで、後続PR225/main f4ed492cで制約修正を採用し、同SHAの製品7・自動更新2成功を確認しました。[現在の統合証拠](docs/evidence/development-execution/pixel-cache-main-merge.json)。PR213 UIはmain `2a9828b2`へ通常統合済みです。新c43 guardの限定実機試験と元codeへの復元は独立検収済みで、[PR223](https://github.com/k999ln/rock/pull/223)へ証拠保存済み（head2c0f3dfeの7CI成功）。追加証拠はPR223/main1ec70d62へ通常統合済み（採用head7e21の7CI、merge同SHA6CI成功）。端末は元code7fへ復元済みで、新c43の常設配備とは区別します。P02全体・全OS・実金融・一般公開は未受入、公開・配備・616一括公開は保留です。

PR218は検収済みhead2f737579（8CI成功）をmain7edbb9beへ通常統合し、同mergeSHAの8check成功（製品7/補助collect1）、Linux2993/2991pass/0fail/2skipを確認。PR225/mainf4の製品7・Dependabot2成功とZod修正を別証拠で確認した。root10/Mini2は旧監査snapshotで、後続PR225 receiptではroot7/Mini1（新規監査ではない）。原receiptの失敗・pendingは保持、公開/配備/616保留。 [現在の統合証拠](docs/evidence/development-execution/pixel-esim-prepared-work-main-merge.json)。

cache-only準備は取得済みbytesのversion/capabilitiesだけを確認し、原request/scope/model/hashに束縛した保存・再確認・取消を行います。不一致/不明時に取得・修復・推論へ切り替えず、同FDの限定metadata読込と固定payload更新fenceを使います。旧f3の限定物理測定/元code復旧は新c43の受入へ転用しません。[契約](docs/rockstaros-complete-design.md#pixel-cache-only-main-port)。

Web runtime、Linux/serviceとPixel/Lab adapterのコードをmainへ統合済み。Pixel 10 GL066 / frankelでは純正OS上の試験署名APKで非破壊の実再起動受入23/23が根拠です。

全OS build・正式署名・flash/boot・data/Keystore全損復元は未完了。[Pixelの境界](docs/phone-preview-20260911.md)。QEMU Developer Previewは独立した系列として保持し、最新候補の配布受入は[QEMU担当](docs/workstreams/06-native-qemu-release.md)で管理します。

eSIMは本人用Cloud Sky・Eve・Linuxサービスへの入口です。OS binaryをeSIMへ格納しません。既存OSのclient/browserと、機種ごとに署名・起動・復旧が受け入れられたnative OSを分けます。回線、SIM profile、利用権、client導入、OS導入も別の状態です。

<br>

### Game結果から仕事の下書きを作る

仕事画面で既存host fixtureのGame結果JSONと依頼を入力し、「仕事の下書きに入れる」で申告版・入力hash・目的を確認できます。取り込みだけでは保存せず、本人が「仕事を作成」を押して既存の未実行WorkJobへ保存します。入力/名前/templateの編集、破棄、本人scopeの再読込で古いGame下書きを無効にします。不明な保存結果は同じID/内容を明示確認し、自動再送しません。Game申告は完了・実行・予算承認になりません。[契約と検証範囲](docs/game-api-contract-draft.md#game-work-draft)。

### Eve 節の開発状況

### 現在の開発状況

PR213はmain `2a9828b2`へ通常統合済みで、採用head全7CIと同mergeSHAの製品CI6件成功を確認しました。[統合証拠](docs/evidence/development-execution/esim-eve-ui-main-merge.json)。 保存資料のEve料金見積では、各単価の「100万token当たり」を1回だけ表示します。見積・上限比較・有効期限の扱いは従来どおりで、この画面から有料実行は開始しません。

会話の明示保存・読戻し・削除と、本人の成果をHTMLへ持ち出すコードをmainへ統合済み。

アカウント履歴には本人認証と運営側の `EVE_HISTORY_KEYRING` 設定が必要で、設定不足を保存成功と表示しません。履歴を開いても仕事は再実行しません。

実アカウントの別端末引継ぎは未受入です。

保存・復旧コードの統合範囲は[統合記録](data/runtime-integration-audit.json)を参照してください。

### Sky 節の開発状況

### 現在の開発状況

投稿型Home/Sky、本人別保存、コミュニティーOSの版と鍵を扱うWebコードはmainへ統合済み。[総合・Sky入口](https://avoado.si/)があります。

実X投稿・独自For You・実MCP Providerの接続や、本番の料金・請求受入を一括で完了とは扱いません。[Web担当と公開記録](docs/workstreams/05-web-pwa-sites.md)。

機能の追加、商品の購入、仕事の実行、外部送信、課金は別の操作です。Cloud利用は事前見積・上限承認と明細を必要とし、許可済み予算を超えて実行しません。モデルの出力や作者の署名を権限承認へ昇格させません。mainと旧作業branchの料金案の差は[Git統合監査](docs/workstreams/10-git-ci-operations.md#redesign-thread-git)で別に照合します。

### Pro 節の開発状況

### 現在の開発状況

[Pro公開サイト](https://avocadopro.si/)で構成検討・保存・購入希望受付と事業目的を案内。最初の実機は銀色Lian Li A4-H2Oで試作する候補です。

実機組立・部品適合・供給契約・在庫確保・最終価格・決済・配送は未受入。半導体確保は事業目的であり、確保済みの実績ではありません。有料注文は開始していません。

公開した版と確認結果は[公開確認の記録](data/mini-pro-purpose-publication.json)に保存しています。

### 開発と検証 節

## 開発と検証

[eSIM復旧試験・Mini設計の現行受入](docs/evidence/development-execution/esim-mini-ready-design-main-current.json)はPR240/main c3c4845cへ通常統合済みです。head7/main6CI成功、Linux3075試験失敗0。PDF58頁はGit外、実開通/実課金・光学/PCB・実機/全体受入・公開は別gateです。

[eSIM ready復旧試験](docs/evidence/development-execution/esim-ready-recovery-review.json)は `node --experimental-strip-types --test tests/rockstar-service-setup.test.mjs` で実行します。制御中断後のSQLite再open試験で、実開通・実課金の受入ではありません。

[Mini空間OS設計v0.10](docs/avocado-mini-r5/spatial-computer-use-design.md)は `python3 docs/avocado-mini-r5/render-spatial-design.py output/pdf/avocado-mini-spatial-os-design.pdf` で再生成します。Python/reportlabと埋込可能な日本語TrueType fontを用意し、必要なら `MINI_PDF_JAPANESE_FONT` を指定します。PDFはGit外、旧local研究の参照可用性と採用済み実装は第1.2章で区別します。

準備済みPixel/Miniの[現行受入](docs/evidence/development-execution/prepared-device-mini-main-current.json)はPR238/main440fへ通常統合済みです。最終head14/main13CI、Linux3074試験失敗0・common103/packet26成功を確認。旧231/234は238経由の採用として区別し、元失敗・修復・検収receiptを保持します。Developer Previewの限定範囲で、実機・実回線・実camera精度・全OS・公開は別gateです。

Pixel診断の正常fixtureは、実empty観測からstdout出力を順序付けて時刻・hash・CPU・privacyのassertionを維持します。`python3 -B tests/test_pixel_worker_diagnostics.py` を入口とし、[独立検収と採用段階](docs/evidence/development-execution/pixel-empty-observation-main-adoption.json)でLinuxとhost、初回CI失敗と同SHA retryを分けます。OS237とSmith235の現行Git/CI受入は各current receiptに記録し、実機・全OS・公開は別gateです。

Gameの旧UI反例は固定main `ee9b88010c4ccb20be1db46177e3805380995c4b` を参照します。浅いcloneで検証する場合は `git fetch --no-tags --depth=1 origin ee9b88010c4ccb20be1db46177e3805380995c4b` で準備します。CIもこのcommitだけを取得し、旧WorkbenchのSHA256 `d93e120c16b86f136cada419a500a4b192e71319fafc597024bab701f6b7f6c2` を照合してから反例を実行します。

undiciはrootで修正版7系（`^7.30.1`）、Miniサイトで修正版8系（`^8.12.2`）をoverrideで許容し、各lockfileで実版を固定します。`npm ci` と `npm ci --prefix sites/avocado-mini` 後に `node --test tests/undici-dependency-security.test.mjs tests/undici-tls-options.test.mjs` で依存先とTLS設定の保持を確認できます。[修正・検証記録](docs/evidence/undici-security-constraint.json)。

Node.js 22.13以降とnpmを使用します。Webのローカル起動:

    npm ci
    npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
    npm run dev

Mini/ProのWebソースは [sites/avocado-mini](sites/avocado-mini/) に共通で保存します。正式ドメインのrootはWorkerで各製品へ振り分け、旧 `/mini/`・`/pro/` は正式URLへ転送します。

変更の検証:

    npm ci --prefix sites/avocado-mini
    npm run project:update
    npm run design:check
    npm run verify

実装の承認・受入gate、次の作業、検証結果は [project.md](archive/root-snapshot-20261029/project.md)、[進捗JSON](data/project-status.json)、[作業分野](docs/workstreams/README.md)を確認してください。[全タスクの進捗](archive/root-snapshot-20261029/project.md#全taskの作業進捗)も参照できます。作業数は製品の完成率を表しません。GitHub保存、mainへの統合、各サイトの配備は別に記録します。

### 権利と公開 節の開発者向けメモ

Development: the explicit offline D1 alias helper is documented in [Git operations](docs/workstreams/10-git-ci-operations.md#git-04-explicit-local-d1-filename-alias-compatibility). It does not perform remote migrations or complete the Root/main schema union.

The offline alias helper requires SQLite authorizer/serialize/deserialize APIs (tested Node26.12.1), reviewed reference profiles and a second independently reviewed candidate before adoption. It never executes source SQL during planning.

Repository verification (`npm run verify`) uses Node26.12.1, matching the verify workflow and the accepted offline SQLite helper API boundary. `package.json` retains the existing application engine floor; it does not declare older engines capable of the offline helper. Tests are not skipped to emulate missing authorizer/serialization APIs.

Offline apply now requires an owned private0700 parent for both source copy and backup, trusted directory ancestry and a single-link complete rollback-journal SQLite copy with no recovery/WAL sidecars. It does not repair or modify a live database into that state. Backup snapshot bytes are saved, synced and restored through one O_EXCL/no-follow fd, held through the guarded commit; detected namespace replacement/disappearance refuses the operation. Single-operator offline copies are the scope; arbitrary root/same-UID host code is not isolated by this helper.

開発者向け: PR248でmain統合・同SHA CI確認済みのservice attachment検証は、入力から分離したsnapshotを返します。フィールド・署名wire・API引数・TTLは維持し、object identityの同一性を前提にせずfieldを扱います。成功値をdispatch許可にせず、現在factsと既存atomic gateを確認してください。[契約](docs/rockstaros-complete-design.md#esim-attachment-async-binding)。

開発の現在primaryはmiiの成立判断1件です。実行queueと所有・証拠段階は[data/development-model-routing.json](data/development-model-routing.json)のcurrentExecution、運用と残gateは[Git作業入口](docs/workstreams/10-git-ci-operations.md#execution-recovery-20261028)を参照してください。`npm run mission:check`は宣言の矛盾を拒否しますが、実GitHub/物理受入の証明は独立検収で確認します。
