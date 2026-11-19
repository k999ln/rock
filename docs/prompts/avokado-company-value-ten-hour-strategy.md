# avokadoの企業価値を高める戦略 — 正味10時間の調査・思考プロンプト

作成: 2026-10-20（America/New_York）。これは**実行用プロンプト**であり、この保存だけで600分の調査、顧客検証、売上、企業評価額の算定、事業方針の変更を完了したことにはならない。

## 実行する担当への指示

あなたは`k999ln/rock`のBusiness Pilots主担当（`B02`・`B03`・`B05`・`B06`、`ROCK`）として、利用者の「avokadoでは特に会社の価値を上げる、戦略をとる」に答える。問いは**「限られた資金・時間・実装能力をどこへ集中すれば、顧客が繰り返し選ぶ価値、検証済みの採算、再利用できる資産、事業リスクの低減を最も確かな順に増やせるか」**である。見栄えのよい評価倍率や架空の売上ではなく、経営判断に使える優先順位と棄却条件を出す。

**正味600分**を、一次資料、現在のコードと証拠、顧客課題の代理調査、事業・費用の比較、反証、戦略の統合に使う。開始・中断・再開・終了の時刻と実働分を記録し、待機・ツール応答・休憩を加算しない。1回のセッションで終わらなければ同じ記録から再開する。600分未満で「10時間考えた」と報告しない。各60分前後で「正味何分／600分、読んだ根拠、変わった判断、次の比較」を短く残す。中断時は未完了の問いを明示する。

本調査は分析と計画まで。顧客や企業への連絡、広告購入、契約、課金・実送金、端末書込、公開Site変更、製造発注、main mergeをこのプロンプトから始めない。既存の設計v1.1実装承認を再確認待ちに戻さない。個別のOWNER・EXTERNAL・JOINT gateが必要な行動を具体化したうえで残す。

## 固定する製品・事業の境界

- 確定要望`RQ01〜RQ49`と、顧客向け主商品の物理SIM/eSIMを含むRockstarOS service access、単独Web/PWAでも使えるSky、仕事の窓口Eve（旧Zema）、透明なCloud usage、本人の見積・上限・停止・成果持出しを維持する。SIM/eSIMへOS binaryを保存する前提を置かない。サービス入口の選択と、回線開通・本人性・端末導入・Cloud実行・請求を別状態にする。
- 2026-10-20の本人方針「街や暮らしをもっと良くする」を事業目的に置き、建築・インテリア・サウンドと自然なITを地方創生の実案件へ結ぶ。Facebookを専門家と地域参加者の主要な対話インフラにする決定を保持する。対象地域・課題・専門家・会費・案件費用・放送契約は未決定であり、現時点で募集投稿、専用グループ、実案件の成果を受け入れていない。地域の便益と会社の収益を別に測り、片方だけをもう片方の実績へ換算しない。
- 2026-10-22の後続指示では、New York Cityは**初回対面開催地**であり、美術・建築の題材と協働先は地域非限定。案件所在地、最初の支払者、特定地区は未決定。NYCの制度・統計を他地域の案件へ転用しない。
- 本人が添付した「なくならない目的に取り組み、人が場所を使える状態をつくる」提案は、本人回答により**この10時間調査で検証する仮説**である。SIM/eSIMを中心とする確定商品方針やRQへ昇格させない。長期目的と最初の有料仕事を分け、施設運営者の修繕依頼→承認→完了確認→請求照合を、店主・所有者・CBO/BID・専門家・Sky単独の反復仕事と同条件で比較する。継続利用、予算決裁、直接費、専門家責任、既存代替が確認できなければ採用しない。添付中の国際機関への帰属は直接の一次資料を確認するまで未検証とする。
- avocadoMiniは空間・携行の物理候補、avocadoProはAI専用PC。Pixel 10 GL066／frankelのPhysical Device PreviewとQEMU Developer Preview、Game/作者SDKは独立の受入系列を保持する。Sky/Eve単独の価値検証を未完成hardware待ちにしない。
- 商品料金、通信料、AI使用料、外部実費、OSS/BYOKを混ぜない。2026-10-20に追加された月額16 USDの版付き基本料は設計上の契約であり、含有枠・超過単価・地域等と実請求は未確定/未受入。旧888 centsは現行一律月額へ転用しない。現行ToC収益料金の保留、対象契約の検証済み収益からの回収条件、Sky Market買い切り10%、ATM自社手数料0、ゲーム料金未定、同一契約複数端末の重複防止、実金融gateを正本どおり分ける。新しい価格や補助金を提案する場合は**仮説**と表示し、既存契約へ勝手に適用しない。
- 原稿・秘密・顧客情報を公開資料に入れない。外部比較の会社や市場データは出典・日付・母集団・定義を確認する。他社の成長率、評価倍率、商品価格をavokadoの実績へ換算しない。

## 着手時の事実監査

1. `AGENTS.md`、`docs/product-baseline.md`、`data/product-baseline.json`、`README.md`、`project.md`、`data/project-status.json`、`docs/workstreams/README.md`、`docs/workstreams/00-responsibility-boundaries.md`、`docs/workstreams/09-business-pilots.md`、`docs/prompt-playbook.md`を読む。戦略正本は`docs/rockstaros-1.0-strategy.md`、SIM商品は`docs/sim-led-product-architecture.md`、OS/Sky/Mini全体の入口は`docs/rockstaros-design-portal.md`。`docs/execution-approval-20260909.md`と`data/execution-approval.json`で承認範囲を確認する。`docs/design-implementation-alignment-20260909.md`は履歴として、現在の`phaseGates`と対象SHAを優先する。
2. `git status --short --branch`でdirty checkoutを保護し、`npm run prompt:context`またはGitHub connectorでmain・実在branch・関連PR・同一SHAのCIを取得する。取得失敗は「最新確認未了」とする。mainとbranchのベースがずれていれば、次の実装開始条件に引継ぎ入口・優先順位の同期を置く。調査のためにreset/強制pushしない。
3. 対象コードと同一artifactの証拠を読む。最低限、`lib/workflow.ts`、`lib/earning-bridge.ts`、`lib/sky-linux-billing.ts`、`lib/rockstar-service-setup-billing.ts`、`lib/esim-cloud-access.ts`、`app/api/earnings/receipts/route.ts`、`components/coconala-team-workspace.tsx`、`docs/evidence/sky-private-linux-deployment.json`、`docs/evidence/esim-cloud-access-local.json`、`docs/evidence/tool-earning-wallet-bridge-20260915.json`を確認し、各主張を実装・host/fixture・Pixel実機・provider sandbox・本番へ分ける。作業branchにない新しいmain機能は未実装と断定せず、mainにないbranch機能はmain配備済みと呼ばない。
4. `data/project-status.json`の`B02/B03/B05/B06/CSV00/BIL03/SIM01/MAT18`と`phaseGates`、`docs/workstreams/03-wallet-billing-providers.md`、`docs/workstreams/05-web-pwa-sites.md`、`docs/workstreams/11-material-invention-avocado-mini.md`、`docs/workstreams/09-business-pilots.md#地方創生とfacebook専門家コミュニティ`を照合する。公開済みの概念ページ、本人だけの実機試験、一般商品ローンチと有料顧客取引を区別する。

作成時の読み取りsnapshot: `npm run prompt:context`はGitHub取得を確定できずexit 2。GitHub connectorでmain `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`、このdirty checkoutのbranch `codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`を確認。main同一SHAの`Rock star verification`、Android、SPIDER関連は成功。branch同一SHAは`Phone source preparation (not OS boot)`一件成功で、全体CI成功の証拠ではない。関連open PR [#130](https://github.com/k999ln/rock/pull/130)は建築・インテリア・サウンドの方針回収（main未merge、head `3a805132c7d85c50ca76eb9de960c90b5b3e77da`）、[#147](https://github.com/k999ln/rock/pull/147)はSky会話図解Tool（main未merge、head `c9beacbfbb2c49f56ae80817c9aaba7b6097846b`）。このbranchをheadとするPRは検索で見つからなかった。これは作成時点のsnapshotであり、実行開始時に全ref・PR・CIを取り直す。

`data/product-baseline.json#auditInputs`の旧main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、旧native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、旧design `de5b102d3525daccf604efd5685bdf8c14ad5d50`は2026-09-09監査の履歴整合用であり、現在のGitHub refや同一SHA CIとして使わない。

## 600分の進め方

| 正味時間 | 行うこと | 必ず残す判断材料 |
| --- | --- | --- |
| 0〜45分 | 製品方針、source、branch/CI、受入gate、費用と収益の既存契約を固定する | 「実証」「限定受入」「仮説」「不明」の四列、作業上の制約、既存資産一覧 |
| 45〜120分 | 顧客課題を調べる。地域住民/物件所有者/自治体、建築・インテリア・サウンド/不動産の専門家、創作者/小規模事業者、Sky単独利用者を候補とし、地域の便益・直近の反復仕事・現行代替・支払者・使用者・導入障壁を比べる | 地域課題×関係者×仕事の表、少なくとも5件の厳しい反例、本人に聞く短い非誘導質問。未実施のインタビューを実施済みにしない |
| 120〜210分 | 代替手段と流通を調べる。既存AI/Agent、地域での専門家協業、業務ソフト、専門家の手作業、本人が選んだFacebook対話経路、SIM/eSIM/大学NFC/Web導線、Mini/Proの購入前関心を同条件で比較する | 住民と専門家が参加・再訪する理由、顧客が乗り換える/乗り換えない理由、最初の到達経路と獲得費用の未計測項目。Facebook参加数や商標/概念図だけを事業価値の証拠にしない |
| 210〜300分 | 事業モデルを検討する。サービス権、通信、Cloud usage、外部Tool、Mini/Proを分離し、入金、Provider費用、推論、決済、支援、返品/故障、開発資本をレンジで整理する | 仕事/顧客単位の売上・直接費・貢献額の式、ゼロ売上/低利用/高利用/障害のシナリオ、数値の出典と未取得値。架空ARRやLTVを作らない |
| 300〜390分 | 少なくとも4つの戦略案を同じ基準で比較する。例: (A) 一地域一課題の専門家コミュニティからSky/Eveの実仕事へ接続、(B) Sky/Eveの一業務Web pilot、(C) SIM/eSIM利用開始を先行、(D) Agent/Tool作者の流通と接続、(E) Mini/Pro hardware主導、必要なら非金融Gameや併用案 | 地域の便益と会社の顧客価値、初回提供までの時間、再利用資産、粗利余地、外部依存、安全/法務、資本需要、可逆性の比較。既存Facebook方針やサービス入口を廃止する案は方針変更として別記 |
| 390〜480分 | 優先一案と二番手、90日以内の検証順、流通、支援体制、投資の段階gateを設計する | `ROCK/EXTERNAL/JOINT/OWNER`別の担当、既存task ID、予算を要する条件、先に進む・修正する・停止する測定閾値の提案 |
| 480〜540分 | 独立の反証。顧客が戻らない、見積より推論費が高い、回線契約が遅れる、専門家責任が重い、公開Siteと実装branchが違う、Mini/Pro製造が遅延する等を試す | 各案を失敗させる観測事実、対策の費用、どの結論が変わるか。良い結果だけを分子へ入れない |
| 540〜600分 | 結論と引継ぎを作る。比較表の感度分析を行い、選んだ案が不明値で逆転する条件を示す | 1ページ経営判断、90日実験、残るOWNER判断、出典台帳、未解決と次の最小作業。正味600分の終了記録 |

一次資料を優先する。候補顧客・市場の数は公的統計と業界団体の原データ、競合機能/価格は提供者の公式ページ、技術費用は各Providerの現行価格・契約条件、実装はこのrepositoryと同一SHAのCIを確認する。[YCの顧客・継続の講義](https://www.ycombinator.com/library/dS-how-to-start-a-startup-building-product-talking-to-users-and-growing)、[StripeのSaaS指標定義](https://stripe.com/resources/more/essential-saas-metrics)、[米国Census BDS](https://www.census.gov/programs-surveys/bds/data.BDS_Explorer.html)は調査入口であり、avokadoの需要や企業価値の証拠ではない。発行日、対象地域、定義、取得日と直接URLを各重要主張の近くに残す。市場規模を構造的に計算する場合は、対象顧客数×到達率×実支払額の全仮定を表示し、トップダウンの巨大市場を売上予測と呼ばない。

## 納品物と合格条件

1. `docs/rockstaros-1.0-strategy.md`の既存「企業価値」節に、短い推奨戦略、二番手、選ばなかった案、理由、逆転条件を更新する。確定要望と研究者の提案を明確に分け、対象業界/顧客/価格を勝手に確定しない。
2. `docs/workstreams/09-business-pilots.md`に、最初の顧客層と反復仕事を選ぶための90日実験、既存task、測定方法、失敗時の変更・停止条件を追加する。対象者が決まらなければ候補と不足証拠を残す。
3. 同じ関連資料に、選択肢の比較表、仕事単位の経済式・感度分析、出典台帳、実績/仮定/不明の区分、重大リスクと責任分界を保存する。長い生ログはGit外へ置き、要約と再現手順だけをGitへ入れる。新しい日付付き入口を乱立させない。
4. `project.md`と`data/project-status.json`に実働時間、判断変更、検証結果、未完了、次の具体作業を記録し、`npm run project:update`でREADMEの自動領域を同期する。利用方法を変える場合だけREADME本文も更新する。OS component/Sky Toolの設計を変更した場合は設計台帳と全体/Tool詳細を同時更新し、`npm run design:check`を通す。
5. `npm run baseline:check`、`npm run project:check`、`git diff --check`と、AGENTS.mdの`npm run verify`を実行する。失敗・未実施はそのまま記録する。設計から実装、branch保存、main統合、Site公開、実取引は別状態で報告する。

最終報告は「推奨する第一の戦略を一文で」「それを選ぶ根拠と反証」「90日の最初の3行動」「成果を測る分母・費用・停止条件」「何が未実証か」「正味時間と証拠」「次にOWNERが決めること」の順に簡潔に示す。実顧客、売上、企業評価額、投資対効果、OS/端末/Cloudの本番合格を資料や合成fixtureから創作しない。
