# eSIM・クラウド供給元の契約準備

確認日: 2026-10-02（公式公開資料を再確認）。これは契約前の技術・公開価格比較であり、取引条件・販売権・日本国内の提供資格・見積・アカウント審査・sandbox accessを確認した結果ではない。外部への問い合わせ、契約、課金、実profile発行、配備はしていない。SIM/eSIM販売に付属するRockstarOS service accessを主商品とし、物理SIM/eSIM販売・通信開通・OS/client導入を別状態で扱う方針は[product baseline](product-baseline.md)に従う。

## 結論

最初のeSIM商用・技術打診先は**1GLOBAL Connectを優先候補**、**eSIM GoをUX/APIの比較候補**にする。1GLOBAL ConnectはAccount／Subscriber／Product Offering／Orderを持ち、一般のPOST/PATCH operationにidempotency対応を説明する。一方でAPI Referenceが対応endpointを個別に指定するため、実際のprofile-issuing orderで有効かは契約前に確認する。eSIM Goは公開Quick Startでvalidate→transaction→QRを試せ、branding profileで回線のNetwork Name、Install Name、QR logo、Android Direct Installを設定できるため、「eSIM追加時にRockstarOSブランドを見せる」検証の質問が具体的。eSIM Goのbranding/network-nameはSIM/eSIMの表示とinstall UXであり、OSをeSIMへ格納/自動導入する意味ではない。どちらも日本での再販権、consumer eSIM適合、料金、サポート責任が決まった証拠はない。

候補の用途も分ける。eSIM Goの現行Travel APIは「旅行・一時利用のconsumer」向けで、同じ国での長期継続利用を60日超続けると制限し得ると明記し、IoT device利用を認めず、1st line supportをpartnerへ置く。したがってこれは短期旅行用の比較候補で、端末の常時lifelineや専用機の回線供給元には不適合。長期・日本国内lifelineの第一候補は、国内での利用範囲・通信条件・契約主体が取引条件で確認できる事業者とし、1GLOBAL Connectは公開APIがpartnerによるend-customer販売、prepaid/postpaid/hybrid billingとbundleに対応すると説明しているので先に条件照会する候補。ただし日本の網・再販権・販売者/請求者・サポート責任は公開資料から確認できず、接続・契約適合を意味しない。[1GLOBAL Connectの対象モデル](https://docs.connect-api.1global.com/overview/whatisconnect) · [eSIM Go Travel APIの利用・支援条件](https://docs.esim-go.com/guides/getting_started/) · [eSIM Go用語（Partner/Consumer）](https://docs.esim-go.com/guides/esim_terminology/)

### 通信料を誰が請求するか

| 方式 | 利用者からの請求 | RockstarOS側 | 利点 / 負担 | 契約確認 |
|---|---|---|---|---|
| 通信Providerが利用者へ直接請求 | Providerが利用者との通信契約を持ち、通信料を請求する。RockはOS/Sky機能の利用料と切り分ける | provider customer/accountへownerを紐付け、購入・利用権状態を照合 | Rockstarが卸残高と通信料の未収を抱えにくい。一方、Providerの顧客アカウント・請求画面への遷移、二重account、返金同期が必要 | 1GLOBAL/eSIM GoのAPIにprovider-hosted checkoutやProviderがseller-of-recordになる条件があるかは公開資料で未確認。直接請求可能と仮定しない |
| Rockstarが仕入れ再販 | Rockが利用者から販売額を受け、Providerへ卸代を支払う | Stripe等の既存Commerce、本人・注文・Wallet reservation、税/返金・利用権失効とProvider transactionを一体照合 | Sky内の一つの購入導線とbundleを作れるが、前払残高・chargeback・返金・通信問い合わせの一次窓口・契約/法務責任がRock側に集まる | eSIM Goはprepaidでpartnerが先に購入し利用者へ販売または提供、1st-line supportはpartnerと説明。1GLOBALはpartnerがend customerへ売る/他packageへ同梱する用途と複数billing modelを公表。どちらも日本での販売権・課金者・規制役割は契約で確定が必要 |

**推奨する初期判断:** MVPのデフォルトは「通信契約と通信請求は、許可された通信事業者側に残す」。Providerから利用者へ直接販売・請求できる正式経路とowner照合APIがsandboxで確認できる場合はそれを使い、Rockstar側はOS/Sky/agentの利用権・同意・状態同期を担う。直接販売が提供されない場合は購入を有効にせず、Rockが再販者になる契約モデル、資金繰り、返金、first-line support、税務/利用者説明、該当する届出等を専門家と確認してから第二案として進む。これは公開API説明とRockがまだ販売資格・契約主体を確認していない事実からの製品判断で、適用法の結論ではない。電気通信事業法には登録・届出や媒介等の条項があるが、API reseller/agent/merchant-of-recordの実際の役割に何が適用されるかは個別に判断されるため、契約前に総務省または通信法務専門家へ確認する。[電気通信事業法（e-Gov）](https://laws.e-gov.go.jp/law/359AC0000000086) · [事業届出手続（e-Gov）](https://shinsei.e-gov.go.jp/recept/procedure/lists/procedureInformation?gtaTetCd=145181GA00001)

クラウドは、現在のCloudflare Workers / D1 / Workflows実装を使い続けて**controller・API・durable orchestrationの第一候補**とする。Cloudflare Containers/Sandboxesは2026-04-13に一般提供され、隔離Linux実行の候補へ追加する。公式上限のinstance typeは最大4 vCPU/12 GiB/20 GB diskで、GPU推論向けとは確認できない。重いLLM推論がGPUを必要とする場合の候補はGoogle Cloud Run GPU。第三者agent・MCP・モデル推論は現在のWorker内で直接実行せず、個別runtimeへ隔離する。CloudflareやGoogleを契約済み・接続済みとは扱わない。

## 衛星通信: 日本のMVPは既存キャリアのdirect-to-cell連携

2026-10-02の公式資料再確認では、衛星網を自社で作るより、RockstarOSを対応キャリアの既存direct-to-cell網に載せる道がMVP候補として具体的。KDDIのau Starlink Directは、空が見える屋外等の条件下で対応端末がStarlink衛星へ直接つながる。UQ/povo/他社回線向けの「専用プラン＋」はau ICカード（物理SIM）またはeSIMで申込可能。現行公開表示は他社回線利用者が申込当月から3カ月0円、その後1,650円/月（税込）、衛星dataは対応端末・一部対応アプリ中心で、提供条件と価格は変更され得る。プラン説明には1GB/月のdata枠が記載されるが、現時点では衛星trafficを当面その枠から消費しない扱いも併記される。この一般向け回線・価格はRockstarの卸価格、販売権、API、Cloudflare/Rockstar arbitrary endpointの到達性を意味しない。[KDDI専用プラン＋](https://www.au.com/mobile/service/starlink-direct/exclusive-plan-plus/) · [au Starlink Directの利用条件・制限](https://www.au.com/mobile/service/starlink-direct/) · [KDDI SOSセンター](https://www.au.com/mobile/service/starlink-direct/sos/)

KDDIの開発者portalは一般公開され、Android 16以降・iOS 26以降、利用可能なSIM/eSIM plan、対応端末、Android manifest opt-in、satellite-aware UXを案内する。掲載申請基準にはアプリ提供開始から6カ月と個別協議/契約（NDAを含む場合あり）が記載される。疑似試験は遅延・帯域制限・切断復帰を検査するが、衛星固有RFを再現しない。Pixel 10はmock試験端末として案内されるが、Pixel 10 GL066の現場受入ではない。衛星通信では初回login、OS/appのdownload/updateができない場合があるため、地上回線時の事前導入・loginが必要。KDDIの掲載済み一般向け対応アプリがあることは、Rockstarアプリ掲載承認や任意cloud endpointの疎通を示さない。[KDDI開発者portal](https://starlink-direct-support.au.com/TOP.html) · [KDDI対応機種一覧](https://www.au.com/mobile/service/starlink-direct/enabled-device/) · [Android constrained satellite networks](https://developer.android.com/develop/connectivity/satellite/constrained-networks?hl=ja)

| 経路 | MVPでの意味 | 残る条件 |
|---|---|---|
| 携帯キャリアdirect-to-cell | 対応端末・SIM/eSIM plan・carrierが許可するapp trafficで衛星時に短いstatus/指示を送る候補。RockstarOSはjob ID、本人、予算、同意を保ち低帯域のstatus・承認・cancel・要約を優先 | arbitrary cloud endpointが許可されるか、通信先 allowlist/SDK/API、SKU/OS/plan、アプリ審査、卸/請求責任、field試験が未確認。au Starlink Direct一般向けプランからRockstarの自動eSIM卸API・任意internet・再販許可を推定しない |
| 専用衛星端末/既存衛星インターネット | 専用端末が別の通信終端となり、Wi-Fi/USB等でRockstar端末へ接続する選択肢 | 端末・電源・空の見通し・別契約が必要。通常のスマートフォンeSIMだけで衛星端末になるわけではない |
| 自社衛星網 | 長期の独立ネットワーク構想として別途評価 | 周波数・軌道・各国認可/調整、衛星・地上局・携帯網接続、製造・打上げ・運用・障害対応・資金調達が必要。ITUの非静止衛星手続は主管庁による申請・公表・調整等を含む。初期製品の依存先にしない。[ITU non-GSO手続](https://www.itu.int/en/ITU-R/space/support/nonGSO/Pages/default.aspx) |

設計では「主データSIM/eSIM」と「衛星direct-to-cell対応回線/SIM/eSIM」を別のprovider capabilityとして扱う。eSIMは回線契約情報を端末へ導入する手段で、衛星RF対応・衛星service entitlement・RockstarOS自動導入を保証しない。KDDIのdirect-to-cell planを利用しても通常音声通話や110/118/119への音声発信はできない。一方、対応端末/対応app/メッセージappからSOS情報をSOSセンターが緊急通報受理機関へ代理送信する別serviceがある。これは海外不可、通信/アプリ条件あり、救助を保証しないため、Rockstarのemergency/lifeline提供として案内しない。[KDDI SOSの仕組みと制限](https://www.au.com/mobile/service/starlink-direct/sos/) 現在の実装はAndroid Brokerによる基本eUICC診断のみで、一般Capability Registry、衛星接続状態/API、KDDI向けapp approval、購入前の適合判定は未接続。

**契約前に衛星事業者へ確認する項目:** Rockstarの契約主体/卸・再販可否、他社利用者向け回線を物理SIM/eSIMで発行できるか、顧客本人確認と通信料請求者、Pixel 10 GL066を含む正確なSKU・OS/API・carrier lock適合、任意のRockstar cloud hostname/APIが衛星時に到達可能か・通信先allowlist/SDK/APIの有無、Rockstar appを使えるようにする技術要件・掲載申請/6か月基準・個別契約と試験費用、低帯域時の許可通信・帯域・latency・data上限、mockとfield testの範囲、地上網とのpriority/roaming、障害時support・billing・privacy責任。KDDIでは通常の音声通話および110/118/119の音声発信は不可。別途SOSセンター経由のmessage relayはあるが、対象app/SIM/端末と日本国内等の制限があり、救助保証をしないため、Rockstarのlifeline emergency functionalityとして約束しない。

自社衛星の周波数送信・衛星製造/打上げ等は現段階では計画確定しておらず、規制・投資・打上げの費用見積もりも取得していない。ここでの推奨は「他社direct-to-cellと端末アプリ統合の契約可能性を先に確かめ、自社網は別の長期feasibilityとして残す」という製品判断である。

## eSIM API比較

### 販売チャネル設計（製品要件 2026-10-01）

RockstarOSのSIM/eSIM商品は、OS内の回線ストアを主要販売経路にしない。契約後は、Rockstar直販Web/App、通信事業者の販売・開通導線、端末販売店・店頭、オンライン販売元など複数の購入経路を同じ共通サービス利用権へ結ぶ。チャネルごとの商品表示、販売者、通信契約者、通信料請求者、返金窓口は別に表示・照合する。購入claimは`issuerId`・`offerId`・購入参照hash・SIM形態・scopeを署名して一回だけRockstar IDへ結ぶ。claim成功だけで通信契約が開通した、eSIM profileが端末に入った、またはRockstarOS native版を導入できたとは扱わない。

1GLOBAL Connectの公開説明は、partnerが自社website、app、marketplaceからeSIM商品を提供し、別の商品へ通信をbundleする使い方を挙げている。Consumer RSP公開資料は、店頭POS、QR/link配信、一括QR、in-app provisioning、eID pushと、物理店舗・online・partner channelでの配布方法を説明する。Connectの新規eSIM手順はOffering→Account/Subscriber→Orderの順で、profile-readyおよびorder結果の非同期eventを使う。従って、契約が成立する場合、1GLOBALをeSIMの複数配布形態をまとめる**優先照会候補**とし、Rockstarは購入claimとRockstar ID onboardingを独立させる構成が候補になる。[1GLOBAL Connectのpartner API](https://docs.connect-api.1global.com/overview/whatisconnect) · [1GLOBALの新規eSIM注文手順](https://docs.connect-api.1global.com/next/recipes/new-esim) · [1GLOBAL Consumer RSPの配布方式](https://www.1global.com/consumer-remote-sim-provisioning)

この公開情報が示すのはeSIM提供API・流通optionの存在であり、Rockstarの販売資格、国内通信網/対象プラン、日本での再販権、契約条件、実際の物理SIMカードの販売・発送、実際のeSIM発行、または利用者請求者の合意ではない。物理SIMは採用する通信会社・小売店の通常のSIM販売/配送/開通フローへ接続し、同じ署名claimを発行する別adapterを必要とする。全ての販売元に対して共通化するのは注文IDそのものではなく、issuerが発行する署名済みoffer/purchase claim・取消event・同じRockstar owner bindingである。店頭、外部EC、通信会社、Rockstar checkoutごとに異なる注文番号・本人確認・支払・返金は各source systemで正とし、個人情報、ICCID、EID、eSIM activation secretは共通claimへ入れない。

契約先ごとに、(a)販売者/merchant of recordと通信契約者、(b)物理/eSIMと国・正確なdevice/SKUの適合、(c)profile発行/配送/開通statusとreadback API、(d)注文受付応答喪失時に二重注文/二重請求を防ぐ同一key照合、(e)購入claimの署名鍵/rotation/revocation、(f)refund/chargeback/解約の署名eventと返金主体、(g)通信料・AI使用料の分離、(h)通信/OS導入/サービスclaimの利用者向け表示、(i)一次サポートと障害責任を別々に確認する。SIM/eSIM purchase is offered through multiple channels and includes RockstarOS service access; it is not positioned as checkout inside the OS. Until contracts are accepted, do not present a carrier or seller adapter as live. Do not imply that an OS-side offer reference means seller integration or carrier activation.

| 確認点 | 1GLOBAL Connect | eSIM Go |
|---|---|---|
| 公開された開始経路 | 利用権を得てcredentialを発行後、product offering・account・subscriberを用意し、orderでsubscription activationを開始 | accountにpositive balanceとAPI keyが必要。catalogue→validate order→transaction order→orderReferenceでQR ZIP取得 |
| 非同期結果 | profileがinstall可能になると`subscription.sim_profile.ready_for_installation`、注文成功/失敗で`order.completed` / `order.failed` event | transaction応答の`orderReference`とassignment照会、bundle状態照会、webhookを組合せる |
| 認証・秘密 / 重複 | 公式Getting StartedはcredentialとBearer tokenを前提とする。API idempotency文書は対応endpointでPOST/PATCHの同じkey再利用を説明する。key保持は既定24時間。token scope、endpointごとの対応、長期停止後のreadback手段を契約前に確認 | API keyを各requestの`X-API-Key` headerへ付与。組織ごとに単一keyと説明され、再発行は旧keyを直ちに無効化。V3 callbackはraw bodyのHMAC-SHA256署名。public docsで注文POSTのidempotencyを確認できていないため、応答消失時のprovider照合が必須 |
| eSIM配布・branding | APIでorder・profile provision・installの流れを提供。対応端末へのinstallation UXは別途実機確認 | 注文単位QR PNGとICCIDを返す。small orderではMatching ID / SM-DP+等がresponseに入る。承認済みbranding profileはNetwork NameとInstall Name（各最大16字）、QRロゴ、Android Direct Installを設定可能。割当後の`GET /esims/assignments?reference=...&additionalFields=installUrl`はApple/Android install URLを返せる。直接追加にはeSIM対応端末とインターネットが必要で、非対応時はQR/LPAを使う。回線名表示だけでRockstarOSが導入されるわけではない |
| 照合・重複 | eventの重複配送、order ID/idempotency、照会API、cancel/refundを実契約で確認 | orderReference保持、assignments/status照会、signed callbacksを使う。クライアント側request key、応答消失後の注文照合・再発行禁止はRockstar側で実装する |
| 公開資料だけでは不明 | 日本のcoverage/roaming、wholesale price、minimum commitment、resale/white-label、consumer support、sandbox、profile install eligibility、refund/cancellation | 同項目に加え、prepaid balance funding/refund、API keyの権限粒度、運用上の同時注文上限 |

### 発行応答消失時の二重課金・照合ゲート

2026-10-01に現行公式API資料で注文照合を再確認した。eSIM Go v2.5の`POST /orders`はtransaction時にorganization balanceから引き落とし、成功応答に`orderReference`を返す。公開されているCreate Orders request schemaにはclient idempotency keyまたはclient order referenceが記載されず、`GET /orders/{orderReference}`もそのreferenceを必須とする。`GET /orders`では作成時刻filter/pageが使えるが、時刻・bundle・金額・通貨だけでRockstarのjobに一意に結び付く保証は公開資料にない。従ってPOSTが受理されて応答だけ消えた場合、現在の実装は`reconciliation_required`で止まり、再送しない。既知referenceのread-only復旧はできるが、このunknown-reference状態を自動解決できるとは扱わない。[Create orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) · [Get order detail](https://docs.esim-go.com/api/v2_5/operations/ordersorderreference/get/) · [List orders](https://docs.esim-go.com/api/v2_5/operations/orders/get/)

1GLOBAL Connectの一般idempotency docsは`Idempotency-Key`、replay/retriable応答header、既定24時間保持を説明する一方、対応endpointはAPI Referenceで確認するよう案内する。新規eSIMのrecipeはaccount/subscriber作成後にactivation orderを作るが、その正確なorder operationがidempotentと公開情報だけで確認できたわけではない。[Idempotency](https://docs.connect-api.1global.com/api/idempotency) · [Getting a new eSIM](https://docs.connect-api.1global.com/next/recipes/new-esim)

**契約後に発行を有効化する必須gate:** 具体的なprofile-issuing order endpointについて、keyのscope・保持期間・同一key/同一bodyのreplay・body不一致・並列409・保持期間経過後のlookup方法を文書で確認する。sandboxでprovider acceptance後にHTTP responseを故意に捨て、同じkeyの照合で同一order/profileを復元し、provider debitが一度だけであることを確認する。この仕様または永続client reference照合を確立できないprovider adapterは、自動発行対象にしない。Provider debit gateは引き続きdefault-offである。[機械可読調査記録](evidence/esim-provider-idempotency-research-20261001.json)

1GLOBAL Connectの公式ガイドは新規eSIMの流れをproduct discovery、account/subscriber、order、profile-ready/order-result eventとして説明し、利用開始にはplatform accessが必要としている。idempotency docsではkeyは既定24時間保持され、対応endpointにおけるin-flight 409、同一keyで異なるrequestの422、replay応答headerを説明する。すべてのendpointに自動適用とはせず、利用予定endpointごとの対応を契約時に確認する。[Getting Started](https://docs.connect-api.1global.com/overview/getstarted/) · [Getting a new eSIM](https://docs.connect-api.1global.com/next/recipes/new-esim) · [Idempotency](https://docs.connect-api.1global.com/api/idempotency)

2026-10-01に公式資料を再確認し、実装契約は**eSIM Go REST API v2.5**とCallback V3を維持。order transaction responseは`orderReference`とorder内の`esims[]`にICCID/Matching ID/SM-DP+を返し、assignment GETはreference指定でJSONを照合できる。assignment endpointは`additionalFields=installUrl`でApple/Androidの直接install URLを追加できるが、対応端末とインターネット接続が必要。v2.5 docsは注文POSTによるorganization balance deductionを明記する一方、同endpointのclient idempotency keyを文書化していない。現行コードは事前validate、注文単位D1 one-shot marker、transaction timeout/503時のresend禁止、provider_completedのassignment GET再開を実装する。Apple/Android URLは許可host/path/carddataを検証してからICCID/Matching ID/SM-DP+と共にAES-GCM暗号化し、owner認証・one-shot delivery APIからだけ返す。購入履歴のeSIM設定コンポーネントは実装済みで、本人の操作後に限り状態を照会し、暗号化導入情報を一度取得してApple/Androidの直接追加リンクまたは手動SM-DP+/有効化code/ICCID手順を表示する。導入確認後は本人の明示操作でサーバー側暗号文を消去する。ホスト側の40件のeSIM試験は合格しているが、サインイン済みブラウザーでの画面受入は未実施。OS Brokerのfresh capability snapshotとは未接続で、対応機種・直接追加可否を購入前に自動判定しない。QR画像fallback、実機LPA/QR導入、eSIMプラン選択・購入・決済route、Sky利用権への端末導入証明連携も未受入。Matching ID等はDBへ平文保存せず、issue service responseにも含めない。[v2.5 Create orders](https://docs.esim-go.com/api/v2_5/operations/orders/post/) · [v2.5 assignments](https://docs.esim-go.com/api/v2_5/operations/esimsassignments/get/) · [Callback V3](https://docs.esim-go.com/guides/webhooks/) · [QR/install guide](https://docs.esim-go.com/guides/qr_delivery/) · [eSIM Go release notes](https://docs.esim-go.com/releases/release_notes/)

### AndroidでeSIM追加完了を判定する境界

Androidの`EuiccManager.downloadSubscription()`は通常アプリが常に無人実行できるAPIではない。`WRITE_EMBEDDED_SUBSCRIPTIONS`、または対象profileのcarrier privilege等の認可が必要で、前者がない場合はOSの確認画面を求める結果になることがある。AOSPのeSIM経路ではframeworkが利用可能なLPAを選び、eUICC操作をLPAへ渡す。アプリにinstall URLを渡しただけで、LPA権限や特権が付与されるわけではない。 [Android `EuiccManager`](https://developer.android.com/reference/android/telephony/euicc/EuiccManager) · [AOSP eSIM overview](https://source.android.com/docs/core/connect/esim-overview) · [AOSP eUICC APIs](https://source.android.com/docs/core/connect/esim-euicc-api)

Android 15（API 35）以降には、Device Owner／Profile Ownerまたは管理対象subscription権限を持つアプリが、その管理主体としてダウンロードしたprofileを管理する経路がある。`switchAfterDownload=true`による自動有効化はorganization-owned deviceのDevice Owner／Profile Ownerに限られ、非organization-owned deviceのProfile Ownerは`false`にする必要がある。複数有効SIMの空きportがない場合など、管理端末でも確認や別操作が必要になり得る。このため一般BYOD向けの通常アプリと、会社所有・管理者登録済み／OEM統合端末を別の適合tierにする。自動導入を提供するSKUでは、端末所有権の登録方法、Device/Profile Ownerの設定主体、eUICC/LPA実装、OS/API版、空きport・carrier privilege時の挙動、失敗・取消callback、profile導入の署名証明まで受け入れる。これはRockstarOSが端末OSを「ジャック」する機能ではなく、適切に管理・認可された端末のeSIM導入adapterである。[Android `downloadSubscription()`](https://developer.android.com/reference/android/telephony/euicc/EuiccManager#downloadSubscription(android.telephony.euicc.DownloadableSubscription,boolean,android.app.PendingIntent))

`SubscriptionManager.getActiveSubscriptionInfoList()`も`READ_PHONE_STATE`またはcarrier privilegeが必要。現行Brokerはこれらの権限を要求せず、ICCID/EIDやprofile一覧を読まず、`activeProfile=not_inspected`を維持する。したがってProviderが注文を受けた、Androidの追加画面を開いた、または利用者が「追加した」と押したことを、インストール証明やRockstarOS利用権有効化へ昇格させない。

現在の注文status APIは`providerProfileBoundToOrder`、`deviceInstallState=unverified`、`esimDeviceEntitlementState=not_connected`を分けて返し、購入履歴UIにもこの境界を表示する。実際の端末利用権を連携するには、契約先が提示する署名付きprofile-install証跡（owner/device challengeと注文profile digestに結び付き、ICCID/EIDの漏えいを避ける方式）またはOEM/carrier privileged integrationが必要。どの契約先がこの証跡を提供できるかは未確認で、sandbox質問・実機受入の必須項目とする。Androidの一般API経由で識別できない場合、表示は`unverified`のままとし、端末利用権を自動有効化しない。

### 2026-10-01 host gateway activation contract

The local Worker/D1 adapter now has `POST /api/esim/orders/{orderId}/device-entitlement`. The signed-in owner requests a one-use, five-minute challenge only after a paid, unrefunded Sky order is bound to a provider profile and a verified carrier/OEM installation receipt. The challenge pins owner, order, profile digest, installing device, install-receipt hash, and the full starter-pack ID/version/canonical manifest hash. The native gateway returns a domain-separated Ed25519 or ES256 (ECDSA P-256/SHA-256) receipt with `activationState=installed_enabled`; the Worker accepts it only from an operator-provisioned key bound to that exact owner and device in `ESIM_DEVICE_GATEWAY_KEYS`. Trust entries fix the signature algorithm and raw public-key encoding. D1 atomically stores one entitlement per order and consumes the challenge. A retry is idempotent. Status rechecks payment/refund state, provider profile, install receipt, current active key, and current reviewed pack hash before reporting activation. ES256 was added to support Android hardware-backed P-256 keys; this is a host contract implementation, not Android key attestation or device-gateway integration. [Android Keystore](https://developer.android.com/privacy-and-security/keystore) documents hardware-backed ECDSA P-256 support, and [Android Key Attestation](https://developer.android.com/privacy-and-security/security-key-attestation) describes attestation chain validation requirements.

The contract inventory contains only public keys; corresponding private keys must remain device-bound and non-exportable. The host fixture proves cryptographic and database behavior, not genuine device identity. Before sandbox or production, obtain from the OEM/carrier: key provisioning and recovery API, hardware-backed attestation format and verifier, exact OS/Broker build measurement binding, key rotation and revocation feed, secure eUICC install observation tied to the order challenge without ICCID/EID exposure, and ownership transfer/device replacement rules. Android's ordinary app surface currently does not inspect active eSIM profiles, so an OEM/carrier privileged path is required to issue a trustworthy installation receipt. Until those external contracts exist, this route is a locally testable adapter and cannot activate a real device.

Configuration shape (fixture example only; never use its key or identity in a deployment): `ESIM_DEVICE_GATEWAY_KEYS=[{"authorityId":"oem-authority","ownerUserId":"owner-id","deviceRef":"device-id","keyId":"device-key-2026-01","algorithm":"ES256","publicKeyHex":"04<128 hex chars>","status":"active"}]`. ES256 keys use an uncompressed 65-byte P-256 point; Ed25519 keys use 32 raw bytes. Reject malformed, duplicate, revoked, unknown, or mismatched identities; don't accept device self-enrollment. Keep checkout and provider debit disabled.

2026-10-01 Android Core and AndroidKeyStore source: the Worker challenge returns the exact `receiptContext` needed by the native signer. `android/core` contains an Android-independent Java receipt builder that checks owner/order/profile/device/install-receipt binding against locally verified `installed_enabled` evidence, requires a hardware-backed P-256 signer, converts JCA DER ECDSA to the 64-byte P1363 signature expected by WebCrypto, and refuses expired challenges, revoked/software keys, wrong curves, or mismatched evidence. `android/automation` has a Broker-side AndroidKeyStore P-256 key lifecycle adapter with TEE/StrongBox checks, attestation-chain export, nonce-derived alias, and same-challenge retry. Shell API v5 now reaches that Broker method through the exact-signer Binder boundary; Shell's developer settings accept a manually transferred server challenge JSON and label the result as pending server/install-proof verification. An invalid-input Binder instrumentation assertion is present. Android-independent Core tests (60/60), OS source contract, Android architecture, and full `npm run verify` pass. Android SDK platform/build-tools are absent, so APK/AIDL compilation and instrumentation were not run. Neither Android-side `hardwareBacked` nor certificate-chain export is remote attestation acceptance. Browser-to-app automatic handoff, authenticated Worker submission, carrier/OEM install proof on-device, and physical enrollment remain unimplemented/unaccepted.

### Android key attestation trust path

Do not add a self-service endpoint that copies a submitted public key into `ESIM_DEVICE_GATEWAY_KEYS`. The key inventory stays operator-controlled until a verifier proves the key came from the expected app and an acceptable device state. Android's guidance requires verification away from the device, a trusted root, valid certificate signatures, current revocation checks, and checking the attestation extension; the hardware security level must be TEE or StrongBox. The Android attestation extension is not guaranteed to be on the leaf certificate, so the verifier must select the nearest-root certificate containing the first trusted extension. [Android key-attestation requirements](https://developer.android.com/privacy-and-security/security-key-attestation)

The verifier implementation is a separately operated JVM service using the Android team's Apache-2.0 [`android/keyattestation` verifier](https://github.com/android/keyattestation), rather than trusting a mobile `KeyInfo` flag or hand-parsing ASN.1 in the Cloudflare Worker. Its inputs are a bounded X.509 chain, the one-use server challenge, expected package/version/signing-certificate constraints, and an operator policy for acceptable security level / verified-boot state. It refreshes Google revocation status for each check and fails closed when that source is unavailable. The Worker calls it over TLS with a bearer secret and checks a strict response schema, pinned verifier commit, challenge ID/hash, package identity, device state, and public-key digest before it can add the owner/device-bound key to a D1 registry. The receipt must use that exact attested key. This code path exists but the dynamic Worker-to-JVM-to-D1 path has not yet passed end-to-end acceptance; do not treat it as deployed or device accepted.

The attestation challenge is freshly generated by the server and persisted against owner, device, order, profile digest, install receipt, starter pack, and expiry; the verifier checks exact challenge equality and application identity to reduce replay/relay risk. Attestation only proves key/device properties; it does not prove that a particular eSIM profile was installed and enabled. That still requires separate OEM/carrier signed install evidence tied to the same owner, device, order and profile digest. The verifier source is pinned to commit `55c35040a1b5b72e6d63bfb150c5c68a175c1462`. Host tests cover the verifier policy/parser and API response validation; the Worker route and D1 key registry still need end-to-end acceptance with an actual verifier service and Android device.

Android's official guidance also notes a new attestation root began signing chains on 2026-02-01, so production code must not pin only an older static root. [Android key-attestation root and revocation guidance](https://developer.android.com/privacy-and-security/security-key-attestation) · [Android verifier API and challenge guidance](https://github.com/android/keyattestation).

### 契約前に相手へ確認すること

1. RockstarOSブランドで日本の個人へ販売できるか。販売主体、通信事業者としての責任、本人確認/KYC、消費税・請求書、利用規約/プライバシー、通信障害・返金の責任分界は何か。
2. 日本国内・海外 roamingの対応国/ネットワーク、data-only/voice/SMS、番号の有無、速度制限、APN、fair-use、テザリング、緊急通話制限、coverage実測値は何か。
3. wholesale単価、通貨、最低利用/前払残高、期限、失効、top-up、為替、税、取消/未使用refund、volume tier、請求データの遅延を見積書で示せるか。
4. sandboxは金銭・実profileなしで注文からinstall-ready eventまで再現できるか。productionへ切替えるapproval processと試験用ICCID/eUICCはどうなるか。
5. API idempotency keyのendpoint対応表と保持期限（1GLOBAL公開仕様の既定24時間を超えた時の照合方法を含む）、重複event ID、署名のrotation、replay防止、status照会、発行不明の解消、取消/停止、障害SLAとrate limitをどう提供するか。
6. QR/activation code/SM-DP+等の機微値を返す場合、取得回数・再表示・有効期限・削除・監査ログ・support access制御はどうなるか。RockstarのDBへ平文保持せずに済むか。
7. branding/activation screen、端末に表示される回線名、Android/iOS LPA手順、carrier entitlement/OEM連携の要件と、RockstarOSの表示名が変えられる範囲はどこか。Android Direct Install等が使える場合も、端末側の導入許可・初期OS導入権限まで与えるわけではないことを契約仕様で確認する。
8. Androidの通常BYODアプリ、carrier privilege付与端末、Android 15以降のDevice/Profile Owner管理端末、OEM/system LPA統合SKUごとに、download・enableの主体、利用者確認、multi-active SIMのport競合、callbackと署名付きinstall証明を誰が提供するか。会社所有端末のprovisioning（初回enrollment・factory reset後の再enrollment・所有権移転）はどのEMM/OEMと手順で成立するか。
9. 顧客データのregion/retention/subprocessor、越境移転、security certification、incident通知期限、DPA、監査権、契約終了時export/deletion条件は何か。

**契約試験の合格条件:** sandboxで1件を作成し、Skyの購入注文・本人・device enrollmentへ結び、応答消失、duplicate callback、status照合、取消/失効を試す。profile secretをログ・Analytics・LLM・一般画面へ出さない。LPA/eUICCでinstall完了を確認するまではRockstarOS準備済みにしない。

## A2A Provider sandboxで確認する条件

A2A 1.0の標準JSON-RPCでは`SendMessage`要求にクライアントの`messageId`を含められるが、重複要求のdedupeは任意で、task IDは新規task作成後にProviderが生成する。応答が失われると`GetTask`へ渡すID自体がないため、標準だけではaccepted-but-unansweredを一意に照会できない。[A2A 1.0 Idempotency / Task Identifier Semantics](https://a2a-protocol.org/v1.0.0/specification/)

契約先のsandboxで次を受け入れるまで、A2A送信を本番で有効にしない。

1. `messageId`をProviderがどの期間・scopeで保持し、重複`SendMessage`を同じtaskとして返すか、同じtask IDとusageを返すか。
2. 応答を意図的に切断した後、`messageId`またはProvider発行request referenceからtaskを一意に照会するAPI・保持期間・認証scope。`GetTask`がtask IDのみ受け付ける場合は、request reference照会を別APIで示す。
3. 受付済み・拒否・未受付・照会不能を区別する署名付きreceiptと署名鍵rotation手順。単なるHTTP 200/503やLLM本文を課金証跡にしない。
4. `CancelTask`の受付応答、実行停止確認、停止後最終利用量を区別するfieldと照会手順。取消受付だけで停止・settlement済みにしない。
5. restart後にも照合できるtask/request保持期間、rate limit、usageの通貨・単位・価格版、重複usage receiptの識別子と訂正/reversal。
6. taskがactiveな間に送る累積meter snapshotの通知先、署名鍵/key ID、event ID、連番、課金単位、pricing version、通知頻度/遅延、再送・順序逆転・訂正/reversal semantics。snapshotは最終請求額ではないこと、予約上限へ達した時のProvider側停止保証または超過を防ぐ同期制御、final receiptが最後のsnapshot以上になる照合規則をsandboxで確認する。契約側で累積meterを提供しない場合、Zemaは予約/見積と「meter未報告」を明示し、実行中費用を捏造しない。

受入では同一`messageId`を使った再送が二重task・二重課金にならないことを確認する。ただし自動再送を許可するのは、契約された重複動作・照会結果が一意で、Rockstar側で同じ親job・子task・approval digestへ結べた場合だけとする。状態が確定しないケースは`indeterminate`と予算holdを維持する。

## クラウド候補と費用境界（公開料金、2026-10-01再確認）

| 候補 | Rockstarで担う範囲 | 公開条件（確認日） | 適合と制約 |
|---|---|---|---|
| Cloudflare Workers + Workflows + D1 + R2 | 認証済みjob受付、durable controller、status API、timer/poll、暗号化artifact | Workers Paid base $5/month。Standardは月10M requestと30M CPU msを含み、超過request $0.30/M、CPU $0.02/M ms。WorkflowsはPaidで月500k stepを含み、超過$0.80/100k steps。D1は月50M row writes・25B row reads・5GBを含み、超過write $1/M、read $0.001/M、storage $0.75/GB-month | 既存Cloudflare Workflow/D1実装と近い。durable stepは外部API呼出しの失敗点を分離し、前stepから再開できる。Worker invocation CPU/memory limitsはあるため、LLMやuntrusted codeの長時間計算をworkerで直接させない。D1/Workflows/R2各計上、logs/observability、外部model/agent費は別 |
| Cloudflare Containers / Sandboxes | Workers controllerの配下に置く、低〜中規模の隔離Linux/CLI実行候補 | Workers Paid $5/monthにコンテナ使用量としてmemory 25 GiB-hour、CPU 375 vCPU-minute、disk 200 GB-hourを含む。超過memory $0.0000025/GiB-second、CPU $0.000020/vCPU-second、disk $0.00000007/GB-second。egressはAPAC $0.05/GB（500 GB/month allotment） | 2026-04-13に一般提供。現行instance上限は4 vCPU/12 GiB/20 GB。実行時分離とscale-to-zeroに適するが、GPUは公開instanceにない。containerとWorker/DOの料金を合わせ、outbound host allowlist、secret受渡し、region/data handlingを実装試験する必要あり。今回のrepoには接続していない |
| Google Cloud Run | containerized isolate worker、長めのcontainer task、必要時GPU inference | 公開料金はregionとCPU/memory/instance billingで従量。公式pricing例ではCloud Run worker pool 1 vCPU/512MiBを1か月常時稼働で$11.61/月（free tier適用時。free tier抜き$16.83）。公式GPU service例は4 vCPU/16GiB + NVIDIA L4の特定traffic patternで$822.40/月 | containerの任意runtime/GPUは有利だが、この例をRockstarの実費見積としない。Cloud Run Jobsの実行上限・起動待ちはjob要件と照合する。再試行は副作用APIを自動再送しないよう独自idempotency/outboxが必要。Cloud Build/Artifact Registry/Eventarc/egress/LLM API等が例示額外 |

CloudflareはWorkflowsに永続multi-step実行、自動retry、長時間pause/resumeを提供。Workers Paidは月額最低$5。2026-08-10以降Workflowsは月500,000 steps、1GB-month storageが含まれ、超過stepは$0.80/100,000、storageは$0.20/GB-month。D1は月25B rows read・50M writes・5GBを含み、超過はread $0.001/million rows、write $1/million、storage $0.75/GB-month。R2は10GB-month、Class A 1M、Class B 10Mが含まれ、標準超過単価はstorage $0.015/GB-month、Class A $4.50/M、Class B $0.36/M、Internet egress無料。Containers/Sandboxesは隔離実行を追加できるが、現行repoのWorkflows/D1実装とは別に安全境界・復旧・使用量計測を受け入れる必要がある。[Workflows durable execution](https://developers.cloudflare.com/workflows/get-started/guide/) · [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Worker limits](https://developers.cloudflare.com/workers/platform/limits/) · [Containers GA](https://developers.cloudflare.com/changelog/post/2026-04-13-containers-sandbox-ga/) · [Container limits](https://developers.cloudflare.com/containers/platform/limits/) · [Google Cloud Run pricing](https://cloud.google.com/run/pricing)

GoogleはCloud Runをrequest-driven service、task-driven Jobs、pull-driven Worker Poolsに分け、Cloud Run Jobsの個別task timeout/retryを設定できる。価格例は特定region・resource・使用率条件に限る。[Cloud Run pricing](https://cloud.google.com/run/pricing) · [Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs)

### Rockstar内の従量請求との接続

クラウドのinvoiceは、本人が払う通信費やAI従量額とは別に扱う。Cloudflare/Googleの共通基盤費、agent/API利用料、GPU費、eSIM卸単価、mobile data plan、creator payoutを別meter・別通貨・別price versionで記録する。利用者向けの実請求を有効にするのは、Wallet側の原子的予約、Providerの価格/利用量証跡、返金/reversal、月末invoice照合が接続され、契約上の課金主体が決まってからとする。

クラウド上で受付済みjobを続けるには永続job storeだけでなく、provider retryの前にpersistされたone-shot dispatch marker、indeterminate照合、expiry/cap停止、worker isolation、result encryption、owner authorizationが必要。本repoにCloudflare Workflows/D1の試作はあるが、production binding/secret、successful independent A2A provider、圏外端末との実機縦断は未受入。[continuity design](sky-cloud-continuity.md)

### 契約後のCloudflare secret・cron設定

Runtime WorkerのD1 bindingと1分cronは[wrangler.jsonc](../services/sky-agent-runtime/wrangler.jsonc)に定義済み。契約・production project選択後に、placeholderのD1 IDを実IDへ置き換え、migration適用とreadbackを確認する。secretは設定ファイルやGitへ書かず、Cloudflare secret storeへ投入する。

eSIM発行／callback endpointには`ESIMGO_API_KEY`、`ESIMGO_CALLBACK_DEDUPE_SECRET`、`ESIMGO_PROFILE_HASH_SECRET`を設定する。共有Sky Runtime Workerには`ESIMGO_API_KEY`、同じ目的で発行した`ESIMGO_PROFILE_HASH_SECRET`、および`ESIMGO_INSTALL_MATERIAL_KEY`を個別secretとして設定する。dedupe key・profile HMAC key・AES-GCM material keyは相互に異なる値とし、callback用keyやprovider API keyを暗号化keyへ流用しない。A2Aの`A2A_DELEGATION_EXECUTION_ENABLED`はeSIM設定から独立したままdefault-offにする。

契約後の受入順は、(1) sandbox credentialで署名付きcallbackを受ける、(2) shared D1 migration／secret bindingを読み戻す、(3) scheduled eventを一回起動し、既知referenceのGETだけが発生することとD1 stateを照合、(4) Workflow/Worker再起動後も同じProfileへ復帰しtransactionが増えないことを確認、(5) profile-issuing POSTのresponse-loss / idempotency scenarioを行い同一provider orderの復旧と一回のみの請求を証明、(6) 実端末へinstallして利用権とoffline capabilityを別々に検証、の順とする。unknown outcome recoveryを通過するまでprovider debit gateを開かない。未契約のprovider key、D1 ID、production secretを本書へ記載しない。これらの設定・sandbox・production受入はまだ実行していない。

## API構成案を提示する時の必須境界

- `identity + Sky order/access + device capability`をまとめ、eSIM orderは本人の明示操作と再認証に結びつける。AI agentはplanを提示できるが実注文・top-up・費用上限変更を承認できない。
- Provider webhookはraw-body signatureを検証してからdurable inboxへ記録し、event ID/order/profile versionでdedupeする。署名失敗、順序逆転、重複はprofileを再発行しない。
- carrier secretsをeSIM adapterだけへ渡す。activation materialは短命・暗号化し、別APIのowner authorizationを得ないagentに返さない。
- `requested → issued → downloaded → installed → network-attached → service-enabled`を別状態にする。単に回線名が端末表示された状態をRockstarOS/LLM-readyにしない。
- cloud job acceptanceはprovider task完了と別状態。remote providerへ指示送信が不明なら同じremote taskを照合し、二個目へ再送しない。
- 価格表・対象国・API version・契約条項をversioned artifactにし、各job/eSIM orderにsnapshot digestを保存する。

## 現在の完成度

**契約準備:** 2026-10-01に公式技術資料・公開料金を再確認し、1GLOBALの一般24時間idempotency window、Cloudflare Containers/SandboxesのGAとresource limits、Cloud Run worker/GPUの公式例、eSIM Goのdirect-install URL条件を追記。注文API個別のidempotency/correlation確認を必須contract gateへ追加した。技術API比較・質問票・候補構成を用意済み。商用価格、販売責任、データ処理契約、契約主体、正式提案/見積は未取得。

**開発:** eSIMはhost/local-D1 fixtureの署名付きcallback inbox、server catalog、one-shot issuance、read-only known-reference reconciliation、profile-digest callback correlation、owner-bound install-material deliveryを実装。callbackは既存paid orderへ一致する場合のみ関連付け、通知だけでは利用権を有効化しない。初期Agent Pack ID/versionとSky Package ID/manifest SHA-256はeSIM orderの不変pricing snapshotへ含み、発行前に現行のverified + 有効reviewを照合する。Pack未登録・review失効・hash違いは発行を拒否する。これは利用可能候補を固定するだけで、端末導入やTool実行許可を行わない。Cloudflare A2A/controllerはsourceとhost/local Workflow testsがある。実Provider account、cloud production environment、eSIM order/Wallet entitlementの本番接続はない。

**今回追加したもの:** `POST /api/esim/webhooks/esim-go`はV3 raw-body HMAC検証後にD1 inboxへevent digest/typeと専用secret HMAC化profile referenceだけを書き、raw ICCID・本文は保存しない。internal binding helperはlive/paid・buyer・package key・manifest hash・refunded amount=0を照合。現行v2.5 clientはvalidate + expected currency/wholesale capを確認し、review-active paid Sky orderへone-shot markerを先に保存してから単一transaction POSTを行う。provider clientはretryしない。timeout、503、不正応答は`reconciliation_required`へ止め、同じSky orderの再要求で新しいtransactionを送らない。provider successを記録した後、profile digestだけをbinding tableへ保存し、binding失敗後は保存済みorderReferenceからassignment GETを使って再開する。GET応答のICCID digestが保存値と一致しなければbindingしない。Matching ID/SM-DP+およびdirect-install URLはdatabaseへ平文保存せず、issue service responseにも含めない。Apple/Android URLは公式host/path/LPA carddataを検証し、既存のowner/order AES-GCM材料へ保存して、owner認証・one-shot delivery APIから返す。provider transactionはserviceの`providerDebitEnabled` gateがtrueの場合だけ進む。実装済みはserver plan catalogと不変pricing snapshot、owner認証status/read-only reconcile、暗号化install-material/direct-link delivery、購入履歴向けの明示操作型eSIM状態・導入画面、既知order referenceに対するscheduled provider GET照合、およびsigned callback profile digestのknown-order correlationまで。未接続・未受入は既存Sky checkoutからの販売条件/本人認証連携、サインイン済みブラウザーでの画面確認、端末能力に応じた購入前判定、QR画像fallback、production D1/secrets/cron、実provider account/key/sandbox注文、Cloudflare再起動受入、実端末installと利用権連携である。

**2026-10-01 initial agent pack:** server plan catalog now requires each eSIM plan to name a starter pack ID/version and pin 1–12 exact Sky Package keys and SHA-256 manifest hashes. The order's existing canonical pricing snapshot locks those references for retry/reconciliation. Immediately before a new issue request, the authenticated server resolves every reference against Sky's current verified registry and rejects missing, unreviewed, expired, revoked, or changed manifests before provider egress. This does not provision packages to a device, activate entitlement, install a model, or grant a Tool permission. No Lifeline/Developer production pack or actual eligible healthcare agent is configured yet; device proof and native gateway are still needed for activation. The contract-pending plan catalog now also shows each configured pack before purchase; it derives Package name/summary only from the exact currently reviewed registry manifest, and reports changed or unavailable packages as unavailable. Purchase stays disabled. This display still does not establish device compatibility or activate the pack.
