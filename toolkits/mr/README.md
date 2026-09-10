# Rock star PC接続とMCP

初回にmacOSで `Rock star接続.command` を開き、サイトの「PC・MCP接続 → このPCを接続」を押してください。PC接続の出典整理にはmacOSでPython 3.13以上、LinuxでPython 3.10以上が必要です。管理者/rootではなく通常の利用者として起動してください。以降はツールの実行ボタンからPCが処理します。接続アプリを閉じると切断します。OSの自動起動は設定しません。

Linuxはこのフォルダで `python3 mcp_server.py --http`。Windowsの出典整理MCP接続は未対応です。他の3ツールと直接CLIは従来のままです。MCPとしてCodexに登録する場合は次の設定を使い、パスを実際の展開先に変更します。

```toml
[mcp_servers.loop_mr]
command = "python3"
args = ["/absolute/path/rock-star-mr-tools/mcp_server.py"]
```

Codexからは4ツールを直接呼べます。記事・出典・案件照合はテキスト引数、納品照合はレビューJSONとfiles（相対pathとbase64）を渡します。納品照合の `sample: true` は同梱の合成データを使い、一回で試せます。実データのフォルダは成果物とrequirements、receiptsを含む作業ルートを選んでください。

初回のブラウザでローカルネットワーク接続の許可が出る場合があります。データはPC内で処理します。任意コマンドの実行・外部送信・課金は扱いません。

MCPの出典整理は渡した文章だけを元の固定CLIで実行します。入力と出力は各65,536 UTF-8バイト以下、処理は3秒以内です。日本語は通常1文字3バイトなので、文字数と上限は一致しません。上限超過時は途中の結果を返さず失敗します。同時実行は接続アプリ全体で1件です。一時入力は正常終了・通常のエラー・Ctrl+C・終了要求時に削除します。回収を確認できない場合は接続アプリの再起動が必要です。強制終了（SIGKILL）や停電後の自動回収、処理の再実行防止は未対応です。

この接続は利用者と同じ権限で動きます。OSでファイルや通信を遮断するsandboxではありません。native OSのHub接続・Wallet課金・USB接続とは別のPC機能です。

---

# Rock star × Mr. 無料ツールパック

Python 3.10以上。追加インストール、APIキー、外部登録は不要。

原本は `vendor/mr/`、MITライセンスと取得元commitは同梱しています。Rock star側のアダプターは入力検証・コード保護・出典の保持を追加しています。利用者の文章やファイルはローカルPC内で処理されます。

## サンプルを試す

パックのフォルダをCodexで開き、以下の処理を依頼できます。

```sh
python3 rock_star_tools.py coconala-check --input examples/coconala.json
python3 rock_star_tools.py citations --input examples/article.md --output cleaned.md
python3 rock_star_tools.py free-article --input examples/article.md --summary examples/summary.md --after-chars 40 --price 500 --paid-contents '実践手順と記録方法' --note-url 'https://note.com/your_account/n/your_article' --output free.md
python3 rock_star_tools.py verify-delivery --workspace examples/delivery --input examples/delivery-review.json
```

サンプルのnote URLは説明用です。公開前に自分の記事URLへ置き換えてください。
`--output`を省略すると結果を表示します。指定すると新しいファイルとして保存し、既存ファイルは上書きしません。

## ツールの範囲

- 案件チェック: 単発/非同期の対応条件や役割の食い違いを確認。許可・受注・収益を保証せず、応募や送信はしません。
- 出典整理: 全角 `（出典: [ラベル](URL)）` のリンクを一覧に集約。コードと非リンク出典は保護。出典の正しさは判断しません。
- 無料版作成: 入力済みの3〜5要点を使い、文の区切りで無料版を構成。元の出典欄は全部残し、完全版に本文が残ることを確認。自動執筆・投稿・販売はしません。
- 納品記録照合: 元契約、ファイルSHA-256とサイズ、制作記録、別レビューID・根拠を照合。PASSは記録が整合したという結果で、品質や第三者の承認を保証しません。検出する秘密情報の形式は限定的です。

## 自分の納品データを指定

`examples/delivery-review.json` と `examples/delivery/` が最小構成の見本です。実行時には自分の契約条件、成果物、実行記録、独立したレビュー記録へ置き換えます。架空のレビューで承認を作る用途には使わないでください。

1つの入力は1 MB以下、成果物は最大100個・合計10 MB以下。ワークスペース外のファイルやシンボリックリンクは対象にできません。テンプレートからハッシュを作る際はUTF-8、キー順、改行を揃えてください。

## ライセンス

原本: Copyright (c) Anicca contributors / MIT (`vendor/mr/LICENSE`)。
Rock starのこのパック内のアダプターとサンプルも、同梱MITライセンスの条件で使用できます。
パックには他人の認証情報、過去の案件データ、投稿・送信処理を含めていません。
