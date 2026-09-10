# GX00 host isolation gate 独立監査

記録: 2026-09-10 01:01 UTC。基準commitは `d16ba2d34e42e69ce9c948101f538658c170a68d`、監査対象はcurrent-copy handover・owner clientを加えた作業中tree。各code hashは併記JSONに固定した。**現状は HOST_GATE_INCOMPLETE。統合72 game tests PASSと、GX00全条件合格を区別する。** 最新指示に従い追加修正を停止し、この記録だけを確定した。

## 原条件と未達

正本 `docs/prompts/os-operational-base-next.md:96` は「同じplayer文字列/交換ID/冪等キーの誤衝突防止」「同owner月額1回/別owner独立」「他ownerのquote/receipt/同意参照拒否」「失効/残高不足の非波及」「worker再利用」を明記する。ADR:180–186も同じ条件を具体化している。

| ID | 判定 | 具体的な不足と最小の次作業 |
|---|---|---|
| H01 | **実再現FAIL・未修正** | 同ownerでGame A/Bへ同begin keyと同approve keyは成功するが、同reconcile keyはA成功→B `rejected`。`connections.py:256`のnamespaceがdevice/op/keyだけでgameを含まない。版付きgame namespaceとlegacy完全一致再送を設計し、元成功receiptを保持して直す必要がある。候補実装・patchはまだ作っていない。 |
| H02 | 同一経路の証拠不足 | 実TLSはAlice888/Bob0。両者888は実runtime直呼出＋test principal verifier。両owner各888・Alice2台1回、およびAlice残高不足/Bob全表不変を同じTLS fixtureで補う。 |
| H03 | 同一経路の証拠不足 | foreign withdrawal ID、game consent、認可拒否はある。別ownerのATM quote ID・元issue/register receipt要求の拒否を、現在認証と対象外DB不変まで結んだ例が不足。 |
| H04 | 再利用の証拠不足 | 既存並行試験のThreadPoolはclient側。productionはThreadingMixInのrequestごとのthreadで、同一worker再利用の証明ではない。実handler/router/runtimeを変更せず、test専用単一executorでA→B→Aと実policy例外後scopeを記録する案。production pooling成功とは呼ばない。 |
| H05 | clientの明示的制限 | `OwnerConnectionClient`のjournalは同client内 `(operation,key)`。別gameのbeginも同key・別bodyなら送信前拒否。reconcile/listも非提供。これは文書化済みの狭いclient方針で、serverの広いnamespaceや汎用SDK合格へ読み替えない。今回変更しない。 |
| H06 | 記録の統合待ち | 72件成功の実root logはあるが、旧component JSONは以前のhash/未実装一覧を残す履歴。最新commitのsourceを固定したcheckpointへ、H01–H04未達と個別証拠を結ぶ。旧結果の書換えや過去Linux CIの付替えはしない。 |

H02–H04はdesign_reviewが調査・隔離source copyまで行い、最新checkpoint指示で停止した。新source変更0・新test0・実行0で未適用。再開案は `work/gx00-owner-tls-continuation.json` に保存されており、完了扱いにしない。コードの故障と断定せず、原受入に対する証拠の不足として区別した。

## H01の実再現

`work/review-gx00-cross-game-keys.py` は元sourceをread-onlyでimportし、独立temporary DB・実OwnerRouter/C/Auth・同一TLS listenerで実行した。独立game authorityがそれぞれproofを発行し、game専用署名ceremonyだけ別key、wireのbegin/approve/reconcileはゲーム間で同じkey文字列とした。

| ゲーム | begin | approve | reconcile |
|---|---|---|---|
| A | 成功 | 成功 | 成功 |
| B | 成功 | 成功 | `rejected` |

実行0.477秒。元source hash前後一致、QEMU操作0。原ログ `work/gx00-cross-game-keys-independent.log` を保持する。この試験は誤衝突を示すもので、資金の二重記帳や情報流出を観測したものではない。拒否を修正済みとせず、新版namespace候補は**未実装・未適用**。

## 既に通っている範囲

- 実OwnerRouter/Cと既存Wallet/Authを再利用し、2owner/3購入端末が1つのTLS listenerを使う。本文のowner/ledger/path指定を拒否する。
- 独立したpublic syntheticの2作者・2ゲームに4接続。専用本人署名、counter/challenge/consentの同じWallet transaction、予約、失効、越境拒否、通信断・再起動の実試験がある。
- 非空legacyの888 CLAIMED、1000 hold、237 pending、失効credential/counter、元receipt・BLOBを保持するadoptionとcurrent-copy handoverがある。実commit3箇所の中断、非空WAL、epoch3への再復元、旧/新copy混在を試験。DONE再送の追加BLOB差異も修正後にconstructor前拒否、元/先/index不変とcleanupを独立確認済み。
- 専用host owner clientは送信前の永続保存、応答消失後の同一要求再送、現在認可、SQLite/fsync失敗、TLS/鍵/期限pinを実検証。実送信中closeの待機とunknown要求の再開も独立確認済み。
- root統合 `work/game-integrated-root.log` は72件/64.988秒/OK。これは上記H01を含む原条件すべての合格宣言ではない。

## 別軸として残す範囲

**凍結OS b8287bcにGX00は含まれない。** そのQEMU D0–D6・D5復元と、このhost変更の受入は別。新GX00イメージ・署名data ABI・旧slot互換・変更後D4/D5は未検証であり、host gateを通しても完了にならない。同時に、それを単一owner OS V01の追加待ち条件にしない。

旧b828の実serverはmanaged markerをconstructor前に拒否するが、旧Wallet/Store直呼出libraryはcopyへ書けるとの実測がある。現変更を旧OS local台帳へ持ち込める、同じABIで安全にrollbackできる、とは言えない。

復元は**元C/B/indexを保持した停止中・同host・current copy**のみ。過去backup、元disk消失、別host、分散fence、同path/UUIDのregistry巻戻し検出は未対応。PREPARED中は共有index全ownerのmaintenance停止となり、後続author失効は保持するが自動回復を止める。無停止運用・一般災害復旧の合格には含めない。

player proofは独立した実synthetic authorityとPython fixture APIであり、外部game HTTP providerではない。GX01交換/両資産台帳/outbox、OS game UI、一般作者SDKと導入計測、実ゲーム、実機、MetaMask実資金は別未完。未要求のguest毎service資源計測やUI実行中cancelを新たなGX00 mandatoryへ加えていない。

このcheckpointは「既存台帳を使う認証付きhost接続と限定current-copy復旧が進み、72回帰を通過した。一方、cross-game reconcileの実衝突と原条件の追加証拠が残る」と記録するのが妥当である。
