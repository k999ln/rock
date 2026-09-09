# Native OSのRock統合検証

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
| Android core/SDK/APK/端末/parity | 今回NOT RUN | Java/Android環境未導入。実装の変更なし、過去CI成功と区別 |
| 新規OSイメージbuild/boot | 今回NOT RUN | 第9のQEMU証拠は履歴として引用 |
| BlackBerry・実USB・実資金・本番公開 | NOT RUN | Git統合の成功に含めない |

最終native試験はLinux aarch64 / Python3.13.5で05:26:39–05:28:25 UTCに実行し、計1031件のPython試験とC検証が成功。通常gateのskip・未処理ResourceWarningなし。新規CIは同じscriptを使うが、workflowの存在だけをGitHub上での成功とはしない。

最初のGitHub x86_64実行では、実隔離executorが必要とするbubblewrapをCIの依存一覧へ入れておらず、767件中の実Linux隔離1件が `failed` となった。bubblewrap追加後の2回目も同じ1件が失敗し、Ubuntu 24.04のAppArmorが未許可のuser namespaceを制限する条件が残っていると判明した。他のsuite・C/UI検証と既存Web/Android CIは成功。テストをskipやmockへ変更せず、Ubuntu提供の限定的な `bwrap-userns-restrict` profileをworkflowで読み込み、子processによる追加namespace作成を許可しない構成で再検証する。system全体のuser namespace制限は解除しない。再実行が成功するまでGitHub native CIをPASSとは記録しない。

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
