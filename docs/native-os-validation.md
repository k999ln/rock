# Native OSのRock統合検証

## PC receiverの終端競合と再送（AI04、2026-10-11）

既存`src/blackberryrock/storage.py`の仕事更新で、2つのSQLite接続が同じrunning状態を読んだ後、完了と取消が両方成功し確定結果を上書きする競合を再現した。更新は読み取ったstatus・result・updated_atに対するCASで行う。同じ終端状態と同じ結果の再送は保存済み行を返し、時刻も書き換えない。異なる成果・状態の後着は409相当の競合として保持し、勝者の結果を消さない。DB schemaとHTTP interfaceは維持する。

native rootで`PYTHONPATH=src python3 -m unittest discover -s tests -p test_storage.py`は6件、`PYTHONPATH=src python3 -m unittest discover -s tests -p test_server.py`は3件合格。新規3件は修正前に失敗し、実SQLiteの2接続・barrierによる同時終端、異なる成果物、完全一致の再送を確認する。独立担当もStore 6件を再実行した。PC receiverのhost source試験であり、Linux全体CI・QEMU image・実機・Provider受入は別の証拠を要する。

## QEMU受入monitorの総期限（2026-10-11）

`os/verify-platform.py`の画面取得用QMP接続は、従来のsocket待機5秒だけでは通知が流れ続ける間に戻らず、外側のguest起動240秒期限も確認できなかった。実AF_UNIXの合成monitorで、応答なし・通知継続時に5.41秒後も呼出しが未完了になることを再現した。接続、greeting、capability交渉、command応答を一つの単調時計5秒期限へ収め、改行のない細切れ応答にも同じ期限と1 MiBのframe上限を適用する。

[QEMU公式QMP仕様](https://www.qemu.org/docs/master/interop/qmp-spec.html)に従い、各要求に付けたIDへ応答を照合し、通知と別IDは成功にしない。交渉失敗では画面取得commandを送らず、EOF、結果欠落、期限切れも成功へ変換しない。QEMU本体、guest、通常起動や保存diskを変更する修正ではない。

native rootの`PYTHONPATH=src:os:tests python3 -B -W error::ResourceWarning -m unittest test_os_platform_qmp test_os_platform_isolation_proof test_os_desktop_preview`で69件合格。新規7件は実socketのhost fixtureであり、OS image bootを実行していない。既存のscope／起動許可、実署名・archive、所有VM・保存復旧guardの回帰も含めた。

同日の読取調査ではmacOS 15.7.4 arm64／Lima 2.2.0のhost条件が一致し、保管rc2 archive（`b7d819c`、SHA-256 `5ce072f65fc4e24212ff6acc6887cbb03f3e7f664b50d574756738892e4ed95e`）の716 fileとimage tripleを現行verifierで照合した。公開試験鍵の整合確認であり、production真正性や新sourceの受入ではない。再利用可能なLinux VMは停止中で旧sourceへの書込mountを持つため起動せず、Macに汎用QEMUはない。新しいsourceの凍結imageと、専用Linux/QEMU `virt-10.0`・e2fsprogs・十分なRAM／保存領域を用意してから、同一imageの起動・保存・再起動・復旧を別途受け入れる。Android全OS用x86_64条件をこのARM64 QEMU系統へ持ち込まない。

## 遠隔仕事の取消と遅延要求（AI04、2026-10-11）

`test_os_runner_control.py`で元submitを配送前に保持し、通信失敗→取消要求→remote不在→OS controller再起動→元submit遅延受理を実RunnerStore／SQLiteで再現する。修正前は不在だけでlocalをcancelledにして入力を消し、後の結果照合を止めるため2件とも失敗した。修正後は同IDのunknownと取消意図を保持し、再送せず照合を続ける。遅延要求がqueuedならremote取消で実行0回、既に成功なら実結果を回収して実行1回、照合後にinput/packageを消す。claim前の取消は従来どおり送信を防ぐ。

検証コマンドはnative rootで`PYTHONPATH=src:os:tests python3 -B -W error::ResourceWarning -m unittest test_os_runner_control test_service_access_registry_runner test_platform_service_lifecycle`。68件合格。transportの時系列は制御fixture、executorは明示したfake callbackであり、guest／実機／本番クラウドの実行合格には加算しない。not-foundを将来の元submit拒否へ固定する契約がないため、不在が続く仕事は未確認のまま保持する。

## Gameの不確定応答からの復旧試験（SYS15、2026-10-03）

`test_game_exchange_deadlines.py`はprivate fixtureの合成Game／Walletとloopback TLSを使うsource回帰である。`ExchangeWorker.once()`のTrueはclaimを処理した意味で、remote適用やNOT_FOUNDの証拠ではない。次へ進む前に永続claimのoperation／resultを確認し、保留金額・付与数・journal件数を別に照合する。

停滞中も別GameとATMが進む既存試験は、解除後の最初の要求を意図的に未適用で終える。これでNOT_FOUND→元のapplyという前提を制御し、3秒の期限・全時間上限・既存残高照合を保持する。別の回帰では一度のstatus失敗からUNKNOWN→NOT_FOUND→TERMINAL、さらに結果不明後に元要求が遅れて適用される場合のstatus→TERMINALを確認する。未確認の結果で保留を解除せず、元要求だけを用い、二重付与しない。

遅延適用は本物のauthority処理へ元要求を後から届ける制御fixtureで、過去CIの通信時系列を再現したとは扱わない。追加のretry loopやdeadline緩和はせず、予期しない状態は失敗として残す。ROCKの検証器改善でありproductionの権限・金額・timeout・Provider契約は変更しない。guest boot・実機・実資金・24時間運用は対象外である。

## Platform検証guestの起動条件（SYS15、2026-10-03）

`systems/rock-star-os/os/verify-platform.py`を、検証用artifactを用意したLinux環境から実行する既存入口を維持する。このhost入口は新規userdata、networkなし、読み取り専用rootfsで検証guestを起動し、kernel command lineへ `rock.platform.verify=1` を指定する。`--scope game-isolation`だけが追加scopeを指定する。既存imageの受入を新sourceへ流用しない。

通常imageにも配置する `os/platform/guest-test.py` は、boot wrapperだけでなく本体でもroot・ARM64と1個の正確なenable tokenを必須にする。enable未指定、無効値、空値、重複・競合を拒否し、default local-full／単独のgame-isolation以外のscopeを拒否する。拒否はinventory子process、IPC、chmod、Tool操作、simulator操作、PASS出力より前に行う。rootで直接呼んでも通常bootでは検証処理へ進まない。これは誤った直接起動を防ぐ条件で、root権限保有者に対する隔離境界ではない。

ROCKが検証器とそのhost回帰を管理する。入力はkernelの起動tokenと実行identityで、追加credentialや永続設定は保存しない。起動条件が満たされない場合は失敗を返し、flagを自動補完して継続しない。復旧は適合する検証artifactから既存host入口で専用guestを起動する。既存guestデータをこの拒否で変更しない。

peer UIDをDACから独立検査する一時的な0755／0666と、通常復元の0660／0750、本文前のUID認証は保持する。復元syscall自体の失敗や強制終了への保証を追加したとは扱わない。host回帰は不正起動の無副作用と正規2scopeの継続を確認し、CodeQL #13〜#16の一時権限警告や、実guest／実機／24時間受入とは分離して記録する。

## CI再実行の結果選択（SYS15、2026-10-03）

nativeのsource検査は4つのmain partitionとsupportに分割する。artifact名にGitHubのrun attemptを含め、`scripts/select-native-artifacts.py`が同じrun／headのAPI metadataから各partitionの最大attemptを選ぶ。IDや時刻、PASSの有無では選択しない。再実行されなかった区分は同じrunの以前のattemptを再利用する。

収集は100件ずつ最大10ページ／1,000件に制限し、total_count・ID重複・run／head・attempt・全5区分を確認する。選択された最新artifactがexpiredなら古い結果へ戻さず拒否する。downloadは明示したartifact IDで行い、別々のdirectoryへ保存する。API取得・一覧・選択・downloadが不完全なら成功にしない。

`needs.partitions.result == success`と、既存のsource inventory・PASS・元ログhash・全test discoveryの集計検証は維持する。これにより最新jobがupload前に失敗した場合や、一部IDがdownloadできなかった場合も拒否する。元の失敗結果はattempt別のartifactとしてretention期間内に保持する。集計artifactもattempt別にする。選択器自体を入力hashへ含める。freeze検証器も選択器を必須入力にし、欠落・archiveとの不一致・改変を拒否する。freezeの回帰はCI集計jobで直接実行する。

前回 `258fa5d`のrun37102143646では、main-1の再実行PASS artifact11265968595が存在するのに、集計が旧FAIL11266067774を取得した。集計内reportのhash一致で原因を確認した。これは試験結果の選択修正であり、Wallet試験の期限延長、試験削除、OS boot／実機受入を含まない。今回の合格証拠は[SPIDER改善cycle記録](evidence/spider-improvement-cycle.json)と同じSHAのPR報告で追跡する。


現在の統合後の結果はOS稼働検証（削除済み）。以下は元native取り込み時点の履歴であり、起動改善候補・backup検証器・全observerの後続修正は現在の記録を参照する。

日付: 2026-09-09。取り込み前のRock: `5cec83478fe97bf272869298160a572ef7fcefee`。統合branch: `codex/integrate-native-os-20260909`。

[機械可読の結果・入力hash](evidence/native-integration-20260909.json)に実行条件、開始/終了時刻、各suiteの結果、log hashを記録した。本文書はsource統合の検証であり、OS全体の完成判定ではない。

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| 公開ソース選別・hash照合 | PASS | 第9から511ファイル＋検証部品1ファイル。変更文書・参照差分を記録 |
| 既存Web `npm run verify` | PASS | 進捗・repository map・型・対象lint・34 unit tests・build・合成D1 API 143 assertions |
| native Python 6suite | PASS / 1003件 | tests 767、認証63、契約85、ATM40、購入者controller25、si予算23 |
| C UI IPC / 通常observer | PASS / 12＋16件 | 実Unix IPC、元Makefileと同じtest_evidence.py |
| C compile / UI操作 | PASS | core/platform/uiのcompile、native UI操作・入力・描画・framebuffer変換のhost試験 |
| 入力の前後照合 | PASS / 520ファイル | 現在のnative source・新規WIP資料・manifest・検証script・CI。増減も比較 |
| 既存Android `npm run os:check` | PASS | AIDL/manifest/Soong設定の静的整合のみ |
| GitHub x86_64 native CI | PASS | 実隔離事前診断、Python 1,031件、C core/platform/UI、IPC/observer |
| GitHub Web / Android CI | PASS | Web全verify、Android core/SDK/APK/emulator/parity |
| Androidのローカル統合時実行 | NOT RUN | Java/Android環境未導入。GitHub CIの成功と区別 |
| 新規OSイメージbuild/boot | 今回NOT RUN | 第9のQEMU証拠は履歴として引用 |
| BlackBerry・実USB・実資金・本番公開 | NOT RUN | Git統合の成功に含めない |

最終native試験はLinux aarch64 / Python3.13.5で05:26:39–05:28:25 UTCに実行し、計1031件のPython試験とC検証が成功。通常gateのskip・未処理ResourceWarningなし。新規CIは同じscriptを使うが、workflowの存在だけをGitHub上での成功とはしない。

最初のGitHub x86_64実行では、実隔離executorが必要とするbubblewrapをCIの依存一覧へ入れておらず、767件中の実Linux隔離1件が `failed` となった。bubblewrap追加後もUbuntu 24.04のAppArmor user namespace制限との組み合わせで同じ1件だけが失敗した。Rockのlauncherはbubblewrap起動前に `no_new_privs` を設定するため、後から追加権限を得るprofile遷移へ依存できない。Ubuntu 22.04でも試したが、同梱bubblewrap 0.6.1に必要な `--disable-userns` がなく、直接診断で明示的に失敗した。

テストのskip/mock化やlauncherの安全策解除は行わない。CIは新しいbubblewrapを持つUbuntu 24.04とし、外側にあるAppArmorのunprivileged user namespace制限だけを秘密値のない使い捨てrunner内で一時解除する。Rock内部の `no_new_privs`、全namespace分離、capability削除、`--disable-userns`、seccompは維持する。事前診断では製品と同じlauncher・workerを実行し、隔離が成立しなければ1,031件の回帰前に失敗させる。

直接診断により、x86_64の動的loader `/lib64` がsandbox内に見えず `/usr/bin/python3` を起動できない移植漏れも確認した。launcherはx86_64時だけ `/lib64` をread-only bindする。ARM64のmount列は変えず、x86_64でも同じworker、network/mount namespace差分、socket syscall拒否を検証する。修正commit `f11f9aa78a228f5ecfd565f4499cf6c15cbfda36` のGitHub run `34318178890` で、事前診断とnative全検証が成功した。同じcommitのWeb run `34318178883`、Android build/emulator run `34318178886` も成功した。

既存WebにはViteの将来のconfigLoader変更とNode module APIの既知の警告が残る。最初のsandbox内API試行はloopback待受の権限制限で失敗したため、許可されたローカル試験環境で再実行し143 assertionsに成功。その後、統合後のverify全体も終了コード0で確認した。

## 通常gate外で見つかった残課題

初回の追加探索で `os/ui/test_*evidence.py` 全体を実行したところ、39件の報告に1エラー・11skipが含まれた。元のMakefileはこの全探索を通常gateにしていない。

- `test_atm_evidence.py` の旧fixtureは購入登録直後に売上操作し、現在のWallet認証器登録・Wallet規約同意を満たさないため失敗。初期化失敗後の一時領域cleanup警告も発生した。製品側の認証を弱めて通していない。
- powerの6件・Walletの5件はroot所有の使い捨てfixtureを要求し、通常ユーザーではskip。Walletの旧fixtureについても現行認証契約への移行確認が必要。rootでの今回の成功は主張しない。
- 修正時は現在のenroll/terms/quote/承認に従う合成fixtureを作り、初期化途中でもcleanupする。通常gateを元の `test_evidence.py` 16件へ合わせたことを、全observer成功とは扱わない。

元の広域probeの結果とlog hashは上記JSONへ保存した。通常の1003件の試験を削って数字を整えたものではない。

## 未適用の起動改善

`experiments/startup-health/changes.patch` は21ファイルのWIP。適用前検査だけ成功し、通常sourceには適用していない。C healthテストは未compile/未実行、Pythonのstartup-healthテストは未作成、新OS起動も未実行。今回1031件の成功はこのWIPの動作検証ではない。

既存の9点の封印済み成果物と、稼働中の仮想OSプレビューのデータ・設定は今回のGit統合で変更していない。

## SPIDER cycle 50: entitlement observerの出力境界

既存serviceの応答から3つの報告fieldを型と許可値で検査し、想定外のnested値とread例外を診断へ出さない。[全体設計](rockstaros-complete-design.md#spider-simulation-observerの診断出力)と[証拠](evidence/spider-observer-output-schema.json)に範囲を記録する。hostの新規privacy試験と既存SQLite DeviceWallet試験を用い、guest・実機は実行しない。

統合受入補足: observerの年月は検証後の年/月整数からYYYY-MMへ再構成し、worker_aliveは固定booleanへ変換して出力する。応答object/文字列を直接診断へ転送しない。既存13 privacy＋22 Wallet host試験と同一候補CodeQLを再確認する。実guest受入とは別。
