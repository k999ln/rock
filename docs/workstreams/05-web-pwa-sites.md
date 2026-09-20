# Web / PWA / Sites

## 目的

Home、Sky、Chat、Wallet、Market、Settings、Studio、事業画面を一つのWeb/PWAとして提供し、GitHub source、build asset、D1 migration、Sites配信版を同じcommitへ固定する。

## 現在地

- 公開avocadoMini Siteの視覚表現を更新。構想図を基準に生成した独自の製品全景・ベース接写を全画面で見せ、360度回転と価格表示へつなぐ。画像は実機写真ではないと表示し、販売未開始を維持する。デスクトップとモバイル幅で確認済み。
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
