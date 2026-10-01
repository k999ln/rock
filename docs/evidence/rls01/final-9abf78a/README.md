# 最終候補 9abf78a の新規導入・全構成復旧

対象 RQ-12 / RQ-16 / RQ-17。保存結果と残高を失わず新規導入・再開できることを原則とし、既存の署名検証、Lima 所有確認、A/B/data backup、独立 Wallet/Game/C の current-copy、停止下の厳密比較を再利用した。製品コードの追加変更はない。指標は同一配布物、3 回の実起動・通常終了、1 回の購入、全構成バックアップ、実 SIGKILL からの同一要求回収、削除後の別保存先の全ハッシュである。

**この範囲は PASS。PREVIEW-INSTALL / GX01-UI 全体は別担当の OS gate 待ちであり、一般公開・製品ライセンスの承認ではない。** 原本のハッシュと範囲は [summary.json](summary.json)、試験前に固定した手順は [plan.json](plan.json) に記録した。

## 同じ配布物の確認

- source: `9abf78a80d27aa9f847c4051d20e4c552e407276`
- archive: `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2`、1,000,928,255 bytes。
- manifest: `e06fb8d9df292103e63f6cd56df95b189202ae0b13b6e1c578cb6eef0ffc5971`。
- 9 配布ファイルを別ディレクトリで二回生成し、全 bytes が一致した。署名は明示した公開 RFC8032 開発鍵であり、production の trust root にはしない。
- 934,132,130 bytes の legal bundle は全 298 regular members を独立して読み、完全 Git source 1,364 files、元 Buildroot archive、画像・profile・config と source の結び付きを確認した。製品ライセンスは UNSET / NOT_CLEARED のままである。
- exact source の元 GitHub CI は x86_64 Linux / Python 3.13.15 の 1,631 Python executions・14 checks で PASS。arm64 build host の元 full-native は TLS 1 秒期限の 10 ERROR で FAIL しており、両方の元 report と全 logs を legal bundle に保持している。

所有する `127.0.0.1` HTTP サーバーから、別の空ディレクトリへ 9 ファイルを実取得し、全ハッシュと取得した bootstrap による署名検証を通して導入した。取得と検証は 3.393 秒、導入準備 CLI は 41.87 秒。一般公開 URL / GitHub から OS を導入したとの主張ではない。既存の Lima / Python / OpenSSL を使用し、digest 固定の公式 Debian base は cache の可能性がある。

## 実 OS と中断復旧

新しい専用 Lima VM の空 authority を確認し、実ブラウザーの native framebuffer を操作した。標準の引用整理 1.0.0 をインストールし、local 権限へ明示同意、同梱 150-byte sample を一回実行した。151-byte 出力、コード内引用の保持、出典一覧、一件だけの履歴を再開後と復元先で再表示した。停止 disk の直接読戻しでも同じ内容と前後 disk hash 不変を確認した。

Wallet 登録、公開 PIN `0000` の認証器、Wallet 利用条件へ別々に同意し、合成 $100 を一回追加した。Game A 接続と一回の購入を別に承認し、$1.00 + 試験 fee $0.03 で 10 COIN_A を受け取った。3 回目の復元先 UI でも同じ交換詳細、合成残高 $98.97、保留 $0 を確認した。月額同意・請求・引出・Game B 購入は行っていない。

二回目の通常終了後に A/B/data と全 Wallet/Game/C を束ね、Mac の別ディレクトリへ 19 ファイル・1,074,564,436 bytes を保存した。台帳側 current-copy が DONE になった直後、最初の新 OS disk を 16 MiB 書き fsync したテストプロセスだけを実 SIGKILL した。配布ファイルや元 QEMU は変更・強制終了していない。

ホストの起動、authority 起動、元 OS 直接起動はすべて PENDING を拒否した。取得済みの無変更 bootstrap で同じ intent / 復元名を再試行すると、元の authority receipt をそのまま回収し、3 disk の完全一致と aggregate DONE を確認した。元端末は永久に起動拒否され、両 Game issuer の epoch は 2 へ一回だけ進んだ。

配布内の凍結済み observer による guest business 比較は PASS。既存 shutdown receipt 2 件が完全に残り、復元先で一件だけ増えた。外部台帳は再開時 5 DB / 71 tables、復元後 7 DB / 122 tables を停止 fence 下で比較し、事前に宣言した `index.identity.maximum_time` の型・範囲内の単調増加以外、全 typed rows / schema / sequences / identity が一致した。D6 標準の完全不変条件は緩めていない。

独立した read-only 財務照合でも Wallet 9897 cents、fee 3、hold 0、Game A grant 一回・10 単位、Game B grant 0、両 epoch receipt 一件を確認した。全 3 boot logs に native UI health / A/B health / native power down がある。

## 容量、保存と制限

既定 16 GiB を変更せず、取得 archive は VM に複製せず、同梱 legal tar は展開しなかった。復元前の guest 空きは 11,969,650,688 bytes、復元後も 10,895,138,816 bytes。容量 gate をすべて通過した。

停止した authority・client の原本、復元先 userdata、boot records は私有 0700/0600 の保持先へ保存した。host と guest の配布全 706 members は試験後も exact mode / size / SHA が一致した。その後、所有 VM だけを force なしで通常削除し、別保存先の 19 ファイルの全ハッシュを再確認した。所有した 3 browser tabs を閉じ、8900 / 5910 は listener なし、既存 8899 / PID 77657 は維持した。保存した backup の存在は、VM 削除後の historical / cross-host import 対応を意味しない。

観測された不便も保持する。Wallet の背景同期中は Game ヘッダーのクリックを受け付けにくく、Hub を経由して開いた。最初の Game 接続本人承認は一度「応答を確認できません」となったが、既存の「更新」で同じ接続を回収した。二回目の起動では完了履歴一覧を確認できた一方、同期中の詳細クリックは遷移を確認できず、三回目の復元先では元の詳細を表示できた。

原本回収用補助スクリプトの初回は、正常な source audit 後に `filehandle.chmod` の誤記で失敗し、空の local tar だけを残した。元 script / log を保持し、`os.fchmod` への一行修正後の別 v2 実行で audit と回収を完了した。legal collector の初回 FAIL、旧 8bd の guest observer FAIL、旧 SDK 診断 FAIL はいずれも元 SHA の結果のまま保持している。

これは内部の合成資金・公開開発 fixture による manual UI 受入であり、人の操作時間、実資金、物理 USB、IME / clipboard、一般公開適格性の実証には換算しない。
