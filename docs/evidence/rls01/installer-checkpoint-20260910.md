# RLS01 導入・配布担当 checkpoint

担当 B。統括 T0 は 2026-09-10T05:43:35Z、終了予定 13:43:35Z。分離 worktree の branch は `codex/rockstaros-installer-20260910`、起点は `91debc28174d87be023b789980d2c46112a66979`。README/project/status/CHECKPOINT の統括更新とは担当範囲を分ける。

着手判断: **RQ12/16/17 / 0→1・べき乗則・明確な楽観主義 / 初回の VM 設定と保存結果を復旧する手間 / launcher v2・guest・stage0・backup の再利用 / 署名配布と所有権を扱う薄い入口 / 初回設定・復旧時間・既存 VM 変更 0 / fresh OS 操作と署名・所有権の異常系試験。**

## 06:10 UTC までの実装と確認

- `preview.py`: 外部の鍵 fingerprint と manifest pin による署名/hash 検証、HTTPS 取得、厳密な archive 展開、専用 LIMA_HOME/新 VM、image/source guard、起動・通常終了案内・再開、停止済み backup/export、別名 restore、元端末 retire、所有 VM の削除、診断、失敗 VM の限定 cleanup。
- `package_preview.py`: 完全な source commit の追跡済み native source、同じ `rock-build-freeze/2` の source/image/config hash と入力台帳を照合。順序・mtime・uid/gid・gzip timestamp を固定した archive、Ed25519 envelope、SHA256SUMS、日本語ガイド・リリースノート・NOTICE を生成。
- 既存の公開 RFC8032 試験 seed を再利用。鍵生成なし。試験 signature を production trust と表示せず、使用には明示 flag と独立 manifest pin を必須とする。外部管理済み Ed25519 signer の入力口は別。
- 実測 host: macOS 15.7.4 build 24G517 / arm64 / Lima 2.2.0 / Python 3.14.7 / OpenSSL 3.6.3。元の Linux は Debian 13 / QEMU 10.0.11 と A 担当から受領。installer が新しい VM で実測した値ではない。
- 27 件の専用試験 PASS。実 OpenSSL Ed25519 検証、改変拒否、archive path/link/device/重複/欠損、public test key 明示、所有権不一致、VM identity 不一致、稼働中 backup/restore/delete 拒否、default LIMA_HOME 非使用を確認。
- 既存 launcher 23 件 PASS。`py_compile` と `git diff --check` PASS。VM/lifecycle の単体試験は mock であり、fresh VM/OS/UI の受入には数えない。
- 最初の署名試験で `openssl pkey` の入力形式 flag を `pkeyutl` と共用したことによる失敗。`pkey -inform DER` に分け、実 signature の再試験を通した。暗号 guard は変更していない。

## 次の操作と未達

1. D 担当の development Game authority profile/host sandbox 契約を統合する。現在の device/6 local-only wrapper を最終 image の代替にしない。manifest へ profile/authority hash を追加し、sandbox の停止・保存・復元を既存証明と統合する。
2. A の最終 image と `freeze-manifest.json` を受領し、同じ source commit から配布 archive を作成する。現在は配布 archive/fresh VM の実測なし。
3. 実際の取得物から新 VM 作成→Hub 商品→合成 Wallet/Game→保存→正常終了→再開→別復元先→所有 VM 削除を行い、手順/時間/失敗/再試験を記録する。
4. interrupted restore は開始前に `RESTORE_PENDING` を永続化し、元 writer の再開を fail-closed にする。途中からの自動 roll-forward はまだ実装していない。元/backup と途中の復元先を保持する。
5. 製品 LICENSE は未確定。既存 license/NOTICE を維持し、A が Buildroot legal-info/対応 source を収集中。package を作成しただけで公開配布条件が揃ったとしない。

対象試験コマンド:

```sh
python3 -m unittest discover -s systems/rock-star-os/tests -p test_os_desktop_preview.py
python3 -m unittest discover -s systems/rock-star-os/tests -p 'test_os_desktop_launcher*.py'
python3 -m py_compile systems/rock-star-os/os/desktop/preview.py systems/rock-star-os/os/desktop/package_preview.py
git diff --check
```

この checkpoint は installer 実装の中間証拠。PREVIEW-INSTALL、V01-ACCEPT、D0〜D6、Game/SDK、公開の完了宣言ではない。

## 新規テンプレートの実測

判断: **RQ12/16/17 / 明確な楽観主義・秘密を探す / 導入途中で依存・権限・表示資源の原因が分からない不便 / 同じ Lima template と既存 viewer 所有証拠 / fresh provisioning と限定 cleanup を実測 / 作成時間・既存資源変更・削除時間 / [機械報告](template-probe-20260910.json)。**

06:09:04〜06:09:48 UTC、専用の新規 Lima VM が 44 秒で Debian 13.6 / QEMU 10.0.11 の依存導入を完了。base download cache だけを再利用し、既存 VM・userdata は再利用していない。唯一の package mount は `ro`、書込は errno 30 で拒否、guest に host `/Users` はなく、guest root 所有 path への copy と最上位 0755 化の後に user が読めることを確認。Linux で専用 29 tests PASS。

同じ所有 VM の config/identity hash を検査して `limactl stop` と `delete` を終了コード 0 で実行。所要 3.210 秒、`--force` なし、VM directory は消失、host の sentinel は保持された。OS image はこの probe へ導入していないので、PREVIEW-INSTALL の代替にはしない。

コード点検では、restore 後に元 profile の viewer が port 8899 を保持し、新 profile を妨げることを発見。instance/build/完全な process command と lsof socket ownership を合わせて確認した **この導入の viewer だけ** を終了する入口を追加。PID が別アプリへ再利用された場合は終了しない。動的 launcher import の探索 path も配布物内へ固定した。現 Mac の port 8899 にある既存 PID 77657 は B 所有外のため操作せず、統括へ伝えた。

現 host の専用試験は診断・viewer PID reuse・古い image の relabel 拒否を追加し **30 tests PASS**。Linux の 29 件実行はその前の入力 hash に限定され、同じ結果への付替えはしない。Game profile と final image の導入実測は引き続き未実行。

## 既存 viewer と衝突しない新しい配布 port

判断: **RQ12/16/17 / 秘密を探す・0→1 / 旧 preview の表示を閉じないと新規導入を試せない不便 / v2 の VM・source・socket 所有 guard / v3 の明示 port 2 個だけを追加 / 他 viewer 停止 0・指定 port 一致 / [実 process/socket/CSP 証拠](viewer-ports-20260910.json)。**

統括から既存 8899 viewer を維持する指示を受け、署名 release manifest の HTTP 8900 / WebSocket 5910 と launcher/3 の `viewer_port` を追加した。固定 v1/v2 の契約・既存 listener は変更していない。使用中なら拒否し、空き port の自動探索も行わない。

実 Mac の新しい 8900 viewer process を起動し、HTTP 200、client の接続先整数と CSP が 5910 に一致すること、unique instance/build/process の health、所有証拠を照合した終了、port の再確保を確認した。既存 8899 listener は前後で同じまま。これは実 viewer の試験であり、QEMU の動作や final profile の受入ではない。

launcher 32 件（うち v3 の 9 件）、browser credentials 6 件、HTTP viewer 9 件、preview 30 件、Node の構文確認が PASS。device/7 の新しい Game binding は v3 のみ許可し、network/boot/profile hash/authority UUID/config hash の欠落・混同を拒否する。D が提供する guest/stage0/sandbox と結合した実測は別工程として継続する。
