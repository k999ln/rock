# 86 リモートの口（握手・道具の一覧・相手の許可）と L1 の接続試験

仕様: **[docs/noah/spec-86-remote-mouth.md](../../docs/noah/spec-86-remote-mouth.md)**。型と参照実装: docs/contracts/noah-mouth-v1.ts。試験: docs/design-validation/noah/noah-mouth.test.mjs（実測の写し fixtures/mcp-exchange-mizan.json を含む）。先に 85。

## ローンチまで（先に、この範囲だけを出す。[ローンチの最小限](../../docs/noah/mvp-launch.md) の L4）

仕様書の **10 章** だけを見て作る。完了の定義も、その章にある。

- 先に要る PR: L3（85 のローンチ分）
- やる: 下の「やること」の 1 のうち `lib/noah-mouth-mcp-remote.ts`、4（`probeL1`）、5（巡回での握手）
- やる: `lib/noah-form.ts`: docs/contracts/noah-form-v1.ts を全部移す（握手の時に、入力欄で使える道具の数を数える。87 が使う）
- やる: 握手の後の書き込み（10.3）: `form_tools`・`one_tap_tools`、系列への写し、2 回続けて失敗したら外す
- やらない（出した後）: 2・3（相手の許可の全部）。401 を返した相手は「相手の許可が要る」と記録するだけで、認可サーバーへは 1 回も送らない
- やらない（出した後）: `lib/noah-mouth-space.ts`

## やること（全部。ローンチの後に、残りをやる）

1. lib/noah-mouth-mcp-remote.ts: 参照実装の `noahMcpHandshake`・`noahMcpCall`・`noahMcpClose`・`noahToolsSha256`・`createNoahGuardedFetch`・`isNoahPrivateAddress`・`parseNoahWwwAuthenticate`・`NoahMouthError` を移す。lib/noah-mouth-space.ts は URL を作って同じ握手を呼ぶだけ。
2. lib/noah-oauth.ts: `noahProtectedResourceUrls`・`noahAuthorizationServerUrls`・`planNoahOAuth`・`noahClientMetadata`・`noahRegistrationBody`・`noahPkcePair`・`noahAuthorizationUrl`・`noahTokenRequestBody` を移す。
3. lib/noah-broker-cipher.ts（lib/sky-x-account.ts の `xAccountCipher` と同じ作り。鍵は `NOAH_BROKER_KEY`）、lib/noah-oauth-service.ts（発見・登録・開始・戻り・更新。仕様書 5 章）、app/oauth/client.json/route.ts、app/api/noah/oauth/start・callback の route。表は `noah_oauth_clients`・`noah_oauth_states`・`noah_oauth_grants`。
4. lib/noah-probe.ts: `probeL1(candidate)`。握手の結果を `noah_intake_checks` に書く（仕様書 4.2 の表）。401 なら発見まで行い、接続要件へ `services` を足す。
5. lib/noah-intake-store.ts の `sync()` の後ろに `probeDue()`（1 回に 8 件。同じ host へは 1 時間に 1 回。仕様書 6 章）。

## 決めてある事（変えない）

- lib/mcp-inspection.ts・lib/mcp-client.ts・lib/fashion-mcp-client.ts は変えない（URL の検査と版の一覧は import する）。
- 道具を呼ばない（L2 は 88）。道具の定義の本文を保存しない（hash と数だけ）。token を Agent・画面・別の接続先へ渡さない。
- 受け入れる版は 2025-11-25・2025-06-18・2025-03-26・2024-11-05。PKCE（S256）の無い相手とは、つながない。

## 合格条件

- `node --experimental-strip-types --test tests/noah-mouth-remote.test.mjs tests/noah-oauth.test.mjs tests/noah-probe.test.mjs tests/noah-oauth-service.test.mjs`（相手の振る舞い 17 通り、接続先の検査、取り方の決定 10 通り、`state` は 1 回だけ・10 分・本人だけ）。
- 手元の巡回で、鍵の宣言が無い候補 100 件に握手の結果が付く。内訳を PR 本文に書く（実測: 応答 54.6%・401 が 34.8%・失敗 10.6%）。
- `npm run sky:check`、`npm run typecheck`、`npm run lint:product`。
