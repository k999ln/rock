# RockstarOS 1.0 Developer Preview — 配布候補の変更点

この文書は Mac arm64 package の共通リリースノートです。具体的な版、40 桁 source/host tools commit、image triple と factory hash、archive hash は隣接する `release-manifest.json` が正本です。資料の存在を受入済みや公開済みとは扱いません。

## 導入で変わること

初回の利用者が既存 Lima VM の識別子や開発担当の絶対 path を用意する必要がなくなります。署名・hash を検証した配布物から専用 VM を作り、既存の signed A/B OS と private browser viewer を利用します。保存結果へ戻るための起動・正常終了案内・再開・検証付き backup・別端末名 restore・所有 VM の削除を同じ入口へまとめています。

既存の `launcher.py` v2、`guest.py` device/6、`stage0.py` の image/source/試験認証器 guard と、`backup.py` の停止済み A/B/data 検証を再利用します。安全な起動を妨げるからという理由で guard を外していません。

新しい launcher v3 は表示 port を署名 release manifest と個別の起動 manifest へ固定します。この配布では HTTP `8900` / WebSocket `5910` を使い、既存 v1/v2 の `8899/5909` は保持します。利用中の port を奪ったり、別の空き port へ黙って切り替えたりしません。viewer の CSP と接続先もその指定に一致させます。

## 対応と制限

- 対象 host は macOS 15.7.4 / Apple Silicon / Lima 2.2.0。Debian 13 VM 内の QEMU `virt-10.0` を使います。ほかの host と実機は未受入です。
- OS は Developer Preview、Wallet は合成環境です。実売上、実資金送受金、実 ATM、実ゲームは含みません。
- OS の署名は公開 RFC8032 開発試験鍵です。公開 seed により誰でも署名を作成でき、本番の配布元認証には使えません。
- release manifest は archive と全内容を署名します。bootstrap・manifest pin・鍵 fingerprint を別の信頼できる経路で取得する必要があります。
- 端末は offline device/6。cloud/PC の接続状態や Game/SDK の試験範囲は、その候補の個別受入記録に従います。一般 provider に接続済みとは表示しません。
- backup は暗号化されていません。別端末名 restore は同じ VM 内の直近 backup に限り、外部 game/authority DB や別 host の災害復旧は含みません。
- 削除は所有権が一致する専用 VM とその内部データに限ります。host の package と記録、別先の export backup は保持します。
- 製品の新しい license/再配布条件は策定していません。NOTICE と Buildroot legal-info の確認は公開条件として残します。

## 同一候補の検証

`packaging-result.json` の `PACKAGED_NOT_ACCEPTED` と manifest の `CANDIDATE` は、配布内容の固定・署名・hash 検証結果です。fresh 実 OS 操作、D0〜D6、台帳互換、Game/SDK の合格を意味しません。最終の受入記録は archive を変更せず、その SHA-256 に結び付けて別途保存します。

最終公開前に source と同じ SHA の CI、D0〜D6、Hub 一周、Game/SDK、初回導入→保存→正常終了→再開→別復元先→削除、配布先からの取得一致を照合してください。未実測の操作削減率・外部作者評価・需要を加えません。

## 再現可能な packager

```sh
python3 systems/rock-star-os/os/desktop/package_preview.py \
  --repository . --source "$SOURCE_COMMIT" --images "$IMMUTABLE_IMAGES" \
  --version 1.0.0-preview.1 --output "$NEW_OUTPUT_DIRECTORY" \
  --public-test-signature
```

入力 source は完全な 40 桁 commit に限定します。`git archive` の追跡済み native source と immutable image triple を使い、cache・個人 VM・秘密値を採取しません。入力の signed stage0 factory が rootfs を指すことを確認します。tar の順序・uid/gid・mode・mtime と gzip timestamp を固定しています。同じ入力では同じ archive/hash を作ります。

既存の非公開 Ed25519 release key を使用する場合は `--public-test-signature` の代わりに `--signing-key <管理済みPEM>` を使います。新しい OS 鍵の生成・本番 trust の決定を行う機能ではありません。第三者の Buildroot legal-info archive は `--legal-info <tar.gz>` で同梱できますが、同梱しただけで製品・再配布条件の承認済みにしません。
