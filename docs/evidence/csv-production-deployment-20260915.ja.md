# CSV仕事 v1 実装・公開証拠（2026-09-15）

## RockstarOS

- Sites project: `appgprj_6aa444b6e6508191a19f16405d0be927`
- source commit: `d4bd901dda0d5bfad1df33ca73450e598fb8a897`
- saved version: 39
- deployment: `appgdep_6aa90c08cf448191ac8906bced548d81`
- production URL: `https://rockstaros-kaiya.noellesugar1.chatgpt.site`
- audience: owner-only（既存設定を維持）
- deployment status: `succeeded`
- unauthenticated `/`、`/csv`、`/csv/terms`: HTTP 401 と ChatGPT sign-in gate を確認
- authenticated verification: ChatGPT account selection と RockstarOS consent gate まで確認。新たな account-link consent は付与していない

Sites管理Gitの既存 `main` `89dfdaf9ca0011fcee676e67b6d7bba5829e377d` を基点に、CSV実装と最新Sky Studioを履歴保持で統合し、`d4bd901` を通常pushした。GitHub `k999ln/rock` は所有権をこの実行環境で確認できず、外部repository全体への送信承認が成立しなかったためpushしていない。Sites管理Gitとversion archiveは同じcommitから作成した。

## 検査

- `npm run csv:check`: 35作業、完了10、進行中6、外部gate 19（本証拠とP00完了反映前）
- CSV変換・月額判定test: 8/8
- migration union test: 17/17
- `npm run typecheck`: 成功
- `npm run lint:product`: 成功
- `npm run build`: 成功（`/csv`、`/csv/terms`、CSV API、`/studio`を含む）
- MCP package check、billing dry-run、Fashion Brand Ops 19/19、web bundle、web assets、API 143 assertions: 成功
- full `npm run verify`: macOS側Pythonに`os.waitid`がないため既存PC citations adapterで停止。CSV・migration・buildの失敗ではないため、当該security実装を迂回または書換えていない

## PRIVATE/PIXEL再監査

- authenticated GitHub latest main at audit: `40c019b8ccd2203e76fbb060211c29b3129ef58c`
- audit log commit and GitHub/Sites source sync: `1a151e668729310c6d955222067d0de2909d0c8e`
- `npm run lint`: 成功
- `npm test`: build・Node test 71/71
- Chromium E2E: 25/25
- GrapheneOS official latest: `2026091000`; approved pin: `2026090700`。policy通り自動更新していない
- apex: readiness `saleReady:true` だが旧販売面で `/basic` は404
- www: `/basic` は3,000円でHTTP 200だが、Sites env revision 0で販売不能

コード再deployだけでは本番Secrets、D1、apex/www分裂を解消できない。秘密値、販売者情報、購入、入金、顧客、実機結果は推測・自作していない。

## 完了境界

本番コード、非公開公開、契約、販売文、募集文、検査、証拠化まで完了した。永続worker、決済provider event、販売者本人情報、実顧客、実注文、実入金、実端末、月次請求は外部状態が必要なgateとして残る。これらを架空実績で完了扱いにしない。
