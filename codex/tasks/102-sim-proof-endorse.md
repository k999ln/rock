# 102 SIM の証明（N1）— Endorse のトークンを確かめ、SIM を account に束ねる

本人の決め: 2026-11-21 22:54「規定で進めて」（[07](../../docs/structure/07-decisions-from-minutes.md)）。設計は [compute-placement.md 0.3](../../docs/compute-placement.md) の N1 と、[03 の 0.3](../../docs/structure/03-esim.md)。

## 目的

Hub・専用端末（いつも）と、スマホの型 S（データ回線にした間）で、「この通信はこの SIM から来た」を、網の側の証明で確かめる。確かめた SIM を account に束ねる。束ねた後は Wi-Fi の通信でも同じトークンで確かめられる。

## やること

1. **トークンの形を確かめる。** SORACOM の公式の資料で、Endorse のトークンの形（署名の方式、公開鍵の置き場所と入れ替え、入っている項目の名前、有効期限）を確かめ、この task に書き足す。公式の資料に無い項目は推測で書かない。
2. **`lib/sim-proof.ts`（純関数）。** `verifySimProof(token, { publicKeys, hashSecret, now, maxAgeMs })` は、署名・有効期限・発行者を確かめる。成功時に返すのは `{ simDigest, deviceDigest, issuedAt, expiresAt }` だけ。digest は、専用の秘密値 `SIM_PROOF_HASH_SECRET`（32 文字以上。`ESIMGO_PROFILE_HASH_SECRET` とは別の値）で HMAC-SHA256 した物。IMSI・IMEI の生の値は返さず、保存せず、ログに出さない。
3. **束ねる口。** `POST /api/devices/sim-proof`（サインイン済みの本人だけ）。トークンを確かめ、`sim_bindings`（owner・simDigest・deviceDigest・束ねた時刻・外した時刻）に 1 行足す。ほかの owner に束ねてある SIM は拒む。同じ owner・同じ SIM の再送は同じ結果を返す。
4. **外す口。** `POST /api/devices/sim-proof/revoke`。外した時刻を入れる。行は消さない。
5. **確かめる口。** 束ねた後の通信では、トークンの digest が束ねた行と合う時だけ「SIM で確かめた」と扱う。合わない時は、パスキーの本人確認に戻す（SIM だけで支払い・削除・権限の変更を許さない）。

### 1. Endorse のトークン形式（SORACOM 公式資料）

- 応答の `token` はヘッダー・ペイロード・署名を `.` で区切った JWT。ヘッダーの署名方式は `alg: RS256`。`kid` は署名鍵に対応する PEM ファイル名で、公開鍵は `https://s3-ap-northeast-1.amazonaws.com/soracom-public-keys/` の下から取得する。鍵の更新時期、旧鍵の提供期間、自動更新の仕様は公開資料に記載されていない。[トークン取得](https://docs.soracom.io/en/services/endorse/request) · [トークン検証（英語）](https://docs.soracom.io/en/services/endorse/verification) · [認証トークンの検証（日本語）](https://users.soracom.io/ja-jp/docs/endorse/validate-token/)
- 公式例の JWT 項目は `iss`（`https://soracom.io`）、`aud`（`soracom-endorse-audience`）、`sub`（`soracom-endorse`）、`iat`、`nbf`、`exp`、`jti`。`imsi` と `imei` は `soracom-endorse-claim` オブジェクトの中にある。SIM グループ設定の `parametersToEndorse` で `imsi` と `imei` を有効にする。設定項目として `simId`、`msisdn`、`requestParameters` も選べる。[認証トークンの検証](https://users.soracom.io/ja-jp/docs/endorse/validate-token/) · [Endorse 設定](https://docs.soracom.io/en/services/endorse/configuration)
- 有効期限は `exp`（Unix 時刻の秒）。グループの `tokenTimeoutSeconds` で変更でき、既定は発行から 600 秒。期限内は、Air for Cellular 経由で取得したトークンを別の回線から送れる。[Endorse 設定](https://docs.soracom.io/en/services/endorse/configuration) · [Endorse の特徴](https://users.soracom.io/ja-jp/docs/endorse/feature/)

### 実装の設定と API

- `SIM_PROOF_PUBLIC_KEYS_JSON` に信頼済みの `kid` と PEM の対応を設定する。切り替え期間中は承認済みの新旧鍵を併記できる。未登録の `kid` は拒否し、リクエスト中に外部から鍵を取得しない。`SIM_PROOF_HASH_SECRET` は暗号学的に安全な乱数 32 バイト以上を符号化して用意し、eSIM Go の値と分ける。既存の紐付けがある間はこの値を固定する。更新には紐付けを引き継ぐ別の手順が要る。API は `exp` と発行から 600 秒の両方を確認する。検証関数に渡す時刻と返す時刻はミリ秒。
- `POST /api/devices/sim-proof` は `{ "token": "…" }` を受け付け、既存の account セッションの owner に束ねる。別の owner や端末への付け替えには、既存の紐付けの解除と、解除後に発行したトークンが必要。
- `POST /api/devices/sim-proof/revoke` は `{ "bindingId": "…" }` でその owner の行に解除時刻を設定する。再送時も最初の解除時刻が残る。
- `POST /api/devices/sim-proof/verify` は `{ "token": "…" }` を受け付ける。サインイン済みの account または認証済みの端末セッションの owner と、有効な紐付けの両 digest が一致した場合に `sim_verified` を返す。照合できない場合は `passkey_required` を返す。応答は確認結果であり、セッションや権限は発行しない。

## 合格条件（Jev が判定できる値）

- 試験用の鍵で署名した正しいトークンで、束ねる行が 1 行できる。
- 期限切れ・別の鍵・1 文字書き換え・発行者違いのトークンは、どれも拒まれる（各 1 件以上の試験）。
- DB・ログ・応答のどこにも、IMSI・IMEI の生の値が出ない（試験で文字列を探して 0 件）。
- ほかの owner に束ねてある SIM の束ねは 0 件。同じ要求の再送で行が増えない。
- 外した SIM のトークンでは「SIM で確かめた」にならない。
- `npm run typecheck`・`npm run lint:product`・関係する試験が通る。

## やらないこと（本人の明示許可が要る）

- SORACOM との契約・問い合わせ・本番の公開鍵の設定。本番 D1 への migration。
- SIM の証明だけで、支払い・削除・権限の変更を許すこと。
