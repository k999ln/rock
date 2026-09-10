# GitHub 実取得から新規 OS の初回成果まで

対象 RQ-12 / RQ-16 / RQ-17、PREVIEW-INSTALL の取得入口。配布先で取得した実物から初回成果までを直接つなぐことを原則とし、無変更の配布 bootstrap、既存の source / image / 署名検証、標準 Hub、停止下の authority observer を再利用した。追加は別の空 VM による限定 smoke だけで、製品コード・閾値・期限・画像を変更していない。指標は新規導入、標準 sample 一回、151-byte 保存出力、完全に空で不変の台帳、通常終了・所有 VM 削除である。

**この取得入口は PASS。** GitHub `k999ln/rock` の非公開 draft `386171909` から認証済み管理者が実 HTTPS 取得した全 9 ファイルを、その取得先から直接使用した。独立 pins を指定した取得版 `preview.py install` で新しい専用 Lima VM を作成した。source は `9abf78a80d27aa9f847c4051d20e4c552e407276`、archive SHA は `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2`、manifest SHA は `e06fb8d9df292103e63f6cd56df95b189202ae0b13b6e1c578cb6eef0ffc5971`。試験前の [plan.json](plan.json) に全 9 file hashes と親の実取得・署名検証 report hashes を固定した。

既定 16 GiB の新規導入準備 CLI は 30.64 秒だった。既存 host tools と digest 固定の公式 Debian base cache を利用し得るため、依存関係の初回 download 時間とはしない。OS・image・legal を含む全 706 members は試験後にも host / guest で exact SHA / size / mode が一致した。

実 browser の native framebuffer で、未導入の引用整理 1.0.0 の説明と送信先なしを読み、インストール、local 入力 / 結果権限への明示同意、同梱 sample の入力、一回の実行を行った。150-byte 入力、完了結果、コード内引用の保持、出典一覧、一件だけの実行履歴を表示した。停止 disk の独立 readback は 151-byte 出力・一件だけの succeeded job を確認し、readback 前後の disk hash も一致した。任意の日本語本文の IME / clipboard 入力を実証したものではない。

Wallet 登録、認証器登録、利用条件・月額同意、credit、Game 接続・購入は操作していない。起動前と通常終了後の 5 DB / 71 tables、および retained identity / C / router JSON を厳密に比較し、全 typed snapshot が完全に同一だった。SHA は `3805540ddf0727f946986fbf7eb8b85b6d53b6fdecf5a6a6328ae2662252cda0`。登録・同意・認証・財務表と両 Game grants / postings は空のままで、read-clock 例外は使っていない。

native 電源確認から通常終了し、取得版 bootstrap の stop で OS と authority の停止を確認した。一件の boot log に native UI health、A/B health、power down がある。停止した userdata、authority、boot records を private 0700/0600 の別保持先へ保存してから、取得版 bootstrap の通常 remove で所有 VM だけを削除した。force は使わず、削除後も保持原本の bytes / hashes は一致する。所有 tab `48015107` を閉じ、8900 / 5910 は listener なし、既存 8899 / PID 77657 は維持した。

原 report と全 evidence hashes は [summary.json](summary.json) にある。先行する [非 zero 全構成復旧](../final-9abf78a/README.md) と [最終 SDK fresh](../sdk-final-9abf78a/README.md) は元の実測として保持し、ここでは反復していない。これで実取得と新規 OS の初回成果を直接接続した。一般公開 URL での取得、公開開発鍵の production 適格性、製品ライセンスの許諾は主張せず、配布 manifest は candidate / NOT_CLEARED のままとする。
