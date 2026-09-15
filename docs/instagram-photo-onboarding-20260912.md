# Instagram写真オンボーディング

## 利用フロー

1. 利用者がこのチャットへInstagramのプロフィール画面またはアカウント切替画面を送る。
2. Skyの画像理解が、表示されているusername、表示名、投稿数、フォロワー数、フォロー数だけを抽出する。
3. Skyが画像byteのSHA-256と抽出結果を`instagram.accounts.intake_screenshots`へ渡す。
4. MCPは同じbrandとusernameを一件へまとめ、`needs_owner_confirmation`として保存する。同じ画像を再送しても重複accountを作らない。
5. 初回だけ利用者がMeta接続を行う。公式providerのreadbackとusernameが一致した候補だけを`oauth_matched`へ進める。
6. 接続後、投稿計画、下書き、分析、DM分類を開始できる。公開、広告、DM送信、請求、返金は従来どおり個別承認が必要。

## 保存するもの／しないもの

保存するのは、抽出した公開プロフィール情報、画像のSHA-256、確認状態、Meta接続後のaccount参照です。スクリーンショット本体、ローカルpath、password、Cookie、raw OAuth token、OTPは受け付けず、保存しません。

写真から見えたhandleは所有権の証明ではありません。候補状態では投稿対象に選べず、Meta OAuth readbackが一致するまで接続済みにしません。

## 今回の3枚

今回共有された3枚からは`insta_akume`、`iceiceice.mean`、`luckyluckylucky_f`を未確認候補として扱います。画像の一部が切れている場合は、Meta接続時のreadbackを正本とし、画像だけでhandleを確定しません。

## 検証

- 候補取込の入力上限、SHA-256、username、数値、秘密情報拒否
- username単位の重複防止と同一画像の冪等再取込
- 候補を`social_accounts`へ自動登録しないこと
- Meta接続済みreadbackとの一致でだけ`oauth_matched`へ進むこと
- SkyのMCP接続が41操作を照合し、候補一覧を取得できること
