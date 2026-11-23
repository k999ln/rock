# Noahの専用仮想画面

- 本人の目的　Agentが画面を使っている間も、自分のスマホやPCで仕事を続ける。
- 入口　[Noah](https://avoado.si/noah)から専用eSIMの利用権を確認し、専用画面に対応した仕事・実行先・条件を選ぶ。
- Noaがつなぐもの　専用回線の本人確認、Noahの仕事番号、運営が確認したパッケージのSHA-256、専用Linux実行器。
- AMCの工程　依頼受付、隔離環境の準備、ゲスト内のagent-desktopによる処理、同じ仕事への結果返却。運営が用意したパッケージは、利用者の依頼文をデータとして受け取る。利用者による接続先、コマンド、実行ファイルの指定は受け付けない。
- Jevの合格条件　同じ仕事を2回送ってもゲスト実行は1回。停止済みの仕事の再送で実行0回。本人の画面・入力への接続0件。版や実行器の不一致時は実行0回。ゲストで入力して読み戻した結果を、依頼した本人が受け取る。
- 成果と課金　専用回線の仕事に結果を保存する。この接続が受け付けるのは実行者負担の0円枠。専用Linux有料契約の利用量と料金はその契約の明細を使う。
- 復旧　完了済みの結果は同じ番号で再取得できる。実行器が中断し結果が不明な仕事は保留にし、自動で再実行しない。実機のeSIMと本番のLinuxを通す受入には、事業者回線と運営の隔離Linuxが必要。

## 運営Linuxへの接続

1. 運営専用LinuxにDockerのソケット `/run/noah-desktop/docker.sock` とdaemonラベル `noah.purpose=managed-desktop` を用意する。配備するZIPは、入口が `main.py`、ローカルモデル不要の審査済み `noah-desktop/1` とする。本経路が受け取れる成果は2,048字以内の本文1件。画面ファイルは本人Mac用の実行契約で扱う。
2. Linux側のサービスに `NOAH_DESKTOP_PACKAGE`（ZIPのパス）、`NOAH_DESKTOP_PACKAGE_SHA256`、`NOAH_DESKTOP_DB`（永続SQLiteのパス）、`DESKTOP_RUNNER_TOKEN`（十分な乱数から作った32文字以上の秘密）を設定する。`node --experimental-strip-types services/noah-managed-desktop/server.mjs` はループバックの8789番で待ち受ける。DBには依頼番号・入力のハッシュ・版・状態と返却用の本文を保持する。DBには実行サービス専用の保存先を用意する。
3. 運営の認証付きHTTPS経路からこのリスナーに接続する。private Worker `services/noah-managed-desktop/wrangler.jsonc` の `DESKTOP_RUNNER_ORIGIN` をそのHTTPS originに固定し、同じトークンとパッケージSHAを設定する。Workerは依頼番号と本文を転送する。ブラウザのCookieや回線証明はLinuxに渡さない。
4. 専用eSIMのWorkerに対し、`AGENT_DESKTOP` を上記Workerのservice bindingとして設定し、同一の `NOAH_DESKTOP_PACKAGE_SHA256` を設定する。回線照合・利用権・予算を確かめて利用者が開始したときだけ仕事を受ける。再送と照会は同一番号を使う。停止を先に受け取った番号は、後から作成が届いても起動しない。
