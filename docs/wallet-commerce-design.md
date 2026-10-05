# Wallet 統合詳細設計

2026-10-01 / Design 1.0 / 対象SHA `b3e2676abd8ae2a0b3f78f48483e067b429d9bc8`。[決済統合設計](sky-commerce-design.md)と一体の設計。ユーザーの「walletも一緒に設計して」を反映。追加の実装・実決済・本番設定は未実施。初版は外部Providerの口座と決済状況を統合するWalletを提案し、チャージ残高・暗号資産購入は希望確認後の別能力とする。

## W1. Walletの役割と一貫した体験

WalletはSkyでの購入、売上、返金、受取先、銀行への払出しを一つの場所で確認・照合できる画面とAPI。資金の移動はStripe等のProvider、購入と商品条件はCommerce、画面用集計はWallet projectionが担当する。

買う人は「何に支払ったか」「支払済みか」「返金はいつどこへ戻るか」「使えるか」を見る。販売する人は「売上が確定したか」「どの費用が差し引かれたか」「Provider内で受取可能か」「銀行へ送られたか」を見る。同じ人が買い手・売り手を兼ねても、支払と収入を混ぜた一つの残高にしない。

既存手入力帳簿の収支は「手入力の収支記録」として残し、Provider確認済みの決済と明示区分する。既存native合成Walletに実決済残高を移し替えない。商品購入はJPY、通貨違いは別集計であり、為替換算残高や暗号資産交換は初版に含まない。

## W2. お金の状態と正本

| 表示する概念 | 意味・正本 | 同じものとして扱わないもの |
|---|---|---|
| 注文金額 | 注文snapshotの確定総額 | 売上確定、銀行着金 |
| 支払済み | Stripeで当該PaymentIntent/Chargeの金額・通貨・宛先を照合 | return URL、checkout completedだけの申告 |
| 返金受付 | Rockに保存された返金指図 | refund succeeded、銀行/カード明細の反映 |
| 返金保留/確認中 | refund pending/requires_action/unknown、未解決指図 | 失敗、返金原資が戻ったこと |
| 返金済み | Providerの当該Refund IDがsucceeded | 購入者の金融機関に即時反映済みという保証 |
| 売上総額 | 照合済み購入chargeの集計 | 利益、売り手のavailable残高 |
| Sky手数料 | orderの算定額、実application fee回収額、返戻額を分離 | 第三者決済費用、税、銀行払出し手数料 |
| Transfer | platformからconnected accountへのProvider内配分 | connected accountから銀行へのPayout |
| Pending balance | Providerが現在pendingとする残高 | 売上予定の単純合計、すぐ使えるお金 |
| Available balance | Providerが当該account/currencyでavailableと確認した値 | Rockの支払いに利用できる預かり残高 |
| Payout | Providerから登録銀行等への払出し。paid/failed/canceled等を持つ | 注文単位のTransfer、購入者返金 |
| 銀行着金の確認 | Providerのpayout状態と必要な銀行照合の区分 | Stripe内部availableであること |

UIは初版でAvailableを「受取可能（Provider確認）」、Pendingを「受取待ち（Provider確認）」と表示する。この額でSky商品を直接購入できる機能は提供しない。集計は必ずaccountとcurrencyとtest/liveを固定する。

Provider残高は負数になり得る。表示用のsigned amountは負数を0に丸めない。負数の理由がProviderで特定できれば返金・紛争・費用への参照を示し、未特定なら「Providerで確認が必要」とする。Rockが自動で利用者に新しい債務・請求・チャージを生成しない。Provider契約上の回収は別の事実として記録する。

## W3. 画面構成

### `/wallet` — Home

上部に本人、表示役割「支払い/売上・受取」、環境、最終照合時刻を出す。通常はliveを表示し、testは明確に表示して切替える。カードの合計を一つの「総残高」としない。

買い手の主な表示:

- 最近の支払い、返金確認中、対応が必要な購入。
- 商品名・版、支払額、提供者、状態、注文番号。
- 「購入済み・接続待ち」「利用可」「返金確認中」「利用停止」の違い。

売り手の主な表示:

- 確認済み売上総額、返金成功額、決済手数料等の確認状況。
- 受取可能/受取待ち残高はStripeのconnected accountから取得できた場合だけ表示。
- 銀行払出し処理中、Providerからの対応依頼、未照合差額。

金額をまだ取得していなければ「未確認」とし、0円を表示しない。データが古ければ直前の額と最終確認時刻を示す。購入処理中の二重押下は「確認する」へ誘導し、新規支払いに誘導しない。

### `/wallet/accounts` — 受取先・接続先

初版の実接続対象は既存Stripe Connectの提供者受取先。Providerが保持する銀行番号やカード番号をRockへコピーせず、Providerが返す表示名/末尾等の最小限のマスク情報だけを扱う。

`not_connected / onboarding_required / pending_verification / ready / restricted / suspended / disconnected`を画面状態にする。これはProvider access状態と決済capabilityをまとめたprojectionであり、新しいKYC判定を内製しない。`charges_enabled`、`payouts_enabled`、capabilities、未充足requirementsはそれぞれ保存し、単一connected booleanから使用可能と推測しない。

「受取先を設定」は既存onboardingへ進む。return URLへ戻っただけではreadyにせず再取得する。「接続解除」は以後の新規販売/新規権限を止める操作であり、未解決返金/払出しの履歴や照合権限を消さない。Provider accountの削除、銀行変更、カード管理はProvider側の本人画面で行う。

同一アカウントの複数端末は同じ受取先を参照。別buyer/sellerの受取先情報は取得できない。口座変更で既存注文のdestinationを上書きしない。

### `/wallet/activity` — 履歴

支払い/売上/返金/紛争/手数料/Transfer/Payoutのfilterを用意。イベント一覧をただ並べて同じ取引を何度も加算せず、一つのbusiness transactionを主行、関連eventを詳細timelineにする。

一覧項目は `transactionId`, `kind`, `role`, `title`, `currency`, `displayAmount`, `status`, `occurredAt`, `lastVerifiedAt`, `nextAction`。詳細にはorder/refund/charge/transfer/payoutの対応、元取引、照合根拠、条件snapshot、receiptを置く。Provider IDはsupport向けにコピーできるが、token・秘密・生カード情報・raw webhook本文は表示しない。

発生時刻とRockが確認した時刻を分離する。後着通知で過去の履歴に事実が追加されることを許す。確定済み記録は削除・上書きで隠さず、原取引参照の取消/調整を追記する。

### `/wallet/activity/[id]` — 操作と復旧

- 買い手: 支払状態確認、提供者への問い合わせ情報、商品接続、領収書。
- 売り手: 自分の販売だけ返金操作、返金状態確認、Providerの対応画面。
- 返金は金額・対象注文・既返金・残額・利用権停止を表示し明示確認後に受付。
- 買い手の「返金を希望」は申請/案内であり売り手権限のrefund APIを呼ばない。返金申請workflowを未実装のまま完了できると表示しない。
- 通信不明は「結果を確認中」。同じ指図の照合のみ行い、金額を変えた新しい返金を生成しない。

### `/wallet/reconcile` — 確認が必要な取引

本人の未解決注文、返金不明、紛争、payout failure、Provider残高との差分を表示。操作は照合/Provider手続きへの案内であり、帳簿数字を手入力して「一致」にする操作は設けない。owner向け診断と一般利用者画面を分け、他人のpayment/口座情報を運営用エラーへ混ぜない。

## W4. API境界案（未実装）

既存 `/api/wallet` の手入力帳簿APIを維持し、決済用read-modelは追加pathにする。Commerceと同じ認証済みBFFを利用し、browserにProvider secretや接続accountを任意指定させない。

| API案 | 入力 | 出力/作用 |
|---|---|---|
| `GET /api/wallet/commerce/summary` | role, period, cursorなし | 本人のaccount/currency別集計、未確定項目、asOf |
| `GET /api/wallet/commerce/accounts` | なし | 本人の受取先projection、capability、nextAction |
| `GET /api/wallet/commerce/activity` | role/kind/status/currency/cursor、limit<=100 | opaque cursorの取引一覧 |
| `GET /api/wallet/commerce/activity/:id` | id | 本人/role検査後の原取引とtimeline |
| `POST /api/wallet/commerce/reconciliations` | businessReference, requestKey | 同一取引の照合job受付、外部資金指図なし |
| `GET /api/wallet/commerce/reconciliations/:id` | id | pending/running/completed/unknown/needs_review、照合時刻、次の操作 |
| 既存Commerce onboarding/refund API | 既存の本人・snapshot・idempotency契約 | 外部作用の唯一の入口を再利用 |

`mode`はserver configurationまたは明示認可されたtest contextから決める。生のuserId/issuer/subject/Stripe accountをqueryに渡して別本人のscopeを選べない。summaryは一覧先頭100件の足し算で作らず、全対象の正規projectionを集計する。期間は元Charge発生日時で選び、そのCharge群の現在返金状態を示す。返金発生日基準の現金収支とは異なるため画面に集計基準を表示する。本人が所有するconnected account残高のみを表示し、購入者画面へplatform全残高を返さない。最大表示件数と集計範囲を混同しない。

購入者のdetailには自己注文の支払/返金/利用権だけを返し、販売者Payoutの全membership・Transfer・残高取引内部相関を返さない。販売者は本人のconnected accountに限りPayout詳細を見られるが、他者の本人ID・別商品の私的情報は必要最小限へ投影する。opaque IDでも他者scopeの明細を辿れる権限とはしない。

処理を起こすPOSTは既存same-origin/CSRF/本人確認契約を適用。照合queueにもowner別quota、backoff、Provider rate limitを設ける。同じreceiptを無限再取得できる公開APIにしない。

共有DTOは `docs/contracts/sky-wallet-v2.ts`。cursorは本人・role・mode・通貨・filter・親ID・projection snapshotに束縛し、scope違いは400、別本人の取引は404、snapshot期限切れは409で一覧を更新する。v1決済のエラー形とは分離する。初版はJPY以外を400 `UNSUPPORTED_CURRENCY` で拒否する。

## W5. 追加保存契約

Walletに独立した支払可能残高は持たせない。以下はProviderとCommerceのread-model/相関保存。

### 受取先

`wallet_provider_accounts`: `id`, `principalId`, `providerId`, `mode`, `providerAccountId`, `kind`, `status`, `capabilities`, `requirementsSummary`, `lastVerifiedAt`, `revision`, `disconnectedAt`。

Stripe sellerは既存 `sky_commerce_sellers.account_id` を正本にしてviewまたは同一transactionで派生させる。Wallet account表に独立したaccount選択を持たせて二重正本にしない。

### 残高snapshot

`wallet_balance_snapshots`: `id`, `providerAccountId`, `mode`, `currency`, `availableMinor`（signed）, `pendingMinor`（signed）, `reservedMinor`（Providerが明示した場合だけ、nullable）, `providerAsOf`（不提供ならnull）, `observedAt`, `evidenceRef`, `sourceRequestId`, `reconciliationState`。

snapshotは`available=売上-返金-10%`で計算しない。Providerが返すaccount残高には他期間・他売上・調整が含まれる可能性を明示し、Sky取引だけの集計と混同しない。

### 取引・相関

`wallet_activity_projection`: business transactionの表示行。`sourceDomain`, `sourceId`, `principalId`, `role`, `providerAccountId`, `mode`, `currency`, `kind`, `status`, `amountMinor`, `occurredAt`, `lastVerifiedAt`, `revision`。

uniqueは `(principalId, role, sourceDomain, sourceId, mode)`。同じ取引を買い手の支払と売り手の売上で見せるのは別roleだが、同じviewerのsumで二重に足さない。

cursorのsnapshotを型だけの約束にしないため、activity projectionは表示行の上書きだけにせずversion行を保持する。本人・role・modeごとの `wallet_projection_commits` が単調なcommit revisionを発行し、影響した行versionと集計を同じtransactionで確定する。前述のuniqueは論理取引の一意性を表し、履歴version行の一意キーにはcommit revisionを追加して同じ取引の複数versionを保持する。`wallet_query_snapshots` は本人scope・filter digest・watermark・有効期限を保存する。各ページはwatermark以下で各sourceの最新versionを選び、`occurredAt, transactionId` の安定keysetで返す。異なるrow固有revisionを全体watermarkの代わりにしない。

snapshotの初期有効期間は15分の提案値。対応するversionをその期間以上保持し、期限後は409で再読込みする。snapshot作成時の権限を固定して将来の失効を無視せず、毎ページで現在の本人/role/口座の閲覧資格を再検査する。新しい返金や訂正は「更新あり」と示し、利用者のrefreshで新snapshotに切り替える。D1の一つのread snapshotが複数HTTP requestをまたいで自動維持されるとは仮定しない。

`commerce_provider_links`: order/charge/refund/application_fee/transfer/transfer_reversal/balance_transaction/payoutのProvider ID対応。1 payoutに多数のbalance transactionがあるため、orderId→payoutIdの1対1を作らない。返金とtransfer reversalも別reference。

`wallet_adjustment_events`: `eventId`, `sourceEventId`, `originalReference`, `kind`, `amountMinor`, `currency`, `mode`, `account`, `observedAt`, `reason`, `evidenceDigest`。修正は補償eventで、原receiptを編集しない。同じevent/observation/mutation IDの再送はexact replay、同じ不変IDで別内容なら隔離する。Refund IDやfee IDは相関キーであり、同じobjectのpending→succeeded→failed等の正当な状態変化は新しい観測IDで保存する。

### 照合

`wallet_reconciliations`: `id`, `scope`, `expectedRevision`, `leaseFence`, `status`, `differenceMinor`, `unmatchedReferences`, `lastAttemptAt`, `nextAttemptAt`, `providerRequestIds`, `resultDigest`。詳細なraw応答は最小限・アクセス制限・保持期間付きとし、公開Git/一般UIへ出さない。

## W6. Transfer・Payoutと実費の会計上の混同を防ぐ

1. Charge確認で売上総額とorderのapplication fee算定額を認識。
2. Stripeのapplication fee object、transferと関連balance transactionを照合し、回収済み/配分済みを別に記録。
3. Providerの決済費用、返金に伴う費用、紛争費用、fee返戻を実観測で記録。未取得を0円としない。
4. connected accountのpending/available snapshotを取得し、売上から単純計算した残額と別表示。
5. PayoutはProviderが発行したpayoutIdを状態追跡。failed/canceledならProvider内の残高復帰を追加照合する。
6. `payout.paid` はProvider上の払出し完了として表示する。銀行側の直接入金確認まで受入していなければ「銀行明細照合済み」と言わない。

10,000円の商品例: 注文支払10,000、Sky算定1,000、提供者配分予定9,000。ここで外部処理費用X、返金Y、fee返戻Z、Provider調整Tが未観測なら純手取り/銀行着金は未確定のまま。費用負担主体もProvider設定と商品条件から決まり、便宜的に売り手へ全額転嫁しない。

### 返金成功後に銀行から返却された場合

Refundの`succeeded`は将来変化しない終端とは扱わない。Stripeは銀行/カード会社の返却によって後日`failed`となり、返却額を示す`failure_balance_transaction`が付くと説明している。一部のカード以外の方法では`succeeded`から`requires_action`へ戻る。[Stripe返金失敗](https://docs.stripe.com/refunds#handle-failed-refunds)、[Refund object](https://docs.stripe.com/api/refunds/object)。

新しいfence/CASを持つProvider GETで原Refund ID・額・Charge・返却balance transactionを照合し、現在の返金状態は訂正する。過去に成功と観測したreceiptは消さず、返金成功額の取消とProvider残高への戻入を補償eventで追記する。未知の状態変化・証拠不足は隔離して手動照合へ。

結果不明予約と外部返金が重なる場合も、確認済み返金額を表示から落とさない。例えば成功返金5,000円＋未照合予約10,000円は別欄で示し、15,000円の返金済み/支払可能額にはしない。対応関係が解消するまで要照合とし、新規金銭操作を止める。

金銭状態の訂正と返金約束の解消は異なる。返金により契約を終了した後の銀行返却では、返金義務/代替対応が残るので購入権を自動復活させない。`refundCaseState: none / open / resolved / withdrawn`を運用上の別記録とし、`refundEntitlementDisposition=restore` の明示根拠がある場合だけ全条件を再評価する。代替返金済み・契約終了ならcaseがresolvedでもkeep_revokedとし、購入権を戻さない。

全額返金後のO1を閉じ、O2を再購入した後にO1の返金が失敗した場合、O1の補償と要対応を記録し、O2の購入権を古いO1のeventで変更しない。新たな請求/自動再返金/別口座送金は生成しない。

## W7. 本人・複数端末・キャッシュ・復元

本人はcanonical principal `(issuer, subject)` をBFFで解決する。現行のuserId/email-hash別名は本人確認された移行だけに使う。同じemailに見えるという理由や同じ文字列IDで別issuerを自動統合しない。opaque principalIdを注文/Walletへ結び、issuer変更/アカウント復旧は監査付き専用手続きにする。

同じprincipalの複数端末は同じ購入・口座・履歴を共有する。端末IDは認証/失効/監査の情報であり購入量や残高の単位ではない。Providerのbuyer OAuthが未連携でも金銭上の購入権を消さず、「購入済み・接続待ち」と表示する。SellerのProvider対応受入は販売gateでありbuyerリンクとは別。

offlineでは確認済み履歴cache、最終照合時刻、未解決件数だけを表示し、新規購入/返金/送金を開始しない。履歴が最新かの表示と操作許可は別。失効された本人/端末では古いcacheを非表示にし、未解決金銭指図はserver側の照合対象として保持する。バックアップは支払済みの正本を複製せず、再ログイン後にserverから復元する。金融approval・短命access判定・Provider秘密をそのまま復活させない。

## W8. 操作権限

| 操作 | 買い手 | 売り手 | Rock運用 | Provider |
|---|---|---|---|---|
| 購入/支払確定 | 条件を確認し自分で実行 | 不可 | 本人に代わり決めない | カード認証/決済 |
| 購入履歴/返金確認 | 自分だけ | 自分の売上scopeのみ | 必要最小限のsupport scope | 原取引照合 |
| 返金実行 | 申請/案内のみ | 自分の注文へ明示実行 | 明示された運用権限・監査時のみ | Refund実処理 |
| 受取先変更 | 対象外 | Provider本人画面で操作 | 無断変更しない | 本人確認/変更 |
| 銀行払出し | 対象外 | Providerの支払条件 | 自動送金権を持たせない | payout schedule/実行 |
| 台帳を修正 | 原記録は編集不可 | 同左 | 証拠付き補償event | 外部事実の訂正 |
| 照合再試行 | 自分の取引 | 自分の売上 | scoped operator | 読取API応答 |

初版はProviderが通常行う自動payoutの状態取得に留める。手動payout、即時payout、引出し、チャージ、別ユーザー送金を追加する場合はamount/source/destination/feeに結び付く独立契約と本人承認・受入が要る。

## W9. 追加受入

- 同じorderが購入履歴/Wallet/Provider receiptで額・通貨・mode・本人一致。
- 価格10,000・Sky1,000でも銀行着金9,000と未検証表示しない。
- charge paid→transfer complete→payout pending/paid/failedを別状態で復元できる。
- 部分返金・fee refund・transfer reversalがどの順でも原IDで1回計上。
- 他account、他currency、test/liveのeventで残高を混ぜない。
- 未取得のProvider processing feeを0として純利益確定しない。
- 負残高を0に丸めず、Rock独自の支払い義務を自動生成しない。
- payoutの1対多balance transactionと手動調整があっても差分を追跡できる。
- Provider account制限中でも新規販売停止・過去履歴確認・未解決照合ができる。
- 口座変更後も既存注文のdestinationと過去Transferが変わらない。
- 同一principal多端末で同じ取引、別issuer同subject/同emailでは共有されない。
- 返金通信断/再起動でも同一requestとProvider IDだけを再照合。
- API一覧100件超でもsummaryが全期間集計と一致し、paginationで抜け/重複がない。
- 削除要求/接続解除で必要な金融原記録を無断消去せず、表示・権限・保持を区別する。
- offline snapshotで資金操作を実行できず、最終確認時刻を失わない。

## W10. 将来拡張を入れる場所

チャージしてSkyで支払う残高は別financial capabilityとして追加する。導入時はcustody/資金主体、残高正本、top-up、spend reservation、chargeback、返金先、払戻し、負残高、法務/Provider契約を定義する。今のJPYの表示projectionに「支払う」ボタンを付けるだけでは実装できない。

暗号資産Walletは外部接続adapterを追加できるが、chain/token/decimals/finality/fee/recipientを独立させる。現在のRock自身の受取確認機能を利用者の預かりWalletへ転用しない。今回の設計は将来拡張の境界を確保し、ユーザーの明示条件前に本番能力として有効にしない。
