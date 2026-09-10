# Game authority profile の停止後観測

対象は RQ06/09/10/12/13/16/17。原則は「明確な楽観主義」と「べき乗則」。遠隔Walletの読み取り同期を金融更新と混同せず、既存の停止disk/SQLite/署名/期限の検証を再利用する。変更は観測器だけに限定し、最終イメージでの実測が完了するまで D5/D6 を合格にしない。

`wallet_cache_retention.py` は `snapshot.received_at` の観測契約を持つ。正常な読み取りでも既存 `RemoteWalletService` はこの列を更新するため、schema7 の計画がこの契約を明示したときだけ、停止後の比較で更新を許容する。

- snapshot は singleton=1 の1行だけ。列は singleton/payload/received_at の3列。
- received_at は SQLite REAL、Python float、有限かつ正。各連続観測間で後の値が前以上。
- singleton と payload の正確な UTF-8 bytes は不変。payload の空白だけの違いも拒否する。
- schema、sequence、identity、requests、すべての追加表を保持する。未知の列や追加表の変更を除外しない。
- cache は支出できる正本ではない。Wallet/Game/索引/router の正本は、全writerを止めた別の完全観測で確認する。cache だけを確認して正本の保持や復元に合格を付けない。
- 従来のlocal/purchaser profileは、明示した契約がない限り従来どおり全行一致を要求する。

schema7 の D6 接続は後続で固定する。最終 image/profile/config/source SHA と起動前の正本を計画に含める。元run44の5正常boot、61反復jobs、3600秒以上、4200秒以内、OCR confidence45、各deadline、資源上限、副作用0の条件は変更しない。Game機能の明示操作による初回登録やcreditより前に空の基準を確定する。

実SQLiteを使う8件で、時刻のみの正常更新、逆行、金額/空白変更、identity/requests/未知表/schema/sequence変更、行欠落/重複、非有限/非正/非REAL、追加列、契約を持たないprofileの拒否を確認した。これは観測器の回帰であり、実OSの受入ではない。既存backup47件、business41件も成功。元失敗・旧画像・旧dataには変更を加えていない。
