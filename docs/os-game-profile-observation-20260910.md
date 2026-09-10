# Game authority profile の停止後観測

対象は RQ06/09/10/12/13/16/17。原則は「明確な楽観主義」と「べき乗則」。遠隔Walletの読み取り同期を金融更新と混同せず、既存の停止disk/SQLite/署名/期限の検証を再利用する。変更は観測器だけに限定し、最終イメージでの実測が完了するまで D5/D6 を合格にしない。

`wallet_cache_retention.py` は `snapshot.received_at` の観測契約を持つ。正常な読み取りでも既存 `RemoteWalletService` はこの列を更新するため、schema7 の計画がこの契約を明示したときだけ、停止後の比較で更新を許容する。

- snapshot は singleton=1 の1行だけ。列は singleton/payload/received_at の3列。
- received_at は SQLite REAL、Python float、有限かつ正。各連続観測間で後の値が前以上。
- singleton と payload の正確な UTF-8 bytes は不変。payload の空白だけの違いも拒否する。
- schema、sequence、identity、requests、すべての追加表を保持する。未知の列や追加表の変更を除外しない。
- cache は支出できる正本ではない。Wallet/Game/索引/router の正本は、全writerを止めた別の完全観測で確認する。cache だけを確認して正本の保持や復元に合格を付けない。
- 従来のlocal/purchaser profileは、明示した契約がない限り従来どおり全行一致を要求する。

schema7 の観測入口は `verify-business.py --boot-profile game-authority-ab --device-config FILE`。渡した完全なdevice設定と同じ三画像を使用し、未使用のbusiness端末名だけを割り当てる。画像/profileを再生成しない。最終 image/profile/config/source SHA、freeze/2、CLI/configのbytes、起動前の正本を計画に含める。元run44の5正常boot、61反復jobs、3600秒以上、4200秒以内、OCR confidence45、各deadline、資源上限、副作用0の条件は変更しない。

外部の操作は `python3 os/game_exchange/sandbox.py {stop,snapshot,start} --config FILE` に限定する。D所有のsandboxは停止を確認し、全lifetime lockを保持してtyped snapshotを返す契約である。Aの観測器はSQLiteを直接変更しない。最初の起動前、各正常停止後にWallet/Game/indexの全DBとC/routerの保護JSONを比較し、金額・資格・登録・月額・ATMの既知表が初めに0行であることも確認する。CLI/configが途中で変更された場合は拒否する。start/stop/snapshotは各30秒、出力2MiBに固定。QEMUの既存資源測定に外部サービスの資源が含まれるとはしない。

guest側は従来のauthenticator/Hub/remote queue/power、遠隔Wallet cache、交換journal、Game A/B接続journalの8DBを読む。SDKは初期identity1行のみ、要求/quote/intent/proof/binding等は0行。以後は全未知表も含めて一致させる。各連続観測間のreceived_at単調性を確認するため、比較の基準は直前の停止snapshotにする。署名A/Bのhash不変、旧receipt保持、guest発の正常終了とread-only filesystem検査も従来どおり必須。

`--preflight-only` は停止済みauthorityのsnapshotだけを取り、start/stopやQEMUを起動しない。従来のlocal Wallet初期化をschema7へ流用する `--prepare-backup` は拒否する。実行順は最終imageでD4、空の新authorityでD6、その保存環境で明示Wallet/Game操作、最後に別復元先のD5とする。D5では元writerの無効化と外部正本の別復元が必要であり、guest cacheの保持だけでは外部gateをNOT_RUNのまま残す。

実SQLiteを使う8件で、時刻のみの正常更新、逆行、金額/空白変更、identity/requests/未知表/schema/sequence変更、行欠落/重複、非有限/非正/非REAL、追加列、契約を持たないprofileの拒否を確認した。これは観測器の回帰であり、実OSの受入ではない。既存backup47件、business41件も成功。元失敗・旧画像・旧dataには変更を加えていない。

追加した外部観測8件とschema7接続5件では、5個の必須DB/C/router保護JSON/表の欠落、非空の金融/資格/会員表、追加表/schema/pragma/identity変更、別authority、重複表、bool件数、CLI/config変更、非零終了、出力超過を拒否した。business系全73件、backup47件も成功。実sandboxによる全writer停止・snapshot、同じGame imageのD4〜D6、外部復元は、この文書時点でNOT_RUNである。

後続の[実Linux接続記録](evidence/os-base/game-profile-observer-20260910.json)では、AのobserverからDの所有sandboxへ接続した。最初の停止snapshotで5DB/71表/8保護JSONと19個の空表条件を確認。start 0.203秒、稼働中snapshotの実拒否、stop 0.164秒を経て、全snapshotのcanonical hashは前後とも `caade4e968ee125e924614bd6c74a12a469db0a3f28c4ed3a1e6239d34a2c535` だった。snapshotは全lifetime lock保持・空WAL・immutable読取のD実装を通す。QEMU、Game UI、金融操作は行わず、元stateをSTOPPEDへ返した。これは最終source確定前のCLI SHAを固定した接続検査であり、最終imageのD6へ転用しない。

schema7でもremote queueに行がある場合や別services設定がある場合は、runner/registryを外部保存・復元の必須対象に戻す。Gameであることを理由にPC上の開発runnerの状態を省略しない。対応を示す別証拠がない限り外部restore gateはNOT_RUNとする。
