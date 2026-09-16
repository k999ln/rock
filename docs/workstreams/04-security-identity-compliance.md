# Security / Identity / Compliance

## 目的

認証、権限、秘密情報、署名、更新、依存ライセンス、個人情報、規制対象機能をfail-closedにし、コード完成と公開・本番許可を分離する。

## 現在地

- Web security header、PWA更新確認、暗号化された端末設定backup、sanitized診断を実装済み。
- QEMU候補のSBOM、Android物理端末gate、マイナンバーgate、署名拒否境界を機械可読化済み。
- マイナンバーは1/7 gateで無効。番号・カード画像を取得しない。
- QEMUと物理端末のproduction鍵、製品license、地域別販売条件は未完了。
- 運営1名で開始できる緊急保護・限定保守accessのpolicy、利用者OSと分離したOperator Dock、Access JWT検証、専用D1命令キュー、追記監査はsource実装済み。専用配備、Android service、production credential、実機受入、侵入試験は未完了。
- npm依存には追加review対象があり、inventory完成を法的clearanceと扱わない。

主なtask: `SYS01`〜`SYS13`, `LCH02`, `LCH03`, `OS05`。

## 次に進める順番

1. 自作部分の製品license、適用範囲、第三者NOTICE/source提供条件を確定する。
2. owner管理下でproduction key ceremony、backup、rotation、revocationを実施する。
3. 同じ候補を正式署名後に再受入し、開発鍵の証拠を転用しない。
4. 外部OAuth／Providerごとにscope、audience、失効、監査証跡を受け入れる。
5. マイナンバーや地域規制は専門家確認と本人有効化までdisabledを維持する。
6. `SYS13`で端末側の緊急access serviceを実装し、管理側侵害を含む閉鎖試験とPixel 10実機演習を行う。

## 完了条件

- 権限境界をコード、UI、監査証拠の三つで一致させる。
- 秘密値をGit、診断、成果物、クライアントログへ含めない。
- 開発鍵、合成データ、fixtureの成功を本番認証へ昇格させない。
- license、署名、個人情報、地域規制を別gateで判定する。

## 関連資料

- [Release minimum gates](../release-minimum-gates.md)
- [Signing operations](../release-signing-operations.md)
- [Owner manual signing](../owner-manual-signing.md)
- [Android and personal number gates](../android-and-personal-number-gates-20260913.md)
- [CSV security](../csv-business-security.ja.md)
- [Release readiness](../../data/release-readiness.json)
- [緊急アクセスとインシデント対応](../security-incident-response.md)
- [緊急アクセスpolicy](../../data/device-emergency-access-policy.json)

## 検証

- `npm run release:check`
- `npm run release:signing:check`
- `npm run web:security:check`
