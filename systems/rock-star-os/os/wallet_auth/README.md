# Walletの署名承認 — 公開software test authenticator

この実装は、起動するRock star os開発版のWalletに登録時の公開鍵検証と出金ごとの署名検証を追加する。既定のWalletServiceとHTTPS authorityは認証必須で、旧APIの金額だけの出金や `wallet.reserve` を受け付けない。既知の公開RFC8032鍵を使う試験であり、実passkey・生体認証・秘密鍵の保護・本人確認の実証ではない。

## 端末での操作

購入・引渡し記録を引き継ぐ準備登録の後、試験認証器を登録し、Wallet利用規約へ同意する。試験PINは画面に表示する `0000`。月額USD8.88の同意は別操作で、Wallet規約への同意から推定しない。追加端末は同一契約へ別credentialを登録する。契約のWallet規約と月額同意は共有する。

ATM画面では、出金額・手数料・受取現金額・ATM・期限を確認してから試験PINを入力する。戻る操作や誤ったPINだけで残高を予約しない。署名承認が通った時点で予約し、返答が不明なときは同じ要求・承認で照合する。月額契約を解約しても、Wallet残高の出金や既存保留の回復を閉じない。

## OSの境界

| 対象 | OS上の役割 |
|---|---|
| UID1000 | native画面。Wallet操作はPlatformへ、PINを含む認証操作は認証器へ送る |
| UID1002 | Platform。Walletへの呼出しを中継し、認証器への署名要求は許可されない |
| UID1003 | Wallet台帳、端末契約、認証の検証と承認記録 |
| UID1004 | software test authenticator。専用の私有領域にcredential/counter/再送記録を持つ |

認証器は固定Unix socket `/run/rock-authenticator/api.sock` と `SO_PEERCRED` を使用する。PINはWallet、Platform、HTTPS、保存済み要求へ送らない。daemonは非Unix socket/socketpairとio_uringをseccompで拒否し、その制限をOpenSSL子プロセスへ引き継ぐ。Walletデータは別UIDの0700領域。固定の非秘密device設定と、起動時の署名を行わないhealth確認を用いる。

## プロトコル

| 操作 | 必須の操作固有フィールド |
|---|---|
| wallet.auth.begin | key |
| wallet.auth.enroll | key, challenge_id, credential |
| wallet.auth.status | なし |
| wallet.terms | key, accepted, terms_version |
| wallet.atm.quote | key, issue_key, amount_minor, atm_id |
| wallet.atm.issue | key, quote_id, credential |
| wallet.atm.quote.cancel | key, quote_id |

各要求には `v:1` と `op` を付ける。本人・端末・authority・任意の署名対象は要求JSONから選べない。認証器は固定の作成／assertion操作だけを受け付け、汎用の署名、ファイル、URL、shell APIを持たない。

対応範囲はWebAuthn形式の `packed` self-attestation、Ed25519のCOSE鍵と署名、clientDataJSON、authenticatorData。固定RP IDは `wallet.rock-star-os.test`、originは `https://wallet.rock-star-os.test`。試験クライアントが生成する値で、実ブラウザーのorigin検証や認証器の製造元証明を実証したものではない。RP/origin/challenge、UP/UV、credential ID、user handle、backup flags、counterを検証する。未知の形式・拡張・余分なフィールドは対応範囲外として拒否する。

基準は [W3C WebAuthn Level3、2026-08-25 Recommendation](https://www.w3.org/TR/2026/REC-webauthn-3-20260825/)。公開鍵にはcanonical encodingと素数位数の部分群への所属も要求し、[RFC8032](https://www.rfc-editor.org/rfc/rfc8032.html)の公開fixtureを使う。これは受入れ範囲を限定した実装で、全WebAuthn認証器への適合宣言ではない。

## 同時保存と回復

120秒の見積りはauthority/account/device/credential、issue key、USD金額、ATM、手数料と現金額、期限、policyを固定する。今回の公開ATM試験の手数料は0だけに対応する。

署名を検証した後、同じWallet transactionでcounter、見積り消費、承認、予約、ATM credential、immutable receiptを確定する。DBの制約でも、対応する承認のない新しい出金を拒否する。時計の最大値を耐久記録して期限の巻戻りを拒否し、純粋なstatus読取では更新しない。失効後のコード再取得と初回消費は拒否するが、既に消費済みのUNKNOWNはATMの確認結果に従って精算できる。

月額の新規控除はWallet writer内で現在の契約資格を再確認する。CLAIMEDでもまだ控除していない場合は失効後に控除しない。既存の888セントの控除がある場合は、失効後もその同じbillを照合する。Wallet規約と有効credentialを必要とするDB制約も保持する。これらは古い任意のOSバイナリ全体に対する完全なdowngrade防御を意味しない。

## 証拠と残る範囲

暗号・fixtureと状態機械は `tests/`、実WalletServiceはプロジェクト側 `tests/test_os_wallet_auth.py`、実TLSは `tests/test_wallet_auth_backend.py`、課金回復は `tests/test_wallet_auth_billing_recovery.py` で検証する。native/daemonの証拠と実OS起動の結果は `artifacts/os/wallet-auth-continuation/` に保存し、起動前のホスト試験を実OS・実機の代用としない。

本番秘密鍵・hardware attestation・実本人確認provider・実ATM・有料ATM手数料・撮影された有効コードの同一ATMでの盗用防止・実機への対応は未完成。公開鍵とPINは公開試験値であり、本番の資金を扱うための認証ではない。元のOS製品全体のGoalをこの増分だけで完了にしない。
