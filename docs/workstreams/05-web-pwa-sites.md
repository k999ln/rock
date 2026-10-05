# Web / PWA / Sites

## avocadomini.si（2026-10-05、WEB13）

利用者は `k999ln/rock` のホームページを `avocadomini.si` で公開するよう指定した。担当はJOINT。ROCKはmain `aa7f2b41ce34a32c262500a83238bb713c003dee` の `sites/avocado-mini` と公開artifactを同期し、Sitesは配信とTLS、OWNERはDNS管理サービスの接続を担当する。後続指示で、表示対象は `https://avocado-mini.kirin-999.chatgpt.site/` のMini／Proホームと確定した。v3のSIM/eSIMホーム選択は訂正し、Git `5f3a3694` の保存版と公開版に追加済みの会社情報を合わせ、既存画像・下層ページを維持する。

独自ドメインは既存Site `appgprj_6ac31ab12d3481919e9a5379fa0dfbd2` に登録済み。旧 `appgprj_6aaf6a375b908191b3b0c1845dc78291` は現在の接続ではNOT_FOUNDであり、旧Siteを変更したとは扱わない。新規Siteを重複作成しない。DNSは `lunar.dns-parking.com` と `solar.dns-parking.com`、apex Aは `2.57.91.91`、以下のTXTは未検出。利用者からHostingerが指定され、管理画面でこの2件を確認した。変更前のsnapshotは配備記録に保存した。

現在の設定値（apex、www CNAMEは変更せず保持）：

| 種別 | ホスト | 値 |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=pUqZ8awumMyjCjWPI9MH8jvQitA2dIuY8MMrIIju5Xo |

Hostingerで既存apex Aを上記2件へ置き換え、TXTを追加済み（TTL 300）。2026-10-05T05:50:13ZにSites `status=active`／SSL `active`、公開DNSの2つのAとTXT、HTTPSの指定Mini／Proホームを確認した。最初に提示された `_cf-custom-hostname` TXTは、apex経由の認証完了後にSitesの必要recordから消えたため未追加。メール用MXや他サービスのTXTは保持する。未確認のAAAAがあれば競合を確認してから切替える。Cloudflare経由の場合はSitesのvalidationに従いproxyの扱いを確認する。TLS追加validationが返った場合は、その実値を追加する。DNS変更の復旧は変更前のレコードを保存して戻す。Site内容の復旧は既存公開v2を選ぶ。

合格条件は、`npm run build` と `npm test`（Site）、リポジトリの `npm run verify`、Sites deployment成功、独自ドメインの `status=active`／SSL有効化、同ドメインのHTTPSホーム表示を分けて記録すること。DNS設定後は `sites_refresh_custom_domain_status` を同一project IDとdomain ID `appgdom_6ac31bf83b508191b66ba4a7dd437f04` で再実行する。配信済みとDNS待ちを混同しない。[配備記録](../evidence/avocadomini-domain.json)。

## 目的

Home、Sky、Chat、Wallet、Market、Settings、Studio、事業画面を一つのWeb/PWAとして提供し、GitHub source、build asset、D1 migration、Sites配信版を同じcommitへ固定する。

- 2026-09-24、利用者の画像デザインを変更しないことを優先し、生成した差し替え画像を製品Siteから撤去して、提供済みのR5黒スタジオ画像と既存の承認済み画像だけへ戻した。CSSの配置・背景接続だけを調整し、製品の形状・部品・質感は変えていない。中央寄せを上書きしていたanimation、Highlight見出しのfont selector衝突、壊れたRockstarOSアンカー、画像のない疑似回転、重複Highlight、過剰な断定、ARIA、外部font、SEO metadata、旧route redirectも修正。Astro 11 route、Site試験12/12、1280pxと390pxの実ブラウザで欠損画像・欠損fragment・横overflow 0を確認した。GitHub `main` `4dcacf2`、Site source `7388127c8174171f6a6fc3bc4ab7ad33b32d16f3`、公開v64、deployment `appgdep_6ab5db9bbfe08191b88540cf3c136002`。

- 2026-09-24、公開avokado mini SiteをAstro 7.3.5のまま英語中心へ統一した。ホーム、試作計画、Developer Preview、RockstarOS配布状況、販売状況・確認・完了、販売表示、privacy、rocketstar、redirectの11 routeで`lang=en`と日本語UIなしをbuild契約化。390px幅の全routeで横overflow、runtime overlay、console errorがないことを確認し、英語注記の位置ずれと下層共通logoの未指定寸法も修正した。現行R5の1本自律・別Hub不要、実機試験0件、販売停止は変更しない。GitHub `main` `11f0919`、Site source `26e146ecb579f306992abffea7b0c83f23867cf3`、公開v63、deployment `appgdep_6ab5d3eb5b488191b985ab8f901e6576`。[配備証拠](../evidence/avocado-mini-site-r5.json)を更新した。

- 2026-09-24、利用者指定のApple iPhone 18 Proページをレイアウトと操作の参考にし、avocadoMiniの浮いた製品ナビ、製品主役の冒頭、4項目を直接選べるHighlightタブ、装飾を減らした固定スクロールへ整理した。avokado固有の画像・配色・名称・R5内容は維持し、円形軌道装飾を撤去。PCと390px幅で表示・操作・横overflowなしを確認した。GitHub `main` `6622c80`、Site source `133c6b8afc885dd4b7a025e679a5511fec0b35e0`、公開v61、deployment `appgdep_6ab5d14a5ca08191a153ada67bf7c7dd`。[配備証拠](../evidence/avocado-mini-site-r5.json)を更新した。

- 2026-09-24、利用者の画面収録を基準に、Astro移行時に単一静止画へ置き換わっていたavocadoMiniの商品画像を復元した。冒頭の集合ビジュアル、4枚の専用Highlight、正面・側面・背面の0〜180度スクロール切替、センサー接写を再適用し、9画像のbuild契約を追加した。旧Tower20 E3画像は外観・システム検討資料と明示し、現行R5の1本自律・別Hub不要、販売停止、実機0件は維持する。GitHub `main` `c55a651`、Site source `d3d00a08691244313022e2a5cdcc20b5fb779377`、公開v60、deployment `appgdep_6ab5cdf2619c8191912ed31b7ba44cf2`。[配備証拠](../evidence/avocado-mini-site-r5.json)を更新した。

- 2026-09-24、WEB17として公開avocadoMini SiteをAstro 7へ移行した。承認済みの黒いスタジオ・銀色R5・映像型スクロールとrocketstarのデザインは変えず、11 routeをAstroのfile-based pageへ移した。予約・決済WorkerとD1契約は分離したまま`dist/server`へ段階化する。Astro build、route/Worker artifact契約検査、予約API 6件、ローカル実ブラウザのトップ・Rocket Star・販売停止画面を確認した。GitHub `main` `19ea5e9`、Site source `7594bf6904b63e51f1da0930122d819e181e5f79`、公開v59、deployment `appgdep_6ab5cb5a9a908191bced146262803a2a`。[配備証拠](../evidence/avocado-mini-site-r5.json)を更新した。

- 2026-09-24、WEB16のR5同期で意図せず白基調へ変更した商品Siteを、利用者が承認していたv56の黒いスタジオ・銀色製品・映像型スクロールへ復元した。R5の使用時200mm以内・1本自律・同型mini増設・販売停止は維持し、旧E3の4本＋別Hubと価格は戻さない。製品形状を変えず背景だけ黒いスタジオへ馴染ませた画像をトップと販売状況へ適用。予約API 6件、Vite build、R5 package、ローカルブラウザのトップ・中段・販売停止画面を確認した。GitHub `main` `c603119`、Site source `addf07e31f54ea34944e1f5d66b05de7931cf1b0`、公開v58、deployment `appgdep_6ab5c7ab2664819183b1753734f29d18`。[配備証拠](../evidence/avocado-mini-site-r5.json)を更新した。

- 2026-09-24、WEB16として公開avocadoMini商品Siteを現行R5へ同期。GitHub正本の使用時200mm以内・1本自律・同型mini増設・別Edge Hub不要を商品ページへ反映し、旧E3の4本＋別Hub、1本16万円・一式41万円を現行販売表示から撤去した。R5の価格・発売日・販売条件は未確定として予約と決済を閉じ、旧環境変数だけで販売が再開しないR5専用gateへ変更した。51ページPDFと8図面を配布物へ含め、rocketstarとDeveloper Previewの導線は維持する。GitHub `main` source `3eb9c66`、Site source `e08c6d77ecab8a5d46678068c7e0bf99bccd92be`、公開v57、deployment `appgdep_6ab5bbc0bf0881918ed5de323f5ab55e`の成功を別々に確認した。[配備証拠](../evidence/avocado-mini-site-r5.json)に固定する。

- 2026-09-24追加修正: 利用者から完全版設計書が公開ページに見当たらないとの指摘を受け、R1.0原本PDF（44ページ）と全付録ZIPをSiteの`/downloads/`へ同梱。冒頭・OS画面・footerから直接開けるようにし、GitHubだけへ渡す導線を解消した。Site v50（source `8a619bd833e5b80968efdb92c78d7fc51d4d7b6a`）の配備成功を確認。 アプリ内PDF viewerで灰色表示となったため、v51（source `751fd13a9e1f8649fa58c739d4723a0f9e5ad31c`）で全35章の可読HTML reader `/rocket-star/design/` を主導線に追加し、原本PDF/ZIPはダウンロードとして保持した。原本PDF/ZIPのhash一致とZIP CRCを確認し、再生成scriptでダウンロードも配布物へ同期する。公開receiptと結果は[同じ証拠](../evidence/rocketstar-site-r1.json)に追記し、v49の履歴を保持する。R5・実機/飛行の状態は変更しない。

- 2026-09-24、利用者指定の`https://avocado-mini.kirin-999.chatgpt.site/rocket-star/`をR1.0統合設計に合わせて更新した。主担当ROCK、WEB13、HostingはSites、公開とmain保存は利用者の明示指示済み。両段再使用、衛星搭載、A-LINK、RockstarOSとコロニー運用、端末ボタンの境界を伝え、設計計画を実機・飛行合格へ置き換えない。現行R5要求は維持し、今回の対象はrocketstarページ。先行公開済みのヘッダー・ブランド・画像は保持してGitHubへ保存する。Site v49（source `fb580e64dfb775ef517aca7e5f1602eee587adbe`）への配備と公開ブラウザでの新内容を確認。source、配信version、表示・回帰確認は[証拠](../evidence/rocketstar-site-r1.json)へ記録する。再生成は`node sites/avocado-mini/scripts/build-rocketstar.mjs`でこのrouteだけを対象とし、独自配布CSSの残る他ページを全体Vite buildで上書きしない。旧OS Site移行を含むWEB13全体はin_progress。

- Rocket Starの公開構想ページ`/rocket-star/`を、avocadoMiniと同じ黒いスタジオと金属・青いセンサー光の表現へ再設計した。複数機が地上から上がる独自の発射場ビジュアルに、前景のRocket Star、発射台、噴射、煙、地表の後退、大気圏から軌道への変化をスクロール連動で重ねる。表示内容はPurpose、What it does、Fundingの3画面だけとし、RockstarOSを含む接続条件は短い説明に集約した。資金提供と決済は条件公開まで受け付けない。製品Site v34（source `1a78977a0b9272310dfc7e2a062c2ff8bafd7b2e`）として一般公開し、デスクトップと390px幅で表示を確認した。

- avocadoMini予約販売に最終確認、規約同意記録、販売条件・privacy表示、Stripe idempotent retry、通信不明・期限切れ予約の在庫復旧、試行履歴cleanup、Bearer保護の注文一覧・reconcile APIを追加。入力本文上限をheader非依存にし、D1へ規約版・同意時刻・Stripe期限・試行時刻を追加した。試験6件、静的build、閉鎖時の最終確認・法定表示・privacy画面を確認し、製品Site v32（source `169266246a80b9c461be0b613db261f6008889e0`）を一般公開した。販売者情報、送料・発送・取消条件、税込送料込総額、在庫、Stripe秘密情報、管理tokenが揃うまでfail closedを維持する。

- avocadoMiniの商品映像に、行ごとのクリップ表示、強いぼかしから段階的に合焦する冒頭、本文と操作の時間差、回転ツアー章切替時の再表示を追加。章が切り替わる0.78秒だけ製品面へフォーカス移動を入れ、説明文は遅れて鮮明になる。動きを減らす設定では演出を無効化する。製品Site v31（source `22d0fa4832f80d931286186e5f05180a6b9ac2f1`）として一般公開し、静的buildとデスクトップ表示を確認した。

- avocadoMini公開Siteの可視文言、aria label、画像代替文、予約画面の動的状態、予約APIの利用者向けerrorを英語へ統一。英語版の静的build、予約API試験3件、トップ・予約・導入画面の試写を通し、sourceと配布物から日本語文字を除去した。製品Site v29（source `70f544d621c514da9a867ae66747dfc2cc7561bd`）として一般公開した。

- avocadoMiniの予約販売画面とStripe Checkout用Worker・D1注文台帳を実装。1本16万円、4本＋Edge Hub 41万円は利用者指定の税抜予定価格。注文時に全額を受け取る設計で、金額をサーバーで固定し、入金確定は署名済みWebhookのみで処理する。発送時期・送料・販売者名／住所／電話・キャンセル／返金条件・Stripe接続が未確定の間は決済を無効化する。Instagram `kirin.41` は問い合わせ導線であり販売者住所の代替にしない。WEB15の実売上受入はこれらの確定と最終確認画面の法務確認後。

- OS導入ボタンを黒い製品画面に合わせて金属調にし、タワーの青いセンサーを模した光、光沢の移動、矢印の反応を加えた。スマートフォン390px幅とデスクトップで表示し、`/install/`への遷移を確認。製品Site v25（source `bbeb40bd23b568937bdee8eb7e2152b6ab817076`）を一般公開し、公開画面で新しいボタンを確認した。Pixel 10の実インストールは引き続き配布物と安全ゲート待ち。

- 製品ページのOS区間は「RockstarOS」と導入ボタンだけへ集約し、専用の`/install/`を用意した。Screwの実体はPRIVATE/PIXELへのリンク集で、WebUSB実装やRockstarOSイメージは入っていない。Pixel 10用full image未作成、初回flashゲート0/4のため、導入ページは書込み不能を明示してfail closedとする。署名済みfactory image、端末型番・ハッシュ検証、純正復旧、バックアップ／復元、実機受入が揃ってからWebUSB導入を実装・接続する。Mac仮想環境のDeveloper Previewは別ガイドへ進める。デスクトップと390px幅でボタンと導入画面を確認し、製品Site v24（source `7d891cdf0c4454c992ba65ccf614a5d48c4dd86b`）を公開。公開画面の導線も確認した。

- 利用者が再提示したMotion Tower P0.2のPDF・Wordを最新版として照合。3Dツアーの上部3眼を横一列に変更し、待機時にレンズを覆う物理キャップを起動時に開く演出へ修正した。下部センサーは追加構想と明記し、異常時の安全動作とPoE有線給電の説明を設計書に合わせた。図面は公開リポジトリへ複製しない。静的buildとデスクトップ／390px幅の表示を確認し、製品Site v23（source `89949d99fc70474ee73687c4c1618bada13aa7ae`）を公開。GitHub mainは既存PRの統合待ち。

- avocadoMiniの一周後の白い価格カードと大きな無効ボタンを廃止。黒いスタジオ画面に製品名、キット目標価格、購入受付前、製品化企画への導線を並べ、3Dタワーを横または下に残した。1280px・794px・390pxで試写し、静的build、baseline、project検査を通した。製品Site v22（source `ddd1b353f61ad9cf25a90eb6b3e9fe5bd44d1c3b`）を公開。GitHub mainは既存PRの統合待ち。

- avocadoMiniの回転区間を、前・横・後ろの画像切替から連続した3Dモデルへ変更。スクロール角度に合わせて上下の青いセンサー、三段伸縮、3本の脚、4本とEdge Hubを順に見せる。WebGLが使えない環境では旧画像へ切り替える。1280pxと390pxで各章と一周後の価格を試写し、静的build・baseline・project検査を通した。製品Site v21（source `816c09802a2088e4d29af487d6c1c3f5c3714df7`）を公開。GitHub mainは既存PRの統合待ち。

## 現在地

- 回転するMotion Towerが説明の大見出しに重なる問題を修正。デスクトップは左に説明、右に黒い製品面、モバイルは上に説明、下に製品を配置し、一周の横移動と傾きを抑えた。センサー章の重複接写を取り除き、青い発光と一周後の価格は残した。デスクトップの途中角度と390px幅の後半・価格を試写で確認。製品Site v20（source `95dd1fa05b82749c295d3f71ebd9cc020bae828f`）を公開し、新しいCSSの読込みを確認。GitHub mainは未反映で、既存PRを更新する。

- 利用者の最新指定で、avocadoMini製品Siteの青い全面背景を冒頭の黒いスタジオ写真に合わせて黒・金属色へ変更。ハイライト、デザイン、OS導入、下層ページを同系統にし、青い光はセンサーの演出へ絞った。デスクトップと390px幅の試写で表示を確認。製品Site v19（source `ac51ed7cbb64c37deb35f20b08ade219ad840d34`）を公開し、新しいCSSの読込みを確認。GitHub mainは未反映で、既存PRへ更新する。

- avocadoMini製品Site全体を深い青、青白いセンサー光、細い軌道線へ統一。冒頭、ハイライト、デザイン説明、一周後の価格、OS導入案内と下層ページを連続した表現にした。価格は一周後だけ表示する。モバイル390px幅の光位置と見出しを調整し、製品Site v18（source `12801994b732746f6a1eccc7b1e0e5d1296001d7`）を公開、表示を確認。GitHub mainは未反映。

- avocadoMiniの全周回転で上下センサーが正面を向くと、スクロール角度とセンサー位置に連動して青白い光が画面へ広がるCG演出を追加。説明文は前面に保ち、動きを減らす設定では発光を止める。静的buildと製品ベース確認は合格。全体verifyは別作業の設計台帳Tool ID重複で停止。製品Site v15（source `ebe80ff5f039296385f92a280258e412bf9b3b11`）を公開し、デスクトップと390px幅スマートフォンで発光・消灯・価格を確認。GitHub main直接pushは自動審査で拒否され未反映。

- avocadoMini製品ページは一周後の価格表示を残し、その下をRockstarOS導入の1画面に集約。Mac仮想環境向けDeveloper Previewの既存ガイドへ進み、一般向けインストーラー未公開を明示する。静的build済み。GitHub mainの`1ed0f484e804dc5e849304da87ed550c8e0812df`と製品Site version 13に反映し、公開版をデスクトップとモバイルで確認した。
- avocadoMini製品ツアーの外観をP0.2の細い三段伸縮構造と円形ベースに合わせたサテン仕上げの構想レンダリングへ刷新。上部3眼は手・物体の変化と起動時前方180度走査、下部は床に近い視点を補う未検証の追加案として説明する。青い光と4本の空間CGは説明演出。スクロール途中も説明文を不透明に保ち、スマホでは製品と説明の重なりを解消。デスクトップ1280px／スマホ390pxで目視確認。GitHub main `c4ac582`、独立製品Site v12（source `8e5767b`）を公開し、新画像とセンサー説明をスマホの公開画面で確認。並行更新による全体CIのDB分類・Sky台帳・依存license監査の不整合を修正中。
- 公開avocadoMini製品ページの回転区間に、上下の青いセンサーカメラを備える新しいMotion Tower外観案を追加。正面・側面・背面の構想画像がスクロールと連動し、点灯、4本による空間走査、Edge Hubへの情報集約を説明する。P0.2で確定済みなのは上部3基で、下部の数・性能は未確定の外観案として区別する。青い走査線は説明用演出。デスクトップ1280px／スマホ390pxのブラウザで全体表示、上下の点灯、一周後の価格、次のシーンを確認し、静的buildとbaseline検査を通した。GitHub main `0903908`の全体CI成功、独立製品Site v10（source `30db6fd`）の配備と公開画面readbackを確認。ローカル全体verifyは既存のNode試験停止で中断した。
- avocadoMiniの「すべては、空間のために。」より下の回転ツアーを、製品が左右へ移動・傾斜・接写しながら360度を描く6画面構成へ更新。4本・計12カメラ、180度起動走査、伸長条件、安全制御、Edge Hub＋RockstarOSを章ごとに利用価値と合わせて説明する。価格は一周後だけ表示する。デスクトップ1280px／スマホ390pxのブラウザで章切替と価格を確認。GitHub main `3bba627`の全体CI成功、独立製品Site v9（source `d607693`）の配備と公開画面readbackを確認。ローカル全体verifyは既存のNode試験停止で中断した。
- 利用者提供のMotion Tower P0.2設計書を公開製品ページの優先基準に採用。4本＋Edge Hubのキット、税込41万円のキット目標、自立1.2m／ドック検出時1.8m、各塔3カメラ、外部AR表示、安全制御境界へ文言と構想レンダリングを更新。Appleの製品紹介の章立てを参考に、全画面ヒーロー、横送りハイライト、タワー1本の全周回転、価格、OS導入の順とした。提供PDF自体は公開sourceに含めない。GitHub main `1a29a16`の全体CIは成功。製品Site版v8（source `e88bef9`）を独立ドメインへ配備し、公開画面をデスクトップとモバイル幅で確認した。
- avocadoMiniの製品ツアーは全画面固定の6画面スクロールで一周し、回転角に合わせてセンサー、伸縮、ベース操作、OS連携の構想を順に説明する。価格は最後の360度到達後に表示する。デスクトップと390px幅のブラウザで確認済み。GitHub main `5734211`のCI成功、独立Site v6の配備成功と公開画面のreadbackを確認した。
- 公開avocadoMini Siteの視覚表現を更新。構想図を基準に生成した独自の製品全景・ベース接写を全画面で見せ、360度回転と価格表示へつなぐ。画像は実機写真ではないと表示し、販売未開始を維持する。デスクトップとモバイル幅で確認済み。GitHub main `8c9d11b`のCI成功、独立Site v5の配備成功と公開画面のreadbackを確認した。
- 最新の指定: `rockstaros-kaiya.noellesugar1.chatgpt.site`を一般公開avocadoMini商品サイトにし、`/rockstaros`は商品ページの入口。OS操作画面だけを管理者限定の新しい別Siteへ移す。商品sourceは`sites/avocado-mini`。同sourceの別ドメインプレビューは公開済み。旧URLの転用・旧OSの公開停止・新OS Siteの移行は未実施で、旧Site所有アカウントが現在のSites接続から見つからない。
- avocadoMiniの公開製品Siteと旧`/rockstaros` sourceの製品ストーリーを、暗い製品ヒーロー、360度回転、参考価格、設計画像、3場面の体験、OS導入案内へ更新。旧Siteの配備・管理者限定化は所有アカウント接続待ち。新製品Siteのみ実公開を確認する。
- 商品ページの暫定プレビューは別ドメイン。公開avocadoMini製品Siteのsourceを`sites/avocado-mini`へ分離した。`/`にスクロール360度・41万円、`/guide/`に一般向けインストーラー未公開の導入案内、`/crowdfunding/`に募集前企画を置く。製品SiteにOS利用画面・バックエンド・OS Siteへのリンクは含めない。ローカルbuildとブラウザ表示を確認した。製品Siteの別ドメイン`https://avocado-mini.kirin-999.chatgpt.site`を一般公開し、3ページの実URLを確認した。OS Siteの管理者限定設定は未完了。
- 既存`rockstaros-kaiya.noellesugar1.chatgpt.site`は現時点で旧OS利用画面を一般公開している。商品Siteへ転用するには所有アカウントで旧projectを取得し、商品専用sourceを配備する。GitHub main更新だけでは公開画面は変わらない。
- `/rockstaros`はavocadoMiniの公開製品ホームに絞り、OS内部の8領域と開発者SDKの詳細は製品ホームから外した。`/rockstaros/guide`が導入案内、`/`がRockstarOS Webホーム。製品ホームとガイドから`/`への直リンクは外したが、両パスはなお同じSite内にあり、未導入者がURLを直接開く問題は未解決。別Site化または導入判定に基づく制限が必要。
- 利用者提供の伸縮式センサータワーの構想図を主画像とし、同形状の3D設計モデルをスクロールで一周させる。淡い製品ページで価格を示し、OSの導入案内は別ページへ渡す。寸法と画像は設計構想で、実機検証値ではない。
- `/rockstaros`冒頭はavocadoMini構想モデルをスクロールで一周表示し、完了後に希望参考価格41万円と購入準備中の表示、次の画面にOS導入案内ボタンを置く。実機映像や販売開始を示す表示ではない。
- `/rockstaros`はavocadoMini製品ホーム、`/rockstaros/guide`はOS導入案内、`/`はRockstarOSのWebホームとする。Sky、Zema、StudioなどはOSホーム側で使う機能として扱う。希望参考価格41万円と高性能LLM搭載目標は、確定販売価格や現行実装の完成表示と区別する。
- 製品紹介は利用者の「やってみたい」から入り、Sky／Zema／Studioで得られる役割と体験を明示する。料金方針は販売文句の先頭に置かない。
- GitHub READMEの冒頭にはSky／Zema／Studioと設計中のavocadoMiniを示すアニメーションGIFを表示する。
- 製品体系の各説明にも、avocadoMini、RockstarOS、Sky、Zema、Studioの短いループGIFを配置する。README上の表現であり、既存Siteの公開設定や配信版は変わらない。
- GitHubの冒頭はavocadoMiniの外観・利用場面の構想画像から始め、製品別GIFとクラファン企画案へ続ける。製品サイトには`/rockstaros/crowdfunding`の企画ページを用意したが、既存Siteへの配備は未確認。構想画像は実機写真として扱わず、募集ページは未開設で企画案から決済はできない。
- 以前`/rockstaros`に置いていたSky、Zema／Work、Material Invention、Wallet、Market、CSV、開発者の詳細紹介は製品ホームから外した。サービスの実画面はRockstarOS側に残す。GitHub source上の変更であり、既存Siteへの配備は未確認。
- 主要画面、PWA manifest、Service Worker、明示更新、security header、D1 APIを実装済み。
- 既存Siteは一般閲覧できることを匿名HTTPで確認した。対象Sites所有アカウントが現在の接続から見つからず、最新版sourceの反映とログイン後の実操作確認が残る。
- 一般公開後は製品紹介と公開カタログを匿名で見せ、本人別の仕事、Wallet、開発者操作はChatGPTサインインを要する。匿名の`/api/health`でWorkerと主要D1 tableの応答を確認し、本人別APIの受入は別に行う。
- GitHub READMEでは公開の製品紹介とOSガイドを先に案内し、製品ページからOS Webホームへの直リンクを外した。現在のSites接続では既存配信projectを取得できず、最新版配備と認証後の導線は未確認。
- 一般公開の本人意思は確認済み。自作部分の製品license条件と配信先への接続は未完了のため、実公開はblocked。
- GitHub sourceとSites配信版の同一commit確認が残る。sourceの検証結果を配信版の合格へ流用しない。
- 全ローンチ候補のうち本人限定Web/PWA Previewは必須gateが最新版source同期だけ残っており、最短ローンチ経路とする。

主なtask: `WEB01`〜`WEB07`, `WEB09`〜`WEB12`, `R03`〜`R08`, `LCH04`。

## 次に進める順番

1. Web/PWA・D1・進捗の現在差分を、別作業を混入させず一つのcommitへ固定する。
2. typecheck、route style、PWA、security、migration、production buildを実行する。
3. GitHubへ同じcommitを保存し、build asset closureとsource SHAを記録する。
4. 既存Siteの所有アカウントへ接続し、配信側のsourceとDB適用履歴を確認してから同じSHAを配備する。
5. 製品license条件を確定し、既存Siteの公開設定を変更する。匿名ページ・`/api/health`、認証後の主要導線と本人別APIを本番readbackする。QEMUのproduction署名、Androidの対象端末は別gateとして扱う。

## 完了条件

- GitHub、build、Sites versionが同じsource commitを指す。
- migration unionが過去のD1 dataと新規tableを両方保持する。
- Homeから全主要機能へ到達し、全非Home画面からHomeへ戻れる。
- production responseでPWA identity、asset、security headerを確認する。

## 関連資料

- [Deployment integration](../deployment-integration.md)
- [Release artifact access](../release-artifact-access.md)
- [Web validation](../validation.md)
- [Release readiness](../../data/release-readiness.json)

## 検証

- `npm run typecheck`
- `npm run build`
- `npm run release:web-bundle:check`
- `npm run release:web-assets:check`
- `npm run test:api`

配備受入: 既存Sky v30/source 5bdb4ecc0a1f12eb7036163818c4bbb86e224e78、env rev2で公開成功。20候補の処理と保存サイズ照合、2入力反例、candidate/articleの別タブsignin復帰・503時停止・手動2回だけの記録を合成Worker/D1/UIで確認。公開未認証UIで新案内・別タブtarget・実行停止を読み戻した。正本verify692/19/948・exit0、Site type/lint/build/bundle/assets合格。Site全設計検査は元v28に欠けているeSIM設計参照で失敗し、全体greenに換算しない。旧50円completed/stripe_verified/attempt1/rev3を配備後も確認し、新規課金なし。実Cloudは0件/資格情報なし、Pixel 10は現時点Keyguard showing=true。owner desktop/Pixel、Apple Payと実Providerは未受入。GitHub mainはb3e2676、今回の正本変更は未pushでSitesソース保存と区別する。


## 2026-10-02 — CSV受付衝突の保存保護と実公開認証境界

WEB04/ROCK: 旧v30の合成Worker/D1/R2で、別ownerが既存受付IDを指定するとHTTP500になり、先のownerのR2入力が消えることを再現した。全IDの衝突を409として拒否し、同時受付ごとの一意input keyを保存rowへ結ぶ。INSERT応答が不明な時は保存rowを照合し、勝者のinputを削除せず、DB照合不能なら入力を保持する。修正したbuildのCSV実API回帰95項目（同owner replay、別owner、同時受付、成果4種、再起動、削除、期限切れ）が合格。旧v28→v30→v28の更新・rollbackでも同一成果hashを保ったが、停止・バックアップ復元を含む本番復旧gateの合格にはしない。実公開v30で公開2件200、私有API6件と偽認証2件401を確認。非user platform credentialは本人signinの代替ではなく、匿名拒否をowner成功へ換算しない。Pixel 10はshowing/inputRestricted=true。追加課金・実Provider送信なし。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-production-auth-verification.json。Site公開と正本全体verifyはこの修正ではまだ未完了。


配備完了（CSV保存保護）: 既存Sky v31/source c89a651d9e2cd29011f2f6153201a93a82033643、deployment appgdep_6abf90330634819184f3095d248bc118、env rev2で公開成功。配布アーカイブのlocal永続D1/R2による138項目が合格し、旧固定input_keyの成果4種hashを更新後も保持した。旧v28へのrollbackは合成データの読み戻し試験だけであり、既知の衝突不具合を戻す本番復旧手順として使わない。全体verify exit0（692 Node/19 Fashion/948 Worker-D1＋95 CSV-D1-R2）、最後の検査コードlint修正は対象lintと95項目で再確認。公開v31では公開2経路200、私有6経路・偽認証2経路401。旧JPY50円CSVはcompleted/stripe_verified/attempt1/revision3、成果hash99fbb674…を公開D1で再確認した。デザイン・env設定維持、追加課金なし、Cloud実行0。本人の既存ブラウザーはreload後signin待ち、Pixelはロック中。実owner、実Provider資格情報/信頼料金/予算、Apple Pay、停止/backup復元、サポート条件の受入が残り、完全ローンチ未完了。正本変更は未push、Site保存とGitHub main統合を区別する。証拠docs/evidence/sky-csv-storage-verification.json、docs/evidence/sky-csv-storage-publication-verification.json。


## 2026-10-02 — 私有CSVの期限切れ再試行と対の保存復元

WEB04/ROCK: 公開v31の実アーカイブで合成CSVをquality_failedにし、入力を復旧して期限切れへ変更したところ、retryがHTTP200/completed/attempt2になった。取得/初回acceptだけの期限確認では不十分なため、共通processCsvJobのclaim前にも期限を確認し、ownerのexpired rowとobjectsを削除して410を返す。匿名/別ownerは削除へ進めず、期限内の品質再試行は引き続き可能とする。修正build、API回帰、全体verify、公開はこの差分では未完了。

別の合成stagingではv31 Workerを停止しD1/R2を対でsnapshot、保存領域を実際に喪失させ、整合manifestを確認して対で復元した。owner row、入力hash/metadata、成果4種hash、実行event、snapshot前の削除保持、復元済み期限切れの410・purge、別owner/匿名拒否、改変snapshot拒否の82項目が合格。復元観測349msはlocal fixtureだけであり本番RTOではない。snapshot後のowner書込は0。本番Sites backup/restore、offsite暗号化・保持期間、snapshot後の削除journal replay、停止操作の受入は残る。旧脆弱版へのproduction rollbackは使わない。証拠docs/evidence/sky-paired-storage-recovery-verification.json、docs/evidence/sky-csv-expiry-verification.json。追加課金・実Provider送信・本番データ喪失なし。


配備完了（期限切れ再試行）: 既存Sky v32/source 5fcfe884d7038723e228156a54bfd78bfcabde89、deployment appgdep_6abf94008be08191953fc7c67e647eb0、env rev2で公開成功。正本verify exit0（692 Node/19 Fashion/948 Worker-D1＋113 CSV-D1-R2）。Site type/lint/build/bundle/assetsと113回帰が合格し、同じ配布アーカイブでexpired retry 410、対snapshotの実喪失/復元を84項目確認。旧JPY50円受付と成果hashを公開D1で再確認し、追加課金なし。環境keyは既存Stripe4件のみでOPENAI_API_KEYなし。本人desktop接続確認はsignin待ち、Pixel 10はshowing/inputRestricted=true。実Provider key/信頼料金/予算と両端末owner・Apple Pay・本番backup/削除journal・サポート条件は未受入。正本未pushとSite保存を区別し、完全ローンチは未完了。証拠docs/evidence/sky-csv-expiry-verification.json、docs/evidence/sky-csv-expiry-publication-verification.json。


## 2026-10-02 — GitHubへのCSV修正の切り出し

WEB06/ROCK: 正本main b3e2676から今回のCSV受付衝突/競合cleanupと期限切れprocessing/retryだけをbranch codex/sky-csv-storage-retentionへ切り出し、commit05f676338944f60e05552b22dddc6f50453e3be6とdraft PR https://github.com/k999ln/rock/pull/51 を保存した。main自体のlockfile・migrationでtype/lint/build/design、172 Worker API＋113 CSV-D1/R2が合格。全文verifyは既存visual-system baseline不整合でexit1。Node全体440中429pass/11failで、PR差分を退避した未変更main controlも同じ11失敗。GitHub同一HEADのCI run37002726882もNode22.23.3の同じbaseline assertionでfailure。署名制御CIはsuccessであり一般verifyの代わりにしない。デザインや未反映のStripe/Cloud/SIMをこの差分へ混ぜず、mainへのmergeは未完了。公開Skyはv32/source5fcfe884を維持し、PRは公開版の全sourceではなく同等CSV修正だけ。自分の合成runtimeとGitHub保存済み一時worktreeを整理し、正本・本番データを触らなかった。次は既存mainの検査/文書/migration不整合を既存デザインを維持して解消してからCI/mergeを判断し、owner desktop/Pixel・実Provider credential/rate/budget・Apple Pay・本番復旧/運営受入を続ける。証拠docs/evidence/sky-csv-github-sync-verification.json。完全ローンチ未完了。


2026-10-02 Sky引継ぎ（GitHub検証復旧）: PR #51のhead `691fb279a3c4238ef46f956a76b558c987bac850`でfresh npm ci／Node22.23.3の全体CI `37004335830`とrelease-signing `37004335480`がsuccess。既存pale-blueにbaselineを合わせ、英語README、37-table migration union、Fashionの現行保存buttonを検証する。CSS/componentは変更せず、CSV保存衝突・期限切れretry修正は維持。CIはNode441、Fashion19、Worker-D1 172、CSV-D1/R2 113、bundle131・asset114/missing0と公開crypto fixture303/rejection142を通過した。証拠`docs/evidence/sky-release-verification-alignment.json`。canonical dirty treeの同名tests/migration-unionは別の67-table作業を含むため、37へ上書きしない。PRはdraft、mainはb3e2676で未merge。live Skyは同じprojectのpublic active v32をnative取得で確認し、env revision2はStripe用4キーだけ。初回publicationフィールドのv28とは別にcurrentRuntimeReadbackへ最新v32を明記した。desktopはサインイン待ち、Pixelはkeyguard表示。実Cloud/owner journey/Apple Pay/production復旧は未受入。次は不足するproviderの本人設定とowner実機・desktop受入、main統合判断、運用gateを進める。キーをchatへ貼らせず、owner操作を代行認証しない。

- 2026-10-02 WEB04: 共通接続確認は成功配列応答だけで実行を許可し、503/切断/timeout/不正応答では入力保持・読取再確認・明示実行へ復旧する。接続設定は取得失敗中の保存を止め、復旧時に編集入力を上書きしない。[合成ブラウザ証拠](../evidence/sky-access-recovery-verification.json)と[Tool詳細設計](../sky-tools-complete-design.md)を参照。本人実機・実AI・本番公開の受入を別記する。

### 未統合の商品PRの取り込み（2026-10-05）

PR #40（`0d2b758f`）は2026-09-24時点の日本語README、R5先行トップページ、`avokado mini`への表記統一とその生成物を扱う履歴である。現mainは `97d185ea` / `aa7f2b41` でSIM/eSIM-led service accessを主導線とする英語版ホーム、独立したMini / Proページ、現在の利用権・課金未受入表示へ更新済み。このため#40の履歴をmerge parentとして保存し、旧ページ本文・旧hero・旧生成CSSによる置換は採用しない。原本は同PRの履歴から取得でき、現行製品名・現mainのREADMEと公開サイトsourceを巻き戻さない。

PR #61は独自ドメインのcanonical、sitemap、hosting参照と既存の配備記録を取り込む。混入していたSky Billing dry-run生成物は変更対象のsourceがなく、この統合では現main版を保持する。このローカル統合自体ではDNS変更、Site配備、外部回線・Providerへの操作を実施していない。
