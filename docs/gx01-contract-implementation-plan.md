# GX01: 既存 Wallet に接続する合成交換の実装準備

状態: **設計提案のみ。GX00-ISOLATION 未合格の間は runtime を変更しない。**

読取り基準: root checkout `b3257678a9c79a7c224483750438c107659adfc3`。現在の host GX00 と、凍結 OS `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9` は別候補である。本作業で runtime、DB、OS、QEMU、資金操作は行っていない。以下の型名、勘定、期限、上限は未実装の提案であり、実測済み契約ではない。

## 1. 最小の結論と、先に解く変更

最初の交換は **public synthetic Wallet→Game A/B の購入単位付与だけ**に限定する。作者と game authority は自分の synthetic asset を記帳できるが、Wallet の AVAILABLE を増やす命令、売上生成、入金確定、ATM actor、月額同意を持たない。逆方向、実資金、実ゲーム、換金、外部費用の本番設定は無効のままにする。

新しい cash Wallet を作らず、既存契約の `wallet-simulator.db` に game 専用保留と outbox を置く。作者から送られる owner/account/path は採用しない。既存の認証済み接続 index→契約 runtime→C admission→現在の owner/device または author scope の照合を通す。

実装の前提となる具体的な不足は次のとおり。

1. `Wallet.reserve()` と `WITHDRAW_HOLD` は ATM withdrawal 専用。`_verify()` は withdrawal の残額と WITHDRAW_HOLD を一致させ、ATM approval trigger も存在する。game にそのまま使えない。
2. `wallet_postings.account` は6勘定の SQL CHECK に固定されている。`GAME_HOLD` 等を追加するには版付きの台帳 schema 移行と監査条件の拡張が必要。追加テーブルだけで完了しない。
3. GX00 の `SCOPES` は connection read/revoke だけである。既存 consent に exchange/asset scope を黙って足せない。scope 拡張用の明示再同意または新接続を認める契約が必要で、現在は同じ game/player の reconnect も拒否する。旧接続は connection-only を維持する。
4. 現行 WalletAuth は成功だけ `_remember()` し、承認途中の拒否は transaction を rollback する。game の「署名は正しいが残高不足」の永久拒否 receipt、counter 消費、再承認の境界を新たに決める必要がある。
5. 共通 writer の `admit_write()` は通常の RLock、Wallet SQLite は busy timeout 30秒。HTTP の期限を置くだけでは、game が停止しても ATM/B が有限時間内に応答する保証にならない。新しい外部 I/O は共通 lock の外へ出し、game の admission/DB 待ちにも残り時間の上限を渡す小さい API 拡張が必要。
6. `RemoteWalletService` の許可リストは game 操作を扱わない。SDK、owner の private pending journal、OS UI、復元中の未確定交換は別の実装・受入対象である。
7. C の current-copy proof は Wallet lineage の証明である。外部 game issuer epoch、terminal receipt、outbox worker の終了や game DB の巻戻し耐性を証明しない。

## 2. 再利用する入口と変更の境界

| 対象 | 維持するもの | 必要な限定変更 |
|---|---|---|
| `src/blackberryrock/wallet.py` | 同じ Wallet DB、BEGIN IMMEDIATE、append-only journals/postings、AVAILABLE、既存 ATM/月888 | 版付き勘定追加、game 監査、既存 transaction 内だけの game posting helper。既存 reserve/reconcile は変更しない |
| `os/game_exchange/protocol.py` | GX00 の canonical UTF-8/整数/署名・接続検証 | 既存 v1 connection bytes を変えず、exchange 専用 module/version と literal vectors を追加 |
| 新 `exchange_ledger.py` | 既存 Wallet 接続を利用 | quote、approval attempt、hold、outbox、receipt、audit の同一 DB transaction。独立 cash DB は作らない |
| 新 `exchange_service.py` | current connection/head、既存 managed route | author quote/read、owner approval/cancel/read、内部 reconciliation を分離。owner 決定は既存 protected routing のみ |
| `wallet_auth/protocol.py` と fixture | 既存署名検証、既存 credential/counter | `wallet.game.exchange` の明示 ceremony を追加。ATM/connect の assertion を拒否。既存 ATM fee0 の意味を変えない |
| 新 `fixture_exchange_authority.py` | Game A/B の private state と固定 fixture identity | 自分の asset journal と APPLIED/REJECTED terminal 行を同一 transaction で記帳。公開 test key だけで動く別 loopback TLS authority |
| 新 `exchange_worker.py` | C の管理認可、bounded transport の構成 | durable claim→lock 解放→固定 endpoint I/O→再 admission→receipt commit。既存 author global gate を I/O 中に保持しない |
| `contract_runtime.py` / C hooks | 一契約一 writer、current epoch、close 失敗時 permit 維持 | game worker の start/quiesce/join を明示登録。deadline-aware admission を小さく追加し、旧 default 呼出しは維持 |
| `wallet_backend/client.py` / SDK / UI | authority pin、private journal、未知結果の保存 | game 専用の許可 fields と journal namespace、同 ID 照合。未実装間は capability=false |

`simulate_sale()` / `settle_sale()` は既に fixture の残高投入用である。game HTTP handler、worker command、author SDK から到達できる経路を追加しない。test harness が資金を用意した操作と、交換で増減した操作を別の証拠として保存する。

## 3. fixture policy と厳密な金額

本番のレート・手数料・提供地域・対象資産は未定のまま保持する。初版の固定 fixture は既存 draft の説明値を明示採用する提案とする。

| 項目 | fixture 提案 |
|---|---|
| environment / real value | `synthetic` / `real_value_enabled=false` |
| source asset | pinned Wallet issuer + ledger alias + `synthetic:usd`、USD cent、scale=2 |
| destination | A: `(authority-a, game-a, COIN_A, scale=0)`、B: `(authority-b, game-b, COIN_B, scale=0)` |
| eligible class | `PURCHASED` のみ。EARNED/BONUS は別残高で、cash redemption 不可 |
| rate | principal 10 minor あたり1 game unit。整数比 `numerator=1, denominator=10` |
| rounding | `REJECT_REMAINDER`。principal が10の倍数でなければ拒否 |
| fee | fixture game fee3 minor、fixture external cost0 minor。ATM fee0 と独立 |
| bound | principal>0、units>0、total=principal+3、total≤10000 minor。最大 principal9990、units999、total9993 |
| quote lifetime | 最大120秒。immutable policy version と terms version を固定 |
| direction | Wallet→game のみ。Game→Wallet は全入口・全 credential で無効 |

値100→10 units、fee3、total103は合成試験値であり商品価格ではない。fee0 は別の明示 fixture policy の負例/境界値として扱えるが、公開 default や ATM からの流用にはしない。外部費用が本番で不明なとき「0」と確定表示せず、本番 policy 自体を有効にしない。

wire 金額は exact int。bool、float、負数、指数表記、NaN、未知 asset/unit、unit_scale の偽装を拒否する。現在の Wallet 単一金額上限 **100,000,000 cents** を wire の `2^53−1` へ拡張しない。加算/乗算は事前に bound を確認し、remainder=0 と total の上限を照合する。SQLite signed64 の SUM overflow も成功に変えず拒否する。新 game 行数/累積値を bounded にし、旧残高を丸めたり切り捨てたりしない。

USD と game units の和を保存則に使わない。USD は USD 勘定間、各 game asset はその issuer 内で独立に監査し、交換 quote の正確な比率で両者を結ぶ。

## 4. ID・namespace・署名・quote

Wallet 内の一意交換 identity は `(game_authority_id, game_id, connection_id, exchange_id)`。game terminal は `(wallet_authority_id, issuer_ledger_alias, connection_id, exchange_id)` を protected registration と照合する。同じ player/exchange/key 文字列を A/B、Alice/Bob で使っても誤衝突させない。

client key は `(caller_role, authenticated principal namespace, operation, external_key)` に保持する。既存 global `wallet_idempotency` の raw key を再利用せず、game 専用 receipt 表か `gx1:` + domain hash の内部 key を用い、元の全 namespace と body を保存する。hash だけで不一致を隠さない。同じ key/body は保存済み receipt、同じ key/別 body は409、別 key/同じ承認済み exchange は既存交換へ照合するだけで再予約しない。

quote の Wallet 内全文には、schema/environment、quote/exchange/connection ID と generation、両 authority、issuer alias、既存 owner/account、game/player、source/destination asset・scale・amount・eligible class、ratio/rounding、principal/game fee/external cost/total/cap、policy/terms、issued/expires を固定する。account は実在の `acct-...` をそのまま保持する。author view は owner/account/device や Wallet balance を除いた専用投影とし、full binding hash に結ぶ。

author quote には承認端末がまだない。quote 作成時に作者の申告 device を採用せず、owner `approval.begin` で認証済み device/revision/credential を全 quote digest と結んだ approval intent を作る。新しい端末へ assertion を移譲しない。同 owner A2 は status/reconcile を行えるが、A1 の challenge を承認できない。

未承認 quote の期限切れ後は同 exchange に新しい quote version を明示発行できる。旧 quote は immutable に残し SUPERSEDED/EXPIRED head を進める。承認済み hold/outbox が一つでもある exchange に新 quote を出して二度目の購入へ変えない。

完全 schema と署名対象をコード前に literal vectors で固定する。少なくとも以下の domain を別にする。

- `RockGameExchangeBinding-v1\0`: immutable exchange facts。自己 digest field を持たない。
- `RockGameExchangeQuote-v1\0`: quote の定義された payload。自己 digest/signature は top-level の指定 field だけ除外。
- `RockGameExchangeApprovalReceipt-v1\0`: Wallet が確定した owner 承認、元 quote digest、device/credential revision、counter と hold/outbox identity。
- `RockGameGrantApply-v1\0` / `RockGameGrantReject-v1\0`: 同じ binding digest へ異なる op と wire key を結ぶ。apply と reject の全 body hash が同じだと仮定しない。
- `RockGameGrantReceipt-v1\0`: 両 authority、issuer alias/command epoch、game/player/asset/units、connection generation、quote/approval/binding digest、terminal state、decision revision、decision ID、key ID/revision。

各署名 key は purpose を protected registry で固定する。game proof key、terminal key、author Bearer、player session、Wallet command signer、Wallet owner credential を代用しない。base64url は unpadded canonical、Ed25519 は64byte、JSON は GX00 と同じ bounded canonical UTF-8 とし、nested signature を一括除去しない。

terminal receipt は quote/proof の短い TTL では失効しない。既に正しく検証・保存した terminal と public verification key 履歴を保持する。新たに届いた compromised/unknown key の receipt を issuer 自己申告の過去 `decided_at` だけで救済しない。key trust が解決しなければ REVIEW_REQUIRED で hold 維持。実 key rotation 管理を実装するまでは固定 fixture keys 以外の rotation を拒否する。

## 5. 同じ Wallet transaction に入れる記録

追加 USD 勘定案は `GAME_HOLD`、`GAME_PURCHASES`、`GAME_FEES`。SERVICE_FEES は既存月額888の対応を維持する。synthetic external cost は0なので初版に未定義の実清算勘定は作らない。

| 動作 | USD postings | 同一 transaction の証拠 |
|---|---|---|
| 承認/予約 | AVAILABLE→GAME_HOLD total | valid counter、challenge消費、承認receipt、exchange一意行、hold、固定 outbox |
| 正しい APPLIED | GAME_HOLD→GAME_PURCHASES principal、GAME_HOLD→GAME_FEES fee | terminal receipt全文+署名+検証key/identity、exchange COMPLETED、outbox終端、audit |
| 正しい REJECTED | GAME_HOLD→AVAILABLE total | 永続reject tombstone receipt、exchange REVERSED、outbox終端、audit |
| 未送信を原子的に取消 | GAME_HOLD→AVAILABLE total | 未claimかつdispatch不可へのCAS、CANCELLED receipt、outbox終端 |
| timeout/不正receipt/NOT_FOUND | なし | CONFIRMING/REVIEW_REQUIRED と試行履歴。hold の期限解除なし |

postings/journals は追加だけ。fee=0 のときゼロ posting を作らない。game reserve/terminal は caller が持つ既存 Wallet transaction 内で行い、nested な `Wallet.reserve()`/`Wallet.reconcile()` は呼ばない。

追加表は少なくとも `wallet_game_quotes`、`wallet_game_exchange_attempts`、`wallet_game_exchanges`、`wallet_game_outbox`、`wallet_game_exchange_receipts`、`wallet_game_exchange_events`。quote/request/receipt の全 body は immutable、state/head/attempt scheduling のみ限定遷移する。新 hold は専用 approval と一致しない INSERT を拒否する trigger/明示検査を持ち、existing ATM approval を参照しない。

`Wallet._verify()` は既存4対応を保持したまま、GAME_HOLD=全未確定game hold、GAME_PURCHASES=全COMPLETED principal、GAME_FEES=全COMPLETED fee、各exchangeの reserved=held+committed+released を確認する。AVAILABLE と全正勘定は非負、各journalの合計0、各terminalに正確な一つの消費または解放journalを要求する。fixture の初版では post-completion refund を有効にしないため completed 勘定の対応は単純に保てる。

### 署名が正しい拒否の提案（S07）

`approval.begin` は active challenge を exchange あたり一つにし、server-generated attempt ID、quote hash、device/revision/credential に固定する。初回 approve の key/body もこの attempt へ一意に結ぶ。別 key の同 assertion を新しい承認として扱わない。

正しい current credential の署名を検証できた後に、残高不足・承認中の期限切れ・current head 変更等で拒否するときは、**counter更新、challenge消費、DENIED receipt、key/body、理由**を同 transaction に commitし、hold/outboxは作らない。例外による全rollbackを「確定拒否」の代替にしない。同じ key は後から残高が増えても同じ DENIED を返す。新しい購入承認には owner が新 attempt/challenge を明示取得する。旧 DENIED と旧 counter は保持する。

署名不正、別 owner/device、既に失効した credential は counter を更新せず、新しい資金許可を作らない。認証済み範囲での bounded request拒否記録と challenge の資金承認状態を混同しない。DB commit の成否不明は DENIED と返さず、同 request を pending に保存して照合する。処理容量を確保できない場合は署名承認/hold前に拒否し、永続化できない denial を確定済みと称しない。

## 6. game 側の実 ledger と、保留の解決

Game A/B は独立した DB/lock/TLS endpoint/purpose-key を持つ。`grant.apply` は current issuer registration と全 binding を照合し、同 game asset の ISSUANCE_CLEARING→PLAYER_PURCHASED units と APPLIED receipt を同一 transaction で commitする。ISSUANCE_CLEARING は合成 game 単位の発行源であり、USD source ではない。EARNED/BONUS を PURCHASED と合算して換金可能にしない。

terminal key は永久保持し、行数が上限なら新規交換を拒否する。TTL cleanup で冪等記録を捨てない。status NOT_FOUND/PENDING は nonterminal。`grant.reject_if_unapplied` は同じ unique exchange binding の transaction 内で、既存APPLIEDならそのreceipt、未適用ならREJECTED tombstoneを返す。その後のapplyは拒否される。apply/rejectそれぞれの operation receiptと共通terminalを別に持つ。

Wallet は正しい APPLIED で消費、正しい REJECTED で解放する。通信切断、404、期限切れ、作者の「付与していない」、game表示残高0、NOT_FOUND は解放理由にならない。既に dispatch を開始し得る交換の cancel は CONFIRMING のまま conditional reject を要求し、APPLIED だった場合は COMPLETED を表示する。

初版は自動 compensation を持たない。確定REJECTEDに基づくhold解放は失敗交換の取消であり、確定購入への任意refund/mintではない。将来の compensation は、元exchangeを改変せず別一意adjustmentとして、承認されたWallet/settlement authorityの資金・gameの確定取消/消費証拠・上限・owner表示を必要とする。消費済み/不明のgame残高をauthor自己申告で逆仕訳しない。

逆方向を将来実装する場合も、確定game debit/burnとapproved backingが別途必要。短期holdや作者の「原資あり」はWallet credit証拠にならない。本提案では残高増額・補償・reverseのHTTP/RPC operation自体を許可しない。

## 7. outbox・時間・停止・復元

worker は各gameあたり active attempt1、未確定queue上限を持つ。fixture提案は1回の総通信期限3秒、接続/TLS/送信/受信に共通deadline、要求/応答64KiB、redirectなし、固定origin/pin/argvなし、backoffを伴うbounded scan。retry回数が尽きてもholdを解放しない。永続keyを変えず REVIEW_REQUIRED を表示する。

claim は C admission 内の短い Wallet transaction で `UNSENT→DISPATCH_POSSIBLE` を固定し、完全なwire bytes/digest/epochとattempt履歴をcommitする。以後は「送ったかもしれない」。全C/Device/Wallet/index/author gateを解放してからI/Oし、応答後はcurrent C epochと対象exchangeを再照合してcommitする。失効と初回dispatchはclaim境界で直列化し、claim前に失効なら新applyを止め、claim後の失効は元の資金許可の内部照合として扱う。作者の失効 credential に新しい権限は与えない。

現在の共通C gateとSQLite待ちはdeadline引数を持たないため、小さいdeadline-aware admission/transaction経路を追加する。期限後の拒否はcommit不明を覆さない。ネットワークへのworker接続をcloseしても、commit途中のthreadを強制終了していない可能性を考慮する。runtime closeはgame worker quiesce→owned connectionsの停止→bounded join→inflight0確認後だけpermitをreleaseし、join失敗ならwriter/fenceを保持してpromotionを拒否する。lease期限だけで生きたworkerを失効させたことにしない。

game Aが停止してもAのhold/queueだけが保留し、B/ATM/Hubを外部I/Oで塞がない。共通Wallet停止は全新規資金操作を止める。serviceがreply deadlineを超えただけで台帳commitをrollbackしたと推定しない。

### current-copy restore の追加gate（S08/S10）

C担当者確認: 現行Cはsame-host stopped-current-copyとpromote、permit終了、copy/hash/inode、旧RETIRED/新epochを管理する。外部game/index/outboxのworker管理やissuer epoch high-waterは行わない。CLAIMED、ATM hold、未解決quote、元receiptを保持し、任意過去backup・別host・C/B/index巻戻しは未対応である。

GX01では **全業務をterminal化することをcopyの前提にしない**。unknown/hold/outbox/元wire bytesを保持する。親のGX00 current-copy connection移行と同じ独立index正本を保持し、その上に追加gateを設ける。

1. 全Wallet/game worker停止を実確認してcurrent-copyを作る。C proofと全exchange関連表のtypedhashを検証する。コピー中に新dispatchを認めない。
2. 新runtimeを外部listener/schedulerへ公開する前に、保護された管理経路で各synthetic game authorityの issuer alias/current epoch を旧→新へCASする。C proofを単なるHTTP body自己申告として信用しない。初版same-host fixtureは実C照合を行う管理orchestratorだけが更新し、public author/owner APIへepoch変更を置かない。
3. 各gameのepoch移行receiptを別正本で保持し、中断後は同restore ID/old/new exact bindingでのみ再送する。一部gameだけ未完ならそのgameを unavailable に保持する。異なる過去copyを新epochと呼んで昇格させない。
4. 旧epoch commandのbytes/digest/IDは変更しない。新current管理認可によるstatus/reject wrapperが旧commandを参照する。APPLIEDなら旧terminalを検証して確定、まだ未適用なら旧applyを永久に拒否するtombstone取得後だけhold解放。受領不能なら保留し、同exchangeを新IDで購入し直さない。
5. 別processで旧writer、旧epoch遅延apply、source/copy両方向混在、途中epoch移行、未知receiptを実拒否する。外部authorityまで含むwhole-old-copy rollback/cross-host promotionは実装しない限りNOT_IMPLEMENTED。

terminal検証とsource preservationを含むこのgateは、C restore成功だけで省略できない。外部gameDBのbackup/restoreも別の正本管理であり、Wallet copyへ勝手に同梱して同時巻戻ししない。

## 8. 旧台帳と data ABI

初版 migration は stopped managed authorityへ明示する管理操作だけにする。通常constructor内の `CREATE IF NOT EXISTS` で既存posting CHECKを変えたふりをしない。旧台帳全schema/全typedrows/receipt/BLOB/counter/SQLite sequenceのbaselineを保存し、C writerを一つだけ保持したBEGIN IMMEDIATE内でposting表の版付き再構築、全旧行id/content複写、旧trigger/index再設定、新勘定/新trigger追加、schema receiptのcommitを行う。DDL中断は元版または完全な新版のどちらかだけにする。

旧wallet_postings/journalsの行の値は完全保持。旧withdrawal、月888、CLAIMED、pending sales、auth quotes、revoked credential、BLOB、DeviceAPI receipt、owner/accountも保持し、PRAGMA integrity_check/foreign_key_checkと旧+新監査を通す。SQL/schema差分と新行だけを明示allowlistにし、「全ファイルhash不変」とは表現しない。

新台帳を旧Walletが開けることと安全に書けることは別である。旧 `_balances()` は未知accountを辞書へ入れ得るが、旧 `_verify()` は新game対応を監査しない。旧OS/directlibraryが安全に新台帳を扱う保証にはならない。

現 updater は署名manifestの **`data_abi=rock-data-v1` 固定一致**だけで、userdata rollback/migration engineがない。game勘定を有効にするOSイメージを同じABIで通常A/Bへ流す提案はしない。安全な旧slot拒否または実証された両版互換と、移行/復旧手順を先に設計する。互換不能なら署名ABIを版上げするが、単に文字列を変えるだけで旧slotへのfallback安全性を解決したことにしない。

host専用copy fixture上のmigration実証は先に進められる。OS公開・実機installのgame有効化はD4/D5再実行と旧slot/旧client matrixが揃うまでfalse。元b828 imagesへの追加注入やruntime改変は本作業範囲外。

## 9. 実装前に固定する受入

| 試験 | 必須の実証述語 |
|---|---|
| 2作者×2game×2owner/3device | 同じ統合TLS route、実OwnerRouter/C/WalletAuth、同key/exchange/player文字列で4接続独立。owner/author境界と他game投影拒否 |
| 旧非空basis | 既存 `tests/game_legacy_basis.py` を再利用。元月888CLAIMED→PAID一回、ATM1000hold、237pending、revokedcredential/counter/receipt/BLOBを保持 |
| 同一AVAILABLE競合 | barrierでATM予約・月888・A/B承認を同時開始。受理額+hold≤実投入額、AVAILABLE≥0、月period一回、pendingを使用しない。実SQL各表と全postingsを確認 |
| 再送/改変 | key/body一致は同receipt、body/rate/asset/player/owner差替え409。別key同exchangeでhold/credit0追加。assertionの別key再使用とfailure後入金を拒否 |
| 各commit境界停止 | hold/outbox後、dispatch claim後、game credit+receipt後、Walletterminal後、reply前に実processを停止。別process再open、両DB作用一回、unknownhold保持 |
| cancel/apply race | game transactionの実race。APPLIEDまたは永久REJECTEDの一方だけ。NOT_FOUND直後の遅延applyを入れ、付与とWallet解放の同時成立0 |
| 暗号/整数 | signedliteral Python/Node独立vectors。bool/float/overflow/別domain/key用途/旧epoch/改変receipt/重複field/逆順結果を拒否 |
| A停止/B継続 | 固定TCP/TLS fault fixtureでAの無応答/切断/過大応答。総期限を実測し、B/ATM/Hub処理と既存月額の成功/拒否を別計測 |
| 失効/期限 | approval/claimとのrace、clockrollback、quote期限超過、author失効。新支出は拒否し、以前のunknownは内部照合・所有owner履歴に保持 |
| migration/restore | DDLの各境界停止、source不変、既存全表保持、currentcopy新epoch、元writer拒否、index/game/Wallet混在両方向拒否。未知交換を消さない |
| 負の権限 | 作者からAVAILABLE増額、sale/settle、ATMactor、reverse、bonus換金、偽原資、任意callback/URL/epoch更新を全入口で拒否 |
| SDK/UI | private pending journalをsend前commit、sameID復旧、quoteの全費用/units/合成表示、confirmingとcancel確定を分ける。新実OSでD4/D5を再実行 |

失敗注入は対象fixtureの実commit後停止/実I/O障害で行い、mock APPLIEDや偽署名で合格させない。各phaseに両台帳snapshot、原資投入履歴、全交換binding、immutable request/receipt hash、process終了理由、復元元不変性を残す。0件・skip・NOT_RUNはGX01完了へ換算しない。

## 10. 最初の現実的な順番と並行境界

**開始条件:** rootがGX00-ISOLATIONのmigration/current-copy/元writer拒否を確認し、GX01着手を明示するまで下記のruntime作業は待つ。

1. **契約 + 台帳移行の最小vertical slice。** S02/S03/S04/S05/S07を完全schema・署名vectors・拒否testsにする。別担当が旧非空basisに新勘定のmigrationと保存則testsを先に作る。protocol/fixture policy filesとWallet migration/ledger filesは並行可能。合流後、実owner assertion→同Wallettransaction hold/outboxまで通し、exchange capabilityはまだfalse。外部付与をmock成功させない。
2. **別game DB/TLS + worker +失敗回復。** 固定A/Bauthorityのterminal transactionを独立担当が実装し、Wallet担当はoutbox/current admission/receipt commitを担当。完全wire contractを境界に並行化する。managedserver/authorscopes/再同意は一人が統合する。actualTLS4接続でcommit境界停止・ATM/monthlyrace・unknowncancel/lateapplyを通して、host fixture限定のwallet_to_game capabilityだけ明示的に有効化できる。
3. **current-copy/SDK/UI/OS互換受入。** C担当とepochhandoffのdurable receiptを接続し、未確定交換を残した復元を通す。client journal/SDK/UIは確定wireに対して並行可能だが、OSのsigneddataABI/旧slot拒否は別承認・別candidateで行う。D4/D5とUI異常系まで揃って初めてGX01合成受入を判断する。GX02/実資金/逆方向はこの完了に含めない。

最初のコード差分は「全部のゲーム機能」ではなく、**既存台帳を保持するgame勘定migration + 厳密quote/承認 + hold/outbox同時commit**に絞る。その前に非空legacyと旧ABIの拒否条件をtestsで固定すると、後段の付与成功だけで台帳破壊を見落とさない。

## 読取り根拠

- `systems/rock-star-os/src/blackberryrock/wallet.py`: ACCOUNTS/SQL CHECK、`_transaction`/`_verify`、`_cached`/`_remember`、`bill`、`reserve`/`reconcile`、snapshot。
- `systems/rock-star-os/os/wallet_auth/service.py`: ATM専用quote/approval/admission triggers、current credential/counter、成功receiptとrollback境界。
- `systems/rock-star-os/os/atm/simulator.py`: `_issue_in_transaction`、owner/actor分離、unknownとfinalreconcile。
- `systems/rock-star-os/os/wallet_backend/{contract_runtime,authority_fence,server,client}.py`: current contract admission、runtime close、HTTPdeadline、remote許可list。
- `systems/rock-star-os/os/game_exchange/{protocol,connections,storage}.py`: connection-onlyscope、privateindex、currenthead、protectedmapping、lock順。
- `systems/rock-star-os/os/update/rock_update.py`: signedmanifestの固定dataABI検査。
- `docs/game-api-contract-draft.md` §4–6、S02–S10、X01–X07、`docs/gx00-owner-isolation-adr.md`、`docs/prompts/os-operational-base-next.md` D。
- C担当への限定確認: C current-copy proofは外部台帳/worker/unknown outcomeを証明しない。全terminal化やhold消去を復元前提にしない。

追加runtime: **0**。追加/実行test: **0**。VM/QEMU/DB/funds操作: **0**。本文の提案を実装済み・試験済み・本番条件確定と扱わない。
