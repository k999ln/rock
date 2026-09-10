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

### 06:42 UTC: real intermediate package found a reproducibility defect

RQ12/RQ16/RQ17 · explicit source/host/image binding · temporary import caches made identical input packaging differ · reused git archive and freeze/2 inventory · select only frozen native files and disable bytecode writes · metric two real package builds plus regression · final acceptance remains pending.

The real `3fa88610fe77317b920efe1dea8f58f8d2113092` image was packaged twice with identical version and source. The first archive was 66,248,330 bytes / SHA-256 `bd7ba5cd0fc5ec48dc016835a4eeac4ab5fa0cdd8131618b482c27b7ba981714`; the repeat was 66,248,331 bytes / `6c7984d789304fdd19f1c4c135f857a400a94e34519427949dde3ebf3a485e71`. Comparison traced all differences to 11 `__pycache__/*.cpython-314.pyc` entries created by the packager's stage0 validation imports. Those files were absent from the committed/frozen inventory and contained temporary-directory-dependent bytecode. This is a failed package reproducibility attempt, not an accepted release.

The first archive did install into a completely new private Lima VM and pass the full image/source preflight; the actual browser showed the Hub and initial unregistered simulator Wallet with $0.00. Its lifecycle observations will remain intermediate defect-finding evidence. Neither successful installation nor the later fix relabels this archive as a final candidate.

The fix pins archive selection to the previously verified freeze inventory, rechecks each selected source hash immediately before tar assembly, and disables bytecode generation. A regression creates an unexpected cache and proves it cannot enter the selected package; changing a pinned source still fails. Preview unit suite: 31 tests PASS. The corrected frozen final candidate will require its own repeated real packaging and fresh-install acceptance.

### 06:55 UTC: complete intermediate fresh-install lifecycle

RQ12/RQ16/RQ17 · preserve source and independent backup while testing recovery · actual fresh host path had not yet been accepted · reused frozen 3fa build, existing launcher/3, backup/2 and closed SQLite observer · no runtime guard changes · three clean UI shutdowns, 1 GiB off-VM backup, five business roles exactly retained · `intermediate-local-lifecycle-20260910.json` and `intermediate-local-readback-20260910.json`.

The distributed bootstrap installed the first intermediate archive into a newly created private Lima home/VM in 20.170 seconds from recorded installation creation to the installed receipt. The Debian base download cache was reused; no old VM, userdata, host home or existing Linux source was reused. Only the verified package was mounted read-only, then copied to the VM. Full embedded-source, image and signed factory preflight passed.

Actual Chrome/noVNC framebuffer operations installed and permitted citation organization, loaded the bundled valid sample, completed the job and reopened it from history. The OS was powered down via its native confirmation UI, then restarted; the same saved output remained. A second UI shutdown preceded a complete clean A/B/data snapshot and 1 GiB off-VM export. The wrapper restored into the previously absent name `recovered`, selected it and retired the preserved source `preview`. The restored OS booted and displayed the same saved citation result and unregistered simulator Wallet with all visible balances $0.00. A third native UI shutdown completed normally. No QEMU host power/reset/kill command was used.

The installed source's existing closed SQLite observer checked every observed table, schema and sequence for Hub, Wallet, membership, remote and authenticator. All five business roles matched the backup exactly, including the single completed Hub job. The two original power receipts remained and exactly one valid dispatched native shutdown receipt was added. All three retired-source disk hashes still matched the backup. This manual CUA run did not record QMP events and is not called D5/D6 or final release acceptance.

`remove --delete-data` stopped and deleted only this verified private VM without force. Its VM directory is absent; ports 8900 and 5910 can be bound again. The unrelated pre-existing 8899 viewer remains PID 77657. The off-VM backup still has all three exact hashes and byte counts. Package, logs and receipts remain local for diagnosis. The three test-only browser tabs were closed.

This lifecycle pass does not clear the package reproducibility failure above, production trust, licensing, external Game authority recovery, or final same-image release acceptance.

### Stopped VM status remains observational

RQ12/RQ16 · explicit, understandable lifecycle · `status` previously restarted an externally stopped owned VM to query QEMU · reused the pinned Lima identity/status record · `status`/`stop` now return the observed stopped VM state without launching it · regression asserts no Lima mutation or remote query · preview suite 32 PASS. The response does not infer that the earlier OS shutdown was clean from VM state alone; backup/restore retain their existing clean-filesystem checks.

- RQ12/16/17・原則1/5/6/8: Game profile 配布の外部 authority 依存と復元境界を明示。既存 sandbox CLI と signed image provenance を再利用し manifest v2 に profile/source/base freeze/config SHA を固定、fresh state のみ初期化。独立 Lima で 2 回 start/stop、3 TLS1.3 peer の CA/hostname と loopback listener を検証、全 SQL 表/C identity snapshot 不変、所有 VM の正常停止・削除 PASS。証拠 game-sandbox-probe-20260910.json。OS image 未起動、final 候補の受入には未算入。Game 完全 backup/current-copy 統合までは disk-only restore を明示拒否。
- 新規抽出先の umask による root 所有 payload の unreadable/group-write を解消: 既知 archive directory を 0755 で生成し root 自体は 0700 を保持。umask 000/002/077 回帰を追加。任意日本語 IME/clipboard 未接続、ASCII US 配列限定を guide に明示。

- RQ12/16/17・原則1/5/6/8: OS の3 diskだけでは復元後のGame/C状態が欠落する不便に、既存backupの検証器とDのcurrent-copy CLIを組み合わせた完全backup入口を追加。新game_backup.pyは現時点事前照合→同intent durable gate→authority現時点引継ぎ→ownedfresh OSコピー→両receipt/post-state再照合→DONEを実行し、累積retired端末を保持。中断copyと既存完了receiptは同intentだけ回収、通常の既知stale条件はhost RESTORE_PENDING前に拒否。外部host exportは全inventoryのbytes/hashを再照合する保全コピー（別VMへのimportは未対応）。host試験はgame_backup21、preview50、既存backup47件PASS。fixtureのfilesystem検証をmockしたguard試験であり、実C/OS/署名imageの受入は次工程。依存D CLI commit df124c8365b7089fbdad4de64fd18964d1190c0c。
