# RockstarOS — 事業・設計・進捗

## 2026-09-20 — avocadoMini製品外観とセンサー説明の再設計

利用者が公開画面の製品外観と説明の弱さを指摘したため、P0.2の細い三段伸縮ボディと円形ベースに合わせてサテン仕上げの構想画像を新規制作し、正面・側面・背面・センサー接写・4本構成の場面を統一した。青い窓は本体に埋め込み、上部3眼による手や物体の取得と起動時前方180度の順次走査を説明する。下部窓は床に近い設置面を補う追加案であり、P0.2未定義の構成・性能として明示する。CGの光と空間表示は機能説明の演出で、実機性能の証拠とは扱わない。スクロール中に説明が薄くなる表示不具合を修正し、デスクトップ1280pxとスマートフォン390pxで製品全景・センサー説明・重なりを目視確認した。回転中の円形ベースは脚収納時の意匠と明記し、脚の接地確認は安全制御の説明に残す。GitHub main `c4ac5826f37f77f95749bf0e89b71e10179c7beb`へ反映し、製品Site v11（source `64c16bc3ea0f1ff0c66cccaa757463551cb0f30c`）を公開してスマホ画面で新画像と説明を確認した。並行して入った別機能の新規DB table分類漏れにより同commitの全体CIは失敗したため、分類と台帳を修正中。

## 2026-09-20 — Motion Tower上下の青いセンサーカメラ外観案

利用者の新しい明示指示により、公開avocadoMini製品ページの回転区間を写実的な構想レンダリングに差し替えた。正面・側面・背面に同じ銀色の伸縮タワーを用い、上部と下部の青いセンサーカメラがスクロールに合わせて点灯する。4本のタワーが作業空間を捉え、Edge Hubへ情報を集める様子を続く全画面シーンで説明する。「すべては、空間のために。」より上の製品紹介構成と、一周後にのみ参考価格を出す流れを維持した。P0.2設計書で定義済みのカメラは各塔上部3基であり、下部のカメラ数・構成・性能は新しい外観構想で未確定。青い光・走査線は動作を伝える演出で、実機写真や性能検証ではない。デスクトップ1280pxとスマートフォン390pxで製品全体、上下の点灯、価格、次のシーンを目視確認し、静的buildとbaseline検査を通した。GitHub main `0903908d3542f4dece4a12403431f27520f1856a`の全体CIは成功。製品Site版v10（source `30db6fdcf1c5003dec287bb127edcdf28beaa1bd`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備し、公開画面で上下センサーの新しい説明と画像要素を確認した。ローカル全体verifyは既存のNode試験停止で中断し、CIを全体合格の根拠とする。

## 2026-09-20 — 回転しながら能力を伝えるavocadoMiniツアー

公開製品ページの「すべては、空間のために。」より上を維持し、その下のMotion Tower全周回転区間を更新した。利用者が示したスクロール案を参考に、1本のP0.2構想モデルが章に合わせて左右へ移動し、角度・傾き・大きさ・背景が連動する。文章は重ねずに切り替え、4本・計12基のカメラ、起動時180度走査、収納850mm／自立最大1,200mm／ドックまたは床ラッチ検出時のみ1,800mm、独立安全制御、Edge HubとRockstarOSの役割を利用者に伝える。実測性能や販売開始は主張しない。一周後にだけキット目標価格税込41万円を表示する。デスクトップ1280pxとスマホ390pxで各章、全周回転、価格の表示を確認した。GitHub main `3bba62732171deee7980520154f2c074df0feca3`の全体CIは成功。製品Site版v9（source `d607693030aff7b747782effaba6d98c3e658ffe`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備し、公開画面で新しい導入文言を確認した。ローカル全体verifyは既存のNode試験停止で中断したため、合格の根拠はGitHub CIとする。

## 2026-09-20 — P0.2設計書に合わせたavocadoMini製品紹介

利用者が提供した「RockstarOS Motion Tower P0 Engineering Package v2」を製品説明の新しい基準として採用した。従来の単体タワー画像に基づく160 mmベース、無条件の1,800 mm伸長、41万円の単体価格という誤解を修正。公開製品ページとGitHub冒頭は、4本のMotion Towerと1台のEdge Hubからなるキット、税込41万円のキット目標、自立時1,200 mm／ドックまたは床ラッチ検出時のみ1,800 mmと説明する。カメラは各塔3基、ARは外部表示、LLMは案内と説明のみ。設計書は見積り・試作・検証のためのP0.2で量産リリースではない。公開ページを全画面ヒーロー、横送りハイライト、1本の全周回転、キット価格、OS導入の順に再構成した。提供設計書自体は公開リポジトリに入れない。デスクトップとモバイル幅の公開画面で4本とEdge Hub、章構成、価格表示を確認した。製品Site版v8（source `e88bef941b17abaa1baa06876e12f4f61f03f1ef`）を`https://avocado-mini.kirin-999.chatgpt.site`へ配備済み。GitHub main `1a29a163979d3c8319c55b7c9c6829f79cb0ade6`の全体CIも成功した。

## 2026-09-20 — 製品を一周しながら機能を説明する全画面ツアー

avocadoMiniの公開商品ページで、スクロール中に製品を画面内へ固定する区間を6画面分に延ばした。立体モデルの回転と同期し、導入、センサー、三段伸縮、ベースの長押し操作、RockstarOS連携構想を一画面ずつ説明する。最後に360度へ達した後だけ希望参考価格41万円を表示する。製品の販売開始、実機性能、OS連携完成を示す文言にはしない。デスクトップと390px幅のブラウザで各章の切替、重なりの解消、最終価格を確認した。GitHub main `5734211cd8630db95232b5328165d721a12347e8`のCIは成功し、同sourceのSite版v6 (`545b71e2ad6319211bfdebf4b49efd97330ea195`)を`https://avocado-mini.kirin-999.chatgpt.site`へ配備して公開画面の回転・説明切替を確認した。ローカル全体verifyは既存のNode test停止で中断したが、同SHAのGitHub全体CIは成功した。

## 2026-09-20 — avocadoMiniの商品ページを映像的な見せ方へ更新

Appleの製品紹介ページの構図とスクロール体験を参考に、公開avocadoMini Siteの冒頭を製品が主役の全画面ビジュアルへ変更した。利用者提供の構想図に基づく独自レンダリングを使用し、実機写真とは区別する。次の画面でタワーをスクロールに合わせて360度回し、一周後に希望参考価格41万円と購入準備中を表示する。ベースとセンサーの接写、寸法、OS導入ガイドへ続く。デスクトップと390px幅のブラウザで、冒頭、立体表示、価格出現、接写を確認した。GitHub main `8c9d11ba7c92d2c77a33d8b9c35a865d4b5c0dc8`のCIは成功し、同sourceのSite版v5 (`0c56755db5121e94087129e0d263af64c0fcefe7`)を`https://avocado-mini.kirin-999.chatgpt.site`へ配備して公開画面を確認した。ローカル全体verifyは既存のNode test停止で中断したが、GitHubの同SHAの全体CIは成功した。旧noellesugar1 URLの転用とOS画面の管理者限定移行は所有アカウントの接続が必要で、旧Site取得は引き続きNOT_FOUND。今回のデザイン更新の合格とは分ける。

## 2026-09-20 — 旧URLを公開商品Siteへ転用し、OS画面は別Siteへ移す

利用者は`rockstaros-kaiya.noellesugar1.chatgpt.site`をavocadoMiniの一般公開商品サイトにし、`/rockstaros`を商品ページにする方針を選んだ。OS操作画面のみ別Siteへ移し、管理者限定にする。商品Siteには`/`と`/rockstaros`の入口、公開導入ガイド、クラファン構想だけを置く。現在は同じ商品sourceのプレビューを別ドメインで公開済み。旧SiteはこのタスクのSites接続でNOT_FOUNDのため、転用と旧OS画面の公開停止は未実施。OS側の新Site・DB・認証の移行も未実施。旧Siteの所有アカウント接続後に、旧URLへ商品sourceを配備し、旧OSを安全に移す。最新sourceはGitHub mainへ反映し、独立Siteの公開版では360度回転と参考価格の出現をブラウザ確認済み。静的build・型検査・対象Webテスト14件は合格。全体verifyは多数のNode試験が停止したため中断し、全体PASSとは扱わない。

## 2026-09-20 — Apple参考のavocadoMini製品ストーリー

利用者指定のApple製品紹介ページを参考に、avocadoMiniの公開製品Siteと`/rockstaros`のsourceを、暗い製品ヒーロー、スクロール連動のタワー360度表示、一周後の41万円の参考価格、設計画像、3場面の体験、OS導入案内へ続く構成に更新した。製品名と高性能LLM搭載目標を冒頭で示す。実機販売と一般向けインストーラーは未開始。製品Siteは別ドメインで公開し、旧`noellesugar1` SiteはOS利用画面として管理者限定にする方針を維持する。旧Siteへの配備とアクセス制限は所有Sitesアカウントの接続がないため未完了。更新後のローカルbuildと表示、公開版のURL・価格出現、GitHub mainとCIを確認する。

## 2026-09-20 — 別ドメインの製品Siteと管理者専用OS Site

利用者はavocadoMini製品サイトとOSのWeb利用画面を別ドメインに分け、後者を管理者限定にすることを確定した。公開製品Siteの独立した静的sourceを`sites/avocado-mini`へ作成。製品の360度スクロール、希望参考価格41万円、購入準備中、公開OS導入ガイド、募集前クラファン企画を含む。OS利用画面とその内部サービスへのリンクはない。ローカルbuild、3ページのブラウザ表示、360度到達後の価格表示を確認。製品Siteの別ドメイン`https://avocado-mini.kirin-999.chatgpt.site`を一般公開し、実URLの製品ホーム、導入ガイド、クラファン構想をブラウザで確認した。既存OS Siteは所有するnoellesugar1 workspaceが現在のSites接続から見つからず、管理者限定への変更は未実施で、一般閲覧可能な旧版が残る。

## 2026-09-20 — 製品ホームとOSホームの公開境界

利用者は、ルート`/`をRockstarOSの利用画面、`/rockstaros`をavocadoMini製品ホームとして区別し、OS未導入者がルートへ直接入れる状態を問題とした。製品ホームからOS内部の8領域と開発者SDKの詳細を外し、OSホームへの直リンクを削除した。スクロール体験の後段も製品の寸法と参考画像、OS導入案内の順に独立した節へ分けた。OS導入ガイドへの入口は維持し、ガイドから製品ホームへ戻るようにした。これは文言と導線の整理であり、同一Site内のルートへの直接アクセスはまだ遮断できていない。製品ホームの別Site化、または検証可能な導入状態に基づく制限が残る。既存Siteへの配備も所有アカウント未接続のため未実施。

## 2026-09-20 — 伸縮式センサータワーを主役にした製品ページ

利用者提供のFull-scale構想図を製品形状の基準にし、先に作った作業台の3D模型を三段伸縮の銀色センサータワーへ置き換えた。Appleの製品紹介ページを参考に、淡い背景、製品を大きく見せる固定画面、スクロール連動の360度回転、価格表示、次のOS導入画面、主な構想寸法、製品内ナビを整えた。提供画像をサイトとGitHubの主画像に使用する。従来の四方向センサーと作業台は複数タワーを使うシステム案として扱い、外観、寸法、販売の確定を主張しない。ローカルの実画面でタワー表示、スクロール360度、価格、OS導入、構想図を確認した。型・製品lint・Web build・bundleとasset検査を実施し、GitHub mainへ反映した後に同一commitのCIを確認する。

## 2026-09-20 — 製品を一周見るスクロール体験

`/rockstaros`の最初の画面をavocadoMiniの立体構想モデルへ変更した。スクロールで360度回転し、完了後に希望参考価格41万円と購入ボタンを表示する。販売・予約・決済は未開始なので購入ボタンは準備中とし、クラファン企画へ進める。次の画面にOS導入案内へのボタンを置き、Developer Previewと一般向けインストーラー未公開を明記した。既存の8領域と開発者入口は後段に残す。WebGLが使えない環境には構想画像を表示する。実機映像ではなく設計イメージ。既存Siteは一般閲覧を確認したが、所有アカウントへの接続ができるまで最新版を配備できない。型・製品lint・Web build・bundleとassetの検査、ブラウザでの360度表示と導線確認は合格。全体verifyは既存のNode全体試験が止まり中断したため、全体PASSとは扱わない。Three.js追加に伴う依存license台帳を更新した。

## 2026-09-19 — 製品・OS導入ホームに利用領域の入口を追加

利用者の指摘で、`/rockstaros`はavocadoMiniとOSの説明に偏り、アプリやOSの中の各サービスで何ができるかを十分に案内できていないと確認した。Sky、Zema／Work、Material Invention、Wallet、Market、CSV、開発者、OS導入の8領域を、役割・現在の制限・既存画面へのリンク付きで追加した。開発者ボタンがMaterial Studioの旧配信URLへ向いていた誤りも、ローカルの`/sky/publish`へ修正した。製品・導入ホームを入口にし、各機能の実装状態は変えない。Sites所有アカウントには現在も接続できず、公開URLのアクセス拒否と最新版未配備は残る。

型、製品lint、Web build、製品ベース、進捗整合は合格。ローカル`/rockstaros`と8つのリンク先すべてHTTP 200で、製品ページの見出し・領域カード・リンク先をブラウザ表示で確認した。`npm run verify`は既存の全Nodeテストで出力が止まり中断したため、ローカル全体PASSとは扱わない。GitHub mainの同一commit CIを確認する。既存Siteへの配備と本番DB読戻しは別途必要。

## 2026-09-19 — 三つの製品入口とavocadoMiniの参考価格を明示

利用者は、製品紹介とOS導入を兼ねるホームページ、アプリ、OS本体を最上位の入口とし、Skyなどをアプリ／OS内のサービスと位置付けた。製品ページとGitHub READMEの案内順、製品関係図、ベースラインへ反映した。既存ルートは製品・導入ホーム`/rockstaros`、WebアプリHome`/`、OS Developer Preview導入案内`/rockstaros/guide`。配信先の一般公開と最新版配備は未実施。

avocadoMiniの製品メッセージを「考える時間を、つくる時間に」とし、希望参考価格41万円を表示。高性能LLM搭載RockstarOSによるスムーズな作業は製品目標として記載し、現行の固定モデル実機Previewと区別した。41万円はハードウェアの目安で、確定販売価格、予約金額、OS従量料金ではない。原価、実機性能、販売条件は試作後に検証する。製品サイトに`/rockstaros/crowdfunding`の募集前企画ページを追加し、製品ページから進めるようにした。支援募集・決済の機能はない。

`project:check`、`baseline:check`、`design:check`、型、製品lint、Web build、両ページのローカルHTTP 200と画面表示は合格。`npm run verify`は既存の全Nodeテストで進まなくなり中断したため全体PASSとは扱わない。Sites一覧では配信先`rockstaros-kaiya.noellesugar1.chatgpt.site`のprojectが現在の接続アカウントに見つからず、既存URLの最新版配備と公開変更は未実施。次にGitHub main反映と同一SHAのCIを確認する。

## 2026-09-19 — クラファン企画案を追加

avocadoMiniのクラウドファンディング企画案を作成し、README冒頭から到達できるようにした。日本の起案者要件を満たす場合はCAMPFIREのAll-or-Nothingで小型Bench試作・検証を対象にする案を提示。Kickstarterのハードウェア募集は稼働する試作機が必要なため現段階では選ばない。募集主体、受取先、予算、返礼、募集ページは未定。支援金の受け付けは開始していない。Rockリポジトリ自体はprivateであり、外部支援者には現在のGitHub文書を公開できない。WEB09は実募集リンク設置まで進行中のままとする。

検証は`project:check`、`baseline:check`、`git diff --check`、追加文書のローカルリンク存在確認を通過した。`npm run verify`は`typecheck`と`lint:product`まで通過したが、既存の全Nodeテストが途中で進まなくなり中断したため、全体PASSとは記録しない。次はGitHubの`main`へ反映し、同一commitのCIと表示を確認する。

## 2026-09-19 — GitHub READMEの先頭をavocadoMini製品紹介へ修正

利用者の指摘により、GitHubの冒頭がSky／Zemaのアニメーションから始まり、主役に決めたハードウェア製品と構想参考画像が見えない問題を修正した。avocadoMiniの目的、外観設計画像、手で候補を比べる体験、利用場面の参考画像、開発段階を先に配置し、RockstarOSとアプリの説明をその後へ移した。製品別GIFも会社説明より前へ移し、構想画像・動くジャケット・開発状況・クラファン・アプリへの案内を冒頭へ加えた。画像は実機写真でも完成機能の証拠でもないと明記する。クラファンの募集URLはリポジトリと公開検索から確認できず、企画案を作成して導線にした。実募集リンクは募集開始後に設置する。

## 2026-09-19 — 製品別の動くジャケットをGitHub全体へ追加

READMEの製品体系に、avocadoMini、RockstarOS、Sky、Zema、Material Invention Studioそれぞれの正方形GIFを配置した。落ち着いたループと製品別の色・図形で役割を伝える。avocadoMiniには「設計中」を表示し、画面で示す機能の完成やSite一般公開を主張しない。5枚とも420×420、24フレーム、無限ループのGIFであり、異なるフレームがあることを確認した。`project:check`、`baseline:check`、`git diff --check`は合格。`verify`は既存のNode全体試験で出力が止まり中断したため、全体合格とは扱わない。次はGitHubの`main`へ反映し、各GIFの読込みと同一commitのCIを確認する。

## 2026-09-19 — GitHub冒頭に製品紹介GIFを追加

READMEのタイトル直下に、Skyで探す、Zemaで進める、Studioで試す流れを示すアニメーションGIFを追加した。avocadoMiniは設計中と明記し、実機が完成しているようには見せない。GIFは960×360、27フレーム、3.6秒でループする。`project:check`と`baseline:check`は合格。`verify`は既存のNode全体試験で出力が止まり中断したため、全体合格とは扱わない。次はGitHubの`main`へ反映し、README上の表示と同一commitのCIを確認する。

## 2026-09-19 — 既存Webサイトの一般公開とバックエンド受入を依頼

利用者は既存の`rockstaros-kaiya.noellesugar1.chatgpt.site`を一般公開し、バックエンドも実際に動くよう依頼した。Sites所有アカウントへの接続を選択した。現在の接続では対象projectが`project_not_found`で、匿名HTTPは製品紹介・公開Registryとも401だった。公開設定変更、配備、D1本番readbackは未実施。コード側では公開・匿名で使える`/api/health`を追加し、Worker／D1の主要tableを照合する。システム診断は認証401だけでAPI正常と判定しない。本人別保存・Wallet・開発者操作はChatGPTサインインを維持し、各画面のサインインリンクをSitesの最上位遷移へ統一する。ローカル合成利用者のWorker／D1 API試験は149 assertionで合格済みだが、本番サイトの成功証拠ではない。共有`node_modules`の実パスをWeb bundle台帳へ正しく対応させ、build、bundle 122 component、asset 78参照（欠落0）の検査に成功した。次は所有アカウントへ接続して既存配信sourceとDB履歴を照合し、同一commit配備、公開設定変更、匿名と認証後の実応答を確認する。自作部分の製品license条件は未確定として別gateに残す。

## 2026-09-19 — 利用者にとっての役割を先に伝える

利用者の追加指示により、RockstarOSの売りを収益方法ではなく「やりたいことに役立つAIと道具を見つけ、前に進める」に変更した。GitHub冒頭と`/rockstaros`のhero・導線を、Skyで探す、Zemaで進める、Studioで試す流れへ改訂。avocadoMiniを発明の候補を手で考える主役の構想として維持し、料金方針は製品価値の後段の正本へ残す。実機・一般公開・全機能の完成は主張しない。

## 2026-09-19 — サービス・OS・ホーム・アプリへの入口を明示

利用者が直接開けるよう、GitHub READMEに本人限定Siteの製品紹介、OS Developer Previewガイド、Home、Sky、Zema、Wallet、Market、Material Invention Studioのリンクを追加し、製品紹介ページにも主要アプリへの導線を追加した。既存Siteはサインイン画面まで確認したが、現在のSites接続から配信projectを取得できないため、GitHub mainと配信版の一致は未確認。ログイン後の実操作も未確認。WEB06は入口のsource整備後も配信・実操作確認まで進行中とする。

`project:check`、`baseline:check`、型、lint、route style 12件、production buildは合格。`verify`はNode全体試験中に出力が止まったため中断し、全体合格とは扱わない。GitHub側の同一commit CIで追加確認する。

## 2026-09-19 — 無料配布とOS従量課金の理念を記録

利用者の新しい方針は「無料で配布し、OSは従量課金制」。配布時の価格とOS利用時の料金を分ける。avocadoMini本体が無料配布の対象か、利用量の計量単位、単価・上限、外部実費の負担は未確定として確認待ちにする。現在のSky収益連動・月最大888 cents精算は別の実装条件であり、新しいOS従量課金が動作・請求済みとは表示しない。

## 2026-09-19 — ハードウェア製品を事業の表看板にする

利用者の決定により、GitHub冒頭と`/rockstaros`紹介ページではavocadoMiniを最初のハードウェア製品構想として先に示し、RockstarOS、LLM、Sky／Zemaをそれを支える技術基盤として説明する。OS Home `/` は作業画面として維持する。avocadoMiniは詳細設計段階で、実機試作、量産、販売は未実施。Pixel 10は開発用reference端末であり自社製品として扱わない。税務上の効果は製品説明へ記載せず、事業の表示変更から税務判断を導かない。

## 2026-09-18 — avocadoMini Full-scaleハードウェア詳細設計を追加

添付concept画像と既存の四方向sensor設計を、試作へ渡せる[ハードウェア詳細設計](docs/avocado-mini-hardware-design.md)へ具体化した。本体3.0 m × 1.7 m級、作業面2.4 m × 1.2 m級の初期budgetを維持し、機構、8〜12 optical viewpoint候補、sensor pod、AR／2D／haptic、GPU／network／storage、5 kVA級の初期電源budget、約4.6 kW peakの熱、hardwire privacy indicator、校正、degraded mode、preliminary BOM、14項目のHVTを定義した。

設計を目で確認できるよう、[全体構成](docs/assets/avocado-mini-hardware-00-overview.png)、[sensor pod分解図](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded.png)、[Full-scale chassis分解図](docs/assets/avocado-mini-hardware-02-chassis-exploded.png)、[電源・制御・haptic構成図](docs/assets/avocado-mini-hardware-03-power-control-haptic.png)を追加した。校正カードは実測証拠に見えないよう`SAMPLE／未校正`へ固定した。

同じ部品構成を維持したv2では、黒チタン、スモークガラス、細いcyan data line、amber safety line、広い余白、editorial gridへvisual systemを統一した。[v2全体構成](docs/assets/avocado-mini-hardware-00-overview-v2.png)、[v2 sensor pod](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded-v2.png)、[v2 chassis](docs/assets/avocado-mini-hardware-02-chassis-exploded-v2.png)、[v2 power／control／haptic](docs/assets/avocado-mini-hardware-03-power-control-haptic-v2.png)を設計書の標準表示へ採用した。v1は比較用に保持する。

利用者の追加指示により、v3では外観を「ただのsilver tube」へ単純化した。四方向podは黒い光学slitだけを持つ横長の銀筒、mastとframeは丸い銀pipe、露出rackは長い円筒service spineへ置換し、配線をtube内部へ収める。[v3全体](docs/assets/avocado-mini-hardware-00-overview-v3-silver-tube.png)、[v3 sensor pod分解](docs/assets/avocado-mini-hardware-01-sensor-pod-v3-silver-tube.png)、[v3 tubular chassis分解](docs/assets/avocado-mini-hardware-02-chassis-v3-silver-tube.png)を標準外観mockへ更新した。内部の安全・privacy・電源境界はv2から変更しない。

v4では同じ構成をさらに細径化し、frame φ45 mm、mast φ50 mm、sensor bar φ65 mm、service spine φ160 mmを外観mockの初期比率とした。[v4全体](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png)、[v4 sensor pod](docs/assets/avocado-mini-hardware-01-sensor-pod-v4-thin-tube.png)、[v4 chassis](docs/assets/avocado-mini-hardware-02-chassis-v4-thin-tube.png)へ標準表示を更新した。数値は意匠とpackage成立性を比較するためのPreliminary Mockで、強度・熱・光学の実測前に製造寸法へ固定しない。

自由空間hologram、追跡精度、部品、法規適合を完成扱いにせず、最初は2D／ARと四方向Benchで誤commit 0、raw映像非保存、pod欠落時commit禁止を測る。hardware設計はMAT04の設計証拠へ追加したが、MAT06の実機prototypeは未着手のまま維持する。

検証は`project:check`、`design:check`、`baseline:check`、`git diff --check`とMaterial／製品ベース／Patent AIの関連17 testが合格した。`npm run verify`はrelease、設計、構成、型、lintまで進み、全Node test runnerが新しい出力を返さない状態になったため約1分後に中断した。全体PASSとは記録せず、今回の文書変更に直接関係する検査結果と分ける。

## 2026-09-18 — avocadoMiniをビリヤード台規模のFull-scale発明台へ拡張

利用者の明示指示により、四方向sensorを使う空間発明端末の最終製品目標を、ビリヤード台ほどの幅へ具体化した。[端末・interaction設計](docs/avocado-mini-spatial-invention.md)へ、本体約3.0 m × 1.7 m × 高さ0.9 m、有効操作領域約2.4 m × 1.2 m × 高さ1.3 mの初期budget、1〜2人操作、各方向2〜3光学viewpoint、表示と触覚の段階、安全境界を追加した。

[初期四方向concept](docs/assets/rockstaros-spatial-table-v1.png)と[Full-scale concept](docs/assets/rockstaros-spatial-table-full-scale-v2.png)をGit管理へ追加した。画像は設計意図とscaleの資料で、実機完成、裸眼3D、空間全域の追跡精度、硬い反力を証明しない。MAT04の設計証拠へ画像を加え、MAT06をBench合格後にFull-scaleへ進む実機prototype taskとして更新した。Jev／TypeSafe＋Local Qwen引き継ぎ原文は既存の`docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md`にすでに保存済みであり、重複文書は追加していない。

## 2026-09-18 — Jev ecosystem 10件を役割分離してSkyへ追加

利用者指定URLの重複を除く10 repositoryを確認し、既存Jev UltrafastにOpenJev、Jevlike、Jev Trader、Awesome Jev by TypeSafe、TypeSafe Computer Use、Jev Review、Jev Router、Jev Browser、Mobile Jevを加えた。Skyはready 11件を維持し、candidate 13件、合計24 Toolとなった。

[Jev ecosystem全体詳細設計](docs/jev-ecosystem-integration-design.md)で、decision model、browser、Mac操作、Android操作、code review、model routing、市場研究、referenceを別Tool／別権限へ分けた。Jev Traderは固定replayとPAPERだけ、Mobile Jevはwipe可能な隔離試験端末だけ、TypeSafe Computer Useは専用macOS accountのobserveから開始する。秘密鍵、実注文、個人端末、決済、予約、投稿、自動mergeは許可しない。今回の完了は調査、candidate catalog、全体／個別設計、台帳同期までで、source取得、install、API key、model download、runtime実行は未実施。

## 2026-09-18 — Jev UltrafastをSkyのbrowser agent候補へ追加

`browser-use/jev-ultrafast`の公開仕様とMIT licenseを確認し、Sky catalogの4件目の導入候補`jev-ultrafast`として登録した。[統合詳細設計](docs/jev-ultrafast-integration-design.md)では、専用Chrome profile、一仕事一tab、origin allowlist、`observe`／`prepare`／`act`、有限操作、秘密入力拒否、外部作用直前の一回承認、完了の独立検証、通信断後の二重操作防止、保存・削除・rollback、採用gateを固定した。

この追加は設計とcandidate表示まで。source取得、依存導入、TypeSafe／text model API接続、Browser Broker／MCP adapter、Chrome操作、実site受入はまだ行っていない。11 ready Toolは変えず、candidateを4件へ更新した。

## 2026-09-18 — OS本体から全Toolまでの詳細設計体系を正本化

avocadoMiniだけの設計ではRockstarOS全体へ合流できないため、[全設計ポータル](docs/rockstaros-design-portal.md)、[OS全体詳細設計](docs/rockstaros-complete-design.md)、[Sky／Zema／全Tool詳細設計](docs/sky-tools-complete-design.md)を追加した。Web／PC、Linux／QEMU、Android／Pixelを別環境として説明し、identity、capability、仕事状態、Local AI、記憶、実行場所、外部作用、artifact／receipt、保存、backup、update、UI、Wallet、security、DSP、運用、失敗、受入を一つの依存方向へ統合した。

Tool詳細は現在Skyの11 ready、13 candidate、native 6 familyを同じ書式で説明する。機械可読の[設計被覆台帳](data/design-document-index.json)と`npm run design:check`を追加し、catalogへToolを増やして詳細設計を追加しない変更、存在しない正本、未決定を無条件完成とする表現を失敗させる。これは現scopeの説明被覆であり、Pixel OS image、一般Tool sandbox、実Provider、avocadoMini実機等の未実装を完成へ変更しない。

## 2026-09-18 — 空間発明システム設計を「見て分かる」構成へ全面改訂

初版は情報を網羅していたが、初見の人が製品を頭の中に描く前に技術用語と責任境界が続く構成だった。正本を版2.0へ改訂し、avocadoMiniを「まだ存在しない材料を手で考えるデジタル発明台」と一文で定義した。四方向sensorの上面図、AとBを使った8場面の利用例、画面wireframe、できること／できないこと、デジタル仮説・計算・実物実験の三境界を前半へ置いた。

後半は手操作、状態表示、全体接続、Core記録、操作処理順、sensor、privacy、安全、offline、現在地、5段階の実装、役割別の最初の仕事、合格条件へ進む。技術者以外はAだけ、画面担当はAとB、実装担当はB〜Dを読む構造にし、難しい仕様だけを追加して利用体験を説明できなくなる変更を禁止した。

## 2026-09-18 — avocadoMini空間発明システムの共有用完成設計を正本化

誰に共有しても、概念の理解から自分の担当作業まで迷わず進める[RockstarOS × avocadoMini 空間発明システム完成設計書](docs/rockstaros-avocado-mini-complete-design.md)を正本化した。普段の言葉による5分説明から、全体構造、利用体験、四方向sensor、Core entity、再計算、Patent AI、privacy、accessibility、安全境界、契約、現在地、実装順、役割別参加入口、最初の1時間、受入条件、用語集までを一つにつないだ。

全体構成はMaterial Invention／avocadoMiniを主要応用systemとして12層・7経路へ更新した。装置非接続sandbox Coreと統合設計は完成しているが、XR runtime、四方向sensor実機、simulation／Patent AI bridge、外部ラボ、実材料性能、特許性、量産は未完成である。[担当作業入口](docs/workstreams/11-material-invention-avocado-mini.md)ではMAT05の合成scene／pose、MAT06の実機／Provider bridgeへ分け、初参加者が役割と完了条件を選べるようにした。

## 2026-09-18 — avocadoMini四方向sensorとSpatial Invention Studioを設計

RockstarOSを搭載するreference device conceptとして`avocadoMini`を定義し、別のVR／AR addonではなくMaterial Invention Coreの標準製品体験へ統合した。north／east／south／westの四方向sensor／cameraで中央のInvention Volumeを捉え、利用者が手で物質digital twinを選び、接続し、離し、工程parameterを動かす。commitされた操作は元候補を破壊せず新しい仮説branchになり、安全制約を先に検査してから交換可能なsimulationを差分再計算する。[Core正本](docs/material-invention-core.md)／[XR共通設計](docs/material-invention-xr.md)／[端末・interaction設計](docs/avocado-mini-spatial-invention.md)。

scene manifest、四方向sensor set、校正digest、tracking model／confidence、gesture phase、対象binding、仮説限定operationを機械可読契約へ固定した。cameraが物理物質を操作する、gestureで物理実験を承認する、XR runtimeが装置やCore DBを直接操作する構成にはしない。Patent AIは人、AI、simulation、文献、実測のsourceを分けた発明開示と先行技術差分を支援するが、特許性、発明者、権利帰属、自動出願を確定しない。現段階は設計で、四方向rig、XR runtime、Material Core→Patent AI bridgeは未実装。

## 2026-09-17 — RockstarOSへ名称を戻し、Material Invention Coreを根幹設計へ追加

正式製品名と全ての現在表示を`RockstarOS`へ戻し、共通release名を`RockstarOS 1.0`、公開前表示を`RockstarOS 1.0 Developer Preview`へ統一した。内部識別子`dev.rock`と既存の`rockstaros-*`互換名は維持する。2026-09-15〜16のAvocadoOS表記を含む署名済み証拠、配布物、暗号domain、既存backup formatは改変せず、現在表示と互換データを分離する。

物質、配合比、工程条件、安全性、simulation、実験receiptを版管理し、新しい材料・用途・工程の候補を作るRQ49と[Material Invention Core設計](docs/material-invention-core.md)を追加した。装置非接続sandbox CoreとしてJSON Schema、合成fixture、二物質・複数比率の候補graph、canonical SHA-256候補ID、危険性情報不足・単位不整合・許可条件超過のfail-closed、安全審査、provenanceを実装した。物理装置、化学simulation、Zemaの仕事／限定記憶、外部ラボとのruntime接続は未実装であり、危険な合成の無人実行やsimulationだけでの成功断定は行わない。

## 2026-09-17 — Pixel 10 compile-only full buildの二段階gateを実装

Pixel 10／`frankel`／`GL066`の初回Developer Preview向けに、`COMPILE_BRINGUP`と`RELEASE_FLASH`を分離した。`--mode bringup`は所有者確認済みSKU、固定source、host容量、vendor inventory、review済みLocal AI APKを要求し、Operator Agentは公開設定を与えるか明示的に除外する。成果物manifestはtest/development signing、production未署名、flash禁止を記録する。既存の`release`入口はGoogle純正復旧artifact、production signing plan、Operator trust、`fullBuildInputGatePassed`を引き続き要求し、未合格の現在はfail-closedになる。

Scalewayでは課金開始前のdraftとして、PAR 1、Ubuntu 24.04、`COMPUTE3-X32C-64G`（32 dedicated vCPU／64 GB RAM）、600 GB Block Storage 5Kを構成した。表示額はcompute €0.9363/時、storage €0.078/時、IPv4 €0.005/時、合計€1.0193/時（税別）。まだinstance作成、課金、SSH key登録、source sync、Soong buildは行っていない。

検証: Python phone preparation 18件、shell構文、OS contract、Android release architecture 8件、bringup成功／release拒否のCLI実行が合格。`npm run verify`は関連検査、型、lintとNode前半を通過後、既存Miniflare test processが終了しなかったため中断し、全体PASSとは扱わない。

## 2026-09-16 — AIネイティブOSの詳細設計をAstra、監査をSolで進化

製品中核を高性能・交換可能な端末内LLMとoffline agentを持つOSへ固定したRQ48を、[共通Coreの詳細設計](docs/ai-native-os-architecture.md)へ具体化する。Sky app／OSの能力差、モデル・記憶・仕事の契約、外部作用の結果照合、Game／IPの独立開発を設計し、[Solの独立監査](docs/ai-native-os-design-audit.md)を反映する。AI01は設計、AI02〜AI06は未着手の実装単位として追跡し、既存固定runtime／2工程Toolの合格を汎用agentの完成へ換算しない。

Solの最終判定は設計条件付き合格、未解決の重大な設計指摘なし。モデル比較・性能予算等の未確定値と新契約の実装・物理受入を後続taskに残す。今回のAI01完了はこの設計と監査の完了を表す。

検証: 正本・構成の関連3 test、文書リンク38件、`git diff --check`、`npm run verify`が合格。全体検証はNode 312件、Tool 19件、API 143項目、署名fixture 64件、型・lint・Web buildを含む。最初のsandbox実行はlocalhostのlistenがEPERMで拒否されたため停止し、通常権限で全体検証を完走した。今回runtime機能・OS image・実機受入の追加は行っていない。

構成監査と現在入口に残っていた古い優先順位・端末未確定・再起動待ちの記述を同期した。Pixel試験署名APKの非破壊23/23は既存証拠、全OS build、正式署名、物理全損復元、外部Providerは未完了という区別を維持する。

## 2026-09-16 — 制限付きOperator Agentを端末側へ実装

Operator Dockへ登録端末鍵で署名する`poll／ack／result` channelを追加し、launcherを持たない別UIDの`dev.rock.operator.agent`を物理product packageへ接続した。Agentは保存されたWebAuthn assertionを端末ID、RP／origin、UP／UV、P-256署名、期限、scope、単調増加counterまで独立検証し、永続化後だけackする。端末requestはKeystore P-256鍵、local監査はAndroid Keystore HMAC chainで保護する。任意shell、私的内容、Wallet、backup、製品data planeへのBinder経路は追加していない。

Node 14 test、Worker dry-run、Android build／lint、Android 15 emulator 5/5は合格した。停止操作には署名付き解除操作を対で追加し、初期化は30分前の端末通知記録と別release gateを必須にした。production WebAuthn credential、StrongBox attestation登録、Device Owner実行、外部Provider session失効、Pixel 10／SELinux実機試験は未完了で、実端末配信とfactory resetは無効のままである。[正本](docs/security-incident-response.md)／[証拠](docs/evidence/android-operator-agent-emulator-20260916.json)。

## 2026-09-16 — backup v2をShell API v4へ接続（物理wipe復元待ち）

所有者専用の256-bit recovery secretをchecksum付き24単語へ変換し、指定4単語の確認後だけ有効化するUIを追加した。Shell API v4から`avocadoos-recoverable-backup/2`を端末外へexportし、空のowner領域へ24単語でtransactionalにimportして新しいAndroid Keystore鍵へ結び直す。復元後は自動化を停止し、Sky tokenをrotateし、実行中leaseとactive承認を無効化し、導入component authorityとsecretを復元しない。

Java 11 Core 37/37、Android 15 emulatorのBroker 11 non-skipped testとShell 5/5、Android source build／lint 207 taskは合格した。Pixel 10の実data／Keystore消去、復元、再export、再起動は未実施なので、初回flash gateは0/4のまま維持する。[設計と物理gate](docs/android-backup-recovery.md)／[emulator証拠](docs/evidence/android-backup-v2-emulator-20260916.json)。

## 2026-09-16 — Operator命令をhardware credential署名へ固定

Cloudflare Accessへログインした管理serverだけで端末命令を作れる構成をやめ、命令ごとに運営本人のP-256 WebAuthn hardware credentialによる利用者確認付き署名を必須にした。端末、事故ID、action、理由、発行・開始・失効時刻をcanonical bytesへ固定し、credential ID、RP ID、origin、challenge、UP／UV flag、署名、増加counterをDock Workerで検証する。同じcounterの別命令への再利用は拒否し、assertionは端末側の独立検証用に専用D1へ保存する。

Dockのlocal暗号試験とdry-run buildは合格したが、Android Agent、production credential登録、専用配備、実機訓練はまだ未完了である。この段階では実端末へ命令可能とは表示しない。[正本](docs/security-incident-response.md)。

## 2026-09-16 — native Sky選択をBrokerへ永続化（物理再起動受入待ち）

Shell API v3へ`selectSkyTool`と`skySelection`を追加し、Skyで選んだ`article-preparation@1`をBroker SQLite schema v2へ保存するようにした。Zemaは保存済みselection tokenの一致をLocal AI計画の前後で確認し、不一致・未選択は仕事0件で拒否する。既存schema v1はtransaction内でv2へ移行し、未知の新しいschemaはresetせず停止する。

Host 35 tests、Android全378 task、Android 15 emulatorのBroker 9/9・Shell 4/4は合格した。実行中leaseを残すseedと、端末boot count変更後に回収・再実行して結果／7履歴eventへ到達するrecoverの二段階試験も実装した。所有PixelがADBから外れたため、実端末の再起動受入だけはまだ未実施であり、合格表示しない。

## 2026-09-16 — Local AI plan v2から選択Toolの結果・履歴までPixelで完走

Local AI Binder API v2へ`article-preparation@1/input-v1`専用callを追加した。端末内runtimeはJSON Schemaで出力を制約し、Tool callを無効化する。Brokerはその結果を信用せず、説明wrapper、未知field、Tool差替え、型違反に加え、選択した2つの純粋transformが入力を処理できることまで確認してから仕事を作る。既知のGGUF chat-template制御prefixだけを除去し、それ以外の前後文字は拒否する。

Android 15 emulatorではBroker 8/8とShell 3/3が合格し、モデルなしで仕事0件のまま停止した。所有Pixel 10 GL066でもBroker 8/8とShell 3/3が合格し、ShellのZema依頼が`queued`となり、Broker内の完全試験で`citations@1`→`free-article@1`、読取り可能な結果、5件の履歴、本人確認待ち`review`まで完走した。これは試験署名の単体APK受入であり、native Sky永続handoff、全経路の再起動／失敗復旧、AOSP image、SELinux enforcing、production署名は未完了。[証拠](docs/evidence/android-local-ai-plan-v2-20260916.json)。

## 2026-09-16 — native ZemaをLocal AIと最初の選択Toolへ接続

Android Shell APIをv2へ上げ、native Zemaの自然文依頼を署名済みBroker経由でLocal AIへ渡し、Skyで選択済みの`article-preparation@1`だけを厳格JSON planから既存Tool workflowへ登録するsource経路を実装した。モデルはToolを直接呼べず、説明文、未知field、別Toolへの差替え、closed input違反は仕事を作る前に拒否する。request IDは既存仕事へidempotentに結び、成功は`queued`、モデルなし・不正plan・同意不足は`blocked`の構造化応答にした。

Android 15 emulatorと所有Pixel 10で、Broker／Tool統合6/6とShell統合3/3がそれぞれ合格した。emulatorはモデルなし、Pixelはモデル出力が厳格plan不合格となったが、いずれも仕事0件のまま停止し、途中保存はなかった。同意なしはLocal AIを呼ぶ前に拒否した。したがってsource接続とfail-closed実機境界は合格、Pixelでの仕事作成・完了は未合格である。次はLocal AIへ計画専用出力契約を追加し、Broker側検査を緩めず実機完走させる。証拠は[`docs/evidence/android-zema-selected-tool-20260916.json`](docs/evidence/android-zema-selected-tool-20260916.json)。

## 2026-09-16 — 全体の最適構成と実際の接続状態を一つの監査へ固定

製品目的からOS、Pixel、Sky、Zema、Shell、Broker、Local AI、Tool、検証済み収益、Wallet、Fund、Operator、更新・復旧、Gameまでを再点検した。選択している責任分離と順序は1.0目的に整合するが、全層が一つのPixel上で接続・受入済みではない。Web、単体APK、emulator、fixture、sandbox、物理端末の成功を混ぜず、11層の選択状態と6本のend-to-end flowを[`data/system-composition-audit.json`](data/system-composition-audit.json)へ固定し、説明を[`docs/system-composition.md`](docs/system-composition.md)へ追加した。

旧BlackBerry-first taskはPixel 10受入後の二機種目再評価へ変更し、QEMU-firstをスマホOSの優先順位として扱わない。Androidの公開受入表示も実際の6 gate中1合格へ揃えた。最優先はstock Pixel上の`Sky → Zema → Shell → Broker → Local AI → 汎用Tool → 結果・履歴`、次にbackup v2、純正復旧・署名入力、端末側Operator Agentであり、これらの事前gate後だけfull buildへ進む。`npm run system:composition:check`と通常の`npm run verify`で、必須層・flow・証拠の欠落とproduction過大表示を拒否する。

## 2026-09-16 — Android 1.0の7決定と権限分離を一つの構成へ固定

Pixel 10／frankel／GL066向けの製品構成を、機種/SKU、BSP/vendor/partition、boot/recovery、OTA/rollback、SELinux enforcing分離、Keystore喪失backup、CDD/CTS/CTS Verifier/VTS受入の7決定へ統合した。正本は`data/android-release-architecture-policy.json`、説明は`docs/android-production-architecture.md`、自動検査は`npm run android:architecture:check`。

既存の`dev.rock.automation`は信頼identityを変えずheadless Platform Brokerとして残し、最終Home／Sky／Zemaを載せるAndroid launcher／UI入口を`dev.rock.shell`へ分離した。Shellは通信権限、Platform DB、Keystore、Engineと広いPlatform管理権限を持たず、専用BinderだけでBrokerへ接続する。現UIはP1操作画面で、最終native UI完成とは扱わない。Local AI、Tool、MCP、Provider、Operator Agentは別UID／別SELinux domainに固定し、runtime登録からdomainを得ること、Local AIからTool/Walletへ直接接続すること、Operator Agentから製品data planeへBinder接続することを拒否する。Operator Dockは利用者OSとlauncherへ含めない。

Shell／Brokerのsource分離、3 APKのAndroid Gradle build／lint、Android 15 emulatorのBinder統合試験は完了した。backup Binder経路は後続のShell API v4でv2へ更新済みである。ただし全体実装は未完了で、物理wipe復元、Operator Agent、Local AIの最終image/domain、SELinux enforcing user build、CTS/VTSは未実証である。公開監査はSELinux gateを独立追加し、Android実機を1/6合格へ変更した。欠落していたVTS、VTS HAL、VTS kernelの識別子とhash証拠を必須化した。

## 2026-09-16 — 初回flash前に固定する4項目をfail-closed化

Pixel 10／frankel／GL066へ最初に書き込む前の必須条件を、(1) 正式Android署名鍵のidentityと紛失・更新・失効手順、(2) AVB rollback indexのlocation／値／単調増加・downgrade拒否運用、(3) Google純正factory imageと対応full OTAの実ファイル名・byte数・SHA-256、(4) 端末dataとAndroid Keystoreを同時に失っても復元できるbackupの4項目へ固定した。正本は`data/android-first-flash-gate.json`、説明は`docs/android-first-flash-gate-20260916.md`。

現在は0/4合格で、`flashReady=false`を維持する。秘密鍵とrecovery secretそのものはGitへ保存せず、公開fingerprint、手順、artifact identity、hashed試験証拠だけを保存する。4番は`avocadoos-recoverable-backup/2`に固定し、backupごとのDEKをhardware-backed Keystore鍵と所有者だけの256-bit recovery secretで二重wrapする。24単語UI、transactional import、新Keystore再bindingはAndroid 15 emulatorで合格し、残る物理gateはPixel wipe後の実復元と再起動である。運営万能鍵やserver escrowは作らず、full build成功だけで初回flashを許可しない。

## 2026-09-15 — AI自動化チームの効率化を最上位目的へ固定

RockstarOSの目的はスマートフォンやOSを作ること自体ではなく、利用者が自分専用のAI自動化チームを所有し、その効率を改善することで、便利さと検証可能な収益機会を増やし、利用者全体の豊かさへつなげること。Pixelは最初のreference hardwareで、カメラ品質を1.0完成条件にせず、将来の専用端末は価値実証後の配布形態とする。

端末内LLMとToolをoffline-firstで動かし、接続時に外部案件、納品、署名済み収益、Walletを重複なく同期する。一つのTool経済loopを先に完走し、次に複数Toolファンドの一押し実行と実測改善へ進む。月50万円規模は長期の検証済み到達指標であって収益保証ではない。Walletの税務機能は記録、分類候補、集計、export、専門家確認までとし、データ収集はcategory別同意、目的、保存期間、削除・撤回を必須にする。ゲームは同じ権限・receipt・Wallet基盤の派生先とし、1.0の中核loopを止めない。詳細は[製品目的から逆算した開発軸](docs/product-north-star-20260915.md)とRQ47を参照。

## 2026-09-15 — 有料OS full buildを事前試験の後へ固定

利用者の指示により、Android OS full buildと実機flash／bootを最終工程に変更した。事前試験1では、固定sourceからLocal Action Assistantのarm64 release APKを生成し、SHA-256、ABI、通信権限なし、WAKE_LOCK、署名限定Binder権限を確認した。Android 15 arm64のPixel 10端末profile emulatorでは、同一の試験署名を使ったBinder接続とGGUF未導入時の`NO_MODEL`拒否を含む5/5 instrumentation testが合格した。ただしこれは純正OSの所有Pixel 10ではなく、GGUF推論、機内モード、保存／再起動、30分温度試験は未実行なので試験1は部分合格である。

事前試験2では、Sky→Zemaの一回引継ぎ、Zema job進捗、Android Tool Binder／SQLite／本人確認、Wallet／認証済み収益の各subsystemは合格した。一方、Tool完了から署名済みEarning Receiptを自動生成してWalletへ一度だけ転記するproduction経路は存在せず、現在はWeb Walletの手動記帳とSky Billingの別provider受付に分離している。このため試験2は不合格であり、[事前試験証拠](docs/evidence/android-pre-full-build-tests-20260915.json)の判断どおり有料full buildの許可はまだ出さない。

Sky、Zema、Wallet、Tool、LLMは更新可能なAPKとして先に純正Android上で反復する。app-only修正ならOS全体を再buildせず、framework、SELinux、privapp/product設定、boot/vendor/partition/AVBを変えた時だけOS imageを再buildする。事前gate合格後の初回サーバーは、target-files／factory／OTAを同一sourceから作り、最初の実機bootと修正要否を確認するまで保持する。

## 2026-09-15 — 端末管理を利用者OSから分離しOperator Dockへ移動

直前の`/operator`実装は「運営側のDock」という要望を同じRockstarOS Web内の非表示routeと誤解していた。利用者向け`app/operator`、`app/api/operator`、管理UI componentを削除し、利用者向けbuildへ管理画面・APIを含めない構成へ訂正した。

管理面は`services/operator-dock/`の別Cloudflare Worker、別hostname、別D1へ分離した。静的HTML／CSS／JavaScriptを含む全requestでCloudflare Access JWTのRS256署名、issuer、Dock専用audience、有効期限、単一operator subjectを検証してから応答する。管理画面、9種類の操作、命令キュー、15分保守、30分取消可能な初期化、追記監査はこのDock内へ移動した。

現在はsource実装であり、Dock専用hostname、Access application、operator subject、D1のowner設定と本番配備は未実施である。Android端末serviceも未実装のため、実端末へ命令を配信可能とは扱わない。

## 2026-09-15 — 旧実装記録: 利用者Web内の端末管理（後に分離・削除）

当初は`/operator`へ運営専用画面を追加したが、これは「運営側のDock」という配置要件を満たさなかった。直上の訂正で利用者Webから削除し、別配備のOperator Dockへ移動済みである。

Web D1へ端末、命令、監査の3tableを追加した。未検証端末、任意root、同じIDの異なる命令、許可外操作を拒否し、15分保守sessionと30分取消可能な初期化予約を固定した。監査eventの更新・削除はdatabase triggerで拒否する。

管理画面と永続命令キューは実装済みだが、Android端末側service、device enrollment、hardware operator credential、端末側の署名・nonce・scope検査は未実装である。したがって管理画面は`deviceAgent=not_implemented`を表示し、命令を実端末へ送信済みとは表示しない。

## 2026-09-15 — 運営1名による緊急保護accessを設計へ固定

紛失・侵害等の緊急時は、事前登録された端末に対して認定運営担当者1名が本人のその場の承認なしで保護を開始できる。ロック、紛失mode、Sky／Zema停止、session失効、OTA停止、通信隔離、sanitized診断、最大15分の限定保守sessionへ範囲を固定した。

常設root／任意shell、利用者の私的内容閲覧、Wallet操作、秘密鍵取得、マイク／カメラ起動は運営にも許可しない。端末側で署名・scope・期限・replayを検査し、hardware operator credential、追記監査、端末上の表示、事後通知を必須にする。初期化要求は運営1名から出せるが最低30分の取消猶予を設ける。

`data/device-emergency-access-policy.json`と`docs/security-incident-response.md`へ脅威と制御を保存した。これは設計確定であり、Android service、production credential、Pixel 10実機、侵入試験、復旧演習は未完了のまま`SYS13`で追跡する。

## 2026-09-15 — 当時のavocadoOS 1.0と将来の版更新規則を固定（v1.72でRockstarOSへ復元）

当時の共通製品版を`avocadoOS 1.0`、公開前表示を`avocadoOS 1.0 Developer Preview`に決定した。表示値は`data/product-identity.json`へ集約し、Web画面は同じ値を読むため、将来は一か所の版更新で表示を揃えられる。2026-09-17のv1.72で現在表示をRockstarOSへ戻した。

互換性を維持する改善は`1.5`のようなminor更新、Platform API・保存形式・署名trust rootなどの非互換変更はmigrationとrollback受入を伴う`2.0`のようなmajor更新とする。各Device Support Packageは対応Core版の範囲を宣言し、版番号だけで完成や公開可能とは扱わない。

## 2026-09-15 — 当時の正式製品名をavocadoOSへ変更（v1.72でRockstarOSへ復元）

利用者向けの正式製品名を当時`avocadoOS`へ変更し、変更しにくい内部識別子は既存の`dev.rock`で固定した。2026-09-17のv1.72で現在のWeb画面、PWA metadata、Android表示ラベル、通知、診断出力をRockstarOSへ戻した。

既存アプリ、署名・権限境界、保存済みデータ、外部連携を壊さないため、Android package／permission、`org.rockstar` component ID、`rockstaros-*` schema／storage key、`@rockstaros` package scope、URL `/rockstaros`、既存artifact名は互換識別子として維持する。過去の証拠・配布物に記録されたRockstarOS／avocadoOSは履歴として改変しない。

## 2026-09-15 — Pixel 10を最初の実機対象へ固定

所有済みのPixel 10をRockstarOS最初の物理対象に選択した。既存の`frankel` source lockと端末hookを使い、共通RockstarOS Coreは機種ごとに作り直さない。Pixel 7／`panther`はPixel 10受入後まで保留し、2機種目以降はDevice Support Package、vendor／firmware、partition／AVB、hardware、OTA／rollback、純正復旧だけを機種別に移植・検証する。

これは機種familyの選択で、実機readback、OEM unlocking、full build、flash、boot、正式署名の完了ではない。読取り専用診断が`frankel`と一致するまで`targetConfirmed=false`を保ち、クラウド課金や端末初期化を開始しない。

## 2026-09-15 — SkyからZemaへ依頼と実行状態を連続して引き継ぐ

Skyで選んだToolと自然文の依頼をZemaへ一回だけ渡し、Zema側で担当カード、入力確認、実行、進捗、結果、履歴を続けて扱えるようにした。依頼本文はURLやD1へ保存せず、同一tabのsession storageへ最大2,000文字・10分だけ保持し、対象Toolが受け取ると削除する。専用画面を持つCSV、Mercari、Market等はZemaから実行面へ進める。

同じZema画面で実行したjobは受付、開始、完了、失敗をbrowser eventで即時反映し、既存の本人別D1 pollingで再照合する。eventだけを完了証拠にせず、既存のreceipt、承認、費用、外部作用、収益の安全境界は変更していない。

検証では、ローカルD1 migration適用後にSkyへ「CSVの列名と重複行を整理して」と依頼し、Zemaで同じ依頼、担当カード、入力待ち状態、CSV Tool導線が表示されることを実ブラウザで確認した。`/api/sky/connections`、`/api/jobs`、`/api/automation-funds`、`/api/csv-jobs`はいずれも200を返した。`npm run verify`は275件の製品test、19件のFashion Brand Ops test、production build、Web asset closure、143件のWorker/D1 API assertionを含めて完了した。

## 2026-09-15 — RockstarOS全体のデザインとフロント機能性を改善

Homeと共通workspace shellへ、紹介ページ・Studioと同じ黒、酸味のある黄緑、monospace補助表示、丸い主要操作を適用した。Homeから仕事とCSVへ直接進めるようにし、取得していない通信・電池状態の表示をWeb／端末内設定表示へ置換した。端末内設定の保存失敗を安全に無視し、編集dialogへ初期focus、Escape、外側clickの閉じる操作を追加した。nested routeの現在地表示、処理中の移動不能状態、mobile headerとapp gridのoverflowも改善対象として固定した。業務機能、金融安全境界、CSVの私有成果物契約は変更していない。

## 2026-09-15 — 紹介ページとRock Studioのvisual systemを統一

`/rockstaros`と`/studio`を、黒背景、酸味のある黄緑、太い英字見出し、monospaceの補助表示、丸い主操作で統一した。Studioは白いカード中心の画面から、コード入力を主役にした暗い作業面へ変更した。コード貼付、ファイル添付、端末内解析、Package登録、結果と生成コードの確認機能は維持し、Homeとインストール紹介への導線を共通headerへ置いた。
紹介ページ下部に残っていた`OPEN ROCKSTAROS`のHomeリンクは、インストール操作と誤認しやすいため非操作のDeveloper Preview表示へ変更した。主CTAの`OSをインストール`は公開配布前の間、既存の検証済み導入手順へ接続する。

## 2026-09-15 — Developer Preview紹介をインストール中心へ再設計

`/rockstaros`から長い機能説明、動画、Game紹介を外し、黒を基調にした一画面へ整理した。主操作は「OSをインストール」で、公開配布URLがない現在は署名・配布境界を説明する既存導入手順へ進む。同じページにSky Tool SDKの最小Node.js例を表示し、本人限定Siteの`/studio`へ直接進める。Home、導入・復旧ガイド、Studio本体、OS配布gateは変更していない。

## 2026-09-13 — rc3-localの実測証拠を統合履歴へ保存

別作業ツリーだけに残っていた`1.0.0-preview.20260912-rc3-local`の限定受入記録を正本へ統合した。
当時の固定sourceでは、合成データと公開開発鍵を使うローカルQEMU Developer Previewとしてfresh導入、
署名tool実行、正常終了、非空backup/restore、復元後の履歴確認、最終停止まで合格している。
ただし現在の統合branchへの合格転用はせず、Sites、full D0〜D6、production署名、license、実機、一般公開、
実資金は未合格のまま維持する。詳細は
`docs/evidence/launch/backend-rc3-local-20260912.json`を参照する。

## 2026-09-13 — Web第三者依存47件を追加license reviewへ固定

`package-lock.json`の887 entryとCycloneDXの854 unique componentを同じlock SHAへ結合し、17種類のlicense expressionを全件分類した。MPL/LGPL系41件、OR選択式5件、CC-BY表示1件の計47件はPURL（component名・version）単位で追加review必須として固定した。lock上は本番到達可能な必須7件・optional 11件、開発専用の必須4件・optional 25件であり、一覧から1件消す・分類を隠す・本番到達性やoptionalityを変える・lock hashを差し替える操作を自動検査で拒否する。残る807件も各license本文・表示の対象であり「何もしなくてよい」とは扱わない。このlock監査単独は依存候補の把握で、実browser bundleの同梱範囲、条件履行、製品ライセンス採用、法的clearanceを完了した証拠ではない。

Viteへ非公開のbundle inventory pluginを追加し、生成chunkが報告したmoduleをpackage-lock pathへ照合した。ローカルproduction buildはclient・RSC・SSRの計120 unique npm component、未解決0を記録し、追加review 47 PURLの生成bundle内一致は0だった。結果は絶対pathを含めずignored `work/release/`へ0600で生成し、全体verifyがbuild直後に再検査する。これは同梱範囲の証拠を改善するが、build toolの条件、license/NOTICE/source提供、製品license選択、法的clearanceは未完のまま維持する。

## 2026-09-13 — iPhone/AndroidのPWA導入identityとiconを固定

Web app manifestへ固定`id`とroot `scope`を追加し、将来start URLが変わっても別アプリとして重複認識されないようにした。192/512 PNGに加え、Safari向けに1024角・全面不透明のmaskable SVGを追加した。production build上でmanifestの値、3 iconの参照、Content-Type、8 HTTP防御headerを8経路から再読取りし、source 2試験も合格した。これはiPhone/iPadを含む既存OS上のPWA導入改善であり、iOS置換OSやApp Store審査の完了ではない。

## 2026-09-13 — PWA更新を本人の明示適用へ変更

Service Workerはinstall直後に自動で新版へ切り替えず、設定画面の「更新を確認」で待機版を取得し、「更新を適用」を押した場合だけactivateする。controllerが実際に切り替わってから再読込し、8秒で確認できない場合は全RockstarOSタブを閉じて開き直す復旧案内を表示する。旧世代cacheはRockstarOS名前空間だけ削除し、別productのcacheを消さない。API、sign-in/out、foreign originをPWA cacheが横取りしない3試験と、変更後productionの5経路HTTP再検査に合格した。

## 2026-09-13 — Web/PWAのHTTP防御をWorkerとstatic assetの両経路へ固定

Web/PWAのsecurityをアクセス制限から独立した必須gateにした。8つの共通response headerでframe埋込み、plugin object、外部form送信先、MIME sniffing、referrer、不要なcamera/payment/USB等を制限し、HSTS、COOP/CORPを固定する。Service Workerとmanifestは更新再検証、hash付きassetはimmutable cacheを維持する。

最初のproduction実測で、Next configだけではWorker root `/`とstatic assetの`/sw.js`へheaderが届かない差を検出した。root ruleとCloudflare/Sites用`public/_headers`を追加し、再build後に`/`、`/sky`、Service Worker、manifest、実hash付きJSの5経路・8 headerを完全一致で確認した。本人限定Web/PWAは4/5、一般Web/PWAは3/5へ進んだが、Sites v29は古いsourceのため全体はready 0/6のまま。最新版同期後も本人認証済み実responseの再読取りなしにreadyへ変更できない。[実測](docs/evidence/launch/web-security-local-20260913.json)／[最低公開条件](docs/release-minimum-gates.md)。

## 2026-09-13 — Android実機とマイナンバーを証拠単位の別gateへ固定

Android物理端末版を、正確な機種/SKU、同一SKUのBSP・boot・recovery、同一buildのCDD/CTS、production署名、販売地域の5必須gateへ分けた。Android互換、物理flash、販売可能という表示は対応gateなしに有効化できない。GMSはAOSP外の別ライセンスなので、既定のDeveloper PreviewはGMSなしを維持する。対象機種は未選択で、現在0/5合格である。

マイナンバー連携は、無効化境界、目的/必要性、取扱主体/provider、data flowと保存/削除、安全管理、事故対応/委託先監督、最終有効化の7必須gateへ分けた。現在1/7合格で、番号・カード画像を取得せず、通常profileにも保存しない。両監査は公開台帳と機械照合し、gate欠落、状態ずれ、非公式根拠、承認前の取得を拒否する。[Android実機・マイナンバー監査](docs/android-and-personal-number-gates-20260913.md)を参照。

## 2026-09-12 — QEMU rc2を同一候補の10要件へ固定

QEMU `1.0.0-preview.20260911-rc2` のversion、source commit、1,003,224,286 byteのarchive SHA-256を、受入・434,523件inventory・Web表示の3系統で照合した。候補同一性、開発鍵と復旧guard、範囲付き更新・rollback、backup・中断復旧、反復boot・原本照合の5件を合格とし、rc2固有native SBOM、製品license、production署名、署名後の同一候補受入、一般公開承認の5件は未達を維持する。

旧9abのBuildroot legal-infoからtarget 24、host build 37 componentのCycloneDX 1.6を生成する実装を追加した。これは変換方法の検証であり、metadataと自動検査で旧source・license未許諾を固定する。旧inventoryをrc2固有SBOMへ転用したり、QEMU auditと公開台帳のgate状態を食い違わせたりすると検査を拒否する。[QEMU配布完了監査](docs/qemu-release-completion-audit-20260912.md)を参照。

## 2026-09-12 — 公開最低条件を機械判定へ変更

公開状態を本人限定Web/PWA、一般公開Web/PWA、QEMU配布、Android物理端末、iPhone/iPad client、マイナンバー連携へ分離した。設定画面は機械可読の同じ台帳から完了数を表示する。現在は本人限定Web/PWAも最新版同期待ちの4/5で、ready 0/6である。

公開検査は、必須gateと宣言状態の不一致、根拠file欠落、所有者選択とLICENSEのない製品license合格、正式鍵の実施記録がないproduction署名合格、npm依存のlicense metadata欠落、未審査のマイナンバー有効化を拒否する。Web/npmのCycloneDX 1.6 SBOMはignored領域へ生成し、native Buildroot inventoryとscopeを混ぜない。

一般公開とQEMU配布の次のauthority gateは、自作部分の製品ライセンス選択と正式署名方式の確定である。agentはそれを代行せず、それ以外の実装・検証・GitHub/Sites反映を先に完了する。[最低公開条件](docs/release-minimum-gates.md)を参照。

## 2026-09-12 — 最低限のOS運用と公開審査gateを設定へ追加

設定の「システム」を日常運用の操作面へ拡張した。安全な接続、通知、永続保存、PWA表示を実測診断へ加え、本人操作による通知テスト、ブラウザへの保存保護要求、個人情報を含めない診断JSON、確認付きのホーム設定初期化を追加する。初期化は許可済みの外観・並び順だけを対象にし、アカウント、Wallet、実行履歴、未知のlocalStorage keyを削除しない。

公開条件は折り畳み、Web/PWA、QEMU、Android CDD/CTS、Google Play/GMS、対象実機/BSP、production署名、OSS再配布、販売地域の無線規制、マイナンバー取扱いを別gateにした。RockstarOS全体へ単一審査があるとは扱わず、証拠がない項目は未実施のまま表示する。

## 2026-09-12 — OS診断・暗号化保全・更新確認を設定へ追加

設定の「システム」に、通信、端末内保存、Web Crypto、Service Worker、RockstarOS API、PC Connectorの実状態診断を追加した。端末内のRockstarOS外観・設定だけをパスフレーズから導出した鍵とAES-GCMで暗号化して書き出し、改ざんまたは誤ったパスフレーズを拒否して復元できる。ログイン、PC接続token、Wallet残高、server receiptは端末設定バックアップへ含めない。

同じ画面からWeb/PWAの更新確認を実行できる。QEMU Developer Preview、物理端末対象、正式署名鍵、外部MCP・販売・決済・払出しProviderを別gateとして表示し、画面追加を実機対応・本番署名・外部接続の完了証拠にはしない。物理端末版は正確な機種/SKU、BSP、bootloader、recoveryと鍵管理の確定後に別受入を行う。

## 2026-09-12 — ホーム画面と設定アプリをOSの標準入口へ追加

`/`をiPhoneに着想を得たRockstarOSホームへ変更し、Sky本体を`/sky`へ分離した。Sky、Chat、Wallet、Polymarketはアイコンから直接開き、設定はOS標準utilityとして追加する。壁紙4種、アクセント色、アイコンサイズ、アプリ名表示、並び順は端末内へ保存し、本人アカウントや各アプリの権限・記録を変更しない。

設定アプリは、ブラウザ接続、本人アカウント、PC Connectorの実状態を表示し、外観、PWA追加、MCP権限・実行先、Sky管理、Web UI再読込、Developer Previewの導入・バックアップ・復旧へ接続する。Web画面、QEMU版、物理端末版の境界は維持し、画面表示だけで実機書換え・外部MCP・実資金を完了扱いにしない。

## 2026-09-12 — Skyを「稼いだ後だけ最大8.88 USD精算」へ訂正

利用者の明示訂正により、Stripe Checkoutの先払い月額を廃止した。Skyの自動化が生み、外部Providerで入金まで確認できた収益だけをExecution Receiptと結び、署名済みEarning Receiptとして独立Workerへ入れる。実費を先に回収し、ToCの残額から利用者ごと・UTC月ごとに最大888 USD centsをSkyへ、残りを利用者の払出し指図へ記帳する。ToB分のSky利用料は0。売上0時の請求、未達分の債務化・翌月繰越、カード定期請求は行わない。

WorkerはReceipt/実行/Provider参照の重複防止、改ざん・競合拒否、月集計、追記型4勘定台帳、払出しidempotency key、本人別statusを実装した。旧Checkout・Portal・Stripe subscription webhookは410で停止する。現時点で販売・決済・払出しProviderは未接続なので、実際に稼いだ・回収した・送金したとは扱わない。[実装・境界・接続手順](docs/sky-billing.md)。

`npm run verify`でWeb本体118 tests、Fashion Brand Ops 14 tests、仕事API 143 assertions、型・lint、D1移行互換、収益精算Worker bundle、本番buildを通過した。対象試験は、低収益、月888 cents上限、ToB 0、Receipt改ざん・再送・競合、本人分離、払出しleaseと同一idempotency keyを含む。これはローカルfixtureであり、実口座の入出金実績ではない。

## 2026-09-12 — 改善版Skyへブランド運営役を統合

最新のSkyフロント`6f02f1a`を基準に、依頼受付、6つの役割チップ、ダークなTimeline、短い実行導線をFashion Brand Ops branchへ反映する。`ブランド運営役`はInstagram／広告／DM／受注／決済／制作／発送の依頼を受け、既存の38 MCP操作、Campaign Autopilot、Sales Concierge、Production Cockpit、approval gateを開く。サブスク顧問と既存4役も失わない。

Sky月額請求実装は上記の別境界で完成した。FB05は、役割ルーティング8件、全Web 110件、Fashion Brand Ops 14件、型・静的検査、本番build、Worker/D1 API 143 assertionsと実画面操作で合格した。Fashion Brand Ops側の実Provider、実投稿、実広告、顧客向け実請求、返金は接続済みとは扱わない。

## 2026-09-12 — SkyからFashion Brand Ops MCPへワンクリック接続

Chatの左アプリ欄を撤去し、会話・依頼先・最近の処理を一列へまとめた。既定はSky Autoで、利用者は先にアプリを選ばず「案件を見て」「法律の相談」「特許を調べて」のように入力できる。接続済みの役割へ振り分け、担当を会話内へ表示する。アプリの直接指定は上部の小さな切替として残す。

失敗を含む過去jobは会話本文より下の「最近の処理」へまとめた。Chat上の返答は受付・担当選択であり、実jobの完了証拠は保存済みreceiptだけとする。判別不能・未接続・入力不足では勝手に実行せず、次に必要な情報を返す。

## 2026-09-12 — SkyのMCP導入・利用体験を改善

ToB掲載では、遠隔MCPのURL入力後にSkyが`initialize`と`tools/list`を実行し、ツール自体を動かさず接続状態と公開ツール名を確認する。公開HTTPS以外と内部ネットワークを拒否し、OAuth必須先は認証待ちとして審査へ残す。

ToCのPC接続はツール総数4件の固定を廃止し、必須4件が存在すれば将来の追加ツールを許容する。初期化で合意した対応MCP版を後続通信へ使い、現在の本人限定SiteをPCパックの許可Originへ追加した。一般利用画面は「PC接続」「PCで実行」と表示し、MCPという内部用語は開発者向け設定へ限定する。[実装・安全境界・検証](docs/sky-mcp-usability-20260912.md)。

## 2026-09-12 — Skyへ「特許出願アシスタント」を追加

Skyのready商品として、ソフトウェア・システム発明の整理、公開状況警告、公式特許情報に限定した候補調査、明細書・請求項・要約・図面指示・提出前チェックのドラフト作成を追加した。発明内容は保存せず、外部AIへの送信は明示同意後だけ行う。

特許性、登録、侵害回避、期限は保証しない。候補文献と請求項は人が原文と差分を確認し、電子署名、料金支払、特許庁への提出はSkyから実行しない。[実装と安全境界](docs/sky-patent-assistant-20260912.md)。

## 2026-09-12 — Skyへ「日本語法律相談受付」を追加

自動化Hub（Sky）のready商品として、相談内容をブラウザ内だけで整理する日本語法律相談受付を追加した。安全・逮捕・公的書類・期限を先に確認し、一般情報で足りる場合は公的案内、弁護士相談が必要な場合だけ引継ぎ要約と分野・地域に合う候補を表示する。候補は利用者提供の領事館公開リスト33件に基づき、推薦・斡旋・受任保証ではない。

Draft PR #10の初回native CIは、`Hub`から`Sky`への表示変更をPIN画面source guardが検出して停止した。`scripts/review-native-pin-source.py`を隔離Linux環境で実行し、Wallet／ATM各14 frame、既存ROI・PIN桁数・署名ボタン状態、7つの古い座標拒否が同じ画素定義のまま合格したため、`ui.c`と`mcp-ui.inc`のsource hashだけを更新した。画素定義、期限、認証、Wallet処理は変更していない。

## 2026-09-12 — Instagram運用・受注型ブランド管理をSkyへ統合

正本Gitを再確認し、対象は`k999ln/Mr.`のOne Hubではなく`k999ln/rock`のSkyと確定した。Sky開発commit`bf85af6`を隔離branch`codex/fashion-brand-ops-sky`へ統合し、`Instagram運用・受注型ブランド管理`をSkyのready商品、Timeline項目、28操作のMCP serviceとしてmock検証する。account list/switch、content plan、draft/caption、approval、schedule/publish、insights sync、DM classificationを完了条件へ追加した。

実装は`toolkits/fashion-brand-ops`、判断と検証境界は[統合記録](docs/fashion-brand-ops-integration.md)、確定要望はRQ18。Creative/Social/Payment/NotificationをProvider化し、SQLite受注台帳とWebhook照合を持つ。価格変更、外部生成、投稿/広告、DM送信、請求、返金、通知は署名付き個別approvalが必要。初期値はmockで、実Higgsfield/Meta/Stripe、外部費用、QEMU/Android/実機OS、Sites再配信、main mergeは変更していない。

## 2026-09-12 — 多機種対応を共通Core＋機種別packageへ固定

利用者の決定により、RockstarOSは一つの汎用imageを全端末へ書き込む方式ではなく、共通Coreと機種／SKU別Device Support Packageを組み合わせる。提供区分を完全なOS、Android GSI実験版、既存OS上のclient、非対応の4種類に分け、対応台帳と自動検査で誇張を防ぐ。[設計](docs/device-support-architecture.md)／[台帳](data/device-support-matrix.json)。

これは設計・検査の実装であり、実機対応完了や書込み可能imageの生成ではない。最初の物理端末は未確定で、Pixel 7／`panther`とPixel 10／`frankel`を候補として保持する。BlackBerryは正確な機種ごとにbootloader・vendor・recoveryを調査し、iPhone／iPadはclient-onlyとする。クラウド課金、実機flash、production署名、一般公開、main統合は未承認のまま。

## 2026-09-12 — Skyへ「サブスク顧問」を接続

Fashion Brand Ops v0.3.0に、許可済みSky originからPCのloopbackへ接続する短期browser sessionを追加した。Skyの商品カードを1回押すと、session発行、MCP initialize、initialized通知、38操作のtools/list検査まで自動で進み、カードとDialogを「接続済み」へ同期する。再表示時はpingとtool一覧を再確認し、停止・失効・tool不足ではbrowser側sessionを破棄する。解除時はPC側sessionも失効する。

利用者の提案を受け、ツール一覧だけでなく役割を持つ担当者と話して進めるAgent Hub方針を追加した。最初の実装としてサブスク顧問へ質問例と自由入力を追加し、月額、要対応、次回更新、全体要約を外部AIなしで回答する。各担当はMCP allowlist、data scope、本人確認、memory、receiptを持ち、外部変更はpolicy gatewayを通す。[役割エージェント仕様](docs/sky-role-agents-20260912.md)。

今回はローカルSkyでのPC接続と読み取り会話までを対象とし、HTTPS配信版のloopback接続、Native Sky MCP brokerへの常駐、Walletへの費用転記、解約・支払い・申告は未実装のまま保持する。[実装・安全境界・検証](docs/sky-rockstar-ledger-20260912.md)。

追加で全網羅監査を実装した。Apple、Google Play、カード、銀行、PayPal、請求メールの6情報源と確認期間を追跡し、全情報源の解決と継続契約の更新日入力が揃うまで完了と判定しない。現在の個人台帳は既知18件（過去・終了10件）を保持する一方、情報源0/6確認済み、明細0件、更新日3件不足のため未完了と表示する。SkyチャットとMCPも同じ判定を返す。

## 2026-09-12 — 基本アプリをSky / Chat / Wallet / Polymarketへ整理

利用者の明示確認により、RockstarOSの基本アプリを4つに固定した。Skyは自動化アプリの発見・掲載・1タップ接続へ集中し、依頼欄を撤去した。Chatは接続済みアプリを選び、依頼・確認・実行状態・完了通知を受け取る独立画面とした。Walletは従来どおり収支・費用を管理する。

Polymarketは4つ目の外部市場アプリ枠として追加したが、安全な未接続画面だけを実装した。市場データ取得、注文、清算、Walletからの資金移動は行わず、提供地域・年齢・本人確認・規制・外部契約を満たした後の別adapterと同意が必要な状態を維持する。

## 2026-09-12 — SkyをRock IDへの1タップ接続へ変更

Skyの既定導線から長い入力フォームを外し、未接続ツールはRock IDから利用許可だけを保存する1タップ接続、接続済みツールは会話欄へ直接戻る「頼む」導線へ変更した。案件文や原稿など毎回変わる情報はSkyとの会話で渡し、従来の入力画面は必要な場合だけ開く「手動入力」に畳んだ。本人確認とツール権限を分離し、個人番号・住所・生年月日はツールgrantへ保存しない。

## 2026-09-12 — スマホで実行画面が左へずれる不具合を修正

実ブラウザで商品カードを1回押し、「接続済み」「38操作を利用可能」への反映、解除後の未接続表示、再接続、error overlay不在を確認した。`npm run verify`はWeb 107 tests、Fashion Brand Ops 15 tests、型、lint、本番build、Worker/D1 API 143 assertions、migration検証まで全て合格した。

## 2026-09-12 — 改善版SkyへInstagram運用を統合

黒基調の役割フィード、自然文の「Skyに頼む」、検索・状態タブ、1カード1操作へ整理したSkyを、Fashion Brand Ops v0.2.0を含むローンチ候補へ適用した。Instagram運用・受注型ブランド管理を「ブランド運営役」として追加し、Instagram・ブランド・投稿・広告・DM・受注・制作・発送の依頼を同商品へ案内する。38操作、既存商品、approval gateは維持し、Fashion Brand Opsの接続状態も同じ黒いDialog内で読めるようにした。

幅767px以下のDialogは下端固定のシートとして表示し、中央配置用の`translate`を明示的に解除する。これにより狭い画面でDialogが左上へ半分ずれる問題を防ぐ。実Provider接続、実投稿、Sites再配信はこのUI統合には含めない。

デスクトップと幅585pxのスマホ表示で、ブランド運営役のカード、38操作の詳細、承認境界、Dialogの画面内配置を確認した。`npm run verify`はWeb 105 tests、Fashion Brand Ops 14 tests、型、lint、本番build、Worker/D1 API 143 assertions、migration検証まで全て合格した。

## 2026-09-12 — SkyのInstagram運用と既存ツールを同時統合

`codex/fashion-brand-ops-sky`へ最新のSkyサブスク顧問branchを取り込み、Instagram運用・受注型ブランド管理、サブスク顧問、既存Web/PCツールを同じSky画面で併用できるよう競合を解消した。検索カテゴリ、Timeline、詳細runner、ready件数、製品ベース検査を6商品の構成へ同期した。

`npm run verify`でWeb 103 tests、Fashion Brand Ops 14 tests、型、lint、Sky／端末対応／製品ベース検査、本番build、Worker/D1 API 143 assertionsが成功した。実Provider・実投稿・実請求、Native Sky MCP broker、Wallet費用転記、Android／実機組込み、Sites再配信、main統合は実施していない。

Draft PR #10の初回native CIは、`Hub`から`Sky`への表示変更をPIN画面source guardが検出して停止した。`scripts/review-native-pin-source.py`を隔離Linux環境で実行し、Wallet／ATM各14 frame、既存ROI・PIN桁数・署名ボタン状態、7つの古い座標拒否が同じ画素定義のまま合格したため、`ui.c`と`mcp-ui.inc`のsource hashだけを更新した。画素定義、期限、認証、Wallet処理は変更していない。

## 2026-09-12 — Instagram運用・受注型ブランド管理をSkyへ統合

スマホでは役割を横送りにし、実行ボタンを優先表示する。`prefers-reduced-motion`では継続アニメーションを止める。実画面で「今使える」への切替と4件への絞り込み、スマホ幅の表示を確認した。

## 2026-09-12 — Skyの役割をワンタップで開く

SkyのX型Timelineと会話受付を維持し、文章の送信または4つの役ボタンから、ブラウザ実行画面を追加操作なしで開くようにした。PCが必要な納品確認は同じ操作で接続画面を開く。外部送信、料金、権限の本人確認は省略しない。

日本語法律相談受付を現在のSky Agent Hubへ統合した。Timeline投稿、法務受付の役割ボタン、自然文の依頼から会話型受付を開ける。公開連絡先33件、ブラウザRunner、公式情報限定の法令AI、安全判定、弁護士引継ぎを同じ画面で利用できる。

実装は`toolkits/fashion-brand-ops`、判断と検証境界は[統合記録](docs/fashion-brand-ops-integration.md)、確定要望はRQ18。Creative/Social/Payment/NotificationをProvider化し、SQLite受注台帳とWebhook照合を持つ。価格変更、外部生成、投稿/広告、DM送信、請求、返金、通知は署名付き個別approvalが必要。初期値はmockで、実Higgsfield/Meta/Stripe、外部費用、QEMU/Android/実機OS、Sites再配信、main mergeは変更していない。

## 2026-09-12 — 多機種対応を共通Core＋機種別packageへ固定

利用者の決定により、RockstarOSは一つの汎用imageを全端末へ書き込む方式ではなく、共通Coreと機種／SKU別Device Support Packageを組み合わせる。提供区分を完全なOS、Android GSI実験版、既存OS上のclient、非対応の4種類に分け、対応台帳と自動検査で誇張を防ぐ。[設計](docs/device-support-architecture.md)／[台帳](data/device-support-matrix.json)。

これは設計・検査の実装であり、実機対応完了や書込み可能imageの生成ではない。最初の物理端末は未確定で、Pixel 7／`panther`とPixel 10／`frankel`を候補として保持する。BlackBerryは正確な機種ごとにbootloader・vendor・recoveryを調査し、iPhone／iPadはclient-onlyとする。クラウド課金、実機flash、production署名、一般公開、main統合は未承認のまま。

## 2026-09-12 — 現進捗・スマホ不足・クラウド条件を再監査

main `7cdbb5f`とDraft PR #4の候補`c182a5b`を再取得し、PR #4の同HEAD 12 checkが全て成功していることを確認した。ただしスマホcheckはsource preparationで、OS bootではない。41 taskは19 done／15 in progress／7 plannedだが、製品完成率には換算しない。QEMU rc2の内部限定受入、Android P1の2APK、本人限定Siteを保持し、スマホ版は全source取得・vendor生成・Soong build・AndroidへのSky/Wallet/Game移植・production署名・実機flash/boot/OTA/復旧が未完了。[現在の再監査](docs/current-state-20260911.md#2026-09-12--github実装実機版ビルド環境の再監査)／[機械可読snapshot](docs/evidence/launch/progress-audit-20260912.json)。

直近相談のPixel 7／`panther`と、現在固定済みのPixel 10／`frankel`が不一致。実機の型番/SKUを読取り専用で確認するまで対象を確定しない。初回buildはGPUなし、Ubuntu 24.04 x86_64、48 vCPU／96GiB／600GiBを安全側の候補とし、20〜30 USDを未承認の計画枠に更新した。クラウド作成・課金、端末操作、runtime変更、Site再配信、main mergeは行っていない。

今回の安全な開発差分として、phone build入口をlock由来のdevice／lunch／hook／targetへ限定し、`targetConfirmedByOwner:false`または`confirmedSku:null`のfull OS buildをfail-closedにした。RAM64 GiB／空き400 GiBの最低条件、prepare後とrepo検査後のhook SHA再検証、path／Unicode／`-j`入力拒否を追加し、local phone tests 10件、shell構文、py_compile、diff-check、`npm run verify`（93 tests・build・API 143 assertions）をPASSした。これはsource準備の証拠であり、full OS build／boot／flashの成功ではない。

## 2026-09-11 — 開発本体へスマホ準備と現状を統合

現在の入口は[統合した開発状態](docs/current-state-20260911.md)、次の指示は[再開手順](docs/prompts/rock-current-next-20260911.md)。スマホ準備3eeeeedをlaunch-candidateへ取り込み、旧QEMU受入、本人限定Site公開、CM制作途中、MIT/署名鍵/クラウド予算の未回答を同期した。main・配布image・Sites配信は今回変更していない。

検証: `npm run verify`（93 tests・型/lint/build・API143）、スマホ準備8 tests、OS契約整合、shell構文、現在入口のリンク確認に合格。独立した2件の整合レビューも指摘解消を確認。過去の未完了・料金・QEMU/Android runtime・公開済みSiteを保持した。[今回の統合証拠](docs/evidence/launch/development-integration-20260911.json)。

## 以下は日付付きの作業履歴

過去の「次」「現在」「準備中」はその時点の記録。最新状態は上記と機械可読進捗を優先する。

## 2026-09-11 — スマホへ書き込むOS版の開発開始

利用者の明示指示で実機版の開発を開始。Pixel 10候補の公式安定版タグ署名を確認し、固定source・端末product組込み・Linux build入口・読取り専用端末診断を追加した。利用できるLinux環境はないとの回答を受領。対象機種/SKUの再確認、クラウド予算/アカウント、全OS build、Sky/Wallet/Game移植、Android署名と実機受入が必要。まだ書込み可能なimageは生成していない。[実装と再開手順](docs/phone-preview-20260911.md)。

## 2026-09-11 — kaiya の公開設定と新規Sites

権利者名kaiya、自作部分の改変・再配布許可、新規Sites作成、CM制作途中を最新指示として記録。MITの具体条文と本人だけで行う署名方式は準備段階。新サイトは本人限定で公開済み。空のD1で開始し、元サイトとDBの復旧を完了扱いにしない。MIT確認用全文、本人署名CLIと新7＋既存29署名試験、取消/メモリの追加診断を保存した。[今回の設定](docs/owner-setup-20260911.md)。

## 2026-09-11 — rc2の残る受入を再開

rc2の導入・保存・再起動・同一VM中断復旧PASSを保持。追加のD2 lifecycle 16操作、fresh SDK、空導入先削除、D6の61反復/3642秒・5正常終了、D1/D3の13boot、D4の41bootが限定合格し、原本も独立照合した。Game・金融・PC接続・デモの計8正常bootと停止台帳照合、90秒MP4の変換・目視確認も完了。証跡archiveの最初の終端破損を見逃す検査コードを修正し、Linux24 fixtureと同一D4原本の全byte再照合に合格。構成照合は434523記録を作成し、7readerの読戻しを完了。kernel索引10件の生成工程証明とlicense承認は保留。元SitesはNOT_FOUND、正式署名・製品license・CM確定掲載・公開承認は未完了。[追加受入](docs/rc2-remaining-acceptance-20260911.md)。以下は各時点の履歴。

## 2026-09-11 — 最新配布物の受入・公開導線の復旧

利用者の権利者申告と署名意思を受領。新b7/rc2は実1GB候補の二回生成・GitHub全8資産取得・各716インストールmember照合に成功。新規導入→保存→正常再起動→16MiB地点の中断復旧→復旧先起動の3bootを実測し、引用整理1件・9897c・10 COIN_A・重複なしを停止disk/台帳でも確認した。内部動作確認はPASS。正式鍵・license/許諾・元Sites再接続・CM確定掲載・残る全受入と一般公開承認は未完了。Web導線とPC要件を修正し、ローカルverify/HTTP/ブラウザ導線はPASS。[実測記録](docs/os-acceptance-b7d819c-20260911.md) / [公開導線の現状](docs/release-verification-20260911.md)。以下は各時点の履歴。

9月11日追加実装: TLSの1byte受信増幅を最大8KiBの先読みで修正し、期限・header/body上限・単一requestを維持した。修正前の18件中4FAIL→修正後18件＋関連57件＝75PASS/skip0、独立reviewも所見なし。同じ承認経路に4ms/recvを加えた制御実験は旧実装がheader受信中に1秒timeout、新実装は49〜52msで成功したが、原TLS原因の確定ではない。将来のowner許諾を変更しないcandidate bytesへ照合する別置き検証器を追加し、新11＋既存44＝55fixture PASS。所有者の実承認は未受領。旧VM/9ab配布物を保持して、新しい隔離VMで新sourceのbuildを準備中。配布hash検証は開始時のfile size＋1byteまでに制限し、検証中の増大/縮小を拒否する。新image/D0〜D6は未実施、Sitesは再度NOT_FOUND、license/CM/reviewer/PR #5限定mergeは回答待ち。

署名保護の実API照合: `codex/release-signing-control` と公開変数を `ca7356550b0042d05f60a389a90aebd5210510e6` へ固定し、locked/admin enforcement/force・delete禁止/独立PR承認をreadbackした。個人repoはRESTの空bypass設定を422拒否し、そのfieldを返さないため、PR #4の修正はexact repository/branch prefix/commit/ruleに結び付くGraphQL integer0を必須にする。27署名試験PASS。control branchは旧ca73565のまま保護し、修正・owner policy/trustの反映は独立レビュー付き更新待ち。Environment/管理鍵/初回登録は未設定。ca73565自体の全10checks・native1671/skip0成功はSHA別の原証拠に保存した。

追加実装: packagerの未署名exportとcontrol側の候補準備処理を実装し、37fixtureと既存desktop50を確認。共有clockを差し替えるテスト不具合は修正前FAIL→修正後13PASS。旧9ab配布物・runtime・imageは不変だが、新packagerの実生成には新sourceのbuild/freeze/受入が必要。独立レビューによる出力directory競合も修正した。限定bootstrapはDraft PR #5（a441162、CI成功）に分離し、mainは未merge。原TLS原因と所有者入力は未解決。新HEADの最終CIとcontrol ref/protectionはGitHubの実readbackを別証拠に記録する。

再開確認（2026-09-10 22:03 UTC）: GitHubの最終候補は `97d952937add42de04092a2e6c2fac8aba3d8bad`、Draft PR #4はMERGEABLE・全9check成功。mainと旧9ab配布物は不変。Sky改修をやり直す段階ではなく、TLS原因の追加調査と、新しい配布候補を管理署名へ渡す処理へ進む。Sitesは再度NOT_FOUND、署名Environment/control branch/workflow登録と独立承認者は未設定。以下の検証記録は各SHA時点の履歴として保持する。

検証完了記録: `85620ec8b0d5d9913cd2d50f8ead4fbe109ee9bb` はDraft PR #4でMERGEABLE、Web/native/Android/署名fixtureの全10check成功。native1,670件/17checks/skip0とroot UI、ローカルWeb93tests/API143assertions+実行API、audit0、公式Sites buildを確認。文書更新後のHEADはPR自身のCIで別途判定する。外部条件と原TLS原因の未達を理由にBLOCKED_FOR_LAUNCHを保持する。

## 2026-09-10 — Sky改修と既存Sites履歴を統合

Sky・仕事/履歴・Wallet・接続設定へ導線を再設計し、旧ファンド/PWA/認証実行/手入力会計を保持。2つの仕事APIを分離し、両DB履歴からのD1移行、ブラウザの未認証→サンプル実行、PCの再接続race/実行session固定を検証した。全依存auditの4highはsharpの限定更新で0。原TLSの観測を強化し、434,096recordの配布inventoryと許諾判断資料をDraftへ追加した。元9ab配布物は不変。

[現在のLCH01〜07と次の一操作](docs/launch-readiness-20260910.md)を正本とする。**BLOCKED_FOR_LAUNCH**。原TLS原因、所有者のlicense決定、管理署名設定、元Sitesアカウント、確定CM、最終新配布受入は残る。最終main候補は別Draft PRで正確なHEAD/treeを検証し、一般公開/main mergeはまだ行わない。以下は過去の日付付き履歴。

## 2026-09-10 — 3d07df0のnative CIタイムアウト修正・GitHub検証済み

Linuxで全1660件／17checks、元1392件＋新規4件の主suite網羅、Web verifyに合格。16:38 UTC、修正f88b392のGitHub native全6job（root UIを含む）とWebの成功、download原本の699入力・17原ログ・全割当てを確認。[成功証拠](docs/evidence/native-ci-3d07df0/github-f88b392.json)。

通知に対応し原ログ・570秒時点のstackと成功1a2の入力を照合。native入力697件は一致し、570秒のMCPケースから終了時にはbackupケースへ進んでいるため、永久hangとは判定しない。1,392件を単一600秒枠へ集中させたCIを4独立jobへ分割し、module fixture・順序・重複した発見回数を保持して最後に全件照合する。13support checksとroot UIも必須。OS本体・9ab配布物・通信期限を維持する。[修正記録](docs/native-ci-partition-fix-20260910.md)。先行TLS ERROR原因と公開条件は別の残件。

## 2026-09-10 15:49 UTC — 最終結果とCM完成後の残件を同期

凍結9abのD0〜D6／導入・復旧／Game・SDK・実録画は限定受入済み。統合1a2f4d1のWeb/native CI成功をGitへ保存し、先行する間欠障害は原因未確定として保持。CMは利用者申告で完成済みのため制作を残件から外し、既存CMの表現確認と導入案内への接続を次作業へ反映した。追加1〜2日はLICENSE／Sitesの待ちを除くQEMU版仕上げの条件付き概算。確定公開日や実機・実資金の完成予定にはしない。[最新の進捗・会話の補足・再開順](docs/release-followup-20260910.md)を現在の入口とする。

15:54 UTC検証: `npm run project:update`、`npm run verify`（API 143 assertionsを含む）、`git diff --check` は成功。

今回の変更は記録の同期と最終CI証拠の保存。RQ01〜RQ17、task／phaseGateの状態・完了19/34件、元FAILと配布9filesを保持する。以下の日付付き節は各時点の履歴で、未判定／実行中の記述を現在の状態に転記しない。

## 09:48 UTC 最終imageとGame契約

最終9abf78aのbase/profile imageをbuildしてhash固定。正規CI原本1631/14checkと694source一致を既存guardで受理し、Mac arm64原全回帰の10TLS期限ERRORは別FAILとして保持。24要件のGame/Wallet host契約を同sourceで確認しGX01-CONTRACTを完了、実OS UI/fresh SDK/全D0〜D6は未判定。Aは同梱source/NOTICEと容量を確認し長時間試験、Bは実取得から新規VMの全構成復旧、rootは最後に専用端末で実UIと実録画を検証する。

## 09:19 UTC 配布候補のソース固定

`9abf78a80d27aa9f847c4051d20e4c552e407276` を最終source/host tools候補として固定・pushし、Aの完全native回帰とbuildを開始。Game期限後の再接続未対応を既存契約どおりUI/SDKに説明し、元key再送・履歴とPIN pixel条件を保持。Bは同じ版の9file取得から独立新VMで導入/全構成復旧/SDKを検証する。D0〜D6・最終実UI・配布取得・実demoはこれからの判定で、完成とは表示しない。

## 08:40 UTC 最終候補へ向けた一周の固定

月額888の二重請求防止、ATMfee0予約/取消、2正常bootの保持を4e中間imageで実測。新環境SDKのcached接続診断を修正して別fresh再導入が成功。引用整理の同じ処理を選択したrunnerへ送り、元keyの復旧まで最終候補で測る準備を統合。Game/金融/遠隔/90秒実録画のobserverを再現可能なsourceへ保存する。最終同一imageの受入・配布物・demoはまだ未合格。

## 2026-09-10: 8時間の実装・配布準備を開始

ユーザー指定MDを[今回の実行入口](docs/prompts/rockstaros-release-20260910.md)へ保存し、[実行記録](docs/release-execution-20260910.md)に開始・担当・受入条件を固定。GitHubの4headはMDと一致。PR #2起点の専用worktreeで進める。RQ01〜RQ17、月888 cents、Rock ATM手数料0、既存データを維持。下記の「設計のみ」は前回の履歴。

## 08:23 UTC 境界・復旧の統合

root `e4c3e4e`。初回Game送信のclaim直前に、接続・本人credential・端末・作者の現在の権限を同じtransactionで再確認するよう修正。既存の署名済み要求と保留を保持し、失効・並行ATM/月額/Game・実応答喪失の対象試験に合格。Game SDKの再表示時刻は必要な単調更新だけを型付き列で検証し、他の全行保持を維持。旧失敗の判定を変更しない。新候補のbuildと実gateを継続し、まだ配布完成とは判定しない。

## 07:53 UTC 実装・受入の更新

release HEAD `996db1e`。Game 2作者/2game/2owner/追加端末SDK、current-copyの世代fenceと実SIGKILL復旧、遅いGameと別Game/ATMの分離を統合。中間4e実OSはA/B交換とSky引用結果、通常終了まで観測し、再起動保持・台帳監査を継続中。購入PINの残り有効期限を誤って拒否する実不具合を修正し、旧失敗と新実動作を分けて保存した。最新の同一版全gate、fresh配布受入、デモが残るため完成判定はしない。[実行checkpoint](docs/release-execution-20260910.md)が現在の正本。

## 以下は今回開始前の設計更新・旧検証履歴

### RockstarOS 1.0と8原則

利用者の8原則を [製品・事業・開発設計](docs/rockstaros-1.0-strategy.md)へ具体化。RQ01〜RQ17と技術ベースを維持し、対象仮説・代表商品候補・縦断体験・system境界・pilot指標・CM導線・担当責任を整理した。機能追加、配布、外部連絡、実取引は行わない。既存task/phaseGateの完了数は増やさない。

source `8e6d217` のWeb/Android/native CI成功をGitHubで再確認済み。旧timeout待ちを次作業から外した。次はD6 run44の最終報告/終了後データの取得と、RLS01のfresh環境用導入パッケージ。両者は実装を並行できるが、配布には同じ候補の受入と導入試験が必要。既存引用整理を候補に実用比較を準備し、GX00→GX01→DX01を継続する。機種・providerの未確定事項を合格へ換算しない。

本更新の検証: `npm run project:update`、`baseline:check`、`git diff --check`は成功。`npm run verify`は進捗/参照/ベース整合、型、lint、54tests、buildまで成功し、最後のAPI段階だけsandboxのlocalhost listen権限で停止。合成データ専用の`npm run test:api`を許可環境で再実行し143assertionsが成功した。新設計のローカル参照7件と、RQ・料金/ハード方針・task/phaseGateの状態不変も照合済み。変更は設計と引継ぎ情報のみで、OS imageを再buildした実績ではない。

## 以下は前回までの実装履歴

2026-09-09実装更新: [凍結b8287bcの受入報告](docs/os-acceptance-b8287bc-20260909.md)を追加。D0〜D5の限定受入を照合し、D6は42の画面認識失敗と正常終了後の全データ照合を保存した。閾値を変えずhost認識を直し、新規43で5サイクル・60分を再試験中。Macから専用の保存端末を開く入口を追加し、実画面の導入/同意/実行/再起動後結果を確認。公開b325767のWeb/Android/native CIはすべて成功し、native Python1341実行とNode 22のwire照合303件を記録した。GX00は認証付き同一TLSで2作者/2game/2owner/3端末の4接続を実装。非空legacyの月888・1000予約・237未精算・失効credential・既存receipt/BLOBを残した接続と同月再照合が2件PASS。Cのcurrent-copy証拠APIはroot14件PASSで、実WALを保持するreaderがある場合の現在世代検査を修正した。停止済みcurrent-copyのゲーム引継ぎと通常起動ガードは開発中であり、GX00全体は未合格。実機・MetaMask送受金は未実施。

このファイルは当該branchの作業記録です。確定要望は [docs/product-baseline.md](docs/product-baseline.md)、進捗からの指示作成は [docs/prompt-playbook.md](docs/prompt-playbook.md) が正本です。

## 現在の作業 — 承認済み設計の統合と実装

[承認記録](docs/execution-approval-20260909.md)の範囲で実装を開始。分離branch `codex/operational-base-20260909` へmain/native/設計を統合し、旧N01〜N05とRQ01〜RQ15を保持する。6文書の競合を双方の要件・実装履歴を残して解消する。新image合格、実機対応、MetaMask送受信成功を先取りしない。

当時の次作業: D6の新規43を終了後データまで照合して受入報告を更新する。並行してGX00の認証付き実接続・互換/復旧を完成させ、GX01→DX01へ進む。Pixel 10 / GrapheneOSのP1 APKとBlackBerry型番確認は別トラック。現在の優先順位は冒頭と進捗JSONを参照する。

## 2026-09-09: native統合時の履歴

BlackBerry優先とnative OSの統合

2026-09-09、利用者の「ここまでのところをRockに矛盾しないように追加して」に従い、Linux/Buildroot/ARM64 QEMUの検証済み基準版を `systems/rock-star-os/` に取り込む。現在の方針・契約差分・残要件の正本は [native OS統合記録](docs/native-os-integration.md)。検証結果は [統合検証記録](docs/native-os-validation.md)へ記録する。

初期製品端末はBlackBerry優先・機種未定。従来のAOSP/Pixelは比較・移植候補として維持する。新OSの標準Walletは購入者限定、引き渡し時確認の再利用、月888 cents固定の契約。同じ契約の複数端末で重複請求しない。既存Webのファンド上限料金・分配は試算として保存し、両モデルを混ぜない。

MCPの接続/解除・結果復元と送金精算を分け、cloudの可用性に依存しない端末処理、運営用の管理・復旧、端末引き渡し後の少ない操作による開始を継続する。実BlackBerry、実USB、一般外部MCP、金融providerとATM、本番運営は未完了。新たな起動応答検査のWIPは通常buildへ混ぜず保存する。

## 2026-09-09: 現設計と開発内容の再照合・訂正

16:51 UTCにmain/native/設計reviewの3branchを再確認。[相違監査](docs/design-implementation-alignment-20260909.md)のALIGN01〜05に、設計branch参照漏れ、単一ownerと一般player基盤の違い、最新backupと復元試験入口の不一致、台帳移行と旧OS互換、途中依存の表現を記録した。設計v1.1/プロンプト/受入雛形に修正必須内容を反映し、Git進捗取得・段階ゲートの検査補助を改善する。runtimeの問題解消は未実施で承認後の作業。

再開先は `codex/os-game-design-review-20260909`。mainだけには最新設計がない。B04は3入力を統合、V01は単一ownerの既存native商品/合成Walletで先行、GX00→GX01契約→DX01は別系列。実providerやゲーム市場の完成をOS稼働の前提にしない。新たな予測市場/ゲーム資産売買の相談は未承認の検討案で、実行範囲を自動拡張しない。以下の過去記録は各時点の履歴。

## 2026-09-09: OS稼働雛形・ゲーム作者向けWallet・ATM手数料の追加指示

16:09 UTCのGitHub確認でmain `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、PR #1 OPENと各同SHAのCI成功を再確認した。[OS稼働監査](docs/os-readiness-audit-20260909.md)へ対象と不足を記録。

RQ12は現設計をbuild/boot・操作・保存・正常終了・復旧まで検証できるOSへ進める要求。まずQEMUの合成データ専用雛形を受け入れ、実機/本番安全性とは分離する。RQ13はゲーム通貨交換とATM独立、RQ14は自作ゲーム作者向けAPI/SDK・sandbox・導入体験、RQ15はATMでRockが徴収する手数料0。利用者の「atm手数料の話」を受け、ゲーム手数料0という初稿解釈は訂正。ゲーム料金は未定、OS月888 centsは既存契約を保持する。

最新入口は [OS稼働・ゲーム連携プロンプト](docs/prompts/os-operational-base-next.md)。旧GAP01〜04を保持し、B04統合→V01の起動/安全基礎→既存商品/Wallet基礎→OS縦断受入へ進む。GX01ゲームfixture、DX01作者SDKは独立、GX02実ゲームと実資金/実機は別条件。V01全体とB02/B03の機械依存を循環させず、細かな着手ゲートはプロンプトで明示する。

D01は文書と検査の保存だけ。V01/GX01/GX02/DX01とB04/B02/B03/B05は未着手。native code・OS image・ゲーム本体・ATM実運用は今回変更せず、SSDを再マウントしていない。新しい [受入報告雛形](docs/templates/os-acceptance-report.md) は全行NOT_RUNで、合格実績ではない。

## 2026-09-09: 指摘した4問題を解消する実行プロンプトへ改訂

利用者の「指摘した問題を解決する内容を含めて作業を進めるプロンプトを作成」に対応。15:01 UTCにmain `f9b1cbd99eeaa20f7cbc80bd2d88909949cca863`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、OPENのPR #1と同SHAのCIを再確認した。詳細は [追補監査](docs/progress-audit-20260909-followup.md)。

新ベースのnative未反映、無料開発商品への制限、Wallet実収益未接続、PC比較を含む利用価値未検証をGAP01〜04に対応付けた。段階0のB04引継ぎ統合を先頭に置き、既存商品のSky実利用/改善前測定→商品条件と実行adapter→Wallet接続→同条件の再試験へ進む。既存Nタスクは保持し、起動/安全性の直接依存だけ先行する。旧OS02〜OS05は別トラックと明示した。

今回変更するのは文書/進捗とプロンプト。B04/B02/B03/B05は未着手のまま。B02は段階1〜2の基礎、B03はWallet接続、B05はWallet基礎後の比較・再試験に分け、依存の循環を避ける。実サービス未接続でもB03の台帳/fixture基礎が通ればB05へ進めるが、GAP03実収益・GAP04実機価値の未検証は残す。native統合・runtime修正・Sky操作・実provider/実機検証は実行担当の次作業であり、今回完了したとはしない。料金・商品供給の役割・ハード方針は変えない。作成規約とRQ10にも、相違ごとの作業・合格証拠・残る境界を引き継ぐルールを保存する。

## 2026-09-09: Sky＋Walletのベースと利用価値を保存

tob側が商品を開発し、Rockが実行方式・料金・ライセンスの異なる商品を管理するSkyと収益Walletを作る。既存ツールも商品とし、Git内の商品をSkyから実利用して準備/操作/結果確認の不便を改善する。汎用生活機能やエコシステム拡大を主目的にしない。確定ベースはRQ01〜RQ11。

main `5cec834`に加えPR #1/native `fcedcfe`と同一SHAのCIを確認。nativeにはWallet台帳・月888 cents・資格・Sky署名配布・MCP/AI実行先がある。BlackBerry優先機種未定。今回のmain保存はベース/監査/作成規約と検査であり、native本体のmergeではない。[差分監査](docs/progress-audit-20260909.md)、[次の実行プロンプト](docs/prompts/hub-wallet-next.md)を参照。

既存データ、月額契約、旧試算、ツール原本を保持する。B01ベース保存と、B02商品実利用/条件拡張、B03実行費用/収益接続を分けて記録する。

## 2026-09-05時点の履歴: Android/AOSP開発

2026-09-05の利用者指示により、今後の主軸を「Rock star OS: 自社・第三者の自動化ツールを導入し、利用者が決めた範囲で自律実行するOS」へ移す。Pixel等の開発用端末で検証する計画を [OS開発設計書](docs/os-development-design.md) にまとめる。以下のR1/R2は既存Web基盤の履歴として保持する。

初回の成果物は設計書と進捗文書。その後の「考えて組んでみて」を受け、OS部品の実装へ着手する。端末書込、サイト公開、配信側branchの統合は引き続き行わない。従来の公開停止は独立したOS開発を妨げない。

OS設計v0.1では、元の事業/実行/配信側設計をQ01〜Q09へ対応付け、AOSP方式、Pixel適合ゲート、Tool/Recipe/Work/Runの分離、第三者SDK、権限とAIの境界、端末成果物、署名Store/OTA、AT01〜AT14の受入条件を定義する。最初の縦断実装は「原稿を置く→充電時に2工程→成果物→本人確認」。実装前の機材・BSP確認と、未検証項目を明記する。

OS01は設計の完了だけを表す。OS02〜OS05は未着手であり、過去のWebタスクの完了数をOSの実装進捗に換算しない。

## P1: 構想から実装へ

OS06として、Java共通コア・SQLite・固定Tool AIDL・別APKの記事ツール・充電条件のAndroidジョブ・診断画面を実装した。[P1実装手順](docs/os-prototype.md)をコードに対応する詳細仕様とする。基本設計のKotlin案は初回の共通コアではJavaへ具体化した。

OS06の完成条件は、共通コアの実SQLiteテスト、既存記事ツールとの照合、Android APKのコンパイル/検査、残課題の記録。OSイメージ起動や実機合格は含めず、OS03/04とは分ける。AOSPの全ソースはggへ入れず、設定と固定参照だけを管理する。

2026-09-05、実装commit `47043ad` の[Android CI](https://github.com/k999ln/rock/actions/runs/33982932964)でコア16・SDK4テスト、2APKのbuild/lint、記事照合36項目、標準Android35の接続2テストに成功し、OS06を完了とした。端末テストは実BinderとSQLite再接続を通すが、画面OFFの周期実行・端末再起動・不正UIDの否定試験ではない。[既存WebのCI](https://github.com/k999ln/rock/actions/runs/33982933087)も成功。OS03〜05を先取りして完了にはしない。

## 旧Webで維持する事業方針と試算

Rock starは、自動化ツールを束ね、仕事の準備・制作・確認を進めるハブです。ファンドの参加・配分計画、共通収益に対する月最大8.88 USD相当の利用料、基本分配・ブースト・共同留保の試算という方向を維持します。既存の個人費用計算は別モデルです。

他製品の生活管理・投資売買・Telegram事業へ転換しません。参考元に別の料金・売上分配率があってもRock starへ上書きしません。実収益・入出金・分配は未接続で、仕事の完了件数を売上に換算しません。

## R1: Web基盤の完成範囲（過去段階）

既存の4ツールを、仕事単位で順番に実行して確認できる基盤にまとめます。

- 記事の販売準備: 出典整理 → 無料版作成 → 本人の最終確認。
- ココナラ納品準備: 案件条件確認 → 納品記録照合 → 本人の最終確認。
- 各仕事は名前・手順・試行履歴・状態をユーザー別に保存。再読込後も再開可能。
- 失敗、条件不一致、納品照合不合格、サンプル実行は手順を進めない。
- すべての手順を通過後に確認メモを添えて完了。外部応募・送信・納品そのものは利用者が行う。
- 原稿・提案本文・成果物は従来どおり端末内で処理。サーバー保存は仕事名、確認メモ、実行メタデータ。

## R1: 構成とデータ契約

`/` のファンド画面から `/work` へ進み、テンプレートを選んで仕事を作成します。既存の `MrToolRunner` とPCの4つのMCPツールを再利用します。入力の引き渡しは利用者が結果を確認・コピーして行い、タブを閉じると未保存本文は失われます。

| 層                           | 担当                                               |
| ---------------------------- | -------------------------------------------------- |
| `lib/workflow.ts`            | テンプレート、入力検証、状態遷移、完了条件、冪等性 |
| `lib/work-store.ts`          | D1のユーザー別取得、作成、revision条件付き更新     |
| `app/api/jobs/route.ts`      | 認証・Origin確認、仕事の一覧・作成・更新API        |
| `components/workbench.tsx`   | 作成、一覧、次の手順、実行結果、確認と完了         |
| `lib/device.ts` / 既存runner | ツールの実行結果を仕事へ報告                       |
| `data/project-status.json`   | 開発タスクの状態・依存関係・検証根拠               |
| `scripts/project-status.mjs` | READMEと本書の進捗欄の生成・鮮度確認               |

仕事は `active → review → completed`。`active` / `review` から `cancelled` に中止可能。通過前のステップを飛ばす操作は拒否します。中止済み・完了済みの仕事には新しい試行を追加しません。

D1の新しい `work_jobs` テーブルに仕事JSONとrevisionを保存します。更新はID・ユーザーID・revisionが一致したときだけ成功し、別タブの更新を上書きしません。同じ試行ID・同じ内容の再送は二重計上せず、内容が異なれば拒否します。実行メタデータは本人のブラウザからの報告であり、第三者の売上証明や署名付き実行証明ではありません。

仕事内の実行は `work_jobs` の履歴に、ホームの単独実行は既存の `tool_runs` に記録します。二重計上や完了件数からの収益自動算定はしません。一覧は最新100件、試行履歴は200件、API本文は12 KBが上限です。古い仕事のページ送り・削除・成果物の永続保存は未実装です。

`drizzle/0002_work_jobs.sql` はテーブルとインデックスの追加のみです。既存ファンド設定・実行履歴は削除しません。開発DBの適用方法はREADME、本番DBへの適用はSites公開フローで扱います。

## R1/R2: 受け入れ条件と検証

- 記事・ココナラの順次実行、サンプル・失敗・条件不一致の非通過、最終確認必須をユニットテストする。
- 実SQLiteに全移行を適用し、ユーザー別の保存と競合拒否をテストする。
- `npm run test:api` は本番Workerをループバックに起動し、一時D1で認証境界・別Origin・ユーザー分離・二重送信・同時更新・再起動後の復元を検証する。合成ユーザーのIDヘッダーはローカル検証専用で、本番への認証手段ではない。
- 認証・Originで早期拒否するときは未読のリクエスト本文を解放する。403の直後に不正JSONを送る組を20回繰り返し、拒否後もAPIが応答し続けることを検証する。
- API検証はMiniflareから同じコンパイル済みAPI・互換設定・D1宣言を使ってworkerdを直接起動する。Wranglerの開発用プロキシと静的資産ルーティングはこの検証に含めない。移行SQLの適用と保存先の再利用を明示し、再起動後にも同じ仕事が読み出せることを確認する。
- `npm run verify` で進捗同期、型、対象コードlint、ユニットテスト、本番ビルド、API検証をまとめる。CIでも実行する。
- R1ではブラウザ画面操作は未実施。R2で合成データを使い、記事仕事の作成・サンプル非通過・実行・最終確認・完了・再読込を画面から検証する。実ウォレット・外部応募や決済は引き続き対象外。結果と未検証事項は [docs/validation.md](docs/validation.md) に記録する。

## R2: 画面確認とサイト反映

利用者の「実施と更新して」を受け、ブラウザの操作確認と既存Sitesへの反映を実施する。現在の閲覧権限は本人限定であり、この範囲を変えない。GitHubの公開リポジトリと、本人限定の稼働サイトは区別する。

1. ローカルの標準サインインで合成データを作り、ホーム・仕事画面と一連の状態遷移を確認する。
2. 不具合があれば修正し、`npm run verify` を通す。
3. 同一ソースを配信用リモートへ保存し、ビルド成果物と追加DB移行をSitesで公開する。
4. 公開状態と画面/APIを確認し、バージョン・検証範囲・残課題を本書とREADME、検証記録へ反映する。

ローカル画面確認で、記事仕事の完了・再読込後の復元と、条件不一致の非通過・中止を確認済み。テンプレートの内部ID表示を日本語名へ修正し、1180px以下ではホームに専用の仕事入口を表示する。料金・分配式、認証と保存契約は変更しない。

### 公開停止と再開条件

検証済み修正 `89d2d66` はrock/mainへ保存され、GitHub Actionsも成功した。一方、配信用のsites/mainには共通祖先以降に別の2commitがあり、通常pushはfetch firstで拒否された。取得して比較した結果、`/api/jobs` の契約とDrizzleの0002ジャーナル/スナップショットに衝突がある。ホームもアプリ型UIへ変更され、実行管理・端末管理・手入力台帳が追加されていた。

強制push、どちらかの一括優先merge、Sitesのversion保存・公開は行わない。既存の追加機能を残してrockへ統合する方針を利用者に確認してから再開する。[衝突の根拠と統合案](docs/deployment-integration.md) に詳細を記録した。現在の本人限定の権限と稼働サイトは変更していない。

## リポジトリの対応

- ローカル正本: `/Volumes/Extreme SSD/gg`。
- `origin`: <https://github.com/k999ln/rock>。通常の開発・README・進捗をここへ保存。
- 製品は`RockstarOS`の1つ。`rock`は製品・OS・公開契約、非公開`k999ln/Mr.`はTelegram・クラウド・provider運用だけを担当するcomponentとする。
- `k999ln/vvvv`は旧履歴で、新規修正・CI・deploy・runtimeの対象にしない。外部の稼働参照を確認できるまでは削除やarchiveを行わない。
- `k999ln/mr-bot-workrooms`は非公開成果物置場であり、製品source・仕様・進捗の正本にしない。
- 詳細、78件の完全一致blobの分類、共有方法と禁止事項は [Gitプロジェクト統合方針](docs/git-consolidation.md) と [repository map](data/repository-map.json) を正本とする。
- `sites`: 既存サイトの配信用リモート。`.openai/hosting.json` とD1を維持。
- 元の `rock-star/` 内をgg直下へ移動し、入れ子のGit管理を解消。履歴は保持。
- GitHubへの保存とSitesへの再公開は別作業。公開サイトへ反映した場合だけ検証記録に記載。

2026-09-07、`repository:check`で製品正本1件、active sourceの`vvvv`参照なし、固定Mr.原本4件のblob/SHA-256一致を確認した。既存の型・lint・34テスト・buildも成功し、ローカルAPIは143 assertionsに成功した。整理commit `42371f0`はrock/mainへ保存され、[GitHub Actions](https://github.com/k999ln/rock/actions/runs/34170597685)も成功した。GitHub repositoryのarchive、公開範囲変更、運用先切替は実施していない。

R1実装は `b460ccf`、追加の検証改善は `7103e55` としてrockのmainへ保存し、GitHub Actionsで検証済みです。READMEと本書の更新も同じmainに継続して保存します。実際の実施結果は [検証記録](docs/validation.md) のR1欄に残します。

## 進捗の更新方法

2026-09-14、既存WalletフロントへBase Mainnet USDCの本番受取レールを追加した。外部EIP-1193 WalletはRock受取アドレスの所有署名だけに使い、秘密鍵、seed phrase、token approval、包括的送金権限は保管しない。Billing Workerは署名済みEarning Receiptへ配分済みの `SKY_SERVICE_FEE` だけをD1回収指図へ変換し、公式USDC contract、exactな受取先・金額、成功receipt、finalized blockを照合する。コード・本番配備、ownerのWallet署名、最初の実transferは別々に判定する。[設計・調査・本番gate](docs/rock-wallet-production-rail-20260913.md)。

同日、remote D1 migrationとBilling Workerのproduction deployを完了し、Sites側の既存mainを通常mergeした同一treeをowner限定Siteへversion 35として配備した。一般公開、owner Walletの本人署名、最初の実USDC transferは実施していない。

2026-09-13、外部Wallet会社待ちでRockの回収経路が止まらないよう、Rock Settlement Walletを共通Financial Provider契約の第1号にした。署名検証済み収益から確定したRock利用料のsandbox回収指図と報告だけを持ち、利用者資産の包括保管、任意送金、交換、ファンド運用、LIVE transferは持たない。内製専用経路にはせず、外部Wallet／ファンドも同じadapterで追加できる。[設計と境界](docs/rock-first-party-settlement-wallet-20260913.md)。

2026-09-13、Wallet会社とファンド会社をRockstarOS内製機能へ取り込まず、交換可能な外部Providerとして接続する受け身設計を確定した。Rockはcapability discovery、本人同意、指図、状態、receipt、照合を共通化し、保管、運用、約定、払出し、KYC/AML、地域・税務判断は契約上のProviderへ残す。Provider固有機能はversion付きmanifestで追加し、OS再buildなしの参入・差替えを基本とする。これは実Provider契約、実接続、実資金の有効化ではない。[責任境界と受入順](docs/external-wallet-fund-provider-boundary-20260913.md)。

2026-09-12、最小ローンチ対象をQEMU Developer Previewのローカルバックエンドへ限定して再監査した。Hubの安全終了、実行中worker回収、再起動時の自動再送禁止、情報を出さないヘルスチェックを実装し、22 unit testsと実processの起動→署名ツール実行→SIGTERM→SQLite整合→再起動→receipt復元に合格した。配布8資産、production署名、製品許諾、本人限定Sitesのログイン後確認は未完了のため、全体判定はBLOCKED_FOR_LAUNCHを維持する。[P0/P1/P2と証拠](docs/backend-launch-20260912.md)。

1. 着手時に `data/project-status.json` の状態・更新日・次の作業を更新する。
2. 設計判断を本書、利用方法をREADME、根拠を検証記録へ追記する。
3. `npm run project:update` で両文書の進捗欄を更新する。
4. `npm run verify` を実行し、結果を記録して同じcommitに保存する。

`done` はそのタスクの成果物と検証が完了した場合だけ使用。設計タスクの完了は実装完了を意味しません。`blocked` は理由を記録し、予定を完了数へ含めません。継続的な無人開発や毎時同期が稼働しているという意味ではありません。

<!-- project-status:start -->
最終更新: 2026-09-20 / Pixel 10 compile-only Developer Previewの初回full build準備 / 完了 91/136件

| ID | 作業 | 状態 | 根拠 |
| --- | --- | --- | --- |
| SKY19 | SkyへToolチーム入口を統合し利益連動成功報酬・Wallet決済・開発者還元を設計（率・月上限等確認中、未実装） | 進行中 | [記録](docs/sky-network-economy.md) · [記録](docs/sky-billing.md) |
| DOC01 | RockstarOS本体・Sky／Zema・全ready／candidate Tool・Material Inventionの詳細設計入口と被覆監査を正本化 | 完了 | [記録](docs/rockstaros-design-portal.md) · [記録](docs/rockstaros-complete-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| AI01 | RQ48をAstraで詳細設計しSolの独立監査を反映（設計のみ、runtime完了ではない） | 完了 | [記録](docs/product-baseline.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/ai-native-os-design-audit.md) |
| AI02 | モデルmanifest・仕事への版固定・互換更新を実装し、2候補交換／旧仕事再開を段階受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI03 | モデル非依存の限定記憶・project分離・根拠・削除契約を実装し、projection更新を受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI04 | 1.0のpure Tool境界を維持し、外部作用のoperation key・結果不明照合・crash復旧を拡張実装 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI05 | Sky app／OSの能力宣言と単一実行端末固定を実装し、多端末移管は独立拡張として受入 | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI06 | 非金融Game／IP fixtureを共通仕事・限定記憶・Zema進捗へ接続（Fund完成に非依存） | 未着手 | [記録](docs/ai-native-os-architecture.md) |
| AI08 | Jev／TypeSafe・Local Qwen・Cloud LLMをcode主導で統合するDecision Fabric全体詳細設計と機械可読安全契約を固定 | 完了 | [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) |
| AI07 | JevのSky明示利用を設計し、DecisionProviderとRouter／Harnessへの統合を受け入れる | 進行中 | [記録](docs/prompts/jev-typesafe-local-qwen-handoff-20260918.md) · [記録](docs/jev-local-qwen-decision-fabric-design.md) · [記録](contracts/decision-provider.json) · [記録](data/decision-fabric-policy.json) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/llm-evaluation-architecture.md) · [記録](data/llm-capabilities.json) · [記録](scripts/check-llm-architecture.mjs) |
| MAT01 | RQ49 Material Invention Coreのentity・発明loop・安全境界を設計へ固定 | 完了 | [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/material-invention-core.md) |
| MAT02 | 二物質・複数比率・工程条件のsandbox候補graphとfail-closed安全検査を実装 | 完了 | [記録](contracts/material-invention.json) · [記録](contracts/material-invention-fixture.json) · [記録](lib/material-invention.ts) · [記録](tests/material-invention.test.mjs) · [記録](docs/material-invention-core.md) · [記録](docs/validation.md) |
| MAT03 | Material Invention CoreをZemaの仕事・限定記憶・simulation／外部ラボProviderへ接続して独立受入 | 未着手 | [記録](docs/material-invention-core.md) |
| MAT04 | Material Invention Coreの標準体験としてavocadoMiniの四方向sensor・hand操作・再計算・Patent AI設計を固定 | 完了 | [記録](docs/material-invention-xr.md) · [記録](docs/avocado-mini-spatial-invention.md) · [記録](docs/avocado-mini-hardware-design.md) · [記録](docs/assets/rockstaros-spatial-table-v1.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v2.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-exploded-v2.png) · [記録](docs/assets/avocado-mini-hardware-03-power-control-haptic-v2.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v3-silver-tube.png) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-01-sensor-pod-v4-thin-tube.png) · [記録](docs/assets/avocado-mini-hardware-02-chassis-v4-thin-tube.png) · [記録](data/material-invention-xr-policy.json) · [記録](contracts/material-invention-xr.json) · [記録](contracts/avocado-mini-spatial-interaction.json) |
| MAT05 | Core graphから決定的XR sceneを生成し、四方向pose fixtureのconnect／separate／stale拒否を実装 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT06 | avocadoMini四方向Bench／Full-scale prototypeとMaterial Core→Patent AI provenance bridgeを独立受入 | 未着手 | [記録](docs/avocado-mini-spatial-invention.md) |
| MAT07 | 誰でも全体像から担当作業へ合流できるavocadoMini統合完成設計書と全体構成を正本化 | 完了 | [記録](docs/rockstaros-avocado-mini-complete-design.md) · [記録](docs/workstreams/11-material-invention-avocado-mini.md) · [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](docs/ai-native-os-architecture.md) · [記録](docs/rockstaros-1.0-architecture.md) |
| SKY01 | 旧名称をSkyへ全面改称し、選択・許可・実行先・停止・結果を一つにする価値と収録ツールを可視化 | 完了 | [記録](docs/sky.md) · [記録](components/sky-workspace.tsx) · [記録](scripts/check-sky.mjs) |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了 | [記録](app/sky/publish/page.tsx) · [記録](components/sky-publisher-form.tsx) · [記録](app/api/sky/submissions/route.ts) · [記録](tests/sky-submission.test.mjs) |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了 | [記録](docs/sky-mcp-architecture.md) · [記録](systems/rock-star-os/docs/MCP-HUB-INTEGRATION.md) |
| SKY04 | tob無料のConnection Passport・実行契約・ToB/ToC貢献分配を一画面で説明するSky Networkフロント | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SKY05 | Sky画面のsidebarを廃止し、MCP接続・管理とToB掲載をSky本体の操作面へ統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](components/sky-publisher-form.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/sky/network/page.tsx) · [記録](app/sky/publish/page.tsx) |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了 | [記録](components/sky-mcp-center.tsx) · [記録](components/device-connection.tsx) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](scripts/verify-mcp-flow.mjs) |
| SKY07 | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 | [記録](components/sky-mcp-center.tsx) · [記録](components/sky-mcp-center.module.css) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](scripts/package-sky-mcp.py) · [記録](public/toolkits/sky-mcp-connector.zip) · [記録](docs/sky-mcp-connector.md) · [記録](tests/mcp-connector.test.mjs) · [記録](tests/sky-mcp-onboarding.test.mjs) · [記録](docs/product-baseline.md) |
| SKY08 | 黒基調の改善版SkyへFashion Brand Opsを統合し、スマホDialogの画面外ずれを修正 | 完了 | [記録](app/sky/network/page.tsx) · [記録](components/sky-network.tsx) · [記録](components/sky-network.module.css) · [記録](docs/sky-network-economy.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](components/sky-workspace.tsx) · [記録](components/fashion-brand-ops-runner.tsx) · [記録](app/workspace.css) · [記録](scripts/check-sky.mjs) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了 | [記録](components/sky-workspace.tsx) · [記録](app/api/sky/connections/route.ts) · [記録](docs/sky-identity-connection.md) |
| SKY10 | Skyをアプリ選択と接続へ絞り、Chatを依頼・状況・結果の受取画面として分離 | 完了 | [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/workspace-shell.tsx) · [記録](app/chat/page.tsx) · [記録](app/polymarket/page.tsx) |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了 | [記録](lib/mcp-inspection.ts) · [記録](app/api/sky/mcp/inspect/route.ts) · [記録](lib/device.ts) · [記録](components/sky-publisher-form.tsx) · [記録](components/device-connection.tsx) · [記録](tests/mcp-inspection.test.mjs) · [記録](tests/device-lifecycle.test.mjs) |
| SKY12 | ChatをSky Auto既定の一画面へ整理し、事前のアプリ選択を任意化 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](docs/sky-identity-connection.md) |
| SKY13 | GrokをモチーフにChatの表示・入力を改善し、依頼から実行・結果までを会話内へ統合 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](app/workspace.css) · [記録](lib/operations.ts) · [記録](tests/operations.test.mjs) · [記録](docs/chat-usability-20260912.md) |
| SKY14 | 接続済みready商品と任意MCPをChatのbotとして表示し、方向修正・承認実行・結果・停止を一元管理 | 完了 | [記録](components/sky-chat-workspace.tsx) · [記録](components/mcp-bot-runner.tsx) · [記録](lib/mcp-hub.ts) · [記録](toolkits/sky-mcp-connector/server.mjs) · [記録](tests/mcp-connector.test.mjs) · [記録](docs/chat-mcp-control-room-20260913.md) |
| SKY15 | Sky SDKコードを既存ツールへ追加し、起動時にPackage登録・MCP公開・利用記録まで行うStudioを実装 | 完了 | [記録](components/rock-studio.tsx) · [記録](toolkits/sky-tool-sdk/src/index.mjs) · [記録](app/studio/page.tsx) · [記録](app/sky/publish/page.tsx) · [記録](tests/sky-code-intake.test.mjs) · [記録](tests/sky-studio-chat.test.mjs) · [記録](docs/sky-tool-sdk.md) |
| SKY16 | SkyのTool選択と自然文依頼をZemaへ一回引き継ぎ、job状態を即時同期 | 完了 | [記録](lib/sky-zema-handoff.ts) · [記録](lib/operations-client.ts) · [記録](components/sky-workspace.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/chat-live-progress.tsx) · [記録](tests/sky-zema-handoff.test.mjs) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/sky.md) |
| SKY17 | Jev Ultrafastを権限制御されたbrowser agent候補としてSky catalogと全Tool設計へ追加 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) |
| SKY18 | Jev ecosystem 10 repositoryを判断・browser・PC・mobile・review・routing・PAPER市場・referenceへ分離して候補登録 | 完了 | [記録](lib/catalog.ts) · [記録](docs/jev-ecosystem-integration-design.md) · [記録](docs/jev-ultrafast-integration-design.md) · [記録](docs/sky-tools-complete-design.md) · [記録](data/design-document-index.json) · [記録](scripts/check-design-document-index.mjs) · [記録](scripts/check-sky.mjs) |
| WEB02 | Developer Preview紹介をOSインストールとSky開発者コード中心の一画面へ再設計 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) |
| WEB03 | Developer Preview紹介とRock Studioを共通の黒・黄緑visual systemへ統一 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](components/rock-studio.tsx) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) |
| WEB04 | RockstarOS全体のvisual systemを統一し、主要フロントの機能性を改善 | 完了 | [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](components/workspace-shell.tsx) · [記録](app/workspace.css) · [記録](tsconfig.json) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/frontend-usability-audit-20260915.md) · [記録](docs/product-baseline.md) |
| BRD01 | 正式製品名をRockstarOS、内部識別子をdev.rockで固定 | 完了 | [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](app/layout.tsx) · [記録](app/manifest.ts) · [記録](components/home-screen.tsx) · [記録](android/automation/src/main/java/dev/rock/automation/ApprovalActivity.java) · [記録](tests/product-baseline.test.mjs) |
| WEB05 | avocadoMiniを主役にした事業紹介へGitHub冒頭とWeb紹介ページを更新 | 完了 | [記録](README.md) · [記録](docs/assets/avocado-mini-hardware-00-overview-v4-thin-tube.png) · [記録](docs/assets/rockstaros-spatial-table-full-scale-v2.png) · [記録](sites/avocado-mini/index.html) · [記録](sites/avocado-mini/src/main.js) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/dist/index.html) · [記録](sites/avocado-mini/public/images/avocado-mini-hero.png) · [記録](sites/avocado-mini/public/images/avocado-mini-detail.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-front-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-side-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-rear-concept.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-sensor-macro.png) · [記録](sites/avocado-mini/public/images/motion-tower-satin-four-point.png) · [記録](sites/avocado-mini/public/images/avocado-mini-kit.png) · [記録](sites/avocado-mini/public/images/avocado-mini-head-p0.png) · [記録](sites/avocado-mini/public/images/avocado-mini-base-p0.png) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](public/rockstaros/avocado-mini-concept.png) · [記録](docs/product-baseline.md) |
| WEB06 | GitHubと製品紹介から主要アプリへ進む入口を整え、既存Siteの一般公開と最新版同期を確認する | 進行中 | [記録](README.md) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](app/api/health/route.ts) · [記録](scripts/check-work-api.mjs) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB07 | 利用者の目的とAIの役割を先に伝える製品紹介へGitHub冒頭とWebページを改訂 | 完了 | [記録](README.md) · [記録](docs/assets/rockstaros-intro.gif) · [記録](docs/assets/cover-avocado-mini.gif) · [記録](docs/assets/cover-rockstaros.gif) · [記録](docs/assets/cover-sky.gif) · [記録](docs/assets/cover-zema.gif) · [記録](docs/assets/cover-material-studio.gif) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) |
| WEB09 | avocadoMiniクラファン企画を提示し、募集確定後に公開支援リンクを設置する | 進行中 | [記録](README.md) · [記録](docs/avocado-mini-crowdfunding.md) · [記録](app/rockstaros/crowdfunding/page.tsx) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB10 | 製品・OS導入ホームに各サービスの役割と利用範囲を示す入口を追加 | 完了 | [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/preview.module.css) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](docs/product-baseline.md) · [記録](docs/workstreams/05-web-pwa-sites.md) |
| WEB11 | 製品構想モデルをスクロールで一周見せ、参考価格・購入準備中・OS導入へつなぐ | 完了 | [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](docs/product-baseline.md) |
| WEB12 | 利用者提供の伸縮式センサータワーを製品サイトとGitHubの主役にする | 完了 | [記録](public/rockstaros/avocado-mini-tower-concept.png) · [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](app/rockstaros/page.tsx) · [記録](README.md) · [記録](docs/avocado-mini-hardware-design.md) |
| WEB13 | 旧URLをavocadoMini公開商品Siteへ転用し、OS操作画面を管理者限定の別Siteへ移す | 進行中 | [記録](sites/avocado-mini/index.html) · [記録](sites/avocado-mini/guide/index.html) · [記録](sites/avocado-mini/crowdfunding/index.html) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](components/avocado-turntable.tsx) · [記録](components/avocado-turntable.module.css) · [記録](README.md) · [記録](docs/workstreams/05-web-pwa-sites.md) · [記録](sites/avocado-mini/src/style.css) · [記録](sites/avocado-mini/src/main.js) · [記録](project.md) · [記録](sites/avocado-mini/rockstaros/index.html) · [記録](sites/avocado-mini/vite.config.js) |
| BIZ01 | 無料配布の対象とOS従量課金の計量単位・単価・上限を確定する | 進行中 | [記録](README.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/sky-billing.md) |
| VER01 | RockstarOS 1.0と将来の1.5／2.0版更新規則を一元管理 | 完了 | [記録](data/product-identity.json) · [記録](lib/product-identity.ts) · [記録](data/product-baseline.json) · [記録](docs/product-baseline.md) · [記録](components/workspace-shell.tsx) · [記録](components/system-settings.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/product-baseline.test.mjs) |
| WLT01 | Walletの受取予定・収益内訳・Receipt・精算ルールを一画面で確認できるフロントを実装 | 完了 | [記録](docs/wallet-front-design.md) · [記録](components/sky-billing.tsx) · [記録](components/operations-workspace.tsx) · [記録](app/workspace.css) |
| WLT02 | 本人別の残高・売上・経費・取消履歴をD1へ保存するWallet専用APIと操作画面を実装 | 完了 | [記録](app/api/wallet/route.ts) · [記録](components/wallet-workspace.tsx) · [記録](lib/operations.ts) · [記録](tests/wallet-backend.test.mjs) |
| WLT03 | Wallet／ファンド会社を交換可能な外部Providerとして受ける責任境界とadapter契約を固定 | 完了 | [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) · [記録](docs/validation.md) |
| WLT04 | Rock Settlement Walletを最初のProviderとして自社利用料のsandbox回収契約を実装 | 完了 | [記録](lib/financial-provider.ts) · [記録](tests/financial-provider.test.mjs) · [記録](docs/rock-first-party-settlement-wallet-20260913.md) · [記録](docs/external-wallet-fund-provider-boundary-20260913.md) · [記録](docs/product-baseline.md) · [記録](data/product-baseline.json) · [記録](docs/validation.md) |
| WLT05 | Base Mainnet USDCの所有確認付き受取先とfinalized着金照合を本番Wallet・Workerへ接続 | 完了 | [記録](components/rock-settlement-wallet.tsx) · [記録](lib/rock-wallet.ts) · [記録](services/sky-billing/src/worker.ts) · [記録](services/sky-billing/migrations/0004_rock_settlement_wallet.sql) · [記録](tests/rock-wallet.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](docs/rock-wallet-production-rail-20260913.md) |
| WLT06 | owner受取Walletを本人署名で登録し、最初の実USDC回収をEarning Receiptへ照合 | 進行中 | [記録](docs/rock-wallet-production-rail-20260913.md) |
| MKT01 | あらゆる型付き価値を扱うPAPER市場とexact approval・risk・receipt・position台帳を実装 | 完了 | [記録](app/market/page.tsx) · [記録](app/api/market/route.ts) · [記録](components/everything-market.tsx) · [記録](lib/everything-market.ts) · [記録](lib/everything-market-store.ts) · [記録](drizzle/0009_sad_giant_girl.sql) · [記録](tests/everything-market.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| MKT02 | Web PAPER市場のapproval・reservation・receipt・position関係をD1で強制 | 完了 | [記録](drizzle/0012_marketplace_relation_guards.sql) · [記録](tests/everything-market.test.mjs) · [記録](scripts/check-web-schema.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) · [記録](docs/data-storage-boundaries.md) |
| DB01 | 全データ境界・table・migration・本番readback状態を一つの監査レポートへ統合 | 完了 | [記録](scripts/database-status.mjs) · [記録](data/database-deployments.json) · [記録](data/database-status.json) · [記録](docs/database-status.md) · [記録](tests/database-status.test.mjs) |
| SPN01 | native Walletへsimulation/PAPER限定のValue/Spend台帳・exact approval・再照合を統合 | 完了 | [記録](systems/rock-star-os/src/blackberryrock/spend.py) · [記録](systems/rock-star-os/src/blackberryrock/wallet.py) · [記録](systems/rock-star-os/src/blackberryrock/hub_server.py) · [記録](systems/rock-star-os/tests/test_spend_runtime.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) · [記録](docs/value-spend-runtime.md) |
| FND01 | ツールの検証済み純収益・実費・receipt・失敗から構成と観測利回りを30秒ごとに再計算 | 完了 | [記録](lib/automation-fund.ts) · [記録](lib/automation-fund-store.ts) · [記録](app/api/automation-funds/route.ts) · [記録](components/autonomous-fund-market.tsx) · [記録](tests/automation-fund.test.mjs) · [記録](docs/everything-market-and-autonomous-fund-20260913.md) |
| WEB01 | 主要画面のstyle契約と配備asset closureを検査し、GitHubと既存Sitesを同一commitへ固定 | 停止中: 一般公開の意思は確認済み。既存Sitesは現在の接続アカウントでAccess Denied／project_not_foundとなり、所有workspaceの接続なしでは公開設定変更、同一SHA配備とD1本番readbackを実行できない。 | [記録](tests/web-route-style-contract.test.mjs) · [記録](scripts/check-web-asset-closure.mjs) · [記録](tests/web-asset-closure.test.mjs) · [記録](app/workspace.css) · [記録](docs/product-baseline.md) · [記録](docs/evidence/launch/sites-owner-auth-blocker-20260915.json) |
| HOME01 | iPhone着想のホーム、端末内カスタマイズ、OS運用設定アプリを実装 | 完了 | [記録](app/page.tsx) · [記録](app/sky/page.tsx) · [記録](components/home-screen.tsx) · [記録](components/home-screen.module.css) · [記録](app/settings/page.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-settings.module.css) · [記録](docs/product-baseline.md) |
| HOME02 | Home以外の全画面へ直接Homeへ戻る導線を常設し、共通・独自レイアウトの回帰を防止 | 完了 | [記録](components/workspace-shell.tsx) · [記録](components/sky-chat-workspace.tsx) · [記録](components/system-settings.tsx) · [記録](components/system-maintenance.tsx) · [記録](app/fund/page.tsx) · [記録](app/fund/legacy/page.tsx) · [記録](app/rockstaros/page.tsx) · [記録](app/rockstaros/guide/page.tsx) · [記録](tests/web-route-style-contract.test.mjs) · [記録](docs/product-baseline.md) |
| SYS01 | 端末診断・暗号化設定バックアップ・復元・Web更新確認を設定へ実装 | 完了 | [記録](app/settings/system/page.tsx) · [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS02 | 通知・保存保護・診断共有・安全な初期化と公開審査gateを設定へ実装 | 完了 | [記録](components/system-maintenance.tsx) · [記録](components/system-maintenance.module.css) · [記録](lib/system-backup.ts) · [記録](tests/system-backup.test.mjs) · [記録](docs/product-baseline.md) |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了 | [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](components/system-maintenance.tsx) |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了 | [記録](data/qemu-release-audit.json) · [記録](data/qemu-rc2-legal-info/manifest.csv) · [記録](data/qemu-rc2-legal-info/host-manifest.csv) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/qemu-release-completion-audit-20260912.md) · [記録](components/system-maintenance.tsx) |
| SYS05 | 候補準備・法務承認・保護署名・本人署名の64拒否境界試験を全体verifyへ統合 | 完了 | [記録](scripts/check-release-signing.mjs) · [記録](scripts/release_signing.py) · [記録](scripts/release_signing_owner.py) · [記録](scripts/prepare_release_candidate.py) · [記録](scripts/verify_owner_legal_approval.py) · [記録](tests/test_release_signing.py) · [記録](tests/test_release_signing_owner.py) · [記録](tests/test_prepare_release_candidate.py) · [記録](tests/test_owner_legal_approval.py) · [記録](docs/release-signing-operations.md) |
| SYS06 | Android物理端末とマイナンバー連携を独立監査し、証拠なしの互換・GMS・販売・個人番号有効化を拒否 | 完了 | [記録](data/android-physical-release-audit.json) · [記録](data/personal-number-release-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/check-release-readiness.mjs) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/android-and-personal-number-gates-20260913.md) · [記録](docs/release-minimum-gates.md) |
| SYS07 | Web/PWAのHTTP防御を正本化し、Worker・static asset両経路の実responseを検査 | 完了 | [記録](data/web-security-policy.json) · [記録](next.config.ts) · [記録](public/_headers) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/web-security-policy.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了 | [記録](public/sw.js) · [記録](components/system-maintenance.tsx) · [記録](tests/service-worker-update.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了 | [記録](app/manifest.ts) · [記録](public/rock-icon-192.png) · [記録](public/rock-icon-512.png) · [記録](public/rock-icon-maskable.svg) · [記録](scripts/check-web-security-response.mjs) · [記録](tests/pwa-installability.test.mjs) · [記録](docs/evidence/launch/web-security-local-20260917.json) · [記録](docs/validation.md) |
| SYS10 | Web第三者依存のlock hash・47要review componentのPURL一覧を公開gateへ固定 | 完了 | [記録](package-lock.json) · [記録](data/web-third-party-license-audit.json) · [記録](data/release-readiness.json) · [記録](scripts/release-readiness-lib.mjs) · [記録](tests/release-readiness.test.mjs) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS11 | Vite生成chunkのnpm componentをbuild時に記録しlicense監査へ照合 | 完了 | [記録](vite.config.ts) · [記録](scripts/web-bundle-inventory.mjs) · [記録](scripts/check-web-bundle-inventory.mjs) · [記録](tests/web-bundle-inventory.test.mjs) · [記録](package.json) · [記録](data/release-readiness.json) · [記録](docs/release-minimum-gates.md) · [記録](docs/validation.md) |
| SYS12 | 運営1名で開始できる緊急保護・限定保守accessの脅威モデルと端末側制御契約を固定 | 完了 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](docs/product-baseline.md) · [記録](scripts/check-product-baseline.mjs) · [記録](tests/product-baseline.test.mjs) |
| SYS13 | 緊急accessのAndroid service・hardware credential・端末側制限・監査を実装しPixel 10で侵入／復旧試験 | 進行中 | [記録](data/device-emergency-access-policy.json) · [記録](docs/security-incident-response.md) · [記録](services/operator-dock/public/index.html) · [記録](services/operator-dock/src/worker.ts) · [記録](services/operator-dock/src/access-auth.ts) · [記録](services/operator-dock/src/operator-control.ts) · [記録](services/operator-dock/src/device-channel.ts) · [記録](services/operator-dock/migrations/0001_operator_device_control.sql) · [記録](services/operator-dock/migrations/0002_signed_device_channel.sql) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorCommandVerifier.java) · [記録](android/operator-agent/src/main/java/dev/rock/operator/agent/OperatorAgentJobService.java) · [記録](tests/operator-control.test.mjs) · [記録](tests/operator-device-channel.test.mjs) · [記録](tests/operator-access-auth.test.mjs) · [記録](tests/operator-dock-isolation.test.mjs) · [記録](android/operator-agent/src/androidTest/java/dev/rock/operator/agent/OperatorAgentIntegrationTest.java) · [記録](android/operator-agent/src/main/res/values/overlayable.xml) · [記録](scripts/stage-operator-agent-overlay.py) · [記録](tests/test_stage_operator_agent_overlay.py) · [記録](os/physical/operator-agent-overlay/README.md) · [記録](docs/evidence/android-operator-agent-emulator-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](docs/evidence/android-operator-overlay-stager-20260916.json) |
| SYS14 | 製品目的から全層の選択・接続・実証状態を一つの構成監査へ固定 | 完了 | [記録](docs/system-composition.md) · [記録](data/system-composition-audit.json) · [記録](scripts/check-system-composition.mjs) · [記録](tests/system-composition.test.mjs) |
| R01 | 4参照元の採用判断と事業方針の固定 | 完了 | [記録](docs/reference-repositories.md) |
| R02 | ggをGitHub rockへ紐付け、既存変更と履歴を保全 | 完了 | [記録](project.md) |
| R03 | 仕事の作成・実行・確認・再開をAPIと画面で接続 | 完了 | [記録](tests/workflow.test.mjs) · [記録](scripts/check-work-api.mjs) |
| R04 | README・設計進捗の同期とCI検証 | 完了 | [記録](scripts/project-status.mjs) · [記録](.github/workflows/ci.yml) · [記録](docs/native-ci-partition-fix-20260910.md) |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了 | [記録](docs/validation.md) |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了 | [記録](docs/validation.md) |
| R07 | 本人限定のSitesへ公開・本番確認 | 完了 | [記録](docs/deployment-integration.md) · [記録](docs/release-followup-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了 | [記録](project.md) · [記録](docs/validation.md) · [記録](docs/deployment-integration.md) |
| OS01 | 既存設計の要件追跡と自動化OS開発設計 | 完了 | [記録](docs/os-development-design.md) |
| DSP01 | 共通Core・機種別Device Support Package・4提供区分の設計と検査 | 完了 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) · [記録](scripts/check-device-support.mjs) |
| OS02 | 【Android/AOSP別トラック】対象Pixel・ソース/BSP・Linuxビルド環境の適合確認 | 進行中 | [記録](docs/os-development-design.md) · [記録](docs/phone-preview-20260911.md) · [記録](os/physical/frankel-source-lock.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) |
| OS03 | 【Android/AOSP別トラック】CuttlefishでOS起動と自律実行の最小縦断試作 | 未着手 | [記録](docs/os-development-design.md) |
| OS04 | 【Android/AOSP別トラック】Pixel実機で復旧・省電力・再起動・署名更新を検証 | 未着手 | [記録](docs/os-development-design.md) |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 | [記録](docs/os-development-design.md) |
| OS06 | OS共通実行コア・端末DB・Android統合の検証可能な試作 | 完了 | [記録](docs/os-prototype.md) · [記録](docs/validation.md) · [記録](android/automation/src/androidTest/java/dev/rock/automation/DeviceIntegrationTest.java) |
| OS07 | Local Action Assistantの固定source・オフラインLLM契約・署名限定Binder client/server・APK staging gateを実装 | 完了 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](contracts/local-ai-runtime.json) · [記録](os/physical/local-action-assistant-source-lock.json) · [記録](docs/evidence/local-ai-overlay-validation-20260915.json) |
| OS08 | Local Action AssistantのKotlin・arm64 APKをnative buildし、artifact lockとSoong OS imageへ接続 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](.github/workflows/local-ai-apk.yml) · [記録](scripts/build-local-ai-apk.sh) · [記録](scripts/stage-local-ai-apk.py) · [記録](os/physical/local-action-assistant-artifact-lock.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) |
| OS09 | 確定した対象端末でGGUF import・機内モード推論・変更確認・30分連続温度試験を完走 | 進行中 | [記録](docs/local-ai-os-integration-20260915.md) · [記録](docs/evidence/android-pixel-10-gl066-local-ai-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) |
| OS10 | Tool／MCP／Provider共通APIとnative Zema選択Tool経路、本人承認、Wallet台帳、暗号化backup、署名更新gateを実装 | 進行中 | [記録](docs/platform-core.md) · [記録](docs/os-prototype.md) · [記録](contracts/platform-api.json) · [記録](android/core/src/main/java/dev/rock/core/platform/PlatformStore.java) · [記録](android/core/src/main/java/dev/rock/core/platform/EncryptedBackup.java) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](scripts/check-android-release-architecture.mjs) · [記録](tests/android-release-architecture.test.mjs) · [記録](android/tool-sdk/src/main/aidl/dev/rock/sdk/IPlatformApi.aidl) · [記録](android/automation/src/main/java/dev/rock/automation/RockPlatformService.java) · [記録](android/automation/src/main/java/dev/rock/automation/RockShellService.java) · [記録](android/shell-api/src/main/aidl/dev/rock/shellapi/IShellApi.aidl) · [記録](android/shell/src/main/java/dev/rock/shell/ShellConnection.java) · [記録](android/shell/src/androidTest/java/dev/rock/shell/ShellBrokerIntegrationTest.java) · [記録](android/automation/src/main/java/dev/rock/automation/ZemaOrchestrator.java) · [記録](android/tool-sdk/src/main/java/dev/rock/sdk/ZemaToolPlan.java) · [記録](docs/evidence/android-zema-selected-tool-20260916.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-pixel-10-prefull-physical-20260916.json) · [記録](android/sepolicy/private/rockstar_platform.te) |
| OS11 | Platform CoreをAOSPでbuildしSELinux enforcing boot、production署名更新、OTA rollbackを実機検証 | 未着手 | [記録](docs/platform-core.md) · [記録](docs/phone-preview-20260911.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) |
| G01 | GitHubリポジトリの役割・重複監査と正本境界の固定 | 完了 | [記録](docs/git-consolidation.md) · [記録](data/repository-map.json) · [記録](scripts/check-repository-map.mjs) · [記録](docs/validation.md) |
| G02 | vvvvの稼働参照監査と安全なarchive判定 | 未着手 | [記録](docs/git-consolidation.md) |
| G03 | Web DBの保存境界・互換migration・重複防止checkを整理 | 完了 | [記録](docs/data-storage-boundaries.md) · [記録](scripts/check-web-schema.mjs) · [記録](tests/migration-union.test.mjs) |
| B01 | Sky＋Walletの製品ベース・branch監査・プロンプト規約を保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/product-north-star-20260915.md) · [記録](docs/progress-audit-20260909.md) · [記録](docs/prompt-playbook.md) · [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/validation.md) |
| B04 | main/native/設計reviewのベース・引継ぎ入口を分離作業branchへ統合 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| B02 | 既存商品のSky実利用と不便の改善・実行/料金/権利の条件拡張 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/pc-citations-adapter.md) · [記録](docs/evidence/pc-citations/integration.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/sky-rockstar-ledger-20260912.md) · [記録](docs/sky-role-agents-20260912.md) · [記録](docs/evidence/sky-rockstar-ledger/integration.json) · [記録](tests/rockstar-ledger.test.mjs) · [記録](tests/subscription-advisor.test.mjs) · [記録](docs/sky-legal-intake-20260912.md) · [記録](tests/legal-intake.test.mjs) · [記録](docs/sky-patent-assistant-20260912.md) · [記録](tests/patent-assistant.test.mjs) |
| B03 | 実行費用・認証済み収益を既存Walletへ接続し縦断検証 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](app/api/earnings/receipts/route.ts) · [記録](lib/earning-bridge.ts) · [記録](tests/earning-bridge.test.mjs) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) · [記録](docs/evidence/pixel-tool-wallet-correlation-20260916.json) |
| B05 | Wallet連携基礎を使ったSky縦断再試験・PC比較と未実証の端末価値を記録 | 進行中 | [記録](docs/prompts/hub-wallet-next.md) · [記録](docs/hub-wallet-pc-comparison-20260909.md) · [記録](docs/evidence/hub-wallet/b05-pc-machine-20260909/report.json) |
| D01 | RQ12〜15・OS受入雛形・ゲーム作者向け実行プロンプトを保存 | 完了 | [記録](docs/product-baseline.md) · [記録](docs/os-readiness-audit-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/validation.md) |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/templates/os-acceptance-report.md) · [記録](docs/os-operational-validation-20260909.md) · [記録](docs/evidence/os-base/startup-update-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/os-base/registry-negative-b8287bc.json) · [記録](docs/os-acceptance-b8287bc-20260909.md) · [記録](systems/rock-star-os/os/desktop/LAUNCHER-V2.md) · [記録](docs/evidence/rls01/final-d6-ci-20260910.json) · [記録](docs/evidence/rls01/final-d6-root-audit-20260910.json) · [記録](docs/os-local-final-20260910.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| GX00 | 共通Walletの複数owner/player分離・本人接続・既存台帳互換を設計検証 | 完了 | [記録](docs/design-implementation-alignment-20260909.md) · [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx00-owner-isolation-adr.md) · [記録](docs/evidence/gx00/integration.json) · [記録](systems/rock-star-os/os/wallet_backend/FENCE.md) · [記録](docs/gx00-connection-wire-v1.md) · [記録](docs/evidence/gx00/game-protocol-review.json) · [記録](docs/game-connection-node-wire-20260909.md) · [記録](docs/gx00-connections-runtime.md) · [記録](docs/evidence/gx00/game-connections-root.json) · [記録](docs/gx00-legacy-game-basis.md) · [記録](systems/rock-star-os/os/wallet_backend/CURRENT-RESTORE.md) · [記録](docs/evidence/gx00/current-copy-foundations-root.json) · [記録](docs/gx00-current-game-restore.md) · [記録](docs/gx00-owner-connection-client.md) · [記録](docs/evidence/gx00/current-game-integration-root.json) · [記録](docs/implementation-checkpoint-20260909.md) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01 | ATMから独立したゲーム交換契約・両台帳fixture・異常系を実装検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-contract-implementation-plan.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| GX02 | 指定された実ゲームの正式sandbox接続と交換条件を検証 | 未着手 | [記録](docs/prompts/os-operational-base-next.md) |
| DX01 | ゲーム作者向けAPI/SDK・sandbox・複数owner/game分離と導入体験を検証 | 完了 | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| N01 | Linux native OS基準版の公開ソース統合・既存資産の回帰検証 | 完了 | [記録](docs/native-os-integration.md) · [記録](docs/native-os-validation.md) |
| N02 | 起動応答確認と自動再読込WIPの検証・採用判断 | 進行中 | [記録](docs/native-os-integration.md) |
| N03 | 実機候補1機種の型番/SKU・boot/BSP・更新/復旧の適合確認 | 進行中 | [記録](docs/native-os-integration.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](docs/evidence/android-pixel-10-gl066-dsp-source-audit-20260916.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| N04 | Pixel 10受入後だけ二機種目のDevice Support Package候補を再評価 | 未着手 | [記録](docs/device-support-architecture.md) · [記録](data/device-support-matrix.json) |
| N05 | 実USB・外部MCP/AI・金融provider・ToB精算と運営pilot | 未着手 | [記録](docs/native-os-integration.md) |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/rockstaros-1.0-architecture.md) · [記録](docs/rockstaros-1.0-strategy.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) · [記録](docs/release-followup-20260910.md) |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/evidence/launch/progress-audit-20260912.json) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/progress-audit-20260912.json) |
| LCH03 | production署名・保護環境・失効運用 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/owner-setup-20260911.md) · [記録](docs/current-state-20260911.md) · [記録](docs/evidence/launch/sites-owner-private-20260913.json) |
| LCH05 | 制作中CMの完成待ち・内容照合・導入案内への接続 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 | [記録](docs/launch-readiness-20260910.md) · [記録](docs/current-state-20260911.md) |
| LCH07 | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 | [記録](docs/launch-readiness-20260910.md) |
| LCH08 | ローカルOSバックエンドの安全終了・ヘルスチェック・再起動時のreceipt復元を検証 | 完了 | [記録](docs/backend-launch-20260912.md) · [記録](docs/evidence/launch/backend-rc3-local-20260912.json) · [記録](systems/rock-star-os/scripts/verify-backend-launch.py) · [記録](systems/rock-star-os/tests/test_hub.py) · [記録](systems/rock-star-os/tests/test_hub_server.py) |
| FB01 | Instagram運用・受注型ブランド管理をRockstarOS Hub商品とMCPへ統合 | 完了 | [記録](docs/fashion-brand-ops-integration.md) |
| FB02 | 売上・数量・粗利・期限からCampaign Autopilotの計画と次アクションを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB03 | DM履歴・購買意向・顧客情報からAI Sales Conciergeと営業パイプラインを生成 | 完了 | [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB04 | 入金確認後の制作計画・原価・納期・工程をProduction Cockpitで管理 | 完了 | [記録](toolkits/fashion-brand-ops/db/migrations/003_autonomous_operations.sql) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) |
| FB05 | 改善版Skyの役割フィードへブランド運営役と40 MCP操作を統合 | 完了 | [記録](components/sky-workspace.tsx) · [記録](lib/sky-routing.ts) · [記録](tests/sky-routing.test.mjs) · [記録](docs/sky-assistant-and-memory.md) |
| FB06 | Instagram画面の写真から未確認候補を作り、Meta確認後だけ運用対象へ進める | 完了 | [記録](docs/instagram-photo-onboarding-20260912.md) · [記録](toolkits/fashion-brand-ops/db/migrations/004_screenshot_account_intake.sql) · [記録](toolkits/fashion-brand-ops/src/service.mjs) · [記録](toolkits/fashion-brand-ops/test/service.test.mjs) · [記録](components/fashion-brand-ops-runner.tsx) |
| BIL01 | 先払い月額を停止し、検証済み自動化収益からだけ実費後に月最大888 centsを精算 | 完了 | [記録](docs/sky-billing.md) · [記録](services/sky-billing/src/worker.ts) · [記録](tests/billing.test.mjs) · [記録](tests/billing-worker.test.mjs) · [記録](services/sky-billing/migrations/0002_earnings_settlement.sql) · [記録](docs/evidence/launch/backend-owner-validation-20260912.json) |
| BIL02 | 有償自動化商品と販売・決済・払出しProvider sandboxを接続し、Earning Receiptから実送金まで受入 | 進行中 | [記録](docs/sky-billing.md) |
| BIL03 | メルカリを最初の収益経路として出品準備・費用計算・承認・未照合売上の安全な状態管理をSkyへ追加 | 完了 | [記録](docs/mercari-revenue-loop.md) · [記録](lib/mercari-revenue.ts) · [記録](app/api/revenue/mercari/route.ts) · [記録](components/mercari-revenue-starter.tsx) · [記録](tests/mercari-revenue.test.mjs) |
| CSV00 | CSV仕事の35作業を名前空間付きで管理し、コード完成と外部実績gateを分離 | 進行中 | [記録](data/csv-business-tasks.json) · [記録](docs/csv-business-v1.ja.md) · [記録](lib/csv-transform.ts) · [記録](lib/csv-job-store.ts) · [記録](components/csv-business-workspace.tsx) |

段階ゲート（作業全体の完了とは別判定）

| 段階ID | 作業ID | 内容 | 状態 | 先に通す段階 | 根拠 |
| --- | --- | --- | --- | --- | --- |
| B04-INTEGRATED | B04 | 承認後、main/native/設計reviewの3入力と入口を統合 | 合格 | — | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-operational-validation-20260909.md) |
| V01-BOOT | V01 | 旧b8287bc候補のOS起動・安全基礎（現rc2の全体合格ではない） | 合格 | B04-INTEGRATED | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/freeze-b8287bc.json) · [記録](docs/evidence/os-base/boot-b8287bc.json) · [記録](docs/evidence/os-base/platform-b8287bc.json) · [記録](docs/evidence/os-base/native-ui-b8287bc.json) |
| B02-NATIVE | B02 | 既存native商品1件をSkyで実処理・保存 | 合格 | V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) |
| B03-FIXTURE | B03 | 単一ownerの合成Wallet・商品/費用/売上状態の基礎 | 合格 | B02-NATIVE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/os-base/business-wallet-foundation-b8287bc.json) · [記録](docs/evidence/os-base/business-backup-acceptance-b8287bc.json) · [記録](docs/evidence/tool-earning-wallet-bridge-20260915.json) |
| V01-ACCEPT | V01 | 旧9abf78a候補でD0〜D6縦断合格（現rc2へ転用しない） | 合格 | V01-BOOT · B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/os-acceptance-9abf78a-20260910.md) · [記録](docs/os-native-repeat-20260910.md) · [記録](docs/os-final-compatibility-20260910.md) |
| B03-PROVIDER | B03 | 実provider/認証済み収益（別の権限・条件が必要） | 未合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| B05-COMPARE | B05 | Wallet基礎後のPC比較/再試験。実機価値は別判定 | 未合格 | B02-NATIVE · B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) |
| GX00-ISOLATION | GX00 | ADR・複数owner分離/本人接続・互換/復旧の合成検証 | 合格 | B03-FIXTURE | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/evidence/gx00/integration.json) · [記録](docs/evidence/gx00/release-required-acceptance-20260910.json) |
| GX01-CONTRACT | GX01 | 複数owner/gameの交換契約と両台帳fixture | 合格 | GX00-ISOLATION | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) · [記録](docs/evidence/release-candidate-9abf78a/native-ci.json) · [記録](docs/gx01-dx01-acceptance-20260910.md) |
| GX01-UI | GX01 | OS上の交換操作と台帳変更後D4/D5再検証 | 合格 | GX01-CONTRACT · V01-BOOT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-native-ui-20260910.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/game-wallet-release-checkpoint-20260910.md) · [記録](docs/evidence/hub-final-9abf78a/final-c01-completed-stages.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| DX01-SDK | DX01 | 共通SDK・2作者/2game/2owner・fresh導入測定 | 合格 | GX01-CONTRACT | [記録](docs/prompts/os-operational-base-next.md) · [記録](docs/gx01-reference-sdk-sandbox-20260910.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/README.md) · [記録](docs/evidence/rls01/sdk-final-9abf78a/summary.json) · [記録](docs/evidence/gx01/final-9abf78a-20260910.json) |
| PREVIEW-INSTALL | RLS01 | 旧9abf78aのfresh導入・起動・保存・復旧・削除を完走（現rc2へ転用しない） | 合格 | V01-ACCEPT | [記録](docs/release-installation-plan-20260909.md) · [記録](docs/evidence/rls01/final-9abf78a/summary.json) · [記録](docs/evidence/rls01/github-direct-install-9abf78a/summary.json) |
| ANDROID-PREFULL | OS11 | 有料full build前に単体APK・emulator・純正Pixel offline AI・Sky→Zema→Tool→Walletを完走してfreeze | 未合格 | PREVIEW-INSTALL | [記録](docs/phone-preview-20260911.md) · [記録](docs/product-baseline.md) · [記録](.github/workflows/android.yml) · [記録](.github/workflows/local-ai-apk.yml) · [記録](tests/product-baseline.test.mjs) · [記録](tests/test_prepare_phone_build.py) · [記録](tests/test_stage_local_ai_apk.py) · [記録](tests/test_freeze_phone_build_inputs.py) · [記録](docs/evidence/android-pre-full-build-tests-20260915.json) · [記録](docs/evidence/android-local-ai-plan-v2-20260916.json) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |
| DEVICE-INSTALL | RLS02 | 初回flash gate 4/4後、対象1機種でflash・初回起動・OTA rollback・純正復旧を完走 | 未合格 | PREVIEW-INSTALL · ANDROID-PREFULL | [記録](docs/android-first-flash-gate-20260916.md) · [記録](data/android-first-flash-gate.json) · [記録](docs/android-production-signing-custody.md) · [記録](data/android-signing-custody-policy.json) · [記録](docs/android-rollback-index-policy.md) · [記録](data/android-rollback-index-policy.json) · [記録](docs/android-google-stock-recovery.md) · [記録](data/android-stock-recovery-policy.json) · [記録](docs/android-backup-recovery.md) · [記録](data/android-backup-recovery-policy.json) · [記録](docs/android-production-architecture.md) · [記録](data/android-release-architecture-policy.json) · [記録](docs/release-installation-plan-20260909.md) · [記録](docs/phone-preview-20260911.md) · [記録](scripts/freeze-phone-build-inputs.py) · [記録](docs/evidence/android-prefull-input-freeze-20260916.json) |

次の作業: Scalewayの課金確認後、Ubuntu 24.04 / 32 dedicated vCPU / 64 GB RAM / 600 GBで固定sourceをsyncし、Operator Agentを明示除外したbringup modeでtarget-files-packageとotatools-packageをbuildする。RELEASE_FLASH gate、production signing、実機flashは未合格のまま維持する。 AI07はJevをSkyの明示的remote evaluatorとして実装する前に、AI SDK更新または公式HTTP APIを選び、Node/Cloudflare互換、privacy、料金上限、失敗縮退のfixtureを通す。route・同意UI・allowlist rubric・Evaluation Receiptが揃うまでcatalog readyにしない。Sky ToolはPC/Provider実接続で成果本文・失敗・Zema通知をToolごとに受入し、candidateの下書きを本番成功へ算入しない。2026-09-20の34件監査ではローカル成果7件、実画面未完走2件、PC/Provider未接続3件、候補本体未実行22件を確認した。次は未完走・未接続の実成果と失敗表示を個別受入する。SKY19の成功報酬条件確認、AI02〜AI06、full build入力・署名・物理全損復元の未完了gateも独立して維持する。
<!-- project-status:end -->

## 次段階の設計

今後は [製品ベース](docs/product-baseline.md) と [次の実行プロンプト](docs/prompts/os-operational-base-next.md) に従い、native OSの稼働受入、既存商品の実利用、Wallet、作者向けゲーム連携へ進めます。従来のG0→Cuttlefish→Pixel→StoreはAndroid/AOSPの過去計画。旧 [初期仕様](docs/product.md) は履歴として保持します。
