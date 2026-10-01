# Draft配布物を取り違えずに取得する

現在のDraftは `v1.0.0-preview.20260910-rc1`、GitHub release IDは `386171909`。旧9abの内部確認用で、一般公開版・production署名済み版ではない。`CANDIDATE / NOT_CLEARED / PACKAGED_NOT_ACCEPTED` を保持する。

Draft本文の編集後、GitHubが返す `untagged-*` の表示・download URLが変わることを確認した。古い証拠内のURLは記録時点の値として保持し、再取得はtagとnumeric IDを使う。固定済みのhash、asset ID、元bytesをURLへ合わせて書き換えない。

## 現在の表示先・asset ID・hashを読む

認証済みの `gh` で実行する。秘密値を引数や出力に追加しない。

```sh
gh release view v1.0.0-preview.20260910-rc1 --repo k999ln/rock \
  --json url,isDraft,isPrerelease,targetCommitish,assets
gh api repos/k999ln/rock/releases/386171909 \
  --jq '{id,draft,prerelease,target_commitish,assets:[.assets[]|{id,name,size,digest,browser_download_url}]}'
```

`draft: true`、target `9abf78a80d27aa9f847c4051d20e4c552e407276`、期待したasset ID/name/size/hashを照合する。現在のURLを取得できないときに、過去URLの到達や匿名取得成功を推測しない。[GitHub Releasesの入口](https://github.com/k999ln/rock/releases)からも認証後に対象Draftを選べる。

## 新しい空ディレクトリへ取得する

```sh
mkdir rockstaros-9ab-review-download
gh release download v1.0.0-preview.20260910-rc1 --repo k999ln/rock \
  --pattern rockstaros-1.0.0-preview.20260910-macos-arm64.tar.gz \
  --dir rockstaros-9ab-review-download
shasum -a 256 rockstaros-9ab-review-download/rockstaros-1.0.0-preview.20260910-macos-arm64.tar.gz
```

`mkdir` が既存directoryを理由に失敗したら、新しい名前を選ぶ。`--clobber` を使わない。旧archiveは **1,000,928,255 bytes / SHA256 `121389f0df92ae43197ec23d381012dab02aa1d0ff5a3f519803e66e0c7b46a2` / asset ID `554748551`**。

hash一致は同一bytesの確認であり、配布元認証や公開許可ではない。旧 `release-key.der` は公開RFC8032試験鍵で、fingerprint `06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9`。実行前の対応host・manifest・署名・archive検証は[導入ガイド](preview-installation-ja.md)を使用する。管理署名の新候補は[署名運用](release-signing-operations.md)に従い、別の新Draftとして受入する。

同梱の古い `native-final-ci.json` 等は当時のsourceの証拠。新しい証拠はファイル名だけで選ばず、中のsource SHA、run ID、原artifact digestを照合する。97d9529の原証拠assetは `rockstaros-97d9529-final-ci-evidence-20260910.zip`、SHA256 `c89c52befafc4b95068c99fc4475cc7418fb27205b65c69351b6b8cf165c833b`。後続SHAの成功を表すものではない。
