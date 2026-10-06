# Native OSのRock統合検証

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


現在の統合後の結果は[OS稼働検証](os-operational-validation-20260909.md)。以下は元native取り込み時点の履歴であり、起動改善候補・backup検証器・全observerの後続修正は現在の記録を参照する。

日付: 2026-09-09。取り込み前のRock: `5cec83478fe97bf272869298160a572ef7fcefee`。統合branch: `codex/integrate-native-os-20260909`。

[機械可読の結果・入力hash](evidence/native-integration-20260909.json)に実行条件、開始/終了時刻、各suiteの結果、log hashを記録した。本文書はsource統合の検証であり、OS全体の完成判定ではない。

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| 公開ソース選別・hash照合 | PASS | 第9から511ファイル＋検証部品1ファイル。変更文書・参照差分を記録 |
| 既存Web `npm run verify` | PASS | 進捗・repository map・型・対象lint・34 unit tests・build・合成D1 API 143 assertions |
| native Python 6suite | PASS / 1003件 | tests 767、認証63、契約85、ATM40、購入者controller25、AI予算23 |
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
