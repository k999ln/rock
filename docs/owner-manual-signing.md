# 所有者本人による手動署名の準備

状態: **PROPOSED_AWAITING_OWNER_MODE_AND_KEY_CUSTODY_APPROVAL**。入口と fixture の準備であり、本番利用・方式の採用・鍵生成・署名・公開を承認した記録ではない。別の署名承認者がいない場合に、本人が一件ずつ明示判断する代替経路を用意する。GitHub の既存独立承認経路と locked control は変更しない。

ユーザー原文 LCH03 は最小権限・保護された環境・明示承認を要求する。別人の必須条件は既存 GitHub 経路に追加した project policy である。本人方式を選択した場合、独立した第二者が誤署名を止める保証と GitHub Environment の承認記録は得られない。approval JSON は本人の申告を対象 bytes と結び付ける記録であり、本人確認や署名端末の安全性をソフトで証明するものではない。

## 本人が決めること

- 本人方式を採用すること、管理責任者の識別名。
- 既存管理鍵の有無、暗号化保管・別の暗号化 backup・解除方法・紛失時の失効手順。秘密値を Codex、Git、引数、shell history、ログへ入れない。この CLI は鍵生成・復号・秘密管理サービスとの接続をしない。
- 配布資産と別の信頼できる公開鍵案内先。公開 DER の fingerprint、現在の trust bundle SHA、検証コード SHA をそこから照合する。

## 実行条件

固定 SHA の `release_signing_owner.py` と `release_signing.py` を、通常の開発 checkout/PR/CI と鍵を共有しない本人専用の隔離環境へ用意する。Python と OpenSSL 3 を鍵の解除前に準備し、候補コードは実行しない。network を切る操作と隔離状態は本人が確認する。CLI はオフライン、暗号化、独立した承認者を実測したと表示しない。

署名鍵は本人が管理先から解除した既存48byte Ed25519 PKCS8 DER fileを外部 path で渡す。恒久保管は暗号化し、解除中の原 file と signer の一時 file は本人専用の暗号化 volume 内に置く。キー親dir0700、file0400/0600、同一UID、regular/nlink1を要求し、symlink/hardlinkを拒否する。ExFATの合成modeを秘密保管の代用にしない。原鍵 file はこの CLI が削除しない。本人が利用後の解除状態を閉じる。一時鍵は既存 signer の normal/error/SIGTERM cleanup に従うが、SIGKILL時の削除やメモリ/SSDの完全消去は保証しない。

候補の全資産を事前に取得する。旧公開試験鍵 envelope を書き換えず、plain unsigned external-key candidate と独立に照合した index を使う。署名/配布内容の変更に伴う新しい版の二回生成・最終受入は元 LCH07 のまま。rc2 を署名しただけでは license が CLEARED にも、全受入が完了にもならない。

## 一回の入口

全引数を本人が確認した絶対 path/固定値で指定する。例の大文字部分は未設定で、実行可能な承認済み値ではない。

```sh
python3 -B scripts/release_signing_owner.py prepare \
  --directory /PRIVATE/CANDIDATE --source SOURCE_SHA --index-sha256 INDEX_SHA \
  --trust-bundle /PRIVATE/TRUST.json --trust-sha256 TRUST_SHA --fingerprint KEY_SHA \
  --owner-id OWNER_ID --approval /PRIVATE/approval.json --output /PRIVATE/new-signing-attempt
```

prepare は全候補の bytes/USTAR・trust を検証し、**PENDING_OWNER_APPROVAL** のローカル JSON だけを排他的に作る。鍵を読み込まず、本人の代わりに承認しない。本人が version/source/archive/index/コード/trust/fingerprint/output を確認し、`decision` を `APPROVED`、`approved_at` を確認時のUTC Unix秒へ変更し、三つの本人申告を実際の確認に応じて true にする。24時間以内の有効期限を維持する。変更後の file SHA256 を本人が別途確認して次の引数に渡す。準備時の hash は承認後の hash と異なる。

```sh
python3 -B scripts/release_signing_owner.py sign \
  --directory /PRIVATE/CANDIDATE --trust-bundle /PRIVATE/TRUST.json \
  --approval /PRIVATE/approval.json --approval-sha256 APPROVED_FILE_SHA \
  --key-file /KEY_PRIVATE/existing-unlocked-key.der --output /PRIVATE/new-signing-attempt
```

承認と全固定入力を検証した後、新 output を排他的に予約してから鍵を読む。鍵を環境から直接受け取る経路は拒否する。既存 signer の内部連携だけで一瞬 process-local environment に渡し、元 signer は OpenSSL child 作成前に pop する。署名や秘密の cleanup を再実装しない。元 signer は全候補を再検証し、派生公開鍵と独立した fingerprint/trust の一致を要求する。

失敗時は新しい attempt dir と得られた原記録を保持し、success receipt を作らない。同じ output に再試行/上書きしない。再試行には別 output の新しい本人判断が必要。出力の `OWNER-SIGNING-RESULT.json` は最後に作り、状態を **SIGNED_NOT_LAUNCH_ACCEPTED_FINAL_VERIFY_REQUIRED** とする。

## 検証・公開は別工程

`new-signing-attempt/signed-metadata/` の四ファイルと元 index が宣言した資産を、新しい verification dir へ byte-identical にコピーする。元 `candidate-index.json` と `candidate-manifest.json` は署名出力に置き換わるため除外する。approval/attempt/result 記録は私有証跡として保持し、既存の厳密な配布 asset roster へ余分に追加しない。

独立したクリーン環境で既存 `release_signing.py verify` を実行し、現在の別経路 trust pin、fingerprint、release-manifest SHA、sourceを検証する。その後、同じ外部鍵と固定manifestで元 `preview.py verify` / 導入・受入を実施する。改ざん、別fingerprint、失効・期限切れの拒否、rotation の実証も必要。これらが完了する前に認証成功や LCH03 PASS を表明しない。正式 license/全受入/一般公開/main merge の未完了は別に保持する。

対象試験は `python3 -B -m unittest discover -s tests -p test_release_signing_owner.py -v`。既存の公開 fixture builder を共用するが元 tests を継承・重複実行しない。成功 mechanics だけテスト process 内で公開試験鍵 denylist を置き換える。実 CLI に回避フラグはない。
