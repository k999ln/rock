> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# セキュリティモデル

## 保護対象

- 利用者の認証情報、会話、ファイル、連絡先、位置情報。
- PCと端末の制御権。
- 外部サービスで投稿・購入・削除・送金する権限。
- tool publisher、source commit、build artifactの真正性。
- job入力、出力、承認内容、監査receiptの完全性。

## 主な脅威と対策

| 脅威 | 初期対策 | production要件 |
| --- | --- | --- |
| 悪意あるGitHubコード | 自動実行禁止、commit固定、license確認、手動承認 | 再現build、署名、隔離runner、失効 |
| prompt injection | repo文章をdata扱い、capabilityをmanifest外へ拡張しない | policyをモデル外の決定系で強制 |
| USB上のなりすまし | loopback + secret token | 端末鍵、相互認証、暗号化session |
| token漏えい | envのみ、log非表示、constant-time比較 | hardware-backed key、rotation |
| job再送による二重実行 | idempotency keyを一意に保存 | 外部APIにもidempotencyを伝播 |
| 任意ファイル読取り | receiverはjobを保存するだけ | path capability、専用workdir、sandbox |
| 任意外部通信 | runner未接続 | DNS/IP/port allowlist、proxy強制 |
| resource枯渇 | body 1 MiB、一覧100件 | CPU/RAM/disk/time quota、queue quota |
| DB改ざん | file permissionに依存 | 署名receipt、hash chain、backup暗号化 |
| 危険なOS更新 | 自動flashなし | A/B update、署名、rollback、anti-rollback整合 |

## Capability例

- `files.read:selected`
- `files.write:workspace`
- `network:https:api.example.com`
- `clipboard.write`
- `notifications.create`
- `external.post:draft`
- `external.purchase:max-jpy-1000`
- `device.camera:foreground`

曖昧な `network:any`、`files:any`、`shell:root` は通常toolへ与えません。capabilityはインストール時ではなくjobごとに縮小可能にします。

## 必ず直前確認する操作

- 公開投稿、メール・DM送信、応募、納品。
- 商品購入、契約、課金、送金、暗号資産署名。
- 外部データ削除、アカウント設定変更。
- 端末初期化、bootloader unlock、partition書込み。
- 秘密情報の新しい宛先への送信。

確認画面には「何を」「どのアカウントで」「誰へ」「金額」「送る内容のhashまたはpreview」「期限」を表示します。単なる「許可しますか？」にはしません。

## 秘密情報

- repository、manifest、job本文、テストfixtureに実tokenを入れない。
- secretはOS key storeまたはPC keychainの参照名で渡す。
- toolには値そのものではなく、短命でscopeを限定したcredentialを渡す。
- logはauthorization header、cookie、API key、個人情報をredactする。
- crash dumpとartifactの保持期間を設定する。

## Supply chain

詳細は [repository-intake.md](repository-intake.md) を参照します。最終的にはsource identity、再現build、SBOM、artifact署名、timestamp、失効metadataを連鎖させます。署名済みでも安全とは限らないため、署名とpolicy審査を別にします。
