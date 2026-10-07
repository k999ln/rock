# Security / Identity / Compliance

## 目的

認証、権限、秘密情報、署名、更新、依存ライセンス、個人情報、規制対象機能をfail-closedにし、コード完成と公開・本番許可を分離する。

## 現在地

- Web security header、PWA更新確認、暗号化された端末設定backup、sanitized診断を実装済み。
- QEMU候補のSBOM、Android物理端末gate、マイナンバーgate、署名拒否境界を機械可読化済み。
- マイナンバーは1/7 gateで無効。番号・カード画像を取得しない。
- QEMUと物理端末のproduction鍵、製品license、地域別販売条件は未完了。
- 運営1名で開始できる緊急保護policy、利用者OSと分離したOperator Dock、Access JWT／WebAuthn検証、専用D1命令キュー、署名付き端末channel、launcher非表示のAndroid Agent、端末側独立検証、Keystore identity、HMAC追記監査はsource実装済み。Android 15 emulator 6/6と試験署名Pixel 10の5/5は合格した。本番公開trust入力をrepo外から検査してproduct RROへstageする入口、StrongBox必須、factory reset無効、challengeごとの別端末鍵も固定済み。専用配備、production credential、実StrongBox attestation／Device Owner登録、remote Provider session失効、管理側侵害試験は未完了。
- npm依存には追加review対象があり、inventory完成を法的clearanceと扱わない。
- `SYS15`でRockstarOS本体に常駐するSpider Guardへ着手。Platform UID 1002の固定範囲監視、Platform MCP／RunnerControl送信前の拒否、認証付き状態とnative画面、同梱・boot監督をROCKが担当する。Web／Connector送信前検査は補助である。同一image boot、Pixel実機、24時間運転は未受入で、root権限やOS全通信の保護は追加しない。[範囲と受入](../spider-guard.md)を正本とする。
- `SYS15`のnative表示は追加映像を参照し、実findingへの移動・囲み、新しい実拒否counterへの反応、非稼働時の停止をLinux描画fixtureで検証した。続く利用者指定のSecurity Agent役割（監視・検査・拒否・報告）と最新の実拒否metadataは接続済みで、Linux backend 26件、native renderer、PIN readiness 11／profile 1と描画fixtureの追加検証が成功した。表示先は現在のsecurity panelを維持する。初期実装の保存版`a7cfca3`の129 Python／49 Node、アニメーション改訂、新しいAgent役割の証拠を分け、前の合格を後の変更へ転用しない。

- `SYS15`へ利用者指定の貼り付けコード検査を追加した。offline単一HTMLとowner限定`security.inspectCode`で明示入力を静的検査し、編集後の実候補を可視化する。コード実行・外部送信・永続保存を追加せず、既存常駐guardの範囲を維持する。生成HTML／Node 14件とloopback HTTPのブラウザ動作、native host Python 23件が成功。今回native Linuxの検証は未実行で、既存guardのLinux結果を流用しない。

- `SYS15`へGitHub repository検査を追加する。秘密検査・JS/TS/Python CodeQLを既存verifyから独立させ、実際のcheck／Security結果へ接続する。Dependabot通知・修正PRを有効化済み。main統合・required check・定時稼働は未実施として分ける。[GitHub連携](../spider-guard.md#github上でrockを検査する)と[security policy](../../SECURITY.md)を参照。

主なtask: `SYS01`〜`SYS13`, `SYS15`, `LCH02`, `LCH03`, `OS05`。

## 次に進める順番

1. 自作部分の製品license、適用範囲、第三者NOTICE/source提供条件を確定する。
2. owner管理下でproduction key ceremony、backup、rotation、revocationを実施する。
3. 同じ候補を正式署名後に再受入し、開発鍵の証拠を転用しない。
4. 外部OAuth／Providerごとにscope、audience、失効、監査証跡を受け入れる。
5. マイナンバーや地域規制は専門家確認と本人有効化までdisabledを維持する。
6. `SYS13`で本番WebAuthn公開値を外部入力としてstageし、StrongBox attestationとDevice Ownerを登録して、管理側侵害を含む閉鎖試験とproduction条件のPixel 10実機演習を行う。

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
- [Spider Guardの秘密・個人情報検出と送信前保護](../spider-guard.md)

## 検証

- `npm run release:check`
- `npm run release:signing:check`
- `npm run web:security:check`

## Native診断の出力境界

O1 / SYS02の診断共有の安全条件として、entitlement observerの登録状態・稼働状態・金額を既存のscalar契約に制限する。想定外のサービス応答は報告前に拒否し、raw例外を表示しない。[設計](../rockstaros-complete-design.md#spider-simulation-observerの診断出力)／[証拠](../evidence/spider-observer-output-schema.json)。本番漏洩の観測・料金保留解除・実guest受入ではない。

## 全CI合格への残存修正（SYS15 / G04）

履歴secret検査の2942出現・161種類を元のfield・公開fixture生成元へ照合する。公開値の分類は値と履歴pathの完全一致に限定し、差替え・別path・新規provider credentialを実Gitleaksで拒否する。全履歴、既定rule、pinned control、metadata-only出力は維持する。根拠は[公開値の個別記録](../../.github/spider/public-value-provenance.json)。

未修正版bracesと、4.3.0でもmax-stale漏洩が再現したhttp-cache-semanticsは、bracesのMIT／HTTP cacheのBSD-2-Clause原本・出所・差分hashを保持するrepository内の明示forkで修正する。全依存先をoverrideし、元code 4 fail / 修正版8 passの回帰試験を保持する。上流修正版への復帰は同じ攻撃再現・互換性・全体verifyの合格後。詳細は[検証記録](../evidence/security-gate-completion.json)、[braces保守](../../vendor/braces/ROCKSTAR-PATCH.md)、[HTTP cache保守](../../sites/avocado-mini/vendor/http-cache-semantics/ROCKSTAR-PATCH.md)。実機・鍵・公開gateは変更しない。

受入更新: PR #83、`4e702fc2`の全8 CI成功後、`cb5955a2`でmain統合。GitHub verify Node 1362 pass / 0 fail / 1環境条件skip、依存監査0件、#17/#18は自動fixed。上流コードの追加regex DoSも線形処理へ修正。公開・物理OS受入とは分離する。

## Origin error時のcache再利用（SYS15）

PR83統合後のmain e12d880cで、stale-if-error経路が通常判定の再利用禁止を迂回する残存不具合を再現した。response禁止条件を共通化し、error fallbackでもURI/host/method/Varyとrequest no-cacheを確認する。13試験は修正前3 pass /10 fail、修正後13 pass /0 fail /0 skip。304・公開cache・非共有cache・HEADの正例を維持。GitHub同一SHA CIとmain統合は別に確認する。[再現と修正の証拠](../evidence/spider-cache-error-revalidation.json)。既存SYS15のprimary squad H1・進行中statusと各製品の受入段階を変更しない。

2026-10-07 cycle79: main `0455499d` の文書整理を既存PR #84へ同期し、project.mdの復元履歴と従来のcache修正記録を両方保持して競合解消。cache source・13回帰試験・workflow・元licenseは変更しない。同一SHAの再検査結果は上記証拠のdocumentationMainRefreshとPR欄へ記録する。
