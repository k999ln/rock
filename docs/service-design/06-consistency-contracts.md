# 06 — 横断整合契約：同じ本人・仕事・成果・費用を追える条件

この章は[共通契約](02-system-contracts.md)を、system間で照合する不変条件と受入試験へ具体化する。主担当はWeb / Product UX（ROCK）、連携はSky、Security、Wallet、Native、Gameの既存担当。**到達設計を指定する章であり、未実装gateをruntimeの保証へ換算しない。**

要望・料金の正本は[製品ベース](../product-baseline.md)と[baseline JSON](../../data/product-baseline.json)。Jenniferの根拠は[未統合branchの固定SHA `d0151e89`](https://github.com/k999ln/rock/blob/d0151e892794066e1a59b5e4d1dc8863e314947f/docs/jennifer-coordination.md)。main、同branch、公開Site、nativeの受入は別に記録する。

## 1. 会話窓口と権限領域を分ける

Jenniferは共通の会話窓口で、Skyは能力の発見・接続、Zemaは仕事・承認・停止・成果・費用のsystem、Brokerは実行許可の強制を持つ。専門担当siを含むJenniferの応答と計画は助言であり、本人性や実行権限の証拠ではない。

Skyを直接開く、host app内で成果を使う、ゲストが純粋なローカル処理をする操作には、会話を必須にしない。保存・外部作用・有料実行へ進む時は、同じZema/Brokerの条件を検査する。会話を経由した場合だけ権限が強くなる経路を作らない。

GitにあるJenniferの8projectは、Rockstarを開発・運用する**内部portfolio**である。一般利用者の顧客案件やtenant workspaceではない。担当profileから利用者を管理者にしない。profile選択はGit書込、秘密閲覧、課金、配備の許可にならない。

到達契約では認証principalにownerと認証領域`realm`を結ぶ。`operator portfolio`、`tenant work`、`device local`のproject reference、資料grant、保存領域を分離する。これは新しい認証schemaの実装済み表示ではなく、移行時の必須条件である。

一般利用者は自分の案件を同じJennifer体験で扱う。内部taskのIDや公開説明を参照できても、そのtaskを操作できるとは限らない。owner・realm・操作scopeをserverが再検査し、本文のownerやproject名を認証根拠にしない。

## 2. 一つの成果に至る証拠の連鎖

到達契約で照合する順は次のとおり。矢印は権限の移譲ではなく、serverが保持する参照関係である。

**認証owner + realm → root WorkJob / AMC Goal ID・revision → leaf → worker / reviewer別の子WorkJob → delegation・remote task → 実保存artifact ID・hash・schema・producer → usage Receipt / review → ownerの最終受入**

root WorkJobとAMC Goalは別のIDを持ち得るため、対応を明示保存する。root、leaf、子仕事、delegation、artifactを同じ文字列の使い回しで結び付けない。IDは型とnamespaceを持ち、未接続の参照や別rootへの付け替えを拒否する。

参照関係、owner、realm、role、依存合格、revision、停止fence、grant、見積、期限はserverが保存済み行をjoinして検査する。UIのhidden field、modelのJSON、計画の要約hashを仕事のidentityや実行可否に使わない。hashは内容の同一性を確かめる証拠で、認証・所有権の代わりではない。

同じoperation IDは同じowner・対象・payloadにだけ再利用できる。保存応答喪失でも新しい子仕事や予約を作らず、同じIDの結果を照合する。送信や確定に進む判定は一意制約とrevision/CASで競合させ、一回の成功だけを記録する。

rootの版変更は依存する計画・grant・承認の有効性を再判定する。参照が揃う前にleafをreadyへ投影せず、modelやclientが送ったready値を採用しない。参照関係と実行準備の保存が途中で失敗した場合も、送信前に保存済み連鎖から再判定する。

論理的な返却先`reports/result.md`、Agentの「保存しました」、外部URLは、実fileが存在する証拠ではない。実際に受信・検査・保存したbytesからartifact hashを計算し、schema、producer、元入力、版、truncationの有無へ結ぶ。

現行[A2A artifact](../../lib/a2a-artifacts.ts)は正規化textを有限サイズで扱い、file URIや外部bytesを自動取得しない。省略・切詰めがあれば表示し、完全fileの検収に流用しない。binaryや外部file取得はgrant・上限・schema・保管・hashを持つ別adapterの受入後に行う。

## 3. 状態は別々の台帳から投影する

親WorkJobは[`lib/workflow.ts`](../../lib/workflow.ts)の**`active / review / completed / cancelled`の四状態**だけを使う。下書き、承認待ち、送信中、請求確認中、削除中を第五のWorkJob状態として追加しない。

AMCはGoal確認、依存準備、担当提出、検収、owner受入を扱う。A2Aはdispatch、remote進捗、結果不明、取消要求と確認を扱う。金融は予約、usage照合、請求、決済、返金を扱う。reviewとデータ削除もそれぞれ別の状態を持つ。

画面は「仕事は完了、費用は照合中」「仕事は取消、外部停止は未確認」のように必要な状態を併記する。remote完了、artifact受領、review合格、owner受入、金融閉鎖は同じ事象ではない。

現在の[A2A parent controller](../../lib/a2a-parent-controller.ts)は保存済み子処理・予算から表示を導く。到達設計でもこの方向を維持し、Jenniferの自然文で保存済み状態を書き換えない。

## 4. 全実行を含む予算の階層

到達階層は**accountの請求期間 → 任意のGoal予算 → leaf Job → delegation**。worker、reviewer、直接LLM、複数端末、host appからの有料実行を同じaccount期間へ含める。Goalを使わない直接実行もaccount上限を経由する。

各階層は、その階層を通る支出の制約を持つ。子の上限を許可しても親の上限を増やさない。親と子の予約をaccount合計へ二重加算せず、最小の支出operationを一度だけ集計して各祖先の残枠を検査する。

各上限について、同じ通貨・期間・価格policyの最小通貨単位で次を満たす。

**C（照合済みの顧客usage額） + R（未解決処理の残余最大額） + N（新規処理の最大額） ≤ L（本人承認済み上限）**

C、R、Nは重ならない集合とする。usageの一部をCへ確定する時、同じoperationのRを同額だけ減らす更新を原子的に行う。全額holdと確定usageを両方足さない。未照合のlive meterは観測値として示し、Rから勝手に差し引かない。

最終Receiptと取消確認が揃えば不要なRを解放する。送信後のtimeout・取消不明では残余最大額を保持する。未解決の古いholdを消して新しい実行を許可しない。料金・上限を改定しても実行中の見積を黙って変更しない。

Receiptの重複受信は同じProvider event / delegationへの既存確定を返し、Cを増やさない。署名が正しくても別owner・remote task・価格版・通貨へのReceiptは拒否する。照合に失敗した明細を親合計へ混ぜず、保留額と理由を残す。

workerとreviewerは別delegationでも同じGoal/accountに含める。review費用を依頼の完成に必要な費用から隠さず、開始前に見積へ含める。予約確認とdispatchの間に別clientが残枠を使った場合は再判定する。

**現行gap**：[A2A store](../../lib/a2a-delegation-store.ts)のpoolは`ownerUserId + parentJobId`単位である。account請求期間・複数root・Goalを横断する上限強制は実装済みではない。上記階層をschema・adapter・同時予約試験で受け入れるまで「全端末の月上限を保証」と表示しない。

請求期間の開始・終了、timezone、期間をまたぐusage/holdの帰属、遅延Receiptの扱いはpaid開始前に決める。月が変わっただけで未解決holdや債務を消さない。異通貨は確定したFX参照・版・時点・端数処理で同じ予算通貨へ換算し、単位の違う整数を足さない。

## 5. 後払い、Provider資金、価格を混ぜない

到達設計の`PaymentAuthorization`は、本人の後払い同意、登録決済手段、請求条件、許可限度、失効を確認する契約である。消費者のstored balanceを新設せず、budget reservationを入金残高や前払金として表示しない。

運営者がProviderへ支払える資金・契約・quotaは別の条件である。顧客の後払い許可でProvider資金を自動生成しない。Providerの資金不足、顧客の承認不足、budget不足は別理由で実行を止める。

**現行gap**：paid dispatchにはfunded Walletを必要とするgateが残る。後払いadapterのADR、PaymentAuthorization、顧客usage予約、meter、請求/返金/失敗復旧の受入までgateを維持する。文書の「残高なし」だけで既存gateを解除しない。

見積はProvider / model / Tool版、rate card、policy版、pass対象・quota割当、通貨、最大量、顧客負担額、期限を固定する。後の価格改定は新しい見積へ反映し、承認済み実行のsnapshotを上書きしない。

現行方針の**si従量上乗せ30%**は対象usageの価格計算、**Sky Tool売上手数料10%**は作者との売上配分、**しきい値1,000円**は請求triggerである。1,000円を本人の予算許可にせず、同じ明細へ30%と10%を無条件に二重適用しない。

passの対象範囲・quotaは見積で固定し、並列処理が同じquotaを重複消費しないよう予約する。quota適用後の顧客額とProvider原価は別に残す。passを無制限実行や無制限費用補填として扱わない。

税、手数料対象額、通貨、丸め順、FX、請求期間、passと従量の境界の未決条件はpaid開始前にOWNERと外部担当が確定する。この章で新料金・税務policyを作らない。[アカウント方針](../account-entry-proposal.md)と[Sky課金](../sky-billing.md)へ決定と受入を残す。

## 6. 停止・解約・完了は別の作用

親Goal / Jobの取消を保存すると、到達設計では新leafの作成・予約・dispatchをfenceする。既存leafを取消する途中でも新しい枝を増やさない。取消と送信が競合する時は、serverの最終判定でどちらが先に確定したかを記録する。

まだ送信していない予約は、送信不能を確認して解放する。送信済みは取消を一回要求し、remote taskを照合する。取消不明ならholdを残し、「停止済み」と表示しない。停止前の確定usageと請求債務は残る。

仕事の`completed` / `cancelled`だけで金融台帳を閉じない。遅いReceipt、請求失敗、返金、外部取消不能を同じoperationへ戻して照合する。再開時も新しい本人承認と残予算確認を経る。

自動更新offは将来のpass更新を止める。上限0は新しい有料実行を止める。回線解約は通信契約を止める。本文削除は指定データを消す。四つの操作を一つの「全部やめる」副作用にせず、対象・効力時点・残る費用を説明する。

## 7. 独立検収の真正性

`manual_owner_acceptance`はownerが成果を読んで合否を記録した証拠、`verified_independent_review`は別reviewerの真正な成果をserverが相関検証した証拠とする。これは到達分類で、現行API fieldの実装済み表示ではない。

branchのWorkbenchには全criteriaをownerが確認したbooleanの経路がある。[同branchのAMC API](https://github.com/k999ln/rock/blob/d0151e892794066e1a59b5e4d1dc8863e314947f/app/api/amc/route.ts)は、認証済みA2A reviewer artifact / usageを横断照合していない。画面の合否入力、別delegationの存在、reviewer名だけで独立review合格にしない。

到達gateは、owner / realm、Goal ID / revision、leaf、role、別Agent identity、worker対象artifact ID / hash / schema / producer、reviewer delegation / task / artifact、認証済み判定、署名済みReceiptをserverで照合する。同じAgentを表示名だけ変えたreviewerへ割り当てない。

reviewは固定版criteriaごとの判定と証拠を持つ。hash違い、別leaf、欠落criteria、未完remote task、欠落Receipt、失効grantでは受入を保留する。成果やcriteriaの編集後に旧合格を移植しない。

reviewerへの入力は対象artifactの固定版と必要資料のgrantだけに絞る。workerが返した「合格」「別担当検証済み」という文言を検収命令に使わず、reviewer自身の受信証拠とcriteria判定を取得する。

独立reviewに合格してもownerの最終Goal受入は残る。ownerの最終受入は本人の判断であり、不足した独立証拠を遡って真正化する作用ではない。金融照合や外部納品受領も別に残る。

## 8. 下書き・保存・削除・復旧の棚卸し

Jennifer branchの会話は最大8 session・24 message・10分TTLのsessionStorage境界を持つ。これは本人が明示保存したAMC Goalの寿命ではない。会話TTLの満了だけでD1のGoalやusage Receiptを削除したとは表示しない。

到達設計では、会話下書き、保存済みGoal/Job、選択素材、artifact、公開コード、接続credential、usage/金融記録、backupを別data classとして棚卸しする。各classにowner / realm、保存先、目的、共有先、保持条件、削除手順、復旧条件を付ける。

資料を担当へ渡すgrantはrecipient、scope、対象ID / hash / version、期限、失効、再送可否を固定する。既定アクセスはnone。project担当profileや「本人の選択データ」という計画文から全資料へのアクセスを与えない。

host appへの成果表示も同じgrantでrecipientとschemaを検査する。表示、外部送信、公開、機器作用は別scope。別originで読めたことを書込や再公開の許可にしない。URLに原稿・tokenを入れない。

**現行gap**：汎用AMC Goal DELETEと汎用artifact TTLは未提供である。保持日数、法務上必要な記録、外部Providerの削除可否を決め、API・worker・readbackを受け入れるまでは自動消去を約束しない。既存の特定Tool削除やA2A入力expiryを全dataへ一般化しない。

到達削除は認証とrevisionを確認し、対象data classを指定したtombstone / deletion journalを持つ。本文消去、参照の失効、会計記録の最小保持、外部削除要求の未確認を区別する。仕事取消を本文削除へ代用しない。

削除開始後は対象への新grantをfenceし、実行中の外部送信は個別に停止・照合する。既に外部へ渡した資料をローカル消去だけで回収済みと表示しない。保持すべき監査・債務の根拠まで消すかは確定したdata class契約で判断する。

backup復旧はdeletion journalを再適用し、削除した本文を復活させない。未知schemaは初期化せず隔離する。暗号鍵喪失・破損backupは「復号不可」「復旧未確認」と表示し、空の正常データや削除成功へ読み替えない。これらは未実装部分を含む受入条件である。

## 9. 一つの仕事に一つの実行authority

到達契約では各jobに一つのexecution authorityと単調増加epochを持つ。複数clientは同じ仕事を表示・照合できるが、それだけで実行authorityを移管しない。revisionは保存競合、epochは実行者交代のfenceとして役割を分ける。

cloud controllerは自分に明示委任された子仕事を実行する。local jobの全権や他の子仕事を継承しない。旧device、旧epoch、失効credentialのwriterは新しい状態を確定できず、遅延結果は照合用の証拠としてだけ受け取る。

handoffは元実行者の停止/引継ぎ確認、writer fence、保存状態、recipient grant、新しい送信先と費用への本人同意、予算の再確認を経る。停止確認不能なら自動的に別端末で同じ処理を始めない。

`AI05`の単一authority deviceは[LLM境界](../llm-evaluation-architecture.md)を維持する。上述epochとrealm/protocolの共通強制は移植と受入が必要で、Web・Android・Linux間の任意handoffが実装済みとは扱わない。

transportを変える時はprotocol / capability / schema版を交渉し、互換性のない状態を黙って変換しない。model、署名、接続成功だけでadapter適合を証明せず、同じfixture・owner分離・停止・復旧を対象runtimeで受け入れる。

## 10. 機器・実行場所の適合を保持する

Miniのローカルaccountと基本操作・保存・停止はcloud accountに依存しない。cloud利用へは本人の明示linkで接続し、ローカル本人候補をcloudの強い認証へ代用しない。link解除でローカル成果を勝手に消さない。

Mini LTEは本人のcloud制御・Agent・音声用の到達設計とし、モデルや大量素材などbulk転送はWi-Fiの経路へ分ける。回線option、許容量、性能、費用、圏外復旧は[Mini通信](../avocado-mini-cellular.md)と実機で受け入れる。LTE接続成功だけで無制限転送や裸眼表示の完成にしない。

Proのprivate NVIDIA計算、契約済みcloud Provider、Android arm64の公開/合成text向けGridは別execution realmとadapterである。データclass、model/runtime、schema、権利、価格、停止・Receiptの互換を検査し、条件が変わるfallbackを自動承認しない。

Gridへ秘密・個人情報・任意codeを送らず、現行test creditsのhold previewを実請求・払出しにしない。[Compute Grid](../sky-compute-grid.md)の供給条件と独立結果照合を保持する。Proで動く処理をGridでも動くと推定しない。

rocketstarの接続は観測・engineering成果・整備記録の照合までとする。telemetry到達やAgent応答はcommandの実行証拠ではない。管制command planeと独立飛行安全系へ一般Tool権限を接続しない。[製品profile](03-product-profiles.md)の工学gateを維持する。

## 11. 横断受入の12シナリオ

以下は実装時の合格条件であり、今回実行した試験結果ではない。合否には対象source SHA、DB migration、owner / realm、各ID、入力/成果hash、operation、予算差分、保存readbackを付ける。合成・sandbox・公開本人・実機を別証拠にする。

1. **別ownerと内部project**：owner BがAのrootを子仕事のparentへ指定し、一般tenantが内部portfolio taskへ書込を要求する。どちらもserverが拒否し、Aの素材や内部秘密を返さず、子・予約・dispatchが0件である。

2. **兄弟仕事と全経路の上限**：worker、reviewer、直接LLMを別端末から同時開始し、合計がaccount / Goal上限を超える。原子的に許容分だけ予約され、各祖先でC+R+N≤L、二重計上なしとなる。現行parent単位の試験だけでは合格にしない。

3. **期間境界と異通貨**：未解決holdを持ったまま請求期間が変わり、旧期間usageのReceiptが遅れて届く。旧予約・債務を消さず、確定した帰属/FX/丸めpolicyで照合し、未確定policyなら新paid実行を保留する。

4. **後払いとProvider資金**：顧客PaymentAuthorizationがあってもProvider資金がない、または逆の条件で開始する。別理由で拒否し、stored consumer balanceを生成せず、未受入postpay adapterでfunded-wallet gateを回避しない。

5. **親取消と送信の競合**：同時に新leafを送信・親を取消する。取消確定後の新dispatchは0件。送信前予約は解放、送信済み取消不明の残余holdは保持、既発生usageは債務へ残る。

6. **review偽装**：同じAgent、別leafの成果、改訂前hash、欠落criteria、ownerの合格booleanだけをreviewとして送る。verified independent reviewへ昇格せず、真正な別reviewer artifact / Receiptの相関が揃ってから受け入れる。

7. **下書きTTLと保存Goal**：会話を期限切れにし、同じownerの保存済みAMC Goalを再取得する。下書きとGoalの寿命を混同せず、別ownerへの復元は拒否する。削除未提供classを「自動消去済み」と表示しない。

8. **削除とbackup復旧**：本文を明示削除してから旧backupを復元する。journalで本文の復活を防ぎ、必要最小の金融記録は定めた保持契約で残す。鍵喪失時は復号不可を返し、完了を装わない。

9. **accountなしMini**：cloud未link・圏外でローカル操作、停止、保存、再起動を行う。cloudへ送信せずローカル状態が復元する。後のcloud linkは強い本人確認・対象選択を経て行い、全保存内容を自動uploadしない。

10. **authority交代と遅延writer**：端末Aからcloud子仕事へ明示handoffし、旧epochのAと新controllerが同時更新する。旧writerをfenceし、許可された子だけが実行する。移管確認不能なら同じ作用を重複開始しない。

11. **実行realmとprotocol差**：Pro privateの素材をGridへfallbackさせ、非対応artifact schemaをhost appへ渡そうとする。送信前に拒否し、新しい適合adapter・grant・費用承認がない限り経路を変えない。file URIを実file証拠にしない。

12. **非金融Gameとrocketstar**：Gameの保存/再開を金融未完成のまま受け入れ、ポイントを実資金へ交換しようとする要求は拒否する。rocketstar telemetryから一般Agentがcommandを要求してもcommand planeへ渡らず、観測証拠と管制を区別する。

実装順はrealm/ID相関 → 状態投影と取消fence → 予算/価格/PaymentAuthorization → review証拠 → grant/削除/復旧 → authority移管/機器適合とする。各変更で既存workflowと対象fixtureを再利用し、[実現順と受入](04-delivery-and-acceptance.md)へ不足・担当・結果を残す。

検証入口は既存workflow / A2A / AMC / owner保存・復旧の対象試験、`npm run design:check`、`npm run verify`。未実装条件は新しい失敗系試験と同じ変更で具体化し、文書の整合だけをruntime合格にしない。
