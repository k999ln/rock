# RockBLOCK 9704 optional bridge の実装用メモ

確認日 2026-09-22。公式公開ソースの読解結果。実機も SDK のこの環境での実行も未検証。

## 呼出境界

参照：メーカー [Python ラッパー](https://github.com/rock7/RockBLOCK-9704/blob/master/rockblock9704/rockblock9704.py) と [CPython バインディング](https://github.com/rock7/RockBLOCK-9704/blob/master/rockblock9704/rockblock.c)。version 1.0.1のLinux x86_64配布wheelを読み、必要な9メソッドとPyPI記載ハッシュの一致を確認済み。インストール・実行・無線試験は未実施。公開 PyPI の最新表示は `rockblock9704==1.0.1`、Python 3.10 以上。[PyPI](https://pypi.org/project/rockblock9704/)

| Python の呼出 | 戻り値／意味 |
|---|---|
| `rb.begin(port: str)` | 0/1、シリアル・モデム初期化成功。衛星受信の証明ではない |
| `rb.end()` | bool 相当、接続を終了 |
| `rb.receive_message(topic=None)` | `bytes` または `None`、timeout 引数なし。同期系 |
| `rb.send_message(message: bytes, topic=None, timeout=30)` | 0/1。timeout は秒。同期系 |
| `rb.poll()` | `None`、非同期の通信処理を進める |
| `rb.receive_message_async()` | `bytes` または `None`、受信キュー先頭を見る |
| `rb.acknowledge_receive_head_async()` | 0/1、SDK キュー先頭を除去。サーバー向けのアプリ ACK と異なる |
| `rb.receive_lock_async()` | `None`、受信キュー満杯時に古いデータを上書きしない |
| `rb.send_lock_async()` | `None`、送信キュー満杯時に古いデータを上書きしない |
| `rb.send_message_async(message: bytes, topic: int)` | 0/1、SDK キューに入ったか。送信完了ではない |
| `rb.set_mo_message_started_callback(fn)` | `fn(id: int)`、モデムが送信メッセージを受け取った |
| `rb.set_mo_message_complete_callback(fn)` | `fn(id: int, status: int)`、status 1 成功／-1 失敗 |
| `rb.set_mt_message_complete_callback(fn)` | `fn(id: int, status: int)`、下りの輸送完了 |

公開ラッパーの注意：`send_message_async()` の `topic=None` 分岐は何も呼び出さない。必ず契約で provision された数値 Topic を渡す。RAW は公開コードで 244。`receive_message_async(topic=...)` には処理分岐がないので **引数なし**で呼ぶ。同期 `receive_message` の Topic フィルターと混同しない。

## 推奨する所有モデル

ブリッジ専用プロセスが SDK を一つだけ所有する。SDK には静的キューとグローバル callback があるため、複数の RockBlock9704 インスタンスが独立する前提にしない。

初期化が済んだら受信／送信キューを lock し、SDK メソッドを呼ぶのは一つの所有ループに限定する。`poll()` の呼出間隔は目標 10 ms、最大 50 ms を監視する。HTTP、DB fsync、長いログ処理はこのループでブロックしない。

受信は SDK の `bytes` を別の処理キューに渡す。受信キューの同じ先頭を繰り返し取り出さないよう pending を一つ記録する。宛先・認証・形式の検証を通し、アプリの永続保存と送るべき ACK の保存が完了したら所有ループへ通知し、そこで `acknowledge_receive_head_async()` を呼ぶ。受信キューを解放した事実はアプリ ACK 配信成功ではない。

アプリ ACK は永続送信箱から `send_message_async(ack_bytes, topic=provisioned_topic)` で送る。1 件ずつ投入し、キュー投入成功→モデム受理→輸送完了→サーバーのアプリ ACK 受理を別々に記録する。`send_message_async()` の成功直後に未 ACK を削除しない。非同期送信に timeout 引数はなく、アプリの監視期限を設ける。期限超過で勝手に成功／確定失敗とはしない。

未受信・再配信・ACK 不達はメッセージ ID で回復する。本試作の4KiB上限は通知本文のUTF-8バイト数であり、JSONや暗号化の付加分は別。暗号化後のwire全体は8192バイト以内に制限する。native transport ID をアプリ ID に流用しない。4 KiB 通信の実効所要時間・費用・断続受信は実機で測る。

## Cloudloop の下り

公式 Python 資料は `POST https://api.cloudloop.com/Data/DoSendImtMessage` に JSON の `token`、`thing`、Base64 の `message`、`topic` を渡す例を掲載している。token を URL に含める例よりこの方式を優先し、ログに出さない。アプリサーバーからのみ呼び、Hub に運用 token を置かない。[公式 Python 資料](https://pypi.org/project/rockblock9704/)、[Cloudloop 下り API](https://knowledge.cloudloop.com/docs/api/send-message)

SDK API を使う実機ブリッジを同梱しても、無線機なしの試験は `hardware_tested: false`。Fake SDK での callback・キュー・再送の試験結果は software の欄に記録する。
