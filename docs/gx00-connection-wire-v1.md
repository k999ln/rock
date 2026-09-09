# GX00 接続契約 1 — schema / signature 単位

2026-09-09。`game-api-contract-draft.md` §S01/S04/S05/S06/S09 の **GX00部分**を、`systems/rock-star-os/os/game_exchange/protocol.py` と拒否vectorsへ固定する独立差分。これは接続サービスを実装・公開した記録ではない。

HTTP listener、author/player Bearer認証、保護されたgame registryの永続管理、共有subject索引、Wallet同一transactionでの接続同意、OS画面、SDK、assets API、交換は未実装。`capabilities()` は `connections:false,assets_snapshot:false,exchange:false,history:false,simulation_only:true` を返す。validatorが存在することをoperationの提供へ換算しない。GX00全体、A/C migration/restore、凍結OS、実ゲーム・実資金の合格を表さない。

本差分の内部context値は、既存managed routeの認証とC admissionから渡す信頼済み値である。dataclassを作れることは認証ではない。将来owner入口は `ManagedHandler → OwnerRouter → ContractRuntime.dispatch → C admission → router.assert_current → device_scope` を維持する。author入口は別のauthor資格情報とprotected game mappingで認証し、共有索引の接続bindingから既存runtimeを解決する。bodyのowner/account/device/path/ledgerでruntimeを作成・選択しない。新しいWalletServiceや裸のDB接続による迂回を追加しない。今回は既存server/runtime/Authを変更しない。

## 値と正規化

全schemaのfield集合は厳密。未知、欠落、重複JSON keyを拒否し、拡張用の任意objectは置かない。全objectはUTF-8 JSON、上限65,536 bytes、深さ12、node数2,048。BOM、float/指数表記/NaN/Infinity、負数と`-0`を拒否する。整数の共通範囲は0〜2^53−1、version/revisionは1以上。boolは整数ではない。`simulation_only` は正確なtrue。

| 記号 | 厳密な型・制限 |
| --- | --- |
| id | ASCII `[A-Za-z0-9][A-Za-z0-9_.:@-]*`、1〜160文字 |
| key | 同じ文字集合、1〜128文字 |
| uuid | lowercase canonical UUID文字列。入力pathではない |
| text | NFC、1〜160 Unicode文字かつ640 UTF-8 bytes以内。制御・format・surrogate文字を拒否。署名済み表示をsanitize/normalizeして検証しない |
| digest | SHA-256 lowercase hex64文字 |
| bytes | canonical base64url、paddingなし。再encode一致を要求 |
| time | UTC Unix秒の整数、1以上。境界は`issued_at <= now < expires_at`、skew猶予なし |
| scopes | ASCII昇順・重複なしlist。`connection:read`必須、`connection:revoke`だけ追加可。未知scope/`assets:read`/`exchange:*`は拒否 |

署名用canonical JSONはASCII schema key順、UTF-8、`ensure_ascii=False`、余白なし、整数は十進数。wireの空白・field順・Unicode escape表現の違いはdecode後の同じ意味へcanonicalizeする。文字列をUnicode同値へ置換しない。表示のNFDは受理しない。これは独自の限定profileであり、RFC8785/JCS全体対応という主張ではない。literal vectorsにはcanonical UTF-8全bytesのhexを保存している。

## 鍵・domain・digest

署名はEd25519、public keyはraw32 bytes、signatureはraw64 bytesをcanonical base64urlにする。OpenSSLによる実検証を既存WalletAuthの低層Ed25519 verifierへ委譲し、鍵や署名domainは共有しない。非canonical/非prime-subgroup public pointも既存検査で拒否する。

`KeyRecord`の全fieldは `key_id:id,revision:int>=1,purpose:enum,issuer:id,public_key:bytes32,not_before:time,not_after:time,retired_at:time|null,revoked_at:time|null`。not_afterはnot_beforeより大きい。immutable `KeyRegistry(tuple)` は信頼済みsnapshotだけを受け、requestからのkey import、秘密鍵、tokenは受けない。最大64keys。同じkey materialを別ID/revision/issuer/purposeへ登録できない。既存Tool/Registryの公開fixture keyも登録禁止。snapshot自体のprotected file管理・rotation/revocation high-water・restoreは本差分で実装していない。

| signed schema | key purpose / issuer | 署名先頭のASCII bytes |
| --- | --- | --- |
| connection proof | `game.connection.proof` / 登録済みgame authority | `RockGameConnectionProof-v1`の直後に1 byte `00` |
| author共有接続receipt | `wallet.connection.receipt` / 登録済みWallet authority UUID | `RockGameConnectionReceipt-v1` + `00` |
| owner list cursor | `wallet.connection.cursor` / 登録済みWallet authority UUID | `RockGameConnectionCursor-v1` + `00` |

各署名は **domain bytes + そのschemaのtop-level `signature`だけを除いたcanonical JSON**。nested fieldを一律除去しない。2文字のbackslash+`0`はNULではなく、署名が一致しない。

proofとcursorは現在有効・非retired・非revoked keyを要求する。署名時刻と現在時刻の両方がkey有効期間内でなければならない。共有receiptの過去署名は、その署名時に有効でretirementより前ならTTL/key retirement後も照合できる。revoked/未知keyは過去receiptの信頼照合も拒否する。これと現在のAPI認可は別であり、過去署名が正しくても失効/期限切れauthor資格情報や古い接続headでは照会できない。署名検証器の実行不可は`VerificationUnavailable`であり、偽署名と同じ成功値へ変換しない。

| digest | 対象を省略せず固定 | domain + NUL |
| --- | --- | --- |
| proof_sha256 | signatureを含むproof全体 | `RockGameProofDigest-v1` |
| binding_sha256 | binding全体。binding内にdigest自身は存在しない | `RockGameConnectionBinding-v1` |
| owner request_sha256 | `v,op,key,...`を含むowner request全体。nested proof/assertion signatureも含む | `RockGameOwnerRequest-v1` |
| assertion_sha256 | owner credential object全体 | `RockGameOwnerAssertion-v1` |
| consent_sha256 | 内部owner consent receipt全体 | `RockGameOwnerConsent-v1` |
| shared request_sha256 | 共有publication object全体。元owner requestではない | `RockGameConnectionPublication-v1` |
| shared receipt hash | top-level signatureを含む共有receipt全体 | `RockGameSharedReceipt-v1` |
| cursor scope_sha256 | 下記cursor scope object全体 | `RockGameConnectionCursorScope-v1` |

exchange binding/apply/reject、terminal financial receiptのschema/domainはGX01の未対応領域のまま。既存Tool/Registry署名、Entitlement fixture HMAC、ATM code、author Bearer、player session、Wallet issuer credentialを接続proofへ使わない。

## Proofとowner bindingの完全field集合

固定値は下表の文字列そのもの。他のfieldは前記型へ従う。

| object | 全field |
| --- | --- |
| proof | `schema:"rock-game-connection-proof/1",environment:"synthetic",game_authority_id:id,game_id:id,game_revision:int>=1,player_id:id,player_display:text,player_display_revision:int>=1,audience:uuid,nonce:bytes32,issued_at:time,expires_at:time,requested_scopes:scopes,algorithm:"Ed25519",credential_id:id,credential_revision:int>=1,signature:bytes64` |
| internal binding | `schema:"rock-game-connection-binding/1",environment:"synthetic",wallet_authority_id:uuid,owner_ref:id,account_id:uuid,device_ref:id,credential_revision:int>=1,author_id:id,game_authority_id:id,game_id:id,game_revision:int>=1,game_name:text,player_id:id,player_display:text,player_display_revision:int>=1,proof_sha256:digest,proof_nonce:bytes32,intent_id:uuid,connection_id:uuid,scopes:scopes,terms_version:"rock-game-connection-synthetic/1",created_at:time,intent_expires_at:time,connection_expires_at:time` |

proof TTLは1〜120秒。game ID/revision、署名keyとissuer、audience、requested scopesを現在のprotected GameRecordへ照合する。game nameはregistry由来、player ID/display/revisionは同一proofの署名対象。未署名の別displayを本人名として表示しない。player sessionが本人を認証してproofを発行するHTTP処理はまだない。

`OwnerContext`は `wallet_authority_id,owner_ref,account_id,device_ref,credential_revision`。`GameRecord`は `author_id,game_authority_id,game_id,game_name,revision,scopes(tuple)`。proof検証後、trusted contextから`make_binding`する。make_binding単独は署名認証やnonce予約ではない。`match_begin_intent`は保存begin receiptのkey/request全文hash・全proof/display・scope/期限とtrusted contextから同じbindingを再構成して照合する。これもproofの暗号学的認証とは別のjoinである。

scopeはowner希望がproof/game許可集合のsubsetであることを要求し、権限を黙って増減しない。binding intent期限はproof期限、作成後1〜120秒。接続期限はintent期限以上、作成から最大24時間。承認はintent期限より前のみ。

## Intent・同意・予約と再送

| object | 全field |
| --- | --- |
| intent | `schema:"rock-game-connection-intent/1",environment:"synthetic",state:"AWAITING_OWNER_CONSENT",operation:"game.connection.begin",key:key,request_sha256:digest,receipt_id:uuid,binding:binding,binding_sha256:digest,challenge_id:uuid,options:options,simulation_only:true` |
| options | `schema_version:1,purpose:"wallet.game.connect",device_ref:id,publicKey:publicKey` |
| publicKey | `challenge:bytes32,timeout:int[1,remaining_intent_ms],rpId:既存Wallet RP_ID,allowCredentials:[{type:"public-key",id:bytes[1,1023]}],userVerification:"required"`。credential1〜16件、ID重複なし |
| internal owner consent | `schema:"rock-game-owner-consent/1",environment:"synthetic",operation:"game.connection.approve",key:key,request_sha256:digest,receipt_id:uuid,binding:binding,binding_sha256:digest,challenge_id:uuid,credential_id:bytes[1,1023],assertion_sha256:digest,credential_sign_count:int[0,2^32-1],committed_at:time,decision:"APPROVED",simulation_only:true` |
| internal shared reservation | `schema:"rock-game-subject-reservation/1",environment:"synthetic",state:"RESERVED"|"WALLET_CONSENT_COMMITTED"|"ACTIVE"|"REVOKED",binding:binding,binding_sha256:digest` |

内部consentはWallet同一transactionのdurable receiptであり、外部authorityの署名receiptとは呼ばない。`verify_owner_approval`は保存されたoriginal device/revision/intent/challenge/bindingと、allowCredentials、既存WalletAuthの固定RP/origin/userHandle/flags/Ed25519/counterを実検証する。戻るcounter recordは未commitの検証結果。**counter更新・challenge消費・consent receiptを同じ実Wallet transactionでcommitする処理は未実装**。`match_owner_consent`は保存intent、owner request全文hash、credential全文hash、key、challenge、binding、signed counterを照合するだけでcommitしない。

A2は同契約のstatus/reconcileを実行できるが、A1の未完challengeをapproveできない。A2へのtransfer、未完intentのcancel、TTLによるreservation再割当、reconnectionは本版では未提供。単に別begin/newkeyを作って未確定commitを回避しない。intent期限後はapprove不可、同intentのstatus/reconcileによる調査は可能。

将来の共有索引には `(game_authority_id,nonce)` と `(game_authority_id,game_id,player_id)` の両方をatomicに一意化する必要がある。`reservation_keys`/`match_reservation`はその固定keyと既存rowの完全一致を検査するpure関数。subject予約・unique SQL・state遷移はまだ実装していない。RESERVED→WALLET_CONSENT_COMMITTED→ACTIVEは同じbinding/nonce/intentを保持し、Wallet receipt不明なら予約を解放しない。REVOKEDでも古いnonceは未使用へ戻らない。

同key・同op・同canonical requestのみがexact replay。異なるkey/op/payloadは`ProtocolError`。再送前にも現在のdevice/author資格情報を再確認する。期限切れ・失効は過去のimmutable receiptを消したり、未確定処理を未実行へ戻したりする根拠にならない。

## 共有receipt・scope別projection

共有publicationの全fieldは `wallet_authority_id:uuid,game_authority_id:id,game_id:id,player_id:id,connection_id:uuid,scopes:scopes,terms_version:固定terms,issued_at:time,expires_at:time,revocation_generation:int,state:"ACTIVE"|"REVOKED",decided_at:time,binding_sha256:digest,consent_sha256:digest,simulation_only:true`。

ACTIVEはgeneration0、decided_at=issued_at。REVOKEDはgeneration1以上、decided_at>=issued_at。次generationの正確な+1と冪等な失効commitは将来のDB transactionが担う。接続TTL経過は表示上EXPIREDとし、署名済みpublicationを書き換えない。

署名付き共有receiptの全fieldは `schema:"rock-game-connection-receipt/1",environment:"synthetic",operation:"connection.publish",key:"publish:"+connection_id+":"+generation,request_sha256:publication全文digest,receipt_id:uuid,publication:上記object,algorithm:"Ed25519",credential_id:id,credential_revision:int>=1,signature:bytes64`。このpublic key/request digestは**共有publication**用であり、元owner requestのkeyや内部receiptを流出させない。

`ConnectionHead`は現在のadmission内で読み取ったprotected索引の `wallet_authority_id,game_authority_id,game_id,connection_id,revocation_generation,state,receipt_sha256`。project関数はこれと署名済みreceipt全体の一致を要求する。署名が正しい旧ACTIVE receiptでも、現在REVOKED headを置き換えられない。headの永続取得/失効checkは本差分の外部責務であり、HTTPでheadを自己申告できない。

| projection | 全field / scope |
| --- | --- |
| author ACTIVE | `schema:"rock-game-author-connection-view/1",wallet_authority_id,game_authority_id,game_id,connection_id,revocation_generation,decided_at,expires_at,player_id,scopes,terms_version,issued_at,state:"ACTIVE",as_of:time,receipt_sha256:digest,simulation_only:true` |
| author REVOKED/EXPIRED | 上記から`player_id,scopes,terms_version,issued_at`を除き、stateだけ`REVOKED`又は`EXPIRED`。別gameには返さない |
| owner | `schema:"rock-game-owner-connection-view/1",connection:publication,current_state:"ACTIVE"|"REVOKED"|"EXPIRED",as_of:time,consent_receipt_id:uuid,approved_device_ref:id,receipt_sha256:digest,simulation_only:true` |

`GamePrincipal`はprotected認証の `author_id,game_authority_id,game_id,credential_revision,scopes(tuple),expires_at,revoked(bool)`。project_authorは現在GameRecordとの全当事者一致、未失効/期限内、`connection:read`を要求する。project_ownerはWallet authority/owner/account一致を要求し、同owner A2への参照を許す。author出力にowner/account/device/ledger/path、全Wallet残高、仕事、他game履歴、proof nonce/challengeや内部同意全文は入らない。投影は表示情報であり、Wallet支出・game grantの許可ではない。

## operation field集合・scopeと未提供API

ownerの既存`v:1` requestに下表だけを定義する。bodyにowner/account/device/ledger/pathを追加できない。owner route認証とgame本人確認は別であり、author側からowner RPCを呼ばない。

| owner op | `v,op`以外の全field |
| --- | --- |
| game.connection.begin | `key,proof,scopes,terms_version,connection_expires_at` |
| game.connection.approve | `key,intent_id,challenge_id,binding_sha256,credential` |
| game.connection.reconcile | `key,intent_id` |
| game.connection.status | `connection_id` |
| game.connection.list | `limit:int[1,50],cursor:null|opaque_base64url` |
| game.connection.revoke | `key,connection_id` |

approveのcredential field集合/任意fieldは既存 `wallet_auth.protocol._credential(...,False)` と完全に一致する。必須`id,rawId,type,response,clientExtensionResults`、任意`authenticatorAttachment`。typeはpublic-key、id=rawId、clientExtensionResultsは空object、responseは正確に`clientDataJSON,authenticatorData,signature,userHandle`。単なるshape検査と実`verify_assertion`を区別する。現在SoftwareTestAuthenticator/OS UIはgame purpose未対応であり、テストは公開専用owner keyで正しいWebAuthn bytesを署名する。

author requestは `connection.status {v,op,connection_id}`（`connection:read`）と `connection.revoke {v,op,key,connection_id}`（`connection:revoke`）だけ。author Bearerの現在のscopeを検査してから既存bindingへ限定する実HTTP処理は未実装。`assets.snapshot`、`connection.history`、全`exchange.*`は`FeatureDisabled`、空の成功resultを返さない。assetsのunit/revision/as_of/stale/authority停止cache契約とGX01 terminal receiptは未実装として残す。

owner listのcursor scopeは `wallet_authority_id,owner_ref,account_id,device_ref,credential_revision,operation:"game.connection.list",limit:int[1,50],filter:"all"`。署名cursorは `schema:"rock-game-connection-cursor/1",environment:"synthetic",issuer:uuid,scope_sha256:digest,after_id:uuid,issued_at:time,expires_at:time,algorithm:"Ed25519",credential_id:id,credential_revision:int>=1,signature:bytes64`。canonical bytes全体をpaddingなしbase64urlにする。復号後最大4,096 bytes、TTL最大120秒。同ownerでも別device/revision/limit/filterへ使い回せない。author履歴cursorは未提供なので越境利用のための共用cursorを作らない。

HTTP outer response/error envelope・header framingは本差分で既存Walletへ変更しない。後続の版付きtransport統合で固定し、pure artifact validatorの成功をHTTP成功へ読み替えない。

## 実測とliteral vectors

`tests/test_game_connection_protocol.py` はMacで18 tests PASS。実OpenSSL Ed25519署名/検証、2作者/2game/2ownerの4つのprotocol binding、実owner assertion、expiry/revocation/domain混用/既存Tool key/Entitlement HMAC/ATM code/表示改ざん/未知scope/別context/署名済み旧head/cursor/retry/reservationの拒否を確認。これは4つのACTIVE接続DBや実game sessionの成功ではない。QEMU/凍結OSとLinux負荷試験は実行していない。

`os/game_exchange/fixtures/connection-v1-vectors.json` は公開専用の完全object、公開keys、canonical hex、署名入力全hex、digest、拒否入力を収録する。owner consent/request/challenge/counterを実署名へjoinし、testでliteral bytesを再照合する。署名器はtestだけが持つ公開seed、runtime protocolは検証のみ。異なる言語の実装を実行した証拠ではなく、他言語が同じbytesを再現するためのvectorである。
