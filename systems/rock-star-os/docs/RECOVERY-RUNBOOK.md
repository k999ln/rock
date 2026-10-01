> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# 実OS開発版の停止・復旧

## 実OSの通常終了

OS画面右上「端末」→「電源を切る」→「確認して実行」を使います。OSが常駐サービスを終了し、データを同期してから停止します。ブラウザを閉じるだけではOSは終了しません。起動用terminalのControl+CをOS終了の代わりにしないでください。

現在のMac用入口は `os/desktop/launcher.py --manifest <launcher-manifest.json>`。`--status` の `running: false` で停止を確認できます。外付けSSDを取り外す前には、すべての開発用OSを停止したうえで、外付け上のLima開発VM `rock` も正常停止してから保存領域を取り外します。既存VMや不明なプロセスを強制終了する手順は含めません。

## 実OSのバックアップと復元

正常停止後、同じ起動入口に `--backup` を付けると、データ全体を専用VM内の新しいバックアップへ保存します。全体SHA-256とファイルシステムの読み取り検査が一致したものだけを採用します。稼働中、破損、不明な所有者、既存の復元先は拒否し、元データを初期化・修復・上書きしません。

復元はLinux開発VM内の `os/desktop/guest.py restore --name <新しい端末名>` へ、標準入力JSONの `backup` に確認済みバックアップの絶対パスを指定します。返った新しいdevice設定を新しい起動manifestへ使います。元の端末とバックアップは保持します。復元した端末は `network: none` 固定です。外部runnerの台帳はこのバックアップに入らないため、古い未確定処理を新しい外部サービスへ自動再送しません。

最新の実証は backup-restore-final-1404（元snapshot内の参照。履歴資料は今回のGit対象外）。実OS画面で作成したTool・完了結果・登録済みWallet・請求888 cents×1・残高4112 cents・自動更新取消を含む32業務テーブルが別kernel起動後にも厳密に保持され、画面から正常終了しました。元データとバックアップの全体SHAも不変です。Wallet/ATMは試験値で、実資金の復旧検証ではありません。旧 backup-restore-1305（元snapshot内の参照。履歴資料は今回のGit対象外） はWalletが空の別fixtureとして保持しています。バックアップ自体の暗号化は未実装です。

比較は同じUTC月、実行中のToolや未確定の月次処理がない状態で行います。復元後に追加される正常終了の控え1件だけを例外とし、業務データの変化は省略しません。外部runnerの台帳やproviderの状態まで巻き戻す手段ではありません。

## 更新・ツール・通信の復旧

OSのA/B更新は [更新手順](../os/update/README.md) に従います。正式に確定した起動先を維持し、起動失敗や書込み失敗時の復帰を検証しています。開発用の公開信頼鍵であり、BlackBerry実機のsecure boot認証は未実施です。

Tool更新後は権限を確認して再承認します。旧版へのrollbackには保存済みの有効な署名packageが必要です。Remote結果が不明なときは同じ実行の「状態を確認」または同じキーでの再試行を使います。状態不明を失敗と決めつけて新しい実行へ置き換えません。Wallet/ATMの結果不明は保留し、ATM専用経路の証拠で照合します。一般利用者画面からATMの排出結果を申告して残高を確定することはできません。

## 以前のPC用Hub試作

1. 起動したterminalでControl+C。実行中jobは次回起動時にinterruptedとして残る。無条件自動再実行しない。
2. 同じ`--state`で再起動してHub履歴とWallet snapshotを確認する。起動はREADME参照。同一stateを複数processで同時使用しない。
3. Toolの悪い更新は旧版を選択し「保存済みの版へ復元」→再承認。署名不正/失効した版は復元不可。未取得の旧版はoffline復元できない。
4. 問題Toolは「停止する」。実行中workerを取消。削除してもreceipt/結果は残る。実データの保持削除policyは本番前に整備する。
5. Walletの不明結果は保留維持。UIの「照合して残額を返還」は**simulatorで確認済み累計額**に基づく試験。実ATM障害時の自動返金ロジックではない。

## DB backup/restore

実行中のHubは`Hub.backup(new_path)`のSQLite online backup APIを利用可能。同じpathや既存pathを拒否。テストでreceipt/install/auditの復元を確認。

Walletを含む保存フォルダ全体を手で保存する場合は、先に全processを停止し、`--state`フォルダ内の `.db` と存在する `-wal`/`-shm` を一緒に新しいフォルダへコピーする。稼働中DBファイルだけのcopyは一貫したbackupとして扱わない。元フォルダは保持し、restore先は新規フォルダで起動する。未知のbackupを実行しない。

配布ソースに`.state`やsession cookie/秘密値を同梱しない。開発用RFC署名fixtureは公開データで、実鍵/金融資格情報ではない。

BlackBerryのbootloader/flash/OS復旧手順は未確定。factory resetや出所不明ROMで埋め合わせない。実機調査（元snapshot内の参照。履歴資料は今回のGit対象外）に記録した型番・正規復旧の不足を解消してから別の実機試験へ進む。
