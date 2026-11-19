## Miniの製品紹介構成（WEB04／WEB06・ROCK）

## 公開作業の入口

2026-11-02の本人の「Columbiaを完全削除して統一」に基づき、総合・Eve・Noahの公開先は **avoado.si** の既存Siteを使用する。

| 用途 | Site ID | 現在の状態 |
| --- | --- | --- |
| 正規の公開先 `avoado.si` | `appgprj_6abdfad4c5648191bcae957913bd02fa` | public、v142、domain active |
| 退役対象の旧Columbia | `appgprj_6aa444b6e6508191a19f16405d0be927` | owner-only、独自domain解除済み、本人の追加判断で未使用のまま保持 |

2026-11-02にPR #312で公開Eve/Noahとmain固有契約を統合。正本はGitHub main `9393ed97fc0333ed3a26be49c86b87fd21254b50`、公開v142 sourceは `0b367167508cf286e32aac5424c9f92e55114e6f`。両方の全ファイルtreeは `b667370c40a8792da823e68d6714be52c8c24308` で完全一致。Sitesの64MiB上限に合わせ現行sourceのsnapshotを配信し、不要な履歴blob転送は実行しない。証拠は[main統合・公開](../evidence/eve-noah-main-alignment.json)。

検証済みcheckoutは `/private/tmp/avoado-main-align-20261102`。次回はGitHub mainとSitesの最新sourceを読み直し、修正をmainへ統合した後に同一treeで配備する。主担当G04/WEB04・ROCK。合格は `npm run verify`、同SHA CI、`git diff --exit-code <main> <publication> --`、Sites deployment成功、公開UI読戻し。公開SQLは既存drizzle-main系統を維持し、旧main履歴はdrizzle-legacyの監査用。新規Siteを作らずMini/Proの別ドメインを維持する。

共有Rootは並行変更を持ち `.openai/hosting.json` が旧Columbiaのままなので、ここからは配備しない。main統合は隔離checkoutで完了しており、共有Rootのruntime上書き・旧private受入の本体publicへの転用は行わない。

[退役証拠と判断](../evidence/columbia-site-retirement.json)。本人の追加指示「これは別にどっちでもいい、使わないから」により、旧Sites URLは非公開・未使用のまま保持してよい。完全削除とそのためのログイン依頼は不要。公開停止を完全削除とは呼ばず、今後の作業先はavoado.siとする。

Apple現行実ページを本文/ブラウザ/画像で確認し、導入・Foundation・Design gallery・Experience・Eve/OS・黒いTechnology・開発状況の順へ再編。素材は既存採用分、内部scrollは後半、72本一覧保持。Sites v69/独自domain・390px・gallery/dialog/chipを確認、build/48試験成功、root DB状況再生成待ち。ROCKはWeb/配信、EXTERNALは機器/モデル、JOINTは実機統合、OWNERは仕様/発売。実機/販売gate維持。証拠と次作業は[記録](../evidence/avocadomini-editorial-structure.json)。検証: Site `npm run build` / `node --test tests/*.test.mjs`、正本 `npm run verify`。

## Higgsfield素材一覧から採用（WEB04／WEB06・ROCK）

ローカル保存分だけで採用を決めず接続libraryを確認。metadata72件/4本の映像比較から、22秒携行と4秒天井macroを主ページへ採用、72本一覧へ追加。Sites v68独自domainで2本readyState4、local390px/720p。build/48試験成功、root DB状況再生成待ち。合成前plate・実機・販売を完成へ昇格しない。ROCKはWeb/配信、EXTERNALは機器/モデル、JOINTは実機統合、OWNERは仕様/発売。証拠・同SHA・次作業は[記録](../evidence/avocadomini-higgsfield-library-selection.json)。検証: Site `npm run build` / `node --test tests/*.test.mjs`、正本 `npm run verify`。

## Mini宣材選抜と虹色chip接写（WEB04／WEB06・ROCK）

主ページを黒背景のscroll hero・船/森2場面・建築1本・開発状況へ絞り、虹色chipのlogoまでzoom。70本archiveは保持。Sites v67/独自domainの逆scroll/390px/選抜を確認。build/48試験成功、root DB状況再生成待ち。ROCKはWeb/配信、EXTERNALは機器/モデル、JOINTは実機統合、OWNERは仕様/発売。実機/販売gateは保持。証拠・同SHAと次作業は[記録](../evidence/avocadomini-curated-rainbow.json)。検証: Site `npm run build` / `node --test tests/*.test.mjs`、正本 `npm run verify`。

## Miniのスクロール接写・透過（WEB04／WEB06・ROCK）

既存15秒構想を240frame×2サイズの固定canvasへ変換し、接写・透過・内部・外観復帰をscrollに同期。5章button/skip・日英・縮小動作/通信節約fallback、最大20枚cache。Sites v66同source/独自domainで逆scroll・PC・390pxを確認。build/48試験成功、root DB状況再生成要求は未解決。実回路・実機・販売gateは保持。ROCKはWeb/配信、EXTERNALは機器/モデル、JOINTは実機統合、OWNERは仕様/発売条件。証拠と次作業は[記録](../evidence/avocadomini-scroll-product.json)。検証: Site `npm run build` / `node --test tests/*.test.mjs`、正本 `npm run verify`。

## Mini製品構成と宣材集約（WEB04／WEB06・ROCK）

70本の現行採用宣材を映像一覧へまとめ、主ページを体験・携行・建築・デザイン・技術表現の章へ再編。透過favicon、スマホ/日英/遅延再生を確認。Sites v65で独自domain読戻し成功。70本一覧・虹色/建築/social再生・390px/検索/日英を確認。ROCKはWeb/配信、EXTERNALは機器・モデル、JOINTは実機統合、OWNERは製品仕様と発売条件。実機/販売gateは変更なし。合格証拠と次作業は[記録](../evidence/avocadomini-story-collection.json)、再検証はSiteで `npm run build` / `node --test tests/*.test.mjs`、正本で `npm run verify`。

## Mini詳細5本の掲載補完（WEB04／WEB06・ROCK）

v64は15秒全体紹介とセンサー/本体ドック/銀色・虹色chipの5本をデザイン欄直後へ追加。5本の読込、日英、390px/720p、keyboardを確認。架空の内部構想と実回路を区別し、追加生成なし。Site46/46とbuild成功、root database:checkの既存停止を保持。実機/販売/一般ローンチgateの変更なし。同SHA・配備・正本GitHub未反映と次の照合は[証拠](../evidence/avocadomini-detail-films.json)。

## Miniの携行利用映像とサイト統合（WEB04／WEB06・ROCK）

船・列車・森のロッジ・海辺ホテルの制作コンセプトを既存Miniサイトv63へ統合。日英4tab/一つのplayer、画面外停止、mobile720pとdesktop1080pを使用。Site46試験とbuild、独自domainで全4読込・390pxを確認。実機通信・空間表示・電池/固定の受入とは分ける。詳細と同source SHA、配備ID、正本GitHub未反映、root database:checkの既存停止は[証拠](../evidence/avocadomini-portable-work.json)を参照。再検証は隔離sourceで `npm run build` と `node --test tests/*.test.mjs`、正本で `npm run verify`。次は同SHA patch/media hashの正本照合と既存DB状況再生成。

## avocadoPro OS画面（WEB04/WEB13・ROCK・2026-10-22）

ProドメインのrootをブラウザOS previewへ変更し、Eve下書き・ローカル作業ボード・Sky/Eve導線・Systemを提供。従来の実部品参照と6段階組立、米国first-build希望は `/build/` に保持。ROCKは画面と公開ルーティング、JOINTは本人アカウント/同一job/費用承認の結合、EXTERNALはモデル・Pro実機とnative OS、OWNERはPro仕様・予算・発売条件を担当する。合格証拠は[Pro OS画面](../evidence/avocado-pro-os-interface.json)。公開Sites v46でroot/build各200、Mini従来root200、Mini未承認OS `/os/` 404を読戻し。Sites 40/40、ローカルSite25/25、全体 `npm run verify` exit0（API2061、CSV113、Web asset212/欠損0）。ブラウザ内下書きは実Eveへの送信ではなく、ボードは本人別server保存ではない。次は既存Eve/仕事APIと本人認証・revision/予算上限を接続し、同一jobの成果/復旧を検証。Pro native image/実機受入をWebの合格へ転用しない。検証: `npm run test:avocado-mini-site`、`npm run verify`、公開HTTPS読戻し。

Eve→smis→Web/Pixelの実行一周は、本人の2026-10-23の明示依頼。目的の確認、本人用Agent保存、同一ID/revisionの端末登録、準備済みモデルでの実行、同じaccountへの成果保存までを対象とする。設定保存・fixture・build成功だけでは実UI/実機の一周合格としない。正本は[実行一周の証拠](../evidence/eve-smis-execution-loop.json)。

## 共通runtimeの既存サービス接続（WEB04 / OS10 / SKY21・ROCK）

CORE02。新しい顧客DB/台帳を作らず、既存device-linkとEve queue/replica/historyへ共通kernelを結ぶ。詳細11項目は[共通runtime接続](../rockstaros-complete-design.md#portable-runtime-service)、証拠は`../evidence/rockstar-runtime-service-bridge.json`。旧Pixel ABIと24件を保全し、15 store/43 package試験、実Worker、実Mac、本人grant、公開、新Pixel実機を区別。EXTERNALはモデル/OS、JOINTは実hostと同じartifact、OWNERは新端末grantの最終承認。

## 継続する関連timeline（HOME01 / WEB04 / SKY21・ROCK）

追補: 長時間の新着受信を枠の満杯で停止しない修正、日本語分割、先頭自動表示/閲覧・入力中保留、遅着とstaleの区別を同じ公開Siteへ反映する。新しい権限・外部費用・投稿は作らない。合格証拠は上記timeline evidenceのrefreshRevisionへ追記する。

本人の最新指示で既存Homeを動的な関連feedへ拡張。契約は[全体設計](../rockstaros-complete-design.md#sky-continuous-timeline)、[証拠](../evidence/sky-continuous-timeline.json)。12件追加、source多様性、snapshot cursor、25秒確認/60秒news、pause/hidden/offline/backoff、new head通知、owner/key再確認。ROCKはWeb、EXTERNALは実供給、JOINTは公開UI、OWNERは接続/共有。実X・端末OS受入と分ける。fixture28合格、公開source/UIは次。

## EveのLLM表示（WEB04/OS10/SKY21・2026-10-21）

ROCKはEve名、担当、実基盤、実行先の表示整理を行う。API/許可/job入力を変えず、未学習を表示する。合格は全体設計eve-cross-device-syncの表示契約、ML必要要件はllm-evaluation-architecture.md#eve-training-prerequisites。公開sourceと実UI読戻しをlocal検証と分けて記録する。

## 2026-10-21 — 独立登録の公開と本人認証待ち（WEB04/OS10/SKY21・ROCK）

公開v98で `/account` と本人別APIを配備。実装・失敗/復旧・承認の正本は [独立登録契約](../rockstaros-complete-design.md#independent-rockstar-account)、証拠は `../evidence/rockstar-independent-account.json`。実署名10件/local Worker31 assertionsと、本人認証器/実Pixel/独立security reviewを分ける。OWNERは新credentialの作成と復旧コード保管、JOINTは同一ownerのWeb/Pixel一周。次は既存22件を保全して独立ログインを受け入れる。

## 2026-10-21 — Eveの公開入口とPixel同期

Web/ROCK、OS10/SKY21/WEB04。本人指定のavoado.si/os/eve、同一ownerの会話/仕事/成果の複製表示、明示Web依頼の固定端末への引継ぎを実装。合格は正本の`eve-cross-device-sync`節と証拠に従う。旧UI6件はredirect、ニュースv90は保持。公開DBは既存drizzle-mainを保全し新6テーブルだけ追加。`npm run typecheck`、同期fixture、`node scripts/check-work-api.mjs`、`npm run verify`、公開SSO/コード承認/実Pixelの往復を別記録する。

## 投稿ソースの受け皿（HOME01/WEB04/SKY14/15/21・ROCK）

本人訂正に従いAPI/MCP接続とXの投稿供給元を分離。既存Connectorのslot/passport/prepare/executeを再利用し、sky_timeline_read→sky.timeline.v1→native Homeを追加。X OAuthは任意設定。source/結合fixtureと実X未接続を分ける。次は供給元のAdd/本人認可/本物の投稿/更新/停止のJOINT受入。正本は[全Tool設計](../sky-tools-complete-design.md#投稿ソースのapimcp受け皿sky-timeline-receiver)、設定は[運用](../x-account-setup.md)。検証は新parser/MCP結合、npm run design:check、npm run verify。

[開発実行プロンプト](../prompts/rockstaros-sky-timeline-receiver-development.md)に、先行スレッドの最新訂正、GitHub main/branchの差、FEED01〜05、source選択のowner保存、費用申告と実Provider投稿の独立受入をまとめた。

## 2026-10-21 — X本人連携とSky独自配色

本人がX本人のフォロー/おすすめ実投稿のnative Home表示と、Xと違う色/入口を明示した。Homeはアイボリー・深緑・ブロンズ、入口Sky、タブあなたへ/つながり。本人OAuthのread-only adapter、暗号化owner保存、429/日次上限/停止を追加する。[詳細正本](../rockstaros-complete-design.md#本人x連携とskyの固有配色sky-x-account-native-feed)。X側のアプリ/利用枠/本人認可は未設定、For You取得経路は未確認のため実投稿の合格にはしない。ROCK: HOME01/WEB04/SKY21、EXTERNAL: X、OWNER: 契約/予算/認可、JOINT: 実投稿受入。

## Home全体の投稿型frontend（HOME01・WEB04・SKY21 / ROCK）

本人の追加指示により、timeline限定からHome全体のnative post表示へ拡大。責任・入出力・保存/失敗復旧・合格条件は[全体/Tool共通設計](../rockstaros-complete-design.md#homeを投稿そのものにするhome-native-post-frontend)。既存social/HF/Tool/feature AddとEve handoffを再利用し、実投稿とcatalog metadataを混同しない。local browser/全verifyを確認し、X個人feed/Pixel/公開/実課金は別受入。証拠`docs/evidence/home-native-post-frontend.json`。

## フロントの構図と操作品質（HOME01・WEB04・SKY12 / ROCK）

本人の2026-10-20指示により、[共通設計](../rockstaros-complete-design.md#frontend-composition)でPC約62:38、スマホ一列、主操作・実行先要約・実仕事を優先する。黄金比の普遍的優越と実ユーザー統計は未実証。ROCKはHome/共通UI/Pixel表示、JOINTは実端末と外部実行、OWNERは最終的な使いやすさの評価。既存の権限/費用/保存を維持し、全verifyと実表示を別々に受け入れる。証拠docs/evidence/frontend-design-refinement.json、他の端末と全Toolの移行は継続対象。

## eSIMから共通RockstarOSを接続する発明（SIM01・WEB06・SKY21 / ROCK、2026-10-20）

本人追加指示により、標準提供を既存OSへの共通runtime接続へ変更。機種別full OSを標準利用の前提にしない。[11項目の発明設計](../sim-led-product-architecture.md#esim-service-attachment)と[protocol案](../../contracts/rockstar-service-attachment.json)が入口。ROCKは開通/本人/契約の準備処理・能力交渉・job/成果/費用/失効と子端末接続、EXTERNALは許可したeSIM/appletとhost API、JOINTはOSを書き換えないiPhone/Pixel実profileの一周、OWNERは発行元/地域/料金と端末追加承認。接続証明の純粋検証は合成鍵3/3の局所実装まで進んだが、issuer/端末要求/API/DB/Linux/請求との接続は未受入。[開発実行プロンプト](../prompts/sim-esim-service-onboarding-development.md)に原因、修正順、合格証拠、未解決条件を記録した。既存device-install証拠をiOS用の架空receiptで代替しない。完全無操作起動は別gateとして残す。

次はmain/引継ぎ同期→接続protocolの純粋logic/fixture→許可したtest profile/applet→同一job/usage→失効/復帰。検証入口はproject:update・design:check・baseline:check・project:check・verify、実機では全tap数と同一job/revision/hashを記録する。旧native/QEMU/Pixel内Linuxと一般公開保留を維持する。

## Sky基盤とZoom/Planner共通契約（SKY14・SKY15・SKY21 / ROCK）

最新の明示指示はSky基盤→RockstarOS→機種別adapter、Zoom/Plannerを共通基盤へ接続すること。ROCKは共通request/result、workflow/owner保存、scope/停止/持出し、私的local受渡しを担当。EXTERNAL/JOINTは実Zoom/OS/Provider/本番SSO、OWNERは素材・採用・費用・公開条件を決める。[正本11項目](../sky-tools-complete-design.md#sky-foundation)。本人用永続APIは未設定で404、Lab/channelは本番404、一般公開しない。Planner sourceは指定チャットの既存checkoutにlocal-only分岐とcompanionを追加し、公開版分岐/個人データ/配備を変更しない。元task fingerprintとSky job/revisionを照合して確認待ちへ戻す。COOP保持のため短命窓口を使う。検証は集中`tests/sky-app*.test.mjs`/Zoom/export、既存Planner AMC試験、Worker/D1 API、実browser、project/database同期、baseline/design/全体verify。

# Web / PWA / Sites

## PixelからWeb会員登録・ログインへの入口（2026-10-21 / WEB04・OS10・SKY21、ROCK）

本人の画面指摘により、Pixel Eveの独立した同期画面は登録・ログイン入口へ変更した。既存の`/account`でパスキー登録/ログインし、元の端末コードを`/connect/device`へ引き継いで本人が承認する。WebのHttpOnly/SameSite=Strict Cookieはブラウザ内だけで使い、Androidには既存の端末専用grantをKeystore保護で保存する。ROCKは画面/戻り先/状態分離、EXTERNALはブラウザ認証器と配信、OWNERは本人登録と端末承認、JOINTは同一Pixelの実機読戻しを担う。`npm run typecheck`、認証11試験、`npm run design:check`、`npm run verify`がhost合格。端末APK再build・実機/公開読戻しは未完了。次は同一候補で登録→端末承認→Eve履歴、失効とLinux切断時の表示を確認する。[全体契約](../rockstaros-complete-design.md#independent-rockstar-account)。

2026-10-21の`avoado.si/os#news`公開はHOME01/WEB04/SKY21のROCK実装。GDELT DOC 2.0の公開metadataを固定queryで読み、元媒体の見出し/HTTPS URL/GDELT検出時刻をSky Homeに表示する。EXTERNALはGDELT/媒体の供給と権利、JOINTは公開URLのDNS/TLS/同一配信版・元リンク・429時の古さ/失敗表示、OWNERは追加配信元/日本語/編集責任とEve News掲載範囲を決める。`node --experimental-strip-types --test tests/eve-news-feed.test.mjs tests/eve-news.test.mjs`、`npm run design:check`、`npm run verify`でsource側を検査する。公開Sites v90/source `0f0099f`/deployment `appgdep_6ad8a0ac7e4c8191ae1c6f1b506b3901`成功、`avoado.si/os`と`/api/news/feed`はTLS/HTTP200、ブラウザで8件とstale表示を読戻した。24時間seedの期限後に429が続けば表示は失敗状態に戻るため、durable cache/権利確認済みsource追加が次の条件。Eve News weights/生成記事は未公開。

同日、本人の指摘により旧アイコン型Homeへニュースを後付けした公開v90/v91を修正。現行`components/home-screen.tsx`のSkyタイムラインをSite v92のEve同期版へ統合し、ニュースをタイムライン内に配置したv93を公開。Site専用D1追加migration `0027_os_timeline.sql`、集中Home/Social/Community20/20、router9/9、typecheck/build、公開ブラウザで旧Homeなし・ニュース8件を確認。次回Sites配備もv93以降の同一sourceを起点にする。

## 画面・導入体験の受入（WEB04・WEB06・WEB13 / ROCK、2026-10-20）

本人指定の対象は、3ドメインの役割と相互導線、Home・Sky・Eve・Wallet・設定、依頼→状態→停止→成果、端末幅とタッチ/キーボード/読み上げ、コントラスト/フォーカス/操作領域、低速回線、PWA導入/更新/圏外、通知許可と失敗時の代替、画像の出自、DNS/TLS/配備版、localhost Lab分離、説明/失敗案内/exportである。ROCKは画面・状態・静的導線、EXTERNALは配信/通知基盤、JOINTは実端末・同一配備版の操作、OWNERは通知許可・公開判断を担当する。`avoado.si`は総合/Sky入口、`avocadomini.si`はMini、`avocadopro.si`はProとして扱う。

今回の局所実装では、Service Workerに非個人化された`/offline.html`を事前保存し、未保存画面の通信失敗時に現在状態を未取得と明示する。APIをオフライン画面で代替しない。`node --test tests/pwa-offline.test.mjs tests/pwa-installability.test.mjs`の4件と`npm run build`は合格。3ドメインのDNS/TLS/HTTP 200とトップページ相互リンクは実URLで読戻したが、配信SHAと現在のGit sourceの一致、通知許可/失敗代替、低速回線、読み上げ/キーボード/タッチの一周、本人別exportはこの局所検証の合格範囲外。新しい公開・実機対応・本番受入の宣言には使わない。変更後のproduction buildをWrangler 4.151.2で再実測し、8経路のsecurity header検査、`/sw.js`と`/offline.html`のsource byte一致、`release:check`が合格した。`npm run verify`はlocalhost許可下でWeb asset 188参照/欠損0まで進んだが、最後の`test:api`でディスク空き約214 MiBによるMiniflare SQLite `SQLITE_IOERR_SHMSIZE`で停止した。次はレビュー済みの一時容量を確保し、`npm run test:api`と全体verifyを再実行する。その後、画面幅/入力方式/読み上げ、低速/オフライン、通知、export、配備SHAを同一候補で別々に記録する。

## avocadoPro分解スクロールと構成キット（WEB13・DSP01 / ROCK、2026-10-18）

利用者の「スクロールでProの中身が分解され、最後に他のキットへ変えて好きなPCを作る」要望を、既存Astroの`/pro/`へ実装する。冒頭はStudio系外観案、続いて筐体、冷却、GPU、CPU/基板、RAM/SSD、電源、吸排気をスクロールで段階的に引き離し、対応する説明を表示する。終点からValue／Performance／GB10研究の構成UIへ進み、x86はGPU・RAM・SSD・筐体/冷却候補を選べる。5090の筐体/1000W以上の電源境界を自動反映し、ARM GB10ではx86用の部品操作を無効にする。図は構造理解用の表現で実寸CADではない。価格、注文、供給、互換、本番OSは未受入として表示する。

ROCKはsource/操作/境界とbuild、EXTERNALは実部品・driver・供給、JOINTは対象実機と配信同一版の表示・性能/互換、OWNERはSKU/販売/公開条件を担う。合格はDesktopと390px幅で各段階と構成切替を操作し、Astro build・Site試験・baseline/design/project/verifyを通すこと。GitHub保存、正式`avocadopro.si`への配備、DNS/TLS読戻しは別記録。一般公開は保留。

2026-10-18のドメイン再確認: 既存Sites project `appgprj_6ac31ab12d3481919e9a5379fa0dfbd2`で`avocadopro.si`と`avocadomini.si`はactive、DNS/TLSもactive。公開version 20ではhost別ルートが`avocadopro.si/`を旧Game Hubページへ配信していた。公開元を取得し、ローカルで作成したPro分解/キット体験をhost routing付きsourceへ統合した。`avoado.si`のPro導線は現行sectionへ合わせ、旧Pro参考価格を撤去。Astro 14ページbuild、Sites側test 33/33合格。Site source commit `dd71d7833380ae159f4e805e4629a657149542b4`をpushし、version 21を保存した。本番deployは一般公開保留との境界で自動承認審査が一度拒否したが、利用者が既存public Siteのv21更新を明示承認したため実施し、deployment `appgdep_6ad55c9d5bb88191b02357a71dacf48b`が成功。`avocadopro.si/`でAI PCページ、5090→Expanded Air/1000W+、GB10→x86操作無効、Mini rootでMini R5、総合rootで現行Pro導線を実URL読戻しした。root `npm run verify`も待受許可後exit 0。`avoado.si`には古いMini/Tower20参考価格・画像が残るため別件で整合を要する。GitHub mainへの保存、Site source保存、version保存、実配備は別状態。一般製品ローンチと実機受入は保留。

同日の表示改善（WEB13・DSP01）: GPU選択時に外装が重なって見えない問題を、選択層の強調と取り外した層の減光で修正。7層へ役割と未検証項目、番号付き直接操作を追加。Value／Performance／GB10の各構成に別の外観form studyを表示し、構成概要の画像も同期する。画像は部品実装や量産の証拠ではない。ローカルと公開元のAstro build、21/21・33/33試験がpass。Site source `f72adb949cf128f253af866358366635f836d55d`、v22、deployment `appgdep_6ad55f5568e8819181839d012736046d`が成功し、公開URLで[GPU層の表示](../evidence/avocadopro-v22-gpu-20261018.png)、Performanceの5090→Expanded Air/1000W+、GB10のx86操作無効を読戻した。次は実部品の寸法・風路と機種別OS受入。GitHub main統合と物理製品受入は別gate。

2026-10-19、利用者の「中身がリアル製品」指示により、抽象CSS部品を[実在製品形状を参照した分解画像](../evidence/avocadopro-v23-real-parts-20261019.png)へ変更し、ValueのGPU/基板/CPU/RAM/SSD/PSU/fan候補を型番・寸法・メーカー仕様付きで説明する。生成画像は実品写真やCADではなく、寸法と供給を保証しない。ASUS Dual 5060 Tiカード229×120×50mm、B850-I 170mm角、Corsair SF750 750Wを分けて示し、5090 FEは304mm級・1000W以上の別筐体境界を維持する。主担当WEB13/DSP01のROCKは画面と試験、EXTERNALは部品仕様/供給、JOINTは同一閉箱の熱・騒音・boot・driver実測、OWNERは採用/購入/公開を担う。ローカル14ページbuild/21件試験、host-routed build/33件試験、公開URLのGPU段階・Performance切替・browser consoleを確認。Sites source `74e625ffc1ea599664f805b27ac5ad4f2c1f1b78`、v23、deployment `appgdep_6ad5aed8d4f48191950f77aefcafb1f3`。次は実カードと基板/PSU/冷却を一つのCADと試作筐体で納め、電源・熱・騒音・保存復旧を測る。GitHub main統合と製品受入は未実施。

2026-10-19の部品カスタム・購入希望（WEB13/DSP01）: 参考投稿の広告枠販売は採用せず、部品を選んで見た目と仕様が変わる操作を優先。GPU/RAM/SSD/筐体/電源の選択をライブ部品マップへ反映し、構成の端末保存・共有URLを追加。希望者は選択構成、返信先メール、任意の地域/用途を非公開で送れ、控えと削除コードで削除できる。Workerはorigin・本文長・構成整合・日次回数を検証し、D1へ保存する。ROCKは画面/API/試験、EXTERNALは実部品供給と支払基盤、JOINTは同一試作機・販売地域/保証/納期の検証、OWNERは販売開始と条件を担当。host-routed build 14ページ・36/36試験、公開URLのフォームopenとテスト受付→削除、[公開表示](../evidence/avocadopro-v25-custom-purchase-interest-20261019.png)を確認。Sites source `c8db0ce498ce8e1c214f53d2aeb073cb7e2996b6`、v25、deployment `appgdep_6ad5bc01aa9c8191bf45167ef8023a74`。現状は**購入希望**のみで、支払・注文・予約・納期保証はない。合格した実機BOM、価格、供給、地域別条件、返品/保証、決済を揃えてから販売を別gateで開く。GitHub main統合は未実施。

2026-10-19の組み立てサービス化（WEB13/DSP01）: 利用者が前版の部品一覧を不足と指摘し、PC組立に見立てた体験を明示。開いた筐体のtop viewと部品トレイ、6工程の選択・取り付け・進捗/再選択・端末保存を実装。クリック、キーボード、部品トレイのドラッグによる取り付けを同じ状態遷移へ接続し、完了後に構成確認/共有/購入希望へ進む。5090の拡張筐体・1000W以上、GB10の統合architecture境界を保持する。ROCKはUI/状態/試験、EXTERNALは部品仕様・供給、JOINTは実組立と熱/電力/復旧、OWNERは最終SKU/販売を担当。ローカルAstro 14ページ/24件、host-routed 14ページ/36件がpass。正式URLで工程表示と最初の取り付けを読戻し、[公開画面](../evidence/avocadopro-v26-assembly-studio-20261019.png)を保存。Sites source `182cd2365a225ba0dd271cc6a34f244d45397600`、v26、deployment `appgdep_6ad5c2b15d908191ad70dfb9e2a8dd31`。図は意匠・操作研究で実寸CAD/適合証拠ではない。決済・予約・納期保証は引き続き閉じる。次は実BOMを同一CADへ置き、試作機のdriver・熱・電力・騒音・OS復旧と価格/販売条件を受け入れる。GitHub main統合は別状態。

同日v27追記: 狭い幅でtoolbarの完了数が隠れるCSSを修正。host-routed 14ページ/36件が再passし、Sites source `f06f56b4003dc5a472697955c24fedfe37450289`、v27、deployment `appgdep_6ad5c4c733dc819180165b53a83f6bb3`を公開。正式ドメインで1/6 fittedを読戻し、[v27公開画面](../evidence/avocadopro-v27-assembly-studio-20261019.png)を保存。実寸CAD/実機適合/価格/販売の受入は未完了。

2026-10-20 WEB13/DSP01: 利用者指定の参考投稿を確認し、BuilderをProの主画面へ移した。ROCKは白基調の製品中心UI、外側/内側のconcept画像、画像上の6部品位置、選択・fit状態・構成保存/共有/購入希望接続を担当。EXTERNALは部品仕様/供給、JOINTは現物の筐体/熱/電力/OS、OWNERはSKU/販売条件を担当。広告枠・競売は対象外。ローカル14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `db2f07da71a650e72ae51a6ca16f88f13a0bddff`、v29、deployment `appgdep_6ad733b5a89881918f8453321d06a8a6`を公開し、正式Proドメインの狭い幅で構成3種と内部6位置を読戻した。[公開画面](../evidence/avocadopro-v29-main-builder-20261020.png)。生成画像とstage進捗は概念UIで、CAD適合/実機/価格/販売は未受入。次は一つのBOMをCADと試作機で照合する。Site source保存・配備とGitHub main統合は別状態。

同変更の全体`npm run verify`は、正本で並行するdatabase status/migration union/Sky presentationの9失敗によりNode段階でexit 1。Pro単体の24件・host-routedの36件は合格し、全体合格とは記録しない。Git外ログ`/private/tmp/avocadopro-v29-verify-20261020.log`。GitHub main/作業branchはそれぞれ`70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`/`951d82d5a491a284aed4e0d4d280171d835d4b43`で、今回のPro差分は未commit。

2026-10-20 WEB13/DSP01 v30: 利用者の「もっとそのサービスだけにして」に従い、Proを組立、構成、購入希望の単一サービス画面へ絞った。スクロール分解とOS説明のsection/JS/ナビを削除し、メーカー仕様リンクを構成欄に移動。ROCKはUI・保存/共有/希望受付の維持、EXTERNALは仕様/供給、JOINTは試作機の適合検証、OWNERはSKU/販売条件を担当。ローカル14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `1b18aa0da78614e0333b337e63abe898e043f658`、v30、deployment `appgdep_6ad73a0978208191a13cd2b8883c2bbd`を正式Proドメインで読戻し、補助sectionが消えたことを確認。[公開画面](../evidence/avocadopro-v30-service-only-20261020.png)。実組立/価格/支払/予約は未受入。Sites配備とGitHub保存/main統合は別状態。

v30検証: OpenSSL 3 PATHとlocalhost待受許可下の`npm run verify`はexit 0。Web asset closureは186参照/欠損0、仕事APIは1330 assertions、CSVは113 assertions。Git外ログ`/private/tmp/avocadopro-v30-verify-20261020.log`。これはWeb回帰の合格で、PC実機や販売の受入ではない。

2026-10-20 WEB13/DSP01 v32: 利用者の使いにくさ指摘を受け、狭い画面で部品位置→取付が離れる導線と工程順序制約を修正。ROCKは44px部品target、画像上の工程nav、画面下の部品/詳細/取付dock、任意順取付と自動次部品遷移を担当。v31のCSS固定位置不具合をv32で修正し、319×848の正式Proドメインでdockが画面内にあることを読戻した。[公開画面](../evidence/avocadopro-v32-usability-20261020.png)。local 14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `93c8b7041720522927d71121cb64345267809e7a`、v32、deployment `appgdep_6ad73d41befc819196d7afa3dedcc8f6`。EXTERNALは部品仕様/供給、JOINTは実機適合、OWNERは販売条件。次は初見の利用者で6部品の完了・構成保存・希望受付まで測る。支払/予約は閉じる。Site source保存/配備とGitHub main統合は別状態。

v32全体検証: `npm run verify`は`release:check`でexit 1。`docs/evidence/launch/web-security-local-20260917.json`の入力hashのうち`app/manifest.ts`だけが現sourceと不一致で、今回のPro sourceはその入力集合に含まれない。Web securityのlocal production responseを現manifestで再実測し、証拠を同期した後に全体verifyを再実行する。Pro単体24/24、host-routed 36/36、319×848の公開画面の操作確認は合格。全体合格とは記録しない。ログはGit外`/private/tmp/avocadopro-v32-verify-20261020.log`。

2026-10-20 WEB13/DSP01 v34: 利用者の「見ていて楽しくない」指摘を受け、静止内部画像の部品領域を6層として取付時に移動・発光させ、中央に組立再生/停止/再再生を追加。スマホ右端の部品名切れも修正。ROCKはSite source、動作、表示、EXTERNAL/JOINTは実部品と実機適合、OWNERは販売条件を担当。ローカル14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `d29eabefc0c7a403156320e4442455f0329c8388`、v34、deployment `appgdep_6ad740ca1fac819181b654794918f42f`を正式Proドメインの319×848画面で読戻し、[完成画面](../evidence/avocadopro-v34-watch-assembly-20261020.jpg)を保存。次は初見利用者に組立を操作してもらい、理解・完了・保存まで測る。画像演出はCAD/物理適合の証拠ではなく、支払/予約と一般製品ローンチは開かない。Sites配備とGitHub branch/main統合は別。

v34全体検証: `npm run project:update`、`baseline:check`、`design:check`、`project:check`、`git diff --check`はpass。`npm run verify`はOpenSSL 3とlocalhost待受許可でexit 0（Web asset 186参照/欠損0、仕事API 1330、CSV 113）。通常sandboxのEPERMは待受権限を与えて再実行した。ログはGit外`/private/tmp/avocadopro-v34-verify-allowed-20261020.log`。

2026-10-20 WEB13/DSP01 v35: 利用者の追加改善指示へ、0/6で完成画像が見える原因を解消。元画像から空の筐体コンセプトを生成し、部品の装着に応じて6領域を見せる。白い縁を抑え、見出しを短くしてPCを上方へ置いた。ROCKがSite source/画面と操作を担当し、実部品仕様/供給はEXTERNAL、同一実機適合はJOINT、販売条件はOWNERのgate。ローカル14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `a6632d4db0f6a74c2173f78667cf0add2b371d93`、v35、deployment `appgdep_6ad745c85ebc8191b3b9f499838231f1`を正式Proドメインの319×848画面で読戻した。[空](../evidence/avocadopro-v35-empty-20261020.jpg)→[完成](../evidence/avocadopro-v35-complete-20261020.jpg)、横はみ出し0。次は初見の理解/完了/保存を実測し、実BOM/CAD/試作機を確認。支払/予約と一般製品ローンチは閉じる。Sites配備とGitHub branch/main統合は別。

v35全体検証: `npm run verify`はOpenSSL 3とlocalhost待受許可でexit 0。Web asset 186参照/欠損0、仕事API 1330、CSV 113 assertionsがpass。`npm run project:update`、`baseline:check`、`design:check`、`project:check`、`git diff --check`もpass。ログはGit外`/private/tmp/avocadopro-v35-verify-20261020.log`。

2026-10-20 WEB13/DSP01 v37: 本人の「最初の方が良かった。商品の紹介と直感的な操作」へ、完成外観の製品紹介を先頭へ戻し、AI専用PCの用途と設計目標を明示。続く構成画面は「モデル→画像上の部品→候補確定」の3手順にし、完成した内部を既定表示。組立アニメーションは任意で、保存済み選択を変えない。ドラッグを除去し、スマホ固定操作はPC画像の表示中に限定。ROCKはSite source、操作、保存/購入希望契約、EXTERNAL/JOINTは実部品・実機適合、OWNERは価格/販売条件。ローカル14ページ/24試験、host-routed 14ページ/36試験がpass。Sites source `56eb61c589dba99f8ec56e4acab9eab0a0a5a0ef`、v37、deployment `appgdep_6ad74a33d6bc81919ecdfa474daaecb2`を正式Proドメインの319px幅で読戻した。[商品紹介](../evidence/avocadopro-v37-product-first-20261020.jpg)と[構成画面](../evidence/avocadopro-v37-configure-20261020.jpg)。次は初見利用者の操作/保存を実測。画像/CAD/性能と価格・支払/予約・一般製品ローンチは未受入。Sites配備とGitHub branch/main統合は別。

v37全体検証: OpenSSL 3とlocalhost待受許可で`npm run verify`はexit 0。Web asset 186参照/欠損0、仕事API 1330、CSV 113 assertionsがpass。`npm run project:update`、`baseline:check`、`design:check`、`project:check`、`git diff --check`もpass。ログはGit外`/private/tmp/avocadopro-v37-verify-20261020.log`。

## avocadoMiniゲーム制作・参加入口（WEB13 / ROCK・JOINT、2026-10-18）

[公開ページ](https://avocadomini.si/create/)で、端末購入前から誰でもブラウザのタップゲームを編集・試遊し、manifestとMITスターターZIPを持ち帰れる。製品アイデアまたは自作ゲームのHTTPSデモを、匿名の非公開審査queueへ投稿でき、控え番号と削除コードで本人が削除できる。Miniトップから入口をつなぎ、privacyに投稿・保持・削除を記載した。ROCKはUI、入力検証、D1保存と削除、Sitesは配信、JOINTは公開画面・APIの同一版確認、OWNERは採用・公開判断を担う。公開投稿や任意コード実行、Mini/Pro実機互換、Wallet接続は許可していない。

Sites v19/source `e11f01f7f4abeb1c2f15e8e9b63251fb511e27cc`を配備し、独自ドメインのページと受付状態を読戻した。hosted buildは14ページ、33/33試験。PCで試遊スコア加算、390pxで横はみ出し0。公開APIでは個人情報を含まない合成投稿が201、削除が200、その後queueが空であることを確認した。[公開画面](../evidence/avocadomini-creator-open-20261018.png)。GitHub正本はローカル同期、branch commit/main統合は未実施。次は非公開queueの審査運用と作者の権利・公開同意を定め、Game workstreamの持込み／実行runtimeを別gateで受け入れる。

正本Site build 14ページ、21/21試験、ZIP CRC、全体`npm run verify` exit 0（OpenSSL 3・localhost待受許可、仕事API 1330、CSV 113）。検証ログはGit外`/private/tmp/avocadomini-creator-verify-20261018.log`。公開Site配備とGitHub branch/main未統合を分けて扱う。

2026-10-18視覚修正: 利用者からCreator Previewの冒頭に製品画像がなく期待感が伝わらないと指摘された。既存R5の細軸・銀色・上部黒帯・低いドックを参照したゲーム制作の構想画像を第一画面に置き、現行形状と手の届く着脱ドックの製品画像を続けて表示した。ゲームは通常の画面に描き、未受入の空中投影を実動作として表現しない。Sites v20/source `bc812863432b1a5c6467e8f20ba484dce73b70b8`を配備し、[独自ドメインの画面](../evidence/avocadomini-creator-product-visual-20261018.png)で画像を読戻した。hosted build 14ページ、33/33試験、PCと390pxで視覚確認、横はみ出し0。R5製造・Mini上ゲーム起動・一般ローンチのgateは維持する。

正本Site build 14ページ・21/21試験、`npm run project:update`と`git diff --check`はpass。v20後の全体`npm run verify`は初回に一時CSV出力の`wrangler.json`欠落、CSV単独113件はpass。全体再実行は別作業中のSky Marketplace表示文言と旧試験期待値の不一致でexit 1。全体passへ換算しない。Git外ログは`/private/tmp/avocadomini-creator-v20-verify-20261018.log`と`/private/tmp/avocadomini-creator-v20-verify-retry-20261018.log`。GitHub正本はローカル変更まででbranch/mainへ未統合。

## avocadoMini R5製品ページ（WEB13 / ROCK・JOINT、2026-10-18）

Instagram参考動画の余白・大きな主画像・短いコピーを自社の構想CGと現行R5仕様へ適用した。`avocadomini.si`のトップと`/preorder/`を公開v17/source `7f190196b5ddc738b0ab07325384bac42a240641`へ更新し、両画面を読戻した。現行は一本自律のR5構想で、物理試作・Mini OS・直接衛星通信・空中表示は未受入、予約/決済不可、価格未定。旧E3価格は現行販売提示に使わない。ROCKはサイトsourceと現状表示、EXTERNALは将来の部品/通信/製造、JOINTは実機と配信同一版の受入、OWNERは販売条件を担う。Site buildと30/30試験、PC 1280px/スマートフォン390px目視合格。正本sourceはローカル同期済み、GitHub branch/main統合とは分けて記録する。次は同一試作機の光学・通信・熱・OS受入と、総合/Proドメインの旧表現整理。

2026-10-18追補: 利用者指定のMini設計チャットと住宅CM動画群を参照し、製品形状を細い銀色の円筒・上部の黒いセンサー帯・低い円形ドックへ揃えた。公開Site v18/source `ddbb96ee0f2b9c57910272469869c108b44d5451`では、主画像・単体形状・手で外す壁ドックの3場面を追加し、天井／軒下に残る別個体と、日常の持ち出し用に手の届くドックを区別した。通話UI、空中表示、携帯電源、衛星回線／Wi-Fi共有は構想であり未受入と表示。ROCK source保存、Sites配備、JOINT公開ドメイン読戻しを個別に確認した。Site buildと30/30試験、正本静的buildと18/18試験、PCと390px幅の目視、公開画像3枚の読込・横はみ出し0、`npm run verify` exit 0（OpenSSL 3指定・localhost待受許可）を確認。証拠は`docs/evidence/avocadomini-r5-reference-aligned-20261018.png`、全体ログはGit外`/private/tmp/avocadomini-r5-v18-verify-20261018.log`。GitHub正本はローカル同期までで、branch commit/main統合は未実施。次は実部品で外形・光学・通信・電力・熱を比較し、一体機の受入を進める。

## Facebook会社ページ（WEB06・WEB13 / OWNER、2026-10-18）

[AvokadoのFacebookページ](https://www.facebook.com/profile.php?id=61595759960959)をKaiya Natsumuraの管理アカウントで作成し、AVOKADO LLC、本人提供の会社住所、総合・Mini・Proの3サイトリンクを公開画面で読戻した。Facebook側の保存は完了。画像、投稿、友人招待、広告は未実施。ROCKはブランド表記・リンク・進捗の記録、OWNERはFacebookアカウントと公開設定、EXTERNALはFacebookの配信、JOINTは別ログイン状態からの公開閲覧・各リンクの最終確認を担う。GitHub文書保存とmain統合、Sites配備、販売開始を混同しない。

## 製品ドメインの役割統一（WEB06・WEB13 / ROCK、2026-10-18）

利用者は総合入口を **avoado.si** と再確認した。`avocado.si`へ補正しない。共通source `lib/product-domains.ts`で、`https://avoado.si/`を総合/Sky入口、`https://avocadomini.si/`をMiniの製品/導入案内、`https://avocadopro.si/`をProの製品/導入案内として明示する。`ProductDomainNavigation`を接続入口と本人用Zoom Labに追加し、リンクへjob/素材/成果/本人情報を付けず、別tab・no-referrerで開く。私的Lab `/sky/add/zoom/lab`はlocalhost相対pathを保持し、これらのdomainへ配布/転送しない。

ROCKは役割と共通導線、EXTERNALはDNS/TLS/hosting、JOINTは所有権確認と配備後readback、OWNERは公開条件を決める。今回の変更はローカルsourceのみで、DNS/SSO/CORS/credential共有/公開設定は変更していない。新しい役割の保存と、以前にMini domainへ公開したホームの実状態を区別する。今回のWeb取得では3指定hostの内容を確認できず、無効/DNS不通/未所有とは断定しない。`avocado.si`には別の衣料品店が表示されるため経路へ含めない。検証は`tests/product-domains.test.mjs`、本人用Labの実DOMに3linkと正しいhost、接続画面、typecheck/lint/design/verify。一般ローンチ保留は維持する。


## Sky成果受け皿と第一者アプリplugin（WEB06 / SKY21、2026-10-12）

主担当ROCK。OSのZema管理とSky単体の各アプリ内成果表示を分ける。Skyのowner-scoped成果一覧を `/sky/outputs` に作り、第一者同一originアプリが保存済み委任成果を読んで型付き表示する最初の例をFitnessで検証する。外部app SDK/別origin認証、Agent Provider、実Apple PayはJOINT/EXTERNALの別受入。未保存/部分成果を完成として表示しない。合格は `tests/sky-output-presenter.test.mjs`、`tests/sky-fitness-output.test.mjs`、type/lint/design/verifyとPC/mobileの画面、既存APIの本人A/B境界。成果ページの保存は既存仕事/委任/回答台帳を再利用し、新しい原本DBを作らない。[詳細](../sky-launch-design.md#sky-app-output-plugins)。

## Sky共通入口の仕様同期（WEB06 / SKY21 / SIM01、2026-10-12）

主担当ROCK。利用者指定チャット「大学別NFCでSkyに接続」の最新方針とiOS/eSIM要望を[共通入口仕様](../sim-led-product-architecture.md#sky-shared-entry)へ統合。既存SkyをNFCの大学文脈と任意eSIMから使い、Zema・本人・購入・仕事・予算を共用する。iOS初期版はbrowser/PWA、native/App Clipは後続候補。原因は旧大学専用Hub、SIM必須に見える旧記述、main/local/二つの公開Siteの進捗混同。修正順はmain/DB/引継ぎ同期→共通Skyの実操作→代表Agentの費用/成果縦断→同一artifact公開/本人A/B/実機→任意eSIM。ROCKの仕様保存とJOINTの実機/Provider受入、OWNERの料金/配布条件を分ける。`npm run project:update`・`baseline:check`・`design:check`・`verify`、UI変更時は実操作。今回の観測/証拠は`data/project-status.json`の`skyEntrySpecificationSync`。

## 大学別SkyをNFCからホーム画面へ（WEB06 / SKY21、2026-10-12）

主担当ROCK。5大学の既存Sky入口に大学別PWA manifest、本人別の購入/仕事を読むAgent Hub、Sky配下で既存Zema画面を再利用する導線を追加。登録済みSkyタグは大学別Hubへ直接進み、旧Skyタグも読取り時にHubへ転送する。NFCはHTTPS入口でブラウザ利用は即時、PWA追加は本人操作。Apple Payは適格端末でのStripe Checkout選択肢で、購入権とAgent実行権は別に照合する。公開v39には未配備。対象manifest/commerce/workflow試験、type/lint/build、全体verifyの後、同一artifactで実NFC・iPhone/Android・本人A/B・決済・Provider・Zema停止/復旧を別々に受け入れる。[詳細](../sky-tools-complete-design.md#大学別nfc-sky2026-10-12)、[証拠](../evidence/campus-sky-entry.json)。

同日のWeb体験修正: タグ着地先はLPでなく作業開始画面。大学別の依頼入力→Zema下書き、guest brief、People/資料/Market、本人の仕事・購入・MCP枠を最初の画面で操作できる構成とする。sourceの動線検証を公開/実機/Provider受入へ混同しない。

## Web共通デザイン（WEB04 / HOME01、2026-10-09）

利用者の追加指摘により、Home単独修正から主要6アプリの共通ヘッダー・無彩色tokenへ範囲を拡張。表示責任はROCK。PC/mobile全画面比較と既存回帰を合格条件にし、[既存全体設計](../rockstaros-complete-design.md#web共通デザイン2026-10-09修正)と[同一sourceの検証証拠](../evidence/web-unified-design.json)を入口にする。Sites公開とGitHub main統合を分ける。

## Home刷新（2026-10-09、HOME01 / WEB01）

同日の修正指示でHomeを中性化し、公開v46/source `6d0e5f6137615f765022f3ac7212dee9786fbfb5`を読戻し確認。彫刻・ライム・巨大コピーを外し、上部アプリ一覧と依頼・仕事の通常密度へ変更。公開sourceの全体verify、正本の全体verify（Node900/API1178/CSV113）が成功。既存証拠のneutralRevisionを現在の配備・検証記録とし、以下v45の記録は前版の履歴。GitHub mainは未統合。

公開v45/source `e8d0353b92858602415a6c976aadbade089a6fa4`。public audienceを維持し、公開ホームを読戻し確認。[検証証拠](../evidence/home-intent-refresh.json)。公開source全体verifyは成功。正本側の対象22試験とdesign検査は成功、全体verifyは既存DB進捗不一致で停止。GitHub mainは未統合。

ROCK担当。依頼・本人の仕事・成果を中心にHomeを刷新し、指定public Siteの既存sourceへ適用する。認証、workflow、Wallet、課金は既存契約のまま。GitHub正本のsourceと、旧公開版に適合させたsourceを区別する。詳細契約は[全体設計のHome節](../rockstaros-complete-design.md#home-意図から仕事へ2026-10-09)。検証はhandoff試験、typecheck、npm run design:check、npm run verify、PC/mobile操作とSites versionで記録。


## 公開インストール入口（2026-10-05、WEB13）

利用者はeSIMとRockstarOSの導入入口を依頼し、ドメインを`avocadomini.si`（c）へ確定した。公開Site version4とドメイン/TLS activeを再取得。旧DNS待ちは履歴。主担当JOINT: ROCKは`/install/`の端末別導線、SitesはHTTPS配信、EXTERNALは契約済みeSIM発行、OWNERは契約と署名鍵を担当する。Web/PWAの追加は既存公開OSサービスへ遷移する。eSIM/Pixel/Mini/Pro/QEMUは未受入の発行・imageを配布せず不足条件を示す。6分類は入口/対象機器の整理であり6つの完成OSを意味しない。eSIMは他の機器版とも併用可能なサービスアクセス方式。個人データやactivation materialを公開サイトに保存しない。

合格条件: `/install/`から公開Web版へ到達、端末別追加手順、eSIM未配備の明示、未配布imageの誤配布防止。UI到達、公開sourceのbuild/test、repository `npm run verify`、Sites配備成功を別々に記録する。Webの追加失敗時はSafari/Chromeで開き直すかブラウザ利用へ戻る。native配布は既存release gate、eSIMはBIL02/Provider gateで再開する。

公開結果: version6/source `b75716b6`、配備成功。全体verify exit0、最終Site13routes/18tests合格。公開OSの`/connect`と`/sky/purchases`は404のためリンクを除去した。証拠は`docs/evidence/public-install-entry.json`。GitHub側はローカル未commitでmain未統合。実eSIM/実機OSの受入は未完了。

## avocadomini.si（2026-10-05、WEB13）

利用者は `k999ln/rock` のホームページを `avocadomini.si` で公開するよう指定した。担当はJOINT。ROCKはmain `aa7f2b41ce34a32c262500a83238bb713c003dee` の `sites/avocado-mini` と公開artifactを同期し、Sitesは配信とTLS、OWNERはDNS管理サービスの接続を担当する。現在のmainのSIM/eSIMホームとMini／Pro／Rocket Star等の既存ページを維持する。

独自ドメインは既存Site `appgprj_6ac31ab12d3481919e9a5379fa0dfbd2` に登録済み。旧 `appgprj_6aaf6a375b908191b3b0c1845dc78291` は現在の接続ではNOT_FOUNDであり、旧Siteを変更したとは扱わない。新規Siteを重複作成しない。DNSは `lunar.dns-parking.com` と `solar.dns-parking.com`、apex Aは `2.57.91.91`、以下のTXTは未検出。登録・管理サービス名は未確認。

Sitesが返した設定値（apex、wwwは今回の対象外）：

| 種別 | ホスト | 値 |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=pUqZ8awumMyjCjWPI9MH8jvQitA2dIuY8MMrIIju5Xo |
| TXT | _cf-custom-hostname | 36294e04-04f4-42aa-b81c-e96d235a04bb |

DNS管理画面で既存apex Aを上記2件へ置き換え、TXTを追加する。メール用MXや他サービスのTXTは保持する。未確認のAAAAがあれば競合を確認してから切替える。Cloudflare経由の場合はSitesのvalidationに従いproxyの扱いを確認する。TLS追加validationが返った場合は、その実値を追加する。DNS変更の復旧は変更前のレコードを保存して戻す。Site内容の復旧は既存公開v2を選ぶ。

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

## AMCのCodex登録（2026-10-05 / WEB04）

ROCK担当。GitHub mainの既存3役を、このcheckoutの `.codex/agents/` へ登録。完了条件は正本一致、構文と役割の検査、既存model/承認設定の保持。`node --test tests/amc-agent.test.mjs` はmainのpreview checkoutで4/4合格。現在のcheckoutにはCLI/Coreがないため、単なる定義登録をruntime統合・Web起動/同期・実Goal完走へ換算しない。結果と次の自動読込確認は [登録証拠](../evidence/amc-codex-registration.json) に記録。

## AMCチャット内入口の改善（2026-10-05 / WEB04 / ROCK）

前回の定義登録だけでは現在のcheckoutにCLIがなく、利用者に新しいチャットやWebを使う手順を要求していた。現在は `toolkits/amc-agent/SKILL.md` を `.agents/skills/amc/SKILL.md` へ登録し、同じCodexチャットの司令官からnative委任と独立検収へ進む。既存のmain launcherと定義を再利用し、`npm run amc` のhelpと一文依頼、`doctor` の設定/CLI/容量診断、未対応端末での復旧案内を追加。保存Goal、Web API、Sky catalogの実行権限は変更しない。既存の異なるskill/agent定義を保持し、秘密値・model・承認設定を複製しない。容量不足はOSの実状態であり、診断表示を空き確保の成功へ換算しない。

合格条件: 引数なしでhelp、一文Goalがliteral argv、preview無実行、対話端末なしで復旧案内、変更なしdoctor、既存設定保持、再登録冪等、native実行担当の成果を別担当が確認。検証: `node --test tests/amc-agent.test.mjs`、`npm run amc -- doctor`、`TMPDIR=/private/tmp npm run verify`。[証拠](../evidence/amc-codex-usability.json)。次は実ユーザーの具体的なGoalで継続利用し、Web同期が必要なら別の本人認証付きadapterとして受け入れる。

検証完了: 対象10試験、lint、project/baseline/design、literal preview合格。実行担当のREADME提出を独立検収し、途中ENOSPCと親symlink診断の2件を修正して限定pass。全体verifyは低容量によるauto-review拒否のため未実行。ユーザーファイル/ブラウザcacheは削除せず、容量回復後に再検証する。

## 登録不要の出力テスト（WEB04 / 2026-10-09）

目的・体験: `/test` は既存catalogの全項目を列挙し、サンプル一括実行、編集入力の個別実行、結果のコピー・保存・リセットを提供する。実処理・模擬データ・接続待ちを同じ状態語で表示する。CSV、文章、企画、受付文、照合は既存の純粋関数を再利用し、Zema試験はlib/workflow.tsへsample=trueの記録を通す。本番完了へ昇格しない。

責任・入力出力: ROCKのstateless POST `/api/output-tests`。同一Origin/JSONのみ、本文64KB・欄12,000文字まで。固定allowlist以外の入力・Tool・owner指定を拒否。応答はid/mode/status/output/details/executedAt。Provider、DB、Broker、Wallet、本番保存API、任意shellは呼ばない。模擬Marketは入力検査のみ、Walletは表示計算のみ、実注文・実残高ではない。未接続Toolのanswerはnull/not_run。

状態・保存・失敗復旧: idle→running→output/not_run/error。失敗は当該項目だけに表示し、再実行可能。編集時に古い出力を破棄。一括はサンプルへ戻すと明示。結果と入力はReactの画面メモリのみ、再読込で消去。アプリDBへの記録なし、ログへ本文を書かず、Cache-Control:no-store。利用者操作でテキスト/CSV/全結果JSONを端末へ保存。アプリ自身の保持・削除と配信基盤のメタデータログは区別する。

承認・合格・未決定: 登録不要でも本番の本人性・予算・同意を緩和しない。サンプルは架空と明示し、法務/特許は受付整理に限定。外部公開・送金・AI API呼出なし。全catalog coverage、入力変化、境界拒否、workflow未完了、ブラウザ一括/個別/保存/リセット、verifyで検収する。Cloud鍵・利用枠、候補Toolの実行環境、Pixel端末内modelは別途OWNER/EXTERNALの準備と実受入が必要。撤去時はheader入口と/test・stateless endpointを除去、旧配備へrollbackできる。

## 大学別NFC Sky（2026-10-12、WEB06 / SKY21）

公開前の調査一覧は[既存証拠のlaunchResearch](../evidence/campus-sky-entry.json)。公式24資料、必要40項目、大学別機能案、Provider6候補の登録制限、15受入シナリオをまとめた。現状はlocal大学版のみ受入、公開v39のNYU入口は404、PC不要remote MCP・AI実料金gate・追加枠販売は未受入。main/local/配備sourceとmigrationを同期してから、本人/大学確認→スマホMCP/AI→有料枠→実NFC/設置の順に同一候補で検証する。大学メールと在学証明、6枠無料とAI/外部SaaS料金、過去34 Tool分類と現行公開版の実利用を混同しない。今回の調査では公開・接続・契約・タグ書込みを行っていない。

利用者の追加指示で5大学別のbrowser入口と大学別brief、一般MCP5枠・対象学生6枠を追加。主担当Web / PWA / Sites、ROCK。OS完成を必須にせず、NFCはURL入口とする。本人単位の枠管理を実装し、有料拡張の価格・cloud MCP実行・公開同一artifact・実NFC/端末の受入は別gateに残す。[目的・状態・保存・失敗/復旧・責任・合格条件](../sky-tools-complete-design.md#大学別nfc-sky2026-10-12)。
## 2026-10-12 大学NFC入口を既存Skyアプリへ統合（WEB06 / SKY21、ROCK）

利用者が公開Skyを示し、OS外でもSky単体が成立する品質を明示した。大学Hubの別フォーム画面を着地点から外し、既存`SkyWorkspace`のAgentフィード/役割選択を大学名、大学別の既存ready Tool、購入履歴・接続・Sky内Zema導線付きで再利用する。NFCと大学別PWAのURLは維持。brief/People/資料は補助入口、MCP 5/6枠は認証済み状態のまま。ROCKは同一Sky UIと本人状態、EXTERNALは実NFC/決済/Provider、JOINTは同一配備artifactのiPhone/Androidと購入→実行→Zema/費用、OWNERは販売/大学配布条件を担当。ローカルUI検査と型・対象試験は本番合格ではない。既存main `8c5891fc` にはColumbia専用の別動的routeがあり、dirty差分を保全した統合時に同一路線を一つへ整理する。


## Eveの永続記憶・Skyコミュニティー（OS10/SKY21）

2026-10-20の本人指示。主担当ROCK Web/PWA、EXTERNALはSites認証/D1/配信元、JOINTは実device/provider、OWNERは共有範囲と公開。Eveはowner暗号化・同一account復元・参照元・記憶対象・export/削除、Skyは公開名・自前timeline・follow/recommendation・community作成/ルール/招待/退出/作成者管理。詳細11項目は[OS全体](../rockstaros-complete-design.md#eveの永続記憶とskyコミュニティーos10--sky212026-10-20)と[Sky全体](../sky-tools-complete-design.md#eveの永続記憶とskyコミュニティーos10--sky212026-10-20)。検証は`node --experimental-strip-types --test tests/eve-history.test.mjs tests/sky-social.test.mjs`、`npm run test:api`、`npm run verify`と同一ローカルartifactのUI。証拠は[JSON](../evidence/eve-memory-sky-community.json)。本番secret/DB backup、実Mini、X本人feed、OS版builder/配布、公開UGC運営は未完了。


## 専用鍵付きコミュニティーOS（OS10/SKY21 / ROCK）

2026-10-20本人指示。ROCKは版付きmanifest/strict import、community鍵ACL、本人install/一つのactive、theme/default Eve、Sky Agent/Connection再利用、復旧/失効を担当。EXTERNALは認証/DB/実model、JOINTは実device/Provider、OWNERは配付/共有/費用。旧リンクのみ共有とpublic参加は新要件で更新する。11項目は[全体正本](../rockstaros-complete-design.md#keyed-community-os)、[Sky正本](../sky-tools-complete-design.md#keyed-community-os)。集中試験`node --experimental-strip-types --test tests/sky-social.test.mjs tests/community-os.test.mjs`、`npm run test:api`、`npm run verify`とlocal UIを別に記録。[証拠](../evidence/community-os-keyed-editions.json)。native binary/flash/実課金/公開は対象外。次の担当は本番鍵保管と別実機の復元、公開運営を既存gateで進める。

## 調査反映・X型timeline（OS10 / SKY21 / WEB04 / WEB06 / WEB13、ROCK）

[要件照合入口](../rockstaros-research-integration.md)と[全87件台帳](../../data/rockstaros-research-reconciliation.json)。timelineの黒skin・返信/反応/保存・共有・ページングを既存social APIへ追加し、community専用鍵とaccountを維持。既存docsの11項目契約を同期。合格はlocal fixture/API/browserを個別記録し、X本人feed/実課金/端末OSの受入と分ける。次はA16/A13の既存workflowへの差分、A9の計測、実issuer/決済/Linuxの順。

### Eve同一会話の実機往復受入（OS10 / SKY21 / WEB04）

Webの本人SSOと明示したPixel接続承認を経て、Web→Pixel内LinuxのQwen2.5-0.5B→Webの成果、およびPixelの同じ履歴からの継続→Webの4発言を確認した。2依頼の追加で20件から22件となり、継続前の21件は内容を含め保持、モデル2個・担当6個を保持。owner変更時/遅延した応答/再送/CAS競合/削除済みthread/失効をAPI・クライアントで扱う。基盤の実行権限や台帳の権限へモデル文章を昇格させない。

公開Sitesの最新ニュースv93を取り込み、v94 source `800309b4f2415ea5acb470551564ac8f5d775f25`へ共通フレーム、既存の遷移ガード互換、owner応答の照合を追加した。RootとSitesのmigration系列を分け、公開側はdrizzle-mainの既存0026系列を維持した。全体証拠は`docs/evidence/eve-cross-device-sync.json`。debug APK/AVF previewの合格であり、全OS・生体vault・本番課金・一般ローンチは未受入。接続中のみのforeground同期が受入範囲。

### メインドメインのWebOS入口（HOME01/WEB04/OS10/SKY21、2026-10-21）

主担当ROCK Web。`avoado.si/`のMini proxyをSkyホームへ変更し、既存Sites identityの登録・ログイン/接続済み状態をHome/Eveに表示する。既存`/os`・Mini preorder・Columbia・Eve暗号化履歴・Pixel承認を保全。11項目はOS/Sky全体設計の「メインドメインの会員登録付きWebOS」、証拠は`eve-cross-device-sync.json`。合格条件はroot実HTMLと登録/ログイン入口、匿名401/no-store、本人200と同じ4発言、router/navigation/型/verify、配備sourceの一致。新課金・全OS・生体vaultは別gate。

### 独立アカウントと共通Coreの次段階（WEB04/OS10/SKY21/DSP01）

本人の明示指示による[開発プロンプト](../prompts/rockstaros-common-core-development.md)。主担当ROCK Web、認証/権限はSecurity、実機はAndroid/Nativeへ接続する。ChatGPT不要登録→自分のSky/Eve→同じownerのPixel実行/成果を最初の合格にし、main/Sites/dirty sourceの照合を先行する。12不足項目とRQ、実行順、合格証拠、未決条件を定義。文書保存は新規認証・全端末対応・本番受入ではない。


### 独立ログイン後のPixel継続受入（WEB04/OS10/SKY21）

公開v99で本人のID/パスワード登録と独立sessionを確認し、既存owner/grantのまま新2依頼・4発言のWeb→Pixel Linux→Web／native継続を受入。旧22件の全内容、モデル2個・Agent6個を保持して24件。最終停止・検査APK/画面設定・USB転送を復旧。証拠は[独立アカウント](../evidence/rockstar-independent-account.json)。fresh guest公開登録/再ログイン/復旧・初回端末承認とbackground/生体vault/全OS/請求は別gate。次は共通CoreのCORE02契約へ接続し、Web固有の顧客DBや料金台帳を作り直さない。

### 共通runtimeと既存Eveのサービス接続（WEB04/OS10/SKY21）

既存device session、暗号化replica、履歴CASへ版付き非Pixel executorを接続。新規顧客DB/料金台帳/DB migrationは追加していない。主担当ROCK Web、端末/独立SecurityはJOINT、最終新host grantはOWNER。検証追記: `1.0.0-dev.3`のpackaged bundleをrepo外でimportし、合成worker一件の重複推論0と別Nodeプロセスの同一hash再読を確認した（新しい実モデル推論0件）。全体`npm run verify`はexit0、Node1221件中1220合格/1skip/失敗0、Worker1679・CSV113 assertions。43件package試験と15件store/legacy試験は別集計。実Macの逐語copy不一致は未解決で、品質合格へ変更しない。公開Web更新、新Mac grant、新Pixel ABIの実機受入、GitHub保存/main統合は未実施。 [詳細証拠](../evidence/rockstar-runtime-service-bridge.json)。次は保護storage、owner向け追加/選択UI、公開source統合、同一owner実経路と新Pixel protocolを順番に受け入れる。

共通host UIの検証完了: 公開v105/source `9e54419a7ae86e44f6070283cfa676dfa58309df`を配備し、既存ownerの6担当/2モデル→Eveの同じ担当/モデル選択、同意未選択・古い接続で実行無効を確認した。ヘッダーとアイボリー配色の継承は実画面と回帰試験で確認。全体verify exit0（1225合格/1skip/失敗0、API1694/CSV113、asset203欠損0）、SDK50、selector8。Node SDK dev.4のsoftware暗号化保管はrepo外/別processで解除再読。新規実モデル推論0、実Pixel操作0、新Mac grant0。Mac起動導線/最終本人承認・同一public ownerのMac実行、新Pixel ABI、生体vault/独立Security/本番課金は未受入。旧実モデルcopy不一致は未合格のまま。配信用Gitは保存済み、正本GitHub branch/mainは未反映。 次は既存`run-rockstar-host-text`と共通SDKを再利用して、保護されたhost追加/起動を実装する。[証拠](../evidence/rockstar-runtime-host-ui.json)。

### 2026-10-22 WEB04/HOME01/SKY21: 公開v110の本人設定UIを検収
Home内検索・追加、管理一覧の引用Toolへの誤転送解除、owner/CAS設定、同じEveの担当ID/版/LLM参照を公開Sourceへ接続。実アカウントで作成→保存→再読込→Eve→利用停止→旧設定の拒否を確認。確認用担当1件は停止状態で保持。新規の実推論/支払い/端末権限付与/Pixel受入は0。引用Toolは保持し、内容/リンクの事実検証とは区別する。
Sourceは0ba30dd6（v110、deploy appgdep_6ad99f6bea448191bb0cd55f2a661f43）、共通13ファイル一致。Root main/作業branchは7304e449/951d82d5で未統合。Root集中44/44、Source21/21、npm run verify exit0（Node1239中1238 pass/1 skip、API1694、CSV113、assets206/missing0）。Source金融9件は旧版でも同じfixtureで再現し、未受入として維持。Source-only差分はdocs/evidence/sky-agent-library-source.patchへ保存。
次は全Goalを維持してU01/SI00のSource統合、GPU不要SI01実Tool縦断、Node dev.5所有者/保存/再開試験、CORE03〜12を進める。共有計量8ファイルは相手証拠hashを保持し、free-cloud-panelは本件の役割/版/未報告表示を合わせた差分。二重job/runner/台帳を作らない。


## main Siteの移行系列保護（2026-10-22 / WEB04・RLS02、ROCK）

mainの梱包SourceをColumbia用に誤用できる問題を2試験で再現し、copy/remove前の系列検証で拒否。固定旧系列の元SQL/全保存条件と現行mainの実D1を保持し集中27/27合格。Source全Nodeは2387中2361pass/25fail/1skip、型/lint合格。残る旧画面契約・公開/依存/安全証拠の相違と本番読戻しは未完了。[詳細](../rockstaros-complete-design.md#配信sourceのowner-workspace移行修復core01060809web04sky21)。公開・DB書込・料金変更なし。


## 共通画面・独立登録入口のSource整合（CORE01/08/12、WEB04/WEB06/SKY21・ROCK）

Homeの既定tokenとworkspace frameを同値にし、旧青系の面、補助文字、guideのOS/Miniリンク、claimの独立account入口を修正する。localhostの`/os/sky/agents`404もloopback限定aliasで直し、host/query/body/originと本人境界を保持する。[11項目の設計](../rockstaros-complete-design.md#common-os-entry-alignment)、[同一source証拠](../evidence/common-os-entry-alignment.json)。既存Sourceの金融/同意/入力保全/冪等性のassertionを残し、旧画面への固定期待だけ現行機能に合わせる。local synthetic UI、公開v111、Pixel APKを分け、本人アカウント/新推論/配備を未実施へ保持する。次はSource残差17件/全体gateと、解除したPixelの既存account同期・同じ仕事の縦断。


## 配信用Sourceの保護応答・baseline・進捗参照（WEB04/WEB06/SKY21・ROCK）

[11項目契約](../rockstaros-complete-design.md#source-readiness-alignment)、[証拠](../evidence/source-readiness-alignment.json)。outer routerの8 header、SSE/private cache保持、独自SW scope/cache、既存stage更新/未知entry拒否を実装し、localhost8応答を測定する。現在の49項目/全体promptをSource入口へ、旧Compute Gridは拡張として金融保留ごと保持。旧E3 forcingを現在R5へ置換し、未実証拒否を残す。AMC02の消えたactive SQL参照は保存済み原本fixtureへ移す。EXTERNALは配信、JOINTは同じ公開候補と実機、OWNERは認可/公開/料金。公開canonical SWはまだunitのみ。次はSource全verify/最終Mini表示/公開gate、Pixel解除後の同期・同一job保存を別々に受入。

Source readback追加：現行public v111のproject/version/source/deploymentをreadonlyで照合し、旧本人限定auditは歴史identityへ分離。public runtime gateはblocked維持。公開Home/APIには8 header、旧URL/SW/JSには不足を観測。候補のlocal合格は公開解消ではない。ecosystemはcanonical49＋保存拡張1を照合、旧SQL参照を固定fixtureへ修正。Workflow/API/CSVは空の復元schemaで実D1を試験し、公開migrationの更新受入と分ける。SOURCE PROJECTSにはsky-linux-localの現存account-sync.patch範囲だけを記載し、完全Linux配布済みとはしない。

静的配信の保護: [11項目契約](../rockstaros-complete-design.md#source-asset-security)。SourceのstageでASSETS/Worker先行を固定し、元app/未知entry/異なるbindingを保全。実asset serviceの_headersなしでWorker/API保護とstatic迂回を同時に再現し、同じ条件の修正後GET/HEAD/304/404/転送/SW/APIを試験する。公開runtimeとCPU/費用は別受入。


## Mini専用OS画面（2026-10-22・WEB04／MAT15）

ROCKはavocadomini.siのMini専用Home/Eve/仕事/通信/設定を実装。本人訂正で商品サイトから操作画面へ変更。[正本](../rockstaros-complete-design.md#mini-os-interface)。既存Site v43 sourceを別checkoutで開き、Mini rootだけを/os/へ変更。JOINTの実機入力、OWNERのログイン/依頼承認、EXTERNALの光学/衛星は未接続。Astro buildと配備sourceを記録し、UIをnative受入へ転用しない。


### smis共通フロントの配置・公開受入

HOME01/WEB04/SKY21・ROCK。共通ヘッダー、3タブ、単一タイムライン、独立コミュニティー一覧を公開v116とPixel native入口へ反映。実公開asset42件のbyte一致、native保存45file維持を確認。Web実画面はCUA不通で未受入、公開SWのCSP応答は別gateでFAIL。[同一候補と残件](../evidence/os-visual-release.json)。


smis/Eve制作導線（HOME01/WEB04/SKY21・ROCK）は公開v117/source3a7837c3f9a854f488bcf61e0a87f1bb3c435a5eへ更新。既存Hub API復元、自分の保存済みカード、Eveの設定builder/実行/成果入口、モバイル履歴を追加。Source全verify2543件/2542pass/1skip、API1617/CSV385と公開/3016の45asset照合を確認。本人ブラウザ/実機操作はCUA不通で未受入。[同じ記録](../evidence/os-visual-release.json#workbenchFollowup)。


## avocadoMiniサイト完成化（2026-10-25・WEB04／WEB06、ROCK）

既存Site v50の最新sourceを独立checkoutで取得。旧rootのOS画面入口という履歴に対し、最新配信routerは製品ページをrootへ割り当てている。同じルーティングを保持し、CG・日英本文・Eve/Smith/OS導線・開発状況を追加、`/os/`への明示リンクを設ける。実機性能/販売開始は主張しない。EXTERNALは既存Sites/DNS/TLS、JOINTは実配備の同一source、OWNERの価格/販売/一般ローンチは既存gateを維持。Astro buildとSite41試験合格、PC browserの日英/anchor確認。root verifyのdatabase状況再生成要求は未解決。進捗は`avocadoMiniSiteCompletion`、証拠は`docs/evidence/avocadomini-site-completion.json`へ記録。

## Mini詳細4本の連続スクロール（2026-10-26 / WEB04・WEB06・ROCK）

本人指定portable/optics/銀色chip/虹色chipを20秒の240frame連続映像へ再編集し、4本全編の再生入口を技術章末に配置。PC1280・スマホ390/縦構図、順逆scroll、日英、銀色dialogを確認、build/49試験成功。Site v70/source76dd579へ配備成功。独自domainで4本入口・新版script・chip193・虹色動画readyState4を確認。root verifyは既存database状況再生成要求。実機/販売/一般ローンチgateは変更しない。証拠は `docs/evidence/avocadomini-four-detail-scroll.json`。

## Mini同一モデル透過接写（2026-10-26 / WEB04・WEB06・ROCK）

v71/source05570707へ配備成功。通常scrollは一つのWebGLモデルを保持しcameraと外装opacityを連続変更。既存rainbow宣材を基板へ固定、4本再生は保持。PC/390px/順逆・公開domainの同一scene/shell0.476→0を確認。build/49試験成功、root全verifyは既存DB状況再生成要求。実機/販売gate維持。証拠 `docs/evidence/avocadomini-single-assembly-scroll.json`。

## Miniの金属材質と立体基板（2026-10-26 / WEB04・WEB06・ROCK）

v72/source68f7a281配備成功。元宣材の円筒/ドック比率、ヘアライン銀色と丸端部、光学ガラス、PMREM照明へ。写真planeを撤去し、基板/部品/はんだ/チップを立体化。ロゴだけ既存ブランド印刷面。PC/390px、順逆/影/console0、build49試験成功。独自domainのscript72/solid-componentsを確認。root verifyは既存DB再生成要求、実機/販売gate維持。証拠 `docs/evidence/avocadomini-realistic-materials.json`。

## Miniの微細研磨と基板密度（2026-10-27 / WEB04・WEB06・ROCK）

v73/source1e9a970c配備成功。動作式をv72と一致確認し維持。金属の微細研磨/roughness、619個の小型立体部品と独立端部、大小部品/via/微細maskを追加。PC/390px/順逆、公開domain script73/619partsを確認。build49試験成功、root verifyは既存DB再生成要求。実機/販売gate維持。証拠 `docs/evidence/avocadomini-fine-materials.json`。

## Miniの配置メリハリとマット金属（2026-10-27 / WEB04・WEB06・ROCK）

v74/source48ada324配備成功。均等格子を非対称のlogic/shield/power/decoupling区画へ変更し、大小/高低/疎密を作る。金属roughness/反射をマットへ調整。camera/透過式維持。PC/390px/逆scroll、公開domain script74/ready/342partsを確認。build49試験成功、root verifyは既存DB再生成要求。実機/販売gate維持。証拠 `docs/evidence/avocadomini-functional-layout.json`。

## Mini元宣材ベースの部品relief（2026-10-27 / WEB04・WEB06・ROCK）

v75/source3753ce1配備成功。箱の集積から、元宣材の表面を14部品領域の2.5D reliefへ合わせる方式へ変更。depthは演出上の再構成。camera/外装は保持。PC/390px/逆scroll、公開domain script75/ready/relief14/progress.825を確認。build49試験成功、root verifyは既存DB再生成要求。実機/販売gate維持。証拠 `docs/evidence/avocadomini-reference-relief.json`。

## Mini全景の元宣材復帰（2026-10-27 / WEB04・WEB06・ROCK）

v76/source7cfd0b3配備成功。簡易外形を撤去し、元portable宣材の本体/光学帯/ドックをsource境界付き2.5Dへ。camera維持、金属だけ透過、内部反復photo除去。PC/390px/透過、公開domain script76/ready/元外観/progress.025を確認。build49試験成功、root verifyは既存DB再生成要求。実機/販売gate維持。証拠 `docs/evidence/avocadomini-original-exterior.json`。

## Miniページの正規入口整理（2026-10-27・WEB04／WEB06・ROCK）

Miniは紹介・映像・操作試作・開発状況・ゲーム制作を維持。旧OS試作はpreviewへ、RockstarOS/導入/guideはavoado.si、Pro buildはavocadopro.siへ集約。既存予約参照/API/保存・公開範囲を保つ。Site v77/source1a8657cb配備、build/50試験成功。公開top/footerを確認し、転送そのものの公開navigationはtimeoutで未受入。正本共有sourceは並行差分を保護してpatch照合待ち。証拠/差分/次作業は `docs/evidence/avocadomini-page-cleanup.json`。検証はSite `npm run build && npm test`、正本 `npm run verify`（既存database:checkで停止）。

- WEB04/WEB06 (2026-10-27): Mini v78 uses a single Higgsfield Kling4.0 product-to-chip film at the top and for 240 scroll frames per viewport; removed old photo composite. Retained canonical routing v77. 50 Site tests passed; public top duration15.041667/ready4 verified. Evidence: docs/evidence/avocadomini-higgsfield-continuous-film.json. Root verify blocked by existing database status regeneration. Additional exploded-view job pending.


## コミュニティー公開UI/UX監査（WEB04 / HOME01 / SKY21・ROCK）

2026-11-02・v139接続監査: 現行の主体はEveとNoahのみ。25確認項目と関係図を既存監査の最新節・証拠connectionAuditへ追加。基本往復・mobile作成/閉じるは改善確認、旧Tool認証入口/Cloud成果/管理成果リンク/アカウント戻り等7件を記録。ROCKはR01〜R04の行き先同期を先行、EXTERNALは認証・配信、JOINTは同job/成果/共有一周、OWNERは実参加・権限・費用を担当。実行/共有の合格は未取得。製品変更・公開なし。検証はCanvas型診断、project:update/check・baseline:check・verifyと同artifactの操作再現。

[14件の指摘・解決案・合格条件](../community-ui-ux-audit.md) と [機械可読証拠](../evidence/community-ui-ux-audit.json)。公開UIの320/390/768/1280px、Escapeによる下書き消失、フォーム位置、招待エラー、CSS競合を確認。実装/配備は未変更。次はC01〜C03を修正し、同artifactで再現手順を反復する。ROCKはUI/状態/保存、EXTERNALはhosting/認証、JOINTは実account・複数端末受入、OWNERは参加・権限・公開。検証: report内の手順、`npm run project:update`、`npm run verify`。未ログイン/実参加/実機/鍵復旧は未試験。

追加監査: 本人の公開反映報告後にもEveリンクと遷移先表示の不一致、およびC01を再現。本人訂正によりJenniferの現行名はNoah。監査画像のJenniferは当時の旧表示として保持する。既存レポートにF01〜F08（P1 1/P2 7）と再現・修正・合格条件を追記。前回14件は履歴、今回全件再受入ではない。次は公開artifact/sourceの照合→F01/C01→F03/F05/F06。実装と配備は本監査では変更していない。

2026-11-01再確認: C01/C02/C08とF01〜F08の11項目で修正確認0。Noah旧名・Eve遷移・Escape・mobile close等を公開UIで再現。主要asset名は同じだが公開操作失敗とは断定せず、次は修正build/deployment IDと独自ドメイン/cacheの照合。既存監査・証拠のlatestRecheckを参照。

## Eve／Noahの未配備候補を公開（2026-11-02 / WEB04・HOME01・SKY21・ROCK）

前チャットの検証済み候補f18bc82を公式Sites helperの非表示stdinでv138へ通常配備。独自domainでEve入口・Noah表記・コミュニティー往復・16pxフォーム/Escape保持・390px横overflow0を確認。候補全verify成功と、別共有rootの既存database:check失敗を分離。Pixelは未接続で未受入。GitHub/main未反映、既存DB/接続/仕事/modelを保持し推論なし。source・配備ID・安全な再開手順・残gateは[配備記録](../evidence/eve-noah-publication.json)。

2026-11-02配信照合: avoado.siはproject appgprj_6abdfad4c5648191bcae957913bd02fa/v138/f18bc82、11/2 00:20 EST公開。共有Rootのhosting project appgprj_6aa444b6e6508191a19f16405d0be927はColumbiaで別物。6 public asset応答がclean候補とbyte一致。昨日の旧挙動は修正前v137公開時の観測。旧/chatのJennifer見出しは最新sourceの修正漏れとして残る。既存監査の11/2照合と証拠deploymentReconciliationを参照。次は認証を保った表示同期とSite/domain/source/publicationの一体検証。


## Columbia専用Siteの公開停止（2026-11-02 / WEB06・SKY21・ROCK）

本人の削除指示に基づき、project `appgprj_6aa444b6e6508191a19f16405d0be927` はowner-only/customへ変更、`columbia.avoado.si` を解除。domain一覧0件、canonical URLのログイン要求を確認。avoado.siの別project/v138/public/domain activeとEve表示を保持した。完全削除APIがなく、管理UI操作も未成立のため、Siteレコード/source/storageは残る。Root `.openai/hosting.json` の旧IDは再公開に使用しない。EXTERNALの管理画面でこのIDの削除が残件、DNS providerのレコード削除は未実施。証拠・検証は[公開停止記録](../evidence/columbia-site-retirement.json)。一般ローンチ等の他gateは変更しない。
