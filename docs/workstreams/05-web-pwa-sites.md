# Web / PWA / Sites

## 目的

Home、Sky、Chat、Wallet、Market、Settings、Studio、事業画面を一つのWeb/PWAとして提供し、GitHub source、build asset、D1 migration、Sites配信版を同じcommitへ固定する。

## 現在地

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
