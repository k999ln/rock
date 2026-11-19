# Sky統合マーケット・API/MCP受信・Eve連携の開発実行プロンプト

作成: 2026-10-21（America/New_York）。主担当は Sky / MCP の ROCK。対象は HOME01・WEB04・SKY12・SKY14・SKY15・SKY20・SKY21、連携は SIM01・BIL02・OS10・UXRS01。参照する本人の発言は[「RockstarOSを再設計」](codex://threads/01a14d54-daee-7c30-87a8-faea84641a40)。この文書は**実装担当への作業指示**であり、保存だけで runtime、外部接続、実課金、一般公開の合格にはならない。

## 達成する体験

RockstarOSを本人・利用権・権限・予算・保存/復旧の共通基盤とし、その中のSkyを**投稿から能力を発見し、Model・Agent・Tool・外部API/MCPを追加・接続する市場**、Eve（旧Zema）を**依頼・承認・進捗・停止・成果・費用を扱う仕事窓口**として、一つの本人用体験へ接続する。Skyで投稿やHugging Faceの公開metadataから能力を探す→出所・版・license・適合・権限・料金を比較→Add→担当と使用LLM/実行先を選ぶ→Eveで一件の仕事と費用上限を確認→許可されたLinux/PC/Providerだけが処理→本人が実成果と明細を読み戻す。Home全体が投稿型のSky入口であり、別の静的な商品一覧だけで体験を終えない。Wallet/Marketは必要な人がSkyから追加し、表示用Addで送金・購入・取引を始めない。端末を閉じても受領済みの仕事だけが承認済みの権限・予算・期限内で進み、通信断では可能なローカル処理と外部作用の待機を分ける。「Run to Earn」はWorld/Agentの稼働時間だけでなく、検収された成果と実収納に結び付ける。

参照チャットの確定した順序を守る。2026-10-18の「悩みから作る実用Agent・何にでもAdd・作者の導入と収益化」、2026-10-20の「Hugging Face型の登録→Add→専用Linux実行→月次請求→作者配分」「OSの中にSky・Eve・Linux」「Sky担当のLLM選択とEve成果」「HomeとSkyを統合」、2026-10-21の「Home全体を投稿型」「Xの実投稿を望むが、Skyは外部API/MCPの**受け皿**」を反映する。Xは外部投稿源の一例であり、X専用API契約を全利用者の必須入口にしない。MCP接続だけでXの取得権・無料枠・X自身のFor Youが成立すると表示しない。本人に個別のX developer登録/API代を要求しない。実供給元、本人認可、費用条件が未確定なら未接続と明示し、合成投稿やSky独自推薦をXの実投稿と呼ばない。

既存の月額**16 USD・一定のAI/Linux枠付き・超過分だけ事前単価/上限内で従量**という方針を維持する。枠の数量/対象/超過単価/繰越は未確定なので、本番契約を有効化しない。HF公開検索/参照AddのSky料金0、既存作者有料販売の自社手数料10%、外部実費、通信料、OS基本料、Cloud従量を別に示す。本人の「そこで利益を取らない」はHF検索/追加を指し、作者販売10%を0%に変更する確定指示ではない。未払いでは新規実行/leaseを止め、本人の設定・成果・請求閲覧・持出しを残し、支払と利用権の復旧後に同じデータから再開する。eSIMはサービス利用権の入口で、Sky/Eve/Linux binaryをSIMへ格納する前提にしない。標準は既存OS client/browserから共通RockstarOS環境へ接続し、Pixel native OSは別の実機gateで扱う。

## 着手前の読戻しと作業木保護

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`の順に読み、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/02-sky-mcp.md`で担当とtask IDを固定する。製品階層は`docs/rockstaros-design-portal.md`、OSは`docs/rockstaros-complete-design.md`、Tool/市場は`docs/sky-tools-complete-design.md`、請求は`docs/sky-billing.md`、現状の優先順位は`docs/design-implementation-alignment-20260909.md`と`data/project-status.json.phaseGates`を正本にする。`docs/execution-approval-20260909.md`と`data/execution-approval.json`の承認済み範囲を読み、v1.1実装の再承認で止まらない。
2. `docs/prompt-playbook.md`に従って`npm run prompt:context`または同等の読取りを再実行し、GitHub main・実在作業branch・PR・各同一SHAのCIを更新する。`git status --short --branch`で共有checkoutのdirty差分を保護し、reset/強制上書きしない。mainの引継ぎ入口・migration・優先順位がbranchへ未反映なら、それを最初に同期する。現在mainの機能を古いbranchの欠落から新規開発しない。文書保存、branch commit/push、main統合、配備を別々に記録する。
3. 作成時のGitHub読戻し: main `01b6aecd8b4d8bd2385665232dfb4b57029f991f`の同一SHAで`verify`と5つのsecurity/repair check成功。`codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`には`source-preparation`一件の成功だけで、全CI成功とはしない。関連PR #57・#147・#160・#167・#169はmerged、#130はopen。対象branchのopen PRはない。ローカルHEADは対象branch SHA、共有作業木には多数の未保存差分がある。`npm run prompt:context`はexit 2、GitHub connectorでref/PR/CIを読戻した。実行時にrefが変わればそのSHAを優先する。

## 現在の実装と、残る差分

| ID | 読むsource・現在の証拠 | 原因と修正順 | 合格証拠・未解決条件 |
| --- | --- | --- | --- |
| SKY-I01 投稿型入口と発見 | `components/home-screen.tsx`、`components/sky-social-timeline.tsx`、`components/sky-information-market.tsx`、`lib/sky-huggingface.ts`、`lib/sky-hub.ts`。HF公開検索→Qwen reference Add→Eve下書きと導入済みQwen担当の実応答はlocal UIで限定受入。 | 投稿・HF reference・審査済み商品を共通の出所/版/状態で表示し、同じownerのAdd→設定→Eveへ渡す。既存Homeの本人別保存とXと異なる色/狭幅操作を維持。HF referenceを自動install/実行成功へ昇格させない。 | 実browserで投稿→比較→Add→担当設定→Eve下書き、戻る/再読込/別owner/CAS/失効。既存local受入を再検証し、外部providerやPixelへ転用しない。 |
| SKY-I02 外部投稿の受信 | `lib/sky-timeline-provider.ts`、`components/sky-timeline-connector.tsx`、`toolkits/sky-mcp-connector/server.mjs`。`sky_timeline_read`の固定schemaとPC connector fixtureはある。実X供給元は未接続。 | SkyをAPI/MCP受信口とし、接続先の本人認可・feed・投稿出所・料金申告を表示。既存のinitialize→能力交渉→tools/list→Passport→prepare→単回承認→tools/call→結果照合を使い、`sky.timeline.v1`を検証する。失効・期限・旧応答を消し、未接続では空の実投稿を作らない。 | local SDK toolで無承認拒否/承認一回/型・owner・時刻・危険URL拒否。Provider sandboxでは本人認可→実本文→更新→停止→再接続を同一sourceで検証。XのFor Youと接続先独自のおすすめを区別。実供給元/条件がなければ未受入。 |
| SKY-I03 市場の商品・作者導入 | `lib/sky-tool-package.ts`、`lib/sky-tool-review.ts`、`components/sky-marketplace.tsx`、`toolkits/sky-tool-sdk`、`docs/prompts/sky-marketplace-mcp-development.md`。既存Package/Registry/Studio/CommerceがあるがModel・Agent・Toolの登録から更新/解除まで共通縦断は未受入。 | 既存ID/版/購入権を保ったまま作者identity、配布元、license、依存、署名/hash、入出力、scope、価格、実行先、審査/sandbox/公開範囲/失効を結ぶ。更新は新しい版として審査し、削除は既存購入権・仕事receiptを消さず非公開/失効状態として残す。署名は作者の同一性で安全保証にしない。SDK sampleと診断を動く商品一件へ結ぶ。 | 作者の登録/審査/公開/版更新/失効、利用者の検索/比較/Add/解除、依存欠落/hash不一致/旧版/他人拒否。導入時間・成功率・復旧時間を計測。未知作者code、任意shell/root、OS platform鍵による第三者署名を導入しない。 |
| SKY-I04 担当と実行先 | `lib/sky-agent-library.ts`、`components/sky-agent-library.tsx`、`lib/sky-linux-service.ts`、`toolkits/sky-linux-service`。本人の担当/LLM設定とlocal実応答、Linux serviceのsource/fixtureはある。 | Add済みTool・本人作成担当・model版をowner/revisionで管理し、対応model/実行先/容量/license/料金を比較。既存Pixel/PC/管理Linux/Cloudの実行adapterとgateを分ける。選択・ready・実推論を別状態にする。 | 本人のLLM選択→保存/読戻し→Eveの同じ担当・モデル版で実応答/停止。管理Linuxは同一契約のsandbox、Pixelは同一APK/image実機、Cloudは実Providerでそれぞれ別受入。 |
| SKY-I05 Eve仕事・結果・退出 | `lib/workflow.ts`、Eve API/画面、`lib/sky-commerce.ts`、既存receipt/usage/export。Add、Eve下書き、購入、実行、成果は別の権限境界。 | Sky選択のID/版/Passport/必要scope/費用を同一owner/job/revisionの未承認Eve下書きへ渡す。Brokerが資格・予算・実行先を再照合してからdispatch。成功/失敗/部分成功/結果不明/取消を別表示し、停止要求と停止確認を分ける。成果とusageを本人別に保存・持出し/独立読戻しする。 | **Addだけなら購入0/実行0**。一回承認した仕事だけ実Tool結果/receiptがEveへ戻る。timeout後の盲目的再送0、別owner読取0、scope/接続先変更時再承認、停止後の新規作用0。Provider照会APIがなければ結果不明を保持。 |
| SKY-I06 料金・契約・作者配分 | `lib/sky-linux-billing.ts`、`lib/sky-linux-payment-handler.ts`、`lib/sky-commerce.ts`、`docs/sky-billing.md`。月額/枠付き契約は設計とlocal source、実issuer・Linux production・Stripe sandbox/実収納・作者払出しは未受入。 | 商品価格/外部実費/Rock料金、AI token/Linux CPUのmeter、見積/予約/確定usage、枠控除、月次invoice、未払い停止/復帰を既存台帳へ接続。価格版と上限を実行前に固定し、同じ使用の二重計上を防ぐ。検証済み正味収入からだけ既存上限/分配契約を適用。 | fixtureで上限超過拒否/二重課金0/未払い停止/データ保持/復帰/返金・異議照合。枠数量・超過単価・issuer/収納/作者KYC未決の間は本番販売・実課金・送金・chain公開を有効化しない。 |

## 実装順と検収

1. **差分保全と基準**: 既存テストを変更前に記録し、main/branch/localの採用sourceとmigrationを明示する。`data/rockstaros-research-reconciliation.json`の87件照合とRQ01〜RQ49を保持し、新しい発言を古いRQの排他表現で取り消さない。
2. **最初の代表一周**: 既にあるHF reference Add→担当/LLM保存→Eve実応答を同一版で回帰し、審査済み無料Tool一件のPC MCP接続→Add→Passport→Eveカードで入力/費用0/実行先確認→Broker単回承認→実Tool結果→本人保存/読戻し→失効をつなぐ。既存Webの仕事は`lib/workflow.ts`を通す。画面遷移だけやモデルの「できました」をTool成功へ数えない。
3. **外部接続と異常系**: 提供者MCPのOAuth/期限/再接続/解除をsandboxで一件検証し、PC・Sky Cloud・Providerを実行先ごとに表示する。Cloud未受入は「準備中」。外部投稿は供給元が実在するとき同じ接続先で本人認可/実本文を照合し、未提供なら未接続を残す。X専用APIの有料契約は料金/権利/供給元の選定なしに開始しない。
4. **管理Linuxと請求**: SKY-I04/06を同一owner/契約/仕事/receiptへつなぐ。最初の月額版・枠・超過単価・issuer/Stripe条件を契約として固定できるまでは有料実行を閉じ、fixtureとProvider sandboxで状態遷移を検証する。Pixel端末内Linuxの限定受入、管理Cloud Linux、native OS全体、一般公開を分ける。
5. **作者と利用者の完成度**: SDK sample→審査→sandbox→公開/失効の実測と、発見→Add→Eve成果までの所要時間/成功率/停止からの復旧時間を記録する。作者へは利用集計と検証済み収益/配分状態、利用者へは元成果と項目別使用額を本人権限で示す。未検証の市場首位・収益・本番安全を宣言しない。

変更箇所の試験を先に走らせる: `node --experimental-strip-types --test tests/sky-hub.test.mjs tests/sky-agent-library.test.mjs tests/sky-marketplace.test.mjs tests/sky-tool-package.test.mjs tests/mcp-connector.test.mjs tests/sky-timeline-provider.test.mjs tests/sky-linux-service.test.mjs tests/sky-commerce.test.mjs tests/workflow.test.mjs`。対応するAPI/DB/請求/SDK試験、実Sky UI、`npm run typecheck`、`npm run design:check`、`npm run baseline:check`、`npm run project:update`、`npm run project:check`、`npm run verify`を続ける。macOSで署名試験がOpenSSL 3を要求する場合は`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH`で再実行し、localhostの権限制限や共有dirty tree由来の失敗を成功へ換算しない。合格したhost/fixture/Provider sandbox/実機/本番を同一source SHA・artifact・receiptとともに別々に記録する。

OS componentまたはSky catalog Toolを変更したら`data/design-document-index.json`とOS/Tool詳細設計を同じ変更で更新し、`npm run design:check`を通す。利用方法を変えたらREADME本文も同期する。作業の着手・判断変更・検証完了で`project.md`と`data/project-status.json`を更新する。秘密値、本人原稿、OS image、重複した大量logをGitに入れない。実機書込み/OS署名鍵/公開/サービス契約の未指定条件は別gateとして残す。最後にSKY-I01〜06の各項目へ、原因、変更path、対象SHA、修正/未修正、検証コマンド/結果、受入段階、残る外部条件、次の一手を記入し、RQ01〜RQ49、QEMU RQ12、ゲーム交換RQ13、作者SDK RQ14、ATM自社手数料0のRQ15を落としていないか点検する。
