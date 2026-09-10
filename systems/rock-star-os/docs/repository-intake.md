> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# GitHubツール取込ルール

## 原則

検索結果をそのまま「ストア」に掲載したり実行したりしません。発見、審査、build、隔離試験、公開を別工程にし、各工程の証拠を保存します。

## 取込フロー

```text
discover -> quarantine -> license review -> source review -> reproduce build
         -> sandbox test -> capability review -> sign -> private catalog -> publish/revoke
```

### 1. Discover

URL、owner、description、更新日、release、候補licenseをmetadataとして保存します。この段階ではclone後のhook、installer、binaryを実行しません。

### 2. Quarantine

別directoryへ取得し、submodule、Git LFS、release asset、package install scriptを一覧化します。取得対象はtag名だけでなく40桁commit SHAへ固定します。

### 3. License review

LICENSE、NOTICE、依存packageのlicense、model weight、dataset、商標を確認します。license不明、source-availableのみ、依存条件が不一致の場合は取込みを止めます。公開リポジトリというだけでは利用許可とみなしません。

### 4. Source review

最低限、次を調べます。

- install時と実行時のscript。
- shell実行、dynamic code loading、eval、native binary。
- 読み書きするpath。
- 接続するdomain、IP、port。
- credential取得方法。
- telemetryと自動update。
- destructive operationと外部副作用。
- dependency lockと既知脆弱性。

### 5. Reproducible build

networkを制限したclean environmentで、lockfileからbuildします。生成物、source archive、SBOMへSHA-256を付けます。再現できないbinaryはprivate検証から先へ進めません。

### 6. Sandbox test

ダミーaccountと合成データだけを使い、manifestで宣言したresource以外に触れないことを観察します。timeout、容量超過、network拒否、途中kill、再試行を試します。

### 7. Capability review

実際の挙動から最小capabilityを決めます。manifest要求と観測結果が違う場合は拒否します。外部投稿などは `confirmation: required` にします。

### 8. Sign and publish

審査済みmanifestとartifact hashに署名し、最初はprivate catalogへ入れます。publisher鍵とは別のreviewer鍵を使える設計にします。

### 9. Revoke

脆弱性、owner移管、悪意あるupdate、license変更に備え、特定versionまたはpublisher鍵を失効できます。導入済み端末は次回同期まで待たず、local denylistを適用できるようにします。

## ToolManifest

schemaは [`schemas/tool-manifest.schema.json`](../schemas/tool-manifest.schema.json) にあります。最低限必要な内容は次です。

- 不変なtool IDとsemantic version。
- source URLと固定commit。
- license SPDX identifierとNOTICE。
- entrypointとruntime。
- input/output schema。
- capability、network allowlist、resource limit。
- 外部副作用ごとのconfirmation policy。
- artifact SHA-256と署名metadata。

## 禁止事項

- `curl ... | sh`。
- default branchのHEADをproductionで直接実行。
- package managerのinstall scriptを無審査で実行。
- manifestにないdomainへの通信。
- 審査済みsourceと異なるrelease binaryの配布。
- license不明コードの再配布。
- tool自身によるpolicy、manifest、audit logの書換え。

## 更新

version更新は新規取込と同じ審査を通します。差分が小さい場合も、自動承認しません。capability増加、owner変更、署名鍵変更、native binary追加は高risk変更として強調します。
