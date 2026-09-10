# Rock star OS — 導入可能版とCM発表のリリース計画

状態: 実行中。2026-09-09の利用者指示「CM発表に向けてOSを入れられるようにする」を反映する。

## 1. 配布を二段階に分ける

### Developer Preview

現在のLinux / Buildroot / ARM64 QEMU成果を、対応Mac/PCで同じ仮想端末を作成・起動・終了・再開できる導入パッケージにする。個別開発者の既存VM、秘密鍵、固定パスへ依存させない。

合格条件:

- 新しい対応環境で、配布物のhashと署名を検証して導入できる。
- 一つのコマンドまたは案内付き画面で仮想端末を作成し、OSを起動できる。
- Hubの商品処理、合成Wallet、結果保存、通常終了、再起動、backup/restoreを確認できる。
- 導入失敗時に既存VMや利用者データを変更せず終了し、削除手順を提供する。
- D6と同SHAのCIを完走させる。公開開発鍵・合成データ・仮想端末であることを表示する。

### Physical Device Preview

正確なメーカー、型番、地域variant、bootloader、BSP、復旧物を一つに固定してから、その1機種だけへ書き込めるimageと導入手順を作る。QEMU imageを端末へ流用しない。

合格条件:

- bootloader解除・再ロック方針、vendor firmware、driver、partition、rollback indexを固定する。
- 書込み前backup、署名image検証、flash、初回起動、通常更新、失敗rollback、純正状態への復旧を実機で確認する。
- 画面、入力、Wi-Fi、電源、充電、suspend、熱、保存、Hub/Walletを試験する。
- 本番鍵、OTA、脆弱性対応、失効、サポート期間、利用規約を確定する。

対象機種が確定するまで、Physical Device Previewを「インストール可能」と表示しない。

## 2. CMで使える表現

Developer Previewの合格後は「仮想端末向けDeveloper Previewを導入して試せる」と表現できる。実機合格前は「スマートフォンへインストールできる」「BlackBerry対応」「本番利用可能」と表現しない。実資金・送金・ATMは各providerと本番ゲートの合格後だけ案内する。

## 3. 現在の停止条件

- 最新PRのnative source-testsが5分でtimeoutしている。
- D6長時間試験が未合格。
- 配布物に必要な汎用VM作成、image取得、署名検証、削除の導線がない。
- 実機の正確な型番とvariantが未確定。

実装順は、CI timeoutの原因解消、D6完走、Developer Preview packager、fresh環境導入試験、CM用表示の照合、対象実機の固定、Physical Device Previewの順とする。

## 4. Gitへ保存するもの

Gitには実装、設定、再現に必要な小さいfixture、要約された受入結果、復旧手順を保存する。OS image、build cache、重複ログ、全フレーム、再生成可能な大量JSONはrelease artifactまたはGit管理外へ置く。秘密値、端末識別情報、顧客・実取引データは保存しない。
