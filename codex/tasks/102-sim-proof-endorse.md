# 102 SIM の証明（N1）— Endorse のトークンを確かめ、SIM を account に束ねる

本人の決め: 2026-11-21 22:54「規定で進めて」（[07](../../docs/structure/07-decisions-from-minutes.md)）。設計は [compute-placement.md 0.3](../../docs/compute-placement.md) の N1 と、[03 の 0.3](../../docs/structure/03-esim.md)。

## 目的

Hub・専用端末（いつも）と、スマホの型 S（データ回線にした間）で、「この通信はこの SIM から来た」を、網の側の証明で確かめる。確かめた SIM を account に束ねる。束ねた後は Wi-Fi の通信でも同じトークンで確かめられる。

## やること

1. **トークンの形を確かめる。** SORACOM の公式の資料で、Endorse のトークンの形（署名の方式、公開鍵の置き場所と入れ替え、入っている項目の名前、有効期限）を確かめ、この task に書き足す。公式の資料に無い項目は推測で書かない。
2. **`lib/sim-proof.ts`（純関数）。** `verifySimProof(token, { publicKeys, now, maxAgeMs })` は、署名・有効期限・発行者を確かめる。返すのは `{ simDigest, deviceDigest, issuedAt, expiresAt }` だけ。digest は、専用の秘密値 `SIM_PROOF_HASH_SECRET`（32 文字以上。`ESIMGO_PROFILE_HASH_SECRET` とは別の値）で HMAC-SHA256 した物。IMSI・IMEI の生の値は返さず、保存せず、ログに出さない。
3. **束ねる口。** `POST /api/devices/sim-proof`（サインイン済みの本人だけ）。トークンを確かめ、`sim_bindings`（owner・simDigest・deviceDigest・束ねた時刻・外した時刻）に 1 行足す。ほかの owner に束ねてある SIM は拒む。同じ owner・同じ SIM の再送は同じ結果を返す。
4. **外す口。** `POST /api/devices/sim-proof/revoke`。外した時刻を入れる。行は消さない。
5. **確かめる口。** 束ねた後の通信では、トークンの digest が束ねた行と合う時だけ「SIM で確かめた」と扱う。合わない時は、パスキーの本人確認に戻す（SIM だけで支払い・削除・権限の変更を許さない）。

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
