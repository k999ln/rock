# Rock synthetic game API contract — design draft 0.2

2026-09-09。**設計のみ。新しい endpoint、SDK、ゲーム台帳、交換workerは実装していない。実行結果・GX00/GX01/DX01合格を表す文書ではない。**

承認済み[製品設計v1.1](os-sky-wallet-game-design.md)、[実装承認記録](execution-approval-20260909.md)、[GX00分離ADR](gx00-owner-isolation-adr.md)の1契約1台帳・認証付き共通gatewayの方針をAPIへ具体化した候補。ADR本文の状態は「実装に渡す設計候補」であり、既存コードがその契約を満たすという意味ではない。

レビューした不変runtime sourceは `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9`。以下のsource pathはrepository相対であり、実装接続点の短縮pathのみ `systems/rock-star-os/` を基準にする。この凍結OSの既存Walletは `/v2/wallet` のdevice認証後もAlice固定。後続host sourceでは `/v3/wallet` とGX00本人接続を実装しているが、本書の交換操作まで実装したわけではない。[現在の範囲](implementation-checkpoint-20260909.md)と[接続wire](gx00-connection-wire-v1.md)を区別する。既存sourceの検証成功を新しい交換APIの証拠へ換算しない。

**公開・実装可能な完全schemaではない。** 本書のJSONはreview用の部分例で、`{}`、`<...>`、省略された共通fieldsを受理するvalidatorや成功応答を作らない。署名receipt、厳密field集合、数量型、domain bytesの未確定部分は第11節で管理し、該当ゲートの実装前に試験ベクトル付きで解決する。SDK interfaceも設計案であり、呼び出せるライブラリは提供していない。

この草案は合成USDと独立した2ゲームの合成資産だけを対象にする。実ゲーム、実資金、双方向換金、ゲーム料金、本番利用資格、ゲームengine対応は決定しない。ATMのRock手数料0、月額888 centsと月額同意は維持する。

[既存台帳に接続するGX01実装準備](gx01-contract-implementation-plan.md)で、posting CHECKの版付き移行、同じAVAILABLEの競合、署名済み拒否の永続化、外部I/Oをlock外へ出すworker、未確定交換を残した復元の追加条件を具体化した。これは設計提案であり、交換runtimeやGX01合格ではない。

## 1. 段階・主体・入口

[実行プロンプトE](prompts/os-operational-base-next.md)はAPI設計の並行作業を許可している。runtimeは [phaseGates](../data/project-status.json) の **B03-FIXTURE → GX00-ISOLATION → GX01-CONTRACT → DX01-SDK** に従う。B03-PROVIDER/実ゲーム/実資金を合成試験の待ち条件に足さない。この文書を追加してもどのゲートのstatusも更新しない。

| 段階 | 提供する実装と合格に必要なもの |
| --- | --- |
| GX00 | 認証principal→契約runtimeのresolver、移行/fence、player本人証明、接続承認・失効・限定照会。交換の成功を返さない |
| GX01 | 版付きasset/policy、見積専用承認、同じWallet内の予約/outbox、game側の冪等な付与・終端否認、照合、crash/restore試験 |
| DX01 | GX00/GX01を通る実HTTP Python SDK、動く最小サンプルと導入/復旧計測。mock成功SDKを先行納品しない |

| 主体・HTTPS入口 | 認証 | 選択できる範囲 |
| --- | --- | --- |
| Rock owner: `POST /v3/wallet` | 現行と同じdevice Bearer＋`X-Rock-Wallet-Device`。resolverがowner/ledgerを確定し、`X-Rock-Wallet-Authority`はその結果とのpin比較だけ | 認証された契約。本文からowner/account/path/ledgerを選べない |
| Game server: `POST /v1/game` | 専用author Bearer＋`X-Rock-Game-Authority`。credential registryがdeveloper/game/credential revision/scopesを固定 | 登録されたgame内の接続。ownerの一般Wallet RPCを呼べない |
| Rock worker→各game: `POST /v1/rock-game-authority` | ゲームごとに別のWallet-issuer Bearer＋両authority pin。author鍵・device鍵との兼用禁止 | 固定登録されたissuer、game、操作。URLをrequestから指定できない |
| 合成playerのlogin/proof入口 | 合成authority自身のplayerセッション。author Bearerとは別 | sessionが認証したplayerだけ。本文のplayer文字列は本人証明にならない |

全ownerは同じRock listener/resolverを通る。独立したgame authorityは各々のplayer/asset/receipt DBを持ち、DX01では同一SDKを使う。GX00/GX01中は共通の実HTTP transportを通す統合fixtureで検証し、先行するfixture driverを配布済みSDKと呼ばない。authorがWallet契約の状態directoryを指定するAPI、credit/mint、`wallet.sale/settle/reserve` は存在させない。public fixture資格情報は合成環境だけで有効にする。

### 1.1 既存認証との対応と限界

| 読取り根拠（b8287bc） | 保持する境界 / 新規実装が必要な点 |
| --- | --- |
| `systems/rock-star-os/os/wallet_backend/server.py` `Handler.do_POST`、`_device_mapping` | constant-time Bearer照合、deviceとpinの確認、strict requestを維持。現在のowner actorはAlice固定。Bodyのowner/gameでroutingする変更は不可 |
| `systems/rock-star-os/os/wallet_auth/service.py` `dispatch`、`_user_handle`、`_options` | 現在のreceipt入力はauthority/account/device/handoff/requestへbind。userHandleはauthority+accountから導出。optionsのpurposeはenroll/ATMだけなのでgame用purposeとtransactionを新設する |
| `systems/rock-star-os/os/wallet_auth/protocol.py` `verify_assertion` | 固定RP/origin、実Ed25519署名、credential ID、userHandle、flags、counterを検証。SoftwareTestAuthenticatorは合成開発用であり、hardware-backed/実ブラウザ/本番passkeyの証明ではない |
| `systems/rock-star-os/os/registry/server.py` `authenticate`、`publish` | 既存のauthor BearerはSHA-256をconstant-time照合し、publisher集合へ権限限定。receiptは(author,key)ごとにdurable。これはTool公開権限であり、game/player認証やWallet支出権限ではない |
| `systems/rock-star-os/os/registry/common.py`、`systems/rock-star-os/os/entitlement/protocol.py` | 既存署名domainはそれぞれ `RockRegistryIndex-v1\0` と `RockEntitlementWebhook-v1\0`。後者はpublic fixture HMAC。新game署名・author token・player sessionへ資格情報/domainを流用しない |

既存のpublisher IDをgame authority IDやWallet ownerへ自動変換しない。game用registryは別のcredential ID/revision/scopes/失効を持つ。既存Tool署名用 `PUBLIC_TEST_KEY` がgameの本人証明keyとして信頼される実装にもしてはならない。Wallet/device、Tool author、game server、player、Wallet workerの各資格情報を相互流用した拒否試験を要求する。

## 2. wireの共通規則

新game APIのprotocol版は `v:1`、owner経路は既存wire envelopeの `v:1` に新operationを明示追加する。`/v3` はowner routing世代であり、JSONの版とは別。v1/v2 ownerへの自動fallbackを禁止する。

各requestは `Content-Type: application/json`、一つのContent-Length、UTF-8 JSON object。重複header/JSON key、未知field、float/NaN、boolを整数として扱う入力、Transfer-Encoding、Expect、redirectを拒否する。header16KiB、request64KiB、response1MiBを上限とし、履歴は1〜50件・opaque cursorで区切る。現行絶対deadlineとbounded slotsを維持し、gameの遅延でowner全体のslotを占有しない。独立worker/queueの上限とfairnessはGX01で実測する。

識別子はASCII `[A-Za-z0-9][A-Za-z0-9_.:@-]{0,159}`、`key` はASCII1〜128文字。新game wireの整数上限候補は0〜2^53−1だが、これは金額上限ではない。Walletの現行 `_amount` はUSD cents整数1〜100,000,000に制限するため、principal/totalは正数でその上限とfixture policy上限の両方を満たす。feeは0を許すが、合計を同じ上限内に収める。game unitsは別単位でassetごとの上限を持たせる（第11節S03）。新game timestampはUTC Unix秒整数の候補とし、既存WalletAuthのREAL時刻や署名済み値を丸めて移行しない。bytesはbase64url・paddingなし、digestはSHA-256 lowercase hex64文字。新game署名の正規化候補は既存 `blackberryrock.packages.canonical`（sorted keys、UTF-8、空白なし、非有限数拒否）。これは署名対象field集合・Unicode同値・整数表現まで自動的に定めるものではない。cross-language test vectorとdomainを第11節で凍結する。既存Wallet receipt用JSONをこの方式へ一括変換しない。以下の `<...>` は説明用placeholderで、有効な署名や資格情報ではない。

成功envelopeは `{ "v":1, "ok":true, "result":{...} }`。全game resultに `simulation_only:true` を必須化。書込みreceiptの共通候補fieldsは `operation`, `key`, `request_sha256`, `receipt_id`。これだけで署名receiptの完全性は保証できず、第11節S01/S02の当事者・payload bindingが必要。replyがrequestと合わなければSDKは結果不明とする。既存Wallet/Registryのdurable API receiptを「外部authorityの署名付き確定receipt」と呼び替えない。GETやURL queryは使わず、read operationもPOSTする。レスポンスは `Cache-Control:no-store`。

owner応答は認証後のrequest-local authority/deviceをackする。author応答はgateway deployment pinとgame authorityをackし、Wallet authorityはその接続に許可されたresult内だけに出す。認証失敗時に他ownerのpin/receiptを返さない。origin/CA/資格情報hash・revision/device/game/API世代をtransport cache identityへ固定する。

## 3. 接続契約（GX00）

### 3.1 player本人の短期証明

合成authorityの `POST /v1/player/session` は `{ "v":1,"op":"player.session.begin","fixture_credential":"<private fixture login>" }` を受け、fixture登録のplayerへだけ短期sessionを返す。player_idの自己申告をloginとして扱わない。開発者用のprovisioningは管理側test setupで行い、公開ゲームAPIからユーザーやWallet残高を作れない。

`POST /v1/player/connection-proof` はplayer session Bearerを要求し、次のbodyだけを受ける。

```json
{"v":1,"op":"player.connection.proof","key":"proof-01","wallet_authority_id":"<pinned wallet UUID>","requested_scopes":["connection:read","assets:read","exchange:quote","exchange:read"]}
```

認証したsessionからplayerを取得し、次のproofを返す。接続はWallet側の追加承認まで未成立。

```json
{"schema":"rock-game-connection-proof/1","environment":"synthetic","game_authority_id":"fixture-authority-a","game_id":"fixture-game-a","player_id":"player-01","audience":"<wallet UUID>","nonce":"<random 32 bytes>","issued_at":1788912000,"expires_at":1788912120,"credential_id":"fixture-proof-key-a","credential_revision":1,"requested_scopes":["connection:read","assets:read","exchange:quote","exchange:read"],"signature":"<Ed25519 signature>"}
```

署名対象の候補はsignatureを除いたobjectのcanonical bytes、domain候補は `RockGameConnectionProof-v1\0`。public key/credential revision/game IDはprotected game registryで対応させ、要求で持ち込んだkeyを信頼しない。TTL最大120秒、使い捨てnonce。game名は認証済みauthority registryから取得する。本人画面のplayer表示はproofのplayer IDとの結合を必須とし、表示名/表示revisionを署名対象に含める方式は第11節S06で未確定として扱う。未署名の表示名だけで別accountへの承認を促す実装は不可。制御文字は表示前に除去するが、署名済みbytesを書き換えて検証しない。originから外部Webページへ自動遷移しない。

### 3.2 owner本人の接続承認

owner request:

```json
{"v":1,"op":"game.connection.begin","key":"connect-begin-01","proof":{},"scopes":["connection:read","assets:read","exchange:quote","exchange:read"],"terms_version":"rock-game-connection-synthetic/1","connection_expires_at":1788998400}
```

`proof` は3.1の全object。effective scopesはrequested、proof、game credential、server capabilityの積集合とし、黙って権限を追加しない。本人画面はその確定集合、game名/player表示、期限、解除の効果を表示する。候補TTLは最大24時間。合成fixture用の数値で本番規約ではない。

begin結果の必須fields:

```json
{"intent_id":"<server random UUID>","connection_id":"<server random UUID>","state":"AWAITING_OWNER_CONSENT","binding_sha256":"<full binding digest>","challenge_id":"<UUID>","expires_at":1788912120,"options":{"schema_version":1,"purpose":"wallet.game.connect","device_ref":"fixture-device-a1","publicKey":{}},"consent_view":{"game_id":"fixture-game-a","game_name":"Synthetic Game A","player_display":"Player 01","scopes":["connection:read","assets:read","exchange:quote","exchange:read"],"terms_version":"rock-game-connection-synthetic/1","connection_expires_at":1788998400},"simulation_only":true}
```

`publicKey` は現在enroll済みcredential向けWebAuthn assertion options（challenge/RP/allowCredentials/userVerification）。proof nonce、両authority、owner/account/device、intent ID、scopes/terms/expiryの全binding digestとchallengeをWallet DBで結ぶ。owner/account/deviceはtrusted contextから取り、requestにそのfieldsがあれば拒否。proof/nonceを同intentで再送可能にし、別intentへ使い回せない。

```json
{"v":1,"op":"game.connection.approve","key":"connect-approve-01","intent_id":"<UUID>","challenge_id":"<UUID>","binding_sha256":"<digest>","credential":{"id":"<base64url credential ID>","rawId":"<same base64url credential ID>","type":"public-key","clientExtensionResults":{},"response":{"clientDataJSON":"<base64url>","authenticatorData":"<base64url>","signature":"<base64url>","userHandle":"<base64url>"}}}
```

credential fieldの厳密形は現在 `wallet_auth.protocol.verify_assertion` に一致させる。counter更新、challenge消費、immutable consent receiptを**同じWallet transaction**でcommitする。別deviceへchallenge移譲しない。A2は同owner接続を読めるが、A1の未完challengeを移譲しない。A2での再承認にはA2用challengeと、旧intentの予約/nonce/不明commitを競合なく扱う手順が必要（第11節S06）。新beginで同subjectを重複予約して解決したことにしない。旧intentを勝手に成功へ変えない。

共有索引の `RESERVED → WALLET_CONSENT_COMMITTED → ACTIVE` はADR通り。beginから索引のsubject予約を保持し、Wallet consentと索引のbinding digestが一致したACTIVEだけをauthorへ公開する。Wallet commit不明時は予約TTLを理由に再割当てしない。owner `game.connection.reconcile` は `{v,op,key,intent_id}`。同intentのWallet receiptを照合して索引だけを前へ進め、本人承認なしにconsentを作らない。

接続resultの共通fieldsは `connection_id,game_authority_id,game_id,player_id,wallet_authority_id,scopes,terms_version,issued_at,expires_at,revocation_generation,state,simulation_only`。author共有版にはowner/account/device/ledger、Wallet全残高、仕事収入、他game履歴を含めない。device版は現在ownerに必要な登録device/承認receiptだけを追加可。

### 3.3 照会と解除

| 入口/op | bodyの追加fields | 必要scope/効果 |
| --- | --- | --- |
| owner `game.connection.status` | `connection_id` | 現在契約内だけ。失効済み履歴も本人へ表示 |
| owner `game.connection.list` | `limit,cursor`（初回cursor:null） | 現在契約内だけ |
| owner `game.connection.revoke` | `key,connection_id` | 契約admission gateでgenerationを増やす。新quote/approval/grant発行を止める。既存不明交換は消さず照合 |
| author `connection.status` | `connection_id` | `connection:read`、現在game/binding/credential認可 |
| author `assets.snapshot` | `connection_id,asset_id` | `assets:read`、許可されたgame資産のみ。game authority応答にはas_of/revision/staleを表示 |

author statusの失効時は所有gameにのみ最小 `REVOKED` 投影を返す。失効済みcredentialからの呼出しは拒否する。失効前receiptのreplayでも現在認可を先に確認する。解除は過去の本人承認/financial historyを削除せず、OS月額同意にも触れない。authorが解除する場合はowner失効と同じ効果に限定した `connection.revoke`（追加 `key,connection_id`、scope `connection:revoke`）を使用し、別owner/gameへ適用できない。

## 4. 合成Wallet→game見積と承認（GX01）

author `capabilities` のbodyは `{ "v":1,"op":"capabilities" }`。認証gameについて `protocols:["rock-game-api/1"], environment:"synthetic", connection_enabled, wallet_to_game_enabled, game_to_wallet_enabled:false, asset_policies` を返す。GX00中はwallet_to_gameもfalseであり、未実装operationは `feature_disabled`。実ゲーム名・実通貨換金可能の表示は禁止。

assetは `(game_authority_id,game_id,asset_id)` ごとに別物。policyはimmutable revisionを持つ。**説明用合成fixture提案**はGame A/B共に整数COIN（相互交換不能）、100 synthetic USD minor→10 units、fixture game fee3 minor、total debit103 minor。ゼロでないfeeでATM手数料0との混同を検出する。本番の価格・手数料を決める値ではない。端数は丸めず拒否、principal10の倍数、fixture total debit上限10000 minor、TTL120秒を提案する。別のテストpolicyでfee0も確認できるが常時無料とは表示しない。

author quote:

```json
{"v":1,"op":"exchange.quote","key":"quote-01","connection_id":"<UUID>","exchange_id":"purchase-01","direction":"wallet_to_game","asset_id":"COIN_A","wallet_principal_minor":100,"policy_version":"fixture-a/1"}
```

scope `exchange:quote` をauthor credentialと有効なconnection consentの双方へ要求。exchange IDはauthorが購入意図を表す安定IDとして作り、quote IDはgatewayが作る。owner/device情報やWallet balanceをauthorが送らない。quote作成は予約も支出も行わず、authorのquoteに資金不足の有無を漏らさない。ownerは同じfieldsのowner op `game.exchange.quote` を使えるが、serverはその接続のgame namespaceへ固定する。

quote result（共通receipt fieldsは省略）:

```json
{"quote_id":"<UUID>","connection_id":"<UUID>","exchange_id":"purchase-01","direction":"wallet_to_game","asset":{"game_authority_id":"fixture-authority-a","game_id":"fixture-game-a","asset_id":"COIN_A","unit_scale":0,"credit_units":10},"wallet":{"currency":"USD","principal_minor":100,"game_fee_minor":3,"total_debit_minor":103},"policy_version":"fixture-a/1","issued_at":1788912000,"expires_at":1788912120,"quote_sha256":"<digest>","approval_required":true,"simulation_only":true}
```

total=principal+feeをchecked integerで検証し、quoteの当事者、量、direction、policy、期限、connection generationをimmutableに固定する。APIはauthorの `credit_units`/fee/rate自己申告で値を書き換えない。quote更新は別quoteで再表示/再承認が必要。期限切れで未承認の同exchangeは旧quoteをSUPERSEDEDにして新quoteを発行可能だが、同exchangeで承認済み予約があれば新quoteで実行しない。

owner専用:

```json
{"v":1,"op":"game.exchange.approval.begin","key":"approval-begin-01","connection_id":"<UUID>","quote_id":"<UUID>","quote_sha256":"<digest>"}
```

返すpurposeは `wallet.game.exchange`。画面でgame/player・合成表示・付与units・principal/fee/total・期限を表示してenrolled credentialの新assertionを得る。未同意OS月額の開始やATM quote/コード生成はしない。

```json
{"v":1,"op":"game.exchange.approve","key":"approval-01","connection_id":"<UUID>","quote_id":"<UUID>","quote_sha256":"<digest>","challenge_id":"<UUID>","credential":{}}
```

credentialは3.2と同じ完全assertion。`AVAILABLE >= total_debit_minor`、認証counter/期限/現generationをtransaction内で再検査し、counter/challenge/approval receipt・exchange一意行・game hold/journal・outboxを一緒にcommitする。balance不足ならhold/outboxを作らない。拒否receipt、assertion counter、challenge消費をどこまで同transactionで記録するかは第11節S07の未確定事項。現行WalletAuthが一般的な失敗receiptを永続化しているとは仮定しない。失敗後に同assertionへ新keyを付けて別承認として通す実装は不可。response lostは「失敗」ではなく同key照合。

**既存 `Wallet.reserve` はwithdrawal専用で `WITHDRAW_HOLD` とATM triggerを使うため、そのままgameに呼ばない。** `GAME_HOLD` と確定先・監査保存則の版付き拡張がGX01の実装依存。別cash財布やATMwithdrawalで代替しない。Wallet→gameの価値授受全体をdistributed atomic/exactly-onceと呼ばず、ローカルtransaction＋durable冪等receiptと状態照合で二重実行を防ぐ。

## 5. game authorityへの確定操作

固定登録originへのworker request例:

```json
{"v":1,"op":"grant.apply","key":"<domain hash>","wallet_authority_id":"<UUID>","issuer_ledger_id":"<opaque stable alias>","writer_epoch":4,"game_authority_id":"fixture-authority-a","game_id":"fixture-game-a","connection_id":"<UUID>","exchange_id":"purchase-01","player_id":"player-01","asset_id":"COIN_A","credit_units":10,"quote_sha256":"<digest>","approval_receipt_id":"<UUID>","command_sha256":"<digest>"}
```

このgrant例は不足fieldを含む部分例で、実装用schemaではない（第11節S02/S04）。issuer_ledger_idは登録済みopaque aliasであり、pathや所有者情報ではない。outboxで全payloadを固定し、内部key=`gx1:`+domain付きSHA256（長さ128以内）。game authorityはtoken/pins/issuer binding/current epochを照合し、接続のplayer/assetとquote bindingを検査する。epochは同host coordinator境界と連携し、値を受け取っただけでclone writer防止を実装済みとしない。promotion後の照会は新しいcurrent epoch認可で旧commandのreceiptを照合する。commandのepochを書き換えて別命令として再発行しない。旧epochの未処理commandを実行できない場合は、同exchangeを新coordinator認可でREJECTEDへ終端化できることを確認してからholdを戻す。終端化の証明が得られなければ保留。epoch移行時のauthority認可更新手順もGX01の必須試験。

command/quote/proofのdigest対象集合は第11節S04で未確定。特にapply/rejectで異なるoperationを含むwire request hashと、同一exchangeの不変binding hashを区別する。単に「全commandからdigest自身を除く」と決めると、終端拒否が別payload conflictになる。各objectの除外fieldを個別に定義し、全階層からsignature/digest fieldを一律除去しない。

game authorityの一意keyは `(wallet_authority_id,connection_id,exchange_id)`。同じ不変交換bindingに対する同operation再送は同receipt、binding変更はconflict。applyと条件付きrejectの合法な組合せは第11節S04を解決してからvalidatorへ反映する。**player asset creditとgrant receiptを同じgame DB transaction**でcommitする。responseの候補fieldsは `exchange_id,connection_id,command_sha256,grant_receipt_id,state,credited_units,asset_id,game_revision,decided_at,signature,simulation_only`。この一覧には両authority、署名key revision等が不足しているため、署名対象の完全schemaとして使わない（第11節S02）。terminal stateは `APPLIED` 又は `REJECTED`。署名domain候補は `RockGameGrantReceipt-v1\0`、proof keyとは別credential。検証済みorigin応答でも、両authority/ID/digest/amountを照合しないreceiptはWallet確定に使わない。

`grant.status` は `{v,op,wallet_authority_id,connection_id,exchange_id,command_sha256}`。read-onlyで `NOT_FOUND/PENDING/APPLIED/REJECTED` を返す。NOT_FOUNDは「今このauthorityに行がない」で、遅延したapplyが将来到着しない証明ではない。したがってWalletはholdを解除しない。

`grant.reject_if_unapplied` はapplyと同じ固定exchange bindingを対象にする**条件付き終端化**。operation別のrequest key/digestと共有終端行の区別は第11節S04で固定する。game transaction内でまだAPPLIEDでなければREJECTED tombstoneをcommitし、その後届くapplyを永久に拒否する。APPLIEDなら元receiptを返す。applyとのraceは同unique key/DB transactionで直列化。callbackを任意URLへ送らず、初版はworker polling。author自己申告の「未付与」やHTTP 404だけで返金しない。

## 6. 交換状態・照合・冪等性

| Wallet状態 | 根拠/可能な次処理 |
| --- | --- |
| `QUOTED` | 見積のみ、holdなし。期限切れ/本人取消→`EXPIRED`/`CANCELLED` |
| `RESERVED` | owner承認とhold/outbox commit。workerが同commandでapply |
| `CONFIRMING` | dispatch開始またはresult不明。hold維持、same exchangeでstatus/applyを照合 |
| `COMPLETED` | 正しいAPPLIED receipt保存とhold→確定勘定を同Wallet transactionでcommit |
| `REVERSED` | 正しい終端REJECTED receipt保存とhold→AVAILABLEを同transactionでcommit |
| `REVIEW_REQUIRED` | receipt不一致/DB/fence/epoch異常。hold保持、新しい支出許可へ変えない |

`game.exchange.status`（owner）と `exchange.status`（author）bodyは `{v,op,connection_id,exchange_id}`。authorにはこの交換のquote/state/units/fee/receiptの限定投影だけを返し、全Wallet balanceは返さない。historyは同connection内の `limit,cursor`。`game.exchange.reconcile`/`exchange.reconcile` は追加 `key`、既存outboxのbounded再照合を要求するだけで、新規quote/approval/予約を作らない。author scopesは `exchange:read` と `exchange:reconcile` を分け、後者はauthor credentialと接続同意の双方がある範囲だけ。3.1/3.2の最小scope例にはreconcile/revokeを含めていないので、その接続で対応するSDK mutationを呼べば403。便利関数がscopeを追加したりowner側経路へ切り替えたりしない。失効後のfinancial reconciliationは既存承認に基づく内部workerの責任であり、失効した作者の新mutationを許可する理由にしない。

owner `game.exchange.cancel` は追加 `key`。未送信outboxを同transactionで確実に取り消せればhold解除可。dispatchを始めた可能性があればCONFIRMINGのままreject_if_unappliedへ進み、APPLIEDならCOMPLETEDを表示する。「取消要求」と「返金完了」を区別する。

冪等namespaceはADR通り `(game_authority_id,game_id,connection_id,operation,key)`。接続成立前は `(authenticated owner/device,game authority/game,intent/proof nonce,operation,key)` を使い、ACTIVE後の同connectionへbindする。同ownerの別deviceは同じ接続/交換をreadできるが、別deviceのcredentialを含む承認requestのreplayは拒否する。full canonical request digestをdurable保存し、same key/different payloadは409。さらに `(connection_id,exchange_id)` の独立一意性で別keyによる二重予約/付与を防ぐ。

unknown requestはtransport fingerprint＋exact bytes＋key＋IDsをprivate durable journalへ送信前に保存。timeout/接続切断/不正ACK/5xxは結果不明。再接続後は同ID照会又は**同bytes/key再送**。新key、別game、別owner、別endpoint、local Walletへのfallbackはしない。journal tombstone/receiptを削除して古いkeyを再実行可能にしない。新deviceはowner認可済みexchange.statusで確認し、他deviceのsecret/assertion journalをcopyしない。

workerはadmission/fenceをwrite action終了まで保持し、外部HTTPをWallet DB transaction内で待たない。outbox claim/lease世代・固定commandの作成、gameでの判定、Wallet確定を別段階として中断点を注入する。game停止は当該交換をCONFIRMINGに保ち、別game/ATM/Hubを停止させない。共有Wallet停止なら新規資金確定は双方停止する。

## 7. error contract

```json
{"v":1,"ok":false,"error":{"code":"outcome_unknown","message":"交換結果を確認中です。","retry":"reconcile_same_request","operation":"exchange.reconcile","key":"retry-01","correlation_id":"<opaque random ID>"}}
```

詳細SQL/内部path/token/credential/owner存在をmessageへ出さない。requestが未解析ならoperation/keyはnull。SDKはcode＋retry enumを扱い、文言の解析で判断しない。

| HTTP/code | 意味と次操作 |
| --- | --- |
| 400 `invalid_request`, 413 `request_too_large` | 全処理前の検証拒否。入力を直す。事前のunknown取引が消えた意味ではない |
| 401 `unauthenticated` | 資格情報不足/失効。別tokenへの自動切替なし |
| 403 `forbidden` | scope/device/authority/purpose違反。対象のowner存在を漏らさない |
| 404 `not_found` | 認可範囲で不明/越境対象を同じ応答にする。以前のunknown支出の取消証明ではない |
| 409 `idempotency_conflict`, `exchange_conflict`, `subject_unavailable` | 同key別payload、同exchange別binding、subject重複。既存他owner情報は返さない |
| 409 `connection_inactive`, `quote_expired`, `approval_required` | 新approvalを許す前に既存exchange状態を確認。失効したconsentを自動更新しない |
| 422 `insufficient_funds`, `invalid_amount`, `unsupported_asset` | owner自身の承認操作のみbalance不足を返す。quote/author照会で全残高を推定させない |
| 422 `direction_disabled`, 501 `feature_disabled` | 逆方向又は未到達ゲート。retry:none。capabilityを偽装しない |
| 429 `rate_limited` | retry-afterは秒整数。未dispatchと証明できる場合だけretry_same_request。既存unknownの保留は維持 |
| 503 `outcome_unknown`, `authority_unavailable`, `restore_pending` | retry:reconcile_same_request。結果なしをfailure/refundにしない |

新API error envelopeを現行v2の `{ok:false,code,error}` に暗黙適用しない。v3/game対応transportとvalidatorを版付きで追加し、v2互換試験を保つ。429/503や応答bodyが壊れた場合でもSDK独自timeout判定はdurable uncertaintyを保つ。security拒否を自動retry loopにしない。

## 8. 最小Python reference SDK設計（DX01で実装）

配布候補 `rock_game_sdk`、初期対象はPython3.11+のserver-side同期API。engine plugin、game clientへの鍵同梱、owner assertionの自動生成はしない。interface案は以下であり、空の成功関数を作らない。

```text
GameClient(config, journal)
  capabilities() -> Capabilities
  connection_status(connection_id) -> ConnectionView
  assets_snapshot(connection_id, asset_id) -> AssetSnapshot
  quote(connection_id, exchange_id, principal_minor, asset_id, policy_version, *, key) -> Quote
  exchange_status(connection_id, exchange_id) -> ExchangeView
  reconcile(connection_id, exchange_id, *, key) -> ExchangeView
  history(connection_id, *, limit=20, cursor=None) -> Page[ExchangeView]
  revoke_connection(connection_id, *, key) -> ConnectionView

SyntheticPlayerClient(session_transport)
  connection_proof(wallet_authority_id, scopes, *, key) -> SignedProof

OwnerGameClient(existing_v3_wallet_transport, journal)
  begin_connection(proof, scopes, terms_version, connection_expires_at, *, key) -> ConsentChallenge
  approve_connection(intent_id, challenge_id, binding_sha256, assertion, *, key) -> ConnectionView
  begin_exchange_approval(connection_id, quote_id, quote_sha256, *, key) -> ApprovalChallenge
  approve_exchange(connection_id, quote_id, quote_sha256, challenge_id, assertion, *, key) -> ExchangeView
  exchange_status(connection_id, exchange_id) -> ExchangeView

GameAuthorityAdapter (server-side contract, independently durable game store)
  apply_grant(validated_command) -> GrantReceipt
  grant_status(validated_binding) -> GrantStatus
  reject_if_unapplied(validated_command) -> GrantReceipt
```

Configは固定HTTPS origin、protected CA/token file、pin/game identity、protocol版、bounded deadline。credential値をrepr/log/diagnosticへ含めない。private SQLite journalはsend前commit、exact payload/digest/namespace/fingerprint/outcomeを保持し、clear/fallback APIsを設けない。retry既定は新mutation自動再実行なし、status/reconcileを明示呼出し。最小例は実SoftwareTestAuthenticatorを使う**明示された合成テストdriver**だけにassertion生成を置き、一般GameClientにowner認証能力を持たせない。

例外候補 `ProtocolRejected(code)`, `AuthenticationRejected`, `IdempotencyConflict`, `OutcomeUnknown(request_handle)`, `AuthorityUnavailable(request_handle)`。read statusにはlast-known/stale/as_ofを型で残す。接続障害時のcached balanceを支出根拠にしない。診断はDNS/TLS/pin/protocol/capability/現在scope/unknown request countをread-onlyに検査し、接続・quote・承認・入金を勝手に行わない。

## 9. 2作者×2game×2owner×3deviceの合格mapping

Fixture: Author A→Game A、Author B→Game B。Alice A1/A2は同じledger、Bob B1は独立ledger。各authorityで `player-01` はAliceのgame account、`player-02` はBobのgame account。異なるgameで同じplayer文字列を意図的に使う。4接続C_AA/C_AB/C_BA/C_BBを同listener、共通の実HTTP transport、実TLS・SQLite・WebAuthn検証・WalletService経路で作る。DX01で同じ4接続を同一SDKから再試験する。fixture setupだけが合成原資を記帳する。

| ID/段階 | 実際に通す操作と証拠 |
| --- | --- |
| C01/GX00 | 3device register/enroll/Wallet terms→4接続proof/begin/approve/status。各owner authority/account/ledger UUIDとDB実体が分離。A1/A2は同じ契約 |
| C02/GX00 | Game A/player-01をBobへ再binding→subject_unavailable。Game Bの同文字列は独立成功。拒否responseにAlice識別情報なし |
| C03/GX00 | Bob token+Alice device/pin、author A+Game B接続、本文owner/ledger/path、署名改変/期限切れ/nonce再利用、ATM purpose assertion→全拒否。対象外DB論理hash不変 |
| C04/GX00 | A→B→Aのworker再利用、例外/timeout、並行request、restart。context漏洩なし。A1失効後A2は継続、Bob非影響 |
| C05/GX00 | 月額未同意でgame接続を作ってもbill0。同意後同じ月にA1/A2並行billはAlice888を1回、Bobは独立888。既存ATM fee0/総引落し/不明照合回帰 |
| X01/GX01 | 4接続で同じkey文字列・exchange_id文字列のquote→本人署名承認→実authority grant→status。各1回、別game通貨/owner残高混同なし |
| X02/GX01 | 同key同payload再送→同receipt。同key別payload→409。別key同exchange→二重予約/creditなし。A2がA1のassertionをreplay→拒否、read statusは成功 |
| X03/GX01 | ATM+monthly+2gameで同AVAILABLEを並行消費。合計debited+held≤funded、AVAILABLE負値なし。gameholdをwithdrawalに偽装していない |
| X04/GX01 | Wallet hold/outbox commit直後、game credit/receipt commit直後、Wallet terminal commit直後、response送信前に中断。restart/same requestで各DB effect1回、不明中hold維持 |
| X05/GX01 | grant.status NOT_FOUNDと遅延applyのraceでは返金しない。reject_if_unappliedとapplyをrace→APPLIED又はREJECTED一方だけ、creditと返金の両得なし |
| X06/GX01 | Game A停止/過負荷/不正receipt→A取引のみ確認中、Game B/ATM/Hubのbounded応答維持。Wallet停止中は全新規資金確定停止 |
| X07/GX01 | revocationとapproval/dispatch race、期限/時計巻戻し/epoch切替。失効以後の新承認なし、既存不明は内部照合で保持。reverse directionは全入口でdisabled |
| R01/GX00/01 | legacy adoption中断、旧client互換、全contractDB＋索引＋game receiptDB＋fenceの復元。保留/receipt/credential counter不変、旧writer再開拒否。旧OS ABI/slot writerの可否を実測 |
| D01/DX01 | 同じSDK/packageで2作者が導入→4接続→合成交換→障害診断→同ID再開。準備時間/初回成功率/復旧時間を測定し、未実装/NOT_RUNを成功率分母から隠さない |

C01〜C05だけでexchange/SDKの合格にしない。host合格とQEMU D4/D5再試験・独立環境restore・実機・本番は別記録。

## 10. 実装接続点と未完条件

pathは `systems/rock-star-os/` 相対。以下の既存実装は再利用点であり、この草案の機能が存在するという意味ではない。

| 接続点 | 後続変更 |
| --- | --- |
| `os/wallet_backend/server.py:175` Handler.do_POST、`:234` device_scope | GX00 ContractRuntime/owner resolver、request-local authority ack。現在のAlice固定とself.serviceを解消。strict framing/caps/deadline/authを維持 |
| `os/wallet_backend/client.py:90` HTTPSWalletTransport、`:177` validate_reply、`:291` RemoteWalletService journal | v3 opt-in、operation allowlist/ACK validator、ゲームのdurable unknown再送。現行origin/CA/device fingerprintとno-local-wallet原則維持 |
| `os/wallet_auth/protocol.py:306` verify_assertion、`os/wallet_auth/service.py` | low-level署名検証を再利用しpurpose別challenge/consentを追加。enrollment/ATM trigger/単account制約は保持 |
| `os/entitlement/device.py` device_scope、`wallet_bridge.py` | 認証ownerからscope決定、旧bindingの移行とstable ledger identity、月額との同意分離 |
| `src/blackberryrock/wallet.py:69` schema、`:174` _verify、`:319` reserve | 既存reserveはATM専用。新game hold/terminal accounts・保存則・冪等性・migrationを明示実装。既存wallet keysを一括変更しない |
| `os/registry/server.py:115` authenticate、`:183` publish | token hash照合と(author,key)のreceipt設計を参考にする。Tool author/publisher承認をgame権限へ昇格させず、新registryで明示bind |
| 新 `os/game_exchange/{protocol,registry,connections,quotes,service,outbox,fixture_authority}.py` | wire/capability/署名domain、author/subject index、専用同意、交換状態機械と独立authority |
| 新 `os/wallet_backend/{contract_runtime,owner_router,migration,writer_registry}.py` | ADRの1契約1runtime、legacy adoption、同host fence。外部URL/ownerからpath導出しない |
| `os/service_access/{authority,controller,serve,profile}.py` | 依然単一Aliceのpurchaser projectionは別の複数owner試験が必要。Wallet完成をHub全体の複数owner完成に換算しない |

先行依存はGX00実resolver/認証、protected registryとplayerセッション、接続目的のchallenge/counter transaction、索引のcrash照合、移行/fence。GX01ではgame ledger勘定/監査のschema版、合成policy値、outbox/reject tombstone、資源上限、restore scopeを固定する。新SDKはそれらを実HTTPで通せてから実装する。署名canonical test vector、全receipt schema、資源上限の数値を実装PRでfixtureとして凍結するまで、この草案を安定公開APIとはしない。

実ゲーム/SDK利用環境、本番player資格、換金原資、rate/fee/limit/refund、分散writer fencing、外部authority運用・鍵管理は未決。後続実装でも `game_to_wallet_enabled:false` と操作拒否を既定とし、作者ポイントからUSDを発行する逃げ道を作らない。

## 11. schemaレビューで未解決の項目

以下は未実装機能の**設計上の不足**であり、既存runtimeが不正な交換を行ったという報告ではない。JSON例の穴を空objectや固定文字列で埋めて通す実装は認めない。対象schemaと異常系vectorが揃うまで、そのoperationをavailable/successとして提供しない。

| ID/解決時点 | 未確定・不足と、実装へ渡す条件 |
| --- | --- |
| S01 / GX00-5前 | 接続proof、intent、owner consent、author共有receipt、scope別投影の厳密field集合、type/length/enum、operation別の必須scopeが未凍結。本文共通receipt fieldsも含めた完全な例を作り、未知/重複/missing field、scope追加、別owner/device/gameへのreplayをrejectするvectorを用意する。Wallet内部receiptとauthor共有receiptは別schemaにし、秘密値を除いた投影にも接続bindingが残ることを確認 |
| S02 / GX01-CONTRACT前 | grant terminal receiptの部分一覧には **schema/environment、issuerとrecipient/audience、game authority/game ID、署名credential ID/revision、issuer ledger alias/epoch、player、connection generation、quote/approvalのbinding** が不足。Wallet側でどのfieldsを保存/照合するか、どれを署名対象又は一意なdigest commitmentへ含めるかを決定する。APPLIEDは期待unitsと完全一致、REJECTEDは付与0と永続拒否を示す。wrong issuer/key/game/player/amount/digest、途中state、旧epochをterminalと誤認しないvectorが必要。現行のdurable API receiptだけではこの条件を満たさない |
| S03 / GX01-CONTRACT前 | Wallet `USD` minorのscale=2と各game assetのinteger units/scaleを別schemaにし、unitsをUSD centsへ読み替えない。principal、game fee、外部実費（未決）、totalの通貨/内訳/上限、rateの整数比、端数拒否、計算順序・overflowを凍結する。fixtureの100→10 units/fee3は計算例で、ゲーム手数料の決定ではない。principal/total/unitsの0、負数/bool/float/指数表記/上限+1/合計上限超過/桁あふれ/別asset同symbolの拒否と、fee0の許容を確認。現行Wallet上限100,000,000 centsをwire上限2^53−1で拡大しない |
| S04 / GX00-5（proof） / GX01-CONTRACT前 | applyとrejectでopが異なるのに、全文command hashと同じrequest keyを共有する初稿では正当な取消がpayload conflictになり得る。**一意なexchange binding、operation別wire request digest/key、共有terminal行**を分ける。両操作が同じimmutable quantity/quote/playerを対象にすることを証明し、異なるbindingは拒否。request/quote/receiptのcanonical field集合とdomain bytes、digest自身/signatureの除外を各schemaで固定。`RockGameConnectionProof-v1\0` / `RockGameGrantReceipt-v1\0` はdomain候補であり、ほかの署名objectも確定してからcross-domain混用、NULと文字列 `\\0`、Unicode/順序変更、digest循環のvectorを作る |
| S05 / GX00-5 / GX01-CONTRACT | proof signing、terminal receipt signing、author Bearer、player session、Wallet issuer credentialの用途・key registryを分離する。各sigのアルゴリズム/encoding/key ID/revisionの解決方法、rotation/revocation後の過去receipt照合と現在のAPI認可を分けて決める。終端receiptは短期proof/quoteのTTL満了で消さない。key信頼性が不明ならfinancial holdを残してREVIEW_REQUIRED。現行Tool publisher key、Registry署名、Entitlement HMAC、ATM codeを別用途へ流用したvectorは全拒否 |
| S06 / GX00-5前 | proofのplayer IDと本人画面に表示するaccount名/表示revisionの認証bindingが必要。未知/任意の未署名表示を本人accountとして採用しない。A1の未完intentをA2から再開/取消する場合、nonce・subject予約・challenge・Wallet consentの中断状態を残したまま処理する契約も未確定。重複subject予約や不明commitのTTL再割当てで回避しない |
| S07 / GX01-CONTRACT前 | 残高不足/失効/期限切れ時のcounter、challenge、拒否receiptのtransaction境界と同key再送契約が未確定。現行WalletAuthは成功receiptを `_remember` し、例外でbusiness transactionをrollbackする。新gameの失敗receiptが既に存在するように実装しない。同assertionを別keyへ付け替える場合、失敗後入金の場合、response lostでcommit済みの場合を分けて試験する |
| S08 / GX01-CONTRACT前 | writer promotion後に旧epoch commandの状態を誰が照会・終端拒否できるか、外部authorityへ現在epochを通知/確認する手順が未確定。単にbodyへepochを追加して二重writer防止としない。coordinatorは同管理host限定、別host promotionは無効。outbox claim前/後、旧worker生存、APPLIED済み/未記帳、旧backup復元のraceを試験 |
| S09 / GX00-5 / GX01-CONTRACT | `assets.snapshot` のasset unit/revision/as_of/stale、authority停止時の返し方、connection revoke後の限定履歴とreconcile scopeを凍結。read cacheは支出/返金根拠にしない。履歴cursorをauth/game/connection/filterへbindして越境利用を拒否。段階ごとのcapabilityは実装/試験したoperationだけをtrueにし、未提供assets APIを空の成功値で代替しない |
| S10 / GX00-4 / GX01-CONTRACT | 正本索引と全契約Wallet/Entitlement、追加同意/receipt/outbox、game側player/terminal receipt、独立fenceをbackup scopeへ追加する移行仕様が必要。固定data ABIや旧OSがgame tableを無視するだけで安全なrollbackとはしない。旧データの再記帳/receipt削除なし、unknown hold保持、旧writer拒否を先に試験し、userdata変更後はD4/D5を再実行 |

数値の意味は[製品ベース](../data/product-baseline.json)の `commercialPolicy`、`gameExchange`、`gameDeveloperExperience`、`atmFees` を変更しない。ゲーム本番方向/rate/feeは未指定、realValueEnabledはfalse、OS月額の変更はnone、ATMのRock手数料は0のまま。新game schemaを作るために既存Wallet/Entitlement receiptや固定baselineを編集する必要はない。

## 12. 次の実装・試験へ渡す入口

文書レビューは今進められる。以下は**次の担当が実行する手順**であり、本書の作成時には新テスト/SDKを作成・実行していない。

1. **開始条件を固定**: B03-FIXTUREの同一source・同一候補での合成Wallet/商品費用・売上状態の証拠を確認する。未達ならGX00 runtimeへ進まず、OS/Wallet基礎の作業と本書のschemaレビューを続ける。b8287bcは本書の読取り基準であってB03合格宣言ではない。開始時source SHA、host、既存データmigration対象を記録する。
2. **最初の小さい実装PRはGX00-0〜3**: `systems/rock-star-os/tests/test_wallet_backend_owner_router.py` と `test_wallet_auth_owner_router.py` を先に追加し、実TLS単一listenerへAlice A1/A2・Bob B1を通す。既存RemoteWalletService、署名handoff、SoftwareTestAuthenticator、WalletServiceを使い、body自己申告owner、pin/device組合せ、worker再利用、同period請求の失敗fixtureを作る。現在のAlice固定実装では失敗することを記録してからresolver/ContractRuntime/v3 opt-inを実装する。test専用service差替え、authentication_required=False、全Wallet engine作り直しで通さない。
3. **GX00-4を並行して落とさない**: legacy adoption・stable identity・同host writer fenceの中断fixtureを含める。正本を単純copyしてBobと呼ばない。移行/復元/古いwriter拒否が未完の最初のPRは「GX00部分実装」と記録し、GX01開始や一般複数owner完成に進めない。既存v2 Alice clientと元authority pin/receiptの互換回帰を維持する。
4. **接続だけを次の独立差分へ**: S01/S04/S05/S06/S09のGX00部分を完全schemaと拒否vectorにしてから `os/game_exchange/protocol.py`、`registry.py`、`connections.py`、独立 `fixture_authority.py` と `test_game_owner_connection_integration.py` を追加する。共通実HTTP transportでC01〜C05と4接続を通し、交換capabilityはfalse。接続成功を交換成功としない。
5. **GX01/DX01の受入を分離**: GX00-ISOLATIONの証拠後にS02〜S10の残りを解決し、Wallet game勘定/保存則・outbox・authority terminal receiptを実装してX01〜X07/R01を通す。その実HTTP経路へPython reference SDKを一つ接続し、同じ4接続をSDKから再実行してD01の導入/復旧を計測する。SDKの型定義やmock戻り値だけで進捗を完了にしない。

開始時の既存回帰入口はrepository rootから `python3 scripts/test-native.py --output <new-disposable-evidence-directory>`。Linux依存と非root試験を維持し、現在のC/Hub/Wallet/author認証回帰を落とさない。新しいGX00テストを追加した後はnative root `systems/rock-star-os/` で、例えば `python3 -B -W error::ResourceWarning -m unittest discover -s tests -p 'test_wallet_backend_owner_router.py' -v` と認証owner router/game connectionの各suiteを同様に実行する。**これらの新test名は予定で、レビューSHAにはまだ存在しない。** 0件実行・skip・mock成功を合格にせず、実TLS/DB/署名の実行件数と対象外DB不変の証拠を残す。

今回の成果は本設計文書とコード読取り監査のみ。追加runtime 0、追加SDK 0、新GX00/GX01試験実行0、VM/実資金操作0。status/baseline/既存署名データは本差分の変更対象に含めない。
