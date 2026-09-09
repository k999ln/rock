# GX00 ADR案 — 1契約1台帳を維持した認証付き複数ownerの接続

作成: 2026-09-09。状態: 実装に渡す設計候補。今回の成果はコード読取りと設計だけで、GX00試験・移行・新サービス起動は未実施。

根拠source: native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`。以下のpath/行番号は `systems/rock-star-os/` をrootとする。製品設計v1.1と利用者の実装継続指示を前提に、合成通貨の独立作業へ分解する。QEMU単一owner受入V01をGX00待ちにはしない。ゲーム本編・ゲームengine・市場・実資金は本ADRの実装範囲に含めない。

## 1. 推奨する決定

**1契約につき既存Wallet DBとEntitlement DBの組を1つ維持し、認証済み接続からその組を選ぶ共通gatewayを追加する。** AliceとBobに別々の `WalletService`、`WalletAuthorization`、`DeviceWalletAdapter`、schedulerと同一正本のlifetimeを持たせる。Walletの金額・仕訳・月period・ATM・認証表へowner列を一括追加する方式は今回採らない。

「1契約1DB」は厳密には既存の `wallet-simulator.db` と `entitlement.db` の組を指す。既存2DBを1DBへ統合するという決定ではない。WalletBridgeの2段commitは引き続き同一keyで照合し、原子的な跨DB取引とは称さない。

複数ownerを同じHTTPS listener、同じrequest検証、同じowner resolver、同じgame接続API、同じSDK経路に通す。Alice用listenerとBob用listenerを別々に立てただけ、各テストだけでWalletを差し替えた状態、`'alice'`という表示文字列をBobへ変えただけではGX00に合格しない。

| 比較 | 契約ごとに既存DBを分離 | 共有DBをmulti-owner schemaへ変更 |
| --- | --- | --- |
| AVAILABLE/hold/月period/既存key | 物理的に別DBとなり既存SQLの意味を保持できる | 全query、unique、FK、trigger、集計、監査をowner付きへ変更する必要 |
| WalletAuth | `wallet_auth_mode.account_id`の単一契約拘束を保持 | singleton・credential/device unique・quote/approvalとの整合を再設計 |
| ATM/月888 | 既存Wallet・Bridge・ATMを各契約で再利用 | ATM bindingと全credential/withdrawal参照のowner移行が必要 |
| 既存台帳 | in-place adoptionなら金額/receiptの再記帳不要 | append-only表を含む版付き再構成・旧reader対策が大きい |
| 所有者を選ぶ境界 | gatewayの認証→固定契約resolverが重大な共通境界 | gateway境界に加え全DBアクセスのwhere漏れが共通境界 |
| 障害/運用 | 契約単位の停止・容量管理が可能。open service数/scheduler数の上限が必要 | 接続数を抑えやすいが単一DB障害・移行影響が全ownerへ及ぶ |
| 復元/旧writer | DB分離だけではclone writerを防げない。別途fenceが必須 | 同様。owner列を付けてもclone writer問題は解消しない |

初期fixtureではowner数を明示的に2、device数を3、game数を2に固定可能。後の拡張は上限を設定可能にするが、無制限のDB自動作成は行わない。request内ownerを用いたdirectory作成、未登録ownerのfallback、他契約DBの流用は全て拒否する。

## 2. 現行コードが既に保証するものと制約

| 実体・場所 | 読取り結果 | GX00での扱い |
| --- | --- | --- |
| `src/blackberryrock/wallet.py:66–157` | 1WalletのUSD cents、`wallet_bills.period` PK、`wallet_idempotency.key` PK、accountはAVAILABLE等の固定勘定。owner列なし | 表を一般化せず契約別に同じ実装を持つ。ゲーム残高をUSD勘定へ混ぜない |
| `os/wallet_backend/server.py:175–245` | `/v2/wallet`はdevice header＋Bearerを確認。ただしscopeに常に`device_scope(device_ref, 'alice')`を渡し、dispatch先も常に`server.service` | 認証後のimmutable principalから選んだContractRuntimeに限定してdispatch |
| 同 `server.py:310–325,348–405,442–479` | 初期binding、device mapping、AUTHORITY markerすべてAlice固定。mapping変更/削除はappend-onlyで拒否。marker欠落でlegacy fallbackしない | 既存v1/v2 readerを保ったまま新しいrouter/marker版を追加。単純なAliceチェック削除にしない |
| `os/entitlement/protocol.py:20–32,72–82` | Alice/Bobの別owner_refと公開fixture principalが既にある。fulfillment/walletとownerのrole分離あり | 最初の正当なBobはこの別principalと署名済みBob handoffを用いる。PUBLIC tokenは本人認証の本番実証ではない |
| `os/entitlement/store.py:58–79,190–222,274–301` | ownerごと1契約index、account_devices owner一致、同ownerは既存accountへ接続。新account IDはowner_refから導出。same Store mutexで失効と受理を直列化 | 再利用。AliceのStoreへBobを混在させてWalletだけ共有しない。別ownerは別Storeと異なるaccount ID |
| `os/entitlement/device.py:153–232` | signed handoffから初期ownerを導出。device_scopeは元owner一致を要求しthread-localをfinallyで戻す | 各契約の元owner拘束を保持。routerにowner/deviceを保存するglobal mutable fieldを作らない |
| 同 `device.py:68–88,348–375,445–490` | 月periodはDB内一意。device API receipt keyもDB内一意。登録元device別に古いreceiptを再認証。月同意取消でも不明処理は消さない | 同契約多端末で月1回、別ownerで独立。既存key文字列・履歴を一括renameしない |
| `os/entitlement/wallet_bridge.py:17–31` | 1Wallet DBを1fixture accountへ拘束する。identityは実ファイルの`(st_dev,st_ino)`のhash | 1契約拘束は維持。別復元先コピー後はinodeが変わるのでstable identity移行が必要 |
| 同 `wallet_bridge.py:33–106` | CLAIMED/PAID、既存bill、888 cents、consent、期限を照合し同じWallet keyで再開 | 移行でCLAIMEDをPAIDや失敗へ変更せず、正本billとの照合を再利用 |
| `os/wallet_auth/service.py:58–171,192–223,269–273` | modeは単一accountへ一度だけbind。credentialはaccount/device、quoteとapprovalは同じWallet内に保持。triggerで未承認ATM/新規請求を防ぐ | 単一account制約とtriggerを保持。各契約に別WalletAuthorization。game承認はATM quote表へ偽装しない |
| 同 `service.py:276–296,356–484` | WebAuthn challengeのpurposeはenroll/ATM。assertion counter/失効/quote期限を同じWallet transactionで更新 | 低水準検証を再利用しgame専用purpose・challenge・consent表を追加する。既存ATM用challengeを受付けない |
| `os/atm/simulator.py:47–56,162–207` | TrustedWalletContextのowner_idは実際には契約account ID。device_authorizer有効時は同契約の別deviceから履歴確認可能 | 名前に惑わず契約IDとして扱う。作者/game/player IDを代入しない。別owner参照はrouter＋既存contextの両方で拒否 |
| `os/wallet_backend/client.py:90–143,291–332` | proxy fingerprintにorigin、authority UUID、CA/token hash、deviceを含む。remote cacheの付替え拒否、未解決要求を保持 | 新protocol版をfingerprintに追加。旧cacheを新ownerへ変更しない。新deviceは新cache、同deviceの更新は明示互換経路 |
| `os/service_access/authority.py:23–81` | Wallet・Registry・Runnerは1Wallet Storeを共有。consumer tokenとWallet tokenを分離 | 複数ownerのHub統合を行う場合は認証consumer→契約別controller resolverが別途必要。単一accessを全ownerへ使わない |

既存試験は重要な再利用対象。`tests/test_wallet_backend_multi_device.py` は実localhost TLS・SQLiteだが主に `authentication_required=False`。一方 `tests/test_wallet_auth_backend.py:132` の試験は認証有効で同Alice契約の2deviceを登録・enrollし、片方のcredential失効後も他方で月1回/ATMを維持する。認証有効多端末が「無い」とは扱わない。どちらもBobの正当な独立台帳を証明するものではない。

## 3. ID、authority、storageの分離

新しい `ContractRuntime` は次の内部bindingを保持する。値は保護された運用manifestと検証済みhandoff/登録から確定する。

- `ledger_ref`: directory選択に使うランダムな内部opaque ID。requestに選択権を持たせない。
- `ledger_uuid`: Wallet DB内に永続化するstable台帳ID。復元しても同じ。owner_refやpathから再生成しない。
- `wallet_authority_id`: 既存WalletAuth/quote/clientのauthority UUID。既存Aliceの値を保持し、Bobは別値を持つ。
- `owner_actor` / `owner_ref`: fixture認証principalと所有者。`account_id`とは別に保存・照合。
- `account_id`: 既存EntitlementStoreが登録した契約ID。登録前は未確定とし、requestから補充しない。
- `device_ref`: 認証credentialで特定した購入端末。全router内で1契約にだけbindingする。
- `writer_epoch`: 正本writerの世代。復元時に外部fence側で単調増加させる。

同じlistenerでもauthority UUIDを全owner共通に上書きしない。HTTPヘッダーの `X-Rock-Wallet-Authority` は**認証後に選んだ契約authorityへのpin照合**に使い、DBの選択キーにはしない。responseもそのrequest-local authorityを返す。現行Handlerの `server.authority_id` 固定参照は新handlerでは使えない。

配置例は `router/contract-registry.sqlite3` と `contracts/<ledger_ref>/`。後者には既存2DB・AUTHORITY marker・device mapping・lockを置く。legacy Aliceをadoptする際は初期directoryを移動せず、保護manifestでそのcanonical pathを登録できるようにする。pathは管理者の移行入力だけとし、request/game ID/owner文字列から組み立てない。symlink、hardlink、同一inodeを複数ledgerへ登録、非所有・過剰permission、marker不一致をopen前に拒否する。

fresh契約のledger UUIDは初回生成時に固定するが、account_idは登録前に推測して埋めない。既存 `register()` が確定したaccountに一度だけbindする。接続未登録の状態でBob要求を受けた際にAliceの既存accountを既定値にしない。

## 4. 同じ認証経路を通すserver-side resolver

新protocol endpointは明示 `/v3/wallet` とする。既存 `/v1`・`/v2` はlegacy単一契約用として保持し、新複数owner状態へfallbackする入口にしない。

1. 現行のTLS、request絶対deadline、header/body/response上限、重複header・JSON field拒否、HTTP owner操作allowlistを再利用する。
2. 保護されたdevice credential registryのcredential ID/device_refから候補を検索し、Bearerのconstant-time照合を行う。同tokenを複数owner/deviceへ登録する設定は起動前に拒否。未登録・失効・期限切れはdefault ownerへ回さず拒否する。
3. 認証の結果として `AuthenticatedDevicePrincipal(ledger_ref, owner_ref, owner_actor, device_ref, credential_revision)` を生成する。bodyの `owner_id/account_id/ledger_ref/peer_uid` を認証contextとして受付けない。
4. server内部でprincipalのledger_refから保持中のContractRuntimeを選ぶ。選択したauthority UUIDとrequest pinを照合。runtimeのmarker、ownerとhandoffのowner、登録済みならaccount IDも一致させる。
5. writer fenceの現在世代とprincipalの現在revocation revisionを再確認し、`runtime.membership.device_scope(device_ref, owner_actor)` へ入る。同じStoreでfulfillment変更を受けるため、失効と処理が現行と同じ順序で直列化する。
6. `runtime.service.dispatch(request, peer_uid=1002)` へ委譲する。ここでのUIDはHTTP認証後の信頼済みadapter内部値。作者endpointへこの権限を委譲しない。
7. response、service projection、例外処理は同じrequest-local runtimeを使い、finallyでcontextを解放する。success receiptの再送も毎回再認証する。接続timeoutでも処理済みcommitを巻き戻さず、same-key照合を保持する。

ContractRuntimeのcacheはledger_refで引き、同じledgerを同時に二重openしない。shutdown時は現行と同じく受付停止→実worker終了待ち→scheduler停止→DB close→lock解放。接続が切れただけで新しいruntime/schedulerをspawnしない。thread-localの使い回し漏れを試験するが、新しく追加するowner contextは引数で明示的に渡す。

ロック順は既存の「admission/entitlement→Wallet」を保持する。router registryは認証済みimmutable snapshotを取得したら解放し、contract処理中に逆順でglobal registry writeを取得しない。owner/credential失効は短いregistry判定だけで確定せず、契約admission gateと同じ順序でgenerationを変える。game connectionの失効も同じ契約admission gateを通す。

## 5. game接続に必要な本人同意

GX00ではgame接続・失効・範囲限定照会の認証基礎まで作る。ゲーム通貨を付与/debitする経路と金銭交換はGX01の専用contract/fixtureで実装する。GX00段階で接続成立を「交換成功」と呼ばない。

ゲーム作者はWallet owner/deviceとは別principal。`developer_id`、`game_authority_id`、`game_id`、credential ID/版、allowed scopes、失効状態をgame registryへ固定する。作者credentialが選べるのは登録済みgameだけで、任意ownerのWallet runtimeではない。独立した2game authorityのfixtureはそれぞれserver認証を要求し、作者やclientが任意のplayer_idを送っただけではplayer本人確認済みにしない。

接続の手順:

1. gameの認証済みplayer sessionから短期限・one-useのplayer接続証明を発行。game authority/game/player subject、接続nonce、audience Wallet authority、期限、server credential版へ署名を結び付ける。Walletのfulfillment/wallet用HMACとdomain/credentialを共有しない。
2. Walletの認証済みowner endpointからその証明を提示して `game.connection.begin`。Wallet側ではauthority registryを照合・署名/期限/nonceを検証し、本人のWallet account/deviceをresolverから補う。gameから受取ったowner値は採用しない。
3. Wallet画面にgame名、game内account、公開範囲、期限、解除の効果を表示し、接続専用purpose `wallet.game.connect` のchallengeを発行。既存enrollment済みcredentialのassertionで利用者が承認する。既存 `verify_assertion` を再利用するがATMのquote ID、withdrawal ID、払出コードは流用しない。
4. assertion counterの更新とone-use challenge消費、immutable接続同意receiptを**同じWallet DB transaction**に保存する。成功receiptへ署名/公開できる情報はconnection ID、game scope、期限、simulation-onlyだけ。Wallet全残高・自動化収入・他game履歴・owner個人IDは含めない。
5. game author endpointはgame credential＋有効なconnection IDを認証し、serverのconnection索引からledger_refを得る。更にその契約DBで同意・player/game・失効・期限を再照合する。索引が古い/欠落ならunavailableとし、authorの自己申告で置換しない。

game subjectの二重owner bindingは複数契約DBを跨ぐため、Wallet DBだけのuniqueでは防げない。gateway registryにsubject単位の一意な `connection_intent` を短いtransactionで予約し、その固定intent IDと全binding digestをWalletのchallenge/consentへ結ぶ。状態は `RESERVED → WALLET_CONSENT_COMMITTED → ACTIVE`。Wallet commit後にindexをactivateし、両方が一致するまで接続成功や作者の新規操作を返さない。中断後は同intent IDでWallet receiptを照合して再開する。期限切れでもWallet commitの有無が不明なら予約を別ownerへ再配分しない。取消/失効も履歴を消さず単調なstateで記録する。この索引は単なるcacheではなくsubject予約の正本であり、契約別同意DBと合わせてbackup対象に含める。複数DBの一括原子commitを仮定しない。

接続同意の正本shape案:

| field群 | 値を確定するauthority |
| --- | --- |
| schema/version、connection_id、consent_id、purpose、nonce、challenge digest | Wallet |
| wallet_authority_id、ledger_uuid、account_id、owner_ref、approving_device_ref、credential_id | Walletの認証済みcontext |
| game_authority_id、developer_id、game_id、player_subject、player_proof_digest | 登録済みgame authorityの検証済み証明 |
| scopes、terms_version、issued_at、expires_at、revocation_generation、sandbox/prod | 両authorityのcapabilityと本人承認の積集合 |
| state、revoked_at、revocation_receipt、pending_exchange_count | Walletの正本。解除は新規操作だけを停止し履歴/照合は残す |

`player_subject` は `(game_authority_id, game_id, player_id)` の組。別gameで同じ `player_id` 文字列でも別subject。**同じgame authorityの同じgame/player subjectを別ownerへ再接続する場合は誤衝突として別財布を作らず、既存bindingの明示解除/移管手続きが必要。** 移管機能は初回未対応で拒否する。2×2試験ではGame A/B間で同じplayer文字列を再利用し、同一subjectの二重owner bindingは拒否試験にする。

game接続だけで `wallet.consent` や月額billingを呼ばない。Wallet利用規約、OS月額同意、game接続同意、将来の交換quote承認は別記録。購入端末のない一般playerの本番資格は未決のままにする。作者sandboxを使うためにRock端末購入を要求せず、fixture owner/deviceが用意された開発環境で検証する。

## 6. 冪等性と既存契約の保持

既存Wallet/Entitlement/ATM keyはその契約DBの中で従来のまま保持。別ownerでは同じkeyが独立に成功できる。同owner2deviceで同じkey・違うdeviceやpayloadの再利用は既存origin/認証照合を維持し、他deviceのbearer receiptを無条件再送しない。

新game tableのkeyは `(game_authority_id, game_id, connection_id, operation, client_key)`、交換の一意性はさらに独立した `(connection_id, exchange_id)` とする。既存Walletへ委譲する内部keyは長さ制約内のdomain付きhashとし、完全payload digestを永続保存する。gameごとに同じclient_key/exchange_idを使えても、同一交換に異なるkeyを付けた二重実行は許さない。既存 `wallet_idempotency` の既存keyは書き換えない。

GX01で予約・outboxを追加するときも同じ契約Walletのtransactionを使い、ATM/monthly/gameのAVAILABLE競合を直列化する。別のgame財布に現金残高を写して支出可能にしない。USDとgame assetの単位は別で、作者に `wallet.sale/settle/reserve` やmintをHTTP公開しない。ATMのRock手数料0、quote/receiptの総引落し=現金額、月888 centsは既存回帰で維持する。

## 7. legacy adoption・復元・writer fencing

### 7.1 in-place adoptionを最初に実装する

最初の移行対象は停止済みの既存単一owner backend。既存deviceのlocal Walletをremote backendへ無断copy/importする経路は作らない。local→backend転換には同意/保留/旧OS互換を含む別のmigration profileが必要で、今回のbackend adoption成功で代替しない。

移行前に同じprivate directoryのauthority lockを取り、listener/worker/scheduler停止、SQLite WAL checkpoint完了、integrity/FK、台帳保存則、既存account/owner/authority/credential/bill/hold/receiptを照合。単に整合する小さいDBを作り直して置換しない。

`WalletBridge`のinode bindingに対しては、単純にチェックを外さず次の移行を実装する。

1. まだ元ファイルのinodeが保たれている状態で旧wallet_bindingsを検証。正本のaccount/ATM binding/WalletAuth accountが一致することを確認。
2. Wallet DB内に `wallet_storage_identity(ledger_uuid, account_id, identity_schema)`、Entitlement DB内に版付き `wallet_bindings_v2(account_id, ledger_uuid, legacy_identity, migration_id)` を追加。どちらも1Wallet1accountでimmutable。旧行は監査履歴として残す。
3. 2DBなので移行journalを `PREPARED → WALLET_IDENTITY_COMMITTED → ENTITLEMENT_BINDING_COMMITTED → ROUTER_REGISTERED → ACTIVE` と進める。各段階の入力hash/IDを固定し、途中再開は同一migration_idだけ。`ACTIVE`前は全writerを拒否する。クロスDB原子commitとはしない。
4. 新しいAUTHORITY marker版に `ledger_uuid`、最低writer版、migration IDを固定。旧serverがstrict field/schema検証でledger open前に拒否することを実際に試験する。router registry登録・fence取得後にactivateする。
5. 継続されるaccount ID、Wallet authority UUID、認証public key/counter、month/consent、ATM hold、bill/journal/receipt/CLAIMED/不明状態を比較し、同keyの再要求が既存結果へ戻ることを確認。

移行前の古いbackupからすでに別inodeへ復元されたデータは、自動的に新しい元台帳と認めない。元source/backup manifestと旧bindingの照合、元writerの停止証拠、stable identity付与を含む専用legacy restore手続きが必要。証拠不足ならread-only/照合待ちで止める。旧inode情報を現在inodeへ無条件に更新しない。

### 7.2 clone writerを防ぐ境界

既存`authority.lock`は同directoryへの二重openを防ぐが、別directoryへcopyした台帳には別lockができる。UUIDだけでもclone双方が同じ値を持てるためfenceにならない。

初期実装は**同じ管理host上の単一fence coordinator限定**にする。coordinatorの正本registryはbackup外に置き、`ledger_uuid → active canonical path / writer_epoch / state` を保持する。全ContractRuntimeのowner操作、scheduler、game outbox workerはこのcoordinatorで現在世代を持つことを確認して書込みを開始する。復元先は読み取り・照合専用の `RESTORE_PENDING` で登録し、source停止・未完worker終了と権限失効を観測してからepochを増やし、sourceを`RETIRED`へする。復元データの古いepochで再開できないことを試験する。

writer handoverと実書込みの間に競合を作らないよう、coordinatorのlease/admission gateはそのwrite actionが終わるまで有効に保つ。既存serverもmarker最低writer版で迂回起動を拒否する。thread timeoutはcommit完了ではなく、旧workerが残る間は新writerをactivateしない。

この限定fenceは、別hostでコピーしたcoordinatorを立てることやhost管理者がSQLiteを直接編集することまでは防がない。別hostへのpromotion機能は初回無効とし、共有した独立fence authorityを持つ分散writer fencingを実装・試験するまで対応済みとはしない。将来のgame authorityはexchange IDの冪等性に加えissuer/ledger/epochを検証するが、相手にepochを送るだけでWallet自身の二重writer問題が解消したとは扱わない。

### 7.3 OS更新との互換

`os/update/README.md:143` は固定 `rock-data-v1`、migration engine/userdata rollbackなしを明記している。serverだけの契約router変更とOS userdata変更を区別する。backend metadata移行後、旧OS clientが既存v2とそのauthority pinで読める/操作できる範囲をfixtureで確認する。

OS local台帳へidentity/game表を入れる段階では、直前OS reader/writerが新schemaをどう扱うか試験するまで同じdata ABIのまま安全なrollbackとしない。互換readerを先に配るか、署名data ABIを更新して旧slotからの書込みを拒否する。台帳が変わった候補はD4/D5（A/B復旧・同一data保存・新復元先）を再実行する。GX00のhost試験だけでOS復元の合格は付けない。

## 8. 実装を分ける最小順序と変更先

新規ファイル名は提案。既存部品と境界を保つための分割であり、別のWallet engineを実装する計画ではない。

| 順序 | 変更先 | 実装とその段階の証拠 |
| --- | --- | --- |
| GX00-0 | `tests/test_wallet_backend_owner_router.py`（新） | 2ownerの同TLS入口・正当系/越境の失敗fixtureを先に追加。テスト用だけのservice差替えで成功にしない |
| GX00-1 | `os/wallet_backend/contract_runtime.py`、`owner_router.py`（新）、`server.py` | 単一authorityの保護file/lifetime処理を再利用してContractRuntimeを抽出。legacy constructorは同runtimeへdelegate。認証principal→runtime resolverと/v3追加 |
| GX00-2 | `server.py` marker/mapping、`entitlement/device.py`の接続点 | 新版のownerをprotected bindingから取得。既存Alice marker/endpointを勝手にreinterpretしない。Bob handoffを新しいprivate stateへprovision |
| GX00-3 | `wallet_backend/client.py`、`tests/test_wallet_auth_owner_router.py`（新） | v3 transport opt-inとfingerprint版、実RemoteWalletService3台、SoftwareTestAuthenticator3台でenrollment/規約/月額/ATM。crypto/dispatcher本体をmockしない |
| GX00-4 | `wallet_backend/migration.py`、`writer_registry.py`（新）、`wallet_bridge.py`、最小Wallet identity追加 | in-place adoption、stable identity、移行journal、同host writer fence。旧single-owner/account/receiptを保存したcrash/restart/restore fixture |
| GX00-5 | `os/game_exchange/protocol.py`、`connections.py`、`registry.py`、`fixture_authority.py`（新） | 作者/game/player本人確認、接続専用purpose/同意/失効、最小照会。WalletAuthの低水準assertion検証を再利用しgame challenge transactionを追加 |
| GX00-6 | `wallet_auth/service.py`のpurpose拡張点、`wallet_backend/client.py` | 接続承認のcounter/challenge/consentをWallet transactionで一緒に保存。ATM purpose/triggerは保持。proxyのunknown replayをsame-keyで扱う |
| GX00-7 | `tests/test_game_owner_connection_integration.py`（新） | 同じgateway/SDKから2作者2game2owner3deviceの接続・分離・再開。GX01の交換APIに渡せるvalidated contextを確認 |
| GX00-8 | 受入報告・ALIGN03 profile・D4/D5 | 全追加表/全契約DBと外部索引/fenceがbackupに必要と記録。最新imageによる起動/復元は独立ゲートで実行 |

`os/service_access/authority.py/controller.py/serve.py` と `os/service_access/profile.py`、`os/desktop/stage0.py` のpurchaser launchは依然単一Aliceに固定される。GX00の共通Wallet/game APIが通っただけでHub/Registry/Runnerの複数owner化も完了とはしない。これを同じ段階で接続する場合はconsumer registryから契約別ServiceAccessControllerを選び、権限照合をresolverと同一Storeへ結ぶ追加試験を必須にする。Wallet tokenをRegistry/Runner/gameへ流用しない。

## 9. GX00の合格fixture

source/hostを固定し、実localhost TLS＋実SQLite＋現行WebAuthn署名検証＋既存WalletServiceを通す。fixture issuer/credit操作はtest setup内部のみ。新HTTP owner/game endpointから合成creditさえ作れないことを否定試験にする。

| ケース | 合格条件 |
| --- | --- |
| owner A=Alice、owner B=Bob | 同じlistener/resolverで両者が正当に登録/enrollでき、authority/account/ledger UUID/DB実体が異なる。署名handoffはそれぞれ別owner_ref |
| Alice A1/A2、Bob B1 | Aliceは1契約・2credential、Bobは別契約・1credential。同じ月・同じrequest文字列でもAliceは月888を1回、Bobは独立で1回 |
| 2作者×2game×2owner | 作者A→Game A、作者B→Game B。両ownerが両gameへ接続成功。gameを跨いで同player文字列を使っても接続/同意が混ざらない |
| 同一subjectの二重binding | 同じGame A/player subjectをBobからAliceの接続と別財布として作れない。既存接続を知られない形で拒否 |
| Wallet/game間の越境 | Bob token＋Alice device/authority、Game A credential＋Game B接続、別ownerのquote/receipt/同意、自己申告owner/ledger/pathを全て拒否。対象外DBの論理hash不変 |
| 冪等性 | 2owner、2gameで同じkey/exchange ID文字列を意図的に再使用。正当なnamespace内の同payloadは同receipt、同key別payloadは拒否。GX00では接続/認証receipt、実交換はGX01で再実行 |
| 失効/期限/残高不足 | A1失効でもA2の契約内処理は継続可能。Aliceの取消/失効/不足はBobへ非波及。古い成功receiptも現在認可を確認。Game A停止/失効でGame BやATMを停止させない |
| 並行/worker再利用 | 同一threadでA→B→A、Aの例外/timeout、複数worker/owner同時要求、schedulerとHTTP同時処理、restart後にcontext非漏洩。終了済みserviceを再利用しない |
| 既存ATM/月額 | 認証有効の旧quote/承認/hold/取消/不明照合を保持。Rock手数料0、総引落し、月額同意取消、same-owner二重請求防止の既存testsを再実行 |
| 旧台帳adoption | 元の月bill・pending/hold・credential/counter・API receipt・CLAIMEDを含むfixtureで各移行commit直後に中断。再開は同migration IDで一度だけ、再記帳/履歴消去なし |
| 復元writer | source生存/旧worker未終了なら新復元先write不可。promotion後は同host旧path/旧epoch不可。copyでinodeが変わってもstable ledger IDで照合し、複製ledgerは新ownerと認めない |
| データscope | 全契約のWallet/Entitlement、game registry/同意索引、game authority側player証明receipt、fence registry、runner/provider依存を列挙。必要外部stateを省略/skipした合格は禁止 |

追加tableのmin-schema/hash比較は今回のALIGN03修正候補を拡張して使えるが、同候補はbackendのbackup/復元を実装していない。従って「保存scopeが表現できた」「hostで移行fixtureが通った」「backendを新環境へ復元した」「QEMUで旧/新OSをbootした」を別結果で残す。

## 10. 未決・開始条件

この計画に実ゲーム名、レート、ゲーム手数料、双方向換金、作者の現金mint、本番資格の決定は含まれない。GX01には別途asset/quote/outbox/予約・照合契約が必要。owner routingの成功だけで外部game交換・実資金対応を表示しない。

最初に着手可能なのはGX00-0〜3のhost合成統合。GX00-4の復元移行とfenceは最初の実装で設計から落とさず、これが未完の間はGX00全体を部分実装と記録する。GX00-5以降は接続専用consent contractを先に固定し、既存ATM purposeを流用しない。actual OS D4/D5・分散fence・外部providerの未実施をsource回帰成功へ換算しない。

本書作成時点の検証結果: **読取り監査のみ。新しいGX00コード0、新GX00試験0、VM起動0、実資金操作0。**
