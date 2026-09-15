# Business Pilots

## 目的

自動化を実際の仕事と収益へつなぎ、コード完成、販売開始、第三者取引、入金照合、継続利用を別々に測る。

## 現在地

- CSV整形は決定的変換、独立検査、私有成果物、7日保持、料金policyのP0実装中。35作業中11完了、5進行中、外部gate 19。
- メルカリは本人操作を前提に出品準備、費用計算、承認、未照合売上の安全な保存を実装済み。
- Fashion Brand OpsはCampaign、Sales Concierge、Production Cockpit、Instagram候補取込、MCP操作をmockで実装済み。
- 真正な第三者有料取引、Provider入金、返金、払出し、継続利用の実績は未完了。

主なtask: `CSV00`, `BIL03`, `FB01`〜`FB06`, `B02`, `B05`。

## 次に進める順番

1. CSV P0の独立queue、lease回収、scheduled purge、実スマホ動作を完成する。
2. 販売主体、注文表示、連絡、返金、個人情報、provider証拠を確定する。
3. 第三者の真正な有料取引1件を納品、検収、入金照合まで通す。
4. 5人、10件へ広げ、受注0、未入金、返金、介入、再注文も分母へ含める。
5. 自己購入、合成入金、手入力だけの完了を売上実績にしない。

## 完了条件

- P0コード、P1取引1件、P2複数利用者、P3自動接続、事業検証を別状態で記録する。
- 顧客データと成果物を本人別に分離し、retentionと削除を実測する。
- 外部市場の規約、公式API、固定IP、OAuth、決済条件に従う。
- 売上、利益、時間短縮を実測なしに表示しない。

## 関連資料

- [CSV仕事 v1](../csv-business-v1.ja.md)
- [CSV security](../csv-business-security.ja.md)
- [Mercari revenue loop](../mercari-revenue-loop.md)
- [Fashion Brand Ops](../fashion-brand-ops-integration.md)
- [CSV task manifest](../../data/csv-business-tasks.json)

## 検証

- `npm run csv:check`
- `node --experimental-strip-types --test tests/csv-transform.test.mjs tests/csv-fee-policy.test.mjs`
- `npm run test:fashion-brand-ops`
