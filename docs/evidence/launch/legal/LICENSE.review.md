# RockstarOS license decision material — unapproved

対象は RockstarOS が権利を持つ新規コードのみです。Linux、Buildroot、noVNC、font、Mr 等の第三者条件は選択で置き換えません。現時点の製品条件は UNSET、legal.status は NOT_CLEARED です。このファイルを LICENSE として出荷しません。

| 決定案 | 公開・改変・再配布・商用利用 | 保証・商標・サポート | この配布への影響 |
| --- | --- | --- | --- |
| A: 自社コード Apache-2.0 | ソース公開し、条件を守る改変・再配布・商用利用を許可。特許条項あり | 標準の保証否認。商標利用許可は別。追加サポートは提供者自身の責任で別条件 | SDKの導入・再利用を促す候補。第三者コードとの結合単位・権利者を確認して適用範囲を明記する |
| B: 自社コード MPL-2.0 | ソース公開。対象ファイルの改変を配布するときは対象ソースを提供。商用利用は可能 | 標準の保証否認。商標・サポートは別条件 | OS対象ファイルの改善を共有したい場合の候補。別ファイルの第三者アプリまで一括で同じ条件にしない |
| C: 非OSSの評価用条件 | 公開/非公開の範囲、評価・変更・再配布権、商用利用を権利者が個別設計 | 保証否認、責任制限、商標、期間、サポート、法域の文章を確認者が確定 | 現在の full source 同梱を前提に、第三者の既存権利を制限しない条件が必要。最も未決定の文章が多い |

技術側からの提案は、作者がSDKを組み込みやすくする要望との整合から A を優先して権利者に検討してもらうことです。Apache-2.0採用を決定した意味ではなく、権利由来とライセンス互換性の最終評価も未完了です。月額888 centsの運用方針、サービス契約、商標、課金開始はコードの許諾とは別に保持します。

根拠: [Apache-2.0 条文](https://www.apache.org/licenses/LICENSE-2.0.html)、[MPL-2.0 条文](https://www.mozilla.org/en-US/MPL/2.0/)、[Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)。選択肢Cは新しい許諾の提案範囲であり、完成済みの法的文言ではありません。

最終的にまとめて必要な回答: 権利者の正式名・コードの許諾権限、A/B/Cの選択と適用対象、商標・サポート窓口、対応sourceをbinaryと同時同梱・同経路提供する方針を確定してください。回答後、承認者・日時・source SHA・archive SHA・inventory SHAを記録し、3つのRock Buildroot packageのLICENSE/REDISTRIBUTE/LICENSE_FILES、root LICENSE、NOTICE、配布ページを同じ新候補に反映します。
