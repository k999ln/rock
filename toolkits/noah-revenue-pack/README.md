# Noah 本人用収益業務パック

agency-agents（MIT）の商品設計・コンテンツ制作・提案書作成の3定義を固定し、Noah用に短縮して順番に実行します。外部の実行コードや営業送信機能は含みません。初期の用途は店舗向け原稿制作の受託準備です。

推論はPollinationsの匿名無料クラウドへHTTPSで直接接続します。eSIM、APIキー、Stripe、有料モデルは使いません。実行順とWork保存はこのMacです。接続済みAndroidから、Wi-Fi ADB経由で依頼・進捗・成果・停止を操作できます。Macを閉じた後のクラウド常駐、公開Noahアカウントとの同期は未対応です。

配布版はNode.js 22.13以上で起動できます。

```sh
node agent.mjs init /absolute/new/private-directory
node agent.mjs run /absolute/new/private-directory request.example.json
node agent.mjs status /absolute/new/private-directory
node agent.mjs stop /absolute/new/private-directory
```

## 携帯から操作する

```sh
node agent.mjs serve /absolute/private-directory 3138
```

起動はloopback限定です。接続済みAndroidに `adb reverse tcp:3138 tcp:3138` を設定し、保存先の `mobile-link.json` 内の5分有効・一回限りのリンクをブラウザへ渡します。リポジトリでは `node --experimental-strip-types scripts/noah-revenue-phone.mjs <mobile-link.jsonの絶対パス> <adb devicesの端末ID>` が両方を行います。Wi-Fi ADB接続済みならUSBは不要です。リンクを公開・共有しないでください。

接続後は24時間有効のHttpOnly cookieを携帯に保持し、アドレスからキーを消します。再起動すると接続をやり直します。メール・パスワード・支払情報の登録はありません。携帯画面を閉じてもMac側の処理は続きますが、Mac停止中やADB切断中は操作できません。インターネット公開やクラウド常駐の機能ではありません。

`run`は依頼と前段の下書きを外部モデルへ送信します。秘密や顧客個人情報を含めないでください。入力JSONの`id`と内容は固定され、同じIDは保存結果を再利用します。内容変更には新しいIDが必要です。各段の間を46秒空けます。生成前の`FREE_LIMIT`と`Retry-After`を両方確認した時だけ、同じ仕事で最大5試行・10分以内の待機を行います。送信後の応答不明・その他の拒否は自動再送しません。課金設定や有料fallbackはありません。providerの将来の無料提供は保証しません。

保存先は本人所有0700、ファイルは0600。既存Work形式をSQLiteに保存し、各段のMarkdownも出力します。日次上限はUTCで12仕事、1パック3仕事です。料金の実績は検証できた匿名応答だけ0として記録し、電力・回線費を含みません。

Ctrl+Cまたはstopは停止フラグを残し、次の送信を止めます。送信済み処理の取消ではありません。再開する場合はstatusで結果不明がないことを確認し、本人がSTOPファイルを削除します。実行中の保存先をコピーせず、停止後にフォルダ全体を本人用領域へバックアップしてください。

成果は下書きであり、受注・納品・入金・利益ではありません。実際の販売、顧客への連絡、価格、契約はこのパックでは実行しません。`request.example.json`は架空店舗の明示サンプルです。

上流の原文とMITライセンスはupstream/、固定commit/blobはprovenance.json。Noahの短縮版はlib/noah-revenue-pack.tsが正本です。上流の成功率・ROIなどの目標値は実績として採用しません。
