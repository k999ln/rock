# Product / UX

## 目的

AIネイティブOSの上で、SkyでToolを選び、ZemaでAIチームへ依頼し、仕事・生活・Game／IPの成果へつなぐ一つの体験を作る。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

## 現在地

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
- 対外的にはハードウェア製品を主役にし、最初の構想をavocadoMiniとする。OS・LLM・Sky／Zemaはその中核技術として示す。avocadoMiniの実機と販売は未実施。
- avocadoMini製品ホーム`/rockstaros`、OS導入ガイド`/rockstaros/guide`、RockstarOS Webホーム`/`の役割を分ける。製品ホームから未導入者をOSホームへ直接案内しない。Sky／ZemaなどはOS内の機能。avocadoMiniのメッセージは「考える時間を、つくる時間に」、希望参考価格は41万円。高性能LLMの製品搭載、価格確定、実機販売は未完了。
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
