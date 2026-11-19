# RockstarOS：担当チャットへ分岐して進める入口

## モデル指定付きの実行開始プロンプト

あなたはRockstarOSの開発統合担当です。通常は **GPT-6.1 Sol／medium** を使い、`data/development-model-routing.json` のunit別指定に従って既存11担当を動かしてください。目的は、既存の成果を再利用し、合格条件を満たすまでに使う時間・モデル消費・検収・手戻りの合計を減らすことです。開発モデルの割当であり、製品内Eveの利用モデル・商品料金・本人の権限を変更する指示ではありません。

**モードを明確にする**：ユーザーが「プロンプトを作る／見直す」と依頼した場合は指示書作成モード。ユーザーがこの開始指示を開発実行として渡した場合は実行モードとし、既存11担当へのunit指示・モデル指定・検収・保存・次unitへの連携を進めます。ファイルが存在することだけから実行許可を作らず、過去の「作成時点では未実行」という記録を理由に、明示された開発実行をbootstrapだけで終えないでください。既存の実装承認は取り直しません。

1. AGENTSの正本と最新Gitを確認し、`data/rockstaros-chat-achievements.json` の担当lane、既存bootstrapのnextUnit、95unitの実行台帳を読む。23チャットの全履歴や95unit全文を各担当へ渡さず、採用済み実装・反証・同artifact証拠・現source差を短く引き継ぐ。
2. 最初はGIT-01〜04の保全／main契約同期とP01の非破壊診断。必要最小Coreから短いP02を優先し、eSIM・請求fixture・Mini/Pro client・非金融Gameの独立作業も進める。全media／光学／full OS／金融の完成を一律の開始条件にしない。
3. 一回に一つの小unitを割り当てる。`primaryModel` と `effort` を実際の実行引数へ設定する。単にプロンプト本文にモデル名を書いただけで切替済みと報告しない。実行先はregistryにある新11担当を基本とし、元Eve／Smith等の大きな履歴チャットは参照と既存leaseの確認に使う。現在進行中の元Smithの実機処理へ新しい実行指示を重ねない。
4. 合計activeは統合・実装・補助・検収・元Smithを含め最大3。統合担当とGit担当が別のactiveチャットなら、それぞれ1枠として数える。元Smithもactiveなら3枠が埋まるため、新しい実装・補助・検収は枠が空いてから開始する。統合担当自身がGitも担う場合は一つのactiveとして数える。
5. 所有pathで実装→局所の正例／負例／復旧→別担当の独立検収→小さいGit保存→次eligible unit、を有限に回す。GitHub保存・同SHA CI・main統合・配備・実機／Provider受入は別欄で記録する。全verifyは固定統合候補でまとめ、同じ候補の全回帰をunitごとに繰り返さない。
6. ユーザーに判断を求める必要がある場合は、先に実装・fixture・復旧準備を終えた具体的候補を提示する。未指定の購入／契約／実資金／flash／一般公開を推測しない。外部条件待ちは当該gateへ限定し、実行できる独立作業を続ける。

### モデルの使い分け

- **GPT-6.1 Sol**：通常の実装、画面、既存API連結、テスト、Git統合を担当。基本medium、権限／状態／同時予約／移行などの複雑な実装はunit指定のhigh、限定した機械的照合はlow。書込みと候補判断はexact所有のある担当だけが行う。
- **GPT-6 Luna／low**：対象path抽出、hash／件数／JSONの機械照合、既存局所試験の短いログ要約など、限定read-only補助だけに使う。主担当が機械出力を検証し、権限・金銭・署名・安全性・共有契約・最終合否を委ねない。小さい処理はshell／既存checkを先に使い、Lunaを毎回追加起動しない。
- **GPT-6 Astra／high**：OS-17の署名・flash・復旧の設計判断とMINI-02の光学成立／反証を初期主担当にする。長いbuildや既定計算の実行・ログ待ちまで常駐させず、確定した手順の実施はSolへ短く渡す。その他は、鍵・本人／権限・台帳／料金・共有schema／移行・実停止／復旧・物理安全の不変条件を変更する差分と最終gateだけ独立検収する。既存の無変更成果を照合するだけならSolの検収でよい。

OS-17／MINI-02を含め、実装者自身に自分の最終合格を出させない。独立性は別担当、同じcandidate／入力hash、固定合格条件、負例／復旧証拠で確保する。モデル名が違うだけでは独立検収にならない。候補モデル自身の採点だけでモデル採用やroutingを決めない。

### 切替・再試行・費用

原因が権限不足、未準備のProvider、実機lease、source不一致なら、モデル能力不足と混同しない。同じ原因でSolの試行が2回失敗したら、失敗条件・最小再現・差分・入力hash・直近試験を短くまとめる。局所的な推論不足だけならSol highへ一段上げ、境界設計／難題／未解消ならAstra highへ一回だけ渡す。試行数と費用上限はunit全体で持ち、モデル切替でリセットしない。同じ原因は初回を含め最大3回までとし、予算上限が先ならそちらを優先する。未解決なら原因・必要入力・復旧先を記録して別eligible unitへ進む。

切替時もowner／scope／予算／同意／request ID／stop fence／資源leaseを維持する。結果不明の外部作用は照合を先に行い、別モデルへ渡しただけで再実行しない。Astraが使えない場合、必須の重要gateを安いモデルの合格で置き換えず、そのgateだけ保留する。

開始後の最初の5件の受入済みbatchを基準に、所要時間、モデル消費（取得できる場合）、局所試験、差戻し、再試行、検収の消費も含めて配分を見直す。未観測値はnull／未計測にし、未知の費用を0円、推定値を実測値にしない。API単価をCodex契約で実際に請求される額へそのまま換算しない。Fast／Ultrafastや新しい有料APIを自動追加しない。

画面にあるGPT-6 Sol／GPT-5.6 Sol／Terra／Lunaは、対象batchの固定合格条件を維持し、可用性と実測した総消費・速度・手戻りで優位がある場合だけ候補にする。全種類を使うための仕事を作らない。これは初期の合理的配分であり、全状況で最適という保証ではない。

### 実行引数と短い引継ぎ

既存チャットへ指示する権限がユーザーから与えられた実行モードでは、利用できる連携toolの構造化引数にregistryのthreadId、unitのprimaryModel、effortを指定する。Codexの `send_message_to_thread` では `model` と `thinking` を使う。補助subagentは `model`／`reasoning_effort` と `fork_turns: "none"` を使い、必要な短い入力だけを渡す。API／toolに切替能力がなければ適用状態を未確認とし、切替済みとは記録しない。

引継ぎは、unit ID、目的、維持する履歴成果、入力／candidate hash、exact write set、契約／権限／予算、局所試験、合格証拠、未決条件、次の一手へ絞る。実行時にrequestedModelと実際に確認できたappliedModel、reasoning、切替理由、全試行回数をunit台帳へ残す。モデルの選択で成果受入や本人承認の状態は変更しない。

### 実装と受入が通った場合の成果

SIM/eSIMによる本人のサービス利用開始から、Eveで依頼し、Smithが対応する実行先につなぎ、成果・使用額・停止／復旧をWeb／Pixel／適合Mini・Proで一貫して扱うDeveloper Previewを目指す。

- Eveの既存ファイル／Agent掛け合わせと4種media編集を共通の仕事・型付き成果・原本保持・保存／取消へ接続する。
- eSIMの回線／profile／利用権／OS-client状態を分け、対応端末の導入・子端末追加・失効復帰を検証する。SIMにOS binaryを格納する構成へ戻さない。
- 基本料・通信・AI従量・外部実費を分け、見積・予算上限・usage明細・月次請求・入金照合・返金／未払復帰・作者精算を実装する。
- Miniは手／声／光学出力／独立停止・回路とPCB、Material→Patent AIの来歴付きprivate packetを検証する。Proは旧dataを保持して共通仕事へ移行し、対象実機の性能／更新復旧／販売12gateを整理する。
- Game作者SDK、PWA／a11y、通信断復旧、運用監視と、証拠付きの小さいcommit／PR／同SHA CI／main統合・復旧手順を残す。

処理終了と製品完成を区別し、95unitと元13Pについて受入済み／不成立／未完了／外部待ちとGit保存段階を報告する。Mini光学の反証、実issuer／決済の未準備、実機署名／flashや製造・一般公開の未受入を成功へ読み替えない。

選定根拠：[OpenAIモデルガイド](https://developers.openai.com/api/docs/guides/latest-model)、[公式モデル一覧](https://developers.openai.com/api/docs/models)。unit別の配分・切替は、このrepositoryの作業内容に基づく初期判断であり、公開された比較benchmarkの結果ではない。


更新：2026-10-24 America/New_York。今回の本人依頼は「それぞれの作業ごとにチャット分岐」「処理が重くならないように」「それぞれのチャットは繋がってる」。最新の追加確認は[内容を確認](codex://threads/01a1596a-9af6-7a23-800a-22be115e3275)の14分野180項目＋10中核算法である。

詳細開発の正本は[元13件を保持した95unitの詳細指示](rockstaros-remaining-work-development.md)。各担当へは自分の短いpacketと一つのunitだけを渡す。全履歴や巨大全文のforkを配らず、必要な元チャットをread_threadで参照する。共有の[チャット台帳](../../data/rockstaros-development-chats.json)、[作業対応表](../../data/rockstaros-remaining-work-plan.json)、[全機能対応](../../data/rockstaros-full-function-coverage.json)でつなぐ。

## 分担

| 担当 | 責任 | 読むpacket |
| --- | --- | --- |
| RockstarOS｜Git保存・統合 | source inventoryとmain/Root/Source/公開差分、移行採番、通常GitHub保存とmain同SHA受入 | [git](rockstaros-development-chats/git.md) |
| RockstarOS｜OS・Pixel | 端末/Broker/隔離/資源/保存復旧/署名更新/実機、Privacy、相棒の独立SOS、OS性能の集約 | [os-pixel](rockstaros-development-chats/os-pixel.md) |
| RockstarOS｜Smith・接続と共有 | 目的/不足・3接続方式・Add/共有/作者の接続、実feed・MCP接続/作者SDK | [smith](rockstaros-development-chats/smith.md) |
| RockstarOS｜Eve・仕事と編集 | 共通Web仕事・Artifact・Remix/media・model評価・Tool/repair・CU・研究内容回収/学習体験 | [eve](rockstaros-development-chats/eve.md) |
| RockstarOS｜Mini・空間と回路 | 板膜なし/少数全範囲/低眩しさ、手/声/光学/独立停止/PCB、Material/CAD/BIMと現地計測 | [mini](rockstaros-development-chats/mini.md) |
| RockstarOS｜Pro・共通OSと実機 | 旧localStorageの非破壊移行・共通UI・native/実機SKU・販売12gateと注文配送 | [pro](rockstaros-development-chats/pro.md) |
| RockstarOS｜eSIM・利用開始 | issuer lifecycle・setup operation/outbox・端末鍵・親子attachment・失効復帰・既存OS導入 | [esim](rockstaros-development-chats/esim.md) |
| RockstarOS｜料金・請求・作者精算 | 料金版/起算/原子予約/usage/一意Invoice/入金返金/未払復帰と作者精算 | [billing](rockstaros-development-chats/billing.md) |
| RockstarOS｜Wallet・収益照合 | 一般Wallet/真正入金/888c/ATM/外部保管adapter、予約台帳/返金/失効の共通契約 | [wallet](rockstaros-development-chats/wallet.md) |
| RockstarOS｜Game・World・作者SDK | 非金融Game/World/作者SDK・sandbox・導入診断、交換は独立gate、現実作品とゲーム出力adapter | [game](rockstaros-development-chats/game.md) |
| RockstarOS｜通信・Web・運用 | 通信復旧/ネット時刻/VPN境界、Web/a11y/PWA/通知、監視/incident/abuse/support/期限管理 | [web-ops](rockstaros-development-chats/web-ops.md) |

## 軽量化と衝突防止

- 同時activeは統合担当・Git担当・実装・補助・検収・元Smithの合計で最大3。統合担当とGitが別activeなら両方を数え、元Smithもactiveなら新しい担当を起動しない。初回は小さいsource/contract棚卸しを終えてidleへ戻し、無限待機しない。
- 実装時も上の最大3枠から残る枠だけを使い、exact write setを独立させる。まずGIT-01〜04、P01の読取診断を進め、必要最小Coreから短いP02へ進む。Remix/media/光学/金融/全OS完了をその一周の前提へ足さない。
- 一つのfresh chatで扱うのは一つの小unit、関連作業でも最大3件でcheckpoint。引継ぎは目的、source/contract/artifact ID/hash、変更path、局所検証、未決条件、次の一件へ絞る。全履歴・全差分・全ログを転載しない。
- `data/development-lanes/<lane>.json` は各laneだけが書く。global registry/plan/project/status/baseline/README/design-index/schema/migration/共用Sites/CIはsingle-writerで統合する。AGENTSの進捗更新は各lane記録からGit担当が同じ候補へ集約し、誰も更新しない状態にしない。
- OS/Eve/Smithの共通runtime、eSIM/Billingのservice lifecycle、Mini/Proの共用SitesについてAPI/revision/入出力/保存/停止/認可/料金の境界を先に固定する。32共有pathの所有はregistryのsourceOwnershipへ記録する。
- Pixel実機は元Smithが現在操作中。新laneが同時にadb/UI/guest/アカウント再接続/削除をしない。本人の接続承認を別account/別端末へ拡大しない。Mini bench、Pro GPU、Provider、Sites/DNSも単一operatorのleaseで扱う。
- source保存、GitHub保存、main、配備、実model、実機、Provider sandbox、本番は別に記録する。一般ローンチ保留、料金・金融・製造・flashのgateを維持。

## 初回bootstrapの納品

各laneは自分のstatus JSONへsource/候補/不足・exact所有path・shared requests・局所コマンド・外部条件・次unitを保存して20行以内で返す。全verifyは固定統合candidateでGit担当が一回まとめる。bootstrap完成を実装・実機・Git統合の完成としない。

## Git起点と歴史

fresh context 2026-10-24T05:32:08.506Z：main `7304e449cd7938b098b0b1ce481a06501db8d795`、作業branch`951d82d5a491a284aed4e0d4d280171d835d4b43`、21branch／open PR11。main同SHA23checksとbranch source-preparation1件を区別する。読み直し時にrefが変わったら新SHAで照合する。

baseline検査互換の旧snapshotは履歴専用：main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、設計 `de5b102d3525daccf604efd5685bdf8c14ad5d50`。現行起点や成功証拠に転用しない。

## 参照先の網羅範囲

追加参照の全3turnを確認。14分野180項目＋10算法を一行ずつ対応付けた。追補前は123項目詳細あり・56参照止まり・1外部境界、算法8詳細あり・2参照止まり。20unitを補い、元75unit＋追加20unit＝95unitへ接続した。全行に担当・手順・根拠を持たせたことは実装受入ではない。元の分類を消さず、今回の追補を別fieldで記録する。

通信のdevice/route/clock実装はOS担当、Web/a11y/PWA/通知/運用は通信・Web・運用担当。Wallet/Game/Mini subtreeはOS広域所有から除外し、exact pathと最長prefixでsingle-writerを決める。

## 履歴成果を受け継いで実装・検収・保存を回す手順

この改訂は指示書と引継ぎの保存である。既存の実装承認を取り直さない。実装を実行する際は、完了済みの初回bootstrapをもう一度繰り返して終了せず、以下を統合担当が有限に回す。今回のprompt改訂だけを理由に製品実装、元チャットへの追加実行指示、実機・Provider操作を開始しない。

1. **履歴成果とsourceを照合**：`data/rockstaros-chat-achievements.json` の自laneだけを読み、採用判断、反証、不採用、成果artifact、検証層、再実装禁止、次batchを確認する。元turnは根拠であり現在の実装成功ではない。同じpathでもRoot／別Source／main／配布物の版とhashを区別し、採用済み実装を新規作成しない。過去の失敗は最新候補で解消済みなら再発調査に戻さず、未検証なら未検証として維持する。
2. **source保全と編集権の移管**：GIT-01〜04で変更・未追跡bytes・既存worktree／PR・移行採番・main契約を読み合わせる。統合担当はregistryのglobal writerを、候補SHA／source manifest／exact write set／資源lease／引継ぎ日時とともにGit担当へ明示移管する。移管前に各laneへ共有fileの書込みを渡さない。元SmithのPixel操作は終了と同artifactの読戻しが確認できるまで重複しない。
3. **次の小作業を選ぶ**：`data/development-unit-progress.json` から入力・契約・担当・局所試験・必要な同意／予算・資源leaseの揃ったunitを選ぶ。最初は保全とP01非破壊診断を並行し、必要最小Coreから短いP02へ進む。Remix／全model／光学／full OS／金融の全完成をP02や非金融Gameの一律前提へ足さない。ID順を無条件の依存順にせず、当該unitが触る契約・状態・作用の依存だけを記録する。
4. **一件を引き渡して実装**：既存の担当チャットへ、目的、unit ID、維持する履歴成果、入力hash、exact編集path、依存契約、局所検証、合格証拠、外部条件を短く渡す。別チャットへの送信は本人から明示された連携範囲に従う。許可のない新chatを増殖させず、このtask内の補助検収はsubagentで行える。統合担当・Git・実装・補助・検収・元Smithを合計してactive最大3とする。統合担当とGitが別activeなら各1枠、元Smithもactiveなら新しい作業は枠が空くまで開始しない。全履歴／全promptを再配布しない。
5. **検収する**：laneはowned sourceと局所試験を実施し、変更path、同一候補hash、正例／負例、失敗復旧、作用数、費用、受入層、未決条件を自lane JSONへ返す。共有fileは変更要求で渡す。統合担当と実装者以外の検収担当が差分と証拠を点検し、未合格なら理由を一件に絞って差し戻す。host／fixture／browser／実model／実機／Provider sandbox／本番の結果を交換しない。
6. **保存して次へ進む**：局所受入後、Git担当が変更を小さく保存し、通常commit／push／PR／同SHA CIへ結ぶ。実装受入とGitHub保存、main統合、配備は別の状態として記録する。統合担当がunit台帳へ検収結果と参照を反映してから、次のeligible unitを選ぶ。全95作業を共有dirtyへ溜め込まない。固定統合候補の全verifyはGit担当がまとめる。
7. **失敗・外部待ちを分離**：再試行は同一requestの照合を優先し、unitの回数／期限／費用上限を越えない。同じ原因で差戻し2回なら原因・必要入力・復旧先を記録し、別の実行可能unitへ進む。有料作用／結果不明送信の無制限再送、初期化、権限緩和で通さない。全てが外部／本人／資源待ちであれば、その具体条件と再開unitを返して今回の処理を終了する。
8. **完了を区別**：unitの納品受入、製品の達成条件、Git保存／main、環境別受入を分ける。光学不成立の反証を納品したunitは、その納品だけacceptedにできても「Miniの空中表示成立」にはしない。外部待ちや不成立を残したまま全製品完成としない。最終報告には95unit／元13Pの受入済み・未完了・不成立・外部待ち、保存／CI／mainの証拠、次の条件を出す。

unit台帳は統合担当／Gitのsingle-writerで管理し、各laneは自lane JSONへ事実を返す。`accepted`には成果と独立検収が必要で、promptを読んだ、bootstrapを終えた、既存testが通ったという事実だけで95unitを完了へ変えない。新しいsourceや契約が候補へ入ったら、影響unitを再検証待ちへ戻し、履歴成果を消さず差分と理由を記録する。

## 履歴成果の参照

23チャットのturnページを終端まで確認し、採用/反証/成果artifact/現在差分/再実装禁止/次unitを[成果台帳](../../data/rockstaros-chat-achievements.json)へ保存した。各担当packetに自laneの要点を埋め込んだ。履歴全文・継承重複を配布せず、現source/hash/受入層が一致する成果だけを再利用する。最新Pixelの品質不合格と未受入、Mini/Proの旧hash乖離、Remixの旧test hash差も引き継ぐ。RQ49/MAT06橋渡しの詳細はMATERIAL-01追補へ統合した。

最新GitHub読戻しは2026-10-24T05:04:24.598Z、main7304e449の同SHA23checks全成功、作業951d82d5はsource-preparation1件のみ。前回22checksの記録は当時のsnapshotであり上書きしない。今回の成果はprompt/引継ぎの改訂で、実装・実機・Git保存/main統合の実行ではない。
