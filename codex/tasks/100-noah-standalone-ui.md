# task100 — Noah専用フロント・紫のデザイン

本人指示: 「noah単体のサービス作る」。共通基盤を再利用し「Noah専用の画面・導線にする」を選択。「デザインは紫を基調」。

正本: docs/structure/04-eve-noa-amc-sky.md、docs/services/noah-standalone-launch.md の専用フロント節。

## 範囲

既存の統合タイムラインをメインに維持し、Noah専用の探索画面・ナビゲーション・紫の配色を追加。既存の認証、Agent接続/実行/停止、成果の保存/提供を再利用。上部は既定で全件表示、Agentボタンで絞り込み、絞り込み中だけ戻るボタン。Agentと通常投稿を同じタイムラインに保持。フォロー投稿を優先し、ニュース・コミュニティーは表示と主要導線から外す。主要画面へ実リンクをつなぐ。

追加指示: Xのような3カラム、白地と紫のアクセント、Agent絞り込み/解除ボタン、投稿導線、モバイル下部メニュー。2026-11-21の追加指示でマークは会社の正式花形ロゴに揃え、白・チャコール・紫のブランド配色に整える。

## 合格条件

- 実行対応Agentは公開APIの実データ。ローディング・失敗・0件・検索結果を区別。
- 選択したAgent IDが既存の接続画面へ渡る。未実装のリモート実行や架空の利用実績を表示しない。
- Noah専用ヘッダーとメニュー。カード型ホームへの変更・タイムラインの移動はしない。共通accountのreturnToはNoah。
- 390pxとデスクトップで表示・主導線を確認。旧タイムラインリンクを保持。
- 適切なUI回帰、typecheck、lint、全体verifyを実行し、PRへ結果を記録。

## 追加指示: 登録情報を使う登録Agent

正本は docs/services/noah-registration-agent.md。必要項目フォーム、明示同意、登録Agentへの実行、本人確認待ち、状態照会、元Agentへの復帰を実装する。ブラウザ専用権限でNoah会員登録なし。秘密の原文は保存しない。

## やらないこと

認証の弱体化、データの分離・移動、課金変更、新リポジトリ、L4以降の完成扱い、本番migration・配備・切り替え。

## 進捗

実装を [PR #337](https://github.com/k999ln/rock/pull/337) に記録。2026-11-21の最終全体verify成功。ルート4,531成功・4 skip（計4,535）、仕事API1,918 assertions、CSV385 assertions、ビルド・設計・残りの検査も成功。ローカルHTTP8ルート/8共通ヘッダーを実測し、data/web-security-response-current.jsonを更新。

再開: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。登録API/UIは `node --experimental-strip-types --test tests/noah-registration*.test.mjs`。実際の登録先アダプターと秘密設定は未接続。本人Mac・成果の認証と本番環境は変更しない。

CI残件: SPIDER / secretsは既存main履歴の3件（docs/design-validation/noah/noah-connect.test.mjs:85、51df5ce・80b3810・5b7cde3）を検出。run44755532375/job136354220728で確認。例外化・履歴書換えは未実施。

2026-11-21の追補: 5項目を現在地付きの1ボタンに統合。用途説明・アイコン・現在地の印を付け、開閉・Escape・外側クリック・選択後の遷移と390px表示を確認。通常は全件表示、Agentボタンと「すべてに戻る」で切替。ニュース・コミュニティー・機能一覧の入口を廃止し、旧機能一覧URLはタイムラインへ転送。会社の正式花形ロゴと白・チャコール・紫の配色を適用。型・lint・関連22試験・ビルド成功、390px/1360pxで横はみ出しなし。

2026-11-21の追補: 個人の感想を主役にしたフィード、Noahで実行完了したユニークaccount数、王冠1account1票、公開コメント/返信/本人削除を追加。Agentコメントを通常タイムラインへ接続。開発者向け継続改善パッケージと個別見積もり受付、本人/設定済み運営に限った受付一覧を実装。正本は docs/services/noah-agent-feedback.md と docs/services/noah-developer-maintenance.md。0046は作成・ローカル検証のみ。料金・SLA・課金・作業自動実行は未設定。

追加分の最終検証: 関連40試験、D1互換移行14試験・所有者復旧6試験、型/lint、全体verifyが成功。390px/1360pxで横はみ出しなし、王冠の保存・遷移後保持・取消、コメント/開発者ページ、対象Agent検索を確認。再開時は `node --experimental-strip-types --test tests/noah-feedback.test.mjs tests/noah-maintenance-ui.test.mjs`。本番の0046適用と運営ID設定、料金/SLA/実作業接続は未実施。

2026-11-21の受付変更: 本人指定の smash@avoado.si にメールで相談する方式へ変更。Web申込フォーム・受付履歴・運営一覧と保存処理を撤去し、旧APIは410で閉じる。コミット済み0046と既存記録は保持し、削除・本番変更なし。

2026-11-21の一周検証・操作簡略化: 接続一覧の取得失敗を未登録/仕事なしと表示していた不具合を修正。ローカルpreviewの不足テーブル0033/0034/0038をローカルだけ補完し、API200を確認。接続順序をAgent選択→Mac接続→依頼へ変更し、接続案内/サインインからAgentを維持。「実行中」タブと /noah/activity は既存NoahLaunch/APIを共用し、実際の状態・成果本文/ファイル・停止を集約。通常利用では作成/公開管理を折りたたむ。

検証を `scripts/check-noah-launch-isolation.mjs --root /absolute/existing/noah/root` に集約。既存ローカルDockerで非root・権限昇格不可・画面/入力/ホストパス/ソケット不在・読み取り専用・外向き通信遮断、接続→実行→Work成果受領→動作中のコンテナ停止→切断を確認。API/account/審査はメモリ内試験データで、本番や外部providerの実利用ではない。previewにはオンラインMacが0台のため、ブラウザでの外部Agent実行は未確認。回帰UIは `node --experimental-strip-types --test tests/noah-launch-ui.test.mjs`。

2026-11-21の画面統合: 本人の「ここいるの？」を受け、独立した /noah/launch をAgent指定保持の転送に変更。/noah/activity に接続・依頼入力も集約し、「仕事を頼む」で開閉する。メニューはタイムライン・Agentを探す・実行中・成果データの4つ。探す/Agent詳細から統合画面へ直接進む。

2026-11-21の説明削減: 実行中/依頼の長い説明を削除し、Agentの詳細をできること・実行先・版に分割。Mac接続を3ステップ、コピー可能なコマンド、項目別の展開パネルへ整理。実行同意・導入条件は保持。

最終検証（2026-11-21）: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` が全工程成功。ルート4,531成功・4 skip（計4,535）、ビルド・仕事API・CSV・設計・残りの検査を含む。途中で既存Eveブラウザ試験に待機タイムアウト1件を観測したが、単独2試験と最終全体試験の両方で成功。関連29試験、390px/1360px、実コンテナ一周、ローカル8ルート/8共通ヘッダーを確認。本番変更なし。

## 2026-11-22 操作の感触

読み込みは正式花形ロゴだけに統一。対応端末の実タップは8ms、選択は12ms、確認済みの接続/認証成功は短い2回。非対応・非表示・OFF時は静かに処理する。設定は `/noah/preferences` で端末内に保存。動きを減らす設定では静止し、読み上げ用の状態名は保持する。登録・共通情報保存の成功時への接続は、登録デザイン実装との統合時に適用する。

検証: 専用UI/振動テスト、型検査、product lint、production build。390pxのブラウザで設定切替・再読込保持・メニュー導線を確認。実機の振動の体感は未検証。全体verifyは変更後のローカルproduction応答のhash更新が必要なため統合側で再実行する。新規ローカルDBのnpm startは既存migration 0020のagent_delegations不足で停止した。既存データや本番DBは変更していない。


## 2026-11-22 新デザイン・保存・委任の統合（PR #371）

本人の新デザイン指示と指定チャットを確認し、投稿・Agent・成果の大小カード、正式花形ロゴ、単一メニュー、Agentの絞り込み/解除を実装。登録情報は基本・活動・口座・本人確認書類を本人別にAES-GCM暗号化して既存R2へ保存し、必要項目だけ再利用する。保存/再利用同意の説明版・時刻・対象を情報と同時に記録し、再利用停止、編集、操作ごとの任せる/毎回確認/任せない、全停止をAPIと送信直前で強制。ファイル選択中の画面維持、最大5MiB書類、保存後の実応答に限る成功振動も統合した。

公開: 本人の既存の配備承認に基づき [avoado.si/noah](https://avoado.si/noah) へ保存版159を配備成功（source `cc69fa76dde53c44aa2f2312d6221b1199a3ebd5`、env revision 13）。既存157の調査カタログを保全。追加migrationなし。公開158で保存→reload保持→再利用停止、390px表示、公開の読み取り専用Agentで毎回確認→実依頼→成果受取、任せない設定の依頼抑止を確認。確認用の表示名は空へ戻し、再利用停止へ復元。159は確認文言と未保存時の表示修正を含む。公開159でも確認画面の文言、Agent絞り込み/解除、切断後の成果保持を確認し、公開ドメイン検査が成功。

検証: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` exit 0。ルート4,778成功・4 skip（計4,782）、package・build・API・設計・その他の検査成功。最初の全体実行中に既存Eveブラウザ起動timeoutが1件発生したが、単独2試験と全体再実行で成功。追補の20試験・typecheck・lint:product成功。合成の2登録先HTTPで保存情報の再利用と停止後の送信拒否、5MiBファイル往復、所有者分離、改ざん、同時更新、同意の一体保存を確認。ローカルproduction8ルート/8ヘッダーを実測しdata/web-security-response-current.json更新。`npm run noah:check:domain` 成功。

再開: [PR #371](https://github.com/k999ln/rock/pull/371) は #358 上のdraft。外部登録先の実行環境・運営キー・本人確認handoffが未接続で、本番の自動登録は未完了。指定調査台帳303件は実行可能件数ではない。Browser Use/Skyvernは候補でruntime/integration未試験。対応登録先が未設定の間は登録ボタンを表示しない。実機の振動体感・別利用者の本番受入は未検証。

## 2026-11-22 指定12画面と多言語UI（PR #376）

指定の2列タイムライン、おすすめ/フォロー中/Agentのみ、主画面の4タブ、Agentの目的別入口、確認待ち優先の仕事一覧、成果一覧と仕事/成果詳細へ統一。登録は保存済み項目を折りたたみ、不足入力と送信先/規約・保存再利用の説明を同じ画面へ置き、「同意して登録」の1操作で進める。入力不足時や保存失敗時は外部登録を開始せず、保存失敗時は入力を維持する。花形ロゴの読み込みと対応端末の短い振動/OFF設定を共用。日本語・英語・簡体字中国語・韓国語・スペイン語・アラビア語のUI、端末言語選択と保存、RTLに対応。翻訳対象はUIで、提供者の説明・利用者の投稿/成果は原文のまま。

検証: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 全工程成功（ルート4,798成功・4 skip、計4,802）。追補17試験で登録導線・所有者の照合・仕事停止・投稿の言語/ログイン先を確認し、typecheck・lint:productも成功。390px/1280pxのブラウザで表示、6言語の切替、RTL、横はみ出しなし、言語切替時の入力保持を確認。ローカルproductionの8ルート/8ヘッダー実測をdata/web-security-response-current.jsonへ更新。登録/再利用は合成データと既存APIの回帰試験で確認し、実サービスへの登録、本番公開、実機の振動体感は、このUI変更の確認には含まない。

再開: PR #373の登録基盤をローカルmerge済み。新しい4タブが以前の単一メニュー案を上書きする。主要12画面のUIが対象で、従来のMac/運営専用画面は既存経路を保つ。providerの説明、本人の入力、成果本文は原文を維持する。登録情報からのサービス選択は掲載申請の `/noah/register` へ送らず、外部登録 `/noah/registration` に進む。実機で振動を体感する確認と公開反映は未実施。

## 2026-11-22 自作登録実行基盤・Dock入口（PR #373）

本人の「自分のとこで開発したものを使う」に合わせ、Browser Use Cloudへの接続をやめ、Noah所有の専用Worker・分離Chromium・スマホ本人確認を実装。登録先固定のフォーム手順、HMAC、操作番号、仕事単位の排他、期限/取消、結果不明時の再実行禁止を設けた。鍵は本人別の暗号化R2へ保存し、接続時に許可した送信先へだけ注入する。ブラウザには画面と状態だけを返し、外部の本人照会が通るまで完了にしない。Agentboardの公式API登録も同じ入口に接続。`NOAH_PROFILE_KEYS` は維持。

公開161: Sites source `0c04c6fa4debe3f4c8fd24eeef421fefc2e13a29`、saved version `appgver_05cd23fbc0b081918f3059e5e88b5d2e`、deployment `appgdep_6b01d301fa9081919ba4d130f0c7509f` が succeeded。環境revision15。別作業の公開160（CowAgentガイド）を保全して統合。`NOAH_REGISTRATION_NATIVE=agentboard` と登録用秘密、独立ブラウザのURL/共有秘密を設定。実行器のCloudflare version `00497509-070c-4713-903e-734dde890936`。既存D1へのmigrationなし。実行器用の新規Durable Objectsには仕事メタデータだけを保存する。

検証: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` exit 0（ルート4,790成功・4skip、ビルド、仕事API1,918 assertions、CSV385 assertions、残りの検査も成功）。登録関連28試験、実行器7試験、型/lint成功。初回のSPIDER上限失敗は新サービスの依存物が未追跡として列挙されたためで、専用.gitignoreの追加後に単独4試験と全体を再実行して成功。テスト削除なし。実際のクラウドChromiumで合成フォーム入力→本人確認待ち→390×640画面→クリック→完了、未確認時の停止、重複操作409、終了を実測。再接続でviewportが初期値へ戻る問題を修正。これは外部登録をしない内部fixtureの受入。

公開確認: `npm run noah:check:domain` は9項目成功（一覧172件、匿名の私有APIは401）。登録先一覧200、匿名browser API401。390pxで入力→送信先/内容/規約の確認、未同意時の登録ボタン無効、横はみ出しなしを確認。入力した合成名は送信せず画面移動で破棄。未ログインのタイムラインには投稿APIのサインイン要求が「一部取得失敗」と表示される既存残件があり、未解消。

Dock: Launch Servicesの起動先 `work/noah-standalone/native-package-final/Noah.app` が旧Mac実行器だったため、元bundleを `work/noah-dock-backups/Noah-before-web-20261122-022613.zip` に保存し、`scripts/noah-web-app/NoahWebApp.swift` で入口を更新。Swiftビルド・ad-hoc署名の検査に成功。同じアプリの起動後、Chromeが `https://avoado.si/noah` を表示し、新しい端末認証タブを開かないことを確認。旧実行器・仕事・端末セッションは変更なし。一般配布用の公証済みアプリではない。

未完了: 実在Agentboardアカウントの作成と成果受取までの本番一周、ブラウザ登録先ごとの手順/本人照会の受入、OAuth更新や書類提出の個別対応、100人向け容量。`NOAH_BROWSER_RECIPES=[]`、10ブラウザ分/UTC日（4+4+2分）の受入予算であり、全サービス対応/100人対応とは扱わない。実機スマホでの外部本人確認・振動体感も未検証。再開は `npm ci --prefix services/noah-registration-browser`、`npm --prefix services/noah-registration-browser test`、[運用手順](../../services/noah-registration-browser/README.md)。PRは #371 上の差分でmain未統合。


### 公開版163/164・スマホ成果受取（2026-11-22、PR #377）

- [PR #377](https://github.com/k999ln/rock/pull/377) は #376 のブランチ上の差分。新しい12画面/6言語UIとmainの取込改善・棚下書き・Macガイドを保全。公開先は https://avoado.si/noah 。版163 source `c28881a1559d10a5a67ff54fd1c86026d2731f8c`、版164 source `a0edb4b70c354c13706305e8c8b72434e67dbccf`。164 deployment `appgdep_6b01e0f8316481919788bc56d7bea78b` は2026-11-22 03:21 JSTに成功。環境revision15を維持し、追加migration/環境変更なし。
- Workersは `redirect:error` を送信前に拒否するため、登録と資格情報付きMCPを `manual` + 3xx拒否へ修正。旧版161/162の方式印なし・鍵なしの未送信予約だけ復旧し、新方式の応答不明は再送しない。ログは固定の段階・状態・HTTPコードだけで、入力・鍵・例外本文は記録しない。
- 本人承認済みの公開名 `Noah-mobile-test-20261122` でAgentboardアカウントを1件だけ作成。今回だけの情報利用を選び、保存プロフィールは変更していない。本人別暗号化キーの保存・外部本人照会・キー入力なしの接続と `whoami`・本人のWork保存を確認。Work `01db125f-c850-4138-bedb-790a4c8b8b04` は画面移動後も成果一覧/詳細から開けた。投稿・課金・キーの変更や削除は行わない。
- 本人へ実スマホで同じNoahアカウントからAgentboard→whoami→頼む→成果を開く確認を依頼し、2026-11-22に「開けた」と回答を受領。これは実スマホのAgent利用/成果表示の本人報告。外部アカウントの新規作成操作は390pxブラウザでの受入であり、本人が実スマホで新規作成した証拠とは分ける。機種/OS/振動体感/外部本人確認は未記録。
- 164では確定した登録失敗の「もう一度」→再入力→reload→「以前の登録」→元の失敗記録への復帰を公開画面で確認。再入力へ戻るだけでは登録を送らない。受付記録を消す操作なし。匿名タイムラインの投稿401は閲覧を妨げず、403/503はエラーとして保持。
- 全体 `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 成功。ルート4,811成功・4skip・0失敗（計4,815）、build・仕事API・CSV・設計・担当検査まで成功。実workerdで登録/照会と転送拒否を検証。100所有者・200重複タップ・100登録、10提供者・100成果保存/切断後保持・別所有者404は合成試験で、外部アカウントや本番負荷を発生させていない。
- 別のUI担当も公開163の390/320px、6言語・RTL・設定reload保持、読み取り専用Tiplineの14件成果、公開9項目/カタログ172件/匿名私有API401を確認。画像の写真アプリ保存や実機振動の証拠ではない。
- 配布範囲: 少人数から100人を目指す試用。Agentboardの実応答は登録20件/IP/時。既定のNoah上限は引き上げない。ブラウザ手順は未設定、予算10ブラウザ分/UTC日。全172件の実行・任意サービス登録・100人同時利用は未受入。成果表示/画像保存の改善は別のUI作業として進行中。

## 2026-11-22 読める成果と画像保存（PR #376）

本人の「成果がそれで届いても伝わらない」「画像ならギャラリーにそのまま保存して」を反映。成果一覧と詳細はJSON原文を主表示せず、アカウント名/状態、見出し/説明/提供元の一覧カード、文章、画像プレビューを表示する。原文は折りたたんで保持。モデルによる推測や内容の事実認定は追加しない。MCPの対応ラスター画像（PNG/JPEG/WebP/GIFと埋込resource）は署名/MIME/容量を照合し、既存の本人別Workに実体を保持する。従来保存済みの件数しかない画像は復元したと扱わない。明示画像URLはブラウザのCORS範囲でのみ読み、サーバーから任意URLを取得しない。

画像Fileをタップ前に用意し、画像保存ボタンは対応端末ではOSの共有/写真保存へ渡し、非対応では元画像をダウンロードする。OS保存完了は確認できないため「ギャラリー保存済み」と断定しない。キャンセル/失敗を区別。6言語のUIを保持。

ローカル検証: 最終関連56試験、typecheck、lint成功。390px/320pxとアラビア語RTLで横はみ出しなし。検証用PNGを実ブラウザから保存し、元の191,359bytesとSHA256一致。これは写真アプリへの実機保存の確認ではない。`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 全工程成功（ルート4,809成功・4 skip、計4,813。production build・仕事API1,918 assertions・CSV385 assertions等を含む）。ローカルproductionの8ルート/8共通ヘッダーもPASS。成果改善の追加公開は配備担当へ引継ぎ、公開後に独立確認する。


### 2026-11-22: eSIMから本人を引き継ぐ（PR #377）

本人訂正「esimにすんのにそれ以上会員もクソもない」により、Noahの入口を接続確認へ変更。`GET /api/noah/session` が既存の本人認証を観測し、確認済みなら元Agentへ戻る。新規Noah ID作成は表示せず、既存ログインは補助導線に保持。接続確認は再読込・前面復帰・15秒タイムアウトに対応し、未設定/未接続/障害を区別。

eSIMの明示的な `noah` scopeを接続・外部登録・登録情報・依頼・成果の既存本人APIへ適用。既存の支払済み注文・設置証明・端末との結び付き・現行審査・失効の検証は維持する。既存キーへ権限を自動追加せず、課金・掲載管理・認証鍵管理への権限も追加しない。SIM番号やIPアドレスを本人と見なさない。公開env15にeSIM連携設定はなく、本番eSIMでの無登録開始は未受入。契約・発行・支払・本番移行はこの変更では行わない。

成果UIは公開165（source `25d9bdbaf8de0b3a4da828cedeb53d8eb81da7b8`、deployment `appgdep_6b01e954c6188191bfd3d966fcca9253`、env15）へ反映。独立確認担当が390pxでwhoamiカード・一覧14件、320px横溢れなしを確認。PNG実体の保存はローカルbyte一致の証拠で、実機ギャラリー保存は未受入。Pixel 10 / Android 17はWi-Fi経由で接続し、既存の長い消灯設定と給電中の画面保持を確認。端末は未ログインで、本人の訂正を受け新規登録・端末へのアカウント追加は進めていない。


公開167の受領（2026-11-22、PR #377）: source `787a2102c5c96e507bb2f9f8700af9aa0e926bfe`、deployment `appgdep_6b01ed1ab6748191aa5ceab9d71b1d47`、env15。`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` 全工程成功（4,829 pass・4 skip・0 fail、計4,833、仕事API1,918 assertions、CSV385 assertions）。初回は旧ログイン文言の期待1件が失敗し、接続確認への変更と元成果へのreturnToを検証する形へ修正後に全体を再実行。

公開Chromeの390pxで新規フォーム0・横幅390px内、未設定表示、再確認、折り畳まれた既存ログインへの遷移、新規登録タブなしを確認。認証済みIABでは接続確認から元のwhoami成果へ自動復帰。公開9項目と未認証のsession API 401 / connected:false / esimConfigured:falseも確認。これらは公開Webと既存アカウントの受入で、実eSIMの発行・新しい端末への本人情報引継ぎの合格ではない。実eSIM設定・別利用者の本番一周・実機画像保存が残る。

2026-11-22 タブのロゴ修正（PR #376）: Noah配下のfaviconを白背景付きcompany-mark.pngからbrand/noah-icon-transparent.svgへ変更。正式ロゴの形状は維持。公開反映は配備担当と統合して確認する。


2026-11-22 透過ロゴ公開170（PR #377 / 元変更d3646297a・PR #376）: 最新の公開169をSites sourceでfast-forwardし、layout・SVGと追記文書の7ファイルだけを追加。source `aa37341c7d3385efb5e0f6ccb30a0d1dabbb968c`、deployment `appgdep_6b01efb88d8c8191a25d365067b2a4b2`、公開時env16。ピン表示・eSIM対応・既存appleアイコンを保持。環境設定やmigrationの追加変更なし。公開HTMLのfavicon href、SVGの200/image/svg+xmlとGit原本のbyte一致、公開9項目、匿名session API 401を確認。eSIM連携は公開応答でも未設定。

検証は統合先のtypecheck/lint/build成功、ロゴ作成側の全体verify成功（4,810 pass・4 skip、仕事API1,918・CSV385 assertions）を確認。eSIM本体の直前の全体verifyは4,829 pass・4 skip。背景透過は元PNGを保つSVGフィルターで、明暗両背景に白い矩形なし。追記文書の競合は両側を残して解消。


2026-11-22 公開170の独立確認（デザイン担当、PR #376 / 受領PR #377）: deployment `appgdep_6b01efb88d8c8191a25d365067b2a4b2` のsucceeded/env16/source `aa37341c7d3385efb5e0f6ccb30a0d1dabbb968c`、公開Noahのrel=iconが `/brand/noah-icon-transparent.svg` であること、SVG本体をブラウザで表示できることを別担当も確認。確認用の幅と言語は復元済み。ロゴ作成側の全体verify 4,810 pass・4 skip・exit0を受領。

確認範囲の区別: 前半の検索→依頼→成果・登録情報の一周は公開165/166時点の検査。公開170は169由来のピン風ホームを保持しており、メニュー「ホーム」と「タイムライン（/noah#timeline）」は同じピン画面になると独立担当から報告あり。以前の投稿＋Agentタイムラインへの切替は観測されていない。最新のピン仕様の意図との照合が未了なので、確定不具合や合格にせず確認事項として保持し、この受領ではUIを変更しない。


### 2026-11-22 公開172・4件修正のGit統合（PR #377）

- UI担当の `b48d55109` を履歴ごとfast-forwardし、`codex/noah-100-user-acceptance-20261122` へpush。登録済み接続の再利用、画像未受取の表示、操作名/入力欄の6言語表示、ホームと `#timeline` の分離を保持。追加の選択肢翻訳もGitに含む。
- 公開172は source `d9a2d4f26439a0d1a14a3139772880fba8d35738`、deployment `appgdep_6b01f571e5488191a24a375d6c212e65`、env16でsucceeded。171 source `566bc99d9776d83ca0fdde04b428b0f31ff941a8` の直接の後続で、収集API/収集処理を変更せず保持していることをsource差分で確認。このチャットから重複配備は行っていない。選択肢翻訳の追補公開はUI担当が継続中。
- 統合後の関連31試験は31 pass / 0 fail。`npm run typecheck` exit 0、`npm run noah:check:domain` は公開9項目成功。全体verifyはUI担当で再検証中のため、今回の統合を全体合格とは扱わない。再開コマンド: `node --experimental-strip-types --test tests/noah-four-flow-fixes.test.mjs tests/noah-registration-ui.test.mjs tests/noah-ask-ui.test.mjs tests/noah-esim-access.test.mjs`。
- Pixel 10 / Android 17のWi-Fi接続を再確認。画面がロックされているため、本人へ本体での解除を依頼。今回の実スマホによる登録→Agent利用→成果受取は未完了。既存の外部登録1件と以前の本人による成果表示の証拠とは分離する。
- mainのPR #378にある無料eSIM試用workerは `services/noah-test-runtime/src/esim-trial/worker.mjs` のローカルfixtureであり、公開入口にmountされていない。これを本番eSIM本人連携の完了証拠には使わない。


### 2026-11-22 公開173・4件修正の最終ブラウザ確認（PR #377）

公開173は source `5ffaf8a368024abf80dab143f63982906166d72c`、deployment `appgdep_6b01f759dec48191889bb73f60639103`、env16、succeeded。公開171の収集機能、既存eSIM・透過faviconを保持。追加した本番migrationはない。

登録済みAgentboardは再読み込み後も入力欄0で「Agentを使う」へ進む。旧画像仕事 `069a8a81-d6dc-478a-b80c-9ad82d415d53` は「画像が未受取」として確認待ちへ分類。画像生成の成功や写真アプリへの保存は捏造しない。新規検索 `efa1d17f-577e-476a-83e0-aaddff997748` は5件を受領し、成果詳細を再読み込みしても保持。ホームのピンと投稿タイムラインを別に表示し、フォロー中/Agentのみ/戻る、直接の #timeline 読み込みを確認。英語の用途名/入力欄/選択肢、アラビア語RTL（320px）、タイムライン390pxで横はみ出しなし。言語を端末自動へ復元。画像実体未返却のAgentを自動再実行していない。

最終 `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` はexit0。ルート4,844 pass・4 skip（計4,848）、API1,918 assertions、CSV385 assertions、型/lint/本番build/資産検査を含め成功。初回の別worktree node_modules参照と不足したMini依存を独立配置で修復し、旧ラベルを期待していた2試験を新表示へ更新。CLI時間切れ2件は再検査成功。テスト削除や例外化なし。最終ログ `/tmp/noah-four-final-verify.log`。

この記録は公開サイトをIABの390px/320pxで確認したもの。Android本体、写真アプリ内の保存完了、振動体感の独立確認は受入チャットで別途進行中であり、ここで実機合格とはしない。


2026-11-22 実機再確認（PR #377）: 本人の解除回答を受けてPixel 10のWi-Fiミラーへ再接続したが、最新の画面は時計と鍵マークのまま。USBを抜いてもテスト中の表示を保つため、所有するscrcpyプロセスへ `--keep-active` を追加し、端末のAwakeを確認。既存の消灯時間設定2147483647は変更していない。画面ロックや本人確認を解除する処理は追加せず、Pixel本体でNoahを開くよう本人へ依頼。登録・Agent実行・成果受取の新しい実機証拠はまだない。


2026-11-22 実機確認の阻害要因更新（PR #377）: 本人から「Pixelで開いた」を受領。ADBでPixel 10のWi-Fi接続とAwake、既存timeout保持を確認した。以降のネイティブ画面取得がtimeoutし、画面操作ツールの起動も失敗、続いて当該ツールが利用不可となった。現時点の阻害要因を画面ロックからMac側の操作接続障害へ更新する。本人へ追加の解除を求めず、画面取得・操作が復旧した後に実機の登録→Agent利用→成果受取を再開する。ユーザーによる解除報告と点灯確認は、一周成功の証拠ではない。


2026-11-22 操作接続の復旧調査（PR #377）: 本人の復旧依頼を受けて再調査。MacのComputer Useサービスは稼働しているが、このチャットへ操作ツールが提供されていない。別ランタイムにも既存操作セッションはない。PixelはADB端末一覧とmDNS探索から消えており、保存済み接続先への接続は到達不能。ADB再接続でも端末0のため、現在のワイヤレスデバッグのIP/ポートを本人へ依頼した。Mac側は公式のComputer use設定とこのチャットへの@Computer付与を依頼。macOS権限の書換え・認証回避・別端末への接続は行わない。実機一周は未完了。
### 2026-11-22 Agent詳細の接続・保存ボタン（PR #377）

接続と保存の間隔が0pxだったため、保存を専用の行へ置き16pxの余白を確保。紫の接続と白地の保存で主操作・補助操作を区別し、保存の押す高さは46px。保存先・接続処理は変更していない。

公開175: source `c2e9f2d44a8ab2fef3a835170d63a51ce3cbf2d4`、deployment `appgdep_6b01fdb5bf7081918ade578924721a19`、env16、succeeded。並行して追加されたbusiness入口 `3c9f02a` を履歴ごとmergeして保持。最初のsource pushは先端更新により拒否され、統合・再build後に成功した。公開Arabic Name Calligraphy詳細で320/390/1280pxすべて間隔16px・重なりなし・横はみ出しなし。保存を押して保存先シートが開くこと、接続の中心が別ボタンに覆われていないことを確認。ローカルpreviewには対象Agentがないため、表示検証は公開画面で実施した。

検証: 関連26試験、公開sourceのtypecheck/build成功。`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` exit0、ルート4,844 pass / 4 skip / 0 fail、build・API・残りの全検査成功。ログ `/tmp/noah-button-verify.log`。スクリーンショットは `/Users/kaiya/.codex-work/visualizations/2026/11/21/01a1fe90-1f3f-7083-a3a9-f7e3cad0ea6a/noah-public-mobile-20261122/noah-175-button-spacing.jpg`。


### 2026-11-22 会員制廃止へ切り替え（PR #377、実装中）

本人のADB操作許可を受け、Pixel 10で公開175のホーム→Agentboard詳細→接続まで実測。操作接続は復旧した。旧方式はeSIM未設定/未ログインで停止したため、本人の「会員登録制やめて廃止して」に従ってログイン待ちを取りやめる。正本04と単体ローンチ仕様を更新し、ブラウザごとの保存権限で初回から使う実装を開始。公開175の接続/保存ボタン修正181c2b08aは統合済み。新方式の公開・スマホ一周・100人配布受入は未完了。


2026-11-22 会員制廃止の実装候補（PR #377、未公開）: 初回の同一origin POSTでブラウザ専用の署名済みHttpOnly/Secure cookieを発行し、保存を確認してから画面を開く。ログインフォームは撤去し、旧accountリンクは選択中のAgentへ戻る。既存のNOAH_PROFILE_KEYSから用途を分けて署名鍵を導出し、Noahの利用者APIだけで所有者を解決する。既存アカウント・eSIMの有効な本人は保持。掲載管理・課金・OS/端末APIへは権限を渡さない。

専用10試験（実Workersを含む）と保存API10試験が成功。未登録ブラウザの接続→依頼→成果→再読込、別ブラウザの404、暗号化保存、改ざん/別origin/管理API拒否を確認。型検査・build・ローカルproduction8ルートの応答測定も成功。全体verifyは再計測後に実行中で、既存pixel-cached-prepareの1件失敗を切り分け中。100人/実機/公開の受入へ昇格しない。
## 検索・保存の統合と不要ページ撤去（2026-11-22、PR #377）

- 検索は `/noah/explore` の使えるAgent・カタログ・Tool、保存は `/noah/saved` のボード・Agent・担当・成果・ファイルへ集約。検索語をタブ間で保ち、成果は既存Workと以前の保存データを同じカテゴリから読む。既存の所有者確認・保存API・データは維持。
- 旧 `/ready`・`/agents`・`/tools`・`/library`・`/boards`・`/boards/:id`・`/data`・`/data/saved`・`/outputs` はカテゴリと検索語/board/job参照を保持して転送。共有Skyの担当/成果、旧Zema担当の転送先も対応カテゴリへ変更。
- Noah配下の `/mac` 3画面、`/local-tools`、Macガイド、`/social`、`/community`、`/campus` 3画面、旧 `/work/:id` を撤去。共有実装・バックエンド・他製品のcampusは残す。タイムラインの通常投稿は閲覧のみとして削除済み投稿画面への操作を外した。
- 公開178: Sites source `e4392274eeaf56dcf7800aae736b18f94c68e4e1`、deployment `appgdep_6b02055843b08191b05f2067bbd458ca` succeeded。環境revision16を維持、本番D1変更なし。
- 公開177の収集欄と法人入口を保持。収集欄の検索はカタログ入力を共有し、ホームでは検索欄を重ねない。この収集統合差分はSites sourceに含む。GitHub側はPR #380の収集実装との統合時に同じ差分を保全すること（補助patch `/tmp/noah-collection-search-integration.patch`、永続の正本は上記source commit）。
- 同じ `/noah` の画面差は、開いたままの旧タブと公開177の新タブの差だった。旧タブは再読み込みで収集一覧が現れることを確認し、最終的に元のタブも公開178へ再読み込みした。
- 公開HTTPで転送9件と撤去11件の404を確認。390pxブラウザで保存5カテゴリとカタログの検索欄1個、検索語付きタブ、横はみ出しなしを確認。匿名表示の確認であり、実利用者の非公開データ件数や実機OSの合格を意味しない。
- 検証: 公開ソースのtypecheck/lint、変更関連テスト、Sites build/package成功。ローカル全体verifyは修正途中の旧URL期待値1件で停止（4,847 pass / 1 fail / 4 skip）。その期待値を修正し、関連20件を再実行して成功。最初の全体実行で遅延したmiiブラウザ試験は単独再試験と次の全体実行で成功。verifyの後続15コマンドは別途すべて成功（build・bundle/asset検査・API・mission/work/botまで）。最終typecheck/lintも成功。再ビルドしたローカル本番Workerでsecurity header 8経路とページ転送84検査が成功し、現行入力hashの記録を更新した。全体verifyの単一実行がexit 0になったという意味ではなく、旧期待値修正後の対象再試験と後続コマンドの成功を区別して記録する。
- 画面証拠: `/Users/kaiya/.codex-work/visualizations/2026/11/21/01a1fe90-1f3f-7083-a3a9-f7e3cad0ea6a/noah-public-mobile-20261122/noah-178-saved.jpg`。


### 2026-11-22 会員登録不要の公開179（PR #377）

公開178の検索/保存統合source `e4392274eeaf56dcf7800aae736b18f94c68e4e1` にブラウザ専用保存権限を統合して公開。source `4a15190e49ef43da778ebdc21d344cc325d9f2b4`、deployment `appgdep_6b0207b6d7908191840a628b3ab3449a`、env16、succeeded。公開177の収集と法人入口、178の検索・保存カテゴリとMac/コミュニティ画面撤去を保持。追加migration・環境値変更なし。公開元のアーカイブSHA-256は `e3cab5f285005185eb9094ac3fda5289ec9eaa090b6313682721c5fd6e972574`。

GitHub側は実装3e492b237、README/画面試験補完b53f82f95、画面整理0f0271dabの統合862eac033。公開sourceの収集componentと法人入口は別PR由来で、受入枝へ未統合の差分も最新公開sourceに保全。公開への反映は最新Sites sourceを土台にする。

検証: 会員登録不要化の全体verifyは全工程exit0（root4,852 pass・4 skip・0 fail、API1,918・CSV385 assertions）。初回の既存pixel-cached-prepare待機1件失敗は単独17件成功後に全体を再実行して解消。公開178を統合したsourceはtypecheck/lint/build成功、Noah866件中865件成功、1件は収集部品の試験stub不足。部品境界を補い、失敗した画面分岐を含む4件を再実行して成功。テスト削除・除外なし。Git側の最終画面統合後は本番build、ローカルproduction8ルートのheader再測定を成功し、全体verifyを再実行中。

公開APIの実試験（物理スマホとは別）: 未登録ブラウザ権限を発行し、無料Tiplineへの接続 `308a7122-bb34-4096-96a4-89d14c4f59c0` → 読取専用list_gta6_entries → Work `8ac2abf5-6005-4d34-88d5-be5c01549671` succeeded、成果130,948文字を受領。再取得で本文一致、別ブラウザ権限では404。Noah会員・外部アカウントの作成、投稿、課金なし。実行を再送していない。

Pixel 10は公開179でログインなしのホーム表示・検索入力まで実測。その後端末ロックに戻り、本人へ解除を依頼した。画面保持のscrcpy control-only接続を再起動し、端末ロック自体は変更しない。端末上のAgent実行・成果表示はまだ未完了。公開APIの成功を実機合格や100人配布完了には昇格しない。


2026-11-22 最終Git統合検証（PR #377）: 862eac033で画面整理を取り込んだ後の `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` は全工程exit0。root4,856 pass・4 skip・0 fail（計4,860）、API1,918・CSV385 assertions、typecheck/lint/build/assetを含め成功。ログ `/tmp/noah-memberless-merged-verify.log`。公開スモーク検査に残った旧ready/dataの200期待を、正しい統合先への307/308と固定カテゴリ照合へ更新。専用3試験と再lint成功、公開12項目が成功。検査は読み取りのみでブラウザ権限を発行しない。Pixelの実機一周は端末解除待ちで、成功とは記録しない。


## 2026-11-22 共通カード・評価の統合（PR #386）

✅ 既存ピンと収集Agentを `/api/noah/discover` の共通カード一覧へ統合。公開URLが一致する同一Agentは王冠・コメントIDを共有し、絞り込み・ボード・詳細も共通評価へ接続。外部スター/いいねは出典付き補助情報として折りたたみ、Noahの利用人数・王冠へ合算しない。紹介だけのAgentは配布元へ、接続確認済みは既存実行/保存導線へ進む。署名付き収集・ブラウザ所有者・本人別非表示・既存保存データは保全。DB migrationなし。

公開182: source `b09c6976d2ff8f48c74502596ace3de68272b7a6`、deployment `appgdep_6b020d1c046481918a102e0d043c9d51` succeeded。公開APIは213件/先頭20件を返し、390px/590pxのブラウザで横はみ出しなし。同じAxadが全件/MCP絞り込みで王冠1を共有すること、取り消し後0、コメントダイアログを確認。試験票は残していない。物理スマホでの検証は今回行っていない。

検証: typecheck・lint・関連47試験成功。Sites sourceの全体verify主試験4,895件中4,889成功/4 skip/2失敗。2件はcheckoutの過去GitオブジェクトとMini依存不足を補完後、該当16試験が成功。残り15検査（ビルド・公開ファイル・Work API1,918・CSV385等）を順次実行し全成功。単一のverify再実行完走とは区別する。ローカルproductionの8ルート/8共通ヘッダーも成功。

再開: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。PR #377の `6efb722d3` を含む。Git側にない法人入口/Reviewer拡張は公開sourceで維持。PR #386はdraft、GitHubでのレビュー・マージは未完了。


## 2026-11-22 評価元の実数を主表示（PR #386）

✅ 本人指示「評価元から引っ張ってきて」に対応し、GitHubスター/Hugging Faceいいね/Xいいね・リポストを元リンクとともにカード上へ常時表示。取得できない項目は0で埋めず、Noah王冠との換算・加算はしない。取得は既存の署名付き収集のまま。whytapは公式GitHub APIのスター4、Semantic Shift Backendは公式HF APIのいいね3と一致。収集run44952758398成功。値は取得日時点のスナップショットであり、即時のリアルタイム値ではない。

公開184 succeeded: source `4eca3969053fccbebdc435209039881321cfc697`、deployment `appgdep_6b0211c0c6448191ada1364154844a65`、env16。公開183の共有カード機能を取り込んで保持。公開ブラウザでGitHub★4/HFいいね3が展開なしで表示されること、390pxの横はみ出しなしを確認。端末の実機操作ではない。

検証: 関連38試験と型検査成功。全体verifyは主試験4,892成功/4 skip、後続prebuildでローカルpreviewの保存先競合が発生。自分のpreviewを停止、既存と検証用storeを完全退避後にbuildと残り6工程成功。退避先 `/var/folders/w0/370ws_yn0gl9m1b5816bqks00000gn/T/noah-ratings-preview-backup-u849t6ko`。183統合後は型検査・関連/共有41試験・build・bundle/assets・8ルート/8ヘッダー成功。単一verify再完走とは区別。ログ `/tmp/noah-ratings-verify.log`、`/tmp/noah-ratings-final-checks.log`、`/tmp/noah-ratings-merged-tests.log`。PRレビュー/マージは未完了。
