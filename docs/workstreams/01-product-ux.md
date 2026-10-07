# Product / UX

> **復元と並べ替え（2026-10-07）** — 2026-10-05のmerge `ecb4b2af` で、この文書はmain側の版（SIM/eSIM主導の目的と、2026-10-01〜02の記録17節）を失い、09-29時点の版へ戻っていました。main側の版をGit履歴（`624124cf`）から戻し、その後に足されたAMC02の3項目を「現在地」へ残しています。あわせて、題名の上や「次に進める順番」の途中に挟まっていた日付付きの記録を、末尾の「日付付きの記録」へ集めました。文言は変えていません。内訳は[merge欠落の監査](../merge-loss-audit-20261007.md)。

## 目的

物理SIM/eSIM購入を入口にRockstarOS service accessを短い手順で提供し、SkyでAgentを見つけ、Zemaで依頼し、見積・上限・進捗・成果・使用料を一つの認証で確認できる体験を作る。OS/Coreは端末本人性、権限、仕事、復旧を支え、端末内LLMは対応端末の追加能力である。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

## 現在地

- AMC02 / H1 再簡素化: 標準入口は「依頼→Goalと意図の確認」のみ。部隊選択と質問票を外し、ソフトウェア試作の汎用4役割7工程・仮工数・依頼文を自動準備する。工数は未校正の係数で納期やAI速度ではない。チャットを含む従来機能は詳細へ保持。AI実行・自動通知は未接続で、未実行を進行中にしない。

- AMC02 / H1 チャット化: 常設の会話から目的・範囲・完成条件を順に入力し、専用ボタンで計画承認する。案内はルールベースでAI未接続。詳細編集と会話の条件差分を再確認し、自由文を実行権限や完了証拠にしない。会話はGoalとは別保存。

- AMC02 / H1: 利用者のUX指摘を受け、[AMCローカル画面](../amc-goal-orchestrator.md)を目的入力・計画確認・進捗の段階式へ変更。状態別の次アクションと必要な入力だけを表示する。AI未接続、計画承認と実行の区別、既存保存データは維持する。実ブラウザと本人による使いやすさの確認は別。

- SIM/eSIM購入後の本人連携は、Web `/connect`に加えてAndroid Shellからも署名付きclaimを登録できるsource経路を追加した。端末内入力は保存せず、現在のRockstar IDへの明示確認を要求し、署名・一度限りのowner bindingはserverが検証する。Android compile/実機、販売元handoff、実購入は未受入。[証拠](../evidence/sim-service-android-native-claim-local-20261002.json)。

- 同監査の追加入口: `/sky/network`のMCP画面、`/sky/publish`の表示と公開SDKコピー成功を確認。Studioのコピー失敗表示・API key発行401時サインイン入口を修正し、追加2試験・対象lint・typecheck・差分検査合格。key発行と401の実環境再現は未実施。

- 2026-09-27 WEB04 / ROCK: Sky全入口を再監査し、ready Toolの登録経由、専用アプリ起動先との不一致、候補登録エラー非表示、非URLの提供元リンク、端末適合表示の差、Fashion入力の親画面依存CSSを修正した。Marketと詳細は`lib/use-sky-tool-context.ts`でホームと同じ接続信号を使い、Fashionブラウザ簡易版はPC専用から除外。390pxで全34詳細の見出し・横はみ出し0・エラーoverlayなし、ホーム全34アイコンの概要開閉・画面内表示・scrollTop 0・Escapeを確認。サービス接続・MCP・埋込掲載フォームは320／390／768／1280pxで内部横はみ出し0。長い設定の保存位置までのスクロール、MCP右矢印タブ切替、空掲載フォームで名前欄focusを確認。Fashion簡易プランと出典整理サンプルはホームから結果表示まで成功。全Tool実行の合格ではない。関連26試験、Sky検査、typecheck、product lint、build、差分・設計チェック、進捗同期は合格。全体verifyは既存baseline表示基準不一致で停止し、掲載D1試験も無応答のため未合格。Provider資格情報・申請送信・実MCP接続・API key発行・課金・本番配備は未実施。詳細な画面受入はTool設計§1.2とproject.mdに記録。

- 2026-09-27 WEB04 / ROCK: 利用者のスクリーンショットで、Skyの狭い画面にある45px列と56pxアイコンの不一致による片側約5.5pxの重なり、旧main・footerのグローバルCSS干渉を確認。ホームとMarketを`components/sky-tool-card.tsx`／同CSSの共通カードへ移し、架空の作者handle・重複する役割名を除いた。`components/sky-workspace.module.css`で一覧と常時検索を整理し、`components/sky-surface.module.css`と共通shellの`tone="sky"`でホーム・Market・Tool詳細・ココナラを同じ暗色面にする。Marketは短い見出しと検索を先に置き、環境説明を展開式にした。Tool詳細は実行欄を先に、手順・licenseを展開欄へまとめる。概要の抽象的な共通注意書きを外して、個別の接続・認証条件は保持。ローカル実ブラウザでホーム・Marketの320／390／440／768／1280pxは横はみ出し0、アイコンと本文の間隔12／14px。Jev Router・ココナラの320／390／768／1280pxも横はみ出し0、main landmark各1個。全Tool検索でJev Routerへ到達し、ホーム・Marketの共通概要、Escとfocus復帰を確認。ココナラのBase UI Dialogは320／390pxでfocus trap・Esc・元ボタンへの復帰を確認し、保存エラーは入力画面内に表示する。出典整理サンプルの成功と結果表示を確認。関連17試験、typecheck、`lint:product`、`sky:check`、buildは合格。全体verifyは既存baselineの`acid_green`／`light_scroll_product_showcase`期待値不一致で停止し、無限定lintにも未変更vendor・生成物のエラーがあるため全体合格ではない。次は正本と検査を現行方針に整合し、全体verifyを再実行する。本番配備・Tool本体接続・決済は未実施。

- 2026-09-26 WEB04 / ROCK: avokado製品Siteの黒・銀・淡い青をWeb OS全体へ適用。Home、共通chrome、Sky、Zemaの仕事画面、Wallet、Market、設定、Studio、CSVの黄緑を抑え、暗い操作面と冷たい白い情報面を一つの製品としてつないだ。Tool固有アイコンの識別色、接続・実行の実状態、警告色は変更しない。保存済みHome旧既定色だけ新既定色へ移行し、利用者の他の選択色は維持する。782pxと390pxのローカル画面で主要画面を確認し、390pxの全7画面で横はみ出し・error overlayなし。画面契約15/15、typecheck、lint、design check、build合格。`npm run verify`は既存README文言試験1件の失敗と全体Node試験の無出力停止で中断。外部依存・本人操作なし。Web Previewの画面改修であり、native OS画像や公開Siteの更新ではない。

- 2026-09-25 WEB04 / ROCK: avokado公開画面の黒・銀・淡い青、簡潔な見出し、余白をZemaへ反映。大きな色付きBot列と黄緑の操作面を抑え、最初の画面を「目的→選択中ツールの状態→依頼」に整理した。ツールは最初4件と選択中を表示し、22候補は検索・全件展開で個別に選べる。入力欄のfocusと操作ボタンは見える位置を維持。約782px、1280px、390pxのローカル画面で表示、検索、展開、スマホの一覧開閉、入力欄focus、横はみ出しなしを確認。外部Tool接続状態は変更しない。

- 2026-09-25 WEB04 / ROCK: Zemaで候補Botを選んだ直後、約782px幅では会話の案内と入力欄が初期画面より下に押し出されていた。会話面を画面高に固定し、メッセージ部分だけをスクロール可能にして入力欄を常時表示した。選択Botの説明・実際の接続状態・次の操作を空状態へ追加し、IP Studioなど専用画面を持つ候補は送信前に起動リンクを見せる。未接続Botを実行可能と誤表示しない。約782px幅と390px幅のローカル実ブラウザで案内と入力欄の同時表示、依頼ボタンの入力欄focusを確認。外部アプリ実起動やAR表示の受入ではない。

- UXCHAR01再調整: 追加の参考画像に合わせ、小さく斜めの黒目2つだけを持つ5輪郭（しずく・角丸四角・三角・六角・カプセル）へ変更。口と眉をなくし、彩度の高い色、上部ハイライト、下部の陰影で艶を表現。SVGのグラデーションIDはuseIdでインスタンス間の衝突を防ぐ。詳細を開く既存動作は維持。

- UXCHAR01の外観改善: 利用者の再フィードバックを受け、ツヤ・虹彩・反射を除去。ベタ色、丸・角丸四角・丸三角・花形の4種類の輪郭、シンプルな黒い目と口へ変更し、小さくても判別できる記号的な顔にした。主要Toolの配色と顔を明示固定し、一覧56px・発言48px・詳細120pxで表示。詳細は「いま、していること」と実際の依頼文を先頭にし、次の操作と成果を続け、機能説明は展開式にした。直近jobと現在会話を表示文言で区別する。動作軽減設定ではhover移動を停止する。

- 2026-09-21 UXCHAR01 / ROCK: 利用者指定の丸くつやのある目付きキャラを、共通SVGコンポーネントとしてSkyとZemaへ導入。Tool IDから色と表情を固定し、画面間で同じ顔を維持する。Skyの顔、Zemaの一覧・担当・発言の顔からダイアログを開き、説明、現在状態、会話内の結果、次の操作を確認する。名前による会話切替と顔の詳細操作を分ける。詳細を開いても実行しない。結果は該当Toolの現在会話内メッセージ、状態は現在要求または取得済みjobから表示し、未取得結果を生成しない。外部依存なし。キーボード操作、狭い画面、型・lint・全体verifyで受入を確認する。

- 2026-09-20のZema会話デザインと送信経路: ヘッダーはZema名と担当Botを整理し、Bot選択時の定型自己紹介と実行進捗の重複吹き出しを除いた。チャット、実行カード、入力欄を同じ暗色で統一し、依頼本文をMr.系Toolの入力欄へ引き継ぐ。Bot切替は新しい会話URLへ進め、前Botの履歴に混入させない。会話返信のIDをUUIDにし、モデル未接続時はTool実行可能なことを一つの返答で明示する。localhost:3001で架空案件の条件チェック1件、架空の出典整理2件がローカル成功し、会話への結果表示、履歴復元、Bot切替、幅390pxの表示を確認した。`npm run verify`は製品350件、Fashion 19件、仕事API149項目とbuildを含めて合格。ローカル会話モデルの橋渡し先4317番は起動しておらず、自由会話の成功は未確認。担当はROCK、外部依存なし。モデル実起動と自然会話の受入は残る。
- 2026-09-20のZema左欄固定: デスクトップではBot・履歴欄と会話欄を3：7に固定し、Bot選択、新規会話、履歴選択でも左欄を維持する。狭い画面だけ開閉できる。約794px幅の実ブラウザーで左238px・右556pxを計測し、Bot選択と新規会話の後も比率と左欄表示を確認。390px幅では開閉、Bot選択後の自動格納、デスクトップ幅への復帰を確認。`npm run verify`は同時作業中の発見用テストのLint警告を1行修正した後に全合格。担当はROCK、外部依存と本人操作はなし。Toolの実行結果や本番接続はこの表示修正の受入に含めない。
- 2026-09-20のZemaレイアウト修正: 約794px幅でBot欄と会話欄を二重に左へ押していた旧余白270pxを除き、開いたBot欄を220px、入力欄を526pxにした。閉じた状態は入力欄746px。未使用画面の依頼例を読みやすいボタンへ整え、直接`/chat`を開いたときは候補Botの先頭を自動選択せず、自動担当の新しい会話にする。「新しい会話」は同じURLでも会話と入力をリセットする。実ブラウザーでBot欄の開閉、新規会話、依頼例から入力欄への反映を確認。`npm run verify`は製品349件、Fashion 19件、仕事API149項目とbuildを含めて合格。外部Toolの実行結果は今回の画面修正の受入対象外。
- 2026-09-20のSky/Zema Web使いやすさ改善: Skyは依頼欄を最初に置き、おすすめ5件、ready全件、導入候補22件を切り替える。検索は全Toolを対象にし、役割ボタンは最初4件と展開入口に絞る。ZemaのBot一覧は選択中を残して最初4件とし、全件展開・検索を用意した。Skyの自然文依頼は未接続Toolなら直ちに接続確認を開く。localhost:3001のSkyで5件表示、候補22件表示、候補検索、依頼から接続確認までを操作確認。Zemaは未サインイン画面を確認したが、Bot展開の実操作は未確認。`npm run verify`は自動試験349件、Fashion 19件、仕事API149項目とbuildを含めて合格。
- 履歴: 2026-09-19以前はavocadoMiniを対外的な先行商品としていた。2026-10-02以降、SIM/eSIM主導のサービスが主商品となり、avocadoMiniと`/rockstaros`のhardware紹介は別programとして扱う。実機と販売は未実施。
- `/connect`は購入claim、回線開通、共通アカウント、端末別導入、Sky/Zema/Agentへの入口を案内する。`/`は利用画面、`/rockstaros/guide`は対象端末向けDeveloper Preview条件を示す。Sky/Zemaは独立アプリとOSの双方から利用できる。旧avocadoMini希望価格は現行のSIM/eSIM service料金ではない。
- GitHub READMEの冒頭はavocadoMiniの外観と利用場面の構想参考画像から始める。設計画像と実機写真を区別し、製品別GIF、RockstarOSとアプリの役割、開発状況への導線を続ける。クラファンの実URLは未確認で募集済みとは表示しない。
- 対外メッセージは利用者の目的と役に立つAIの発見を先に伝える。Skyで探し、Zemaで進め、Studioで試す体験とavocadoMini構想を示した後に、料金方針や内部技術を説明する。
- 無料配布を理念とし、OSは従量課金を予定する。無料配布の対象と利用量の計量・単価は未確定。Skyの現行収益連動精算と混同しない。
- RQ01〜RQ49を製品ベースへ固定済み。RQ49のMaterial Invention Coreは装置非接続sandboxを実装済み。Zema、simulation、外部ラボ、実験設備とのruntime接続は未実装。
- RQ49 Material Invention Coreの標準製品体験としてSpatial Invention Studio、四方向sensor端末`avocadoMini`、手によるdigital twin操作、差分再計算、Patent AI provenance bridgeを設計済み。別の任意XR addonではない。XR runtime、sensor rig、実機は未実装。
- Home、全画面からHomeへ戻る導線、Sky／Zema分離、Studio、Developer Preview紹介、共通visual systemを実装済み。
- Material Invention／avocadoMiniを含む全12層と7本のend-to-end flowを構成監査へ固定した。設計選択は適合、全体統合とproductionは未完了。
- 仕事作成、処理履歴、CSV、Wallet、設定への主要導線がある。
- 画面の存在は、本番provider、実機OS、一般公開の完了を意味しない。

主なtask: 設計の`AI01`とapp／OS能力の`AI05`、`R01`, `B01`, `B02`, `B05`, `HOME01`, `HOME02`, `SKY01`, `SKY10`〜`SKY15`, `WEB02`〜`WEB04`。

## 次に進める順番

UXCHAR01受入（2026-09-21）: `npm run verify`全合格（型、lint、既存試験、production build、asset closure、仕事API149項目）。localhost:3017でSkyのアイコン詳細をEnterで開き、Zemaの一覧・発言から詳細をクリック表示し、Escで元の顔へfocusが戻ることを確認。開発用アカウントの架空出典1件をローカル処理し、完了状態・成果本文が顔の詳細へ反映されることを確認。390×844でもダイアログの本文・閉じるボタンを表示確認。自然会話モデル未接続、本番配備は今回未実施。

1. stock Pixel上でSky／ZemaからBroker、Local AI、汎用Tool、成果再表示まで一本で接続する。
2. 再起動と失敗復旧を含め、操作時間、手作業、再利用率を既存手順と比較する。
3. モバイル、keyboard、focus、処理中navigation、状態表示の回帰を残す。
4. UI上の「利用可能」「未接続」「準備中」をruntime事実と一致させる。

## 完了条件

- 対象RQと利用者の不便が明記されている。
- 正常系だけでなく、入力不足、切断、競合、再起動後の復旧を確認している。
- 画面文言が実装済み範囲を越えて本番・実機・収益を主張しない。

## 関連資料

- [AIネイティブOS詳細設計](../ai-native-os-architecture.md)
- [Sol設計監査](../ai-native-os-design-audit.md)
- [製品ベース](../product-baseline.md)
- [全体構成監査](../system-composition.md)
- [1.0戦略](../rockstaros-1.0-strategy.md)
- [1.0構成](../rockstaros-1.0-architecture.md)
- [Chat usability](../chat-usability-20260912.md)
- [フロント機能性監査](../frontend-usability-audit-20260915.md)

## 検証

- `npm run typecheck`
- `npm run system:composition:check`
- `node --experimental-strip-types --test tests/web-route-style-contract.test.mjs tests/sky-studio-chat.test.mjs`
- 主要画面の実ブラウザ操作

## 日付付きの記録

新しい順。各節は書かれた日の事実で、いまの状態ではない。

## 2026-10-02 SIM/eSIM-led service direction audit and onboarding correction

Authoritative product flow: purchase a physical SIM/eSIM through any accepted channel → carrier activation handled and shown separately → one Rockstar account signs in and claims service entitlement → route by exact device capability to supported signed OS installation or existing-OS app/browser → open Sky, Zema and Agent work directly → quote and authorize a per-task spend cap → follow cloud progress while offline → retrieve result and itemized usage after reconnect. SIM purchase does not store or install an OS image, activate a carrier profile by itself, or count as cloud payment. Hardware/avocadoMini is not a prerequisite.

2026-10-02 follow-up: Android Shell now shows owner-bound service claims and Sky/Zema/Agent scopes, with `/connect` guidance when no claim is registered. Agent details also expose same-delegation Cloud/Wallet reconciliation after client restart; reconciliation requires a matching durable owner/device Wallet reservation, and only a confirmed pre-dispatch Cloud terminal state exposes an explicit reservation-release action. See [recovery contract and limits](../sky-cloud-continuity.md).

Audit: keep channel-neutral signed entitlement claims, owner-scoped account/device authorization, device capability snapshot, A2A/Cloudflare job recovery, approval digests, rate-card/quote stores, shared budget reservations, live meter snapshots and itemized receipts. Correct the old OS-first product positioning in the architecture/index documents, mark the older device-LLM-first development plan as history, and state that the eSIM bootstrap package is only an eSIM fixture rather than a product-channel restriction. Main Home now has direct Sky, Zema and Agent Workbench actions; `/connect` explains the intended onboarding and routes those actions. The eSIM catalog is demoted to a secondary technical/offer reference and no longer appears as the primary purchase route; the service offer explicitly includes both physical SIM and eSIM distribution channels. SIM01 remains `in_progress`: issuer/purchase distribution, physical SIM fulfillment, carrier activation, accepted Provider price/meter/invoice, production billing, shared production D1, Android SDK/APK acceptance and native OS installation remain unproven. Local usage rows and fixture receipts do not prove production billing.

Follow-up correction: [SIM/eSIM-led product architecture](../sim-led-product-architecture.md) is now the canonical customer/system flow and P0/P1 backlog. It prioritizes quick cloud LLM/agent access, visible usage pricing, and integrated Sky/Zema; treats the purchased SIM/eSIM as the service-access offer rather than an OS download medium; and separates carrier activation, signed entitlement, identity, device install, cloud execution, and AI billing. `docs/product-baseline.md`, `docs/rockstaros-1.0-architecture.md`, and Sky launch documentation now use that same onboarding and accepted-device routing. An A2A Package invocation extension is locally encoded in `SendMessage` metadata and bound to the signed quote/delegation; Provider execution, interoperable responses and execution receipts are still unaccepted.

2026-10-02 continuation: added the authenticated, channel-neutral seller delivery API (`POST` idempotent registration, `GET` exact pending-package recovery, `PATCH` explicit delivery acknowledgement) over the encrypted issuer D1 store. Seller bearer credentials are issuer-scoped by configured token digest; signed package, caller issuer, bounded request, encryption keyring, and idempotency are checked before disclosure. The endpoint has no external checkout/carrier integration. Local tests verify retry/recovery, authentication scope, changed-request rejection, delivery acknowledgement/secret clearing and fail-closed configuration; production issuer secret custody, actual seller webhook/checkout, buyer notification and purchase fulfillment remain pending contract/sandbox work. `npm run build` includes the endpoint; production deployment and D1 readback were not performed.

The same endpoint now applies an atomic persisted per-issuer rate limit of 120 authenticated requests per minute across registration, recovery, and acknowledgement. Excess requests receive `429` with `Retry-After`; a synthetic SQLite test verifies isolation between sellers and window reset. Migration `0054` is source/local only until shared production D1 is separately deployed and read back.

2026-10-02 Android A2A quote review source: added Shell API v12 methods for owner-authenticated connected-Agent discovery and quote-only Provider pricing, with the exact configured HTTPS origin, path allowlists, bounded I/O, no redirects/cookies/cache, and no automatic retry. The Broker verifies the returned Ed25519 Provider quote against the operator-provisioned key inventory and exact selected Agent origin/name/version, prompt hash, currency, budget cap, and expiry before returning it to the Shell. A subsequent integration supersedes the original “no delegation/Wallet/Cloud connection yet” note: Shell API v18 now carries the approved quote into a stable-ID Cloud draft, obtains a separate device-credential-gated Wallet approval, creates the exact quote-bound hold, registers Broker proof only from that HELD row, then requires explicit Cloud approval and same-ID recovery. See [native reservation evidence](../evidence/android-a2a-native-reservation-core-20261002.json) and [source boundary audit](../evidence/android-a2a-reservation-bridge-audit-20261002.json). Source-contract/canonical-vector checks pass. Android Java/JUnit, generated AIDL, APK, credential prompt, restart/reconnect behavior and device UI remain uncompiled/unverified here; Cloud dispatch stays closed by default until runtime and external Provider acceptance.

Local result: the baseline service-entry run passed `npm run verify` with Node 669/669, Fashion 19/19, Worker/D1 API 863 assertions, typecheck, product lint, build and bundle/asset checks; see [SIM service entry evidence](../evidence/sim-service-entry-local-20261002.json). Follow-up audit found the direct-LLM estimate endpoint did not return the signed rate card's unit rates to the UI. The estimate API and Workbench now display input/output rates per million tokens, plus cache input/write rates for text-token cards. Targeted currency/rate tests pass 14/14, typecheck passes, and rebuilt Worker/D1 API tests pass 865 assertions. The current full `npm run verify` also passes: Node 672/672, Fashion 19/19, Worker/D1 API 869 assertions, typecheck, product lint, build and bundle/asset checks; A2A Worker/D1 Workflow fixture passes 10/10. An unprivileged test attempt cannot bind loopback; the same local fixtures pass in the authorized run. This verifies local source and fixtures only. Issuer distribution, physical SIM fulfillment, carrier activation, A2A Provider unit quote, production price/meter/invoice, funded billing, Android APK/device acceptance and exact-SKU OS installation remain open.

### Updated backlog order

1. Keep versioned prompt-disclosure consent before quote-only Provider egress. Migration `0049`, `/api/sky/a2a-price-quotes`, and Android Shell API v18 cover the request boundary, device-side signature review, exact quote-bound Wallet hold, Broker proof and distinct Cloud approval; synthetic SQLite, source-contract and shared canonical-vector checks pass. Prompt-sharing consent remains separate from paid execution authorization. Next run Android compile/instrumentation on a supported CI/device host, then validate the enabled path only against a contracted Provider sandbox and funded Wallet. Paid dispatch remains disabled by default.
2. Run Android CI compile/instrumentation for Shell AIDL v12, the quote review, P-256 enrollment/revocation, Provider trust parser, no-backup device identity and same-job reconnect/readback. The trust inventory arrives only through Gradle property `a2aProviderUsageKeysJson`; `[]` or malformed input disables receipt application while other OS use remains available. This checkout lacks a working Java/Gradle/Android SDK toolchain, so only Node/source contracts are currently verified.
3. Preserve the channel-neutral purchase claim and single Rockstar identity. `/connect` accepts a bounded JSON seller package by file, paste, or `#rockstar-claim=<base64url>` link. The link code stays in the URL fragment, is removed from the address after client capture, and is never redeemed automatically; the server remains authoritative for issuer signature and single-owner binding. `lib/rockstar-entitlement-issuer.ts` provides local channel-neutral claim/event signing and replacement material generation; `replaceRockstarEntitlementClaimWithAcknowledgement` gates replacement delivery on a matching cancellation event acknowledgement and passes stable event/claim IDs to adapter callbacks. `lib/rockstar-entitlement-issuer-store.ts` and D1 migrations 0052/0053 add idempotent issue recovery, AES-GCM claim-code storage, key IDs for rotation, timeout-safe retry, and ciphertext deletion after delivery acknowledgement. Internal server API `/api/internal/rockstar/entitlement-deliveries` now authenticates seller tokens per issuer, verifies signed claims, and exposes register/recover/ack lifecycle. Seller-specific checkout/link delivery, process-level production key custody, webhook retries and seller acceptance remain unconnected.
4. Accept seller/channel claim delivery, physical SIM fulfillment and carrier activation as separate external gates; confirm included RockstarOS entitlement and unified Sky/Zema/Agent access after purchase. Keep service claim, network state, account and device installation as separate visible statuses.
5. Accept production Provider prices, live meter, invoice reconciliation and funded Wallet debit before enabling paid Cloud execution. Then validate exact-SKU native OS installs or existing-OS app/browser support across device families. A reserved cap is not live provider spend, and local usage is not an invoice. No SKU is supported based on SIM capability alone.

Implemented source, locally verified behavior, and external acceptance are separate states. Local usage rows, fixtures, and synthetic receipts are not production bills, actual carrier activations, or OS installation proof.

2026-10-02 product-direction audit follow-up: corrected the earlier gap list after tracing the current Android source through `MainActivity`, `ShellConnection`, `RockShellService`, `PlatformStore`, and Cloud A2A routes. Quote review → native Wallet hold → Broker authorization → explicit Cloud approval is present in source, with source-contract and shared quote/authorization vector tests; the prior “final atomic handoff missing” entry is stale. Android compilation, generated AIDL, APK, credential, restart/reconnect and exact-device behavior remain unverified because this host has no Java/Gradle/Android SDK toolchain. Provider, funded Wallet, invoice, SIM/carrier and OS-install acceptance gates are unchanged. See [follow-up correction evidence](../evidence/sim-led-product-correction-followup-20261002.json).

## Sky公開判定の検証結果

公開完了判定の整合検査をverifyへ追加。focused stageは既存basic受入を保持し、実Cloud AI/公開両端末/全Tool分類/Apple Payの受入を要求する。7 guard testsと正本全verify exit0（692 Node/19 Fashion/938 Worker-D1）。`--require-stage focused`は期待どおりexit1で未合格を示す。公開v28はこのturnで変更せず、一般marketplace/ConnectをCSV専用50円成功へ昇格しない。直近30分の公開error検索0件は実AI/可用性の受入ではない。証拠docs/evidence/sky-focused-release-check.json。GitHub mainへの保存/統合は未実施。

## Sky focused公開判定の修正（2026-10-02）

ROCK/WEB04: 2026-10-02: 既存Sky v28（source cb55411549649bd57429fa1afeb974139fc024da）公開成功。CSV専用Stripeはliveで、既存JPY50円受付はcompleted/stripe_verified/attempt1/revision3を公開D1で再確認した。新しい決済はしていない。一般MarketplaceのStripe/Connect受入とは別。クラウドProvider keyと信頼料金は未設定、pricing gateはfalse、production Cloud executionは0件。Pixelは接続済みだがロック中。保存回答管理と会話引継ぎの合成受入を本番owner/実AIの証明にしない。

`focused` stageを追加し、既存basic条件に実Cloud AIの応答・所要時間・項目別usage/cost・上限/timeout、同じ公開sourceのdesktop/Pixel顧客導線、全34 Toolの個別分類、対応端末のApple Payを加えた。既存paid-marketplace/clients scopeを省略せず独立して保持する。`node scripts/check-sky-launch.mjs --require-stage focused` は不足が残る限りexit 1で、設定キーの存在やmockだけでは合格にしない。検査自体の整合は`npm run verify`へ追加した。必要stage/gateの削除、基本受入の省略、合成環境のpassed、根拠欠落、依存cycle、未完了でのlaunch claimを7件の試験で拒否する。

## Sky v28配備の受入範囲

WEB04/ROCK: 保存回答の本人限定Markdown取得・本文だけの削除確認・会話から仕事への未送信依頼の引継ぎを既存Skyへv28/source cb55411549649bd57429fa1afeb974139fc024daで公開成功。正本全verify exit0:681 Node/19 Fashion/938 Worker-D1（認証付きattachment/削除済み拒否の回帰を含む）、Site24 Worker/D1項目・型/lint/build/bundle/assets合格。Siteの全project検査は既存SKY20根拠欠落で不合格のまま。公開DBの既存50円受付はcompleted/stripe_verified/attempt1/revision3を保持し追加請求なし。cloud実行0件・provider key未設定・Pixel keyguard showing=true。本番ownerの新UI受入、実Provider応答/費用/請求/資金gate、Apple Pay・外部OAuth・製品サイト入口は未完了。合成回答/料金/ログインを本番成功とはしない。GitHub main b3e2676へ本変更をpush/統合した証拠はなく、正本未commitとSites公開を区別する。

## Skyクラウド回答の取得と会話からの仕事引継ぎ（2026-10-02）

会話の現在の依頼文だけをcomponent memoryで仕事画面へ引き継ぎ、仕事選択・見積・承認は本人の操作とする。URL/新しいbrowser storage/D1へ依頼本文を追加保存せず、reloadで未送信の下書きは消える。保存済み回答は本人認証付きMarkdown attachment（private/no-store）で取得でき、未保存/削除済み/別本人は拒否する。本文削除は対象と不可逆性をdialogで確認し、state・usage・予算台帳は保持する。共有予算の確定額は請求書照合済みと表示しない。ローカルbuilt Siteの合成アカウントで引継ぎ/再読込/削除dialog取消/135byteのダウンロード一致を確認、Worker/D1で24項目合格。実AI/本番ownerログイン/Apple Payは未受入、追加課金なし。正本の全verifyと同一Site公開は次の検証。
証拠: [local results verification](../evidence/sky-cloud-results-verification.json)。

## 2026-10-02 Android Agent委任案の保存・復旧

Shell API v13は、所有者のZema実行/レビュー中jobから親jobを選び、署名・依頼文hash・見積期限・子/親上限を再検証して、未実行のAgent委任案をCloudへ保存する。作成POSTの前に親job ID・冪等キー・入力hashを端末内に永続化し、応答が不明なら再POSTせず、同じ三つの値でGET照合する。親job一覧は所有者認証・Zema利用権で絞り、promptや認証情報を返さない。ローカルWorker/D1の948 assertionでは、認証済み所有者にだけ実行中jobを返し、返却列をID・revision・status・title・更新時刻に限定することを追加確認した。委任案の保存はAgent実行、Wallet予約、請求を開始しない。source-contract checksは通過。Android SDK不在のためJava/AIDL/APK/実機は未検証。次は別個の有料実行同意、同一条件のローカルWallet hold、Broker proof、Cloud承認を一つのdelegation IDで接続する。証拠: [Android A2A Cloud draft bridge](../evidence/android-a2a-cloud-draft-bridge-20261002.json)。

## 2026-10-02 Android Wallet approval, reservation and Broker proof wiring

Shell API v14 connected the saved quote-bound draft to Core's native approval and reservation store. The owner confirms the exact owner, Cloud parent/delegation, Provider/Agent version, currency, quote digest, request hash, amount and deadline through the device credential screen. Approval expiry is deterministic from signed quote issuance, retries preserve the approval digest, and the exact HELD row recovers idempotently. Shell API v15 adds a separate explicit Cloud/offline-continuation consent and signs the Broker authorization only after `PlatformStore` verifies that same quote-bound HELD row. The proof is uploaded to the owner-scoped Cloud endpoint; uncertain POST results are read back without repost, and the delegation GET returns only registration metadata, never the signed proof. Release checks the Cloud state and refuses while a registered proof remains valid. The UI still says that the Cloud task remains awaiting approval: no Provider request, Cloud dispatch, payment capture, or invoice is performed. Full `npm run verify` passes, including the Worker/D1 API suite (948 assertions), `npm run typecheck`, source-contract checks, and SIM/eSIM entry test. Android Java/AIDL/APK/device acceptance remains unverified because the host has no Java/Gradle/Android SDK. The final Cloud approval handoff must atomically compare the Cloud state with native Wallet dispatch state before enabling execution; paid dispatch stays fail-closed. Provider billing, carrier activation, SIM fulfillment and OS/device acceptance remain unproven.

## 2026-10-01 Sky専用サービス公開

専用URL https://sky-marketplace.noellesugar1.chatgpt.site/sky/marketplace を一般公開。利用者が一般公開を明示了承し、access_mode publicの反映成功。Site version3、source 4d6d66332f7793b3e0d47ac175e100b6fea10b56、deployment appgdep_6abdfec3f6b081918cfca91dae0a06e5 succeeded。製品サイトと旧OSサイトは変更なし。公開ブラウザでMarket→出典整理→未サインイン実行禁止→OpenAI公式ログイン画面への遷移を確認。本人ログイン後の本番処理は未実施。公開DBには初期化済みmarker version1をreadbackし、164 schema statement（26 triggerを含む）の準備完了を確認。Sitesの通常migration配備はSQLITE_ERRORだったため、専用配備adapterで新規DBの確定schemaをprepared statementで初期化し、全guard完了まではAPIを503にしている。既存正本migrationと既存SiteのDBは変更しない。adapterの控えはservices/sky-web、実配備sourceはSitesへ保存。正本の全verify520 tests＋Fashion19＋API265はadapter追加前の受入で、adapterは型/build・SQLite冪等適用・公開DB marker受入のみ。製品サイトの案内リンク追加は編集権限待ち。Mini対応、外部Provider、本番課金の合格ではない。

## Sky単独サービス配備（2026-10-01）

同じSkyをOSと独立アプリから使う方針を受け、専用manifest、起動先/sky/marketplace、既存UIの保持を実装。Node520/520、Fashion19/19、API265項目、型・lint・build・asset closureと全verify合格。専用Siteのversion1は保存済みだが、配備はDB初期化SQLITE_ERRORで失敗。一般公開設定は自動承認審査が拒否し、本人限定のまま。公開完了ではない。

## 2026-10-01 Sky文章ツールの成果再利用

ROCK／WEB04: Sky Market経由の出典整理・無料記事・応募前チェックの既存実行画面に「この端末に保存」、保存成果再表示・削除を追加。原稿は端末処理、成果は本人が選んだ同一ブラウザのlocalStorageへ全Tool合計20件、サーバーには本文を送らない。共有端末の閲覧可能性とMarkdown代替を明示。関連15試験・typecheck成功。独立作業コピーの全verifyは519 tests・265 API assertions・build等完走（既存database-status期待件数101→102の整合を含む）。実ブラウザでMarket検索→出典整理→保存→再読込→再表示、無料記事作成・保存を確認。稼働コピーは2026-10-01チャットのwork/sky-service。共有作業treeの以後の変更はこの合格へ算入しない。本番未配備。別Siteへの誤配備はversion41へ取り消し済みだが、旧版へのrollbackでありGitHub最新版の復元ではない。製品Siteは現接続で編集不可。既存デザインを維持し、正本と公開sourceの対応を揃える。アカウント別クラウド成果同期・実Provider接続の合格ではない。

## 2026-10-01 SIM/eSIM共通サービスclaim監査・実装

最新の製品要件を監査し、Skyのpackage販売/eSIM order/device entitlementをRockstarサービスの包括利用権と同一視しないよう整理した。再利用する基盤はowner認証、Ed25519 issuer trust、D1 unique制約、A2A durable job/recovery、Wallet holdとusage receipts、端末capability/attestation。物理SIM/eSIMの注文・通信activation、利用権claim、OS install、Cloud task usageは別々のrecord/evidenceを持つ。

channel-neutral claim contract、onboarding状態、再利用/差分/不足一覧は[SIM/eSIM entitlement設計](../sim-service-entitlement-claims.md)。`POST/GET /api/rockstar/entitlements`、owner-only read API、active issuer readiness、migration `0039`、署名bundle入力/claim済み権利/Sign inを表示する`/connect` UIを実装。`ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED=true`時にZema新規jobは`zema`、Sky A2A directory/MCP inspectionは`sky`、LLM requestは`rockstaros_access`、新規委任/承認/Broker proof登録は`agents` scopeを要求する。migration `0040`と`POST /api/rockstar/entitlements/events`はEd25519署名refund/revocation、冪等再送、event ID conflict拒否、権利無効化を実装する。Cloudflare Workflowのdispatch直前とscheduled prepared-job scanも権利を再確認し、失効後に未送信のjobはremoteへ送らず`prepared`保留にする。失効後のBroker proof登録も拒否する。Read-only task/result/artifact retrieval、cancel、settlement reconciliationは既存仕事を閉じるため維持する。Cloud quote verifierはrequest creation、D1 persistence/single-use、approval/Broker digest、Wallet reservation amount binding、Workflow preflightまで統合。migration `0042`のD1 rate-card catalog、operator-authenticated registration/revocation、estimate-only Zema flow、migration `0043`の8-task/4-concurrent delegation limit、migration `0044`の署名累積meter snapshot/予約cap/final reconciliationを追加。Zemaはactive delegation中に10秒ごとにpollし、暫定Provider報告費用をfinal receiptと区別する。Worker/D1 API suite 638 assertions、Cloudflare Workflow suite 9/9、migration convergence 9/9、live meter signature test 1/1をローカルfixtureで検証。A2A delegationはroot jobから一段のみで、owner credentialを外部agentへ渡さない。paid direct LLM routes (text/legal/patent/Jev)はProvider quote・実行承認・usage reconciliation不在時にfail closedし、Cloud flags/consentだけではProvider egressしない。残りは実Provider quote-only/live-meter/reversal semanticsとWallet settlement; 外部接続のある全有料Tool/event producerと直接/background pathの追加監査; issuer/provider key rotationと販売元webhook; production billing/Carrier/SIM/OS acceptance。合成鍵とfixtureはローカル証拠のみで、本番販売・carrier activation・決済・production billing・OS installation acceptanceではない。

## 2026-10-01 Zema cloud-agent支出表示

A2A Workbenchは「通貨最小単位」をISO currency digitsの金額表示にし、budget上限と見積を区別する。既存parent poolの上限・予約額・Provider署名receipt照合済み額は別欄。実行中は署名累積meter snapshotが届けば暫定累計を表示し、10秒pollで状態を更新する。meter未報告時は未報告とし、予約capを実利用額と誤認させない。owner-only task detailではfinal署名receiptの単価版・meter・数量・行金額を別に表示する。provider contractが無い間はpaid dispatchを閉じる。

公式A2A仕様ではtask lifecycle/transport/Agent Card/Extensionは定義されるが料金見積Core operationは見当たらず、価格quoteはversioned ExtensionとProvider署名quoteが必要となる。契約準備仕様は[A2A pricing extension](../a2a-pricing-extension.md)。ここでのextensionは設計案でありAgent Cardへ広告していない。currency formatting tests 2/2、typecheck、`lint:product`、production build合格。これは画面/API配線とlocal verificationであり、rate card、Provider quote、RT meter、Provider invoice、production billingまたは実Cloud agent task acceptanceではない。

## 2026-10-01 Direct cloud LLM pricing foundation

Direct remote model routes remain fail closed until production pricing, user authorization, and usage reconciliation are accepted. Added `lib/remote-ai-rate-card.ts` to validate a provider-signed rate card against an operator-provisioned Ed25519 key and exact provider/model/currency, then calculate an upward-rounded maximum amount from a conservative text-size bound and output-token ceiling. The rate-card is versioned, expires, and hashes into an estimate descriptor. The persisted quote/store/API and single-send execution path described below have since been added. This module does not retrieve a production Provider price, reconcile an invoice, or prove billing; those require Provider contract acceptance.

## 2026-10-01 Provider rate estimate API and Zema preview

Added authenticated `POST /api/llm/estimate` and estimate-only Zema flow. Owners with RockstarOS entitlement can compare a conservative maximum-cost estimate to a currency-aware cap; the response explicitly says `providerSubmission=not_performed` and `executionAuthorized=false`, and the prompt is never sent to the model Provider. Signed Provider rate-card bodies now live in immutable D1 table `remote_ai_rate_cards` (migration `0042`), with authenticated operator registration/revocation at `/api/internal/remote-ai/rate-cards`; only the bounded public trust-root key list remains in `REMOTE_AI_TRUSTED_RATE_KEYS` (Cloudflare environment-variable size limit is 5 KB; see [platform limit](https://developers.cloudflare.com/workers/platform/limits/)). Each estimate rechecks row digest, Provider signature, key status, effective/expiry time, and returns source/version/expiry plus maximum charge. Same-card registration is idempotent and revoked cards cannot be reactivated. Local Worker/D1 API suite 572 assertions, rate-card/quote focused tests 9/9, migration convergence 9/9, typecheck, product lint, and production build pass. Fixture keys/cards are synthetic and establish neither Provider-issued prices nor production registry/billing; paid execution, live meter, carrier service, SIM fulfillment, and OS/device acceptance remain unverified.

Test scope and limitations are recorded in [estimate API evidence](../evidence/remote-ai-estimate-api-20261001.json).

### 2026-10-01 Persisted direct-text quote and execution path (local only)

Reusable: signed rate-card verification, Rockstar owner/session auth, RockstarOS service scope, active parent Zema job, D1 migration `0046`, A2A-shared parent budget pool, and the separate A2A signed-usage-receipt path. Implemented: owner/request-idempotent quote persistence, explicit approval digest, atomic cap reservation, single dispatch claim, same-input/model/tier revalidation, hold on timeout or unknown usage, exact itemized pricing, owner-only status/result readback, and opt-in saved result deletion. The public quote endpoints persist and expose the current state; `/api/llm/text` has a quote-bound remote execution branch. `tests/remote-ai-text-store.test.mjs` passes 9/9 with synthetic keys, credential, response, and SQLite D1 compatibility.

Workbench now connects selected parent jobs to estimate and persist direct-text quotes, set the per-task cap against the shared parent budget, explicitly approve only when execution is accepted, refresh status, retrieve opt-in saved output, and render itemized usage calculations. On reconnect the saved execution list is fetched again; a quoted task requires re-entering the exact request whose hash is bound to the quote. The current `remoteAiPricingGateAccepted()` remains false, so approval/dispatch is disabled and a `sending` record can show only its reserved cap because direct-text live provider meter is not connected. Remaining: UI/API/Worker HTTP end-to-end under an environment that can bind the local test worker, direct-text live provider metering and invoice reconciliation, then funded Wallet reservation/settlement acceptance. Synthetic test records and local meters are not production invoices, carrier activation, or OS installation evidence.

## 2026-10-01 RockstarOS端末の共通アカウント認証

ブラウザ/既存の認証gatewayへ一度サインインしてから、native端末の8文字user codeとdevice codeを結ぶDevice Authorization APIを追加した。ログイン中の利用者が端末名を見て承認し、端末は一回だけ返る90日セッションを受け取る。D1にはauthorization codeとtokenのSHA-256 hashを保存し、所有者向けセッション一覧と個別失効を実装した。`requestUser`を利用するAPIは同じBearer sessionから既存ownerを解決するため、サービスごとの再登録を要求しない。local Worker/D1 API suite 711 assertionsに、開始、表示、Origin拒否、承認一回性、poll一回性、期限切れ、entitlement/Sky/Zema API認証、平文token非保存、失効を追加し合格。合成ID/ローカルD1であり実利用者、Androidクライアント、保護ストレージ、本番セッションproviderの受入ではない。設計と残作業は[端末アカウント接続](../rockstar-device-link.md)、[ローカル証拠](../evidence/rockstar-device-link-local-20261001.json)。

## 2026-09-30 検証記録の更新

2026-09-30検証記録の更新：製品正本のvisual accentを現行のice-blue `#bedce6`へ揃え、baseline validatorの旧`acid_green`要求を更新。製品説明READMEの英語文とURL-encoded task linkをテストが受け入れるようにし、`npm run baseline:check`、関連docs tests、schema/migrationの既知期待件数を修正した。`npm test`はloopback許可付きで493/493成功。R5設計・物理受入のstatusや未実施境界は変更していない。

## 2026-10-02より前の目的と入口の説明（履歴）

次の3行は、SIM/eSIM主導のサービスが主商品になる前（〜2026-10-01）の版にあった記述である。上の「目的」と「現在地」の履歴の項目に置き換えられた。

AIネイティブOSの上で、SkyでToolを選び、ZemaでAIチームへ依頼し、仕事・生活・Game／IPの成果へつなぐ一つの体験を作る。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

- 対外的にはハードウェア製品を主役にし、最初の構想をavocadoMiniとする。OS・LLM・Sky／Zemaはその中核技術として示す。avocadoMiniの実機と販売は未実施。

- avocadoMini製品ホーム`/rockstaros`、OS導入ガイド`/rockstaros/guide`、RockstarOS Webホーム`/`の役割を分ける。製品ホームから未導入者をOSホームへ直接案内しない。Sky／ZemaなどはOS内の機能。avocadoMiniのメッセージは「考える時間を、つくる時間に」、希望参考価格は41万円。高性能LLMの製品搭載、価格確定、実機販売は未完了。
