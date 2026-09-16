# Android実機・マイナンバー連携の最低gate監査

2026-09-13。正本は `data/android-physical-release-audit.json` と `data/personal-number-release-audit.json`。これは法的適合の証明ではなく、証拠なしの対応・公開表示を拒否するための開発gateである。

## Android物理端末版

現在は **1/5必須gate合格、BLOCKED**。2026-09-16の読取り専用ADB確認で、最初の対象を日本向けPixel 10、型番／SKU `GL066`、codename `frankel`へ確定した。現在のGrapheneOSはbootloader locked、alternate verified-boot rootのyellow状態。端末serialは保存していない。物理flash、Android互換、production署名、販売準備の証拠はまだない。

1. 実端末からメーカー、製品名、型番、SKU、地域、codename、OEM unlock可否、bootloader状態を読み取る。
2. 同一SKUのBSP、vendor driver、boot chain、partition/AVB、factory recoveryをhash付きで固定し、flashと純正復旧を実測する。
3. 最終候補のAndroid版と同じ物理端末・build fingerprintで、対応CDD、CTS、適用対象のCTS Verifierを完走する。CTSだけでCDDの全ハード要件を証明したとは扱わない。
4. production鍵、AVB/OTA、rollback index、rotation、失効、復旧を同じ候補で実証する。
5. 配布形態と国を確定し、radio変更の有無を含め、無線・通信端末・表示・消費者向け条件を製品単位で専門家確認する。

Android公式は、Android互換端末にはCDDへの準拠とCTS合格の両方が必要で、Android版ごとにCDD/CTSが異なるとしている。GMSはAOSPに含まれずGoogleとの別ライセンスであるため、既定のDeveloper PreviewはGMSなしとし、将来のGMS同梱をAndroid互換の自動結果にしない。

機械監査は各gateの説明だけでなく、役割別の別ファイルと実byteから再計算したSHA-256を要求する。端末inventoryとbootloader観測、4種のBSP/boot/recovery資料、CDD/CTS/CTS Verifierの4資料、production署名の4資料、地域・radio・販売形態の4資料を混同できない。BSP・CDD/CTS・署名・地域gateは型番/SKUより先に、CDD/CTSと署名はBSP/boot/recoveryより先に合格へ変更できない。BSP資料は全て同じSKUへ結合する。

- [Android Compatibility overview](https://source.android.com/docs/compatibility/overview)
- [Android Compatibility Definition Document](https://source.android.com/docs/compatibility/cdd)
- [Google Mobile Services](https://www.android.com/gms/)
- [Verified Boot device state](https://source.android.com/docs/security/features/verifiedboot/device-state)
- [電波法（e-Gov）](https://laws.e-gov.go.jp/law/325AC0000000131)

## マイナンバー連携

現在は **1/7必須gate合格、BLOCKED**。合格しているのは「番号・カード画像を取得せず、通常profileへ保存しない」無効化境界だけである。Apple IDやiCloudのような便利なprofile同期の項目としてマイナンバーを保存しない。

有効化には、番号法上の具体的事務と必要性、取扱主体・担当者・委託先、取得から削除までのdata flow、組織的・人的・物理的・技術的安全管理、漏えい対応・委託先監督、最後の環境指定付き承認を別々に要求する。本人確認にマイナンバーカード由来の仕組みを使う可能性と、個人番号そのもの・カード画像を保存することも同一扱いにしない。

個人情報保護委員会の事業者向けガイドラインは、利用できる事務、ファイル作成、収集・保管・提供を制限し、取扱事務・情報範囲・担当者の明確化と安全管理措置を求めている。現在の設計はこれらを確定できていないため、機能を有効化しない。

将来の合格記録は、目的/必要性4役割、主体/provider4役割、data flow/保存/削除5役割、安全管理6役割、事故/委託先4役割、独立確認/所有者有効化2役割を別ファイルのSHA-256へ固定する。目的・主体より前にdata flow、安全管理、事故対応を合格にできず、事故対応は安全管理より後にする。有効化時も対象環境、開始日、責任者、独立確認者が必要で、個人番号を通常profile項目へ混ぜることは拒否する。

- [特定個人情報ガイドライン（事業者編）](https://www.ppc.go.jp/legal/policy/my_number_guideline_jigyosha/)
- [ガイドライン資料集](https://www.ppc.go.jp/legal/policy/document/)
- [事業者向けQ&A](https://www.ppc.go.jp/legal/policy/faq/)

## 合格表示の禁止

- QEMUまたはCuttlefishの起動を、物理端末のBSP・radio・CTS・復旧の代わりにしない。
- 既存端末の技適等を、OS変更後のradio影響や販売形態の自動承認にしない。
- AOSPをbuildできたことを、Android互換またはGMSライセンス済みと表示しない。
- マイナンバー以外の本人profileが動くことを、特定個人情報の取扱い審査済みと表示しない。
- auditの状態、公開台帳、ローカル証拠が一致しない限り `ready` にしない。
