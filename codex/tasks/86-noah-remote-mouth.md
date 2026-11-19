# 86 リモートの口（MCP・Space・相手の許可）と L1 の接続試験

設計: docs/noah-agent-market-design.md §4.3・§4.4・§5、docs/services/noah-agent-intake.md。先に 85。

## やること

1. lib/noah-mouth-mcp-remote.ts: 握手（2025-06-18・2025-11-25。次に 2026-07-28 の `server/discover`）、道具の一覧、道具の呼び出し。今の `lib/mcp-client.ts` と `lib/mcp-inspection.ts` を土台にする。応答は JSON と SSE の両方。
2. lib/noah-mouth-space.ts: 動いている Gradio の Space の道具の定義の取得と呼び出し。寝ている物・止まっている物へは接続しない。
3. 相手の許可。401 → 保護された資源の公開情報 → 認可サーバー → client の登録（client 文書を先に試し、無ければ動的登録）→ PKCE。Noah の client 文書を 1 つ公開する。token は Broker が持つ。
4. 接続先の検査。HTTPS だけ。私設アドレス・metadata のアドレスを拒否する（今の検査と同じ）。転送先も検査する。応答の大きさと時間に上限。
5. L1 の接続試験。握手と道具の一覧の結果・秒数・道具の定義の hash・許可の要否を台帳へ書く。1 接続先に 1 巡回 1 回。
6. 道具の定義の hash を Passport に固定する経路（74 が使う）。

## 変えないもの

- 道具を自動で呼ばない（L2 は 88）。鍵を入力欄へ貼らせない。token を別の接続先へ渡さない。
- 既存の `lib/fashion-mcp-client.ts` の動き。

## 合格条件

- 試験用の接続先（鍵なし・401 で動的登録あり・401 で client 文書あり・新しい版だけ・SSE で返す・私設アドレスへ転送する）で、それぞれ期待した結果になる。
- 公開の接続先 20 件（鍵なしで応答する物）で、握手と道具の一覧が通り、台帳に L1 が付く。
- 道具の定義を変えた接続先で、hash の不一致が検出される。
- tests/noah-mouth-remote.test.mjs、`npm run sky:check`、`npm run typecheck`。
