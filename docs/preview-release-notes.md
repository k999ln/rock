# RockstarOS 1.0 Developer Preview — 配布候補の変更点

この文書は Mac arm64 package の共通リリースノートです。具体的な版、40 桁 source/host tools commit、image triple と factory hash、boot profile と Game authority/config hash、archive hash は隣接する `release-manifest.json` が正本です。資料の存在を受入済みや公開済みとは扱いません。

## 2026-09-10 公開準備の補足

Webの入口はHub、手順型仕事/実行履歴/手入力Wallet/接続設定へ更新し、旧SitesのPWA/API/DB履歴を統合した。これは旧9ab native packageの再受入ではない。[最新の公開条件](launch-readiness-20260910.md)と[許諾判断資料](evidence/launch/legal/decision-one-page.md)を参照。元packageの同build legal-info/対応sourceを実物照合し、別assetの全inventoryを既存Draftへ追記した。製品LICENSE未決定・本番署名なし・元Sites未接続・CM選択未確定のため、旧candidateとDraft状態を保持する。

## 導入で変わること

初回の利用者が既存 Lima VM の識別子や開発担当の絶対 path を用意する必要がなくなります。署名・hash を検証した配布物から専用 VM を作り、既存の signed A/B OS と private browser viewer を利用します。保存結果へ戻るための起動・正常終了案内・再開・検証付き backup・別端末名 restore・所有 VM の削除を同じ入口へまとめています。

既存の `launcher.py`、`guest.py` device/6・7、`stage0.py` の image/source/試験認証器 guard と、`backup.py` の停止済み A/B/data 検証を再利用します。安全な起動を妨げるからという理由で guard を外していません。

新しい launcher v3 は表示 port を署名 release manifest と個別の起動 manifest へ固定します。この配布では HTTP `8900` / WebSocket `5910` を使い、既存 v1/v2 の `8899/5909` は保持します。利用中の port を奪ったり、別の空き port へ黙って切り替えたりしません。viewer の CSP と接続先もその指定に一致させます。

## 対応と制限

- 対象 host は macOS 15.7.4 / Apple Silicon / Lima 2.2.0。Debian 13 VM 内の QEMU `virt-10.0` を使います。ほかの host と実機は未受入です。
- OS は Developer Preview、Wallet は合成環境です。実売上、実資金送受金、実 ATM、実ゲームは含みません。
- OS の署名は公開 RFC8032 開発試験鍵です。公開 seed により誰でも署名を作成でき、本番の配布元認証には使えません。
- release manifest は archive と全内容を署名します。bootstrap・manifest pin・鍵 fingerprint を別の信頼できる経路で取得する必要があります。
- `local-development` は offline device/6、`development-game-authority` は device/7 と同じ専用VM内の独立した公開試験台帳を使います。Game構成は個人の既存台帳を複製せず、空・未登録・未同意の状態から準備します。一般providerには接続しません。
- Gameサーバーが利用できない場合もHubの起動は継続できます。別のauthorityへ置き換えたり、接続同意・登録・残高を自動生成したりしません。
- 合成 Game の接続は試験設定で1時間有効です。期限切れ・失効後の新しい接続はこの版では未対応で、画面とSDKに理由を表示します。元の key による同一要求の再送・照合と、完了済み購入の履歴は保持します。期限延長や player/owner の予約再割当は行いません。
- native入力はASCIIのUS配列のみです。日本語IMEとclipboardは未接続で、任意の日本語本文を貼り付ける操作はできません。日本語の引用整理例は「サンプルを入力」ボタンで試せます。この制限下の例を日常業務の入力時間削減とは扱いません。
- backup は暗号化されていません。local 構成の別端末名 restore は同じ VM 内の直近 backup に限ります。Game 構成は OS の A/B/data と独立した Wallet/Game/C 台帳を一組にして保存し、同じ所有 VM の現時点コピーだけを復元します。保存後にどちらかが変化していれば過去へ戻しません。OS のディスク単独復元は拒否します。
- Game 復元は durable intent と全 writer の停止 gate を持ち、同じ backup・intent・新端末名の中断だけを再開できます。両構成要素の完了 receipt と全 post-state を再検証してから起動を許可します。累積した元端末名は復元後も再起動を拒否します。別 host の災害復旧や export の再投入は未対応で、VM 削除後の照合基盤再構成は合格扱いにしません。
- 削除は所有権が一致する専用 VM とその内部データに限ります。host の package と記録、別先の export backup は保持します。
- 製品の新しい license/再配布条件は策定していません。NOTICE と Buildroot legal-info の確認は公開条件として残します。

## 同一候補の検証

`packaging-result.json` の `PACKAGED_NOT_ACCEPTED` と manifest の `CANDIDATE` は、配布内容の固定・署名・hash 検証結果です。fresh 実 OS 操作、D0〜D6、台帳互換、Game/SDK の合格を意味しません。最終の受入記録は archive を変更せず、その SHA-256 に結び付けて別途保存します。

最終公開前に source と同じ SHA の CI、D0〜D6、Hub 一周、Game/SDK、初回導入→保存→正常終了→再開→別復元先→削除、配布先からの取得一致を照合してください。未実測の操作削減率・外部作者評価・需要を加えません。

## 再現可能な packager

```sh
python3 systems/rock-star-os/os/desktop/package_preview.py \
  --repository . --source "$SOURCE_COMMIT" --images "$IMMUTABLE_IMAGES" \
  --boot-profile local-development \
  --version 1.0.0-preview.1 --output "$NEW_OUTPUT_DIRECTORY" \
  --public-test-signature
```

入力 source は完全な 40 桁 commit に限定します。`git archive` の追跡済み native source と immutable image triple を使い、cache・個人 VM・秘密値を採取しません。入力の signed stage0 factory が rootfs を指すことを確認します。tar の順序・uid/gid・mode・mtime と gzip timestamp を固定し、検証時のPython cacheは収録しません。最終候補では同じ入力から二回生成したarchive/manifestの完全一致を実測します。

Game候補は `--boot-profile development-game-authority` を明示します。image directoryには署名済み派生triple、`profile.json`、元freezeの正確なbytesを持つ `base-freeze-manifest.json`、現在の `freeze-manifest.json` が必要です。現在のfreezeは `profile_derivation.profile_sha256` と `base_build.manifest_sha256` / `base_build.manifest` で派生前後を結びます。公開sandbox設定は同じsourceの固定fixtureと一致させ、新規VMごとにimageを書き換えません。

既存の非公開 Ed25519 release key を使用する場合は `--public-test-signature` の代わりに `--signing-key <管理済みPEM>` を使います。新しい OS 鍵の生成・本番 trust の決定を行う機能ではありません。第三者の Buildroot legal-info archive は `--legal-info <tar.gz>` で同梱できますが、同梱しただけで製品・再配布条件の承認済みにしません。
