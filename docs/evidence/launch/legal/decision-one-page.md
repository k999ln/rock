# RockstarOS 1.0 — 配布条件の決定資料（未承認）

対象は source **9abf78a80d27aa9f847c4051d20e4c552e407276** のDeveloper Previewです。**製品licenseはUNSET、legal.statusはNOT_CLEARED。** この資料は許諾・公開・本番署名の承認ではありません。

| 権利者が選ぶ案 | 利用・改変・再配布・商用利用 | 保証・商標・サポート／判断材料 |
| --- | --- | --- |
| **A: 自社コードApache-2.0（検討推奨）** | source公開、条件付きで許可。特許条項あり | 標準保証否認、商標は別、サポートは別契約。SDKを組み込みやすくする目的と整合 |
| B: 自社コードMPL-2.0 | source公開、対象fileの改変配布にはcovered source提供 | 標準保証否認、商標・サポートは別。対象fileの改善を共有したい場合 |
| C: 評価用の独自条件 | 公開範囲・評価・改変・再配布・商用利用を個別設計 | 保証・責任・商標・期間・サポートを権利者/確認者が作成。未決定文言が最多 |

いずれも**Rockが許諾権限を持つコードだけ**へ適用します。Linux、noVNC、font、Mr等の既存条件を上書きしません。複数license・例外・リンク境界の確認は残ります。根拠は[Apache条文](https://www.apache.org/licenses/LICENSE-2.0.html)、[MPL条文](https://www.mozilla.org/en-US/MPL/2.0/)。料金・商標・サービス運営とsource licenseは別です。

**確認済みの配布物と資料**

- [既存Draftの候補archive](https://github.com/k999ln/rock/releases/download/untagged-cb5d5ddfcd889ee3ffb3/rockstaros-1.0.0-preview.20260910-macos-arm64.tar.gz): SHA-256 `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2`。旧bytesを保持。
- その中の `legal/buildroot-legal-info.tar.gz`: `7c9cdc0d32faf4006b8693d5d8dc85efd8259ae937c90274888da3f943920a0c`。対応Git source `corresponding-source/rock-source.tar`: `1fac2382110401638dd9ea6d5d5d4d67bf902b5198f5bd38a187c66508719532`。Buildroot原本 `corresponding-source/buildroot-2026.08.tar.xz`: `87aaca4164ea9d5c8085854953018263f7963f07c22e73a2a2185cc98c581c34`。
- [全file inventory](https://github.com/k999ln/rock/releases/download/untagged-cb5d5ddfcd889ee3ffb3/full-distribution-inventory.jsonl.gz): **434,096 record**、SHA-256 `0bcc5633243e4993ba3273d134c10e0ae605afaecf19fc27876d2dd6feea97ff`。[manifest/件数](full-inventory-summary.json)、[検証結果](full-inventory-validation.json)、[NOTICE候補](THIRD_PARTY_NOTICES.review.md)、[source提供文候補](source-availability.review.md)、[font表示候補](FONT_NOTICE.review.txt)。各fileの正確なhashは[添付manifest](https://github.com/k999ln/rock/releases/download/untagged-cb5d5ddfcd889ee3ffb3/supplement-manifest.json)に固定。

**技術例外:** nested archiveのうち16個は不正/非archiveの上流試験fixture、4個の巨大/sparse内部memberは展開上限で停止。実際に配布する元fixture fileは全hash取得済みで、[例外と元file hashの対応](technical-exception-bindings.json)に記録。未読の仮想展開内容を成功扱いにしません。通常source内部、stage0全702entry、rootfs全1,981pathを記録し、未対応だった32fileのgeneratorも特定済みです。

**決定待ちは一括で:** 権利者正式名/許諾権限、A/B/Cと適用範囲、商標・サポート窓口、対応sourceの同時同梱/同経路提供方針、第三者条件の確認担当者を確定してください。決定後に対象SHA・artifact・承認者・日時を記録し、Rock3 packageのlicense metadata、NOTICE、配布ページを**新候補**へ反映します。署名Environment/管理鍵/失効運用、最終artifact受入は別の未完了ゲートです。
