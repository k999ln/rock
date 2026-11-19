# Noah Agent運用パック 0.1.0

記事編集、案件・納品、ブランド運営の3パックと7担当の設定をまとめたPC向け配布候補です。基本4ツールとブランド運営MCP、接続プログラムを同梱しています。追加のnpm依存は不要です。

| パックID | 担当 | できること |
| --- | --- | --- |
| article-editing | 出典整理・無料記事編集 | 完成原稿の出典整理と無料版作成 |
| delivery-support | 案件条件チェック・納品照合 | 提案条件と納品記録の照合 |
| brand-operations | 企画・接客下書き・制作管理 | ブランドの内部計画と下書き。外部接続はmock |

Node.js 22.13以上が必要です。基本4ツールにはmacOSでPython 3.13以上、LinuxでPython 3.10以上も必要です。Pixelへ直接入れるAPKやLLMのモデル本体ではありません。

## 最初の確認

ZIPを新しいフォルダへ展開し、その中で実行します。

```sh
node noah.mjs list
node noah.mjs verify
node noah.mjs demo
```

`verify`は配布ファイルのサイズとSHA-256を確認します。配布元の署名ではないため、ZIPと外側のSHAも信頼できる受取元と照合してください。`demo`は同梱サンプルだけで4ツールをMCP経由で呼び、ブランドの計画・下書き・重複防止をメモリ内で試します。実データ・実投稿・実モデル推論の試験ではありません。

## 接続して使う

自分が開いているNoah/Eve Web画面のoriginを指定します。originは`https://ホスト名`の部分で、パスを含めません。次はlocalhost開発画面の例です。

```sh
node noah.mjs start article-editing --origin http://localhost:3000
```

画面の既存PC/MCP接続から接続し、Tool・入力を確認して実行します。案件・納品は`delivery-support`、ブランドは`brand-operations`へ置き換えます。一度に一つのパックを使い、切替時はCtrl+Cで停止してから次を起動します。初期ポートは38479です。既存Connectorが使用中なら終了を確認し、無断で止めないでください。

接続はこのPCのloopbackと指定originだけです。新しいAgentを自動登録したり、仕事を勝手に始めたりしません。記事編集と案件・納品は同じ基本4ツールを公開します。担当ごとの推奨Tool一覧は実行権限を制限する仕組みではありません。

7担当の設定は`packs/<pack-id>/agents/*.json`にあり、既存Eve Agent設定の形式です。初期状態は`enabled:false`です。既存のAgent設定画面で役割とモデルを確認して使ってください。パック全体の一括importとaccount登録は未接続です。基本ツールそのものはLLMがなくても処理できます。

## 停止・再開・保存

- 停止: Ctrl+C。Connectorとその子processの終了を確認してから再起動します。停止未確認のエラーが出た場合は同じ仕事を再送しないでください。
- 再開: 同じstartコマンドで起動し、画面で再接続します。前の接続キーや実行承認は引き継ぎません。結果が不明な仕事は既存Workの同じJobで確認します。
- 基本4ツール: 原稿は明示的に選びます。作業用一時ファイルと、本人が保存した成果を区別してください。既存CLIの直接利用例は`toolkits/mr/README.md`にあります。
- ブランド: 初期保存先は`~/.noah-agent-operations/brand-operations/fashion.db`です。`--state-dir`で別の本人専用フォルダを指定できます。再起動時も同じ保存先を使います。
- backup: ブランドを停止した後でstateフォルダを本人用の保管先へコピーします。同版と同じ保存先に戻して確認します。配布ZIPにDB・秘密値・顧客情報を入れないでください。
- 更新: 新版を別フォルダへ展開し、verifyとdemoを通してから切り替えます。旧版とDB backupを保持します。自動更新・DBの自動rollbackは提供していません。

## 接続範囲

ブランドの子processへ渡す環境変数は保存先とローカルtenantだけで、Providerはmockです。投稿、DM送信、広告、課金、本番アカウント接続はこの起動方法では有効になりません。既存Provider承認の仕組みを省略しません。

旧Mr. Hubの11候補は`index.json`のcandidate一覧で確認できます。実行器がつながっていないため起動パックには含めません。定期実行、Agentの無人連続運転、端末ストアへの一括追加、Pixel実機受入、チャット用Skyプラグインの404復旧は次の統合対象です。

MR由来コードのMITライセンスと固定sourceは`toolkits/mr/vendor/mr/LICENSE`、`provenance.json`にあります。その他のsourceはRockstarOS repositoryの条件に従います。
