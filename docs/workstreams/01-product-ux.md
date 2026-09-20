# Product / UX

## 目的

AIネイティブOSの上で、SkyでToolを選び、ZemaでAIチームへ依頼し、仕事・生活・Game／IPの成果へつなぐ一つの体験を作る。各端末で実際に使える能力を表示し、利用者の不便削減で判断する。

## 現在地

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
