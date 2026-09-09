# Rock OS 稼働・安全確認報告 — 記入用雛形

**未記入の雛形。現在の判定はNOT_RUN。認証書や安全保証書ではない。** 実行担当はコピー先で実測値を記入し、雛形自体をPASSへ書き換えない。

## 1. 対象と許可範囲

- 作成日時 / 実行担当 / レビュー担当: 未記入
- repository / branch / 40桁commit: 未記入
- dirty差分のhash（cleanならclean）/ 移植元manifest hash: 未記入
- buildホストOS・architecture・toolchain・QEMU・依存lock: 未記入
- build方法 / 実行profile / CPU・RAM・disk・network条件: 未記入
- Image / rootfs / stage0 / source / 設定 / 合成fixtureのSHA-256: 未記入
- buildログ・試験ログ・画面記録の場所とhash: 未記入
- 試験データ: 合成のみ。秘密値・実ユーザー・実資金は使用しない。
- 想定利用: QEMUの隔離開発環境。実機・一般公開・本番資金は含まない。
- 信頼モデル: 開発用の公開鍵/秘密鍵fixture。本番の真正性保証ではない。

## 2. 判定一覧

結果はPASS / FAIL / NOT_RUN / SKIP。必須ゲートのNOT_RUN/SKIPは合格を意味しない。各IDを必要な試験caseへ展開する。

| ID | 必須受入 | 期待結果 | 実測・証拠path/hash | 判定 |
| --- | --- | --- | --- | --- |
| D0 | ベース/native統合・source回帰・試験対象固定 | RQ01〜15と既存契約を保持、同じ入力版 | 未記入 | NOT_RUN |
| D1 | 新buildと実QEMU boot | kernel/init・専用UID・ro root/data分離・乱数をguest内で確認 | 未記入 | NOT_RUN |
| D2 | native HubとWalletの利用 | 実商品処理・結果・同意・残高/保留を画面と台帳で照合 | 未記入 | NOT_RUN |
| D3 | 認証/隔離/資源制限・異常復帰 | 許可外操作拒否、二重実行/無断送信なし、失敗理由を表示 | 未記入 | NOT_RUN |
| D4 | startup healthとA/B・容量不足 | 不正/無応答版を正常確定せず、検証済みslotへ回復 | 未記入 | NOT_RUN |
| D5 | 正常終了・再起動・backup/restore | init停止/unmount、永続データ保持、別の復元先で照合 | 未記入 | NOT_RUN |
| D6 | 繰返し/継続稼働・引継ぎ | 事前に定めた回数/時間/資源基準を満たし、手順が再実行可能 | 未記入 | NOT_RUN |
| GX1 | Wallet→模擬ゲーム | 専用quote/承認/予約/付与/両台帳照合、重複0 | 未記入 | NOT_RUN |
| GX2 | 模擬ゲーム→Wallet（条件付き） | 方向許可、ゲーム側確定消費とWallet側原資確認後に一度だけ記帳 | 未記入 | NOT_RUN |
| GX3 | 通信断/競合/解除/再照合 | 不明は保留、ATM/月額と競合しても二重使用0 | 未記入 | NOT_RUN |
| DX | 作者向けAPI/SDK・sandbox・導入 | fresh環境導入、2game分離、鍵失効、測定/改善 | 未記入 | NOT_RUN |
| AF | ATM自社手数料0 | quote/receipt/台帳の自社徴収0、外部実費は別明示 | 未記入 | NOT_RUN |
| H | 指定実機のboot・入力・通信・電源・復旧 | 機種/variantごとの実測 | 未記入 | NOT_RUN |
| S | 実ゲーム/金融provider sandbox | 提供者の正規APIと履歴を照合 | 未記入 | NOT_RUN |
| P | 実資金・本番提供 | 契約・鍵・保護・運用・提供承認と対象取引を検証 | 未記入 | NOT_RUN |

GX/H/S/PはD0〜D6の代替ではない。ゲーム実装を含まないOS候補はGX未完のままOS開発雛形の限定判定を出せるが、ゲーム交換利用可とは表示しない。

## 3. 試験caseの詳細（caseごとに複製）

- test_id / 対応RQ・問題ID:
- 前提・環境・source/image/profile hash:
- 合成入力・手順・許可された失敗注入:
- 期待値（実行前に固定）:
- 実測値・副作用回数・終了値:
- 判定・失敗/skip理由:
- rawログと画面・台帳検証のpath/hash:
- 再試験対象commit・結果:

OS正常終了は電源要求の受付やQEMU process消滅だけで判断せず、initのサービス停止・unmount・guest power eventを確認する。失敗注入の強制断は使い捨て対象だけに限定し、通常終了成功へ混ぜない。

## 4. backup / restoreの対象表

| 対象 | 正本と保存先 | 含む/除外 | 静止/整合方法 | 新規復元先での確認 |
| --- | --- | --- | --- | --- |
| OS A/B/data | 未記入 | 未記入 | 未記入 | NOT_RUN |
| Wallet/backend・runner journal | 未記入 | 未記入 | 未記入 | NOT_RUN |
| ゲーム交換outbox/receipt・game authority | 未記入 | 未記入 | 未記入 | NOT_RUN |
| 設定/鍵/資格 | 秘密値は記載しない | 未記入 | 暗号化/アクセス権/復旧責任を記載 | NOT_RUN |
| ソース/lock/起動手順 | 未記入 | 未記入 | 未記入 | NOT_RUN |

外部正本の取引はOS backupで巻戻さない。同一authorityの元/復元台帳を同時に支出可能にしない。単一writer・切替の排他と正本照合が確認されるまで支出を無効にし、未照合の取引を再実行しない。OSだけのbackupを「全保存」と表示しない。

## 5. 残課題と判定

| 問題ID | 影響/重大度 | 再現条件 | 修正/緩和・責任者 | 次の試験・必要条件 |
| --- | --- | --- | --- | --- |
| 未記入 | 未評価 | 未記入 | 未記入 | 未記入 |

- OS開発雛形の判定: **NOT_RUN**
- ゲーム連携の判定: **NOT_RUN**
- 実機/実資金/本番の判定: **NOT_RUN**
- 許可された利用範囲・禁止事項: 未記入
- 次の起動/停止/復旧/開発の手順・正確な再開branch: 未記入

PASS後の表現例: 「commit〈SHA〉/image〈hash〉を、〈環境〉・合成データで試験し、D0〜D6の記載条件に合格したQEMU開発用OS雛形です。実機・実資金・本番安全性は未検証です」。条件を省いた「安全なOS」「全機能完成」と表示しない。

機械可読の同等reportも保存する。必須項目はreport schema版、source/image/profile hash、環境、日時、caseごとのexpected/actual/status/evidence、既知課題、利用範囲、次の作業。PASS文字列を埋めるだけの生成器を試験にしない。
