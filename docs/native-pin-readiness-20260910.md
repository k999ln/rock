# Native認証画面のsource pin再レビュー

RQ08/16/17 / 明確な楽観主義 / UI変更後も古い認証画面を認識できると誤解しない / 既存C replay・Wallet/ATM fixture・固定RGB guard / 画素を維持しsource pinだけ更新 / 全masked count・有効ボタン・誤座標拒否 / actual C再レビュー後に元検証を無変更で実行。

GitHub commit `18317380731086c39b02357dfe66126bd5932846` は通常のLinux source gate（1,480 executions）に合格した後、root UI gateで旧`b8287bc`のsource pinとの相違を拒否した。画面変更を自動で信頼しない既存guardの動作であり、CI全体は失敗として保存する。

`scripts/review-native-pin-source.py` は公開の使い捨てWallet/認証fixtureと最新のC rendererで、**既存の画素定義をそのまま**再生する独立レビュー用。canonical guardを書き換えず、全28予定frame、PIN 0〜4桁、署名ボタン状態、7つの誤座標とPageDown欠落の拒否を確認した。新しい登録/ATM確認画面を目視し、額・手数料・説明・無効ボタンの配置に問題がないことを確認。元と同じRGB判定だったのでROI・許容値・期限を変更せず、source hashesと直接include依存の記録だけを更新した。

更新後はレビューprobeを使わず、元の `test_wallet_replay.py` と `test_pin_readiness.py` をLinux rootの独立fixtureで再実行した。Wallet/ATM各14画面、全誤操作拒否、11件のmemory/期限負例がPASS。今後は通常の非root source gateにもsource pinの一致とinclude網羅を確認する試験を追加し、別root stepまで古いpinを見逃さない。

[レビューと検証の証拠](evidence/native-pin-readiness-20260910/verification.json)、[元の再実行log](evidence/native-pin-readiness-20260910/unmodified-replay.log)、[登録画面](evidence/native-pin-readiness-20260910/auth-01-explicit-enrollment.png)、[ATM確認画面](evidence/native-pin-readiness-20260910/06-owner-issue-confirmation.png)。これはhost機構の確認であり、最終QEMU受入や本番認証ではない。
