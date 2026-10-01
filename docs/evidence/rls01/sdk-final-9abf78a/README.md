# 最終候補 9abf78a の SDK 新規導入

対象 DX01-SDK / GX01 / RQ-12 / RQ-16。作者と所有者の役割を分け、同じ要求で障害から回復できることを原則とする。配布済み SDK、owner / author examples、固定 sample、独立 authority、既存 Lima 所有確認を再利用し、製品コードを変更せず、新しい VM と空の client / 台帳から測った。最終 source の期限切れ拒否修正 `0ace411` も含む。

**内部の合成環境における新規 SDK 一周は PASS。** 元 report、金融状態の独立照合、取得経路と全証拠ハッシュは [summary.json](summary.json) にある。OS の新規導入・3 boot・全構成復旧は [別の同一候補試験](../final-9abf78a/README.md) であり、SDK VM をフル OS の新規導入と数えない。

## 実取得した同じ source

GitHub `k999ln/rock` の非公開 draft release `386171909` から、認証済み管理者が HTTPS で別の空ディレクトリへ取得した全 9 ファイルを使った。一般公開 URL での取得ではない。

archive SHA は `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2`、manifest SHA は `e06fb8d9df292103e63f6cd56df95b189202ae0b13b6e1c578cb6eef0ffc5971`、source は `9abf78a80d27aa9f847c4051d20e4c552e407276`。独立して固定した公開開発鍵・manifest の fingerprints で署名を検証し、取得した archive から native members を直接取り出した。全 692 native files の SHA / size / mode が最終署名 manifest と一致し、試験後にも再照合した。

最初の親担当の verify は公開テスト鍵の明示 acknowledge flags が不足し、正しく拒否された。その原 report と、明示 flags・独立 pins を指定して PASS した別 report を両方保持している。SDK 開始前に取得元だけを変更した [補足 plan](plan.json) を固定し、元 OS 試験 plan は変更していない。

## 初回交換と障害からの回復

新しい専用 Lima VM の空金融表を確認し、設定は「固定公開 config」と「private client state」の 2 入力。owner example は 110 code lines、author example は 38 code lines。登録、公開 PIN の認証、Wallet 条件、公開合成 credit、Game の接続同意、一回の購入承認を明示的に行った。

Game A の初回交換後、実 TLS サーバーを停止し、元 Game B 要求を保持したまま unavailable を診断した。再起動後に同じ operation key で retry / approve し、両 Game の元履歴を確認して停止した。計測は機械処理の elapsed であり、人の作業・原因特定時間ではない。

| 機械処理 | 秒 |
| --- | ---: |
| 初回交換 | 2.202283459 |
| 通信停止時の診断 | 0.130912789 |
| 元要求での復旧 | 1.173279643 |
| 一周全体 | 4.625373475 |

停止 fence 下で別 observer が SQLite を read-only / immutable で開き、Wallet 残高 9794 cents、fee 6、hold 0、購入 200、月額請求 0、引出 0 を確認した。Game A / B は各 10 単位、各 grant 一回、各 issuer epoch 1 である。全 5 DB / 71 tables の snapshot SHA `7c50142f33066c50969c917baac1b2f378ec56edc737096db5d99cf6f0edef5c` は、元 harness の最後の snapshot と完全に一致した。

これは送信時の実通信停止からの復旧であり、交換 commit 後の応答喪失と同一視しない。後者は同じ最終 source の独立 Game 契約 / SIGKILL 受入証拠で扱う。

## 原本と削除

全 events、private client state、停止済み authority 原本は private 0700/0600 の保持先へ保存し、75,089-byte archive の SHA を記録した。SDK 専用 probe に通常 OS の `remove` を指定した初回は、未完了の OS 導入として正しく拒否された。probe のラベルを `INSTALLED` に変更せず、配布された `verify_vm`、専用 `LIMA_HOME`、authority 停止確認を使う専用 cleanup で通常 stop / delete を行い、`SDK_PROBE_REMOVED` と記録した。force は使っていない。

所有 VM は存在せず、原本は残る。8900 / 5910 は listener なし、既存 8899 / PID 77657 は保持した。旧 `9cfe` の診断 FAIL と旧 `aee` の成功はそれぞれの source の原結果を残し、この最終 source の実測へ読み替えていない。公開開発 fixture・合成資金だけの内部受入であり、外部作者の人手評価、実資金、製品ライセンスや一般公開の承認を意味しない。
