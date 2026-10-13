# アカウント入口と回線の役割整理（2026-10-10 OWNER確定）

状態: **確定**（2026-10-10、利用者が「全部確定でいい」と明示）。2026-10-07に main `0fbf688` を読んで提案として作成し、2026-10-10に main `96845e6` との差分を確認した。確定内容は [製品ベースの2026-10-10の節](product-baseline.md) と `data/product-baseline.json` の `serviceAccessModel`・`accountEntryDecision`・`miniCellularIntent` へ反映した。本番課金・回線の開通・端末へのOS導入は未受入のまま。

位置付け: 2026-10-02の製品方針（SIM/eSIM購入を入口にしたservice access）に対する見直し案。対象taskは SIM01、MAT15の通信サブ項目、BIL02、SKY07／SKY21。主担当の候補は Wallet / Billing / Providers（課金）と Material Invention / avocadoMini（回線内蔵機器）。OWNERへの進め方の質問には4問とも「おまかせ」の回答だったため、下の「仮決定」は推奨案を置いたもので、OWNERの決定ではない。

## 1. 提案の要点

入口を「SIM/eSIMの購入」から「Rockstarアカウント」に移し、eSIMは自分の回線を持たない機器（avocadoMini、車載機）をつなぐ用途だけに使う。

OWNERがeSIMに期待していた役割は5つある。eSIMが実際に担えるのは機器の回線だけなので、残りは別の仕組みへ割り当てる。

| 期待した役割 | 担う仕組み | 理由 |
| --- | --- | --- |
| 入れてもらいやすい | Web版Sky＋passkey（QR→認証1回→ホーム画面に追加） | インストールも通信契約も要らない。スマートフォンにeSIMを入れてもアプリやOSは入らない |
| 信頼される | 自社domain、実行前の上限表示、明細、いつでも止められる導線 | eSIMの信頼は通信会社の看板から来ていた |
| 長く使われる | 毎日動くAgentと蓄積（履歴・設定・記憶）、物理デバイス | 通信は遅滞なく解約できる措置が義務で、違約金にも上限がある。手続きの重さでは残せない |
| 意識されない課金 | カード登録＋従量のしきい値後払い＋月の上限 | 「使った分があとで落ちる」形をカードで再現する |
| 確実な回収 | 未払いで自動停止、期間パスは前払い、作者分は売上から先に差し引く | 回線が止まるから払う、と同じ原理 |
| 機器をつなぐ | 回線内蔵のMini・車載機にIoT向けSIM | 設置先のWi-Fi設定が要らない |

署名付き購入claim（`lib/rockstar-entitlement-claim.ts`）は、`formFactor: 'service_only'` を既に受け付ける。招待・店頭販売・提携先経由の入口としてそのまま使える。

## 2. 現状との差（確認した事実）

- 公開gate（`data/sky-service-launch.json`、2026-10-02時点の記録）は17件中 passed 3件。`payment-provider`（Stripe実設定）と `focused-cloud-ai`（Provider credentialと信頼料金）が blocked。JPY 50円の試験決済（`focused-csv-payment`）は passed。
- Sky Marketの決済は円建て買い切りのみ（`lib/sky-stripe.ts` は `mode: 'payment'`）。`SKY_PRICING` に `subscription` と `usage` はあるが、決済経路はない。
- 決済は destination charges、application fee 10%。Connect accountは `controller[fees][payer]=application`、`controller[losses][payments]=application`。Stripeの費用と不審請求の損失はplatform側の負担。
- 10/7時点のREADME（Revenue and participation）は「売上へのSky feeを課さない設計」と書いており、code（`lib/sky-marketplace-policy.ts` の1,000 bps）、`docs/sky-network-economy.md`、`npm run baseline:check` が確認する「売上手数料10%」と一致していなかった。10/9のREADME整理で移した `docs/readme-details.md` は10%を現行方針と書いており、この食い違いは解消済み。
- Web版Skyの本人確認は、hosting側gatewayが渡すheaderに依存する（`lib/request-auth.ts`）。Sky利用者向けのpasskeyはない。WebAuthnの実装は `services/operator-dock/src/operator-webauthn.ts` と `systems/rock-star-os/os/wallet_auth/` にある。
- eSIM発行adapterはeSIM Go（`lib/esimgo-provider.ts`）。`docs/provider-contract-readiness-20260930.md` は、同Travel APIが同一国での60日超の継続利用を制限し得ること、IoT device利用を認めないことを記録している。
- Miniのcellular設計（`docs/avocado-mini-cellular.md`）は物理nano-SIM、4G LTE / 5G Sub-6候補、国・通信会社・module未定。比較例のRM520NはM.2 30×52mmで、筐体への収納は未検証と明記されている。
- catalogは35件（ready 13、candidate 22）。
- server pushの実装はない。メッセージアプリの入口はTelegram bridgeのみ。

## 3. 課金の設計案

残高は持たない（`docs/wallet-commerce-design.md` の「Walletに独立した支払可能残高は持たせない」を維持する）。Rockstarアカウント自体は無料とする。

| 料金 | 支払時期 | 内容 |
| --- | --- | --- |
| 期間パス | 購入時に前払い | 作者が期間と価格を決める（例：3週間）。期間中の利用枠を含む。有効期間は6か月未満 |
| 従量 | 後払い | 実行ごとに上限を予約し実測で確定。累計がしきい値に達した時か月末に、登録カードへ請求 |
| 端末基本料 | 月額 | 回線内蔵機器のみ。回線・遠隔管理・復旧を含む |

従量の流れ: (1) 最初の有料実行の直前にカード登録と月の上限設定、(2) 実行ごとに最大費用を上限枠から予約、(3) 実測で確定し明細へ、(4) しきい値到達時または月末に請求、(5) 請求失敗で新規実行と定期Agentを停止。(2)(3)は既存のbudget reservationとusage receiptを使う。(1)(4)(5)が新規。

解約: 期間パスは自動更新を切れば期間末で終了。従量は上限0またはカード削除で未請求分を精算して終了。端末基本料は当月末で回線停止、機器はWi-Fiで継続利用できる。月額の基本契約がないため、基本契約の解約とAgentの期間が衝突しない。「利用中は解約不可」「期間の継ぎ足しで出口をなくす」設計は採らない。

### 数字（Stripe日本の公開料金、2026-10-07閲覧）

- カード決済 3.6%。1,000円の販売で、Sky fee 100円からカード手数料36円を引くと64円。
- Connect（platformが費用を負担する現在の設定）: 入金のあった作者account 1つにつき月200円、入金額の0.25%、入金1回250円。入金を月1回にまとめても作者1人あたり月450円の固定費。fee 10%で賄うには作者1人あたり月約7,300円の売上が要る（週1回の入金なら約20,800円）。
- fee 0%の場合、現在の設定では売上1,000円あたり36円以上の持ち出しに加えて上記の固定費がかかる。
- 従量の上乗せ（カード手数料3.6%控除後）:

| 上乗せ | 原価100円あたりの売値 | 粗利 | 売上に対する粗利率 | 1人から月500円の粗利に要る利用額 |
| --- | --- | --- | --- | --- |
| 20% | 120円 | 15.7円 | 13.1% | 約3,830円/月 |
| 30% | 130円 | 25.3円 | 19.5% | 約2,570円/月 |
| 50% | 150円 | 44.6円 | 29.7% | 約1,680円/月 |

軽いAgent（アラーム等）はcloud原価が小さく、上乗せでは粗利がほぼ出ない。期間パスの価格から取り分を取る。実原価はmodelを決めて実測するまで確定しない。

fee 0%への道筋: 決済を作者accountで直接受ける方式（direct charges）へ替え、Stripeの費用を作者accountから徴収する設定にする。Stripeが作者へ直接課金する形ではplatform側のConnect料金はかからない。切替には実装とStripeへの確認が要る。

複数Toolを組み込んだAgentの分配: 割合を決めず、呼び出しごとにそのToolの作者へ計上する。組み込んだ作者は合計に自分の上乗せを足して売値にする。

## 4. 回線内蔵機器の設計案

| 項目 | 案 | 理由 |
| --- | --- | --- |
| 対象地域 | 国内のみで開始 | 国と通信会社が決まらないとmoduleとbandが決まらない |
| 通信規格 | LTEの小型module、国内認証取得済み | 用途が制御・Agent通信・音声なら5Gの帯域は不要 |
| SIM | IoT向け、data only、SMSなし。試作はcard型、量産は基板実装型 | 試作では差し替えて検証できる |
| 遠隔切替 | 実装しない。SGP.32対応SIMを選ぶ | 必要になった時に通信partnerの機能で切り替える想定。料金と条件は未確認 |
| 通信の範囲 | 自社cloudとの制御・Agent通信・音声のみ。OS更新、映像、game取得はWi-Fi | 通信量を基本料金の枠に収める |
| 機器の識別 | 機器固有の鍵。SIMでは判定しない | 回線を替えても同じ機器のまま |
| model構成 | 回線つきは別modelかoption | Wi-Fiで足りる利用者に回線代を負担させない |

試算（SORACOM plan-D D-300MBの公開料金: 初期費用902円＋送料、使用開始後330円/月で300MiB込み、開始前・中断中165円/月。support費150円/月は仮定）: 端末基本料980円/月なら、カード手数料・回線・supportを引いて約465円/月が残る。損益分岐は月約500円。在庫100台の開始前回線で月16,500円。

試作の合格条件（R5筐体を待たず、開発board＋LTE module＋IoT向けSIMで確認）:

1. Wi-Fiとtetheringを切っても、携帯回線だけでAgentを1つ実行できる。
2. SIMを別のものに差し替えても、機器の登録とentitlementが残る。
3. 通信断と再起動の後も、同じjobを二重実行しない。
4. 通信明細（partner側）とAI使用明細（自社）を別々に照合できる。
5. 1か月の通信量が300MiBの枠に収まる（実測）。
6. 紛失を想定して、機器のaccess・cloudのjob・回線を別々に止められる。

## 5. 進め方（案）

1. blockedの2件を通す（Stripe実設定、cloud AI Providerのcredentialと料金表）。
2. Web版Skyで売る: 自社domainとpasskey、feedと接続button、Agentごとの共有link、期間パス、しきい値請求、月の上限、解約導線、特商法の表記と窓口。表に出すAgentは通しで動く3〜5件。
3. 届け口を足す: PWAの通知、LINE、共有の050番号で受ける音声Agent 1本。
4. 回線を試作で確かめる（先に総合通信局と通信partnerへ確認）。
5. 機器に載せる。

段階3まではhardwareを必要としない。

保留を提案するもの: 消費者向けeSIMの発行・販売（eSIM Go経路、`/sky/esim`。codeは消さず既定無効のまま）、遠隔profile切替の自作、外部Agentの署名付きquote（対応Providerが現れるまで）、他社向けSDKと車のOEM連携、5G modemの組込み検討。

## 6. 確定事項（2026-10-10 OWNER確定）

| 項目 | 仮決定 |
| --- | --- |
| 主商品 | アカウントで使うAgent。SIMは機器向けの任意部品 |
| 売り手 | Web版は自社。機器の回線は自社名義で、通信をサービス料に含める |
| 最初の客 | 個人。`docs/rockstaros-1.0-strategy.md` の検証仮説（文章を納品する個人事業主）から |
| Sky fee | 当面10%。0%は「取り分0、決済実費は実額」と定義し、従量の粗利が固定費を3か月続けて上回ったら切り替える |
| 作者への払出し | 月末締め・翌月末払いの月1回 |
| 料金の初期値 | しきい値1,000円（新規accountは低く始める）、上乗せ30% |
| 期間パス | 自動更新は既定オン（購入画面で明示、更新前に通知）。途中返金は既定なし |
| Miniの回線 | 国内、LTE小型module、IoT向けSIM、切替は実装しない |
| 回線つきmodel | 別modelかoption |
| 通信の一次support | 自社が受け、状態表示と切り分け手順を用意する |
| MiniのSIM | 試作はカード、量産はchip。SGP.32対応のSIMを選ぶ。5Gは入れない |
| Skyの置き場所 | 当初案は `https://avocadomini.si/sky`。2026-10-13に利用者が `https://avoado.si/sky` へ変更。現行は専用Sky Siteへの転送で、自前passkeyと同一origin提供は未受入 |
| 通知 | Web Pushを先に作る |

## 7. 外部確認（未了）

法的な結論ではなく、確認事項の整理である。

- 電気通信事業法: 自社名義の回線を機器に内蔵し利用者に使わせる形の登録・届出の要否。総務省「電気通信事業参入マニュアル［追補版］」は、他人の通信を媒介しないIoTサービス（位置管理、混雑検知等）を登録・届出不要、媒介するもの（通話機能付きドアベル、見守りカメラ等）とMVNO・リビリングを必要としている。総合通信局へ照会する。
- 携帯電話不正利用防止法の改正（2026-05-22成立、公布から1年以内に施行）: data SIMへ本人確認義務が拡大する。対象の細目は省令で決まる。機器内蔵のdata専用回線が対象に入るかを確認する。
- 資金決済法: 前払いの残高は、基準日未使用残高が1,000万円を超えると届出と2分の1以上の供託の対象になる（発行から6か月以内に限り使えるものは適用除外）。本案は残高を持たず、期間パスの有効期間を6か月未満にする。期間パスの該当性を弁護士に確認する。
- 特定商取引法: 最終確認画面の表示（分量、価格、支払時期と方法、提供時期、解除、申込期間）と表記page、窓口。
- 認証: 認証取得済みmoduleの組込み条件（antenna、筐体、複数無線）、AC adapter。
- 通信partner: 第三者利用の手続き（MVNOに当たる場合のpartner登録）、SGP.32対応SIMの料金・plan・機器要件、SMSなしの可否。
- Stripe: 上記Connect構成の料金、direct chargesへの移行、入金周期、しきい値請求の実装。
- cloud AI Provider: 上乗せして再提供する形の規約適合、usage明細の表示。
- 電話API: 050番号でAIが応答する形の条件。

## 8. 確定に伴う文書の更新（2026-10-10）

2026-10-10に更新したもの: `docs/product-baseline.md`、`data/product-baseline.json`、`AGENTS.private.md`（旧AGENTS.mdの非公開版。2026-10-11に暗号化をやめてAGENTS.mdへ戻した）、`docs/spec-history.md`、`docs/sim-led-product-architecture.md`、`docs/avocado-mini-cellular.md`、`data/avocado-mini-cellular.json`、`docs/provider-contract-readiness-20260930.md`、`docs/sky-network-economy.md`、公開の入口ページ `app/rockstaros/page.tsx`。

まだ更新していないもの: `docs/sky-commerce-design.md`・`docs/wallet-commerce-design.md`・`docs/sky-billing.md`（期間パス・しきい値後払い・月の上限・未払い時の停止）、`data/sky-service-launch.json`（自社domain・passkey・特商法表示・しきい値請求のgate）、`lib/request-auth.ts`（passkey）。これらは各機能を実装する変更と同じcommitで更新する。

| 文書 | 更新内容 |
| --- | --- |
| `docs/product-baseline.md`、`data/product-baseline.json`、`AGENTS.md` | 主商品の定義（理由と日付を記録） |
| `docs/sim-led-product-architecture.md` | 機器の回線の文書へ改める。購入claimは招待・店頭販売用として残す |
| `docs/avocado-mini-cellular.md`、`data/avocado-mini-cellular.json` | 第4節の構成、通信の範囲、通信量の枠 |
| `docs/provider-contract-readiness-20260930.md` | 機器用IoT回線の候補と確認項目。消費者向けeSIMは保留と明記 |
| `docs/sky-commerce-design.md`、`docs/wallet-commerce-design.md`、`docs/sky-billing.md` | 期間パス、しきい値後払い、月の上限、未払い時の停止 |
| `docs/sky-network-economy.md` | 0%の定義と切替条件、Connect費用込みの手取り、呼び出し単位の計上（READMEのfee記述は10/9に10%へ統一済み） |
| `data/sky-service-launch.json` | 自社domainとpasskey、特商法表示、しきい値請求のgate |
| `lib/request-auth.ts` | passkeyによる自前の本人確認 |

## 9. 出典

2026-10-07に開いて確認した公開page。料金と法令は契約・実装の前に再確認する。

- 総務省 [電気通信事業参入マニュアル［追補版］](https://www.soumu.go.jp/main_content/000477428.pdf)、[消費者保護ルールの見直し（令和4年2月）](https://www.soumu.go.jp/menu_news/s-news/01kiban08_03000369.html)、[携帯電話不正利用防止法の改正に基づく制度整備の方向性（2026-08-03）](https://www.soumu.go.jp/menu_news/s-news/01kiban18_01000289.html)
- 牛島総合法律事務所 [携帯電話不正利用防止法 令和8年改正法の概要](https://www.ushijima-law.gr.jp/client-alert_seminar/client-alert/20260805identification/)
- 日本資金決済業協会 [前払式支払手段発行業の概要](https://www.s-kessai.jp/businesses/prepaid_means_overview.html)
- ネットショップ担当者フォーラム [改正特商法の最終確認画面](https://netshop.impress.co.jp/node/9583)
- Stripe [日本の料金](https://stripe.com/jp/pricing)、[Connectの料金](https://stripe.com/jp/connect/pricing)、[Connectの支払いの種類](https://docs.stripe.com/connect/charges)、[不審請求の流れ](https://docs.stripe.com/disputes/how-disputes-work)
- SORACOM [plan-D D-300MB](https://changelog.soracom.io/ja/soracom-air-for-plan-d-d-300mb-1WU1lC)、[購入者とは別の会社による利用](https://support.soracom.io/hc/ja/articles/360041001731)、[パートナースペース](https://soracom.jp/partners/)、[SGP.32対応IoT SIM（PR TIMES）](https://prtimes.jp/main/html/rd/p/000000398.000034562.html)
