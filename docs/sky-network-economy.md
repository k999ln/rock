# Sky内MCP — tob無料・接続・貢献分配フロント

更新日: 2026-09-12。対象: `app/sky/network/page.tsx`。

## 確定した方針

- tobがSkyへ登録、接続、公開し、基本検査と利用分析を受けるSky利用料は0円。
- tob商品の売上に対するSky手数料は0%。tob自身の商品価格はtobの収益として扱う。
- 決済、外部API、AIモデル、cloud等の第三者実費はSky手数料から分離して表示する。
- RQ20の月額8.88 USDはToC向けSky基本料金として維持し、tobへ転用しない。
- ToC売上からの報酬pool、対象となるToB/ToCの貢献、分配率、最低払出額、本人確認、税、返金負担は未確定。

## フロントの役割

MCP接続・管理はSky本体の中核機能として、接続の簡単さと、その裏側の参入障壁を同じ操作面で扱う。Sky画面に常設sidebarや独立したSky Networkナビゲーションは置かず、最初の画面に状態と接続・管理導線を表示する。ToB向け掲載もSky内のダイアログで開く。

1. MCP URL、Registry名、packageの入力
2. Connection Passportによる作者、版、transport、OAuth audience、価格、受取人の確認
3. Execution Covenantによる呼出し単位の権限・データ・予算・期限
4. Contribution Receiptによる成果へ使われた貢献の検証
5. Reconciled Settlementによる取消、不明状態、重複の照合

## 現在の実装境界

Sky内の「安全確認」は合成フロントデモであり、入力URLへの通信、資格情報取得、MCP初期化、公開、課金、収益分配、現金保管、送金を行わない。Connection Passportの表示値も合成である。実接続はMCP 2025-11-25 client、OAuth、隔離preflight、artifact署名、policy enforcementが実装・受入された後の別gateとする。

実払出は、販売主体、本人確認、提供地域、決済provider、税、返金、chargeback、最低払出額、資金保管方式を確定し、sandboxと本番受入を通過するまで有効化しない。

## 受入記録

2026-09-12に次を確認した。

- `npm run typecheck`、`npm run lint:product`、`npm run baseline:check`、`npm run build`を通過。
- desktop幅でSky Networkのナビゲーション、ヒーロー、tob 0円表示、4層trust stackを実ブラウザ確認。
- 390 × 844のmobile幅で1カラム化、見出し、料金badge、接続panelを実ブラウザ確認。
- デモ用アドレス入力から合成Connection Passportの完了表示までを操作確認。
- ToB / ToC切替で貢献条件の説明が切り替わることを操作確認。
- 最終的に`npm run verify`を実行し、本体109 test、Fashion Brand Ops 14 test、Worker/D1 API 143 assertions、production buildを含む全検証を通過。
