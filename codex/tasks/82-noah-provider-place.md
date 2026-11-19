# 82 提供者サーバー型の接続（事前登録無しの OAuth・利用権の受け渡し）

設計: docs/noah-agent-market-design.md §4.3・§4.7・§5、docs/sky-commerce-design.md §11、docs/sky-mcp-architecture.md。先に 74。

## やること

1. MCP の client 登録を Client ID Metadata Document にする。Noah の client 文書を 1 つ公開し、対応する認可サーバーには事前登録無しで進む。順は、事前登録 → CIMD → 動的登録（互換）→ 手入力。
2. MCP 2026-07-28 に対応する。session と `initialize` の往復が無くなり、`server/discover` と要求ごとの `_meta` に変わった。今の検査（lib/mcp-inspection.ts）は `initialize` → `tools/list` なので、新版だけの接続先を読めない。2025-11-25 以前は残す。
3. A2A の署名付き Agent Card の検証（JWS、正規化）を足す。署名は内容の一致の証拠で、作者の身元の保証にしない。
4. 利用権の受け渡し。Noah が出す短命の利用権を、提供者が自分のサーバーで確かめる。`sky-paid-access/1` の設計を実装し、Sky Tool SDK に受け口を足す。提供者サイトの会員登録を要らなくする。
5. 外部サービスの許可の再利用。最初の 1 回だけ本人が許可し、次の Agent からは接続の画面の同意に含める。

## 変えないもの

- token を別の接続先へそのまま渡さない。鍵を入力欄へ貼らせない。
- 提供者が利用権を確かめられない有料 Agent は売らない。

## 合格条件

- CIMD に対応する MCP サーバーへ、事前登録無しで、本人の許可 1 回でつながる。
- 利用権の無い本人、返金済みの本人の呼び出しを、提供者側の受け口が拒否する。
- 2 つ目の Agent が、同じ外部サービスを再入力無しで使える。
- tests/noah-provider-place.test.mjs、`npm run sky:check`、`npm run typecheck`。
