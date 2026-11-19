## 2026-10-21訂正: SkyはAPI/MCPの受け皿

本人の追加訂正により、Homeの標準入口は接続済み投稿MCPを選ぶ受信口に変更。X専用APIは任意の個別adapter。利用者ごとのX開発者登録/取得枠を必須にしない。投稿供給元の実接続がないため、本人Xの実投稿/For You/自動同期は未受入。

`/#news-plugins`→「接続済みMCPを確認」。接続の追加は既存`/sky/network`を使う。`sky_timeline_read` toolが`sky.timeline.v1`を返すと、取得内容確認→承認済みの一度の実行→検査→Homeのnative行まで動く。供給元本人認可は接続先で行う。APIも同じ投稿contractを使うが、任意URLを指定するproxyは設けていない。

MCPのenvelopeは`schema`, `source: x`, `audience: owner`, `feed: following | recommended`, `fetchedAt`(epoch ms), `posts`。投稿は`id`, `author`, `name`, `text`, `protected`, `createdAt`(ISO), `url`(canonical X原文)。本人別メモリ表示のみ・15分期限。供給元のfree申告を料金保証にせず、未承認従量取得を実行しない。

以下は**運営が任意にX個別API adapterを選ぶ場合だけ**の設定。全利用者の必須作業ではない。

# X本人連携の設定と受入

入口は`/#news-plugins`の「自分のXと連携」。現在はソースとfixtureまでで、実投稿未接続。X本人sessionでDeveloper Consoleの初回契約画面まで確認し、RockstarOSとread-only用途を下書きした。契約checkboxと送信は本人が内容を確認する。クレジット購入や契約同意は実行していない。

## ローカル秘密設定

`.dev.vars`等、その起動環境がCloudflare worker envへ渡す**Git管理外の秘密設定**に以下を入れる。通常のViteブラウザ公開envへsecretを置かない。値をチャットやGitへ貼らない。

- `SKY_X_OAUTH_CLIENT_ID`: 自分のXアプリのClient ID
- `SKY_X_OAUTH_CLIENT_SECRET`: confidential OAuth 2.0 appのsecret
- `SKY_X_OAUTH_CALLBACK_URL`: X appに登録した正確な`/api/sky/x-account/callback` URL。HTTPSを基本とする。localは`http://127.0.0.1:3016/api/sky/x-account/callback`に対応するが、Xの実登録適合は未受入。公開環境を自動作成/露出しない。
- `SKY_X_ACCOUNT_KEY`: 安全に生成した32 bytesのhex（64桁）。本番は秘密管理/backup/rotationを別受入。
- `SKY_X_USER_READ_APPROVED`: 利用枠/費用条件を本人が決めた後だけ`1`
- `SKY_X_USER_READS_PER_DAY`: 1〜100の整数。本人/全体に同じ上限をかける保守的な取得回数制限。金額上限の代用品ではなく、X側のクレジット・費用枠と合わせて設定する。未設定は外部取得しない。

アプリ設定の資格情報と読取枠は別管理。現在のAPIは読み取ったresource単位の従量料金があるため、リクエスト回数を請求金額へ換算して表示しない。固定価格を推測しない。既存月16 USD、Wallet/作者手数料は変更しない。X provider実費と既存月次請求の照合は今回未受入。

## 本人の接続

1. 接続パネルでread-only用途と上限を確認。
2. Xで本人がプロフィール/投稿読取りだけを認可する。tweet.read/users.read/offline.access以外を要求しない。
3. 同じSky ownerのcallbackへ帰還する。本人/nonce/HttpOnly cookie/PKCE/state期限/一度限り/revisionを照合する。
4. 「投稿をホームへ読み込む」。reverse chronologicalの実投稿をnative Home内に表示する。公開/限定公開を区別し、他ownerや公開communityへ出さない。
5. 同時更新、15分の表示期限、429、日次上限、token更新、Sky停止、再認可を同じ本人で確認する。fixtureと実受入は分ける。

XのFor You APIは確認できていない。「あなたへ」はSkyのおすすめ入口で、X本人For Youを取得できたという意味ではない。フォロー中のsourceを付け替えてFor You成功とはしない。Xの制限回避やsession cookieの輸出、非公開内部API/ブラウザscriptを使わない。

## 停止とデータ

Skyの停止はowner revisionを進めて保存token/cache/stateを除き、遅れて来た旧結果を受け入れない。X側の認可grantの撤回は別操作で、Xの「連携しているアプリ」で本人が解除する。remote revoke成功とは表示しない。

cacheは15分を過ぎるとUIへ返さないが、DBの物理削除は次回更新/停止時であり、background purgeを実装済みとはしない。tokenは期限更新のため失効/停止まで暗号化保管する。owner/remote ID/username等のconnection metadataはowner別DBに残る。production保持/削除/backup/鍵rotationを別gateにする。

## 検証

`node --experimental-strip-types --test tests/sky-x-account.test.mjs`、`npm run schema:check`、`npm run design:check`、`npm run verify`。実アカウント投稿0件の状態をライブ合格にしない。証拠は`docs/evidence/x-account-native-feed.json`。
