## 7件の修正と公開確認（v141）

2026-11-02、Eve・Noahの導線R01〜R07を修正し、avoado.siへ公開。source `c4ab58b29d702abb03790fdca0a8ff708563bbd7`、Sites v141、配備成功と内部ブラウザで7件の実操作を確認した。以下の旧監査は修正前の履歴として保持する。

- **R01 修正済み**：Noah SPIDER 今すぐ使う→/os/eve?mode=tools&tool=rockstar-spider&thread=…; Tool名とEve本人確認を表示。共通成果ナビは同じtool/threadにview=workを追加。旧/chatのquery保持はlocal UIと回帰で確認。
- **R02 修正済み**：Cloud/Tool各ボタン→専用hash。details.open=true、activeElementは対象id。Cloud y100.07、Tool横overflow0。
- **R03 修正済み**：公開ライブラリのEveの仕事と成果→/os/eve#eve-work-results。保存した仕事と成果の見出しが表示。
- **R04 修正済み**：設定→アカウントにreturnTo=/settings。設定へ戻るのhrefと実移動が/settings。通常accountのNoah導線→/#timeline。
- **R05 修正済み**：公開ニュース選択→同じ題名と原文href、受取bannerにfocus。最終版y97.5。資料メモへ進む→#eve-news-work/open/focus。送信なし。
- **R06 修正済み**：Noah共通ナビ、端末・担当→Noahのライブラリへ戻る→/#sky-manage、選択tab true。カタログ可視テキストにJennifer/Zema/smis/Skyのおすすめなし。Cloud/Tool子パネルもEve/Noah。
- **R07 修正済み**：390x844、メニュー開閉成功。仕事と成果/Toolを使う/Noahで探すがy137・高さ44px、横overflow0。

検証：候補全verify成功、最終補修39関連試験・型・lint・build成功。実推論、課金、パスキー解除後のTool実行、参加・投稿・共有の一周は未実施。認証・保存・権限の変更なし。実装はSites sourceに保存済み。共有root runtime/GitHub mainへの統合は未実施で、並行変更を守るため差分patchを保存した。

詳細証拠：[eve-noah-navigation-repair.json](evidence/eve-noah-navigation-repair.json)。実装差分：[patch](evidence/eve-noah-navigation-repair.patch)。

# avoado.si UI/UX・画面間接続監査

初回調査: 2026-10-31／最新接続監査: 2026-11-02（America/New_York）／対象: https://avoado.si

## 現在のEve・Noahの接続（11月2日・v139）

**上部ナビによるEve・Noah・コミュニティーの往復は動く。ただし、Toolの選択、成果への到着、戻り先の保持に不一致が残る。** 本人の最新訂正「今あるのはeveとnoahだけ」を適用し、主体は2つ。コミュニティー、Tool、ライブラリ、接続、設定を第三の製品として数えない。Jenniferは廃止名が旧画面に残っているという指摘である。

[操作できる関係図](/Users/kaiya/.cursor/projects/Users-kaiya-Documents-ChatGPT-avokdo/canvases/avoado-ui-ux-map.canvas.tsx)に現在の接続、改善後の役割分担、25確認項目・7指摘の再現結果と解決・合格条件を収録。画面が開くこと、選択が渡ること、実行・保存・共有が完了することは別判定とした。[Noahストア設計v0.4](noah-agent-model-store-design.md)の新しい一周は設計であり、本監査をもって公開実装済みとはしない。

### 調査対象と版の境界

- 正式Siteは `appgprj_6abdfad4c5648191bcae957913bd02fa`、最新保存v139、source `edfc0c4d396963457e8e5a92f7548448caf21bbc`。deployment `appgdep_6ae8453029d081919991cb58f61c2a67` は2026-11-02 03:10:33 ESTにsucceededと読戻し。
- 同SHAのclean checkout `/private/tmp/rockstar-boot-refactor-20261102` と公開ブラウザを比較。公開の主要JS名 `index-psOgs2KP.js` は同sourceのbuildと一致。v139の公開byte取得はHTTP403のためhash同一性は未確認。以下のv138 byte一致をv139の証拠へ転用しない。
- 内部ブラウザで認証済み画面を実操作。390×844、514×848、1280×720を使用。390pxはviewportによる模擬で、実機Safari等の合格ではない。一時viewportは終了時に解除した。
- 参加済みコミュニティー0件、Eveの選択実行先はoffline。作成フォームの合成入力は送信せず消去。実参加・投稿・共有、Agent追加、推論、課金、接続承認・解除、認証変更は未実行。Tool選択に伴うブラウザ内一時handoffは発生するが、実仕事の送信はしていない。
- GitHub main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6` / 作業branch `951d82d5a491a284aed4e0d4d280171d835d4b43` をconnectorで読戻し。公開source、共有Root、mainは別。同SHA CIは今回未取得。監査記録はGitHub保存・main統合・再公開を行っていない。

### 残る7件と解決・合格条件

1. **R01 / P1 — Toolを選ぶと廃止名の認証画面へ。** `/os/sky` のSPIDER「今すぐ使う」→ `/chat?tool=rockstar-spider&thread=…` で「Jenniferを開く」を表示。接続・権限画面の副ナビにも旧名が残る。選択Toolの説明も認証画面にはない。原因は同sourceの `components/sky-workspace.tsx:723–738` の旧chat handoffと `components/jennifer-access.tsx:157` 等の旧表示。**修正:** 選択Toolを保持してEveの正規Tool画面へ渡し、必要な認証は理由・戻り先付きで維持。**合格:** 認証前後でTool IDが一致し、旧名がなく、目的のToolへ進める。
2. **R02 / P2 — Cloudの成果が開かない。** 成果ビューの「Cloudの仕事と成果」→ `#eve-compose` で通常依頼画面に戻り、Cloud欄は閉じたまま。手動展開は可能。`components/eve-sync-workspace.tsx:851` はstateをtrueにするが、830行のdetailsにopen連動がない。**修正:** 開閉をstateに連動し、対象成果へfocus/scroll、成果種別をURLに保持。**合格:** 1回のクリックで既存Cloud成果を表示。Tool側は再検証で対象欄が開き、このCloud不具合と同一扱いしない。
3. **R03 / P2 — 管理の成果リンクが依頼へ。** `/#sky-manage` の「Eveの仕事と成果」実クリックは `/os/eve` へ着き、成果ビューに入らない。`components/sky-agent-library.tsx:134` のhrefが原因。**修正:** 既存 `/os/eve#eve-work-results` へ統一。**合格:** 成果見出しと保存済み一覧へ直接着く。
4. **R04 / P2 — NoahボタンがEveへ。** 設定→アカウント→「Noahへ進む」の実到着は `/os/eve`。`components/rockstar-account.tsx:35–42` の既定returnPathが `/`、120–126行の文言はNoah固定。設定からはreturnToなし。**修正:** 行き先に合わせて文言を変え、設定由来はreturnToを保持。**合格:** Noahへの操作はNoahへ、設定確認は設定へ戻り、再認証後も同じ意図を保つ。
5. **R05 / P2 — ニュースの引継ぎが見えにくい。** 記事URL・タイトル・取得時刻は正しく渡る。514×848では資料URL欄y約1024px、到着focusはBODYで、空の依頼画面に見える。URL入力欄はあるが、その場の原文リンクはない。**修正:** 選択記事の要約帯と資料草稿へのfocus、原文リンク・元記事への戻りを表示。**合格:** 初期画面だけで受取内容・次の操作が分かる。生成/保存成功は今回未試験。
6. **R06 / P2 — Noahの入口・語彙が分散。** 上部Noahは `/#timeline`、接続済み担当の「Noahへ戻る」は `/sky` 経由 `/os/sky` の別Tool一覧。追加・管理はさらに `/#sky` / `/#sky-manage`。「smis」「Sky」「Zema」の旧説明も混在。現行公開の担当作成はEve側にあり、最新のNoah構成設計と区別が必要。**修正:** Noah内の探す・構成・ライブラリ・端末管理を統一し、当面は戻り先を具体的に命名。**合格:** 同じ機能への入口で名称・選択状態・戻りが揃い、Eveの依頼を失わず準備して戻れる。
7. **R07 / P3 — 機能メニューを履歴として隠す。** 390pxの「会話の履歴」内にTool・Noah/MCP・仕事と成果・設定が入る。**修正:** 「メニュー」にするか履歴と機能入口を分け、成果への入口を常時表示。**合格:** 初見利用者が履歴を推測せず主要機能を発見できる。発見性の指摘は設計評価で、利用者テストによる定量証明ではない。

### 修正を確認した部分・未確認の一周

上部のNoah/Eve/コミュニティー往復、Eve成果ビュー、Tool成果の展開、追加/管理タブ、接続選択→端末接続→Eveは到達を確認。接続ページのEveリンクは正しい `/os/eve`。モバイル作成欄は16px・自動focus・y259pxで、Escape後も未送信入力を保持。招待入力フォームへfocusできる。カタログは844pxスクロールしても閉じるボタンy約33pxに残り、横overflow 0。検索対象の説明も表示される。前回F05の閉じるが消える問題は今回の条件では修正確認。

実コミュニティー投稿→Eveへの依頼→同じ仕事の成果保存→共有先/範囲を確認→コミュニティーへ戻る一周は未確認。端末offlineのためEve実行・保存/再表示も今回の監査では未確認。画面に既存履歴が表示できたことを、新しい仕事の実行成功とは扱わない。

最初にR01/R02/R03/R04の確定した行き先不一致を修正し、R05/R06の文脈引継ぎ、R07の発見性を続ける。実行受入は許可済み環境で同job/revision・成果・共有範囲を追跡する別試験とする。新しい試験コミュニティーや実仕事をこの閲覧監査で勝手に作成しない。接続・設定・アカウントは両方を支える共通画面。URLに残るskyは互換識別子として扱える。

- [Toolから到着した旧名画面](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/uimap-tool-legacy-gate.png)
- [ニュース引継ぎ先の初期表示](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/uimap-news-handoff.png)
- [390pxでスクロール後も残る閉じる操作](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/uimap-catalog-mobile-scroll.png)

記録検証: Canvas型診断0、project:update/check・baseline:check・共有Root全verify成功（API2152/CSV113）。初回sandboxのローカルHTTP listen EPERMは許可された通常権限で再実行して解消。ログ `/private/tmp/avoado-ui-connections-verify-unrestricted.log`。Canvasのパネル表示はqueuedで実描画未確認。共有Rootの試験を公開v139 sourceや実仕事の受入へ転用しない。詳細は機械可読証拠の `connectionAudit.validation`。製品sourceの変更・再配備・main統合は今回未実行。

## 11月2日未明：修正版v138と実配信の照合結果（履歴）

**この照合時点のavoado.siは修正版v138と一致した。昨日まで反映されていなかった主因は、修正コミットが本番公開に進んでいなかったこと。** 11月1日の「修正確認0」は当時の履歴で、現在の判定ではない。今回、Sitesの管理情報・配備時刻・cleanな修正source・実配信JS/CSS・ブラウザ操作を別々に照合した。

### 時系列（America/New_York、夏時間終了を反映）

| 時点 | 確認した状態 |
|---|---|
| 10月31日 04:10 EDT | v137、source `f77f15b9` の公開成功 |
| 10月31日 04:25 EDT以降 | v137より後にナビ・Noah・Escape・フォーム等の修正commitを作成 |
| 11月1日 14時頃 EST | 本チャットの再監査はv138公開前。旧表示・旧動作を観測 |
| 11月1日 23:56 EST | 最終修正版 `f18bc82e2cf7dcc0f6d0d66d30f7101bcda0c541` |
| 11月2日 00:20:28 EST | v138の公開成功。deployment `appgdep_6ae81d399f78819190adb8d93ce936b7` |
| 11月2日 00:56 EST | 独自domain／Sites本体／local buildのJS・CSSをbyte比較し一致 |

v137→v138は21commit・46path。v137のsourceには旧/chat誘導・Escapeの一律timeline移動・フォームの16px指定なし・Agent初期filterが存在し、前回観測と整合する。v138のsourceはそれらを変更している。過去の全CDN nodeの記録を取得したわけではない。

### 配備先と作業場所の分離

- **avoado.si**: project `appgprj_6abdfad4c5648191bcae957913bd02fa`。v138、domain/TLS active。正式Site originは `https://sky-marketplace.noellesugar1.chatgpt.site`。
- **修正版checkout**: `/private/tmp/eve-conversation-20261031`。HEAD `f18bc82e...`、clean、hosting manifestは上記avoado.siのprojectを指す。
- **共有Root**: `/Users/kaiya/Documents/ChatGPT/avokdo/.openai/hosting.json` は `appgprj_6aa444b6e6508191a19f16405d0be927`。Sitesで照合すると **columbia.avoado.si（v83）**。別Siteの設定であり、Rootを変更・検証しただけではavoado.siの公開証拠にならない。今回の修正が誤ってColumbiaへ公開された証拠はなく、設定を勝手に書き換えない。

### 実ファイルの照合

下記3ファイルは **avoado.si・Sites本体・修正版dist/clientでbyte一致**。2 origin × 3件の全HTTP応答が200。`CF-Cache-Status: HIT`でも新しいbyteが返り、`Cache-Control: public, max-age=0, must-revalidate`。今回取得した応答には旧版cacheの証拠がない。全ファイル／全CDN nodeの保証には拡張しない。

| ファイル | SHA-256 |
|---|---|
| index-18FQLBvn.js | `6ae7bf572f46d15baf1df9f47e7ecd814bf469d7e918de19096bb22f79bc8094` |
| index.CdIqq9KN.css | `d5d6cf6c4cb4169fd87278e554201f6a825ab5cc2d278edf1822f19e1cba7032` |
| os-home-entry.CrmEG1Mf.css | `9afdacd1de4abc769ba98959333510cf4bd12765d4a7d79136ac56a07bf5ea08` |

保存versionのsource SHAとarchive hashも既存の[配備記録](evidence/eve-noah-publication.json)と一致。HTTP取得では本文を出力せずhashと必要なcache headerだけ記録した。通常sandboxのDNS失敗後、許可されたread-only network取得を実施。認証tokenを取得・保存・送信していない。

### 今回の実画面確認と、まだ残る原因

- Noah・Eve・コミュニティーのナビが表示され、接続画面のEveは`/os/eve`。bare rootも`/os/eve`へ進む。
- コミュニティーの作成欄は16px、自動focus、PCで名前欄上端264.74px。未送信の合成名を入れ、入力欄以外でEscapeを押してもhashと名前を保持。終了前に合成名を消去した。実作成・投稿・接続承認・passkey操作なし。
- **旧URL `/chat` の「Jenniferを開く」は残る。これは配備漏れでなくsourceの修正対象漏れ。** 最新sourceの `components/jennifer-access.tsx:156–157,185` に旧見出し/案内、`app/chat/page.tsx:6` に旧metadataが残る。`components/sky-chat-workspace.tsx:354` がこの認証画面を描画する。公開ページでもtitleはEveだが見出しはJenniferを開くで、同じ内容を確認した。
- したがってF01は**通常ナビの遷移先は修正確認、旧認証画面の名称は未解決**。認証を外すのではなく、旧入口の扱いと現行名に合わせた表示・metadataを正しい公開sourceで同期する。
- 接続診断・Agentの下書き保存・招待失効等の残件は今回の配備照合をもって合格扱いしない。

次回の再発防止は、作業開始時にproject IDとdomainを照合し、source SHA → saved version → deployment succeeded → 実URLのasset hashを一つの証拠として記録すること。共有Rootの全verifyとclean配信候補の全verifyを混ぜない。今回は公開設定・再配備・cache purge・製品source・Git統合を変更していない。

GitHub readback: main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6`、作業branch `951d82d5a491a284aed4e0d4d280171d835d4b43`。今回同SHA CIを再取得しておらず、新規CI合格とはしない。

- [v138のコミュニティー画面](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/verified-v138-community.jpg)
- [v138でも旧/chatに残る名称](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/verified-v138-legacy-chat-label.jpg)

11月2日の記録検証: project:update / baseline:check成功、Canvas型診断0。共有Root全verifyは既存database:checkの再生成要求でexit1（ログ `/private/tmp/community-deployment-reconciliation-verify.log`）。製品sourceを変更していないclean配信候補の全verifyは再実行せず、既存v138公開記録のexit0と今回のHTTP/UI独立照合を別に扱う。

## 11月1日の公開版再確認（履歴）

**今回再確認した11項目では、修正済みと確認できたものは0件。** 動作の再現とUX設計上の課題を区別し、前回の全指摘を再試験したとは扱わない。Noahが現行名であり、以下のJenniferは公開画面に残る旧表示。

| 対象 | 判定 | 今回の観測 |
|---|---|---|
| F01 | 再現 | /connect/device上段Eveは/chat、下段Eveは/os/eve。上段の実クリック後はJennifer — RockstarOS / Jenniferを開く。/chat?review=20261101の新しい取得URLでも旧表示。 |
| C01 | 再現 | 未送信の名前を入力→メニュー→Escapeで#timelineへ移動、menuOpen=true。コミュニティーへ戻って作成を開くと名前は空。 |
| C02 | PCで再現 | 1280×720で作成クリック後、名前欄の上端731.63px。フォーカスは作成起点のまま。 |
| C08 | PCで再現 | 名前欄のcomputed font-sizeは12px。 |
| F02 | 再現 | Eveの接続確認待ちから汎用/connect/serviceへ移動。/connect/deviceには既存セッションがあるが、実行サービスやモデルの失敗段階は示されない。 |
| F03 | 再現 | 端末コードラベル13px・rgb(213,226,234)、背景白。前回と同じ色でコントラスト1.321:1。 |
| F04 | 再現 | Qwenを入力して「検索」を実行。Agent・Toolでは一致なし。LLM・モデルへ切替で同じ語のモデル候補が表示。 |
| F05 | 再現 | 390×844のカタログで1画面スクロール。dialog scrollTop844、閉じる上端-821.20px。 |
| F06 | 再現 | #communitiesを確認→追加・管理(#sky)→閉じる、で#timelineへ移動。 |
| F07 | 設計上の課題が残る | 担当作成は端末・モデルの選択肢がplaceholderのみで開始無効。目的入力前に準備で止まる。 |
| F08 | 設計上の課題が残る | LLMカードはrepository ID、task、license、DL数と費用注意書きが中心。対象端末への適合・実行準備の表示は未確認のまま。 |

公開版は新規タブで開き、Noahの名称はquery付き/chatでも再確認。PC1280×720とスマホ相当390×844で操作した。主要asset名3件は10月31日と同じ。ただし同一byte・配備失敗・CDN全体の状態の証明ではない。**次は修正source/build/deployment IDと、独自ドメインの配信先・キャッシュの照合を優先する。**

実データの作成・参加・投稿、端末接続承認/解除、passkey操作は実施していない。実機ブラウザ・読み上げ・実行成功は未試験。未送信の合成名だけ入力し、viewportの一時変更は解除済み。別のweb取得ツールではアクセスできず、実ブラウザの表示と操作を根拠とした。Git SHAの履歴は今回の最新確認へ読み替えない。

- [11月1日・旧名称が残る実画面](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/recheck-20261101-old-name.jpg)
- [11月1日・スマホのカタログ途中](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/recheck-20261101-mobile-catalog.jpg)

11月1日の記録検証: project:update / baseline:check成功、Canvas型診断0。全verifyは既存database:checkの2ファイル再生成要求でexit1、後段未実行。ログ `/private/tmp/community-ui-ux-recheck-20261101-verify.log`。Canvas実描画は未検証。

## 追加監査（公開反映済みとの回答後の再確認）

**追加8件（P1 1件／P2 7件）。最優先は、「Eve」のリンク先と表示名の不一致、およびNoahの旧名表示。** 前回14件は下に履歴として残す。全14件を再検証した結果ではない。

本人からavoado.siへ公開反映済みとの回答を受け、2026-10-31 10:22 UTCまでに通常URLの再読込と一度のquery付き取得を実施した。このブラウザで届いた版ではC01のEscapeによる#timelineへの遷移が残り、メニューも閉じなかった。F01の誤遷移とF03の色も回答後に再確認。主要な配信asset名は前回と同じだったが、それだけで公開操作の成否やCDN全体の状態は断定しない。配信artifactと修正sourceの照合が必要。

範囲をEve、接続、端末一覧、追加・管理、Agent作成wizardへ拡張し、PCと390×844で操作。担当・community・membershipを作成せず、接続承認・解除・passkey操作は行わなかった。テンプレートを選んだ未保存wizardは「変更を破棄」で終了。viewportの一時変更は解除済み。

名称訂正（2026-10-31・本人明示）: Jenniferの現行名はNoah。Eveそのものの改名とは扱わない。以下のJenniferは監査時に実画面で観測した旧表示を指し、現在の製品名として扱わない。名称更新の公開反映はこの訂正時には再試験していない。

### F01 [P1] 「Eve」のリンク先と画面名が不一致で、Noahの旧名称が表示される

分類: 動作不具合

- **確認した状態**: /connect/device の上段ナビ「Eve」は /chat、下段の同名リンクは /os/eve。上段を実クリックすると、タイトルも見出しもJenniferのパスキー画面へ移動した。/connect/serviceの上段も/chat。公開反映済みとの回答後に再取得して再現。
- **影響**: 仕事へ戻ろうとして別の入口に着き、必要でない認証を求められたように見える。
- **原因・根拠の限界**: 画面ごとにナビのリンク定義が異なる。local lib/os-navigation.tsでは/connect/*がEveリンク書換え対象に含まれないが、公開sourceとの同一性は未確定。
- **解決方法**: EveのリンクはEveの入口へ揃え、Noahへ案内するリンクはNoahと表示する。Noahのページタイトル・見出し・説明に残る旧名Jenniferを更新する。共通ナビ定義と既存のパスキー保護は維持する。
- **合格条件**: ホーム・接続・設定の全「Eve」リンクからEveへ到達。ページ名、URL、現在地表示が一致する。
- **証拠**: followup-eve-link-jennifer.jpg、公開実クリック、DOM href。

### F02 [P2] 「端末との接続を確認」の先に原因と復旧手順がない

分類: 復旧フローの欠陥

- **確認した状態**: /os/eveの開始操作は接続確認待ち。「接続状態を確認する」は汎用/connect/serviceへ進み、その先は新規ペアリングとセッション一覧。既存の端末セッションは表示されるが、実行端末の通信・runner・モデルのどこが未準備かを示さない。担当作成からの端末一覧でも同じ接続確認案内になる。
- **影響**: 接続済みと表示されるのに仕事を始められず、再接続すべきかモデルを起動すべきか判断できない。
- **原因・根拠の限界**: accountの端末セッションと、実際の実行環境の稼働状態を利用者向けに区別できていない。端末がオフラインであること自体を不具合とは判定しない。
- **解決方法**: 対象端末名、最終応答、認証セッション、実行サービス、モデル準備を段階表示し、失敗段階に対応する操作を一つ提示する。元の仕事と選択端末を保持して復帰する。
- **合格条件**: セッションあり・runner停止、未ペアリング、モデル未準備、通信失敗を区別し、それぞれ適切な復旧後に元の仕事へ戻れる。
- **証拠**: /os/eve → /connect/service → /connect/device、/os/sky/devicesの実操作。

### F03 [P2] 端末コードのラベルが白背景にほぼ溶け込む

分類: アクセシビリティ

- **確認した状態**: /connect/deviceで「端末の状態を再確認」後、13pxの「端末に表示されたコード」がrgb(213,226,234)、背景白。相対輝度からのコントラスト比は1.321:1。入力本体は暗色背景。公開反映済みとの回答後にも同じcomputed styleを確認。
- **影響**: 入力欄に何を入れるべきか読み取りにくい。
- **原因・根拠の限界**: 明るいページへ暗色テーマ向けの文字色が残っている可能性。通常の有効な入力欄のラベルで、無効部品の例外ではない。
- **解決方法**: 固定色をテーマの本文・ラベル色へ置換し、通常文字は背景に4.5:1以上を確保。light/dark両方で説明、placeholder、focus、エラーも確認する。
- **合格条件**: light/darkの実表示でラベル4.5:1以上、200%拡大でも欄と説明を識別できる。
- **証拠**: followup-device-form.jpg、computed style、WCAG 1.4.3。

### F04 [P2] 全種類を探せそうな検索欄が、選択中の種類しか検索しない

分類: 検索UXの欠陥

- **確認した状態**: 検索欄は「モデル・Agent・Toolを検索」。初期の「Agent・Tool」でQwenを検索すると一致なし。同じ検索語のまま「LLM・モデル」へ切り替えるとQwenのモデルが表示された。
- **影響**: 候補が実在していても、サービスにないと誤解しやすい。
- **原因・根拠の限界**: 検索欄の表現は横断検索だが、検索範囲は現在の種類で限定。検索の計算自体の故障とは判定しない。
- **解決方法**: 横断検索を初期値にするか、「Agent・Tool内を検索」と範囲を明記。別種類の一致件数と切替リンクを検索結果の近くに出す。
- **合格条件**: 同じ語で他の種類に一致する場合、0件画面からその結果へ1操作で到達できる。
- **証拠**: #skyのQwen検索と種類切替を実操作。

### F05 [P2] カタログをスクロールすると「閉じる」が消える

分類: モバイル操作の欠陥

- **確認した状態**: 390×844の追加・管理dialogは高さ約743px、scrollHeight6141px。内部scrollTop844で閉じるボタンの上端は-821px、検索欄も画面外。種類タブは上部に残る。
- **影響**: 一覧の途中から閉じるために最上部まで戻る必要があり、長いカタログほど離脱しにくい。閉じる操作そのものが不可能という意味ではない。
- **原因・根拠の限界**: dialogのタイトル・閉じる操作がスクロール領域に含まれ、常時見えるヘッダーに固定されていない。
- **解決方法**: dialog上部のタイトルと閉じるをstickyにし、一覧だけをスクロール。小画面でも常に閉じられ、元の起点へフォーカスを戻す。
- **合格条件**: 390pxと320pxで先頭・中間・末尾のどこからでも、タッチ1回で閉じられる。
- **証拠**: followup-mobile-catalog-scroll.jpg、dialog/close要素の位置測定。

### F06 [P2] 追加・管理を閉じると元のコミュニティーへ戻れない

分類: 遷移設計の改善

- **確認した状態**: コミュニティー → ＋追加・管理 → 閉じる、で#timelineへ移動。閉じるボタン名にも「ホームへ戻る」とあるので、現行仕様に沿った動作だが起点は保持されない。
- **影響**: 調べ物をしただけで元の作業場所を失い、コミュニティーを開き直す必要がある。
- **原因・根拠の限界**: 閉じる処理が常にtimelineへ戻す。前回C01のEscapeと関連するが、こちらは明示的な閉じるボタンの遷移。
- **解決方法**: 起動元のroute・scroll・focusを保存して閉じる際に戻す。直接URLで開いた場合だけホームを既定の戻り先にする。
- **合格条件**: コミュニティー・ニュースの両方から開閉して、元の画面・スクロール・起点へ戻る。
- **証拠**: #communities → #sky → 閉じる → #timelineを実確認。

### F07 [P2] やりたいことを書く前に端末とモデルの準備で止まる

分類: 初期利用UXの改善

- **確認した状態**: /os/eve「担当を作る」は「どんな働きがほしいか入力」と案内するが、現在のセッションでは端末とモデルの選択肢がプレースホルダーだけで開始無効。目的を書く欄へ進めない。PixelのTerminal/Linuxや同期の準備を案内。別のAgent作成画面ではBinder接続、GGUFのIDなども選択判断に現れる。
- **影響**: 仕事の相談から始めたい利用者が、先に実行環境の仕組みを理解しなければならない。
- **原因・根拠の限界**: 目的の下書きと実行可能性の確認を同じ開始条件で止めている。接続前の実行を制限すること自体は適切。
- **解決方法**: 目的と担当の下書きを先に保存できるようにし、その後に利用可能な端末・モデルを案内。技術用語は詳細へ。未接続状態では保存のみと明示し、実行時の権限・費用承認は維持する。
- **合格条件**: 端末未接続でも目的の下書き作成・保存・再開が可能。実行は接続と必要な承認後だけ開始し、無断のcloud切替をしない。
- **証拠**: /os/eve?view=build、#sky-manageの未保存wizardを操作し変更を破棄。

### F08 [P2] モデルの人気やIDに比べ、今使えるかの判断材料が弱い

分類: 選択支援UXの改善

- **確認した状態**: LLM候補にはrepository ID、task ID、license、download数、追加ボタンと費用の注意書きがある。一覧上では対象端末への適合、必要な接続、実行準備状況が分からない。
- **影響**: 追加した後に使えないことが分かる可能性があり、専門知識なしでは選びにくい。
- **原因・根拠の限界**: 候補の発見・保存と、対象環境での実行準備の違いを一覧で判断しづらい。実際のモデル実行可否は本監査では未試験。
- **解決方法**: 用途を平易に示し、選択中の環境に対して「利用可能／接続が必要／適合未確認／候補として保存」を区別する。費用見積・実行先・外部実費は別表示し、未検証の適合を保証しない。
- **合格条件**: 一般利用者が追加後に何ができるか、必要な準備と費用確認先を説明できる。適合未確認を実行可能と誤表示しない。
- **証拠**: #skyのLLMカード、既存の費用注意書き。UX判断であり故障の断定ではない。

### 追加分の修正順と維持すべき点

1. F01の共通ナビと、再現が残るC01を先に直す。公開artifact単位で再確認する。
2. F03の文字色、F05の常設close、F06の起点復帰を修正する。
3. F02の状態別復旧、F04の検索範囲、F07/F08の開始・選択支援を改善する。

Agent作成wizardの未保存状態での切替抑止と「変更を破棄」は機能した。費用・権限の事前確認、未接続時の実行制限、無断のcloud切替をしない案内は保持する。端末が稼働していない事実自体をUI不具合へ換算しない。

文字コントラストの基準: [WCAG 2.2 — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。計算した1.321:1は通常13pxラベルの観測色に基づく。

証拠画像:

- [Eveから遷移した画面の旧Jennifer表示](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/followup-eve-link-jennifer.jpg)
- [端末コードのラベル](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/followup-device-form.jpg)
- [スマホのカタログ途中](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/followup-mobile-catalog-scroll.jpg)

---

追加記録の検証: `npm run project:update` と `npm run baseline:check` は成功。Canvas型診断0。全 `npm run verify` は既存の `data/database-status.json` と `docs/database-status.md` の再生成要求で `database:check` 停止（exit1）。後段を成功扱いしない。ログ `/private/tmp/community-ui-ux-followup-verify.log`。本監査による製品source変更、main統合、公開はない。

## 初回監査の履歴（C01〜C14）

**結論: 最優先はEscapeによる画面離脱・下書き消失、画面外のフォーム、招待エラーの誤案内の3件。** 14件の指摘を、観測事実とUX上の評価を分けて整理した。P1=作業継続・復旧へ大きく影響、P2=入力・理解・利用可能性の改善、P3=補助的改善。P1はセキュリティ事故の重大度を示す分類ではない。

## 調査範囲と証拠

実ブラウザの1280×720、768×1024、390×844、320×667で初期表示・作成フォーム・招待フォーム・不正形式／不正ID・必須入力・メニュー・Escape・復帰を操作。DOM、computed style、適用CSSとローカルsourceを照合した。既存の認証セッションを利用した。匿名利用者を新規作成した試験ではなく、account識別子は証拠へ保存していない。

新規コミュニティーの確定作成、実招待での参加、投稿、権限変更は行っていない。不正な試験データによる招待preview以外のserver変更操作はない。公開実データと認証状態を保持。viewport変更は解除済み。

正常作成後の管理・投稿・実招待の有効期限・別account・別端末の鍵復旧・未ログイン・実iOS/Android・VoiceOver/TalkBack・低速回線・offline・負荷／性能ベンチマークは未試験。この未試験範囲を欠陥あり／合格とは判定しない。

主担当: Web / PWA / Sites、ROCK。既存task: WEB04 / HOME01 / SKY21。UI・状態・導線はROCK、hosting/認証基盤はEXTERNAL、実account/複数端末の受入はJOINT、参加・招待・公開の最終操作はOWNER。一般ローンチ保留とaccount＋専用鍵の条件は維持。

GitHubのmainは `1daf5c340f23fb40e52289d276cd5ec1ca271fa0`、作業branch `codex/esim-cloud-access` は `951d82d5a491a284aed4e0d4d280171d835d4b43` と接続GitHub APIで確認。ローカルは同branch HEADだが既存の大量未commit差分がある。shellでのGitHub取得はDNS失敗後にconnectorへ切り替えた。公開artifactとGit SHAの対応は未確定。CIの今回の新規受入はしていない。ローカル修正候補が公開済みとは扱わない。

公開読戻し例: `/_next/static/css/index.C7P2tq_r.css`、`/_next/static/css/home-screen.C92TPh4y.css`、`/_next/static/chunks/index-D3GIvtdn.js`。アセット名だけをGit SHAの証明へ転用しない。

## 欠陥・改善案・合格条件

### C01 [P1] Escapeで別画面へ移動し、下書きが消える

分類: 動作不具合

- **確認した状態**: 作成フォームの名前に未送信の試験文字列を入力→右上の「…」を開く→Escape。URLが #communities から #timeline へ変化し、メニューは開いたまま。閉じてコミュニティーへ戻り、作成フォームを開き直すと名前は空だった。入力欄にフォーカスしたままのEscapeでは移動しない。
- **利用者への影響**: メニューを閉じる日常的な操作で作業の文脈と入力内容を失う。
- **原因／根拠の限界**: 公開UIで再現。ローカル components/home-screen.tsx:59 にも、INPUT/TEXTAREA/SELECT以外のEscapeを一律 #timeline へ送る処理がある。公開とローカルの同一buildは未確定。
- **解決方法**: Escapeは最前面のメニュー／ダイアログだけを閉じ、起点へフォーカスを戻す。フォームの編集中状態は親状態または安全な下書きへ保持し、無関係なhash遷移を行わない。秘密の招待鍵を永続下書きへ保存しない。
- **修正後の合格条件**: 名前・説明・ルールを入力→メニュー→Escapeでも #communities と入力を保持、メニューだけ閉じる。Tab移動後・ボタンフォーカス時も同じ。
- **証拠**: 実ブラウザで2回の経路確認、復帰後 value=''。

### C02 [P1] 「作る」「参加する」を押しても入力先が見えにくい

分類: 動作不具合

- **確認した状態**: フォームは大きな空状態カードの下へ追加され、フォーカスは押したボタンのまま。390×844・scrollY=0の観測ではフォーム上端756.6pxで、最初の入力欄が画面下端付近／外になる。1280×720でもフォームの見出しが最下部に出るだけ。閉じると起点へフォーカスが戻らない。
- **利用者への影響**: 反応がないと思って連打する、スクロールの必要に気づかない、キーボードで入力位置を探す。
- **原因／根拠の限界**: Directoryを表示したまま、その後ろへ条件付きform/detailsを挿入。起動・終了時のフォーカス制御がない。
- **解決方法**: 一覧を専用作成画面へ切り替えるか、見出し付きdialogへ表示。入力中は空状態を隠す。開いたら見出しまたは最初の入力へ、閉じたら起点へフォーカスを移す。
- **修正後の合格条件**: 320/390/768/1280pxで押下直後に見出しと最初の入力を確認でき、Tab/Shift+Tabと閉じる操作で現在地を失わない。
- **証拠**: community-mobile-form-below-fold.jpg、community-mobile-measurements.json。

### C03 [P1] 招待の入力ミスを「読み込み障害」と表示する

分類: 動作不具合

- **確認した状態**: 招待欄へ invalid-test-key を入れると「コミュニティーの読み込みを確認できません」。詳細を開いて初めて「招待鍵のJSONを確認してください」。修正と関係のない「再読み込み」も出る。形式だけ合うダミーJSONでも、実際の理由「IDを確認してください」は同じ折りたたみに隠れる。
- **利用者への影響**: 入力修正が必要なのに通信障害だと思い、再読込み・待機を繰り返す。
- **原因／根拠の限界**: 入力・招待検証・取得失敗を同じerror表示で扱う公開UI。ローカルsourceはrole=alertの直接表示で、配信版とは差がある。
- **解決方法**: 招待欄の直下に「招待情報の形式を読み取れません。管理者から受け取った内容を省略せず貼り付けてください」。期限切れ／失効／別アカウント／通信失敗を区別し、それぞれに合う復旧ボタンを置く。
- **修正後の合格条件**: 不正形式を入れた直後に対象欄と理由が見える。形式エラーで「再読み込み」を案内せず、通信失敗だけ再試行できる。
- **証拠**: community-invite-error-desktop.jpg、community-error-dom.txt。

### C04 [P2] 招待エラーが支援技術へ伝わる構造になっていない

分類: アクセシビリティ

- **確認した状態**: 公開ページのエラー発生後、role=alert／aria-liveを持つ要素は0件。招待textareaにaria-invalid・aria-describedbyがなく、詳細は閉じていた。
- **利用者への影響**: 画面の変化を見られない利用者が、失敗理由と修正場所を把握しづらい。読み上げ音声そのものは未試験。
- **原因／根拠の限界**: エラーを通常のdetailsとして追加し、入力欄とのプログラム上の関連がない。
- **解決方法**: 欄別エラーに一意のID、aria-describedby、aria-invalidを付ける。送信後のエラーはrole=alert、読み込み等はrole=statusで通知し、必要時はエラー対象へフォーカスする。
- **修正後の合格条件**: DOM関連を確認し、VoiceOver／TalkBackで対象欄・理由・修正方法を聞いて再入力できる。
- **証拠**: 実DOM測定。WCAG 3.3.1・4.1.3を改善基準に使用。

### C05 [P2] 参加にJSONの貼り付けを要求している

分類: UX設計改善

- **確認した状態**: 「受け取った招待鍵」の唯一の入口がtextareaで、placeholderは「管理者から受け取った招待鍵のJSON」。ファイル選択や分かりやすい招待リンクの入口は表示されない。
- **利用者への影響**: 一般利用者に内部データ形式の理解・完全なコピーを要求し、スマホでの参加負荷が高い。利用者テストによる離脱率は未測定。
- **原因／根拠の限界**: 内部の招待schemaを、そのまま利用者の入力方式へ露出している。
- **解決方法**: 招待を開くリンク／QR、または招待ファイルを読み込む入口を主にする。短期・失効可能な招待tokenを使い、アカウント確認と参加ルールの同意を維持。個人用アクセス鍵・復旧鍵はリンクへ含めない。JSONは詳細操作へ移す。
- **修正後の合格条件**: JSONの用語を知らなくても招待の宛先・ルールを確認して参加できる。失効／期限切れ／異なるaccountを試験する。
- **証拠**: 公開参加フォームと components/sky-social-timeline.tsx:1313 付近。

### C06 [P2] 確認が二段階で、検証成功前に招待入力を消す

分類: 動作・フロー不具合

- **確認した状態**: 「招待を確認する」はJSONを解析して入力を空にし、さらに下に「場所とルールを確認」を表示するだけ。ダミーJSONで二つ目を押して「IDを確認してください」と失敗した後も入力は空だった。
- **利用者への影響**: 同じ意味のボタンを二度押す必要があり、失敗後に元の内容を確認・訂正しにくい。
- **原因／根拠の限界**: JSON parseとserver previewを別操作にし、parse成功時にinvitationTextを消している。
- **解決方法**: 「招待内容を確認」の一回で解析・検証・preview表示まで進む。成功まで入力を保持し、確認カードに名前・説明・ルール・参加条件を表示。参加の確定は別ボタンで本人が行う。
- **修正後の合格条件**: 確認1回でpreviewまたは欄別エラー。失敗後も同じ入力を訂正でき、参加ボタンを押すまで所属は変わらない。
- **証拠**: 実ブラウザ、ローカルsourceのsetInvitationText('')とpreviewInviteの分離。

### C07 [P2] 必須／任意と文字数の条件が事前に分からない

分類: 入力案内の欠陥

- **確認した状態**: 名前・どんな場所？・参加ルールが同じ表示。DOM上は名前とルールがrequired、説明は任意。上限60／300／500文字の表示がなく、空送信で初めてブラウザの必須エラーが出る。
- **利用者への影響**: 説明まで必須だと誤解する、ルールを飛ばして送信に失敗する、入力が上限で止まった理由が分からない。
- **原因／根拠の限界**: HTML属性のみで制約を持ち、利用者向けのラベル／説明へ反映していない。
- **解決方法**: 「名前（必須）」「説明（任意）」「参加ルール（必須）」、上限と残文字数を示す。ルールの短い記入例／選んで編集できる雛形を用意する。
- **修正後の合格条件**: 送信前に必須項目と上限を理解できる。空欄／上限／上限超過／日本語入力を欄別に確認する。
- **証拠**: DOM required/maxLengthと空フォーム送信で実確認。

### C08 [P2] スマホの入力文字が12pxで小さい

分類: UI設計改善

- **確認した状態**: 390px幅の名前・説明・ルール入力のcomputed font-sizeが12px。説明文も小さい密度でまとまる。
- **利用者への影響**: 入力内容の確認・編集をしにくくする。実iPhoneでの自動ズームや実機キーボード干渉は未確認。
- **原因／根拠の限界**: 入力のfont-sizeが小さい親要素から継承されている。
- **解決方法**: 入力本文は原則16px以上、補助説明は14px程度を出発点に調整。行間・欄の高さを確保し、画面拡大でも内容を失わない。これは本監査の設計目標で、WCAGが16px固定を要求するという意味ではない。
- **修正後の合格条件**: 実iOS Safari／Android Chromeで入力・修正・選択・200%拡大を試し、意図しない拡大や操作の隠れがない。
- **証拠**: community-mobile-create.jpg、computed font-size 12px。

### C09 [P2] 空の入力欄を示す境界線が薄い

分類: アクセシビリティ

- **確認した状態**: 公開フォームの入力背景は白、境界はrgb(189,189,189)。sRGB相対輝度で白とのコントラストは約1.88:1。名前欄は空のとき入力面を区別する別の塗り分けがない。
- **利用者への影響**: 弱視や明るい場所では入力できる範囲を見つけにくい。サイト全体のWCAG適合判定は行っていない。
- **原因／根拠の限界**: 白地に薄い境界線だけで入力領域を表している。
- **解決方法**: 必要な入力境界とフォーカスを隣接色に対し3:1以上にし、フォーカス時は太さ等でも区別する。例として白地の#767676を検討する。
- **修正後の合格条件**: 通常・focus・errorの各状態を計算色で検証。不要な装飾境界やdisabled部品まで一律に不合格扱いしない。
- **証拠**: 公開computed color。W3C WCAG 1.4.11の入力境界の説明。

### C10 [P2] 作成を確定するボタンと閉じるボタンが同じ強さ

分類: UI設計改善

- **確認した状態**: 入口の「コミュニティーを作る」は濃い塗りだが、フォーム末尾の「作成する」「閉じる」は同じ白地・枠・文字サイズ。
- **利用者への影響**: 肝心の確定段階で次に押す主操作が弱まり、閉じる操作と見分けにくい。誤操作率は未測定。
- **原因／根拠の限界**: フォーム内のbuttonに共通スタイルを適用し、primary／secondaryの役割がない。
- **解決方法**: 「コミュニティーを作成」を明確なprimaryに、「キャンセル」をsecondaryにする。処理中は文言と状態を示す。閉じた後も下書きの扱いを明確にする。
- **修正後の合格条件**: 初見で確定と中断を区別でき、送信中の重複操作を防ぐ。色以外にも文言・配置で区別する。
- **証拠**: community-mobile-create.jpgと公開computed styles。

### C11 [P2] 右上メニューが不規則に横並び・折り返しになる

分類: 表示不具合

- **確認した状態**: PCで「アカウント」の隣にDEVELOPER、その次行にPREVIEWとブックマーク。「機能を追加／Campus」「利用環境をつなぐ／設定」も同じ行に混在する。
- **利用者への影響**: メニューのまとまりとクリック範囲が読みにくい。Developer Preview表示も分断される。
- **原因／根拠の限界**: 公開CSSで .os-header .os-header-actions :is(a, button, summary) のinline-flexが、._mobileActions… nav > a のflexより高い詳細度で勝つ。nav自身はblock。これは配信CSSで確認済み。
- **解決方法**: 共通ヘッダーの横並び規則を直下のアクションだけへ限定。メニューはgrid／縦flexで各項目を全幅にし、Preview表示を独立した見出しまたはフッターにする。
- **修正後の合格条件**: 320/390/768/1280pxと200%拡大で1項目1行、文字の不自然な分断がなく、Tab順と見た目の順が一致する。
- **証拠**: community-menu-desktop.jpg、index.C7P2tq_r.cssとhome-screen.C92TPh4y.cssの一致規則。

### C12 [P2] 正式名Smithに対し公開画面がsmisのまま

分類: 製品表示の不一致

- **確認した状態**: 主要タブ・アカウント画面・Eveの作成案内に「smis」。ローカルの製品正本では2026-10-23に正式表記をSmithへ訂正している。
- **利用者への影響**: 説明・案内と画面が一致せず、同じ製品なのか分かりにくい。
- **原因／根拠の限界**: ローカルsource／正本と公開配信版の差。配信buildとGit SHAの対応は本監査では確定していない。
- **解決方法**: 表示ラベルを共通の製品辞書へ集約しSmithへ統一。必要箇所だけ「旧Sky／smis」を短期案内。既存URL・API・保存keyは互換維持する。
- **修正後の合格条件**: 公開ドメインでタブ・account・Eve・ヘルプを横断して表示を確認し、配信artifactとsourceを照合する。
- **証拠**: data/product-baseline.json のsmisIdentity、READMEの正式名と実画面。

### C13 [P2] 空状態の情報が重複し、何ができる場所なのか弱い

分類: UX設計改善

- **確認した状態**: タブに加えて「コミュニティー」「コミュニティー」「あなたのコミュニティー」と見出しが重複。大きな空カードも「作る／鍵で参加」を繰り返すだけ。共有できるもの・個人情報との境界・使い方の例は初期画面にない。
- **利用者への影響**: 初見で目的を理解する情報が少ない一方、入力フォームまでの距離が長い。認証済みでも「あなた」がどの公開プロフィールかはこの面に出ない。
- **原因／根拠の限界**: セクション・timeline・directoryそれぞれの見出しを重ね、空状態を機能説明へ活用していない。
- **解決方法**: ページ見出しを一つにし、「仲間とAgent・モデル・作品やルールを共有する場所」など実提供機能に沿った1文、短い利用例、作る／参加の2導線を置く。会話・認証・支払権限が共有されない境界を簡潔に示す。参加中の実例がなければ架空メンバー数を作らない。
- **修正後の合格条件**: 対象利用者が何を共有できるか、誰が入れるか、最初の操作を自分の言葉で説明できるか確認する。需要・離脱率改善は測定してから記録。
- **証拠**: community-desktop-initial.jpg、390px初期画面、正本のcommunity契約。

### C14 [P3] 更新完了と「本当に0件」の確認が分かりにくい

分類: 状態表示の改善

- **確認した状態**: 更新中は更新ボタンが無効化されるが、完了後は同じ空状態へ戻り、取得時刻や「0件を確認しました」等の完了案内は表示されない。
- **利用者への影響**: データが無いのか、取得できたのかを再確認したくなる。今回の空状態は既存認証セッションでの観測で、匿名表示とは断定していない。
- **原因／根拠の限界**: コミュニティー画面で更新結果のstatus表示がない。
- **解決方法**: 成功時に控えめな「更新しました・参加中0件」と時刻を表示しrole=statusで通知。未読込・読込中・取得失敗・正常0件を別状態にする。
- **修正後の合格条件**: 0件・複数件・通信失敗・再試行成功をテストし、成功と失敗で同じ空画面だけにならない。
- **証拠**: 実更新操作と画面状態。データ取得の内部レスポンスは本監査で直接収集していない。

## 修正する順番

1. **作業が消える問題を止める（C01）**: global Escapeを限定し、メニュー／dialogの閉じ方と下書き保持を整える。入力欄以外にfocusがある場合も回帰検証。
2. **作成・参加を一つの明確な流れへ（C02/C03/C04/C06）**: 画面内にフォーム、1回の招待preview、失敗の正しい理由、入力保持、focus/読み上げ対応。
3. **一般利用者が入力できる形へ（C05/C07/C08/C09/C10）**: 招待ファイル／リンク、必須・文字数・記入例、可読性・境界線、確定操作の明確化。
4. **共通UIと説明を整える（C11/C12/C13/C14）**: メニューCSS、Smith表記、見出し・空状態、更新結果。新規デザインを公開する前に同じ配信候補で再操作する。

担当への引継ぎではmainと作業branchの契約差・既存dirty sourceを先に照合。修正source、検証artifact、公開配信の対応を固定してから公開読戻しする。監査文書の保存、実装branchへの反映、main統合、配備は別々に記録する。本監査は文書と証拠の保存のみ。

## 望ましい操作の流れ

作成: 一覧 → 作成フォーム（名前必須／説明任意／ルール必須） → 内容確認・作成 → 個人用鍵の保管案内 → コミュニティー。

参加: 招待を開く／読み込む → コミュニティー名・ルール・accountを確認 → 本人が参加を確定 → コミュニティー。招待の取得・previewだけで参加や権限付与をしない。

失敗: 入力の直下に原因と直し方を表示 → 入力を保持 → 訂正／再試行。個人の鍵・復旧鍵を招待リンクやURLログへ出さない。

## 維持できている点

- 320/390/768pxでページ全体の横はみ出しは観測されなかった（documentWidth=viewport width）。
- 主要な作成／参加ボタンに文字ラベルがあり、入口の高さは46px。
- 現在のコミュニティータブは `aria-current=page` を持つ。
- 作成フォームには名前／ルールのHTML必須制約があり、空送信で実際に停止した。
- 認証情報・支払権限・個人会話を共有しない説明が作成フォームにある。改善でこの境界を落とさない。

## アクセシビリティの評価基準

エラーは対象項目と理由を文字で伝えるという [WCAG 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)、入力条件の説明に関する [WCAG 3.3.2](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)、状態の通知に関する [WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) を改善基準にした。DOM上の不足を確認したもので、スクリーンリーダー実機を含むサイト全体の認証ではない。

入力境界の3:1は [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) の識別に必要な境界の説明に基づく。白と#bdbdbdの相対輝度比は約1.88:1。文字16pxは本監査の設計提案であり、WCAGの固定最小文字サイズではない。タップ領域の [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) は24 CSS pxまたは間隔等の例外を含むため、44px未満を一律違反とはしていない。

## 証拠画像

![作成・キャンセルが同じ強さで、必須表示がないモバイルフォーム](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/community-mobile-create.jpg)

![メニューの折り返しと分断](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/community-menu-desktop.jpg)

![入力エラーが読み込み失敗として表示される](/Users/kaiya/.codex-work/visualizations/2026/10/31/01a19139-c485-7a42-9d3f-8602c6678634/community-invite-error-desktop.jpg)

機械可読の監査: [community-ui-ux-audit.json](evidence/community-ui-ux-audit.json)。元画像・DOM・計測JSONは上記ローカルartifactディレクトリに保管し、巨大ログ・画像をGitへ追加しない。

## 検証・未完了

公開UIでの本監査は完了。修正実装・正常系の実データ操作・main統合・再配備は未実施。repo検証コマンドと結果は進捗JSONの `communityUiUxAudit` に記録する。次担当はC01〜C03を先に修正し、同じviewport・操作で再検証する。


検証結果: `npm run project:update` exit0、Canvas TypeScript diagnostics 0。`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` はTLS/project/repository/version/schemaまで成功し、既存 `data/database-status.json` と `docs/database-status.md` の再生成要求で `database:check` にてexit1。後段は未実行。ログ: `/private/tmp/community-ui-ux-verify.log`。DBの既存内容は本監査で再生成しない。

全verifyで未到達だった `npm run baseline:check` は別実行してexit0。ログ: `/private/tmp/community-ui-ux-baseline.log`。
