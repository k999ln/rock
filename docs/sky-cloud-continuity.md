# Sky Cloud — 端末切断中の継続実行

2026-09-30、利用者は「クラウドのAIは、先に頼まれた仕事を続ける」を採用し、その準備を指示した。本書は次の開発の必須契約・受入条件。**この変更は要件と試験計画の準備であり、クラウド配備・LLM実行・停止・課金制御の実装完了を示さない。**

主担当はSky / MCPのROCK、既存SKY07に関連する。既存のSky Package、Zema、Broker、Walletの契約を再利用する。eSIMは接続と導入の入口で、クラウドのジョブ所有者は認証済みアカウント。eSIM交換・端末変更・複数端末で仕事や費用を重複させない。

## 利用体験

接続中に「この作業を、指定した上限まで、端末が圏外でも続ける」と依頼する。クラウド受付を確認した後は、端末を閉じても、圏外になっても、その範囲内で処理を続ける。再接続すると途中経過、成果、使用量を取得し、同じ仕事として再開する。

携帯が切断中に新しい指示・停止・承認をクラウドへ届けることはできない。クラウド自体と必要なProviderに通信経路があることが前提。端末内AIの仕事とは独立し、再接続時に差分を照合する。端末内処理で代替した仕事をクラウドにも自動投入しない。

## 受付時に固定する契約

- 認証済みowner、job ID、一意な要求キー、入力と指示のhash、元のZema仕事ID。
- 明示された`continueWhileDeviceOffline`、承認ID、承認時刻、有効期限。設定をLLMの推測やeSIM開通から付与しない。
- Tool / agent / model / MCPのID、版、必要なhash、送信先、許可されたデータ範囲・操作。
- 通貨と単価版、合計予算上限、実行期限、最大手順数、最大model token、再試行回数、同時実行数。
- 外部書込み等に必要な個別承認。新たな権限・費用増・未知の送信先は自動承認しない。
- 停止に要する費用の予約、クラウドやモデル側で強制できる制限と、その限界。

クラウド側の永続保存後に受付receiptを返す。receiptは完了ではない。受付応答が失われたら、同じownerと要求キーでstatusを照合する。同じキーで入力hashが違う要求は拒否する。結果不明を新しいキーで再投入しない。

## 制御と保存

1. 受付・認可・予算予約・ジョブ状態を、端末接続とは独立したクラウドcontrollerに保存する。ブラウザや携帯プロセスをschedulerにしない。
2. エージェントはworkerで実行する。生成コードは別の隔離環境で動かし、モデルや第三者Toolへ包括的な認証情報を渡さない。
3. LLM/API/MCPの各手順の前に、認可の有効性、deadline、予算予約、停止要求、必要な承認を再確認する。並列子エージェントは親の共通予算から原子的に予約する。
4. 指示、作業状態、結果のhash、実行先ID、費用予約、観測した利用量、確定した利用量を永続化する。請求確定は別状態とする。
5. 未実行のqueuedは復旧可能。dispatch後に結果不明となった処理はindeterminateとし、Provider照合まで再実行しない。古いworkerの遅延完了と新workerの競合を防ぐ。
6. 権限の追加や承認が必要ならawaiting_approvalで待機し、待機中の計算資源を停止・休止する。単にLLMループを回し続けない。追加承認の対象を本人が確認してから再開する。

`systems/rock-star-os/os/runner/README.md`にあるowner/key/request hash、受付receipt、queued復旧、indeterminateの再送禁止を継承する。ただし既存runnerは有限recipe向けで、汎用LLMクラウド実行器とは扱わない。WebのZema仕事は`lib/workflow.ts`の業務状態を維持し、worker成功を本人確認済みcompletedへ直接置き換えない。

## 停止・制限と費用

- 端末内の停止要求は、未送信、クラウド受領済み、worker停止確認済みを区別する。
- queuedへの停止はdispatchを禁止する。runningへの停止はキャンセル意思を先に永続化し、新規手順を禁止し、実行adapterへ停止を要求する。
- 実行中の通信や隔離環境を停止するためのadapterと期限を用意する。DBの状態名を書き換えただけでは停止成功としない。
- 端末が圏外のままでもdeadlineと予約済み費用で自律停止できるようにする。Providerが応答しない場合は停止未確認・照合待ちを保持する。
- 「画面を閉じた」「端末が圏外」「停止を送った」「workerが止まった」「利用量が確定した」「請求が確定した」を別々に扱う。
- リアルタイム上限は自前の予約台帳とProvider制限で制御する。遅延する請求集計を上限判定の唯一の根拠にしない。既存Walletの予約・照合方式を再利用する。
- 通信費、LLM API費、cloud compute費、作者料金を分ける。架空の単価で実請求しない。停止後にも残る保存費等を明示する。

## 再接続と画面

再接続はまずstatus・receipt・差分の取得を行い、submitを繰り返さない。端末に保存した古い状態をクラウドの正本へ上書きしない。結果と入力revisionを照合し、ローカルで変更した原稿等と衝突する場合は両方を保持して解決する。外部送信・決済等はオフラインoutboxから無条件に再生しない。

画面には「クラウド受付確認済み」「最後に確認した時刻」「圏外のため最新状態は未確認」「追加承認待ち」「停止未確認」「停止確認済み」「使用量照合中」を区別して表示する。切断中は最終観測状態を示し、現在も実行中だと断定しない。

## 必須受入シナリオ（未実行）

1. 接続中に受付receiptを受け取り、端末を機内モード／アプリ終了にする。クラウド側で仕事が進み、再接続後に同じjob IDの成果が戻る。
2. 受付応答だけを落とす。同じキーで照合し、実行・予算予約が一回だけになる。
3. 別owner・別端末からの越境取得、停止、再開を拒否する。正当な同一ownerの複数端末では仕事を共有できる。
4. 接続中の停止と圏外中の停止を分けて試験する。圏外中には「停止済み」と表示しない。
5. 圏外のまま予算・時間・token・手順上限へ達する。新規処理の停止とProvider側の実停止／照合を確認する。
6. 複数子エージェントが同時に予約し、親の上限を二重使用しない。予測より実費が大きい場合も証拠を捨てず照合する。
7. 追加承認が必要な操作は待機する。待機中に計算が無制限継続しない。
8. controller/workerを再起動し、保存状態から復旧する。dispatch後の結果不明は自動再実行しない。
9. 停止と完了、古いworkerと新worker、利用量通知の重複／順序逆転が競合しても、外部処理と費用を二重計上しない。
10. 端末内で同じ文書を編集して再接続する。クラウド成果で勝手に上書きせず、revision衝突を扱う。
11. 回線・eSIMを交換しても、アカウントに結びついた受付済みの仕事と予算が重複しない。
12. ログ・保存物・エラーにeSIM設定コード、API key、アクセストークンが混入しない。

host fixture、Provider sandbox、実際のcloud worker、実機を別々に記録する。既存eSIM試験15件をこれらの合格数へ算入しない。

## 次の実装と契約準備

既存SKY07のcloud入口へ、上記の承認snapshotとreceiptを接続する。controllerの永続DB・queue、worker、成果storage、model API、MCPの認証を選定し、最小一件の仕事で縦断する。費用・契約・資格情報が必要な段階では、構成、具体的費用、停止手段、受入手順を揃える。

供給元候補・公開価格/制限・契約質問は[Provider contract readiness](provider-contract-readiness-20260930.md)に記録する。Cloudflareは既存D1/Workflow sourceとdurable controllerに使い、heavy inference/任意コードの実行は隔離した別runtime候補とする。価格は公開単価であり利用見積ではない。

現時点で新しいクラウド契約・配備・API呼出し・請求はない。契約前の実装・試験準備を進め、未契約を理由に独立した作業を止めない。実費が発生する契約・実行は、その対象・費用の確認後に行う。

2026-09-30 実装checkpoint：owner承認後の依頼本文をAES-256-GCMで暗号化してD1へ保存し、`services/sky-agent-runtime`にCloudflare Workflows、minutely prepared-task scanner、期限切れ本文cleanupを実装した。Workflowはdispatch marker前の失敗を`remote_failed`、marker後の結果不明を`indeterminate`へ分け、後者を自動再送しない。task status照合と一回cancel markerも実装し、terminal taskのtext artifactはowner/task/hashへ結び付けて暗号化保存し、成果capture前のtaskは再照合対象へ残す。owner-scoped artifact取得APIを追加した。これらの新しい成果経路はhost fixtureとtypecheck段階で、Provider result実受信は未試験。dry-runとisolated local D1/Workflowでは、cron手動起動→決定的Workflow instance作成→loopback targetの発見失敗→D1のpreflight failure記録を確認した。外部Provider送信はゼロ。Workflow bindingとstep retryの公式設定を参照：[Build your first Workflow](https://developers.cloudflare.com/workflows/get-started/guide/)、[Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/)。

このcheckpointは本番cloud継続を意味しない。runtime Workerがshared production D1・同一暗号secretへ未接続で、remote Agent Cardの実取得、A2A `message/send`成功、Providerでのtask polling／cancel結果／artifact受入、native Broker照合、Wallet使用量予約・照合、圏外実機受入も未実施。残る必須12シナリオを通すまでは完了表示しない。

## 衛星通信への拡張方針

2026-09-30、利用者は自社衛星を飛ばして通信範囲を広げる構想を示した。自社衛星網を長期の調査・設計対象にする。既存衛星回線の利用、自社衛星、地上gateway、携帯事業者との接続、周波数・対応modem、費用・可用性を別々に検討し、eSIMだけで任意端末を衛星対応としない。

RockstarOSの接続経路が地上回線から衛星に変わっても、受付済みjob IDと本人・予算を維持する。短い指示・停止要求・進捗・結果要約の優先転送を設計し、限られた回線で大容量モデルを無条件に取得しない。全ての回線を失っても、端末内AIと受付済みcloud作業の独立継続を維持する。

「どこでも」は目標であり、地下・屋内・遮蔽・提供地域外まで保証しない。衛星数と軌道は対象地域・可用性・速度・同時利用者・端末・予算から検討し、単一低軌道衛星の通過実験を常時接続としない。独自衛星の製造・打上げ・無線送信・運用契約や実接続は未実施。

既存の[衛星通信設計](avocado-mini-mini200-e1/game-first-life-connectivity.md)とrocketstar原本を参照するが、旧ハードウェア形状・打上げ能力・通信payload受入を継承しない。技術的参考は[AST SpaceMobile](https://ast-science.com/how-it-works/)と[Starlinkの直接通信説明](https://starlink.com/public-files/DIRECT_TO_CELL_FIRST_TEXT_UPDATE.pdf)。他社の技術実証はRockstarの受入証拠ではない。
