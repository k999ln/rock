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

## 実装の引き継ぎ（2026-11-21、PR #335）

- 枝 `claude/noah-handshake-l4-20261120`（Claude）。L3 の点検の修正 [PR #339](https://github.com/k999ln/rock/pull/339) の上に積んだ PR。その下が L3 の [PR #332](https://github.com/k999ln/rock/pull/332)。main への直接 push・マージはしていない。
- 範囲は仕様書 86 の 10 章だけ。相手の許可（OAuth。上の「やること」の 2・3）と `lib/noah-mouth-space.ts` は作っていない。401 を返した相手へは、初期化の 1 回しか送らない。
- 置いた所: 握手・道具の一覧・呼び出し・接続先の検査は `lib/noah-mouth-mcp-remote.ts`、入力欄の関数は `lib/noah-form.ts`（どちらも、型契約から関数ごと移した。型契約の側は再 export）。握手 1 回（`probeL1`）と結果の書き方（`planNoahProbeWrite`）と見回りの間隔は `lib/noah-probe.ts`。巡回での握手（`probeDue`）は `lib/noah-intake-probe.ts`（`createIntakeStore` が出し、合図の入口が、台帳の巡回の後に呼ぶ）。
- 仕様書 88 の 9.3（失敗が続いた物を外す・30 日で隠す・握手が通ると戻す）と 9.7（量産の系列を握手の対象から外す）も、ここで入れた（握手の結果を書く所と同じなので）。L7 に残るのは、後始末（9.5）と、つながると確かめた数（9.6）。「動いた」を付ける（9.2）は L6。
- 決めた事（仕様書 86 の 10.3 の 10〜15 に書いた）: 401 の候補の次の握手は 30 日後。握手 1 件の待ち（12 秒）が残っていない合図は、新しい握手を始めない。握手の結果は、取り置きの値が変わっていない時だけ書く。系列の行は、載せる条件が変わった時だけ書く。手元の入口（`POST /api/noah/intake` に `{}`）は握手しない。
- 製品試験: `node --experimental-strip-types --test tests/noah-mouth-remote.test.mjs tests/noah-form.test.mjs tests/noah-probe.test.mjs tests/noah-intake-*.test.mjs`（76 件）。型契約: `node --experimental-strip-types --test docs/design-validation/noah/noah-*.test.mjs`（61/61）、`python3 docs/design-validation/noah/validate-noah-v1.py`（10/10）。
- 受入: `node --experimental-strip-types scripts/check-noah-probe.mjs`（合成。手元の D1。外へ通信しない）。`--live --records=<台帳の記録の .jsonl> --limit=100` で、実在の接続先へ握手だけを送る（道具は呼ばない。1 接続先に 1 回）。結果は仕様書 86 の 10.6: 通った 51・401 が 35・応答しない 11・形が合わない 2・つなげない 1。通った 51 のうち、入力欄で使える道具がある物は 50。
- `scripts/check-noah-intake.mjs`（L3 の受入）は、握手を 0 件にして、台帳の取り込みだけの受入のままにした。
- **残っている事**: 本番の Worker から、内部向けのアドレスを指す名前へ届かない事の確かめ（仕様書 86 の 10.3 の最後の手順。配備の後、出す前に 1 回。G3）。本番 migration・配備・切り替えは未実施。
- CI の既知の残件: SPIDER / secrets が、main の履歴にある試験用の文字列（`docs/design-validation/noah/noah-connect.test.mjs:85` の 3 commit）を検出する。この PR の追加による検出ではない。
